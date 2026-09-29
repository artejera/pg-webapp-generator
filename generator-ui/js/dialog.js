(function () {
  'use strict';

  function el(tag, attrs) {
    var e = document.createElement(tag);
    if (attrs) {
      for (var k in attrs) {
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
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child == null) continue;
      if (Array.isArray(child)) { for (var j = 0; j < child.length; j++) arguments.callee && null; }
      if (typeof child === 'string' || typeof child === 'number') e.appendChild(document.createTextNode(String(child)));
      else if (child instanceof Node) e.appendChild(child);
    }
    return e;
  }

  function addCSS() {
    if (document.getElementById('gen-ui-dyn-css')) return;
    var link = document.createElement('link');
    link.id = 'gen-ui-dyn-css';
    link.rel = 'stylesheet';
    link.href = 'css/app.css';
    document.head.appendChild(link);
  }

  function openDialog(initialValues) {
    addCSS();
    var iv = initialValues || {};

    var backdrop = el('div', { class: 'modal-backdrop', onmousedown: function (e) { if (e.target === backdrop) close(); } });
    var modal = el('div', { class: 'modal' });
    var header = el('div', { class: 'modal-header' },
      el('h2', { text: 'Connect to PostgreSQL' }),
      el('button', { type: 'button', class: 'close', title: 'Close', onclick: close, html: '&times;' })
    );
    var body = el('div', { class: 'modal-body' });
    var footer = el('div', { class: 'modal-footer' },
      el('button', { type: 'button', class: 'btn', onclick: close, text: 'Cancel' }),
      el('button', { type: 'button', class: 'btn btn-primary', id: 'btn-submit', text: 'Connect & Generate' })
    );
    modal.appendChild(header);
    modal.appendChild(body);
    modal.appendChild(footer);
    backdrop.appendChild(modal);

    var alertHost = el('div');
    body.appendChild(alertHost);

    var progress = el('div', { class: 'progress', style: 'display:none;' }, el('div', { class: 'bar', id: 'bar' }));
    body.appendChild(progress);

    var hostInput = addField(body, 'hostname', 'Hostname', 'text', iv.host || 'localhost', 'e.g. localhost or db.example.com');
    var row2 = el('div', { class: 'form-group row2' });
    var portInput = addField(row2, 'port', 'Port', 'number', iv.port || 5432, 'Default 5432');
    var dbInput   = addField(row2, 'dbname', 'Database name', 'text', iv.database || '', 'e.g. mydb', true);
    body.appendChild(row2);
    var row3 = el('div', { class: 'form-group row2' });
    var userInput  = addField(row3, 'user', 'User', 'text', iv.user || 'postgres', '', true);
    var passInput  = addField(row3, 'pass', 'Password', 'password', iv.password || '', 'Never saved into generated files');
    body.appendChild(row3);

    var adv = el('details', { class: 'advanced' });
    adv.appendChild(el('summary', { text: 'Advanced options' }));
    var schemaInp = addField(adv, 'schema', 'Postgres schema', 'text', iv.schema || 'public', 'Usually "public"');
    var outInp   = addField(adv, 'output', 'Output directory', 'text', iv.output || 'generated-webapp',
      'Relative to project root or absolute path');
    var cbWrap = el('div', { style: 'margin-top:10px' });
    var overCB = el('input', { type: 'checkbox', id: 'f-overwrite' });
    if (iv.overwrite) overCB.checked = true;
    var sslCB = el('input', { type: 'checkbox', id: 'f-ssl' });
    if (iv.ssl) sslCB.checked = true;
    cbWrap.appendChild(
      el('label', { class: 'check-row', style: 'display:flex;align-items:center;gap:8px;' },
        overCB, document.createTextNode(' Overwrite existing output directory contents'))
    );
    cbWrap.appendChild(
      el('label', { class: 'check-row', style: 'display:flex;align-items:center;gap:8px;margin-top:6px;' },
        sslCB, document.createTextNode(' Require SSL (PGSSLMODE=require)'))
    );
    adv.appendChild(cbWrap);
    body.appendChild(adv);

    var resultHost = el('div');
    body.appendChild(resultHost);

    function addField(container, id, label, type, val, hint, required) {
      var g = el('div', { class: 'form-group' });
      var lab = el('label', { for: 'f-' + id, text: label });
      if (required) {
        var req = el('span', { style: 'color:var(--color-danger);margin-left:3px;', text: '*' });
        lab.appendChild(req);
      }
      if (hint) {
        var h = el('span', { class: 'hint', text: '(' + hint + ')' });
        lab.appendChild(h);
      }
      g.appendChild(lab);
      var inp = el('input', { type: type, class: 'form-control', id: 'f-' + id });
      if (val !== undefined && val !== null) inp.value = String(val);
      g.appendChild(inp);
      container.appendChild(g);
      return inp;
    }

    function setAlert(kind, title, message, extras) {
      alertHost.innerHTML = '';
      if (!kind) return;
      var a = el('div', { class: 'alert alert-' + kind });
      var b = el('div', { class: 'body' });
      if (title) b.appendChild(el('div', { class: 'title', text: title }));
      if (message) b.appendChild(el('div', { class: 'detail', text: message }));
      if (extras && extras.hints && extras.hints.length) {
        var ul = el('ul');
        extras.hints.forEach(function (h) { ul.appendChild(el('li', { text: h })); });
        b.appendChild(ul);
      }
      a.appendChild(b);
      a.appendChild(el('button', { type: 'button', class: 'close', onclick: function () { a.remove(); }, html: '&times;' }));
      alertHost.appendChild(a);
    }

    function setProgress(pct, visible) {
      progress.style.display = visible ? '' : 'none';
      progress.querySelector('#bar').style.width = Math.max(0, Math.min(100, pct)) + '%';
    }

    function readPayload() {
      return {
        host: hostInput.value.trim(),
        port: Number(portInput.value),
        database: dbInput.value.trim(),
        user: userInput.value.trim(),
        password: passInput.value,
        schema: schemaInp.value.trim() || 'public',
        output: outInp.value.trim() || '',
        overwrite: overCB.checked,
        ssl: sslCB.checked,
      };
    }

    function submitButton() { return footer.querySelector('#btn-submit'); }
    function setSubmitting(state) {
      var btn = submitButton();
      if (state) {
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner"></span><span>Generating…</span>';
      } else {
        btn.disabled = false;
        btn.textContent = 'Connect & Generate';
      }
    }

    function readErrorsToInputs(err) {
      if (!err) return;
      if (err.step === 'validate') {
        if (/database/i.test(err.error)) dbInput.style.borderColor = 'var(--color-danger)';
        if (/hostname/i.test(err.error)) hostInput.style.borderColor = 'var(--color-danger)';
        if (/user/i.test(err.error))     userInput.style.borderColor = 'var(--color-danger)';
        if (/port/i.test(err.error))     portInput.style.borderColor = 'var(--color-danger)';
        if (/output/i.test(err.error))   outInp.style.borderColor   = 'var(--color-danger)';
      }
      if (err.step === 'connect') {
        hostInput.style.borderColor = 'var(--color-danger)';
        passInput.style.borderColor = 'var(--color-danger)';
      }
    }

    async function onSubmit() {
      [hostInput, portInput, dbInput, userInput, passInput, schemaInp, outInp].forEach(function (i) { i.style.borderColor = ''; });
      resultHost.innerHTML = '';
      setAlert(null);
      var p = readPayload();
      if (!p.database) { readErrorsToInputs({ step: 'validate', error: 'Database name is required.' }); return; }
      if (!p.user)     { readErrorsToInputs({ step: 'validate', error: 'User is required.'         }); return; }
      if (!p.host)     { readErrorsToInputs({ step: 'validate', error: 'Hostname is required.'     }); return; }

      setSubmitting(true);
      setProgress(10, true);
      try {
        setProgress(35, true);
        var res = await fetch('/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(p),
        });
        setProgress(80, true);
        var data = await res.json().catch(function () { return null; });
        setProgress(100, true);
        if (!res.ok) {
          readErrorsToInputs(data || {});
          setAlert('danger',
            (data && data.step === 'connect') ? 'Could not connect to Postgres' :
            (data && data.step === 'validate') ? 'Please fix the form' :
            (data && data.step === 'generate-backend' || data && data.step === 'generate-frontend') ? 'Generation failed' : 'Failed',
            data && data.error ? data.error : ('HTTP ' + res.status), data || {});
          setProgress(0, false);
          return;
        }

        setAlert('success',
          'Webapp generated successfully!',
          data.totalTables + ' table(s) → ' + data.totalFiles + ' files written to ' + (data.relativeOutputDir || data.outputDir));

        var r = el('div', { class: 'result-card' });
        r.appendChild(el('h4', { text: 'Tables discovered' }));
        var chipWrap = el('div', { class: 'tables-mini' });
        (data.tables || []).forEach(function (t) {
          var txt = t.name + ' · ' + t.columns + ' cols';
          if (t.primaryKeys && t.primaryKeys.length) txt += ' · PK: ' + t.primaryKeys.join(',');
          chipWrap.appendChild(el('span', { class: 'chip', text: txt }));
        });
        r.appendChild(chipWrap);
        r.appendChild(el('h4', { style: 'margin-top:14px;', text: 'Run the generated webapp' }));
        r.appendChild(el('code', { text: (data.nextSteps || []).join('\n') }));
        resultHost.appendChild(r);
        setProgress(0, false);
      } catch (e) {
        setAlert('danger', 'Network error', (e && e.message) || String(e));
        setProgress(0, false);
      } finally {
        setSubmitting(false);
      }
    }

    function close() {
      if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
      if (typeof iv._onClose === 'function') iv._onClose();
    }

    function onKey(e) { if (e.key === 'Escape') close(); }
    document.addEventListener('keydown', onKey);
    var oldOnClose = iv._onClose;
    iv._onClose = function () {
      document.removeEventListener('keydown', onKey);
      if (typeof oldOnClose === 'function') oldOnClose();
    };

    submitButton().addEventListener('click', onSubmit);
    [hostInput, portInput, dbInput, userInput, passInput].forEach(function (i) {
      i.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); onSubmit(); }
      });
    });

    document.body.appendChild(backdrop);
    setTimeout(function () { hostInput.focus(); }, 20);
    return { close: close, submit: onSubmit };
  }

  window.GeneratorUI = { openDialog: openDialog };
})();
