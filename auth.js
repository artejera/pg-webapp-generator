'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const USERS_FILE = process.env.AUTH_USERS_FILE ||
  path.join(__dirname, 'data', 'users.json');

const HASH_ALGO = 'sha256';
const ITERATIONS = 120000;
const KEYLEN = 32;
const SESSION_BYTES = 24;
const TTL_MS = Number(process.env.AUTH_TTL_MS || 1000 * 60 * 60 * 12);

function ensureFile() {
  const dir = path.dirname(USERS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(USERS_FILE)) {
    const salt = crypto.randomBytes(16).toString('hex');
    const defaultPass = process.env.AUTH_ADMIN_PASSWORD || 'admin123';
    const hashed = crypto.pbkdf2Sync(defaultPass, salt, ITERATIONS, KEYLEN, HASH_ALGO).toString('hex');
    const data = {
      users: [{
        username: 'admin',
        role: 'admin',
        createdAt: new Date().toISOString(),
        salt,
        hash: hashed,
      }],
    };
    fs.writeFileSync(USERS_FILE, JSON.stringify(data, null, 2), 'utf8');
  }
}

function load() {
  ensureFile();
  try {
    const raw = fs.readFileSync(USERS_FILE, 'utf8');
    const data = JSON.parse(raw);
    if (!data || !Array.isArray(data.users)) throw new Error('malformed users file');
    return data;
  } catch (e) {
    throw new Error('Unable to load auth users file: ' + (e && e.message ? e.message : String(e)));
  }
}

function save(data) {
  ensureFile();
  fs.writeFileSync(USERS_FILE, JSON.stringify(data, null, 2), 'utf8');
}

function verifyPassword(user, password) {
  const incoming = crypto.pbkdf2Sync(String(password || ''), user.salt, ITERATIONS, KEYLEN, HASH_ALGO).toString('hex');
  return constantTimeEqual(incoming, user.hash || '');
}

function constantTimeEqual(a, b) {
  const ba = Buffer.from(String(a || ''), 'utf8');
  const bb = Buffer.from(String(b || ''), 'utf8');
  const len = Math.max(ba.length, bb.length);
  const pa = Buffer.alloc(len, 0); pa.set(ba, 0);
  const pb = Buffer.alloc(len, 0); pb.set(bb, 0);
  return crypto.timingSafeEqual(pa, pb) && ba.length === bb.length;
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(String(password || ''), salt, ITERATIONS, KEYLEN, HASH_ALGO).toString('hex');
  return { salt, hash };
}

const sessions = new Map();

function cleanupSessions() {
  const now = Date.now();
  for (const [sid, s] of sessions.entries()) {
    if (s.expiresAt < now) sessions.delete(sid);
  }
}

function issueSessionId() {
  return crypto.randomBytes(SESSION_BYTES).toString('hex');
}

function extractSessionId(req) {
  const auth = (req && req.headers && req.headers.authorization) || '';
  const m = /^Bearer\s+([A-Za-z0-9]+)$/i.exec(auth);
  if (m) return m[1];
  if (req && req.headers) {
    const x = req.headers['x-auth-session-id'];
    if (x && typeof x === 'string' && /^[A-Za-z0-9]+$/.test(x)) return x;
  }
  return null;
}

function authenticate(username, password) {
  const data = load();
  const u = data.users.find(x => String(x.username || '').toLowerCase() === String(username || '').toLowerCase());
  if (!u) return null;
  if (!verifyPassword(u, password)) return null;
  cleanupSessions();
  const sid = issueSessionId();
  sessions.set(sid, {
    sessionId: sid,
    username: u.username,
    role: u.role,
    issuedAt: Date.now(),
    expiresAt: Date.now() + TTL_MS,
  });
  return { sessionId: sid, user: maskUser(u) };
}

function maskUser(u) {
  return {
    username: u.username,
    role: u.role,
    createdAt: u.createdAt || null,
  };
}

function readSession(req) {
  const sid = extractSessionId(req);
  if (!sid) return null;
  cleanupSessions();
  const s = sessions.get(sid);
  if (!s) return null;
  if (s.expiresAt < Date.now()) { sessions.delete(sid); return null; }
  s.expiresAt = Math.min(Date.now() + TTL_MS, s.expiresAt + TTL_MS / 2);
  return s;
}

function requireSession(req) {
  const s = readSession(req);
  if (!s) {
    const e = new Error('Authentication required: please sign in.');
    e.status = 401;
    e.code = 'AUTH_REQUIRED';
    e.hints = [
      'Open the sign-in screen and provide your username and password.',
      'Your session may have expired — sign in again.',
    ];
    throw e;
  }
  return s;
}

function endSession(req) {
  const sid = extractSessionId(req);
  if (sid) sessions.delete(sid);
  return { ok: true };
}

function listUsers(session) {
  if (!session || session.role !== 'admin') {
    const e = new Error('Admin access required to list users.');
    e.status = 403; e.code = 'AUTH_FORBIDDEN';
    throw e;
  }
  return load().users.map(maskUser);
}

function createUser(session, params) {
  if (!session || session.role !== 'admin') {
    const e = new Error('Admin access required to create users.');
    e.status = 403; e.code = 'AUTH_FORBIDDEN'; throw e;
  }
  const username = String(params && params.username || '').trim();
  const password = String(params && params.password || '');
  const role = String(params && params.role || 'normal');
  if (!username) throw validation('Username is required.');
  if (!/^[A-Za-z0-9_.@\-]{2,64}$/.test(username)) throw validation('Username must be 2-64 chars: letters, digits, _ . @ -.');
  if (role !== 'admin' && role !== 'normal') throw validation('Role must be "admin" or "normal".');
  if (!password || password.length < 6) throw validation('Password must be at least 6 characters.');
  const data = load();
  if (data.users.some(u => String(u.username).toLowerCase() === username.toLowerCase())) throw validation('Username already exists.');
  const h = hashPassword(password);
  const u = {
    username,
    role,
    createdAt: new Date().toISOString(),
    salt: h.salt,
    hash: h.hash,
  };
  data.users.push(u);
  save(data);
  return maskUser(u);
}

function updateUser(session, targetUsername, params) {
  params = params || {};
  const data = load();
  const idx = data.users.findIndex(u => String(u.username).toLowerCase() === String(targetUsername || '').toLowerCase());
  if (idx < 0) {
    const e = new Error('User not found.'); e.status = 404; e.code = 'NOT_FOUND'; throw e;
  }
  const target = data.users[idx];
  const isSelf = session && String(session.username).toLowerCase() === String(targetUsername || '').toLowerCase();
  const isAdmin = session && session.role === 'admin';
  if (!isAdmin && !isSelf) {
    const e = new Error('Forbidden: you may only edit your own password.');
    e.status = 403; e.code = 'AUTH_FORBIDDEN'; throw e;
  }
  if (!isAdmin) {
    const forbidden = ['role', 'username'];
    for (const f of forbidden) {
      if (params[f] !== undefined) {
        const e = new Error('Forbidden: only administrators may change the ' + f + ' field.');
        e.status = 403; e.code = 'AUTH_FORBIDDEN';
        e.hints = ['As a normal user you may only change your own password.'];
        throw e;
      }
    }
  }
  if (params.role !== undefined) {
    if (!isAdmin) {
      const e = new Error('Forbidden: only an admin can change the role field.');
      e.status = 403; e.code = 'AUTH_FORBIDDEN'; throw e;
    }
    if (params.role !== 'admin' && params.role !== 'normal') throw validation('Role must be "admin" or "normal".');
    target.role = params.role;
  }
  if (params.username !== undefined) {
    if (!isAdmin) {
      const e = new Error('Forbidden: only an admin can change the username.');
      e.status = 403; e.code = 'AUTH_FORBIDDEN'; throw e;
    }
    const newName = String(params.username).trim();
    if (!/^[A-Za-z0-9_.@\-]{2,64}$/.test(newName)) throw validation('Username must be 2-64 chars: letters, digits, _ . @ -.');
    if (data.users.some((u, i) => i !== idx && String(u.username).toLowerCase() === newName.toLowerCase())) throw validation('Username already exists.');
    target.username = newName;
  }
  if (params.password !== undefined) {
    const pw = String(params.password || '');
    if (pw.length < 6) throw validation('Password must be at least 6 characters.');
    if (!isAdmin && isSelf) {
      const cur = params.currentPassword === undefined ? '' : String(params.currentPassword);
      if (!verifyPassword(target, cur)) {
        const e = new Error('Current password is incorrect.');
        e.status = 400; e.code = 'AUTH_BAD_CURRENT_PASSWORD';
        e.hints = ['Provide your current password to change it.'];
        throw e;
      }
    }
    const h = hashPassword(pw);
    target.salt = h.salt;
    target.hash = h.hash;
  }
  save(data);
  return maskUser(target);
}

function deleteUser(session, targetUsername) {
  if (!session || session.role !== 'admin') {
    const e = new Error('Admin access required to delete users.');
    e.status = 403; e.code = 'AUTH_FORBIDDEN'; throw e;
  }
  if (String(targetUsername || '').toLowerCase() === String(session.username || '').toLowerCase())
    throw validation('You cannot delete your own account.');
  const data = load();
  const idx = data.users.findIndex(u => String(u.username).toLowerCase() === String(targetUsername || '').toLowerCase());
  if (idx < 0) {
    const e = new Error('User not found.'); e.status = 404; e.code = 'NOT_FOUND'; throw e;
  }
  const removed = maskUser(data.users[idx]);
  data.users.splice(idx, 1);
  save(data);
  return { deleted: true, user: removed };
}

function validation(message) {
  const e = new Error(message);
  e.status = 400;
  e.code = 'AUTH_VALIDATION';
  return e;
}

function enforceOnUsersTable(session, action, payload, targetKey, targetRow) {
  if (!session || !action) return;
  const onSelf = (row) => String(row && row.username || '').toLowerCase() === String(session.username || '').toLowerCase();
  if (session.role === 'admin') return;
  if (action === 'create') {
    const e = new Error('Forbidden: only admins may create new users.');
    e.status = 403; e.code = 'AUTH_FORBIDDEN';
    throw e;
  }
  if (action === 'delete') {
    if (targetRow && onSelf(targetRow)) return;
    const e = new Error('Forbidden: only admins may delete users (other than yourself).');
    e.status = 403; e.code = 'AUTH_FORBIDDEN'; throw e;
  }
  if (action === 'update') {
    if (!targetRow || !onSelf(targetRow)) {
      const e = new Error('Forbidden: you may only edit your own user record.');
      e.status = 403; e.code = 'AUTH_FORBIDDEN'; throw e;
    }
    const p = payload || {};
    const onlyPassword =
      (Object.keys(p).length === 1 && p.password !== undefined) ||
      (Object.keys(p).length === 2 && p.password !== undefined && p.currentPassword !== undefined);
    if (!onlyPassword) {
      const e = new Error('Forbidden: normal users may only change their own password field.');
      e.status = 403; e.code = 'AUTH_FORBIDDEN';
      e.hints = ['If you want to change username or role, ask an administrator.'];
      throw e;
    }
  }
}

ensureFile();

module.exports = {
  authenticate,
  readSession,
  requireSession,
  endSession,
  listUsers,
  createUser,
  updateUser,
  deleteUser,
  enforceOnUsersTable,
  TTL_MS,
};
