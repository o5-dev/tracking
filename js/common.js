/* Sdílené pomocné funkce: stavy, formátování, kódy, DOM, ikony. */
(function () {
  'use strict';
  const T = (window.Trasa = window.Trasa || {});

  /* ---------- Stavy zásilky ---------- */
  // stage = pozice v pětikrokovém průběhu (null = mimo standardní průběh)
  T.STATUSES = {
    created: { label: 'Zásilka vytvořena', stage: 0, tone: 'neutral',
      headline: 'Zásilka je zaregistrovaná',
      text: 'Odesílatel zásilku připravil. Čeká na předání dopravci.' },
    received: { label: 'Převzato dopravcem', stage: 1, tone: 'info',
      headline: 'Dopravce zásilku převzal',
      text: 'Zásilka je u dopravce a brzy vyrazí na cestu.' },
    consolidation: { label: 'Ve skladu konsolidace', stage: 1, tone: 'info',
      headline: 'Zásilka je ve skladu konsolidace',
      text: 'Zásilka se spojuje s dalšími a připravuje se k odeslání.' },
    in_transit: { label: 'Na cestě', stage: 2, tone: 'info',
      headline: 'Zásilka je na cestě',
      text: 'Putuje k vám. Další změnu stavu uvidíte na této stránce.' },
    awaiting_flight: { label: 'Čeká na let', stage: 2, tone: 'info',
      headline: 'Zásilka čeká na let',
      text: 'Zásilka je připravená a čeká na odlet.' },
    export_customs: { label: 'Vývozní celní řízení', stage: 2, tone: 'info',
      headline: 'Probíhá vývozní celní odbavení',
      text: 'Zásilka prochází celním odbavením v zemi odeslání.' },
    export_cleared: { label: 'Vývoz odbaven', stage: 2, tone: 'info',
      headline: 'Vývozní celní odbavení dokončeno',
      text: 'Zásilka prošla celním odbavením a může odletět.' },
    departed_origin: { label: 'Opustila zemi odeslání', stage: 2, tone: 'info',
      headline: 'Zásilka opustila zemi odeslání',
      text: 'Zásilka je na cestě do cílové země.' },
    landed: { label: 'Přistála v cílové zemi', stage: 2, tone: 'info',
      headline: 'Zásilka přistála v cílové zemi',
      text: 'Letadlo se zásilkou přistálo, zásilka čeká na vyložení.' },
    at_airport: { label: 'Na letišti', stage: 2, tone: 'info',
      headline: 'Zásilka dorazila na letiště',
      text: 'Zásilka je na letišti a čeká na další přepravu.' },
    customs_arrived: { label: 'Na celním úřadě', stage: 2, tone: 'info',
      headline: 'Zásilka dorazila na celní úřad',
      text: 'Zásilka čeká na zahájení dovozního celního odbavení.' },
    import_customs: { label: 'Dovozní celní řízení', stage: 2, tone: 'info',
      headline: 'Probíhá dovozní celní odbavení',
      text: 'Zásilka prochází celním odbavením v cílové zemi.' },
    customs_hold: { label: 'Zadrženo celním úřadem', stage: 2, tone: 'warning',
      headline: 'Zásilka je zadržena celním úřadem',
      text: 'Celní úřad si vyžádal doplnění informací nebo dokumentů. Doručení se může zdržet.' },
    duty_due: { label: 'Čeká na zaplacení cla', stage: 2, tone: 'warning',
      headline: 'Zásilka čeká na zaplacení cla',
      text: 'Pro pokračování je potřeba uhradit clo nebo daň. Doručení se do té doby zdrží.' },
    customs_cleared: { label: 'Celně odbaveno', stage: 2, tone: 'info',
      headline: 'Celní odbavení dokončeno',
      text: 'Zásilka prošla celním odbavením a pokračuje k předání dopravci.' },
    to_local_carrier: { label: 'Předáno místnímu dopravci', stage: 2, tone: 'info',
      headline: 'Zásilka je u místního dopravce',
      text: 'Zásilku převzal místní dopravce a zpracovává ji k doručení.' },
    local_facility: { label: 'V místním přepravním centru', stage: 2, tone: 'info',
      headline: 'Zásilka dorazila do místního přepravního centra',
      text: 'Zásilka je v přepravním centru a brzy bude předána kurýrovi.' },
    at_depot: { label: 'V přepravním centru', stage: 2, tone: 'info',
      headline: 'Zásilka je v přepravním centru',
      text: 'Zásilka se právě třídí a pokračuje dál k vám.' },
    delayed: { label: 'Zpoždění', stage: 2, tone: 'warning',
      headline: 'Doručení se zpozdilo',
      text: 'Zásilka má zpoždění. Jakmile bude pokračovat, uvidíte to na této stránce.' },
    to_courier_soon: { label: 'Brzy předáno kurýrovi', stage: 3, tone: 'accent',
      headline: 'Zásilka bude brzy předána kurýrovi',
      text: 'Zásilka se chystá k předání kurýrní společnosti, která ji doručí.' },
    out_for_delivery: { label: 'Doručuje se', stage: 3, tone: 'accent',
      headline: 'Zásilka míří k vám',
      text: 'Kurýr ji má na svozu a doručí ji dnes.' },
    delivery_failed: { label: 'Doručení se nezdařilo', stage: 3, tone: 'warning',
      headline: 'Doručení se nezdařilo',
      text: 'Kurýr zásilku nepředal. Doručení bude zopakováno nebo vás bude dopravce kontaktovat.' },
    pickup_ready: { label: 'Připraveno k vyzvednutí', stage: 3, tone: 'accent',
      headline: 'Zásilka čeká na vyzvednutí',
      text: 'Doručení se změnilo na samovyzvednutí. Vyzvedněte si zásilku na určeném místě.' },
    delivered: { label: 'Doručeno', stage: 4, tone: 'success',
      headline: 'Zásilka byla doručena',
      text: 'Hotovo. Doufáme, že vše dorazilo v pořádku.' },
    problem: { label: 'Problém s doručením', stage: null, tone: 'warning',
      headline: 'Doručení se zpozdilo',
      text: 'Při doručení nastal problém. Podrobnosti najdete v historii níže.' },
    returned: { label: 'Vráceno odesílateli', stage: null, tone: 'warning',
      headline: 'Zásilka se vrací odesílateli',
      text: 'Zásilku se nepodařilo doručit a vrací se zpět k odesílateli.' },
    cancelled: { label: 'Zrušeno', stage: null, tone: 'danger',
      headline: 'Zásilka byla zrušena',
      text: 'Přeprava této zásilky byla zrušena.' }
  };
  T.STATUS_ORDER = [
    'created',
    'received',
    'consolidation',
    'in_transit',
    'awaiting_flight',
    'export_customs',
    'export_cleared',
    'departed_origin',
    'landed',
    'at_airport',
    'customs_arrived',
    'import_customs',
    'customs_hold',
    'duty_due',
    'customs_cleared',
    'to_local_carrier',
    'local_facility',
    'at_depot',
    'delayed',
    'to_courier_soon',
    'out_for_delivery',
    'delivery_failed',
    'pickup_ready',
    'delivered',
    'problem',
    'returned',
    'cancelled'
  ];
  T.STEPS = ['Vytvořeno', 'Převzato', 'Na cestě', 'Doručuje se', 'Doručeno'];

  T.statusInfo = function (key) {
    return T.STATUSES[key] || { label: key, stage: null, tone: 'neutral', headline: key, text: '' };
  };

  // Do jakého kroku zásilka dospěla (i když je aktuálně ve stavu "problém").
  T.reachedStage = function (events, status) {
    let best = -1;
    const list = (events || []).map(function (e) { return e.status; }).concat(status);
    list.forEach(function (s) {
      const st = T.statusInfo(s).stage;
      if (st !== null && st > best) best = st;
    });
    return Math.max(best, 0);
  };

  /* ---------- Formátování (čeština, pražský čas) ---------- */
  const dtf = new Intl.DateTimeFormat('cs-CZ', {
    day: 'numeric', month: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Prague'
  });
  const df = new Intl.DateTimeFormat('cs-CZ', {
    weekday: 'short', day: 'numeric', month: 'numeric', year: 'numeric', timeZone: 'UTC'
  });
  const dfShort = new Intl.DateTimeFormat('cs-CZ', {
    day: 'numeric', month: 'numeric', timeZone: 'Europe/Prague'
  });
  const tf = new Intl.DateTimeFormat('cs-CZ', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Prague' });

  T.fmtDateTime = function (iso) { return iso ? dtf.format(new Date(iso)) : '—'; };
  T.fmtDay = function (iso) { return iso ? dfShort.format(new Date(iso)) : ''; };
  const yearOf = function (d) { return new Intl.DateTimeFormat('cs-CZ', { year: 'numeric', timeZone: 'Europe/Prague' }).format(d); };
  const stampDate = new Intl.DateTimeFormat('cs-CZ', { weekday: 'short', day: 'numeric', month: 'numeric', timeZone: 'Europe/Prague' });
  const stampDay = new Intl.DateTimeFormat('cs-CZ', { day: 'numeric', month: 'numeric', timeZone: 'Europe/Prague' });
  // 'čt | 19. 11. 15:56' (rok jen u starších záznamů)
  T.fmtStamp = function (iso) {
    if (!iso) return '';
    const d = new Date(iso);
    const wd = stampDate.formatToParts(d).find(function (p) { return p.type === 'weekday'; }).value;
    const y = yearOf(d) !== yearOf(new Date()) ? ' ' + yearOf(d) : '';
    return wd + ' | ' + stampDay.format(d) + y + ' ' + tf.format(d);
  };
  // 'YYYY-MM-DD' -> '13. 11.' (rok jen když není letošní)
  function dm(ymd) {
    const p = String(ymd).split('-').map(Number);
    const y = String(p[0]) !== yearOf(new Date()) ? ' ' + p[0] : '';
    return p[2] + '. ' + p[1] + '.' + y;
  }
  T.fmtRange = function (from, to) {
    if (from && to && from !== to) return dm(from) + ' – ' + dm(to);
    const one = from || to;
    if (!one) return '';
    const p = one.split('-').map(Number);
    const wd = new Intl.DateTimeFormat('cs-CZ', { weekday: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(p[0], p[1] - 1, p[2])));
    return wd + ' ' + dm(one);
  };
  T.fmtTime = function (iso) { return iso ? tf.format(new Date(iso)) : ''; };
  T.fmtDayKey = function (iso) {
    return new Intl.DateTimeFormat('cs-CZ', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Prague' })
      .format(new Date(iso));
  };
  // 'YYYY-MM-DD' bez posunu časových pásem
  T.fmtDate = function (ymd) {
    if (!ymd) return '—';
    const p = String(ymd).split('-').map(Number);
    return df.format(new Date(Date.UTC(p[0], p[1] - 1, p[2])));
  };

  // Telefon: ponecháme jen poslední 3 číslice
  T.maskPhone = function (phone) {
    const d = String(phone || '').replace(/\D/g, '');
    return d.length < 6 ? '' : '*** *** ' + d.slice(-3);
  };

  /* ---------- Sledovací kódy ---------- */
  const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // bez 0 O 1 I L
  T.normalizeCode = function (s) { return String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); };
  T.formatCode = function (s) {
    return T.normalizeCode(s).slice(0, 12).replace(/(.{4})(?=.)/g, '$1-');
  };
  T.isCompleteCode = function (s) { return T.normalizeCode(s).length === 12; };
  T.generateCode = function () {
    let out = '';
    const buf = new Uint8Array(32);
    while (out.length < 12) {
      crypto.getRandomValues(buf);
      for (let i = 0; i < buf.length && out.length < 12; i++) {
        if (buf[i] < 248) out += ALPHABET[buf[i] % 31]; // 248 = 31*8, bez zkreslení
      }
    }
    return T.formatCode(out);
  };

  T.maskName = function (name) {
    return String(name || '').trim().split(/\s+/).filter(Boolean).map(function (w) {
      return w[0] + '*'.repeat(Math.min(Math.max(w.length - 1, 2), 5));
    }).join(' ');
  };

  /* ---------- DOM ---------- */
  T.h = function (tag, attrs) {
    const el = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        const v = attrs[k];
        if (v === null || v === undefined || v === false) return;
        if (k === 'class') el.className = v;
        else if (k === 'dataset') Object.assign(el.dataset, v);
        else if (k.slice(0, 2) === 'on' && typeof v === 'function') el.addEventListener(k.slice(2), v);
        else if (v === true) el.setAttribute(k, '');
        else el.setAttribute(k, v);
      });
    }
    for (let i = 2; i < arguments.length; i++) append(el, arguments[i]);
    return el;
  };
  function append(el, c) {
    if (c === null || c === undefined || c === false) return;
    if (Array.isArray(c)) { c.forEach(function (x) { append(el, x); }); return; }
    el.appendChild(c.nodeType ? c : document.createTextNode(String(c)));
  }
  T.clear = function (el) { while (el.firstChild) el.removeChild(el.firstChild); return el; };

  /* ---------- Ikony (vlastní SVG, jednotný tah 1.75) ---------- */
  const ICONS = {
    search:  '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    copy:    '<rect x="9" y="9" width="11" height="11" rx="2.5"/><path d="M5 15V6.5A2.5 2.5 0 0 1 7.5 4H15"/>',
    check:   '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    pin:     '<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z"/><circle cx="12" cy="10" r="2.2"/>',
    box:     '<path d="m3.5 7.8 8.5-4.6 8.5 4.6v8.4L12 20.8l-8.5-4.6Z"/><path d="m3.5 7.8 8.5 4.6 8.5-4.6M12 12.4v8.4"/>',
    plus:    '<path d="M12 5v14M5 12h14"/>',
    out:     '<path d="M9 4.5H6.5A2 2 0 0 0 4.5 6.5v11a2 2 0 0 0 2 2H9"/><path d="M15 8l4 4-4 4M19 12H9.5"/>',
    back:    '<path d="M19 12H5M11 6l-6 6 6 6"/>',
    trash:   '<path d="M4.5 7h15M10 7V4.5h4V7M6.5 7l.8 12.2a1.5 1.5 0 0 0 1.5 1.3h6.4a1.5 1.5 0 0 0 1.5-1.3L17.5 7"/>',
    lock:    '<rect x="5" y="10.5" width="14" height="9.5" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
    eye:     '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="2.8"/>',
    edit:    '<path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17Z"/><path d="m14.5 7.5 3 3"/>',
    link:    '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3A4 4 0 0 0 11 18.700l1-1"/>',
    alert:   '<path d="M12 4 3 19.500h18Z"/><path d="M12 10v4.500M12 17.200v.1"/>',
    x:       '<path d="M6 6l12 12M18 6 6 18"/>',
    help:    '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.6 2.6 0 1 1 3.7 2.4c-.8.4-1.200.9-1.200 1.800M12 17v.1"/>'
  };
  T.icon = function (name, size) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', size || 18);
    svg.setAttribute('height', size || 18);
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.75');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    svg.innerHTML = ICONS[name] || '';
    return svg;
  };

  /* ---------- Drobnosti ---------- */
  T.copyText = async function (text) {
    try { await navigator.clipboard.writeText(text); return true; }
    catch (e) {
      const ta = T.h('textarea', { style: 'position:fixed;opacity:0' });
      ta.value = text; document.body.appendChild(ta); ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (e2) { ok = false; }
      ta.remove();
      return ok;
    }
  };

  T.statusChip = function (key) {
    const s = T.statusInfo(key);
    return T.h('span', { class: 'chip chip--' + s.tone }, T.h('i', { class: 'chip__dot' }), s.label);
  };

  // Prostý horní pruh správy (bez log a značky)
  T.topbar = function (opts) {
    return T.h('header', { class: 'topbar' },
      T.h('div', { class: 'topbar__in' },
        T.h('span', { class: 'topbar__title' }, 'Správa zásilek'),
        T.h('nav', { class: 'topbar__nav', 'aria-label': 'Navigace' },
          T.h('a', { href: opts.root || './' }, 'Sledování zásilek'),
          opts.right || null)));
  };
})();
