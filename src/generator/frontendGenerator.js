'use strict';

const fs = require('fs');
const path = require('path');
const { classifyColumnType } = require('./schemaExtractor');

function generateStylesCss() {
  return `:root {
  --color-bg: #f6f8fa;
  --color-surface: #ffffff;
  --color-border: #d0d7de;
  --color-border-strong: #afb8c1;
  --color-text: #1f2328;
  --color-muted: #6e7781;
  --color-primary: #0969da;
  --color-primary-hover: #0550ae;
  --color-danger: #cf222e;
  --color-danger-hover: #a40e26;
  --color-success: #1a7f37;
  --color-warning: #9a6700;
  --radius: 6px;
  --shadow-sm: 0 1px 2px rgba(0,0,0,0.05);
  --shadow-md: 0 4px 12px rgba(0,0,0,0.1);
}

* { box-sizing: border-box; }

html, body {
  margin: 0;
  padding: 0;
  background: var(--color-bg);
  color: var(--color-text);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica,
               Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji";
  font-size: 14px;
  line-height: 1.5;
}

a { color: var(--color-primary); text-decoration: none; }
a:hover { text-decoration: underline; }

.container { max-width: 1200px; margin: 0 auto; padding: 24px 16px; }

.site-header {
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
  padding: 16px 0;
  margin-bottom: 24px;
}
.site-header .container { padding: 0 16px; }
.site-header h1 { margin: 0; font-size: 20px; }
.site-header p  { margin: 4px 0 0; color: var(--color-muted); font-size: 13px; }

.page-header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
  gap: 12px;
}
.page-header h2 { margin: 0; font-size: 18px; }

.card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  padding: 16px;
  box-shadow: var(--shadow-sm);
}

.table-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 16px;
}
.table-list a.card {
  display: block;
  color: inherit;
  text-decoration: none;
  transition: transform 0.1s, box-shadow 0.1s;
}
.table-list a.card:hover {
  transform: translateY(-1px);
  box-shadow: var(--shadow-md);
  border-color: var(--color-primary);
}
.table-list .meta { color: var(--color-muted); font-size: 12px; margin-top: 6px; }
.table-list .tag {
  display: inline-block;
  background: #ddf4ff;
  color: #0550ae;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  margin-right: 4px;
}
.table-list .tag.muted { background: #eaeef2; color: var(--color-muted); }

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 6px 12px;
  border-radius: var(--radius);
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.1s, border-color 0.1s, color 0.1s;
  line-height: 1.2;
}
.btn:hover { background: #f3f4f6; }
.btn:disabled { opacity: 0.4; cursor: not-allowed; }

.btn-primary {
  background: var(--color-primary);
  border-color: var(--color-primary);
  color: #fff;
}
.btn-primary:hover { background: var(--color-primary-hover); border-color: var(--color-primary-hover); }

.btn-danger {
  background: var(--color-danger);
  border-color: var(--color-danger);
  color: #fff;
}
.btn-danger:hover { background: var(--color-danger-hover); border-color: var(--color-danger-hover); }

.btn-ghost {
  background: transparent;
  border-color: transparent;
  color: var(--color-primary);
  padding: 4px 8px;
}
.btn-ghost:hover { background: #ddf4ff; border-color: transparent; }
.btn-ghost.danger { color: var(--color-danger); }
.btn-ghost.danger:hover { background: #ffebe9; }

.btn-sm { padding: 3px 8px; font-size: 12px; }

.table-wrap {
  overflow-x: auto;
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  background: var(--color-surface);
}
table.data {
  width: 100%;
  border-collapse: collapse;
  min-width: 640px;
}
table.data th, table.data td {
  padding: 8px 12px;
  text-align: left;
  border-bottom: 1px solid var(--color-border);
  vertical-align: top;
  font-size: 13px;
}
table.data th {
  background: #f6f8fa;
  font-weight: 600;
  color: var(--color-text);
  position: sticky;
  top: 0;
}
table.data tr:last-child td { border-bottom: none; }
table.data tr:hover td { background: #f6f8fa; }
table.data td.pk { font-weight: 600; }
table.data td.null { color: var(--color-muted); font-style: italic; }
table.data .row-actions {
  white-space: nowrap;
  display: flex;
  gap: 4px;
  justify-content: flex-end;
}

.pagination {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 16px;
  padding: 12px 0 0;
}
.pagination .pages {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
}
.pagination .pages .btn {
  min-width: 34px;
}
.pagination .pages .btn.active {
  background: var(--color-primary);
  border-color: var(--color-primary);
  color: #fff;
}
.pagination .info { color: var(--color-muted); font-size: 13px; }

.alert {
  padding: 12px 16px;
  border-radius: var(--radius);
  border: 1px solid transparent;
  margin-bottom: 16px;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
}
.alert.alert-danger {
  background: #ffebe9;
  border-color: #ffcecb;
  color: var(--color-danger);
}
.alert.alert-success {
  background: #dafbe1;
  border-color: #b7f0c2;
  color: var(--color-success);
}
.alert .alert-body { flex: 1; }
.alert .alert-body .alert-title { font-weight: 600; margin-bottom: 4px; }
.alert .alert-body .alert-detail { font-size: 13px; white-space: pre-wrap; word-break: break-word; }
.alert .close {
  background: transparent;
  border: none;
  cursor: pointer;
  font-size: 18px;
  line-height: 1;
  color: inherit;
  opacity: 0.7;
}
.alert .close:hover { opacity: 1; }

.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  padding: 16px;
}
.modal {
  background: var(--color-surface);
  border-radius: var(--radius);
  box-shadow: var(--shadow-md);
  width: 100%;
  max-width: 640px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--color-border);
}
.modal-header {
  padding: 16px 20px;
  border-bottom: 1px solid var(--color-border);
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.modal-header h3 { margin: 0; font-size: 16px; }
.modal-body {
  padding: 20px;
  overflow-y: auto;
}
.modal-footer {
  padding: 12px 20px;
  border-top: 1px solid var(--color-border);
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.form-group { margin-bottom: 14px; }
.form-group label {
  display: block;
  font-weight: 600;
  margin-bottom: 4px;
  font-size: 13px;
}
.form-group label .req { color: var(--color-danger); margin-left: 2px; }
.form-group label .col-type {
  font-weight: normal;
  color: var(--color-muted);
  font-size: 11px;
  margin-left: 6px;
}
.form-group .hint {
  display: block;
  font-size: 12px;
  color: var(--color-muted);
  margin-top: 4px;
}
.form-control {
  width: 100%;
  padding: 6px 10px;
  border-radius: var(--radius);
  border: 1px solid var(--color-border);
  font-size: 13px;
  font-family: inherit;
  background: var(--color-surface);
  color: var(--color-text);
  transition: border-color 0.1s, box-shadow 0.1s;
}
.form-control:focus {
  outline: none;
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px rgba(9, 105, 218, 0.15);
}
textarea.form-control { min-height: 80px; resize: vertical; }
select.form-control   { min-height: 30px; }

.form-group.has-error .form-control {
  border-color: var(--color-danger);
  background: #fff8f6;
}
.form-group .field-error {
  color: var(--color-danger);
  font-size: 12px;
  margin-top: 4px;
}

.null-toggle {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-top: 6px;
  font-size: 12px;
  color: var(--color-muted);
}

.breadcrumb {
  font-size: 13px;
  color: var(--color-muted);
  margin-bottom: 12px;
}
.breadcrumb a { color: var(--color-muted); }
.breadcrumb a:hover { color: var(--color-primary); }
.breadcrumb .sep { margin: 0 6px; }

.placeholder {
  text-align: center;
  padding: 40px 20px;
  color: var(--color-muted);
}

.spinner {
  display: inline-block;
  width: 14px;
  height: 14px;
  border: 2px solid rgba(0,0,0,0.15);
  border-top-color: var(--color-primary);
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

@media (max-width: 640px) {
  .container { padding: 16px 12px; }
  .site-header h1 { font-size: 18px; }
  .pagination { flex-direction: column; align-items: stretch; }
  .pagination .pages { justify-content: center; }
}
`;
}

function generateAppJs(schema) {
  const tablesMeta = schema.tables.map((t) => ({
    name: t.name,
    columns: t.columns.map((c) => ({
      name: c.name,
      isNullable: c.isNullable,
      hasDefault: c.hasDefault,
      isIdentity: c.isIdentity,
      dataType: c.dataType,
      typeClass: classifyColumnType(c),
      maxLength: c.maxLength,
      numericPrecision: c.numericPrecision,
    })),
    primaryKeys: t.primaryKeys,
    effectiveKeys: t.effectiveKeys,
    hasExplicitPk: t.hasExplicitPk,
  }));

  return `/* Auto-generated shared client code */
(function () {
  'use strict';

  var SCHEMA = ${JSON.stringify(tablesMeta, null, 2)};

  function findTable(name) {
    for (var i = 0; i < SCHEMA.length; i++) {
      if (SCHEMA[i].name === name) return SCHEMA[i];
    }
    return null;
  }

  function encodeKey(keyCols, values) {
    if (!keyCols.length) return '';
    return keyCols
      .map(function (c) {
        var v = values == null ? '' : values[c];
        if (v === null || v === undefined) return '';
        return encodeURIComponent(String(v));
      })
      .join('|');
  }

  async function fetchJSON(url, options) {
    var opts = options || {};
    opts.headers = opts.headers || {};
    if (opts.body !== undefined && typeof opts.body !== 'string' && !(opts.body instanceof FormData)) {
      opts.body = JSON.stringify(opts.body);
      opts.headers['Content-Type'] = 'application/json';
    }
    var res;
    try {
      res = await fetch(url, opts);
    } catch (e) {
      var netErr = new Error('Network error: ' + (e && e.message ? e.message : String(e)));
      netErr.detail = 'Could not reach the server. It may be offline or CORS-blocked.';
      throw netErr;
    }
    var body = null;
    try {
      body = await res.json();
    } catch (_) {
      body = null;
    }
    if (!res.ok) {
      var msg = (body && body.error) ? body.error : ('HTTP ' + res.status);
      var err = new Error(msg);
      if (body && body.detail) err.detail = body.detail;
      if (body && body.hint)   err.hint   = body.hint;
      if (body && body.code)   err.code   = body.code;
      if (body && body.column) err.column = body.column;
      err.status = res.status;
      throw err;
    }
    return body;
  }

  function displayValue(val, typeClass) {
    if (val === null || val === undefined) return { text: 'NULL', isNull: true };
    if (typeClass === 'binary') {
      var s = typeof val === 'string' ? val : (val && val.data ? window.btoa(String.fromCharCode.apply(null, val.data)) : '');
      return { text: (s.length > 40 ? s.slice(0, 40) + '…' : s) || '(binary)', isBinary: true };
    }
    if (typeClass === 'json') {
      try {
        var pretty = typeof val === 'string' ? val : JSON.stringify(val);
        if (pretty.length > 80) pretty = pretty.slice(0, 80) + '…';
        return { text: pretty, isJson: true };
      } catch (e) {
        return { text: String(val) };
      }
    }
    if (typeof val === 'boolean') return { text: val ? 'true' : 'false', isBool: true };
    if (val instanceof Date) return { text: val.toISOString() };
    return { text: String(val) };
  }

  function buildAlertBox(kind, title, message, detail) {
    var div = document.createElement('div');
    div.className = 'alert alert-' + kind;
    var body = document.createElement('div');
    body.className = 'alert-body';
    var t = document.createElement('div');
    t.className = 'alert-title';
    t.textContent = title || (kind === 'danger' ? 'Error' : 'Success');
    body.appendChild(t);
    if (message) {
      var m = document.createElement('div');
      m.className = 'alert-detail';
      m.textContent = message;
      body.appendChild(m);
    }
    if (detail) {
      var d = document.createElement('div');
      d.className = 'alert-detail';
      d.style.marginTop = '6px';
      d.style.fontSize = '12px';
      d.textContent = detail;
      body.appendChild(d);
    }
    div.appendChild(body);
    var close = document.createElement('button');
    close.type = 'button';
    close.className = 'close';
    close.innerHTML = '&times;';
    close.title = 'Dismiss';
    close.addEventListener('click', function () { div.remove(); });
    div.appendChild(close);
    return div;
  }

  function insertAlert(container, kind, title, message, detail) {
    clearAlerts(container);
    container.prepend(buildAlertBox(kind, title, message, detail));
  }

  function clearAlerts(container) {
    var nodes = container.querySelectorAll(':scope > .alert');
    for (var i = 0; i < nodes.length; i++) nodes[i].remove();
  }

  function renderPagination(total, limit, offset, onChange) {
    var wrap = document.createElement('div');
    wrap.className = 'pagination';

    var info = document.createElement('div');
    info.className = 'info';
    var start = total === 0 ? 0 : offset + 1;
    var end   = Math.min(total, offset + limit);
    info.textContent = 'Showing ' + start + '–' + end + ' of ' + total + ' rows';

    var pages = document.createElement('div');
    pages.className = 'pages';
    var totalPages = Math.max(1, Math.ceil(total / limit));
    var currentPage = Math.floor(offset / limit) + 1;
    currentPage = Math.min(currentPage, totalPages);

    var prev = document.createElement('button');
    prev.className = 'btn btn-sm';
    prev.type = 'button';
    prev.textContent = '← Prev';
    prev.disabled = currentPage === 1;
    prev.addEventListener('click', function () {
      onChange((currentPage - 2) * limit);
    });
    pages.appendChild(prev);

    var pageNumbers = pickPages(currentPage, totalPages);
    pageNumbers.forEach(function (p) {
      if (p === '…') {
        var span = document.createElement('span');
        span.textContent = ' … ';
        span.style.color = 'var(--color-muted)';
        pages.appendChild(span);
        return;
      }
      var btn = document.createElement('button');
      btn.className = 'btn btn-sm' + (p === currentPage ? ' active' : '');
      btn.type = 'button';
      btn.textContent = String(p);
      btn.addEventListener('click', function () { onChange((p - 1) * limit); });
      pages.appendChild(btn);
    });

    var next = document.createElement('button');
    next.className = 'btn btn-sm';
    next.type = 'button';
    next.textContent = 'Next →';
    next.disabled = currentPage === totalPages;
    next.addEventListener('click', function () { onChange(currentPage * limit); });
    pages.appendChild(next);

    var limitBox = document.createElement('select');
    limitBox.className = 'form-control btn-sm';
    limitBox.style.width = 'auto';
    [10, 20, 50, 100].forEach(function (n) {
      var opt = document.createElement('option');
      opt.value = String(n);
      opt.textContent = n + ' / page';
      if (n === limit) opt.selected = true;
      limitBox.appendChild(opt);
    });
    limitBox.addEventListener('change', function () {
      onChange(0, Number(limitBox.value));
    });

    wrap.appendChild(info);
    pages.appendChild(limitBox);
    wrap.appendChild(pages);

    return wrap;
  }

  function pickPages(current, total) {
    var out = [];
    if (total <= 7) {
      for (var i = 1; i <= total; i++) out.push(i);
      return out;
    }
    out.push(1);
    if (current > 3) out.push('…');
    var s = Math.max(2, current - 1);
    var e = Math.min(total - 1, current + 1);
    for (var j = s; j <= e; j++) out.push(j);
    if (current < total - 2) out.push('…');
    out.push(total);
    return out;
  }

  function openModal(title, formFields, initialValues, onSubmit) {
    return new Promise(function (resolve) {
      var backdrop = document.createElement('div');
      backdrop.className = 'modal-backdrop';
      var modal = document.createElement('div');
      modal.className = 'modal';
      var header = document.createElement('div');
      header.className = 'modal-header';
      var h3 = document.createElement('h3');
      h3.textContent = title;
      var closeX = document.createElement('button');
      closeX.type = 'button';
      closeX.className = 'close';
      closeX.innerHTML = '&times;';
      header.appendChild(h3);
      header.appendChild(closeX);
      var body = document.createElement('div');
      body.className = 'modal-body';
      var footer = document.createElement('div');
      footer.className = 'modal-footer';
      var cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.className = 'btn';
      cancel.textContent = 'Cancel';
      var submit = document.createElement('button');
      submit.type = 'button';
      submit.className = 'btn btn-primary';
      submit.textContent = 'Save';
      footer.appendChild(cancel);
      footer.appendChild(submit);
      modal.appendChild(header);
      modal.appendChild(body);
      modal.appendChild(footer);
      backdrop.appendChild(modal);

      var fieldMap = buildFormFields(body, formFields, initialValues || {});
      body.prepend(buildAlertHolder());

      function close() {
        if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
        resolve(null);
      }
      function submitForm() {
        submit.disabled = true;
        submit.textContent = 'Saving…';
        try {
          var values = readFormValues(fieldMap, formFields);
          Promise.resolve(onSubmit(values, fieldMap.alertHolder, setFieldError))
            .then(function (result) {
              if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
              resolve(result);
            })
            .catch(function (err) {
              clearAlerts(fieldMap.alertHolder);
              if (err && err.column) {
                setFieldError(err.column, (err.detail || err.message));
              }
              fieldMap.alertHolder.appendChild(
                buildAlertBox('danger', 'Could not save', err && err.message || String(err), err && err.detail)
              );
              submit.disabled = false;
              submit.textContent = 'Save';
            });
        } catch (err) {
          clearAlerts(fieldMap.alertHolder);
          fieldMap.alertHolder.appendChild(
            buildAlertBox('danger', 'Validation failed', err && err.message || String(err))
          );
          submit.disabled = false;
          submit.textContent = 'Save';
        }
      }
      function setFieldError(fieldName, msg) {
        var entry = fieldMap[fieldName];
        if (!entry) return;
        entry.group.classList.add('has-error');
        entry.err.textContent = msg || '';
      }

      closeX.addEventListener('click', close);
      cancel.addEventListener('click', close);
      submit.addEventListener('click', submitForm);
      backdrop.addEventListener('click', function (e) {
        if (e.target === backdrop) close();
      });
      document.addEventListener('keydown', function onKey(e) {
        if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onKey); }
      });
      document.body.appendChild(backdrop);
      setTimeout(function () {
        var firstEl = body.querySelector('.form-control');
        if (firstEl) firstEl.focus();
      }, 0);
    });
  }

  function buildAlertHolder() {
    var d = document.createElement('div');
    d.className = 'alert-holder';
    return d;
  }

  function buildFormFields(container, fields, initialValues) {
    var map = {};
    map.alertHolder = buildAlertHolder();
    fields.forEach(function (f) {
      var group = document.createElement('div');
      group.className = 'form-group';
      var label = document.createElement('label');
      label.setAttribute('for', 'fld-' + f.name);
      var labelText = document.createTextNode(f.label || f.name);
      label.appendChild(labelText);
      if (!f.isNullable && !f.hasDefault) {
        var req = document.createElement('span');
        req.className = 'req';
        req.textContent = '*';
        label.appendChild(req);
      }
      if (f.dataType) {
        var dt = document.createElement('span');
        dt.className = 'col-type';
        dt.textContent = '(' + f.dataType + ')';
        label.appendChild(dt);
      }
      group.appendChild(label);

      var control = createFormControl(f);
      control.id = 'fld-' + f.name;
      group.appendChild(control);

      var hadInitial = Object.prototype.hasOwnProperty.call(initialValues, f.name);
      var initialVal = initialValues[f.name];
      if (hadInitial && initialVal !== null && initialVal !== undefined) {
        try {
          if (control.tagName === 'SELECT') {
            var selVal = String(initialVal);
            var hasOpt = Array.prototype.some.call(control.options, function (o) { return o.value === selVal; });
            if (hasOpt) control.value = selVal;
          } else if (control.type === 'checkbox') {
            control.checked = !!initialVal;
          } else {
            control.value = String(initialVal);
          }
        } catch (_) {}
      } else if (!hadInitial) {
        if (f.typeClass === 'boolean' && !f.isNullable && !f.hasDefault) {
          try { control.value = 'false'; } catch (_) {}
        }
      }

      var row = document.createElement('div');
      var fieldErr = document.createElement('div');
      fieldErr.className = 'field-error';
      group.appendChild(fieldErr);

      if (f.isNullable && !f.isIdentity) {
        var nt = document.createElement('div');
        nt.className = 'null-toggle';
        var cb = document.createElement('input');
        cb.type = 'checkbox';
        var isNull = hadInitial && initialVal === null;
        cb.checked = isNull;
        var lab = document.createElement('span');
        lab.textContent = 'Set to NULL';
        nt.appendChild(cb);
        nt.appendChild(lab);
        row.appendChild(nt);
        control.disabled = isNull;
        cb.addEventListener('change', function () {
          control.disabled = cb.checked;
          if (cb.checked) {
            try { if (control.tagName === 'SELECT') control.value = ''; else control.value = ''; } catch (_) {}
          }
        });
        map[f.name + '__null'] = cb;
      }

      if (f.hint) {
        var h = document.createElement('span');
        h.className = 'hint';
        h.textContent = f.hint;
        row.appendChild(h);
      }
      if (row.children.length) group.appendChild(row);

      container.appendChild(group);
      map[f.name] = { group: group, control: control, err: fieldErr };
    });
    return map;
  }

  function createFormControl(f) {
    var tc = f.typeClass || 'text';
    if (f.isIdentity) {
      var i = document.createElement('input');
      i.type = 'text';
      i.className = 'form-control';
      i.disabled = true;
      i.value = (f.default != null ? String(f.default) : '(auto-generated)');
      return i;
    }
    switch (tc) {
      case 'boolean': {
        var s = document.createElement('select');
        s.className = 'form-control';
        if (f.isNullable) addOption(s, '', '(not set)');
        addOption(s, 'true', 'true');
        addOption(s, 'false', 'false');
        return s;
      }
      case 'integer':
      case 'number':
      case 'uuid': {
        var inp = document.createElement('input');
        inp.type = tc === 'integer' || tc === 'number' ? 'number' : 'text';
        inp.className = 'form-control';
        if (f.maxLength) inp.maxLength = f.maxLength;
        if (tc === 'integer') inp.step = '1';
        if (tc === 'number'  && f.numericPrecision) inp.step = 'any';
        return inp;
      }
      case 'datetime': {
        var dt = document.createElement('input');
        dt.type = 'datetime-local';
        dt.className = 'form-control';
        return dt;
      }
      case 'json': {
        var ta = document.createElement('textarea');
        ta.className = 'form-control';
        ta.placeholder = '{"key": "value"}  — valid JSON';
        return ta;
      }
      case 'binary': {
        var txb = document.createElement('textarea');
        txb.className = 'form-control';
        txb.placeholder = 'base64 or hex encoded bytes';
        return txb;
      }
      case 'text':
      default: {
        if ((f.maxLength || 0) > 255 || !f.maxLength) {
          var ta2 = document.createElement('textarea');
          ta2.className = 'form-control';
          if (f.maxLength) ta2.maxLength = f.maxLength;
          return ta2;
        }
        var inp2 = document.createElement('input');
        inp2.type = 'text';
        inp2.className = 'form-control';
        inp2.maxLength = f.maxLength || -1;
        return inp2;
      }
    }
  }

  function addOption(sel, value, label) {
    var o = document.createElement('option');
    o.value = value;
    o.textContent = label;
    sel.appendChild(o);
    return o;
  }

  function readFormValues(fieldMap, formFields) {
    var out = {};
    formFields.forEach(function (f) {
      if (f.isIdentity) return;
      var entry = fieldMap[f.name];
      var nullCb = fieldMap[f.name + '__null'];
      if (nullCb && nullCb.checked) {
        out[f.name] = null;
        return;
      }
      var raw = entry.control.value;
      if (entry.control.tagName === 'SELECT' && raw === '' && !f.isNullable && !f.hasDefault) {
        // let the DB validate; skip to allow default
      }
      out[f.name] = coerceValue(raw, f);
    });
    return out;
  }

  function coerceValue(raw, f) {
    var tc = f.typeClass || 'text';
    if (raw === '' || raw === undefined || raw === null) {
      if (f.isNullable) return null;
      return raw === '' ? '' : raw;
    }
    switch (tc) {
      case 'integer': {
        var n = parseInt(raw, 10);
        if (isNaN(n)) throw new Error('Field "' + (f.label || f.name) + '" must be an integer.');
        return n;
      }
      case 'number': {
        var fl = parseFloat(raw);
        if (isNaN(fl)) throw new Error('Field "' + (f.label || f.name) + '" must be a number.');
        return fl;
      }
      case 'boolean':
        return raw === 'true' ? true : (raw === 'false' ? false : (raw ? true : false));
      case 'json':
        try { return JSON.parse(raw); }
        catch (e) { throw new Error('Field "' + (f.label || f.name) + '" has invalid JSON: ' + e.message); }
      case 'binary': {
        // Accept base64 or hex; store as text string in form "base64:xxx" and let the
        // backend decode via decode() if configured. Default: pass raw text through.
        return raw;
      }
      case 'datetime': {
        if (typeof raw === 'string' && raw.length === 16) {
          // "YYYY-MM-DDTHH:mm" → append ":00" and tz
          return raw + ':00';
        }
        return raw;
      }
      default:
        return raw;
    }
  }

  function confirmDialog(title, message, confirmText, danger) {
    return new Promise(function (resolve) {
      var backdrop = document.createElement('div');
      backdrop.className = 'modal-backdrop';
      var modal = document.createElement('div');
      modal.className = 'modal';
      modal.style.maxWidth = '440px';
      var header = document.createElement('div');
      header.className = 'modal-header';
      var h3 = document.createElement('h3');
      h3.textContent = title || 'Confirm';
      header.appendChild(h3);
      var body = document.createElement('div');
      body.className = 'modal-body';
      var p = document.createElement('p');
      p.textContent = message || 'Are you sure?';
      body.appendChild(p);
      var footer = document.createElement('div');
      footer.className = 'modal-footer';
      var cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.className = 'btn';
      cancel.textContent = 'Cancel';
      var ok = document.createElement('button');
      ok.type = 'button';
      ok.className = 'btn ' + (danger ? 'btn-danger' : 'btn-primary');
      ok.textContent = confirmText || 'OK';
      footer.appendChild(cancel);
      footer.appendChild(ok);
      modal.appendChild(header);
      modal.appendChild(body);
      modal.appendChild(footer);
      backdrop.appendChild(modal);
      document.body.appendChild(backdrop);
      function done(result) {
        if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
        resolve(result);
      }
      cancel.addEventListener('click', function () { done(false); });
      ok.addEventListener('click', function () { done(true); });
      backdrop.addEventListener('click', function (e) {
        if (e.target === backdrop) done(false);
      });
      ok.focus();
    });
  }

  function loadTablesIndex(targetEl) {
    targetEl.innerHTML = '<div class="placeholder"><div class="spinner"></div><div style="margin-top:8px">Loading tables…</div></div>';
    fetchJSON('/api/tables')
      .then(function (data) {
        renderTablesIndex(targetEl, data && data.tables || []);
      })
      .catch(function (err) {
        targetEl.innerHTML = '';
        targetEl.appendChild(buildAlertBox('danger', 'Could not load tables', err.message, err.detail));
      });
  }

  function renderTablesIndex(targetEl, tables) {
    targetEl.innerHTML = '';
    if (!tables.length) {
      targetEl.innerHTML = '<div class="card placeholder">No tables found.</div>';
      return;
    }
    var list = document.createElement('div');
    list.className = 'table-list';
    tables.forEach(function (t) {
      var a = document.createElement('a');
      a.className = 'card';
      a.href = t.url;
      var title = document.createElement('div');
      title.style.fontWeight = '600';
      title.textContent = t.name;
      a.appendChild(title);
      var meta = document.createElement('div');
      meta.className = 'meta';
      var t1 = document.createElement('span');
      t1.className = 'tag';
      t1.textContent = t.columns + ' cols';
      meta.appendChild(t1);
      if (t.primaryKeys && t.primaryKeys.length) {
        var t2 = document.createElement('span');
        t2.className = 'tag';
        t2.textContent = 'PK: ' + t.primaryKeys.join(',');
        meta.appendChild(t2);
      } else {
        var t3 = document.createElement('span');
        t3.className = 'tag muted';
        t3.textContent = 'no explicit PK';
        meta.appendChild(t3);
      }
      a.appendChild(meta);
      list.appendChild(a);
    });
    targetEl.appendChild(list);
  }

  window.App = {
    SCHEMA: SCHEMA,
    findTable: findTable,
    encodeKey: encodeKey,
    fetchJSON: fetchJSON,
    displayValue: displayValue,
    buildAlertBox: buildAlertBox,
    insertAlert: insertAlert,
    clearAlerts: clearAlerts,
    renderPagination: renderPagination,
    openModal: openModal,
    confirmDialog: confirmDialog,
    loadTablesIndex: loadTablesIndex,
    renderTablesIndex: renderTablesIndex,
    classifyColumnType: function (c) { return c.typeClass || 'text'; },
  };
})();
`;
}

function generateIndexHtml(schema) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Generated Webapp · Overview</title>
<link rel="stylesheet" href="css/styles.css" />
</head>
<body>
  <header class="site-header">
    <div class="container">
      <h1>Generated PostgreSQL Webapp</h1>
      <p>
        Database <code>${escapeHtml(schema.conn.database || '')}</code>
        on <code>${escapeHtml(schema.conn.host || '')}:${escapeHtml(String(schema.conn.port || ''))}</code>
        · schema <code>${escapeHtml(schema.schema || 'public')}</code>
        · generated ${escapeHtml(schema.generatedAt || '')}
      </p>
    </div>
  </header>
  <main class="container">
    <div class="page-header">
      <h2>Tables</h2>
      <div>
        <a class="btn" href="api/tables" target="_blank" rel="noopener">View API</a>
        <a class="btn" href="api/health" target="_blank" rel="noopener">Health</a>
      </div>
    </div>
    <div id="alert-root"></div>
    <div id="tables-root"></div>
  </main>
  <script src="js/app.js"></script>
  <script>
    (function () {
      App.loadTablesIndex(document.getElementById('tables-root'));
    })();
  </script>
</body>
</html>
`;
}

function generateTablePageHtml(table, schema) {
  const colHeaders = table.columns.map((c) => `<th>${escapeHtml(c.name)}</th>`).join('');
  const title = `${table.schema}.${table.name}`;
  const meta = table.hasExplicitPk
    ? `PK: ${table.primaryKeys.map((k) => escapeHtml(k)).join(', ')}`
    : 'no explicit primary key — edit/delete disabled';
  const disabledFlag = table.hasExplicitPk ? 'false' : 'true';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${escapeHtml(table.name)} · Generated Webapp</title>
<link rel="stylesheet" href="../css/styles.css" />
</head>
<body>
  <header class="site-header">
    <div class="container">
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(meta)} · ${table.columns.length} column${table.columns.length === 1 ? '' : 's'}</p>
    </div>
  </header>
  <main class="container">
    <div class="breadcrumb">
      <a href="../index.html">&larr; All tables</a>
    </div>
    <div class="page-header">
      <h2>Rows in <code>${escapeHtml(table.name)}</code></h2>
      <div>
        <button id="btn-new" class="btn btn-primary"${table.hasExplicitPk ? '' : ' disabled title="No primary key: create not recommended"'}>+ New Row</button>
      </div>
    </div>
    <div id="alert-root"></div>
    <div class="card">
      <div id="table-wrap">
        <div class="placeholder"><div class="spinner"></div><div style="margin-top:8px">Loading rows…</div></div>
      </div>
      <div id="pagination-wrap"></div>
    </div>
  </main>
  <script src="../js/app.js"></script>
  <script>
    (function () {
      var TABLE_NAME = ${JSON.stringify(table.name)};
      var EDIT_DELETE_DISABLED = ${disabledFlag};
      var TABLE_DEF = App.findTable(TABLE_NAME);
      var KEY_COLS = TABLE_DEF.primaryKeys.length ? TABLE_DEF.primaryKeys : TABLE_DEF.effectiveKeys;

      var state = {
        limit: 20,
        offset: 0,
        total: 0,
      };

      var tableWrap   = document.getElementById('table-wrap');
      var paginationWrap = document.getElementById('pagination-wrap');
      var alertRoot   = document.getElementById('alert-root');
      var newBtn      = document.getElementById('btn-new');

      function renderTable(data) {
        tableWrap.innerHTML = '';
        var wrap = document.createElement('div');
        wrap.className = 'table-wrap';
        var t = document.createElement('table');
        t.className = 'data';
        var thead = document.createElement('thead');
        var trH = document.createElement('tr');
        TABLE_DEF.columns.forEach(function (c) {
          var th = document.createElement('th');
          th.textContent = c.name;
          if (TABLE_DEF.primaryKeys.indexOf(c.name) !== -1) {
            th.title = 'Primary key';
            th.style.textDecoration = 'underline dotted';
          }
          trH.appendChild(th);
        });
        var thActions = document.createElement('th');
        thActions.style.textAlign = 'right';
        thActions.textContent = 'Actions';
        trH.appendChild(thActions);
        thead.appendChild(trH);
        t.appendChild(thead);
        var tbody = document.createElement('tbody');
        if (!data.rows.length) {
          var trEmpty = document.createElement('tr');
          var td = document.createElement('td');
          td.colSpan = TABLE_DEF.columns.length + 1;
          td.className = 'placeholder';
          td.style.padding = '32px 16px';
          td.textContent = 'No rows on this page.';
          trEmpty.appendChild(td);
          tbody.appendChild(trEmpty);
        } else {
          data.rows.forEach(function (row) {
            var tr = document.createElement('tr');
            TABLE_DEF.columns.forEach(function (c) {
              var td = document.createElement('td');
              var dv = App.displayValue(row[c.name], c.typeClass);
              if (dv.isNull) {
                td.className = 'null';
                td.textContent = 'NULL';
              } else if (dv.isBool) {
                td.textContent = dv.text;
                td.style.color = dv.text === 'true' ? 'var(--color-success)' : 'var(--color-muted)';
              } else {
                td.textContent = dv.text;
                if (TABLE_DEF.primaryKeys.indexOf(c.name) !== -1) td.classList.add('pk');
              }
              tr.appendChild(td);
            });
            var tdAct = document.createElement('td');
            tdAct.className = 'row-actions';
            var key = App.encodeKey(KEY_COLS, row);
            if (!EDIT_DELETE_DISABLED) {
              var edit = document.createElement('button');
              edit.type = 'button';
              edit.className = 'btn-ghost btn-sm';
              edit.textContent = 'Edit';
              edit.addEventListener('click', function () { openEdit(row, key); });
              var del = document.createElement('button');
              del.type = 'button';
              del.className = 'btn-ghost btn-sm danger';
              del.textContent = 'Delete';
              del.addEventListener('click', function () { doDelete(key, row); });
              tdAct.appendChild(edit);
              tdAct.appendChild(del);
            } else {
              var muted = document.createElement('span');
              muted.style.color = 'var(--color-muted)';
              muted.style.fontSize = '12px';
              muted.textContent = '—';
              tdAct.appendChild(muted);
            }
            tr.appendChild(tdAct);
            tbody.appendChild(tr);
          });
        }
        t.appendChild(tbody);
        wrap.appendChild(t);
        tableWrap.appendChild(wrap);

        paginationWrap.innerHTML = '';
        var pg = App.renderPagination(data.total, data.pageSize, state.offset, function (newOffset, newLimit) {
          if (typeof newLimit === 'number') state.limit = newLimit;
          state.offset = newOffset;
          load();
        });
        paginationWrap.appendChild(pg);
      }

      function load() {
        App.clearAlerts(alertRoot);
        var url = '/api/tables/' + encodeURIComponent(TABLE_NAME) +
                  '?limit=' + encodeURIComponent(state.limit) +
                  '&offset=' + encodeURIComponent(state.offset);
        tableWrap.innerHTML = '<div class="placeholder"><div class="spinner"></div></div>';
        App.fetchJSON(url)
          .then(function (data) {
            state.total = data.total;
            renderTable(data);
          })
          .catch(function (err) {
            tableWrap.innerHTML = '';
            App.insertAlert(alertRoot, 'danger', 'Failed to load rows', err.message, err.detail);
          });
      }

      function buildFormFields(editing) {
        return TABLE_DEF.columns.map(function (c) {
          return {
            name: c.name,
            label: c.name,
            dataType: c.dataType,
            typeClass: c.typeClass,
            isNullable: c.isNullable,
            hasDefault: c.hasDefault,
            isIdentity: c.isIdentity,
            default: c.isIdentity ? '(auto-generated)' : null,
            hint: (c.isIdentity ? 'Auto-generated (identity).' :
                   (c.hasDefault && !editing ? 'Leave empty to use server default.' : '')),
            maxLength: c.maxLength,
            numericPrecision: c.numericPrecision,
          };
        });
      }

      function openCreate() {
        if (EDIT_DELETE_DISABLED) return;
        var fields = buildFormFields(false);
        App.openModal('Create row in ' + TABLE_NAME, fields, {}, function (values) {
          return App.fetchJSON('/api/tables/' + encodeURIComponent(TABLE_NAME), {
            method: 'POST',
            body: values,
          }).then(function (res) {
            App.insertAlert(alertRoot, 'success', 'Created', 'Row created successfully.', 'Key: ' + (res.key || ''));
            load();
            return res;
          });
        });
      }

      function openEdit(row, key) {
        if (EDIT_DELETE_DISABLED) return;
        var fields = buildFormFields(true);
        var initials = {};
        TABLE_DEF.columns.forEach(function (c) {
          var v = row[c.name];
          if (c.typeClass === 'json' && typeof v === 'object' && v !== null) {
            try { v = JSON.stringify(v, null, 2); } catch (_) {}
          }
          if (c.typeClass === 'datetime' && typeof v === 'string') {
            v = toLocalInput(v);
          }
          if (typeof v === 'boolean') v = v ? 'true' : 'false';
          initials[c.name] = v;
        });
        App.openModal('Edit row in ' + TABLE_NAME, fields, initials, function (values) {
          return App.fetchJSON('/api/tables/' + encodeURIComponent(TABLE_NAME) + '/' + encodeURIComponent(key), {
            method: 'PUT',
            body: values,
          }).then(function (res) {
            App.insertAlert(alertRoot, 'success', 'Updated', 'Row updated successfully.');
            load();
            return res;
          });
        });
      }

      function doDelete(key, row) {
        if (EDIT_DELETE_DISABLED) return;
        var label = KEY_COLS.map(function (c) { return c + '=' + (row[c] == null ? 'NULL' : String(row[c])); }).join(', ');
        App.confirmDialog('Delete row?',
          'You are about to delete a row from ' + TABLE_NAME + ' (' + label + '). This cannot be undone.',
          'Delete', true)
          .then(function (ok) {
            if (!ok) return;
            return App.fetchJSON('/api/tables/' + encodeURIComponent(TABLE_NAME) + '/' + encodeURIComponent(key), {
              method: 'DELETE',
            }).then(function () {
              App.insertAlert(alertRoot, 'success', 'Deleted', 'Row deleted successfully.');
              load();
            }).catch(function (err) {
              App.insertAlert(alertRoot, 'danger', 'Could not delete', err.message, err.detail);
            });
          });
      }

      function toLocalInput(iso) {
        try {
          var d = new Date(iso);
          if (isNaN(d.getTime())) return iso;
          function pad(n) { return n < 10 ? '0' + n : '' + n; }
          return d.getFullYear() + '-' + pad(d.getMonth()+1) + '-' + pad(d.getDate()) +
                 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
        } catch (_) { return iso; }
      }

      newBtn.addEventListener('click', openCreate);
      load();
    })();
  </script>
</body>
</html>
`;
}

function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function generateFrontend(schema, outputDir) {
  const publicDir = path.join(outputDir, 'public');
  const cssDir = path.join(publicDir, 'css');
  const jsDir = path.join(publicDir, 'js');
  const tablesDir = path.join(publicDir, 'tables');
  [publicDir, cssDir, jsDir, tablesDir].forEach((d) =>
    fs.mkdirSync(d, { recursive: true })
  );

  fs.writeFileSync(path.join(cssDir, 'styles.css'), generateStylesCss(), 'utf8');
  fs.writeFileSync(path.join(jsDir, 'app.js'), generateAppJs(schema), 'utf8');
  fs.writeFileSync(path.join(publicDir, 'index.html'), generateIndexHtml(schema), 'utf8');

  for (const table of schema.tables) {
    const safeName = sanitizePageName(table.name) + '.html';
    fs.writeFileSync(
      path.join(tablesDir, safeName),
      generateTablePageHtml(table, schema),
      'utf8'
    );
  }
}

function sanitizePageName(name) {
  const s = String(name || '');
  if (/^[A-Za-z0-9_-]+$/.test(s)) return s;
  return Buffer.from(s, 'utf8').toString('hex');
}

module.exports = {
  generateFrontend,
  generateStylesCss,
  generateAppJs,
  generateIndexHtml,
  generateTablePageHtml,
};
