(function () {
  'use strict';
  var REMOTE = 'https://mutalaa-app.github.io/mutalaa/guide.json';
  var MUT = 'mutalaa/index.html';
  var DATA = null;
  var S = { view: 'home', cat: null, art: null, q: '', from: null };
  var root = document.getElementById('root'), nav = document.getElementById('nav');

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function toast(t) { var el = document.getElementById('toast'); el.textContent = t; el.classList.add('show'); clearTimeout(toast._t); toast._t = setTimeout(function () { el.classList.remove('show'); }, 2400); }
  function norm(s) { return String(s || '').toLowerCase().replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/[ً-ْ]/g, ''); }

  var IC = {
    home: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg>',
    rules: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 4h11a3 3 0 0 1 3 3v13H7a3 3 0 0 1-3-3z"/><path d="M8 8h6M8 12h6"/></svg>',
    procedures: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h3"/></svg>',
    letters: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>',
    faq: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5V14M12 17.5v.01"/></svg>',
    write: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M9 13h6M9 17h4"/></svg>',
    more: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="8" r="3.5"/><path d="M5 20c1-4 4-6 7-6s6 2 7 6"/></svg>',
    book: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 21V5M9 7h6"/></svg>',
    search: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>',
    chev: '<svg class="chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 6l-6 6 6 6"/></svg>',
    back: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 6l6 6-6 6"/></svg>'
  };

  function catById(id) { for (var i = 0; i < DATA.categories.length; i++) if (DATA.categories[i].id === id) return DATA.categories[i]; return { id: id, name: id }; }
  function artById(id) { for (var i = 0; i < DATA.articles.length; i++) if (DATA.articles[i].id === id) return DATA.articles[i]; return null; }
  function count(cid) { return DATA.articles.filter(function (a) { return a.cat === cid; }).length; }

  function md(t) {
    var h = '', mode = null;
    function close() { if (mode) { h += mode === 'ol' ? '</ol>' : '</ul>'; mode = null; } }
    String(t || '').split('\n').forEach(function (l) {
      var s = l.trim();
      if (!s) { close(); return; }
      if (/^##\s+/.test(s)) { close(); h += '<h3>' + esc(s.replace(/^##\s+/, '')) + '</h3>'; }
      else if (/^\d+[\.\-\)]\s+/.test(s)) { if (mode !== 'ol') { close(); h += '<ol class="steps">'; mode = 'ol'; } h += '<li>' + esc(s.replace(/^\d+[\.\-\)]\s+/, '')) + '</li>'; }
      else if (/^[-•*]\s+/.test(s)) { if (mode !== 'ul') { close(); h += '<ul>'; mode = 'ul'; } h += '<li>' + esc(s.replace(/^[-•*]\s+/, '')) + '</li>'; }
      else { close(); h += '<p>' + esc(s) + '</p>'; }
    });
    close(); return h;
  }

  function itemHTML(a, showCat) {
    return '<button class="item" data-art="' + esc(a.id) + '"><div class="t">' + (showCat ? '<span class="tag">' + esc(catById(a.cat).name) + '</span>' : '') +
      '<b>' + esc(a.title) + '</b>' + (a.summary ? '<small>' + esc(a.summary) + '</small>' : '') + '</div>' + IC.chev + '</button>';
  }
  function head(sub, title, search) {
    return '<header class="top"><div class="org">' + esc(sub) + '</div><h1>' + IC.book + esc(title) + '</h1>' +
      (search ? '<label class="search">' + IC.search + '<input id="q" type="search" placeholder="ابحث: إجازة، عقوبة، مطالعة…" value="' + esc(S.q) + '"></label>' : '') + '</header>';
  }
  var MUT_TILE = '<a class="tile wide seal" href="' + MUT + '"><div class="ic">' + IC.write + '</div><div><b>إنشاء مطالعة أو كتاب رسمي</b><br><span>ملف Word بترويسة دائرتك خلال دقيقة</span></div></a>';

  function vHome() {
    var h = head(DATA.org.name + ' · ' + DATA.org.unit, 'دليل الموظف', true) + '<main>';
    if (S.q.trim()) {
      var q = norm(S.q.trim()), res = DATA.articles.filter(function (a) { return norm(a.title + ' ' + a.summary + ' ' + a.body).indexOf(q) > -1; });
      h += '<div class="sec-title">نتائج البحث (' + res.length + ')</div>';
      h += res.length ? '<div class="list">' + res.map(function (a) { return itemHTML(a, true); }).join('') + '</div>' : '<div class="empty">ما لقينا نتيجة. جرّب كلمة ثانية.</div>';
      return h + '</main>';
    }
    h += '<div class="grid">';
    DATA.categories.forEach(function (c) {
      h += '<button class="tile" data-cat="' + esc(c.id) + '"><div class="ic">' + (IC[c.id] || IC.rules) + '</div><b>' + esc(c.name) + '</b><span>' + count(c.id) + ' موضوع</span></button>';
    });
    h += MUT_TILE + '</div>';
    var pr = DATA.articles.filter(function (a) { return a.cat === 'procedures'; }).slice(0, 4);
    if (pr.length) h += '<div class="sec-title">الإجراءات الأكثر استخداماً</div><div class="list">' + pr.map(function (a) { return itemHTML(a); }).join('') + '</div>';
    return h + '</main>';
  }
  function vCat() {
    var c = catById(S.cat), arts = DATA.articles.filter(function (a) { return a.cat === c.id; });
    var h = head(c.desc || '', c.name, false) + '<main>';
    if (c.id === 'letters') h += '<div class="grid" style="margin-bottom:12px">' + MUT_TILE + '</div>';
    h += arts.length ? '<div class="list">' + arts.map(function (a) { return itemHTML(a); }).join('') + '</div>' : '<div class="empty">لا توجد مواضيع بعد.</div>';
    return h + '</main>';
  }
  function vArt() {
    var a = artById(S.art); if (!a) { S.view = 'home'; return vHome(); }
    var h = '<main style="padding-top:calc(16px + env(safe-area-inset-top))"><button class="back" data-cat="' + esc(a.cat) + '">' + IC.back + esc(catById(a.cat).name) + '</button>' +
      '<article class="doc"><span class="tag">' + esc(catById(a.cat).name) + '</span><h2>' + esc(a.title) + '</h2>' + (a.ref ? '<div class="ref">المرجع: ' + esc(a.ref) + '</div>' : '') + '<div class="body">' + md(a.body) + '</div></article>';
    if (a.cat === 'letters') h += '<a class="cta" href="' + MUT + '">' + IC.write + 'أنشئ كتابك الآن</a>';
    return h + '</main>';
  }
  function vMore() {
    var h = head(DATA.org.name, 'التواصل وحول التطبيق', false) + '<main>';
    h += '<div class="card"><b>أرقام التواصل</b>' + (DATA.org.contacts || []).map(function (c) { return '<div class="contact"><span>' + esc(c.name) + '</span><span>' + esc(c.value) + '</span></div>'; }).join('') + '</div>';
    h += '<div class="card"><b>المحتوى</b><div class="hint">' + DATA.articles.length + ' موضوع · آخر تحديث ' + esc(DATA.updated || '') + '</div><div class="hint">يتحدث المحتوى تلقائياً عند الاتصال بالإنترنت، ويشتغل بدونه.</div></div>';
    h += '<div class="card"><div class="hint">المحتوى للاسترشاد. عند الشك ارجع للنص الرسمي للقانون أو لـ' + esc(DATA.org.unit) + '.</div></div>';
    h += '<p class="credit">تصميم وتطوير <span dir="ltr">Eng. Ahmed Noori</span></p>';
    return h + '</main>';
  }

  function render() {
    var v = S.view, h = v === 'cat' ? vCat() : v === 'art' ? vArt() : v === 'more' ? vMore() : vHome();
    root.innerHTML = h;
    var tab = v === 'art' ? (artById(S.art) || {}).cat : (v === 'cat' ? S.cat : v);
    nav.innerHTML = [['home', 'الرئيسية', 'home'], ['rules', 'الأنظمة', 'rules'], ['procedures', 'الإجراءات', 'procedures'], ['mut', 'المطالعة', 'write'], ['more', 'المزيد', 'more']].map(function (t) {
      if (t[0] === 'mut') return '<a class="tb seal" href="' + MUT + '">' + IC[t[2]] + t[1] + '</a>';
      return '<button class="tb' + (tab === t[0] ? ' on' : '') + '" data-tab="' + t[0] + '">' + IC[t[2]] + t[1] + '</button>';
    }).join('');
    var q = document.getElementById('q');
    if (q) q.addEventListener('input', function () { S.q = q.value; var p = q.selectionStart; render(); var n = document.getElementById('q'); n.focus(); try { n.setSelectionRange(p, p); } catch (e) {} });
  }
  function go(view, extra) { for (var k in extra) S[k] = extra[k]; S.view = view; render(); window.scrollTo(0, 0); }

  function onClick(e) {
    var b = e.target.closest('button'); if (!b) return; var d = b.dataset;
    if (d.tab) { var t = d.tab; if (t === 'rules' || t === 'procedures') go('cat', { cat: t }); else { if (t === 'home') S.q = ''; go(t); } return; }
    if (d.cat) { go('cat', { cat: d.cat }); return; }
    if (d.art) { go('art', { art: d.art, from: S.view === 'home' ? 'home' : 'cat' }); return; }
  }
  root.addEventListener('click', onClick); nav.addEventListener('click', onClick);

  // زر الرجوع في أندرويد
  window.handleBack = function () {
    if (S.view === 'art') { if (S.from === 'home') go('home'); else go('cat', { cat: (artById(S.art) || {}).cat }); return true; }
    if (S.view !== 'home') { go('home'); return true; }
    if (S.q) { S.q = ''; render(); return true; }
    return false;
  };

  // تحميل المحتوى: النسخة المحفوظة ← المرفقة بالتطبيق ← آخر نسخة من الإنترنت
  function cached() { try { return JSON.parse(localStorage.getItem('guide_data') || 'null'); } catch (e) { return null; } }
  function use(d) { if (d && d.articles && (!DATA || (d.version || 0) > (DATA.version || 0))) { DATA = d; return true; } return false; }
  function store(d) { try { localStorage.setItem('guide_data', JSON.stringify(d)); } catch (e) {} }

  use(cached());
  fetch('guide.json', { cache: 'no-cache' }).then(function (r) { return r.json(); })
    .then(function (d) { use(d); }).catch(function () {})
    .then(function () {
      if (!DATA) { root.innerHTML = '<div class="empty">تعذّر تحميل المحتوى.</div>'; return; }
      render();
      if (location.hostname === 'mutalaa-app.github.io') { store(DATA); return; }
      return fetch(REMOTE + '?t=' + Date.now()).then(function (r) { return r.json(); }).then(function (d) {
        if (use(d)) { store(d); render(); toast('تم تحديث محتوى الدليل'); } else store(DATA);
      }).catch(function () {});
    });

  if ('serviceWorker' in navigator && location.protocol === 'https:' && !/Android.*wv/.test(navigator.userAgent)) {
    navigator.serviceWorker.register('sw.js').catch(function () {});
  }
})();
