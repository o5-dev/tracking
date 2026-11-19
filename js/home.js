/* Domovská stránka: zadání kódu a zobrazení veřejných údajů zásilky. */
(function () {
  'use strict';
  const T = window.Trasa;
  const h = T.h;

  const form = document.getElementById('track-form');
  const input = document.getElementById('code');
  const btn = document.getElementById('track-btn');
  const errBox = document.getElementById('code-error');
  const help = document.getElementById('code-help');
  const resultEl = document.getElementById('result');

  /* ---------- Úvodní nastavení ---------- */

  document.getElementById('privacy-note').append(
    T.icon('lock', 16),
    'Ke každé zásilce ukážeme jen její stav a trasu. Adresa ani kontakt na příjemce se nezobrazují.'
  );

  if (T.isDemo) {
    document.getElementById('demo-banner').hidden = false;
    help.textContent = 'Vyzkoušejte ukázkovou zásilku: ';
    help.appendChild(h('button', { type: 'button', onclick: function () { input.value = 'DEMO-BALI-K123'; submit(); } }, 'DEMO-BALI-K123'));
  }

  /* ---------- Maska vstupu: XXXX-XXXX-XXXX ---------- */
  input.addEventListener('input', function () {
    const before = input.value;
    input.value = T.formatCode(before);
    clearError();
  });

  function showError(msg) {
    T.clear(errBox).appendChild(h('div', { class: 'alert', role: 'alert' }, T.icon('alert', 18), h('span', null, msg)));
  }
  function clearError() { T.clear(errBox); }

  function setBusy(on) {
    btn.setAttribute('aria-busy', on ? 'true' : 'false');
    btn.disabled = on;
    T.clear(btn);
    if (on) btn.append(h('span', { class: 'spinner' }), 'Hledám…');
    else btn.append('Sledovat');
  }
  setBusy(false);

  /* ---------- Vyhledání ---------- */
  let seq = 0;
  async function submit() {
    const code = T.formatCode(input.value);
    clearError();
    if (!T.isCompleteCode(code)) {
      showError('Kód má 12 znaků ve tvaru XXXX-XXXX-XXXX. Zkontrolujte, že je opsaný celý.');
      input.focus();
      return;
    }
    const mine = ++seq;
    setBusy(true);
    try {
      const pkg = await T.api.track(code);
      if (mine !== seq) return;
      if (!pkg) {
        T.clear(resultEl);
        showError('Zásilku s tímto kódem jsme nenašli. Zkontrolujte, zda jste kód opsali správně.');
        return;
      }
      render(pkg);
      try { history.replaceState(null, '', '?kod=' + encodeURIComponent(pkg.tracking_code)); } catch (e) { /* file:// apod. */ }
      resultEl.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'nearest' });
    } catch (e) {
      if (mine !== seq) return;
      showError('Nepodařilo se spojit se serverem. Zkuste to prosím za chvíli znovu.');
    } finally {
      if (mine === seq) setBusy(false);
    }
  }

  form.addEventListener('submit', function (e) { e.preventDefault(); submit(); });

  /* ---------- Vykreslení výsledku ---------- */
  function render(p) {
    const info = T.statusInfo(p.status);
    const last = p.events[0];
    const delivered = p.status === 'delivered';
    const warn = info.tone === 'warning' || info.tone === 'danger';

    // Banner s termínem doručení
    let etaClass = 'eta', etaText;
    if (delivered) {
      const ev = p.events.find(function (e) { return e.status === 'delivered'; }) || last;
      etaText = 'Doručeno: ' + T.fmtDateTime(ev && ev.at);
    } else if (p.status === 'cancelled') { etaClass += ' eta--danger'; etaText = info.headline; }
    else if (warn) { etaClass += ' eta--warn'; etaText = info.headline; }
    else if (p.estimated_delivery || p.estimated_delivery_to) { etaText = 'Doručení: ' + T.fmtRange(p.estimated_delivery, p.estimated_delivery_to); }
    else { etaClass += ' eta--idle'; etaText = 'Doručení: termín zatím neupřesněn'; }
    const tip = 'Předpokládaný termín se může změnit podle vytížení dopravce.';
    const eta = h('div', { class: etaClass },
      h('h2', null, etaText),
      delivered || warn ? null : h('button', { class: 'eta__help', type: 'button', 'data-tip': tip, 'aria-label': tip }, T.icon('help', 18)));

    // Hlavička balíku
    const sub = [p.carrier, p.description].filter(Boolean).join(' · ');
    const copyBtn = h('button', { class: 'linkbtn', type: 'button' }, 'Kopírovat');
    copyBtn.addEventListener('click', async function () {
      const ok = await T.copyText(p.tracking_code);
      copyBtn.textContent = ok ? 'Zkopírováno' : 'Kopírovat';
      setTimeout(function () { copyBtn.textContent = 'Kopírovat'; }, 1800);
    });
    const top = h('div', { class: 'parcel__top' },
      h('div', null,
        sub ? h('div', { class: 'parcel__carrier' }, sub) : null,
        h('div', { class: 'parcel__number' }, 'Sledovací kód: ', h('strong', null, p.tracking_code))),
      copyBtn);

    // Časová osa (nejnovější nahoře)
    const timeline = h('ol', { class: 'tl', 'aria-label': 'Historie zásilky' }, p.events.map(function (e, i) {
      const desc = [e.location, e.note].filter(Boolean).join(' · ');
      const cls = 'tl__item' + (i === 0 ? (delivered ? ' is-good' : warn ? ' is-warn' : '') : '');
      return h('li', { class: cls },
        h('span', { class: 'tl__dot' }),
        h('div', null,
          h('div', { class: 'tl__title' }, T.statusInfo(e.status).label),
          desc ? h('div', { class: 'tl__desc' }, desc) : null,
          h('time', { class: 'tl__time', datetime: e.at, title: T.fmtDateTime(e.at) }, T.fmtStamp(e.at)),
          i === 0 && !delivered ? h('div', { class: 'tl__callout' }, T.icon('alert', 14), info.text) : null));
    }));

    // Patička: cíl + zkrácené údaje příjemce (soukromé údaje se nezobrazují)
    const foot = (p.destination || p.recipient || p.recipient_phone) ? h('div', { class: 'parcel__foot' },
      T.icon('pin', 18),
      p.destination ? h('b', null, p.destination) : null,
      p.recipient ? h('span', { class: 'masked', title: 'Jméno příjemce je zkrácené' }, p.recipient) : null,
      p.recipient_phone ? h('span', { class: 'masked' }, p.recipient_phone) : null) : null;

    T.clear(resultEl).appendChild(h('article', { class: 'tracking' },
      eta,
      h('div', { class: 'sheet parcel' }, top, timeline, foot),
      h('p', { class: 'tracking__note' }, T.icon('lock', 14), 'Adresu, e-mail ani celé jméno a telefon příjemce nezobrazujeme.')));
  }

  /* ---------- Odkaz ?kod=… ---------- */
  const q = new URLSearchParams(location.search).get('kod');
  if (q) {
    input.value = T.formatCode(q);
    if (T.isCompleteCode(q)) submit();
  }
})();
