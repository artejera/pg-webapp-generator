(function () {
  'use strict';

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const h = function (tag, attrs) {
    const e = document.createElement(tag);
    if (attrs) {
      for (const k in attrs) {
        if (!Object.prototype.hasOwnProperty.call(attrs, k)) continue;
        if (k === 'class') e.className = attrs[k];
        else if (k === 'html') e.innerHTML = attrs[k];
        else if (k.startsWith('on') && typeof attrs[k] === 'function') e.addEventListener(k.slice(2).toLowerCase(), attrs[k]);
        else if (k === 'text') e.textContent = attrs[k];
        else if (attrs[k] === true) e.setAttribute(k, '');
        else if (attrs[k] === false) {}
        else e.setAttribute(k, attrs[k]);
      }
    }
    for (let i = 2; i < arguments.length; i++) {
      const c = arguments[i];
      if (c == null) continue;
      if (Array.isArray(c)) { c.forEach(cc => { if (cc != null) e.appendChild(typeof cc === 'object' && cc.nodeType ? cc : document.createTextNode(String(cc))); }); }
      else if (typeof c === 'string' || typeof c === 'number') e.appendChild(document.createTextNode(String(c)));
      else if (c instanceof Node) e.appendChild(c);
    }
    return e;
  };
  const esc = (s) => {
    if (s === null || s === undefined) return '';
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  };
  const display = (v, typeClass) => {
    if (v === null || v === undefined) return { null: true, text: 'NULL' };
    const tc = (typeClass || 'text').toLowerCase();
    if (typeof v === 'boolean') return { text: v ? 'true' : 'false', mono: false };
    if (typeof v === 'number') return { text: String(v), mono: true };
    if (typeof v === 'object') {
      if (v instanceof Date) return { text: v.toISOString(), mono: true };
      try { return { text: JSON.stringify(v), mono: true }; } catch (_) {}
    }
    const s = String(v);
    const mono = tc === 'json' || tc === 'uuid' || tc === 'binary';
    if (s.length > 160) return { text: s.slice(0, 160) + '…', title: s, mono };
    return { text: s, mono };
  };

  const state = {
    sessionId: localStorage.getItem('auth.sessionId') || '',
    user: null,
    version: null,
    connectionId: localStorage.getItem('pg.connId') || '',
    connection: null,
    availableSchemas: [],
    schema: null,
    currentView: null,   // null | { kind:'table', name } | { kind:'users' }
    page: 1,
    pageSize: 20,
    totalRows: 0,
  };
  try {
    const c = localStorage.getItem('pg.lastConnection');
    if (c) state._saved = JSON.parse(c);
  } catch (_) { state._saved = null; }

  function commonHeaders() {
    const hdr = { 'Content-Type': 'application/json' };
    if (state.sessionId) hdr['X-Auth-Session-Id'] = state.sessionId;
    if (state.connectionId) hdr['X-PG-Conn-ID'] = state.connectionId;
    return hdr;
  }
  async function api(method, path, body) {
    const opts = { method, headers: commonHeaders() };
    if (body !== undefined) opts.body = JSON.stringify(body);
    let res;
    try {
      res = await fetch(path, opts);
    } catch (err) {
      const e = new Error('Network error: ' + err.message);
      e.code = 'NETWORK';
      e.hints = ['Is the server running? (npm start in project root)'];
      throw e;
    }
    let data = null;
    try { data = await res.json(); } catch (_) { data = { error: 'HTTP ' + res.status }; }
    if (!res.ok) {
      const e = new Error(data && data.error ? data.error : ('HTTP ' + res.status));
      if (data) {
        if (data.code) e.code = data.code;
        if (data.detail) e.detail = data.detail;
        if (data.hint) e.hint = data.hint;
        if (data.column) e.column = data.column;
        if (data.hints) e.hints = data.hints;
      }
      e.status = res.status;
      if (res.status === 401 && /AUTH_/.test(e.code || '')) {
        state.sessionId = '';
        try { localStorage.removeItem('auth.sessionId'); } catch (_) {}
        state.user = null;
      }
      throw e;
    }
    return data;
  }

  // ---------- Login screen ----------
  function renderLogin() {
    const root = $('#app-root');
    if (!root) return;
    root.innerHTML = '';
    const wrap = h('div', { class: 'login-wrap' });
    const card = h('div', { class: 'login-card' });
    wrap.appendChild(card);
    root.appendChild(wrap);

    const alertHost = h('div');
    const brand = h('div', { class: 'brand-row' },
      h('span', { class: 'badge', text: 'Live' }),
      h('span', { style: 'font-weight:700;letter-spacing:-0.01em;', text: 'PostgreSQL Schema Interpreter' })
    );
    const title = h('h1', { class: 'title', text: 'Sign in to continue' });
    const lede = h('p', { class: 'lede', text: 'Username and password authenticate you to the interpreter app itself. You will still provide Postgres connection credentials next.' });
    card.appendChild(alertHost);
    card.appendChild(brand);
    card.appendChild(title);
    card.appendChild(lede);

    const userG = h('div', { class: 'form-group' });
    userG.appendChild(h('label', { for: 'li-user', text: 'Username' }));
    const userInp = h('input', { type: 'text', class: 'form-control', id: 'li-user', autocomplete: 'username' });
    userG.appendChild(userInp);
    const passG = h('div', { class: 'form-group' });
    passG.appendChild(h('label', { for: 'li-pass', text: 'Password' }));
    const passInp = h('input', { type: 'password', class: 'form-control', id: 'li-pass', autocomplete: 'current-password' });
    passG.appendChild(passInp);
    card.appendChild(userG);
    card.appendChild(passG);

    const submitBtn = h('button', { type: 'button', class: 'btn btn-primary', text: 'Sign in' });
    submitBtn.addEventListener('click', onSubmit);
    const footer = h('div', { class: 'footer-hint',
      html: 'Default on first run: <code>admin</code> / <code>admin123</code> — change this password immediately in the Users page after you sign in.' });
    card.appendChild(submitBtn);
    card.appendChild(footer);

    userInp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); passInp.focus(); } });
    passInp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); onSubmit(); } });
    setTimeout(() => { userInp.focus(); }, 20);

    function setAlert(kind, title, msg, extras) {
      alertHost.innerHTML = '';
      if (!kind) return;
      const a = h('div', { class: 'alert alert-' + kind });
      const b = h('div', { class: 'body' });
      if (title) b.appendChild(h('div', { class: 'title', text: title }));
      if (msg) b.appendChild(h('div', { class: 'detail', text: msg }));
      const hints = extras && (extras.hints || (Array.isArray(extras) ? extras : null));
      if (hints && hints.length) {
        const ul = h('ul');
        hints.forEach(h => ul.appendChild(h('li', { text: h })));
        b.appendChild(ul);
      }
      a.appendChild(b);
      a.appendChild(h('button', { type: 'button', class: 'close', onclick: () => a.remove(), html: '&times;' }));
      alertHost.appendChild(a);
    }
    async function onSubmit() {
      setAlert(null);
      const u = userInp.value.trim();
      const p = passInp.value;
      if (!u) { userInp.style.borderColor = 'var(--color-danger)'; userInp.focus(); return; }
      userInp.style.borderColor = '';
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span class="spinner"></span><span>Signing in…</span>';
      try {
        const r = await api('POST', '/api/auth/login', { username: u, password: p });
        state.sessionId = r.sessionId;
        state.user = r.user;
        state.version = r.version;
        try { localStorage.setItem('auth.sessionId', state.sessionId); } catch (_) {}
        bootAppShell();
      } catch (e) {
        setAlert('danger',
          (e && (e.code === 'AUTH_BAD_CREDENTIALS' || e.code === 'AUTH_REQUIRED')) ? 'Invalid credentials' : 'Could not sign in',
          (e && e.message) || String(e), e);
        passInp.select();
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Sign in';
      }
    }
  }

  function signOut() {
    (async () => { try { await api('POST', '/api/auth/logout', {}); } catch (_) {} })();
    state.sessionId = '';
    state.user = null;
    state.connectionId = '';
    state.connection = null;
    state.schema = null;
    state.currentView = null;
    try { localStorage.removeItem('auth.sessionId'); } catch (_) {}
    try { localStorage.removeItem('pg.connId'); } catch (_) {}
    renderLogin();
  }

  // ---------- App shell (after sign-in) ----------
  function shellDom() {
    return h('div', { class: 'app' },
      h('div', { class: 'topbar' },
        h('div', { class: 'brand' },
          h('span', { class: 'badge', text: 'Live' }),
          h('span', { text: 'PostgreSQL Schema Interpreter' }),
          h('span', {
            class: 'version-pill', title: 'Software build (yymmdd.hhmm)',
            text: state.version || 'loading…',
          })
        ),
        h('div', { id: 'conn', class: 'conn disconnected' },
          h('span', { id: 'conn-pill', class: 'pill', title: 'Not connected — click Connect to Postgres' },
            h('span', { class: 'dot' }),
            h('span', { id: 'conn-text', text: 'Not connected' })
          ),
          h('button', { id: 'btn-connect', class: 'btn btn-primary btn-small', type: 'button', text: 'Connect to Postgres' }),
          h('button', { id: 'btn-disconnect', class: 'btn btn-small', type: 'button', style: 'display:none', text: 'Disconnect' }),
          h('div', { class: 'user-area' },
            h('span', { class: 'user-pill', title: 'Current signed-in interpreter user' },
              h('span', { class: 'uname', text: state.user ? state.user.username : '?' }),
              h('span', { class: 'role ' + (state.user && state.user.role === 'admin' ? 'admin' : 'normal'),
                text: state.user ? state.user.role : '?' })
            ),
            h('button', { id: 'btn-account', class: 'btn btn-small', type: 'button', text: 'Account' }),
            h('button', { id: 'btn-signout', class: 'btn btn-small', type: 'button', text: 'Sign out' })
          )
        )
      ),
      h('aside', { class: 'sidebar', id: 'sidebar' }),
      h('main', { class: 'content', id: 'content' })
    );
  }

  function bootAppShell() {
    const root = $('#app-root');
    root.innerHTML = '';
    root.appendChild(shellDom());
    // Wire shell permanent actions
    $('#btn-signout').addEventListener('click', signOut);
    $('#btn-account').addEventListener('click', openAccountModal);
    // Boot flow
    setConnectedUi(false);
    renderSidebar();
    renderWelcome();

    $('#btn-connect').addEventListener('click', () => {
      openCredentialDialog({ reusePassword: !!state._saved });
    });
    $('#conn-pill').addEventListener('click', () => {
      openCredentialDialog({ reusePassword: !!state._saved });
    });
    $('#btn-disconnect').addEventListener('click', async () => {
      try { await api('POST', '/api/interpreter/disconnect', {}); } catch (_) {}
      clearConnection();
    });

    (async function restore() {
      // Session already validated via login; version now known.
      if (!state.version) {
        try {
          const v = await api('GET', '/api/version');
          state.version = v.version;
          const verEl = document.querySelector('.version-pill');
          if (verEl) { verEl.textContent = state.version; verEl.title = 'Built ' + (v.builtAt || ''); }
        } catch (_) {}
      }
      if (state.sessionId && state.connectionId) {
        try {
          const s = await api('GET', '/api/interpreter/status');
          if (s && s.connected && s.connection) {
            state.connection = s.connection;
            state.availableSchemas = Array.isArray(s.availableSchemas) ? s.availableSchemas : [];
            if (state.user && s.auth && s.auth.username === state.user.username && s.auth.role) {
              state.user.role = s.auth.role;
            }
            setConnectedUi(true, state.connection);
            await loadSchema();
            renderSidebar();
            const hash = location.hash.replace(/^#/, '');
            const route = parseHash(hash);
            if (route) await navigateByRoute(route);
            else if (state.schema.tables && state.schema.tables[0]) {
              navigateToTable(state.schema.tables[0].name);
            }
            return;
          }
        } catch (e) {
          if (e && (e.status === 401)) { signOut(); return; }
        }
        clearConnection();
      }
      window.addEventListener('hashchange', onHashChange);
    })();
  }

  function onHashChange() {
    const hash = location.hash.replace(/^#/, '');
    const route = parseHash(hash);
    if (!route) return;
    navigateByRoute(route);
  }

  function parseHash(hash) {
    if (!hash) return null;
    if (hash === 'users') return { kind: 'users' };
    if (state.schema && state.schema.tables && state.schema.tables.find(t => t.name === hash)) {
      return { kind: 'table', name: hash };
    }
    return null;
  }

  async function navigateByRoute(route) {
    if (!state.schema) { try { await loadSchema(); renderSidebar(); } catch (_) {} }
    if (route.kind === 'users') return renderUsersPage();
    if (route.kind === 'table') return navigateToTable(route.name);
  }

  // ---------- Connect dialog ----------
  function openCredentialDialog(opts) {
    opts = opts || {};
    const initialValues = Object.assign({
      host: (state._saved && state._saved.host) || localStorage.getItem('pg.host') || 'localhost',
      port: (state._saved && state._saved.port) || Number(localStorage.getItem('pg.port')) || 5432,
      database: (state._saved && state._saved.database) || localStorage.getItem('pg.db') || '',
      user: (state._saved && state._saved.user) || localStorage.getItem('pg.user') || 'postgres',
      password: (opts.reusePassword && state._saved && state._saved.password) ? state._saved.password : '',
      schema: (state._saved && state._saved.schema) || localStorage.getItem('pg.schema') || 'public',
      ssl: false,
    }, opts.initial || {});

    const backdrop = h('div', { class: 'modal-backdrop', onmousedown: (e) => { if (e.target === backdrop) close(); } });
    const modal = h('div', { class: 'modal' });
    const header = h('div', { class: 'modal-header' },
      h('h2', { text: 'Connect to PostgreSQL' }),
      h('button', { type: 'button', class: 'close', onclick: close, html: '&times;', title: 'Close' })
    );
    const body = h('div', { class: 'modal-body' });
    const footer = h('div', { class: 'modal-footer' });
    modal.appendChild(header); modal.appendChild(body); modal.appendChild(footer);
    backdrop.appendChild(modal);

    const alertHost = h('div');
    const progress = h('div', { class: 'progress', style: 'display:none' });
    const progressBar = h('div', { class: 'bar' });
    progress.appendChild(progressBar);
    body.appendChild(alertHost);
    body.appendChild(progress);

    let submitBtn = null;

    const hostInput = addField(body, 'hostname', 'Hostname', 'text', initialValues.host, 'localhost or db.example.com');
    const row2 = h('div', { class: 'form-group row2' });
    const portInput = addField(row2, 'port', 'Port', 'number', initialValues.port, 'Default 5432');
    const dbInput   = addField(row2, 'dbname', 'Database name', 'text', initialValues.database, 'e.g. testdb', true);
    body.appendChild(row2);
    const row3 = h('div', { class: 'form-group row2' });
    const userInput  = addField(row3, 'user', 'User', 'text', initialValues.user, '', true);
    const passInput  = addField(row3, 'pass', 'Password', 'password', initialValues.password, 'Stored only in server memory (never persisted on disk)');
    body.appendChild(row3);

    const adv = h('details', { class: 'advanced' });
    adv.appendChild(h('summary', { text: 'Advanced options' }));
    const schemaInp = addField(adv, 'schema', 'Postgres schema', 'text', initialValues.schema, 'Usually "public"');
    const cbWrap = h('div', { style: 'margin-top:10px' });
    const sslCB = h('input', { type: 'checkbox', id: 'f-ssl' });
    sslCB.checked = !!initialValues.ssl;
    const sslWrap  = h('label', { class: 'check-row', style: 'display:flex;align-items:center;gap:8px;' }, sslCB, ' Require SSL');
    cbWrap.appendChild(sslWrap);
    adv.appendChild(cbWrap);
    body.appendChild(adv);

    const resultHost = h('div');
    body.appendChild(resultHost);

    footer.appendChild(h('button', { type: 'button', class: 'btn', onclick: close, text: 'Cancel' }));
    submitBtn = h('button', { type: 'button', class: 'btn btn-primary', onclick: onSubmit, text: 'Connect' });
    footer.appendChild(submitBtn);

    document.body.appendChild(backdrop);
    setTimeout(() => { dbInput.focus(); }, 20);

    function addField(container, id, label, type, val, hint, required) {
      const g = h('div', { class: 'form-group' });
      const lab = h('label', { for: 'f-' + id, text: label });
      if (required) lab.appendChild(h('span', { style: 'color:var(--color-danger);margin-left:3px;', text: '*' }));
      if (hint) lab.appendChild(h('span', { class: 'hint', text: ' (' + hint + ')' }));
      g.appendChild(lab);
      const inp = h('input', { type: type, class: 'form-control', id: 'f-' + id });
      if (val !== undefined && val !== null) inp.value = String(val);
      g.appendChild(inp);
      container.appendChild(g);
      return inp;
    }
    function setAlert(kind, title, message, extras) {
      alertHost.innerHTML = '';
      if (!kind) return;
      const a = h('div', { class: 'alert alert-' + kind });
      const b = h('div', { class: 'body' });
      if (title) b.appendChild(h('div', { class: 'title', text: title }));
      if (message) b.appendChild(h('div', { class: 'detail', text: message }));
      const hints = extras && (extras.hints || (Array.isArray(extras) ? extras : null));
      if (hints && hints.length) {
        const ul = h('ul');
        hints.forEach(hh => ul.appendChild(h('li', { text: hh })));
        b.appendChild(ul);
      }
      a.appendChild(b);
      a.appendChild(h('button', { type: 'button', class: 'close', onclick: () => a.remove(), html: '&times;' }));
      alertHost.appendChild(a);
    }
    function setProgress(pct, visible) {
      progress.style.display = visible ? '' : 'none';
      progressBar.style.width = Math.max(0, Math.min(100, pct)) + '%';
    }
    function readPayload() {
      return {
        host: hostInput.value.trim(),
        port: Number(portInput.value),
        database: dbInput.value.trim(),
        user: userInput.value.trim(),
        password: passInput.value,
        schema: schemaInp.value.trim() || 'public',
        ssl: sslCB.checked,
      };
    }
    function setSubmitting(submitting) {
      submitBtn.disabled = !!submitting;
      submitBtn.innerHTML = submitting
        ? '<span class="spinner"></span><span>Connecting…</span>'
        : 'Connect';
    }
    async function onSubmit() {
      resultHost.innerHTML = '';
      setAlert(null);
      [hostInput, portInput, dbInput, userInput, passInput].forEach(i => i.style.borderColor = '');
      const p = readPayload();
      if (!p.database) { dbInput.style.borderColor = 'var(--color-danger)'; return; }
      if (!p.user) { userInput.style.borderColor = 'var(--color-danger)'; return; }
      if (!p.host) { hostInput.style.borderColor = 'var(--color-danger)'; return; }

      localStorage.setItem('pg.host', p.host);
      localStorage.setItem('pg.port', p.port);
      localStorage.setItem('pg.db', p.database);
      localStorage.setItem('pg.user', p.user);
      localStorage.setItem('pg.schema', p.schema);
      try { localStorage.setItem('pg.lastConnection', JSON.stringify(p)); } catch (_) {}

      setSubmitting(true);
      setProgress(15, true);
      try {
        setProgress(45, true);
        const res = await api('POST', '/api/interpreter/connect', p);
        setProgress(100, true);
        state.connectionId = res.connectionId;
        state.connection = res.connection;
        state.availableSchemas = Array.isArray(res.availableSchemas) ? res.availableSchemas : [res.connection.schema];
        if (res.auth && res.auth.role) state.user.role = res.auth.role;
        localStorage.setItem('pg.connId', state.connectionId);
        setAlert('success', 'Connected',
          `Connected as ${res.connection.user}@${res.connection.host}:${res.connection.port}/${res.connection.database} — ${res.schemaTables.length} table(s) in schema ${res.connection.schema}.`);
        setProgress(0, false);
        setTimeout(() => { close(); afterInteractConnect(); }, 650);
      } catch (e) {
        setProgress(0, false);
        if (e && e.status === 401) { signOut(); return close(); }
        setAlert('danger',
          ((e && e.code === 'VALIDATION') || (e && e.status === 400)) ? 'Please fix the form' : 'Could not connect to Postgres',
          (e && e.message) || String(e), e);
        if (e && /password/i.test(e.message || '') || (e && e.code === '28P01') || (e && e.code === '28000') || (e && e.hints && e.hints.some(x => /password/i.test(x)))) {
          passInput.style.borderColor = 'var(--color-danger)';
        }
      } finally {
        setSubmitting(false);
      }
    }
    function close() {
      if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
      document.removeEventListener('keydown', escHandler);
    }
    function escHandler(e) { if (e.key === 'Escape') close(); }
    document.addEventListener('keydown', escHandler);
    [hostInput, portInput, dbInput, userInput, passInput].forEach(i => {
      i.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); onSubmit(); } });
    });

    return { close, open: () => null };
  }

  // ---------- Shell state renderers ----------
  function setConnectedUi(connected, info) {
    const connEl = $('#conn');
    const pill = $('#conn-pill');
    const text = $('#conn-text');
    const btnConnect = $('#btn-connect');
    const btnDisconnect = $('#btn-disconnect');
    if (!connEl) return;
    connEl.classList.toggle('disconnected', !connected);
    if (connected && info) {
      pill.title = `Connected as ${info.user} on ${info.host}:${info.port}/${info.database}`;
      text.textContent = `${info.user}@${info.host}:${info.port}/${info.database}  ·  schema ${info.schema}`;
      btnConnect.textContent = 'Change credentials';
      btnConnect.classList.remove('btn-primary');
      btnConnect.classList.add('btn');
      btnDisconnect.style.display = '';
    } else {
      pill.title = 'Not connected';
      text.textContent = 'Not connected';
      btnConnect.textContent = 'Connect to Postgres';
      btnConnect.classList.add('btn-primary');
      btnDisconnect.style.display = 'none';
    }
    // User pill refresh
    const uname = document.querySelector('.user-pill .uname');
    const role  = document.querySelector('.user-pill .role');
    if (uname && state.user) uname.textContent = state.user.username;
    if (role && state.user) {
      role.textContent = state.user.role;
      role.className = 'role ' + (state.user.role === 'admin' ? 'admin' : 'normal');
    }
    const ver = document.querySelector('.version-pill');
    if (ver && state.version) { ver.textContent = state.version; }
  }

  function renderSidebar() {
    const sb = $('#sidebar');
    if (!sb) return;
    sb.innerHTML = '';
    const navTitle = h('h3', { text: 'Navigation' });
    sb.appendChild(navTitle);

    // App-wide nav
    const navSection = h('div', { class: 'section-nav' });
    if (state.user && state.user.role === 'admin') {
      const isUsers = state.currentView && state.currentView.kind === 'users';
      const b = h('button', {
        class: 'nav-btn' + (isUsers ? ' active' : ''),
        type: 'button',
        text: 'Users',
        onclick: () => { location.hash = 'users'; renderUsersPage(); },
      });
      const ico = h('span', { class: 'ico', text: '👥' });
      b.prepend(ico);
      navSection.appendChild(b);
    } else {
      const b = h('button', {
        class: 'nav-btn', type: 'button',
        text: 'Change my password',
        onclick: () => openAccountModal(),
      });
      const ico = h('span', { class: 'ico', text: '🔒' });
      b.prepend(ico);
      navSection.appendChild(b);
    }
    sb.appendChild(navSection);

    // Schema selector + tables
    const schemaSect = h('div', { style: 'margin-top:18px' });
    const schemasLabel = h('div', { class: 'section-title', text: 'Schema & Tables' });
    schemaSect.appendChild(schemasLabel);

    if (state.connection && state.availableSchemas && state.availableSchemas.length) {
      const row = h('div', { class: 'schema-row' });
      row.appendChild(h('span', { text: 'Schema:' }));
      const sel = h('select');
      state.availableSchemas.forEach(name => {
        const opt = h('option', { value: name, text: name });
        if (name === (state.connection && state.connection.schema)) opt.selected = true;
        sel.appendChild(opt);
      });
      sel.addEventListener('change', async () => {
        const newSchema = sel.value;
        if (!newSchema) return;
        if (newSchema === (state.connection && state.connection.schema)) return;
        sel.disabled = true;
        try {
          const r = await api('POST', '/api/interpreter/schema', { schema: newSchema });
          if (r && r.connection) {
            state.connection = r.connection;
            state.availableSchemas = Array.isArray(r.availableSchemas) ? r.availableSchemas : [];
            await loadSchema();
            setConnectedUi(true, state.connection);
            state.currentView = null;
            renderSidebar();
            if (state.schema.tables && state.schema.tables[0]) navigateToTable(state.schema.tables[0].name);
            else renderWelcome();
          }
        } catch (e) {
          const f = formatErrForAlert(e);
          const tmp = h('div');
          document.querySelector('.content') && showAlert(document.querySelector('.content'), 'danger', f.title, f.message, f.hints);
        } finally {
          sel.disabled = false;
        }
      });
      row.appendChild(sel);
      schemaSect.appendChild(row);
    }

    const tablesTitle = h('h3', { style: 'margin-top:18px; margin-bottom:8px;', text: 'Tables' });
    schemaSect.appendChild(tablesTitle);
    const list = h('ul', { id: 'tables-list' });
    schemaSect.appendChild(list);
    sb.appendChild(schemaSect);

    if (!state.connection || !state.schema) {
      list.appendChild(h('li', {}, h('div', { class: 'empty-msg' },
        'Connect to a Postgres database to see the tables. ',
        h('br'),
        (() => { const a = h('a', { href: '#', text: 'Connect to Postgres' }); a.addEventListener('click', (e) => { e.preventDefault(); openCredentialDialog({}); }); return a; })()
      )));
      return;
    }
    const tables = state.schema.tables || [];
    if (!tables.length) {
      list.appendChild(h('li', {}, h('div', { class: 'empty-msg', text: `No tables found in schema "${state.schema.schema}".` })));
      return;
    }
    tables.forEach((t) => {
      const active = state.currentView && state.currentView.kind === 'table' && state.currentView.name === t.name;
      const a = h('a', { href: '#', class: active ? 'active' : '' },
        h('span', { class: 'tname', text: t.name }),
        h('span', { class: 'tmeta', text: t.columns.length + ' cols' })
      );
      a.addEventListener('click', (e) => { e.preventDefault(); navigateToTable(t.name); });
      list.appendChild(h('li', {}, a));
    });
  }

  async function loadSchema() {
    if (!state.connectionId) return null;
    try {
      const s = await api('GET', '/api/interpreter/schema');
      state.schema = s;
      state.availableSchemas = Array.isArray(s.availableSchemas) ? s.availableSchemas : state.availableSchemas;
      return s;
    } catch (e) {
      if (e && (e.status === 401 && /AUTH_/.test(e.code || ''))) { signOut(); throw e; }
      if (e && (e.code === 'NO_CONN' || e.status === 401)) clearConnection();
      throw e;
    }
  }

  async function afterInteractConnect() {
    setConnectedUi(true, state.connection);
    await loadSchema();
    renderSidebar();
    const hash = location.hash.replace(/^#/, '');
    const route = parseHash(hash);
    if (route) await navigateByRoute(route);
    else if (state.schema.tables && state.schema.tables[0]) {
      navigateToTable(state.schema.tables[0].name);
    } else {
      renderWelcome();
    }
  }

  function clearConnection() {
    state.connectionId = '';
    state.connection = null;
    state.schema = null;
    state.currentView = null;
    state.availableSchemas = [];
    try { localStorage.removeItem('pg.connId'); } catch (_) {}
    setConnectedUi(false);
    renderSidebar();
    renderWelcome();
  }

  function renderWelcome() {
    const content = $('#content');
    content.innerHTML = '';
    state.currentView = null;
    content.appendChild(h('div', { class: 'welcome', id: 'welcome-card' },
      h('h1', { text: 'Interact with Postgres tables live — no code generation' }),
      h('p', { class: 'lede',
        html: 'This is the <strong>DDL interpreter</strong> mode. Enter Postgres credentials, and we\'ll ' +
              'interpret the schema at runtime: one live page per table with pagination, ' +
              'Create / Update / Delete, and in-UI error banners — all without writing ' +
              'any generated files to disk.' }),
      h('h2', { text: 'Quick start' }),
      (() => {
        const a = h('a', { href: '#', class: 'btn btn-primary', style: 'margin-top:14px;display:inline-flex;', text: 'Connect to Postgres' });
        a.addEventListener('click', (e) => { e.preventDefault(); openCredentialDialog({}); });
        return a;
      })(),
      h('ul', { style: 'margin-top:20px' },
        h('li', { html: 'Click <strong>Connect to Postgres</strong> at the top-right (or use the link in the sidebar) to enter credentials.' }),
        h('li', { html: 'After connecting, the sidebar shows a <strong>Schema</strong> picker — use it to switch schemas on the same database.' }),
        h('li', { text: 'Pick any table from the sidebar to browse rows, modify, create, or delete.' }),
        h('li', { html: 'Click the <strong>Account</strong> button to change your password. Administrators see a <strong>Users</strong> page to manage all accounts.' }),
        h('li', { html: 'You can <em>re-enter Postgres credentials at any time</em> by clicking the connection pill or Connect / Change credentials in the header.' })
      )
    ));
  }

  // ---------- Account modal (change password, admin can change any field) ----------
  function openAccountModal() {
    const backdrop = h('div', { class: 'modal-backdrop', onmousedown: (e) => { if (e.target === backdrop) close(); } });
    const modal = h('div', { class: 'modal' });
    const isAdmin = state.user && state.user.role === 'admin';
    const title = isAdmin ? 'Update your account' : 'Change your password';
    const header = h('div', { class: 'modal-header' },
      h('h2', { text: title }),
      h('button', { type: 'button', class: 'close', onclick: close, html: '&times;' })
    );
    const body = h('div', { class: 'modal-body' });
    const footer = h('div', { class: 'modal-footer' },
      h('button', { type: 'button', class: 'btn', onclick: close, text: 'Close' })
    );
    modal.appendChild(header); modal.appendChild(body); modal.appendChild(footer);
    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);
    const alertHost = h('div'); body.appendChild(alertHost);

    function setAlert(kind, title, msg, extras) {
      alertHost.innerHTML = '';
      if (!kind) return;
      const a = h('div', { class: 'alert alert-' + kind });
      const b = h('div', { class: 'body' });
      if (title) b.appendChild(h('div', { class: 'title', text: title }));
      if (msg) b.appendChild(h('div', { class: 'detail', text: msg }));
      const hints = extras && (extras.hints || (Array.isArray(extras) ? extras : null));
      if (hints && hints.length) {
        const ul = h('ul'); hints.forEach(x => ul.appendChild(h('li', { text: x }))); b.appendChild(ul);
      }
      a.appendChild(b);
      a.appendChild(h('button', { type: 'button', class: 'close', onclick: () => a.remove(), html: '&times;' }));
      alertHost.appendChild(a);
    }

    // Current user info card
    const info = h('div', { style: 'background:var(--color-panel);border:1px solid var(--color-border);border-radius:8px;padding:10px 12px;margin-bottom:14px;' },
      h('div', { style: 'font-size:12px;color:var(--color-muted);text-transform:uppercase;letter-spacing:0.06em;', text: 'Signed in as' }),
      h('div', { style: 'font-weight:700;font-size:15px;margin-top:4px;', text: state.user.username }),
      h('div', { style: 'margin-top:2px;' },
        h('span', { class: 'user-role-tag ' + (state.user.role === 'admin' ? 'admin' : ''), text: state.user.role })
      )
    );
    body.appendChild(info);

    const curG = h('div', { class: 'form-group' });
    curG.appendChild(h('label', { for: 'acc-cur', text: 'Current password' + (isAdmin ? ' (optional if admin changing yourself)' : '') }));
    const curInp = h('input', { type: 'password', class: 'form-control', id: 'acc-cur' });
    curG.appendChild(curInp);
    if (!isAdmin) body.appendChild(curG);

    const newG = h('div', { class: 'form-group' });
    newG.appendChild(h('label', { for: 'acc-new', text: 'New password' }));
    const newInp = h('input', { type: 'password', class: 'form-control', id: 'acc-new' });
    newG.appendChild(newInp);
    const confG = h('div', { class: 'form-group' });
    confG.appendChild(h('label', { for: 'acc-conf', text: 'Confirm new password' }));
    const confInp = h('input', { type: 'password', class: 'form-control', id: 'acc-conf' });
    confG.appendChild(confInp);
    body.appendChild(newG);
    body.appendChild(confG);

    if (isAdmin) {
      const row = h('div', { class: 'form-group row2' });
      const nameG = h('div', { class: 'form-group' });
      nameG.appendChild(h('label', { for: 'acc-username', text: 'Username' }));
      const nameInp = h('input', { type: 'text', class: 'form-control', id: 'acc-username', value: state.user.username });
      nameG.appendChild(nameInp);
      const roleG = h('div', { class: 'form-group' });
      roleG.appendChild(h('label', { for: 'acc-role', text: 'Role' }));
      const roleSel = h('select', { class: 'form-control', id: 'acc-role' });
      ['admin', 'normal'].forEach(r => {
        const o = h('option', { value: r, text: r });
        if (r === state.user.role) o.selected = true;
        roleSel.appendChild(o);
      });
      roleG.appendChild(roleSel);
      row.appendChild(nameG); row.appendChild(roleG);
      body.appendChild(row);
      body.appendChild(curG);
    }

    const goBtn = h('button', { type: 'button', class: 'btn btn-primary', text: isAdmin ? 'Save changes' : 'Change password' });
    goBtn.addEventListener('click', async () => {
      goBtn.disabled = true;
      setAlert(null);
      try {
        const payload = {};
        if (newInp.value || confInp.value) {
          if (newInp.value !== confInp.value) {
            const e = new Error('New password and confirmation do not match.');
            e.status = 400; e.code = 'AUTH_VALIDATION'; throw e;
          }
          payload.password = newInp.value;
        }
        if (!isAdmin) {
          payload.currentPassword = curInp.value;
        } else if (newInp.value) {
          if (curInp.value) payload.currentPassword = curInp.value;
        }
        if (isAdmin) {
          payload.username = nameInp.value.trim();
          payload.role = roleSel.value;
        }
        const r = await api('PUT', `/api/auth/users/${encodeURIComponent(state.user.username)}`, payload);
        if (r && r.user) state.user = r.user;
        setAlert('success', 'Saved', 'Your account was updated.');
        setConnectedUi(true, state.connection);
        setTimeout(close, 500);
      } catch (e) {
        setAlert('danger',
          (e && /AUTH_VALIDATION|AUTH_BAD_CURRENT_PASSWORD/.test(e.code || '')) ? 'Could not save' : 'Error',
          (e && e.message) || String(e), e);
      } finally {
        goBtn.disabled = false;
      }
    });
    footer.appendChild(goBtn);

    function close() {
      if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
      document.removeEventListener('keydown', escHandler);
    }
    function escHandler(e) { if (e.key === 'Escape') close(); }
    document.addEventListener('keydown', escHandler);
  }

  // ---------- Admin Users page ----------
  function renderUsersPage() {
    state.currentView = { kind: 'users' };
    location.hash = 'users';
    renderSidebar();
    const content = $('#content');
    content.innerHTML = '';
    const alerts = h('div');
    const header = h('header', { class: 'page' },
      h('h1', {}, 'App users', h('small', { text: ' · interpreter accounts (one-way password hashes, stored locally)' })),
      h('div', { class: 'row-actions' },
        h('button', { class: 'btn btn-primary btn-small', type: 'button', text: '+ New user', onclick: () => openCreateUserModal(onChanged) })
      )
    );
    content.appendChild(header);
    content.appendChild(alerts);
    const tb = h('div', { class: 'users-toolbar' });
    const body = h('div');
    content.appendChild(tb);
    content.appendChild(body);
    onChanged();

    async function onChanged() {
      body.innerHTML = '';
      try {
        const { users } = await api('GET', '/api/auth/users');
        const wrap = h('div', { class: 'table-wrap' });
        const tbl = h('table', { class: 'tbl' });
        const thead = h('thead');
        const htr = h('tr');
        ['Username', 'Role', 'Created', 'Actions'].forEach(x => htr.appendChild(h('th', { text: x })));
        thead.appendChild(htr);
        tbl.appendChild(thead);
        const tbody = h('tbody');
        if (!users.length) {
          tbody.appendChild(h('tr', { class: 'row-empty' }, h('td', { text: 'No users. Click + New user to create one.' })));
        } else {
          users.forEach(u => {
            const tr = h('tr');
            tr.appendChild(h('td', {}, h('span', { style: 'font-weight:600', text: u.username })));
            const roleTd = h('td');
            const tag = h('span', { class: 'user-role-tag ' + (u.role === 'admin' ? 'admin' : ''), text: u.role });
            roleTd.appendChild(tag);
            tr.appendChild(roleTd);
            const cr = u.createdAt ? new Date(u.createdAt) : null;
            tr.appendChild(h('td', { class: 'mono', text: cr ? cr.toISOString().slice(0, 16).replace('T', ' ') : '—' }));
            const act = h('td', { class: 'action-cell' });
            const editBtn = h('button', { class: 'btn btn-small', type: 'button', text: 'Edit' });
            editBtn.addEventListener('click', () => openEditUserModal(u, onChanged));
            act.appendChild(editBtn);
            if (String(u.username).toLowerCase() !== String(state.user.username || '').toLowerCase()) {
              const delBtn = h('button', { class: 'btn btn-small btn-danger', type: 'button', text: 'Delete' });
              delBtn.addEventListener('click', () => openDeleteUserModal(u, onChanged));
              act.appendChild(delBtn);
            } else {
              act.appendChild(h('span', { class: 'chip', text: 'you' }));
            }
            tr.appendChild(act);
            tbody.appendChild(tr);
          });
        }
        tbl.appendChild(tbody);
        wrap.appendChild(tbl);
        body.appendChild(wrap);
      } catch (e) {
        if (e && e.status === 401 && /AUTH_/.test(e.code || '')) return signOut();
        const f = formatErrForAlert(e);
        showAlert(alerts, 'danger', f.title, f.message, f.hints);
      }
    }
  }

  function openCreateUserModal(done) {
    userEditorModal({ mode: 'create', onDone: done });
  }
  function openEditUserModal(u, done) {
    userEditorModal({ mode: 'edit', user: u, onDone: done });
  }
  function openDeleteUserModal(u, done) {
    const backdrop = h('div', { class: 'modal-backdrop', onmousedown: (e) => { if (e.target === backdrop) close(); } });
    const modal = h('div', { class: 'modal' });
    const header = h('div', { class: 'modal-header' },
      h('h2', { text: 'Delete user: ' + u.username }),
      h('button', { type: 'button', class: 'close', onclick: close, html: '&times;' })
    );
    const body = h('div', { class: 'modal-body' });
    const footer = h('div', { class: 'modal-footer' },
      h('button', { type: 'button', class: 'btn', onclick: close, text: 'Cancel' })
    );
    modal.appendChild(header); modal.appendChild(body); modal.appendChild(footer);
    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);
    const alertHost = h('div'); body.appendChild(alertHost);
    body.appendChild(h('p', { text: 'This will permanently remove the interpreter account. Rows in Postgres databases are not affected.' }));
    const info = h('ul', { style: 'background:rgba(248,81,73,0.06);border:1px solid rgba(248,81,73,0.3);padding:10px 10px 10px 28px;border-radius:8px;' });
    info.appendChild(h('li', { text: 'Username: ' + u.username }));
    info.appendChild(h('li', { text: 'Role: ' + u.role }));
    body.appendChild(info);
    const goBtn = h('button', { class: 'btn btn-danger', type: 'button', text: 'Permanently delete user' });
    goBtn.addEventListener('click', async () => {
      goBtn.disabled = true;
      try {
        await api('DELETE', `/api/auth/users/${encodeURIComponent(u.username)}`);
        close();
        done && done();
      } catch (e) {
        goBtn.disabled = false;
        setAlertDom(alertHost, 'danger',
          (e && e.status === 400 || /AUTH_VALIDATION/.test(e.code || '')) ? 'Could not delete' : 'Error',
          (e && e.message) || String(e), e);
      }
    });
    footer.appendChild(goBtn);
    function close() {
      if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
      document.removeEventListener('keydown', escHandler);
    }
    function escHandler(e) { if (e.key === 'Escape') close(); }
    document.addEventListener('keydown', escHandler);
  }

  function userEditorModal({ mode, user, onDone }) {
    const backdrop = h('div', { class: 'modal-backdrop', onmousedown: (e) => { if (e.target === backdrop) close(); } });
    const modal = h('div', { class: 'modal' });
    const title = mode === 'edit' ? ('Edit user: ' + user.username) : 'Create new user';
    const header = h('div', { class: 'modal-header' },
      h('h2', { text: title }),
      h('button', { type: 'button', class: 'close', onclick: close, html: '&times;' })
    );
    const body = h('div', { class: 'modal-body' });
    const footer = h('div', { class: 'modal-footer' },
      h('button', { type: 'button', class: 'btn', onclick: close, text: 'Cancel' })
    );
    modal.appendChild(header); modal.appendChild(body); modal.appendChild(footer);
    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);

    const alertHost = h('div'); body.appendChild(alertHost);
    const grid = h('div', { class: 'form-grid' });
    const nameG = h('div');
    nameG.appendChild(h('label', { for: 'ue-name', text: 'Username' },
      h('span', { style: 'color:var(--color-danger);margin-left:4px;', text: '*' })));
    const nameInp = h('input', { type: 'text', class: 'form-control', id: 'ue-name' });
    if (mode === 'edit') { nameInp.value = user.username; }
    nameG.appendChild(nameInp);
    grid.appendChild(nameG);
    const roleG = h('div');
    roleG.appendChild(h('label', { for: 'ue-role', text: 'Role' }));
    const roleSel = h('select', { class: 'form-control', id: 'ue-role' });
    ['admin', 'normal'].forEach(r => {
      const o = h('option', { value: r, text: r });
      if (mode === 'edit' && r === user.role) o.selected = true;
      roleSel.appendChild(o);
    });
    roleG.appendChild(roleSel);
    grid.appendChild(roleG);

    const passG = h('div', { class: mode === 'edit' ? '' : 'full' });
    passG.appendChild(h('label', { for: 'ue-pass', text: mode === 'edit' ? 'New password' : 'Password' },
      mode === 'edit' ? null : h('span', { style: 'color:var(--color-danger);margin-left:4px;', text: '*' })));
    const passInp = h('input', { type: 'password', class: 'form-control', id: 'ue-pass' });
    passG.appendChild(passInp);
    grid.appendChild(passG);

    if (mode === 'edit') {
      const confG = h('div');
      confG.appendChild(h('label', { for: 'ue-conf', text: 'Confirm new password' }));
      const confInp = h('input', { type: 'password', class: 'form-control', id: 'ue-conf' });
      confG.appendChild(confInp);
      grid.appendChild(confG);
    }
    body.appendChild(grid);

    const goBtn = h('button', { type: 'button', class: 'btn btn-primary', text: mode === 'edit' ? 'Save changes' : 'Create user' });
    goBtn.addEventListener('click', async () => {
      goBtn.disabled = true;
      try {
        const payload = {};
        payload.role = roleSel.value;
        const name = nameInp.value.trim();
        if (!name) throw vErr('Username is required.');
        if (mode === 'create') {
          payload.username = name;
          const pw = passInp.value;
          if (!pw || pw.length < 6) throw vErr('Password must be at least 6 characters.');
          payload.password = pw;
        } else {
          if (name !== user.username) payload.username = name;
          if (passInp.value || confInp.value) {
            if (passInp.value !== (confInp.value || '')) throw vErr('New password and confirmation do not match.');
            if (passInp.value.length < 6) throw vErr('Password must be at least 6 characters.');
            payload.password = passInp.value;
          }
        }
        if (mode === 'create') {
          await api('POST', '/api/auth/users', payload);
        } else {
          await api('PUT', `/api/auth/users/${encodeURIComponent(user.username)}`, payload);
          if (String(payload.username || user.username).toLowerCase() === String(state.user.username || '').toLowerCase()) {
            state.user.username = payload.username || user.username;
            state.user.role = payload.role || user.role;
            setConnectedUi(true, state.connection);
          }
        }
        setAlertDom(alertHost, 'success', 'Saved', 'User updated.');
        setTimeout(() => { close(); onDone && onDone(); }, 400);
      } catch (e) {
        goBtn.disabled = false;
        setAlertDom(alertHost, 'danger',
          (e && (e.status === 400 || /AUTH_VALIDATION|NOT_FOUND/.test(e.code || ''))) ? 'Could not save' : 'Error',
          (e && e.message) || String(e), e);
      }
    });
    footer.appendChild(goBtn);

    function close() {
      if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
      document.removeEventListener('keydown', escHandler);
    }
    function escHandler(e) { if (e.key === 'Escape') close(); }
    document.addEventListener('keydown', escHandler);
  }

  function vErr(msg) {
    const e = new Error(msg); e.status = 400; e.code = 'AUTH_VALIDATION'; return e;
  }

  function setAlertDom(host, kind, title, msg, extras) {
    host.innerHTML = '';
    if (!kind) return;
    const a = h('div', { class: 'alert alert-' + kind });
    const b = h('div', { class: 'body' });
    if (title) b.appendChild(h('div', { class: 'title', text: title }));
    if (msg) b.appendChild(h('div', { class: 'detail', text: msg }));
    const hints = extras && (extras.hints || (Array.isArray(extras) ? extras : null));
    if (hints && hints.length) {
      const ul = h('ul'); hints.forEach(x => ul.appendChild(h('li', { text: x }))); b.appendChild(ul);
    }
    a.appendChild(b);
    a.appendChild(h('button', { type: 'button', class: 'close', onclick: () => a.remove(), html: '&times;' }));
    host.appendChild(a);
  }

  // ---------- Table page (existing interpreter CRUD) ----------
  async function navigateToTable(name) {
    if (!state.schema) { try { await loadSchema(); renderSidebar(); } catch (_) {} }
    const t = (state.schema.tables || []).find(tt => tt.name === name);
    state.currentView = { kind: 'table', name };
    location.hash = encodeURIComponent(name);
    state.page = state.page || 1;
    state.pageSize = state.pageSize || 20;
    renderSidebar();
    if (!t) { renderWelcome(); return; }
    await renderTablePage(t);
  }

  function formatErrForAlert(err) {
    return {
      title: err && err.code === 'NO_CONN' ? 'No active connection' :
             err && err.code === 'NO_TABLE' ? 'Unknown table' :
             err && err.code === 'AUTH_FORBIDDEN' ? 'Forbidden' :
             err && /^4\d\d$|VALIDATION|AUTH_/.test(err.code || '') ? 'Request failed' :
             'Database error',
      message: (err && err.message) || String(err),
      hints: (err && err.hints) || (err && err.hint ? [err.hint] : null) || null,
    };
  }

  async function renderTablePage(t) {
    const content = $('#content');
    content.innerHTML = '';
    const alerts = h('div');
    const pager = h('div', { class: 'pager' });
    const tableWrap = h('div', { class: 'table-wrap' });
    const header = h('header', { class: 'page' },
      h('h1', {
        html: (t.schema ? '<small>' + esc(t.schema) + '.</small>' : '') + esc(t.name),
      }, (t.hasExplicitPk && t.primaryKeys.length)
        ? h('small', { text: ' · PK: ' + t.primaryKeys.join(', ') + ' · ' + t.columns.length + ' columns' })
        : h('small', { text: ' · no explicit PK (' + t.columns.length + ' cols)' })),
      h('div', { class: 'row-actions' },
        h('button', { class: 'btn btn-primary btn-small', type: 'button', text: '+ New Row', onclick: () => openCreateModal(t) }),
        t.hasExplicitPk ? null : h('span', { class: 'chip', text: 'No PK: create only' }),
      )
    );
    content.appendChild(header);
    content.appendChild(alerts);
    content.appendChild(pager);
    content.appendChild(tableWrap);
    try {
      const limit = state.pageSize;
      const offset = (state.page - 1) * state.pageSize;
      const data = await api('GET', `/api/interpreter/tables/${encodeURIComponent(t.name)}/rows?limit=${encodeURIComponent(limit)}&offset=${encodeURIComponent(offset)}`);
      state.totalRows = Number(data.total || 0);
      renderPager(pager, t, alerts);
      renderTableRows(tableWrap, t, data);
    } catch (e) {
      if (e && e.status === 401 && /AUTH_/.test(e.code || '')) return signOut();
      tableWrap.innerHTML = '';
      renderPager(pager, t, alerts);
      const f = formatErrForAlert(e);
      showAlert(alerts, 'danger', f.title, f.message, f.hints);
      const tbl = h('table', { class: 'tbl' });
      const thead = h('thead'); const tr = h('tr');
      (t.columns || []).forEach(c => tr.appendChild(h('th', { text: c.name })));
      tr.appendChild(h('th', { text: 'Actions' }));
      thead.appendChild(tr);
      tbl.appendChild(thead);
      const tbody = h('tbody');
      tbody.appendChild(h('tr', { class: 'row-empty' },
        h('td', { attrs: { colspan: (t.columns || []).length + 1 }, text: 'Failed to load rows' })));
      tbl.appendChild(tbody);
      tableWrap.appendChild(tbl);
    }
  }

  function renderPager(pagerEl, t, alertsEl) {
    pagerEl.innerHTML = '';
    const total = state.totalRows || 0;
    const size = state.pageSize;
    const totalPages = Math.max(1, Math.ceil(total / size));
    state.page = Math.min(Math.max(1, state.page || 1), totalPages);
    const page = state.page;
    const from = total ? (page - 1) * size + 1 : 0;
    const to = Math.min(page * size, total);
    const prevBtn = h('button', { class: 'btn btn-small', type: 'button', text: '‹ Prev', disabled: page <= 1 });
    prevBtn.addEventListener('click', async () => { state.page = page - 1; await renderTablePage(t); });
    const nextBtn = h('button', { class: 'btn btn-small', type: 'button', text: 'Next ›', disabled: page >= totalPages });
    nextBtn.addEventListener('click', async () => { state.page = page + 1; await renderTablePage(t); });
    const firstBtn = h('button', { class: 'btn btn-small btn-ghost', type: 'button', text: '« First', disabled: page <= 1 });
    firstBtn.addEventListener('click', async () => { state.page = 1; await renderTablePage(t); });
    const lastBtn = h('button', { class: 'btn btn-small btn-ghost', type: 'button', text: 'Last »', disabled: page >= totalPages });
    lastBtn.addEventListener('click', async () => { state.page = totalPages; await renderTablePage(t); });
    const sizeSel = h('select', { class: 'form-control', style: 'width:110px;padding:5px 8px' });
    [20, 50, 100, 200].forEach(n => {
      const o = h('option', { value: String(n), text: n + '/page' });
      if (n === size) o.selected = true;
      sizeSel.appendChild(o);
    });
    sizeSel.addEventListener('change', () => {
      state.pageSize = Number(sizeSel.value) || 20;
      state.page = 1;
      renderTablePage(t);
    });
    pagerEl.appendChild(firstBtn);
    pagerEl.appendChild(prevBtn);
    pagerEl.appendChild(nextBtn);
    pagerEl.appendChild(lastBtn);
    pagerEl.appendChild(sizeSel);
    pagerEl.appendChild(h('span', { class: 'page-indicator',
      html: 'Showing <strong>' + esc(String(from)) + '-' + esc(String(to)) + '</strong> of <strong>' + esc(String(total)) + '</strong> rows · Page <strong>' + esc(String(page)) + '</strong> / ' + esc(String(totalPages))
    }));
  }

  function renderTableRows(wrap, t, data) {
    wrap.innerHTML = '';
    const cols = t.columns;
    const tbl = h('table', { class: 'tbl' });
    const thead = h('thead');
    const htr = h('tr');
    cols.forEach(c => {
      const meta = [];
      if (t.primaryKeys.includes(c.name)) meta.push('PK');
      if (c.typeClass && c.typeClass !== 'text') meta.push(c.typeClass);
      if (!c.isNullable) meta.push('NOT NULL');
      const head = h('th', {}, c.name + (meta.length ? ('  · ' + meta.join(' / ')) : ''));
      htr.appendChild(head);
    });
    htr.appendChild(h('th', { text: 'Actions' }));
    thead.appendChild(htr);
    tbl.appendChild(thead);
    const tbody = h('tbody');
    if (!data.rows || !data.rows.length) {
      tbody.appendChild(h('tr', { class: 'row-empty' }, h('td', { text: 'No rows. Click + New Row to create one.' })));
    } else {
      const typeMap = data.typeMap || {};
      data.rows.forEach(row => {
        const tr = h('tr');
        cols.forEach(c => {
          const d = display(row[c.name], typeMap[c.name]);
          const cls = [];
          if (d.null) cls.push('null');
          if (d.mono) cls.push('mono');
          const cell = h('td', { class: cls.join(' ') }, d.text || '');
          if (d.title) cell.setAttribute('title', d.title);
          tr.appendChild(cell);
        });
        const actions = h('td', { class: 'action-cell' });
        const key = row.__rowKey;
        if (t.hasExplicitPk) {
          const edit = h('button', { class: 'btn btn-small', type: 'button', text: 'Edit' });
          edit.addEventListener('click', () => openEditModal(t, row, key));
          actions.appendChild(edit);
          const del = h('button', { class: 'btn btn-small btn-danger', type: 'button', text: 'Delete' });
          del.addEventListener('click', () => openDeleteModal(t, row, key));
          actions.appendChild(del);
        } else {
          actions.appendChild(h('span', { class: 'chip', text: 'No PK' }));
        }
        tr.appendChild(actions);
        tbody.appendChild(tr);
      });
    }
    tbl.appendChild(tbody);
    wrap.appendChild(tbl);
  }

  function showAlert(host, kind, title, message, hints) {
    const a = h('div', { class: 'alert alert-' + kind });
    const b = h('div', { class: 'body' });
    if (title) b.appendChild(h('div', { class: 'title', text: title }));
    if (message) b.appendChild(h('div', { class: 'detail', text: message }));
    if (hints && hints.length) {
      const ul = h('ul');
      hints.forEach(h => ul.appendChild(document.createElement ? h('li', { text: h }) : document.createTextNode(String(h))));
      b.appendChild(ul);
    }
    a.appendChild(b);
    a.appendChild(h('button', { type: 'button', class: 'close', onclick: () => a.remove(), html: '&times;' }));
    host.insertBefore(a, host.firstChild);
    return a;
  }

  // ---------- CRUD modals ----------
  function fieldEditor(col, initialValue, opts, onChange) {
    opts = opts || {};
    const id = 'ed-' + Math.random().toString(36).slice(2, 8);
    const meta = [];
    if (col.typeClass) meta.push(col.typeClass);
    if (col.characterMaximumLength) meta.push('max ' + col.characterMaximumLength);
    if (col.default) meta.push('default: ' + String(col.default).slice(0, 60));
    if (col.isIdentity) meta.push('identity');
    const g = h('div', { class: col.typeClass === 'json' || col.typeClass === 'text' ? 'full' : '' });
    const label = h('label', { for: id, text: col.name });
    if (meta.length) label.appendChild(h('span', { class: 'meta', text: ' (' + meta.join(', ') + ')' }));
    if (!col.isNullable) label.appendChild(h('span', { style: 'color:var(--color-danger);margin-left:4px;', text: '*' }));
    g.appendChild(label);

    const isNull = (initialValue === null || initialValue === undefined);
    let input;
    const tc = (col.typeClass || 'text').toLowerCase();
    if (tc === 'boolean') {
      input = h('select', { class: 'form-control', id });
      if (col.isNullable) input.appendChild(h('option', { value: '__null', text: 'NULL' }));
      input.appendChild(h('option', { value: 'true', text: 'true' }));
      input.appendChild(h('option', { value: 'false', text: 'false' }));
      if (isNull) input.value = '__null';
      else input.value = initialValue ? 'true' : 'false';
    } else if (tc === 'integer' || tc === 'number') {
      input = h('input', { type: 'text', class: 'form-control', id,
        placeholder: (tc === 'integer' ? 'integer' : 'number') + (col.isNullable ? ' (or NULL)' : '') });
      if (!isNull) input.value = String(initialValue);
    } else if (tc === 'json') {
      input = h('textarea', { class: 'form-control', id, rows: 4, placeholder: col.isNullable ? 'JSON (or NULL)' : 'JSON object/array' });
      if (!isNull) {
        try { input.value = typeof initialValue === 'string' ? initialValue : JSON.stringify(initialValue); }
        catch (_) { input.value = String(initialValue); }
      }
    } else if (tc === 'text' || tc === 'binary') {
      input = h('textarea', { class: 'form-control', id, rows: 2 });
      if (!isNull) input.value = String(initialValue);
    } else if (tc === 'datetime') {
      input = h('input', { type: 'datetime-local', class: 'form-control', id });
      if (!isNull) {
        let d;
        try { d = initialValue instanceof Date ? initialValue : new Date(initialValue); } catch (_) {}
        if (d && !isNaN(d.getTime())) {
          const pad = (n) => String(n).padStart(2, '0');
          const v = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' +
                    pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
          input.value = v;
        }
      }
    } else {
      input = h('input', { type: 'text', class: 'form-control', id });
      if (!isNull) input.value = String(initialValue);
    }
    g.appendChild(input);

    let nullCB = null;
    if (col.isNullable) {
      nullCB = h('input', { type: 'checkbox' });
      nullCB.checked = isNull;
      const row = h('label', { class: 'null-row' },
        nullCB,
        document.createTextNode(' Set to NULL (clear value)')
      );
      g.appendChild(row);
      function applyNullState() {
        input.disabled = nullCB.checked;
        input.style.opacity = nullCB.checked ? '0.55' : '1';
        if (nullCB.checked && onChange) onChange(null);
      }
      nullCB.addEventListener('change', applyNullState);
      applyNullState();
    }

    input.addEventListener('input', () => {
      if (col.isNullable && nullCB && nullCB.checked) return;
      if (onChange) onChange(readValue());
    });

    function readValue() {
      if (col.isNullable && nullCB && nullCB.checked) return null;
      if (tc === 'boolean') {
        const v = input.value;
        if (v === '__null') return null;
        return v === 'true';
      }
      if (tc === 'integer' || tc === 'number') {
        if (input.value === '') return col.isNullable ? null : undefined;
        const s = input.value;
        if (tc === 'integer') return /^-?\d+$/.test(s) ? parseInt(s, 10) : s;
        return isNaN(parseFloat(s)) ? s : parseFloat(s);
      }
      if (tc === 'datetime') {
        if (!input.value) return col.isNullable ? null : '';
        const d = new Date(input.value);
        return isNaN(d.getTime()) ? input.value : d.toISOString();
      }
      return input.value;
    }
    return { element: g, readValue, inputs: [input].concat(nullCB ? [nullCB] : []) };
  }

  function openCrudModal(kind, t, row, rowKey) {
    const isEdit = kind === 'edit';
    const isDelete = kind === 'delete';
    const backdrop = h('div', { class: 'modal-backdrop', onmousedown: (e) => { if (e.target === backdrop) close(); } });
    const modal = h('div', { class: 'modal' });
    const titleTxt = isDelete ? 'Delete row in ' + t.name :
                     isEdit ? 'Edit row in ' + t.name : 'Create row in ' + t.name;
    const header = h('div', { class: 'modal-header' },
      h('h2', { text: titleTxt }),
      h('button', { type: 'button', class: 'close', onclick: close, html: '&times;' })
    );
    const body = h('div', { class: 'modal-body' });
    const footer = h('div', { class: 'modal-footer' },
      h('button', { type: 'button', class: 'btn', onclick: close, text: 'Cancel' })
    );
    modal.appendChild(header); modal.appendChild(body); modal.appendChild(footer);
    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);

    const alertHost = h('div');
    body.appendChild(alertHost);

    if (isDelete) {
      const intro = h('p', { html: 'You are about to permanently delete a row in <code>' + esc(t.quotedName || t.name) + '</code>.' });
      body.appendChild(intro);
      if (row) {
        const ul = h('ul', { style: 'background:rgba(248,81,73,0.06);border:1px solid rgba(248,81,73,0.3);padding:10px 10px 10px 28px;border-radius:8px;' });
        t.primaryKeys.forEach(k => ul.appendChild(h('li', { text: `${k} = ${row[k] === null || row[k] === undefined ? 'NULL' : String(row[k])}` })));
        body.appendChild(ul);
      }
      const goBtn = h('button', { class: 'btn btn-danger', type: 'button', text: 'Permanently delete' });
      goBtn.addEventListener('click', async () => {
        try {
          goBtn.disabled = true;
          await api('DELETE', `/api/interpreter/tables/${encodeURIComponent(t.name)}/rows/${encodeURIComponent(rowKey)}`);
          setAlertDom(alertHost, 'success', 'Row deleted', 'Row was removed from ' + t.name + '.');
          setTimeout(() => { close(); renderTablePage(t); }, 500);
        } catch (e) {
          goBtn.disabled = false;
          if (e && e.status === 401 && /AUTH_/.test(e.code || '')) { signOut(); return close(); }
          const f = formatErrForAlert(e);
          setAlertDom(alertHost, 'danger', f.title, f.message, f.hints);
        }
      });
      footer.appendChild(goBtn);
      return;
    }

    const grid = h('div', { class: 'form-grid' });
    const editors = [];
    const editableCols = t.columns.filter(c => {
      if (isEdit) return !(t.primaryKeys.includes(c.name) && c.isIdentity);
      return !(c.isIdentity && c.identityGeneration === 'ALWAYS');
    });
    editableCols.forEach(c => {
      const init = isEdit ? row[c.name] : (c.isNullable ? null : undefined);
      const ed = fieldEditor(c, init);
      grid.appendChild(ed.element);
      editors.push({ col: c, ed });
    });
    body.appendChild(grid);

    const submitLabel = isEdit ? 'Save changes' : 'Create row';
    const goBtn = h('button', { class: 'btn btn-primary', type: 'button', text: submitLabel });
    goBtn.addEventListener('click', async () => {
      try {
        goBtn.disabled = true;
        const payload = {};
        for (const { col, ed } of editors) {
          const v = ed.readValue();
          if (v === undefined) {
            if (!col.isNullable && !col.hasDefault && !col.isIdentity) {
              const e = new Error(`Missing required value for ${col.name}.`);
              e.code = 'VALIDATION'; e.hints = [col.name + ' is NOT NULL and has no DEFAULT. Provide a value.'];
              throw e;
            }
            continue;
          }
          payload[col.name] = v;
        }
        if (isEdit) {
          await api('PUT', `/api/interpreter/tables/${encodeURIComponent(t.name)}/rows/${encodeURIComponent(rowKey)}`, payload);
        } else {
          await api('POST', `/api/interpreter/tables/${encodeURIComponent(t.name)}/rows`, payload);
        }
        setAlertDom(alertHost, 'success', isEdit ? 'Row updated' : 'Row created', '');
        setTimeout(() => { close(); renderTablePage(t); }, 500);
      } catch (e) {
        goBtn.disabled = false;
        if (e && e.status === 401 && /AUTH_/.test(e.code || '')) { signOut(); return close(); }
        const f = formatErrForAlert(e);
        setAlertDom(alertHost, 'danger', f.title, f.message, f.hints);
      }
    });
    footer.appendChild(goBtn);

    function close() {
      if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
      document.removeEventListener('keydown', escHandler);
    }
    function escHandler(e) { if (e.key === 'Escape') close(); }
    document.addEventListener('keydown', escHandler);
  }
  function openCreateModal(t) { openCrudModal('create', t, null, null); }
  function openEditModal(t, row, key) { openCrudModal('edit', t, row, key); }
  function openDeleteModal(t, row, key) { openCrudModal('delete', t, row, key); }

  // ---------- Boot ----------
  document.addEventListener('DOMContentLoaded', () => {
    if (state.sessionId) {
      api('GET', '/api/auth/session')
        .then(r => {
          state.user = { username: r.username, role: r.role };
          state.version = r.version || state.version;
          bootAppShell();
        })
        .catch(() => {
          state.sessionId = '';
          try { localStorage.removeItem('auth.sessionId'); } catch (_) {}
          renderLogin();
        });
    } else {
      renderLogin();
    }
  });
})();
