/* Správcovský panel: přihlášení, seznam zásilek, vytvoření, změna stavu, úpravy. */
(function () {
  'use strict';
  const T = window.Trasa;
  const h = T.h;
  const api = T.api.admin;
  const app = document.getElementById('app');

  const state = {
    user: null,
    packages: [],
    selectedId: null,
    mode: 'view',          // view | new | edit
    filter: 'all',         // all | active | done | issue
    query: '',
    justCreated: null,     // id právě vytvořené zásilky (zobrazí zelený banner s kódem)
    confirmDelete: false,
    view: 'list'           // mobilní přepínání seznam / detail
  };

  if (T.isDemo) document.getElementById('demo-banner').hidden = false;

  /* ---------- Pomocné ---------- */
  let toastTimer;
  function toast(msg) {
    const host = document.getElementById('toast-host');
    T.clear(host).appendChild(h('div', { class: 'toast' }, T.icon('check', 18), msg));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { T.clear(host); }, 2600);
  }
  function errMsg(e) {
    const m = (e && e.message) || '';
    if (e && e.code === 'AUTH') return 'Token není platný nebo vypršel. Přihlaste se znovu.';
    if (e && e.code === 'NOPUSH') return 'Tento token nemá právo zápisu (Contents: Read and write) pro tento repozitář.';
    if (e && e.code === 'NETWORK') return 'Nepodařilo se spojit se serverem. Zkontrolujte připojení.';
    if (e && e.status === 404) return 'Repozitář nebo zásilka nebyla nalezena (nebo k ní token nemá přístup).';
    if (e && (e.status === 409 || e.status === 422)) return 'Zásilka se mezitím změnila jinde. Obnovte stránku a zkuste to znovu.';
    return 'Něco se nepovedlo' + (m ? ' (' + m + ')' : '') + '.';
  }
  const PUBLISH_NOTE = ' Na webu se změna projeví zhruba za minutu (GitHub Pages ji nejdřív nasadí).';
  function trackingLink(code) { return new URL('../?kod=' + encodeURIComponent(code), location.href).href; }
  // Text zprávy pro zákazníka (kopíruje se do schránky a posílá se např. e-mailem nebo SMS)
  function customerMessage(p) {
    return [
      'Dobrý den,',
      '',
      'Vaše zásilka' + (p.description ? ' (' + p.description + ')' : '') + ' je zaregistrována. Její stav můžete sledovat zde:',
      trackingLink(p.tracking_code),
      '',
      'Sledovací kód: ' + p.tracking_code
    ].join('\n');
  }
  function selected() { return state.packages.find(function (p) { return p.id === state.selectedId; }) || null; }
  function emptyToNull(o) {
    const out = {};
    Object.keys(o).forEach(function (k) { const v = typeof o[k] === 'string' ? o[k].trim() : o[k]; out[k] = v === '' ? null : v; });
    return out;
  }
  function busy(button, on, label) {
    button.disabled = on;
    button.setAttribute('aria-busy', on ? 'true' : 'false');
    if (label !== undefined) { T.clear(button); if (on) button.append(h('span', { class: 'spinner' })); button.append(label); }
  }
  function field(label, control, hint, cls) {
    const id = control.id || (control.id = 'f' + Math.random().toString(36).slice(2, 8));
    return h('div', { class: 'field ' + (cls || '') },
      h('label', { for: id }, label),
      control,
      hint ? h('span', { class: 'field__hint' }, hint) : null);
  }
  function copyButton(text, label, doneLabel) {
    const b = h('button', { class: 'btn btn--quiet btn--sm', type: 'button' }, T.icon('copy', 16), label);
    b.addEventListener('click', async function () {
      const ok = await T.copyText(text);
      T.clear(b).append(T.icon(ok ? 'check' : 'copy', 16), ok ? doneLabel : label);
      setTimeout(function () { T.clear(b).append(T.icon('copy', 16), label); }, 1800);
    });
    return b;
  }

  function messageButton(p) {
    const label = 'Kopírovat zprávu pro zákazníka';
    const b = h('button', { class: 'btn btn--sm', type: 'button', title: 'Zkopíruje text s odkazem na sledování' }, T.icon('copy', 16), label);
    b.addEventListener('click', async function () {
      const ok = await T.copyText(customerMessage(p));
      T.clear(b).append(T.icon(ok ? 'check' : 'copy', 16), ok ? 'Zpráva zkopírována' : label);
      setTimeout(function () { T.clear(b).append(T.icon('copy', 16), label); }, 1800);
    });
    return b;
  }

  /* =====================================================
     Přihlášení
     ===================================================== */
  function renderLogin(message) {
    const token = h('input', { class: 'input', id: 'token', type: 'password', name: 'token', autocomplete: 'off', spellcheck: 'false', required: true });
    const errBox = h('div', { 'aria-live': 'polite' }, message ? h('div', { class: 'alert', role: 'alert' }, T.icon('alert', 18), message) : null);
    const submit = h('button', { class: 'btn btn--block', type: 'submit' }, 'Přihlásit se');
    const form = h('form', { novalidate: true },
      field('Přístupový token GitHubu', token, 'Token zůstane jen v tomto prohlížeči a nikam se neukládá.'), errBox, submit);

    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      T.clear(errBox);
      if (!token.value.trim()) {
        errBox.appendChild(h('div', { class: 'alert', role: 'alert' }, T.icon('alert', 18), 'Vložte přístupový token.'));
        return;
      }
      busy(submit, true, 'Ověřuji…');
      try {
        await start(await api.signIn(token.value));
      } catch (err) {
        busy(submit, false, 'Přihlásit se');
        errBox.appendChild(h('div', { class: 'alert', role: 'alert' }, T.icon('alert', 18), errMsg(err)));
      }
    });

    const repo = (window.TRASA_CONFIG || {}).githubRepo || '';
    const help = h('details', { class: 'login__help' },
      h('summary', null, 'Jak token získat'),
      h('ol', null,
        h('li', null, 'Otevřete ', h('a', { href: 'https://github.com/settings/personal-access-tokens/new', target: '_blank', rel: 'noopener' }, 'GitHub → nový token'), '.'),
        h('li', null, 'U „Repository access“ zvolte „Only select repositories“ a vyberte ', h('b', null, repo || 'tento repozitář'), '.'),
        h('li', null, 'V „Repository permissions“ nastavte ', h('b', null, 'Contents: Read and write'), '.'),
        h('li', null, 'Vytvořte token a vložte ho sem.')));

    T.clear(app).append(
      T.topbar({ root: '../' }),
      h('main', { class: 'login' },
        h('div', { class: 'login__card' },
          h('div', null, h('h1', null, 'Správa zásilek'), h('p', { style: 'margin-top:8px' }, 'Přihlaste se, abyste mohli zakládat zásilky a měnit jejich stav.')),
          form,
          help,
          h('a', { href: '../', style: 'font-size:.9rem' }, '← Zpět na sledování zásilek')
        )
      )
    );
    token.focus();
  }

  /* =====================================================
     Hlavní rozhraní
     ===================================================== */
  let listEl, paneEl, layoutEl;

  async function start(user) {
    state.user = user;
    buildShell();
    await reload();
  }

  async function reload(keepSelection) {
    try {
      state.packages = await api.list();
    } catch (e) {
      T.clear(listEl.items).appendChild(h('div', { class: 'alert', role: 'alert' }, T.icon('alert', 18), errMsg(e)));
      return;
    }
    if (!keepSelection && state.selectedId && !selected()) state.selectedId = null;
    renderList();
    renderPane();
  }

  function buildShell() {
    const search = h('input', { class: 'input', type: 'search', placeholder: 'Hledat kód, příjemce, popis…', 'aria-label': 'Hledat zásilky', autocomplete: 'off' });
    search.addEventListener('input', function () { state.query = search.value; renderList(); });

    const filters = [['all', 'Vše'], ['active', 'Aktivní'], ['done', 'Doručené'], ['issue', 'Problém']];
    const seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Filtr stavu' }, filters.map(function (f) {
      const b = h('button', { type: 'button', 'aria-pressed': String(state.filter === f[0]), dataset: { f: f[0] } }, f[1]);
      b.addEventListener('click', function () {
        state.filter = f[0];
        seg.querySelectorAll('button').forEach(function (x) { x.setAttribute('aria-pressed', String(x.dataset.f === state.filter)); });
        renderList();
      });
      return b;
    }));

    const newBtn = h('button', { class: 'btn btn--sm', type: 'button' }, T.icon('plus', 16), 'Nová zásilka');
    newBtn.addEventListener('click', function () {
      state.mode = 'new'; state.selectedId = null; state.justCreated = null; state.view = 'detail';
      sync();
    });

    const items = h('div', { class: 'list__scroll' });
    listEl = h('aside', { class: 'panel list', 'aria-label': 'Seznam zásilek' },
      h('div', { class: 'list__top' },
        h('div', { class: 'list__row' }, h('h2', null, 'Zásilky'), newBtn),
        h('div', { class: 'search' }, T.icon('search', 18), search),
        seg),
      items);
    listEl.items = items;

    paneEl = h('section', { class: 'panel pane', 'aria-live': 'polite' });
    layoutEl = h('div', { class: 'adm', dataset: { view: state.view } }, listEl, paneEl);

    const out = h('button', { class: 'btn btn--ghost btn--sm', type: 'button', 'aria-label': 'Odhlásit se' }, T.icon('out', 16), h('span', null, 'Odhlásit'));
    out.addEventListener('click', async function () { await api.signOut(); state.user = null; renderLogin(); });

    T.clear(app).append(
      T.topbar({ root: '../', right: h('div', { class: 'topbar__who' }, h('span', null, state.user.email), out) }),
      layoutEl
    );
  }

  function sync() {
    layoutEl.dataset.view = state.view;
    renderList();
    renderPane();
    if (state.view === 'detail') window.scrollTo({ top: 0 });
  }

  /* ---------- Seznam ---------- */
  function matches(p) {
    const done = ['delivered'], issue = ['problem', 'returned', 'cancelled'];
    if (state.filter === 'active' && (done.indexOf(p.status) >= 0 || issue.indexOf(p.status) >= 0)) return false;
    if (state.filter === 'done' && done.indexOf(p.status) < 0) return false;
    if (state.filter === 'issue' && issue.indexOf(p.status) < 0) return false;
    const q = state.query.trim().toLowerCase();
    if (!q) return true;
    const hay = [p.tracking_code, p.description, p.recipient, p.origin, p.destination].join(' ').toLowerCase();
    return hay.indexOf(q) >= 0 || hay.replace(/-/g, '').indexOf(q.replace(/-/g, '')) >= 0;
  }

  function renderList() {
    const rows = state.packages.filter(matches);
    const box = T.clear(listEl.items);
    if (!rows.length) {
      box.appendChild(state.packages.length
        ? h('div', { class: 'empty' }, T.icon('search', 32), h('div', null, h('strong', null, 'Nic nenalezeno'), 'Zkuste upravit hledání nebo filtr.'))
        : h('div', { class: 'empty' }, T.icon('box', 32), h('div', null, h('strong', null, 'Zatím žádné zásilky'), 'Vytvořte první a získáte sledovací kód.')));
      return;
    }
    rows.forEach(function (p) {
      const b = h('button', { class: 'item', type: 'button', 'aria-current': String(p.id === state.selectedId && state.mode !== 'new') },
        h('div', { class: 'item__top' }, h('span', { class: 'item__code' }, p.tracking_code), T.statusChip(p.status)),
        h('div', { class: 'item__desc' }, p.description),
        h('div', { class: 'item__meta' }, h('span', null, p.recipient || p.destination || ''), h('span', null, T.fmtDateTime(p.updated_at))));
      b.addEventListener('click', function () {
        state.selectedId = p.id; state.mode = 'view'; state.confirmDelete = false;
        if (state.justCreated !== p.id) state.justCreated = null;
        state.view = 'detail'; sync();
      });
      box.appendChild(b);
    });
  }

  /* ---------- Pravý panel ---------- */
  function backButton() {
    const b = h('button', { class: 'btn btn--quiet btn--sm mobile-back', type: 'button' }, T.icon('back', 16), 'Zpět na seznam');
    b.addEventListener('click', function () { state.view = 'list'; sync(); });
    return b;
  }

  function renderPane() {
    const el = T.clear(paneEl);
    if (state.mode === 'new') { el.append(h('div', { class: 'sect' }, backButton(), packageForm(null))); return; }
    const p = selected();
    if (!p) {
      el.appendChild(h('div', { class: 'pane__empty' }, T.icon('box', 44),
        h('div', null, h('strong', null, 'Vyberte zásilku'), 'Nebo založte novou a vygenerujte sledovací kód.')));
      return;
    }
    if (state.mode === 'edit') { el.append(h('div', { class: 'sect' }, backButton(), packageForm(p))); return; }
    el.append(paneHeader(p), statusUpdate(p), historySection(p), detailsSection(p));
  }

  function paneHeader(p) {
    const link = trackingLink(p.tracking_code);
    const editBtn = h('button', { class: 'btn btn--ghost btn--sm', type: 'button' }, T.icon('edit', 16), 'Upravit údaje');
    editBtn.addEventListener('click', function () { state.mode = 'edit'; renderPane(); });
    const delBtn = h('button', { class: 'btn btn--danger btn--sm', type: 'button' }, T.icon('trash', 16), 'Smazat');
    delBtn.addEventListener('click', function () { state.confirmDelete = !state.confirmDelete; renderPane(); });

    const parts = [];
    if (state.justCreated === p.id) {
      parts.push(h('div', { class: 'created-banner' },
        h('strong', null, 'Zásilka je vytvořená. Pošlete příjemci tento sledovací kód:'),
        h('div', { class: 'codebox__row' }, h('span', { class: 'codebox__code' }, p.tracking_code), copyButton(p.tracking_code, 'Kopírovat kód', 'Zkopírováno')),
        h('div', { class: 'btn-row' }, messageButton(p), copyButton(link, 'Kopírovat jen odkaz', 'Odkaz zkopírován')),
        T.isDemo ? null : h('div', { style: 'font-size:.875rem' }, 'Kód začne na webu fungovat zhruba za minutu (GitHub Pages změnu nejdřív nasadí).')));
    }
    parts.push(h('div', { class: 'pane-title' },
      h('div', null,
        h('h2', null, p.description),
        h('div', { class: 'pane-title__code' }, h('span', { class: 'codebox__code' }, p.tracking_code),
          copyButton(p.tracking_code, 'Kopírovat', 'Zkopírováno'), copyButton(link, 'Odkaz', 'Odkaz zkopírován'))),
      h('div', { class: 'btn-row' }, T.statusChip(p.status))));
    parts.push(h('div', { class: 'btn-row', style: 'margin-top:16px' }, messageButton(p), editBtn, delBtn));

    if (state.confirmDelete) {
      const yes = h('button', { class: 'btn btn--danger-solid btn--sm', type: 'button' }, 'Smazat navždy');
      const no = h('button', { class: 'btn btn--ghost btn--sm', type: 'button' }, 'Ponechat');
      no.addEventListener('click', function () { state.confirmDelete = false; renderPane(); });
      yes.addEventListener('click', async function () {
        busy(yes, true, 'Mažu…');
        try {
          await api.remove(p.id);
          state.selectedId = null; state.confirmDelete = false; state.view = 'list';
          toast('Zásilka byla smazána.');
          await reload(); layoutEl.dataset.view = 'list';
        } catch (e) { busy(yes, false, 'Smazat navždy'); toast(errMsg(e)); }
      });
      parts.push(h('div', { class: 'confirm', style: 'margin-top:16px', role: 'alertdialog' },
        h('div', null, 'Opravdu smazat zásilku ', h('strong', null, p.tracking_code), '? Příjemce ji pak už pod tímto kódem nenajde a nejde to vrátit zpět.'),
        h('div', { class: 'btn-row' }, yes, no)));
    }
    return h('div', { class: 'sect' }, backButton(), parts);
  }

  function statusUpdate(p) {
    const sel = h('select', { class: 'select', id: 'st-status' }, T.STATUS_ORDER.map(function (k) {
      return h('option', { value: k, selected: k === p.status }, T.statusInfo(k).label);
    }));
    const loc = h('input', { class: 'input', id: 'st-loc', type: 'text', maxlength: '80', placeholder: 'např. Brno, depo', autocomplete: 'off' });
    const note = h('textarea', { class: 'textarea', id: 'st-note', maxlength: '300', rows: '2', placeholder: 'Volitelné, např. Zásilka čeká na výdejním místě.' });
    const submit = h('button', { class: 'btn', type: 'submit' }, 'Uložit změnu stavu');
    const form = h('form', { class: 'update-form', novalidate: true },
      h('div', { class: 'grid2' }, field('Nový stav', sel), field('Místo', loc)),
      field('Poznámka', note, 'Místo i poznámka uvidí zákazník. Čas změny se zapíše automaticky.'),
      h('div', null, submit));
    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      busy(submit, true, 'Ukládám…');
      try {
        await api.addEvent(p.id, { status: sel.value, location: loc.value.trim(), note: note.value.trim() });
        await reload(true);
        toast('Stav uložen s časovým razítkem.' + (T.isDemo ? '' : PUBLISH_NOTE));
      } catch (err) { busy(submit, false, 'Uložit změnu stavu'); toast(errMsg(err)); }
    });
    return h('div', { class: 'sect' }, h('div', { class: 'sect__head' }, h('h3', null, 'Aktualizovat stav')), form);
  }

  function historySection(p) {
    return h('div', { class: 'sect' },
      h('div', { class: 'sect__head' }, h('h3', null, 'Historie'), h('span', { class: 'field__hint' }, p.events.length + ' záznamů')),
      h('ol', { class: 'history' }, p.events.map(function (e) {
        const meta = [e.location, e.note].filter(Boolean).join(' · ');
        return h('li', { class: 'history__item' },
          h('span', { class: 'history__dot' }),
          h('div', null,
            h('div', { class: 'history__what' }, T.statusInfo(e.status).label),
            meta ? h('div', { class: 'history__meta' }, meta) : null,
            h('time', { class: 'history__time', datetime: e.at }, T.fmtDateTime(e.at))));
      })));
  }

  function detailsSection(p) {
    function row(label, value) {
      return h('div', null, h('dt', null, label), h('dd', value ? null : { class: 'is-empty' }, value || '—'));
    }
    return h('div', { class: 'sect' },
      h('div', { class: 'sect__head' }, h('h3', null, 'Údaje o zásilce')),
      h('p', { class: 'fieldset__why', style: 'margin:-8px 0 16px' }, 'Všechno, co je tu uvedeno, uvidí každý, kdo zná sledovací kód.'),
      h('dl', { class: 'facts-admin' },
        row('Obsah zásilky', p.description),
        row('Doprava / služba', p.carrier),
        row('Předpokládané doručení', T.fmtRange(p.estimated_delivery, p.estimated_delivery_to)),
        row('Odesláno z', p.origin),
        row('Doručí se do', p.destination),
        row('Příjemce (zkráceně)', p.recipient),
        row('Telefon (zkráceně)', p.recipient_phone),
        row('Vytvořeno', T.fmtDateTime(p.created_at)),
        row('Poslední změna stavu', T.fmtDateTime(p.updated_at))));
  }

  /* ---------- Formulář (nová zásilka / úprava) ---------- */
  function packageForm(p) {
    const isEdit = !!p;
    const v = function (k) { return p && p[k] ? p[k] : ''; };
    const f = {
      description: h('input', { class: 'input', type: 'text', required: true, maxlength: '120', value: v('description'), placeholder: 'např. Balík – elektronika' }),
      carrier: h('input', { class: 'input', type: 'text', maxlength: '80', value: v('carrier'), placeholder: 'např. Standardní doprava' }),
      origin: h('input', { class: 'input', type: 'text', maxlength: '60', value: v('origin'), placeholder: 'Praha' }),
      destination: h('input', { class: 'input', type: 'text', maxlength: '60', value: v('destination'), placeholder: 'Brno' }),
      estimated_delivery: h('input', { class: 'input', type: 'date', value: v('estimated_delivery') }),
      estimated_delivery_to: h('input', { class: 'input', type: 'date', value: v('estimated_delivery_to') }),
      recipient_name: h('input', { class: 'input', type: 'text', maxlength: '100', autocomplete: 'off', required: !isEdit, placeholder: isEdit ? 'Nechte prázdné = beze změny (' + (p.recipient || '—') + ')' : '' }),
      recipient_phone: h('input', { class: 'input', type: 'tel', maxlength: '40', autocomplete: 'off', placeholder: isEdit ? 'Nechte prázdné = beze změny (' + (p.recipient_phone || '—') + ')' : '' })
    };

    const errBox = h('div', { 'aria-live': 'polite' });
    const submit = h('button', { class: 'btn', type: 'submit' }, isEdit ? 'Uložit změny' : 'Vytvořit zásilku a vygenerovat kód');
    const cancel = h('button', { class: 'btn btn--ghost', type: 'button' }, 'Zrušit');
    cancel.addEventListener('click', function () {
      state.mode = 'view';
      if (!isEdit) state.view = 'list';
      sync();
    });

    const form = h('form', { class: 'form', novalidate: true },
      h('div', null, h('h2', { style: 'font-size:1.375rem;letter-spacing:-.03em' }, isEdit ? 'Upravit zásilku' : 'Nová zásilka'),
        h('p', { class: 'field__hint', style: 'margin-top:4px' }, isEdit ? p.tracking_code : 'Sledovací kód se vygeneruje automaticky po uložení.')),
      h('fieldset', { class: 'fieldset fieldset--public' },
        h('legend', null, 'Údaje zásilky'),
        h('p', { class: 'fieldset__why' }, 'Všechno, co sem napíšete, uvidí každý, kdo zná sledovací kód.'),
        field('Obsah zásilky *', f.description),
        field('Doprava / služba', f.carrier),
        h('div', { class: 'grid2' }, field('Odesláno z', f.origin), field('Doručí se do', f.destination)),
        h('div', { class: 'grid2' }, field('Doručení od', f.estimated_delivery), field('Doručení do (volitelné)', f.estimated_delivery_to)),
        field(isEdit ? 'Jméno příjemce' : 'Jméno příjemce *', f.recipient_name, 'Uloží se a zobrazí jen zkráceně, např. J*** N*****. Celé jméno se nikam neukládá.'),
        field('Telefon příjemce', f.recipient_phone, 'Zobrazí se jen poslední 3 číslice. Celé číslo se nikam neukládá.')),
      errBox,
      h('div', { class: 'form__actions' }, submit, cancel));

    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      T.clear(errBox);
      if (!f.description.value.trim() || (!isEdit && !f.recipient_name.value.trim())) {
        errBox.appendChild(h('div', { class: 'alert', role: 'alert' }, T.icon('alert', 18), 'Vyplňte obsah zásilky a jméno příjemce.'));
        (f.description.value.trim() ? f.recipient_name : f.description).focus();
        return;
      }
      const data = emptyToNull({
        description: f.description.value, carrier: f.carrier.value, origin: f.origin.value, destination: f.destination.value,
        estimated_delivery: f.estimated_delivery.value, estimated_delivery_to: f.estimated_delivery_to.value,
        recipient_name: f.recipient_name.value, recipient_phone: f.recipient_phone.value
      });
      busy(submit, true, 'Ukládám…');
      try {
        if (isEdit) {
          await api.update(p.id, data);
          state.mode = 'view';
          await reload(true);
          toast('Změny byly uloženy.' + (T.isDemo ? '' : PUBLISH_NOTE));
        } else {
          const created = await api.create(data);
          state.selectedId = created.id; state.justCreated = created.id; state.mode = 'view'; state.view = 'detail';
          await reload(true);
          layoutEl.dataset.view = 'detail';
          window.scrollTo({ top: 0 });
        }
      } catch (err) {
        busy(submit, false, isEdit ? 'Uložit změny' : 'Vytvořit zásilku a vygenerovat kód');
        errBox.appendChild(h('div', { class: 'alert', role: 'alert' }, T.icon('alert', 18), errMsg(err)));
      }
    });
    setTimeout(function () { f.description.focus({ preventScroll: true }); }, 0);
    return form;
  }

  /* =====================================================
     Start
     ===================================================== */
  (async function init() {
    try {
      if (T.isDemo) { await api.signIn(); return start({ email: 'demo režim' }); }
      const sess = await api.getSession();
      if (sess) return start(sess);
      renderLogin();
    } catch (e) {
      renderLogin(errMsg(e));
    }
  })();
})();
