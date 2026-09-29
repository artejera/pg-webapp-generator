(function () {
  'use strict';

  // ---------- helpers ----------
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

  // ---------- state ----------
  const state = {
    connectionId: localStorage.getItem('pg.connId') || '',
    connection: null,
    schema: null,
    currentTable: null,
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
      if (res.status === 401) e.status = 401;
      e.status = res.status;
      throw e;
    }
    return data;
  }

  // ---------- dialog mode ----------
  // Open our shared credential dialog but inject mode + mode-aware submit.
  function openCredentialDialog(opts) {
    opts = opts || {};
    const initialValues = Object.assign({
      host: (state._saved && state._saved.host) || localStorage.getItem('pg.host') || 'localhost',
      port: (state._saved && state._saved.port) || Number(localStorage.getItem('pg.port')) || 5432,
      database: (state._saved && state._saved.database) || localStorage.getItem('pg.db') || '',
      user: (state._saved && state._saved.user) || localStorage.getItem('pg.user') || 'postgres',
      password: (opts && opts.reusePassword && state._saved && state._saved.password) ? state._saved.password : '',
      schema: (state._saved && state._saved.schema) || localStorage.getItem('pg.schema') || 'public',
      ssl: false,
    }, opts.initial || {});

    // Build the dialog shell.
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

    // Fields
    const hostInput = addField(body, 'hostname', 'Hostname', 'text', initialValues.host, 'localhost or db.example.com');
    const row2 = h('div', { class: 'form-group row2' });
    const portInput = addField(row2, 'port', 'Port', 'number', initialValues.port, 'Default 5432');
    const dbInput   = addField(row2, 'dbname', 'Database name', 'text', initialValues.database, 'e.g. mydb', true);
    body.appendChild(row2);
    const row3 = h('div', { class: 'form-group row2' });
    const userInput  = addField(row3, 'user', 'User', 'text', initialValues.user, '', true);
    const passInput  = addField(row3, 'pass', 'Password', 'password', initialValues.password, 'Never saved to disk permanently (only held in server memory)');
    body.appendChild(row3);

    const adv = h('details', { class: 'advanced' });
    adv.appendChild(h('summary', { text: 'Advanced options' }));
    const schemaInp = addField(adv, 'schema', 'Postgres schema', 'text', initialValues.schema, 'Usually "public"');
    const cbWrap = h('div', { style: 'margin-top:10px' });
    const sslCB = h('input', { type: 'checkbox', id: 'f-ssl' });
    sslCB.checked = !!initialValues.ssl;
    const sslWrap  = h('label', { class: 'check-row', style: 'display:flex;align-items:center;gap:8px;' }, sslCB, ' Require SSL (PGSSLMODE=require)');
    cbWrap.appendChild(sslWrap);
    adv.appendChild(cbWrap);
    body.appendChild(adv);

    const resultHost = h('div');
    body.appendChild(resultHost);

    footer.appendChild(h('button', { type: 'button', class: 'btn', onclick: close, text: 'Cancel' }));
    submitBtn = h('button', { type: 'button', class: 'btn btn-primary', onclick: onSubmit, text: 'Connect' });
    footer.appendChild(submitBtn);

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
      try {
        localStorage.setItem('pg.lastConnection', JSON.stringify(p));
      } catch (_) {}

      setSubmitting(true);
      setProgress(15, true);
      try {
        setProgress(45, true);
        const res = await api('POST', '/api/interpreter/connect', p);
        setProgress(100, true);
        state.connectionId = res.connectionId;
        state.connection = res.connection;
        localStorage.setItem('pg.connId', state.connectionId);
        setAlert('success', 'Connected',
          `Connected as ${res.connection.user}@${res.connection.host}:${res.connection.port}/${res.connection.database} — ${res.schemaTables.length} table(s) in schema ${res.connection.schema}.`);
        setProgress(0, false);
        setTimeout(() => { close(); afterInteractConnect(); }, 700);
      } catch (e) {
        setProgress(0, false);
        if (e && (e.status === 401 || e.code === 'NO_CONN')) {
          // Shouldn't happen on connect but handle anyway.
        }
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

    document.body.appendChild(backdrop);
    setTimeout(() => { dbInput.focus(); }, 20);
    return { close, open: () => null };
  }

  // ---------- Top-level flow ----------
  function setConnectedUi(connected, info) {
    const connEl = $('#conn');
    const pill = $('#conn-pill');
    const text = $('#conn-text');
    const btnConnect = $('#btn-connect');
    const btnDisconnect = $('#btn-disconnect');
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
  }

  function renderSidebar() {
    const list = $('#tables-list');
    list.innerHTML = '';
    if (!state.connection || !state.schema) {
      list.appendChild(h('li', {}, h('div', { class: 'empty-msg' },
        'Connect to a Postgres database to see the tables. ',
        h('br'),
        (() => { const a = h('a', { href: '#', text: 'Connect to Postgres' }); a.addEventListener('click', (e) => { e.preventDefault(); openCredentialDialog({ mode: 'interact' }); }); return a; })()
      )));
      return;
    }
    const tables = state.schema.tables || [];
    if (!tables.length) {
      list.appendChild(h('li', {}, h('div', { class: 'empty-msg' }, `No tables found in schema "${state.schema.schema}".`)));
      return;
    }
    tables.forEach((t) => {
      const a = h('a', { href: '#', class: state.currentTable === t.name ? 'active' : '' },
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
      return s;
    } catch (e) {
      if (e && (e.status === 401 || e.code === 'NO_CONN')) {
        // Lost session
        clearConnection();
      }
      throw e;
    }
  }

  async function afterInteractConnect() {
    setConnectedUi(true, state.connection);
    await loadSchema();
    renderSidebar();
    const hash = location.hash.replace(/^#/, '');
    const want = state.schema.tables.find(t => t.name === hash);
    if (want) { navigateToTable(want.name); }
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
    state.currentTable = null;
    try { localStorage.removeItem('pg.connId'); } catch (_) {}
    setConnectedUi(false);
    renderSidebar();
    renderWelcome();
  }

  function renderWelcome() {
    const content = $('#content');
    content.innerHTML = '';
    content.appendChild(h('div', { class: 'welcome', id: 'welcome-card' },
      h('h1', { text: 'Interact with Postgres tables live — no code generation' }),
      h('p', { class: 'lede',
        html: 'This is the <strong>DDL interpreter</strong> mode. Enter Postgres credentials, and we\'ll ' +
              'interpret the schema at runtime: one live page per table with pagination, ' +
              'Create / Update / Delete, and in-UI error banners — all without writing ' +
              'any generated files to disk.' }),
      h('h2', { text: 'Quick start' }),
      (() => {
        const a = h('a', { href: '#', class: 'btn btn-primary', style: 'margin-top:14px;display:inline-flex;' ,
          text: 'Connect to Postgres' });
        a.addEventListener('click', (e) => { e.preventDefault(); openCredentialDialog({ mode: 'interact' }); });
        return a;
      })(),
      h('ul', { style: 'margin-top:20px' },
        h('li', { html: 'Click <strong>Connect to Postgres</strong> at the top-right (or use the link in the sidebar) to enter credentials.' }),
        h('li', { html: 'The credential dialog has two modes — pick <strong>Interact live (no code generation)</strong>.' }),
        h('li', { text: 'After connecting, pick any table from the left sidebar to browse rows, modify, create, or delete.' }),
        h('li', { html: 'You can <em>re-enter credentials at any time</em> by clicking the connection pill or Connect to Postgres in the header — even while already connected.' }),
      )
    ));
  }

  // ---------- Table rendering (generic DDL interpreter page) ----------
  async function navigateToTable(name) {
    if (!state.schema) { await loadSchema(); renderSidebar(); }
    const t = (state.schema.tables || []).find(tt => tt.name === name);
    if (!t) { renderWelcome(); return; }
    state.currentTable = name;
    location.hash = encodeURIComponent(name);
    state.page = state.page || 1;
    state.pageSize = state.pageSize || 20;
    renderSidebar();
    await renderTablePage(t);
  }

  function formatErrForAlert(err) {
    return {
      title: err && err.code === 'NO_CONN' ? 'No active connection' :
             err && err.code === 'NO_TABLE' ? 'Unknown table' :
             err && /^4\d\d$|VALIDATION/.test(err.code) ? 'Request failed' :
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
      if (onChange) onChange(readValue(col, input, nullCB));
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
    const titleTxt = isDelete ? 'Delete row from ' + t.name :
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
          showAlert(alertHost, 'success', 'Row deleted', 'Row was removed from ' + t.name + '.');
          setTimeout(() => { close(); navigateToTable(t.name); }, 500);
        } catch (e) {
          goBtn.disabled = false;
          const f = formatErrForAlert(e);
          showAlert(alertHost, 'danger', f.title, f.message, f.hints);
        }
      });
      footer.appendChild(goBtn);
      return;
    }

    // Create or edit
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
    const goBtn = h('button', { class: 'btn ' + (isEdit ? 'btn-primary' : 'btn-primary'), type: 'button', text: submitLabel });
    goBtn.addEventListener('click', async () => {
      try {
        goBtn.disabled = true;
        const payload = {};
        for (const { col, ed } of editors) {
          const v = ed.readValue();
          if (v === undefined) {
            // Required but no value? only skip if server handles it (e.g. default/identity).
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
        showAlert(alertHost, 'success', isEdit ? 'Row updated' : 'Row created', '');
        setTimeout(() => { close(); navigateToTable(t.name); }, 500);
      } catch (e) {
        goBtn.disabled = false;
        const f = formatErrForAlert(e);
        showAlert(alertHost, 'danger', f.title, f.message, f.hints);
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

  // ---------- boot ----------
  async function boot() {
    setConnectedUi(false);
    renderSidebar();
    renderWelcome();

    // Bind top-right actions
    $('#btn-connect').addEventListener('click', () => {
      openCredentialDialog({
        mode: state.connectionId ? 'interact' : 'interact',
        reusePassword: !!state._saved,
      });
    });
    $('#conn-pill').addEventListener('click', () => {
      openCredentialDialog({ mode: 'interact', reusePassword: !!state._saved });
    });
    $('#btn-disconnect').addEventListener('click', async () => {
      try { await api('POST', '/api/interpreter/disconnect', {}); } catch (_) {}
      clearConnection();
    });
    const emptyConnect = $('#empty-connect');
    if (emptyConnect) emptyConnect.addEventListener('click', (e) => { e.preventDefault(); openCredentialDialog({ mode: 'interact' }); });

    // Try to restore session (if server still has it)
    if (state.connectionId) {
      try {
        const s = await api('GET', '/api/interpreter/status');
        if (s && s.connected && s.connection) {
          state.connection = s.connection;
          setConnectedUi(true, state.connection);
          await loadSchema();
          renderSidebar();
          const hash = location.hash.replace(/^#/, '');
          const tbl = (state.schema.tables || []).find(t => t.name === hash);
          if (tbl) { navigateToTable(tbl.name); }
          else if (state.schema.tables && state.schema.tables[0]) { navigateToTable(state.schema.tables[0].name); }
          return;
        }
      } catch (_) { /* ignore; just show welcome */ }
      clearConnection();
    }
    window.addEventListener('hashchange', () => {
      const n = location.hash.replace(/^#/, '');
      if (!n || !state.schema) return;
      const t = (state.schema.tables || []).find(tt => tt.name === n);
      if (t && state.currentTable !== n) navigateToTable(n);
    });
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
