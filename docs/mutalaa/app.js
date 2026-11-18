/* مطالعة — واجهة التطبيق */
(function () {
  'use strict';
  const E = window.MutalaaEngine;
  const $ = (s, r = document) => r.querySelector(s);
  const el = (tag, attrs = {}, ...children) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') n.className = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else if (v !== undefined && v !== null && v !== false) n.setAttribute(k, v);
    }
    for (const c of children.flat()) if (c != null) n.append(c.nodeType ? c : document.createTextNode(c));
    return n;
  };
  const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  const isAndroid = !!window.AndroidBridge;

  /* ---------- التخزين ---------- */
  const LS = {
    get(k, d) { try { const v = localStorage.getItem('mutalaa.' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('mutalaa.' + k, JSON.stringify(v)); } catch (e) {} },
  };
  let S = Object.assign({ key: '', model: '', org: ['جمهورية العراق', '', ''], signer: '', title: '', digits: 'ar', last: '', defaultTpl: '' }, LS.get('settings', {}));
  const saveS = () => LS.set('settings', S);

  const DB = (() => {
    let dbp;
    const open = () => dbp || (dbp = new Promise((res, rej) => {
      const r = indexedDB.open('mutalaa', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('templates', { keyPath: 'id' });
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    }));
    const tx = async (mode, fn) => {
      const db = await open();
      return new Promise((res, rej) => {
        const t = db.transaction('templates', mode);
        const st = t.objectStore('templates');
        const out = fn(st);
        t.oncomplete = () => res(out && out.result !== undefined ? out.result : out);
        t.onerror = () => rej(t.error);
      });
    };
    return {
      all: () => tx('readonly', (s) => s.getAll()),
      put: (v) => tx('readwrite', (s) => s.put(v)),
      del: (id) => tx('readwrite', (s) => s.delete(id)),
    };
  })();

  let templates = [];
  async function loadTemplates() {
    try { templates = (await DB.all()).sort((a, b) => a.created - b.created); } catch (e) { templates = []; }
    if (S.defaultTpl && !templates.some((t) => t.id === S.defaultTpl)) S.defaultTpl = '';
    if (!S.defaultTpl && templates[0]) S.defaultTpl = templates[0].id;
  }
  const BUILTIN = { id: 'builtin', name: 'القالب الافتراضي' };
  const tplList = () => (templates.length ? templates : [BUILTIN]);
  const tplById = (id) => tplList().find((t) => t.id === id) || tplList().find((t) => t.id === S.defaultTpl) || tplList()[0];
  async function tplBuffer(t) {
    if (t.id === 'builtin') {
      return E.blankTemplate({ org: S.org, signer: S.signer, title: S.title });
    }
    return t.buf;
  }

  /* ---------- أدوات ---------- */
  function toast(msg, ms = 2600) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove('show'), ms);
  }
  const today = () => new Date();
  const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const arDate = (d, digits) => {
    const s = `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
    return (digits || S.digits) === 'ar' ? E.toArabicDigits(s) : s;
  };
  function parseDateText(txt) {
    const t = E.toLatinDigits(String(txt || '').trim());
    if (!t || /^(اليوم|today)$/i.test(t)) return today();
    if (/^(غدا|غداً|باچر|باجر|بكرة)$/.test(t)) { const d = today(); d.setDate(d.getDate() + 1); return d; }
    let m = /^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})$/.exec(t);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
    m = /^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/.exec(t);
    if (m) return new Date(+m[3], +m[2] - 1, +m[1]);
    return null; // نص حر
  }
  const nextNumber = () => {
    const n = parseInt(E.toLatinDigits(String(S.last || '')).replace(/\D/g, ''), 10);
    return isNaN(n) ? '' : String(n + 1);
  };
  function b64(bytes) {
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }
  const safeName = (s) => String(s || 'كتاب').replace(/[\\/:*?"<>|\n\r]+/g, ' ').trim().slice(0, 60);

  /* ---------- التنقل ---------- */
  function show(view) {
    document.querySelectorAll('.view').forEach((v) => v.classList.toggle('active', v.id === 'view-' + view));
    document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
    if (view === 'templates') renderTemplates();
    if (view === 'history') renderHistory();
    if (view === 'settings') fillSettings();
    if (view === 'chat') scrollChat();
  }
  document.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => show(b.dataset.view)));
  window.handleBack = () => {
    if (!$('#view-chat').classList.contains('active')) { show('chat'); return true; }
    location.href = '../index.html';
    return true;
  };

  /* ---------- المحادثة ---------- */
  const chatBox = $('#chat');
  let history = []; // للذكاء الاصطناعي: {role:'user'|'model', text}
  let wizard = null; // وضع الأسئلة الجاهزة
  let busy = false;

  function scrollChat() { requestAnimationFrame(() => { chatBox.scrollTop = chatBox.scrollHeight; }); }
  function addMsg(role, text) {
    const m = el('div', { class: 'msg ' + role }, text);
    chatBox.append(m);
    scrollChat();
    return m;
  }
  function addChips(list, onPick) {
    const wrap = el('div', { class: 'chips' });
    list.forEach((c) => {
      const label = typeof c === 'string' ? c : c.label;
      wrap.append(el('button', { class: 'chip', type: 'button', onclick: () => { wrap.remove(); onPick(typeof c === 'string' ? c : c.value, label); } }, label));
    });
    chatBox.append(wrap);
    scrollChat();
    return wrap;
  }
  function clearChips() { chatBox.querySelectorAll('.chips').forEach((c) => c.remove()); }

  const KINDS = [
    { value: 'leave', label: 'إجازة' },
    { value: 'memo', label: 'مطالعة' },
    { value: 'logistic', label: 'طلب لوجستي' },
    { value: 'free', label: 'كتاب حر' },
  ];

  function welcome() {
    chatBox.innerHTML = '';
    history = [];
    wizard = null;
    const tpl = tplById(S.defaultTpl);
    const w = el('div', { class: 'welcome' },
      el('h2', {}, 'أهلاً بك في مطالعة'),
      el('p', {}, S.key
        ? 'اكتب طلبك بكلامك العادي، وأنا أكتب الكتاب وأسألك عن أي معلومة ناقصة.'
        : 'اختر نوع الكتاب وأجب عن الأسئلة. (للكتابة الحرة ضع مفتاح Gemini في الإعدادات)'),
      el('p', { class: 'small' }, templates.length ? `النموذج الحالي: ${tpl.name}` : 'لم ترفع نماذج بعد — سأستخدم القالب الافتراضي. ارفع كتبك من تبويب النماذج.'));
    chatBox.append(w);
    addChips(KINDS, (v, label) => startKind(v, label));
  }
  $('#newChat').addEventListener('click', () => { show('chat'); welcome(); });

  function startKind(kind, label) {
    addMsg('user', label);
    if (S.key) {
      const prompts = { leave: 'أريد كتاب طلب إجازة', memo: 'أريد كتابة مطالعة', logistic: 'أريد كتاب طلب لوجستي (تجهيز مواد)', free: 'أريد كتاباً رسمياً' };
      askAI(prompts[kind]);
    } else startWizard(kind);
  }

  // إرسال الرسائل
  const input = $('#input');
  input.addEventListener('input', () => { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 140) + 'px'; });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && window.matchMedia('(min-width: 900px)').matches) { e.preventDefault(); $('#composer').requestSubmit(); }
  });
  $('#composer').addEventListener('submit', (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text || busy) return;
    input.value = '';
    input.style.height = 'auto';
    clearChips();
    addMsg('user', text);
    if (wizard) return wizardAnswer(text);
    if (S.key) return askAI(text);
    addMsg('bot', 'الكتابة الحرة تحتاج مفتاح Gemini من الإعدادات. حالياً اختر نوع الكتاب وأنا أسألك خطوة بخطوة:');
    addChips(KINDS, (v, l) => startKind(v, l));
  });

  /* ---------- وضع الأسئلة الجاهزة (بدون إنترنت) ---------- */
  const skip = (v) => !v || /^(تخطي|لا|لا يوجد|بدون|-)$/.test(v.trim());
  const WIZ = {
    leave: {
      steps: [
        { k: 'name', q: 'اسم الموظف؟' },
        { k: 'kind', q: 'نوع الإجازة؟', chips: ['اعتيادية', 'مرضية', 'زمنية', 'بدون راتب'] },
        { k: 'days', q: 'المدة؟ (مثلاً: ثلاثة أيام، أو ساعتين)' },
        { k: 'from', q: 'اعتباراً من تاريخ؟', chips: ['اليوم', 'غداً'] },
        { k: 'reason', q: 'السبب؟', chips: ['لظروف خاصة', 'تخطي'] },
      ],
      build: (a) => ({
        subject: `طلب إجازة ${a.kind}`,
        body: [
          `يرجى التفضل بالموافقة على منح الموظف (${a.name}) إجازة ${a.kind} لمدة (${a.days}) اعتباراً من تاريخ ${a.fromText}${skip(a.reason) ? '' : ' وذلك ' + a.reason.replace(/^وذلك\s*/, '')}.`,
          'للتفضل بالاطلاع والموافقة.',
        ],
      }),
    },
    memo: {
      steps: [
        { k: 'subject', q: 'موضوع المطالعة؟ (يظهر بعد م/)' },
        { k: 'content', q: 'اكتب الحالة أو الفكرة باختصار' },
        { k: 'request', q: 'ما الذي تقترحه أو تطلبه؟', chips: ['تخطي'] },
      ],
      build: (a) => ({
        subject: a.subject,
        body: [
          `نود إعلام حضرتكم بأن ${a.content.replace(/^(بأن|بان|ان|أن|إن)\s*/, '')}`.replace(/\.?$/, '.'),
          ...(skip(a.request) ? [] : [`عليه نقترح ${a.request}`.replace(/\.?$/, '.')]),
          'للتفضل بالاطلاع وإبداء التوجيه.',
        ],
      }),
    },
    logistic: {
      steps: [
        { k: 'items', q: 'اكتب المواد المطلوبة، كل مادة بسطر مع العدد.\nمثال:\nورق A4 - 10 كارتون\nحبر طابعة - 4' },
        { k: 'reason', q: 'لأي غرض؟', chips: ['لغرض إدامة العمل', 'تخطي'] },
      ],
      build: (a) => {
        const items = a.items.split(/\n|،(?=\s*\S)/).map((x) => x.trim()).filter(Boolean);
        const n = (i) => (S.digits === 'ar' ? E.toArabicDigits(i) : i);
        return {
          subject: 'طلب تجهيز مواد',
          body: [
            `يرجى التفضل بالموافقة على تجهيز مكتبنا بالمواد المبينة أدناه${skip(a.reason) ? '' : ' ' + a.reason.replace(/^ل/, 'ل')}:`,
            ...items.map((it, i) => `${n(i + 1)}- ${it}`),
            'للتفضل بالاطلاع والموافقة.',
          ],
        };
      },
    },
    free: {
      steps: [
        { k: 'subject', q: 'موضوع الكتاب؟ (يظهر بعد م/)' },
        { k: 'text', q: 'اكتب نص الكتاب (كل فقرة بسطر)' },
      ],
      build: (a) => ({ subject: a.subject, body: a.text.split('\n').map((x) => x.trim()).filter(Boolean) }),
    },
  };
  const COMMON = () => {
    const tpl = tplById(S.defaultTpl);
    const meta = tpl.meta || {};
    const steps = [];
    if (templates.length > 1) steps.push({ k: 'tpl', q: 'أي نموذج؟', chips: templates.map((t) => ({ value: t.id, label: t.name })) });
    steps.push({ k: 'to', q: 'الجهة المخاطبة؟ (إلى /)', chips: meta.to ? [{ value: '__same', label: 'نفس جهة النموذج' }] : [] });
    const nx = nextNumber();
    steps.push({ k: 'number', q: 'رقم الكتاب (العدد)؟', chips: [...(nx ? [nx] : []), { value: '__none', label: 'بدون رقم' }] });
    steps.push({ k: 'date', q: 'تاريخ الكتاب؟', chips: ['اليوم'] });
    return steps;
  };

  function startWizard(kind) {
    const def = WIZ[kind];
    wizard = { kind, steps: [...def.steps, ...COMMON()], i: 0, a: {} };
    askStep();
  }
  function askStep() {
    const st = wizard.steps[wizard.i];
    if (!st) return finishWizard();
    addMsg('bot', st.q);
    if (st.chips && st.chips.length) addChips(st.chips, (v, label) => { addMsg('user', label); wizardAnswer(v, true); });
    input.focus();
  }
  function wizardAnswer(v) {
    const st = wizard.steps[wizard.i];
    wizard.a[st.k] = v;
    if (st.k === 'from') {
      const d = parseDateText(v);
      wizard.a.fromText = d ? arDate(d) : v;
    }
    wizard.i++;
    askStep();
  }
  function finishWizard() {
    const { kind, a } = wizard;
    wizard = null;
    const built = WIZ[kind].build(a);
    const tpl = a.tpl ? tplById(a.tpl) : tplById(S.defaultTpl);
    const d = parseDateText(a.date);
    const letter = {
      template_id: tpl.id,
      number: a.number === '__none' ? '' : (a.number || ''),
      date: d ? ymd(d) : (a.date || ''),
      to: a.to === '__same' ? '' : (a.to || ''),
      subject: built.subject,
      body: built.body,
      copies: [],
    };
    addMsg('bot', 'هذه مسودة الكتاب. تقدر تعدّل أي حقل مباشرة، ثم اضغط إنشاء ملف Word.');
    addDraft(letter);
    addChips(KINDS, (v, l) => startKind(v, l));
  }

  /* ---------- الذكاء الاصطناعي (Gemini) ---------- */
  function systemPrompt() {
    const d = today();
    const tl = tplList().map((t) => {
      const m = t.meta || {};
      return {
        id: t.id,
        name: t.name,
        default: t.id === (S.defaultTpl || tplList()[0].id),
        default_to: m.to || '',
        has_greeting_line: !!m.greeting,
        greeting: m.greeting || '',
        has_closing_line: !!m.closing,
        closing: m.closing || '',
        example_subject: m.subject || '',
        example_body: (m.body || []).join('\n').slice(0, 1400),
        example_copies: (m.copies || []).slice(0, 6),
      };
    });
    return `أنت "مطالعة"، مساعد يكتب الكتب الرسمية والمطالعات لدوائر الدولة العراقية، ويتحدث مع الموظف باللهجة العراقية المهذبة وباختصار.
تاريخ اليوم: ${ymd(d)} (${arDate(d)}).
الرقم التالي المقترح للكتاب: ${nextNumber() || 'غير معروف'}.

النماذج المتاحة (كتب سابقة للمستخدم — قلّد أسلوبها وصياغتها بدقة):
${JSON.stringify(tl, null, 1)}

القواعد:
1. افهم ما يريده المستخدم (إجازة، مطالعة، طلب لوجستي، أو أي كتاب رسمي).
2. إذا نقصت معلومة أساسية لا يمكن كتابة الكتاب بدونها (مثل اسم الموظف ومدة الإجازة، أو المواد المطلوبة)، اسأل عنها كلها في رسالة واحدة قصيرة (action = "ask").
3. رقم الكتاب والتاريخ: إذا لم يذكرهما المستخدم في المحادثة، اسأله عنهما مرة واحدة مع اقتراح الرقم التالي وتاريخ اليوم. إذا قال "اليوم" استخدم تاريخ اليوم، وإذا قال "بدون رقم" اترك الرقم فارغاً.
4. الجهة المخاطبة: إذا لم يحددها المستخدم اترك "to" فارغاً (يبقى كما في النموذج). إذا كانت على سطرين (مثل "بواسطة ...") افصل بينهما بـ \n.
5. اكتب المتن بالعربية الفصحى الرسمية بأسلوب الكتب الحكومية العراقية، مختصراً وواضحاً، على شكل فقرات في مصفوفة body.
6. لا تكتب سطر التحية إذا كان النموذج فيه has_greeting_line = true، ولا تكتب سطر الختام (مثل "مع التقدير") إذا كان has_closing_line = true. ويمكن أن تنتهي الفقرة الأخيرة بعبارة مثل "للتفضل بالاطلاع والموافقة".
7. لا تخترع أسماء أو أرقاماً أو تواريخ أو مبالغ لم يذكرها المستخدم.
8. الموضوع (subject) قصير بدون "م/".
9. نسخة منه (copies): اتركها فارغة إلا إذا طلب المستخدم جهات معينة.
10. إذا طلب المستخدم تعديل مسودة سابقة، أعد الكتاب كاملاً بعد التعديل (action = "draft").
11. إذا كان كلام المستخدم لا يتعلق بكتاب رسمي، رد عليه باختصار (action = "chat").

أجب دائماً بـ JSON فقط بهذا الشكل:
{"action":"ask"|"draft"|"chat","message":"رسالة قصيرة للمستخدم","letter":{"template_id":"","number":"","date":"YYYY-MM-DD أو فارغ","to":"","subject":"","body":["فقرة"],"copies":[]}}
عندما يكون action = "draft" يجب أن يكون letter كاملاً. وفي الحالات الأخرى اجعل letter = null.`;
  }

  async function callGemini(contents) {
    const models = [...new Set([S.model || 'gemini-2.5-flash', 'gemini-flash-latest', 'gemini-2.0-flash'].filter(Boolean))];
    let lastErr;
    for (const model of models) {
      let r;
      try {
        r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(S.key.trim())}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: systemPrompt() }] },
            contents,
            generationConfig: { responseMimeType: 'application/json', temperature: 0.4 },
          }),
        });
      } catch (e) {
        throw new Error('لا يوجد اتصال بالإنترنت. تقدر تستخدم الأسئلة الجاهزة بدون إنترنت.');
      }
      if (r.status === 404) { lastErr = new Error('النموذج غير متاح'); continue; }
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        const msg = (j.error && j.error.message) || '';
        if (r.status === 400 && /API key|API_KEY/i.test(msg)) throw new Error('مفتاح Gemini غير صحيح. راجعه في الإعدادات.');
        if (r.status === 403) throw new Error('المفتاح لا يملك صلاحية. أنشئ مفتاحاً جديداً من aistudio.google.com/apikey');
        if (r.status === 429) throw new Error('وصلت للحد المجاني لهذه الدقيقة/اليوم. انتظر قليلاً ثم حاول.');
        if (r.status >= 500) { lastErr = new Error('خادم Gemini مشغول، حاول بعد قليل.'); continue; }
        throw new Error('خطأ من Gemini: ' + (msg || r.status));
      }
      const parts = (((j.candidates || [])[0] || {}).content || {}).parts || [];
      const text = parts.filter((p) => !p.thought).map((p) => p.text || '').join('').trim();
      if (!text) { lastErr = new Error('لم يصل رد. حاول مرة ثانية.'); continue; }
      if (S.model !== model) { S.model = model; saveS(); }
      return text;
    }
    throw lastErr || new Error('تعذر الاتصال بـ Gemini');
  }

  function parseJSON(text) {
    const t = text.replace(/^```(?:json)?\s*|\s*```$/g, '');
    try { return JSON.parse(t); } catch (e) {
      const m = t.match(/\{[\s\S]*\}/);
      if (m) try { return JSON.parse(m[0]); } catch (e2) {}
    }
    return { action: 'chat', message: text, letter: null };
  }

  async function askAI(text) {
    busy = true;
    $('.send').disabled = true;
    history.push({ role: 'user', text });
    const typing = addMsg('bot typing', '');
    typing.append(el('span', { class: 'dots' }, el('span'), el('span'), el('span')));
    try {
      const contents = history.slice(-16).map((m) => ({ role: m.role, parts: [{ text: m.text }] }));
      const raw = await callGemini(contents);
      const res = parseJSON(raw);
      history.push({ role: 'model', text: JSON.stringify(res) });
      typing.remove();
      if (res.message) addMsg('bot', res.message);
      if (res.action === 'draft' && res.letter) {
        const L = res.letter;
        if (!tplList().some((t) => t.id === L.template_id)) L.template_id = tplById(S.defaultTpl).id;
        L.body = Array.isArray(L.body) ? L.body : String(L.body || '').split('\n').filter(Boolean);
        addDraft(L);
      }
    } catch (e) {
      typing.remove();
      history.pop();
      addMsg('bot', e.message || String(e));
    } finally {
      busy = false;
      $('.send').disabled = false;
    }
  }

  /* ---------- مسودة الكتاب ---------- */
  function addDraft(letter) {
    const card = buildDraft(letter);
    chatBox.append(card);
    scrollChat();
  }
  function buildDraft(letter) {
    const sel = el('select', {}, ...tplList().map((t) => el('option', { value: t.id, selected: t.id === letter.template_id ? '' : null }, t.name)));
    const tpl0 = tplById(letter.template_id);
    const meta = tpl0.meta || {};
    const dObj = letter.date ? parseDateText(letter.date) : today();
    const f = {
      number: el('input', { value: letter.number || '', dir: 'auto', placeholder: '—' }),
      date: el('input', { value: dObj ? arDate(dObj) : (letter.date || ''), dir: 'auto' }),
      to: el('textarea', { rows: 2, placeholder: meta.to || 'الجهة المخاطبة (ولسطر ثاني مثل: بواسطة… اضغط سطر جديد)', style: 'min-height:56px' }),
      subject: el('input', { value: letter.subject || '' }),
      body: el('textarea', { rows: Math.min(14, Math.max(5, (letter.body || []).join('\n').length / 38 | 0)) }),
      copies: el('textarea', { rows: 2, placeholder: 'نسخة منه إلى (كل جهة بسطر) — اختياري', style: 'min-height:56px' }),
    };
    f.body.value = (letter.body || []).join('\n');
    f.to.value = String(letter.to || '').replace(/\s*(بواسطة)/, '\n$1').trim();
    f.copies.value = (letter.copies || []).join('\n');
    sel.addEventListener('change', () => { const m = tplById(sel.value).meta || {}; f.to.placeholder = m.to || 'الجهة المخاطبة'; });
    const read = () => ({
      template_id: sel.value,
      number: f.number.value.trim(),
      date: f.date.value.trim(),
      to: f.to.value.split('\n').map((x) => x.trim()).filter(Boolean).join('\n'),
      subject: f.subject.value.trim(),
      body: f.body.value.split('\n').map((x) => x.trim()).filter(Boolean),
      copies: f.copies.value.split('\n').map((x) => x.trim()).filter(Boolean),
    });
    const icoDown = '<svg viewBox="0 0 24 24"><path d="M12 4v11m0 0l-4-4m4 4l4-4M5 20h14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    const icoShare = '<svg viewBox="0 0 24 24"><circle cx="18" cy="5" r="2.5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="6" cy="12" r="2.5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="18" cy="19" r="2.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8.2 10.8l7.6-4.4M8.2 13.2l7.6 4.4" stroke="currentColor" stroke-width="2"/></svg>';
    const bDown = el('button', { class: 'btn primary', type: 'button' });
    bDown.innerHTML = icoDown + '<span>إنشاء ملف Word</span>';
    const bShare = el('button', { class: 'btn', type: 'button' });
    bShare.innerHTML = icoShare + '<span>مشاركة</span>';
    bDown.addEventListener('click', () => makeDocx(read(), 'save', bDown));
    bShare.addEventListener('click', () => makeDocx(read(), 'share', bShare));
    return el('div', { class: 'sheet' },
      el('div', { class: 'sheet-tag' }, el('span', {}, 'مسودة كتاب'), sel),
      el('div', { class: 'meta' },
        el('div', {}, el('label', {}, 'العدد'), f.number),
        el('div', {}, el('label', {}, 'التاريخ'), f.date)),
      el('div', { class: 'row' }, el('label', {}, 'إلى /'), f.to),
      el('div', { class: 'row subj' }, el('label', {}, 'م /'), f.subject),
      el('div', { class: 'row' }, el('label', {}, 'المتن (كل فقرة بسطر)'), f.body),
      el('div', { class: 'row' }, f.copies),
      el('div', { class: 'actions' }, bDown, bShare));
  }

  async function makeDocx(L, mode, btn) {
    const tpl = tplById(L.template_id);
    if (!L.subject && !L.body.length) return toast('المسودة فارغة');
    const old = btn.innerHTML;
    btn.disabled = true;
    try {
      const buf = await tplBuffer(tpl);
      const d = parseDateText(L.date);
      const { bytes, report } = await E.fill(buf, {
        number: L.number,
        date: d || L.date,
        to: L.to,
        subject: L.subject,
        body: L.body,
        copies: L.copies,
        digits: S.digits,
      });
      const name = safeName(`${L.subject || 'كتاب'}${L.number ? ' - ' + E.toLatinDigits(L.number) : ''}`) + '.docx';
      let ok = mode === 'save' ? await saveFile(name, bytes) : await shareFile(name, bytes);
      if (ok) {
        if (L.number) { S.last = E.toLatinDigits(L.number).replace(/\D/g, '') || S.last; saveS(); }
        addHistory(L);
        const miss = [];
        if (L.number && !report.number) miss.push('العدد');
        if (L.date && !report.date) miss.push('التاريخ');
        if (miss.length) toast(`تم — لكن لم أجد مكان ${miss.join(' و')} في النموذج`, 4000);
      }
    } catch (e) {
      console.error(e);
      toast('تعذر إنشاء الملف: ' + (e.message || e), 4000);
    } finally {
      btn.disabled = false;
      btn.innerHTML = old;
    }
  }

  async function saveFile(name, bytes) {
    if (isAndroid) {
      const r = window.AndroidBridge.saveFile(name, b64(bytes), DOCX_MIME);
      if (r === 'ok') { toast('تم الحفظ في التنزيلات ← مطالعة'); return true; }
      toast(r, 4000);
      return false;
    }
    const url = URL.createObjectURL(new Blob([bytes], { type: DOCX_MIME }));
    const a = el('a', { href: url, download: name });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    toast('تم تنزيل الملف');
    return true;
  }
  async function shareFile(name, bytes) {
    if (isAndroid) {
      const r = window.AndroidBridge.shareFile(name, b64(bytes), DOCX_MIME);
      if (r !== 'ok') { toast(r, 4000); return false; }
      return true;
    }
    const file = new File([bytes], name, { type: DOCX_MIME });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: name }); return true; } catch (e) { return false; }
    }
    return saveFile(name, bytes);
  }

  /* ---------- السجل ---------- */
  function addHistory(L) {
    const h = LS.get('history', []);
    h.unshift({ ts: Date.now(), letter: L });
    LS.set('history', h.slice(0, 150));
  }
  function renderHistory() {
    const box = $('#histList');
    box.innerHTML = '';
    const h = LS.get('history', []);
    if (!h.length) { box.append(el('div', { class: 'empty' }, 'لا توجد كتب بعد.\nالكتب التي تنشئها تظهر هنا.')); return; }
    h.forEach((item, idx) => {
      const L = item.letter;
      const when = new Date(item.ts);
      box.append(el('div', { class: 'card hist' },
        el('div', {},
          el('div', { class: 't' }, L.subject || 'كتاب'),
          el('div', { class: 'd' }, [L.number ? 'العدد ' + L.number : '', L.date || '', arDate(when)].filter(Boolean).join(' · '))),
        el('div', { class: 'acts' },
          el('button', { class: 'btn small', onclick: () => { show('chat'); addMsg('bot', 'نسخة من كتاب سابق — عدّل ما تريد:'); addDraft(Object.assign({}, L, { number: '', date: ymd(today()) })); } }, 'نسخ'),
          el('button', { class: 'btn small danger', onclick: () => { const all = LS.get('history', []); all.splice(idx, 1); LS.set('history', all); renderHistory(); } }, 'حذف'))));
    });
  }

  /* ---------- النماذج ---------- */
  $('#fileInput').addEventListener('change', async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    for (const file of files) {
      if (/\.doc$/i.test(file.name)) { toast('صيغة .doc القديمة غير مدعومة. افتح الملف بالوورد واحفظه بصيغة .docx', 5000); continue; }
      try {
        const buf = await file.arrayBuffer();
        const meta = await E.analyze(buf);
        const t = { id: 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name: file.name.replace(/\.docx$/i, ''), buf, meta, created: Date.now() };
        await DB.put(t);
        if (!S.defaultTpl) { S.defaultTpl = t.id; saveS(); }
        toast('تمت إضافة النموذج');
      } catch (err) {
        console.error(err);
        toast(/zip|Corrupted|signature/i.test(String(err.message || err)) ? 'هذا ليس ملف وورد .docx' : 'تعذر قراءة الملف: ' + (err.message || err), 4000);
      }
    }
    await loadTemplates();
    saveS();
    renderTemplates();
  });

  function renderTemplates() {
    const box = $('#tplList');
    box.innerHTML = '';
    if (!templates.length) {
      box.append(el('div', { class: 'empty' }, 'لا توجد نماذج بعد.\nارفع كتاباً سابقاً من دائرتك (إجازة، مطالعة، أي كتاب رسمي).\nكلما رفعت كتباً أكثر، صار الأسلوب أقرب لأسلوبكم.'));
      return;
    }
    templates.forEach((t) => {
      const m = t.meta || {};
      const fact = (ok, yes, no) => el('span', { class: 'fact' + (ok ? '' : ' no') }, ok ? '✓ ' + yes : '✗ ' + no);
      const name = el('input', { class: 'tpl-name', value: t.name });
      name.addEventListener('change', async () => { t.name = name.value.trim() || t.name; await DB.put(t); });
      const font = m.font && m.font.cs ? `${m.font.cs}${m.font.size ? ' ' + m.font.size : ''}` : '';
      box.append(el('div', { class: 'card' },
        el('div', { class: 'tpl-head' }, name, t.id === S.defaultTpl ? el('span', { class: 'badge' }, 'الافتراضي') : null),
        el('div', { class: 'facts' },
          fact(m.hasLogo, 'شعار', 'بدون شعار'),
          fact(m.number, 'العدد', 'العدد'),
          fact(m.date, 'التاريخ', 'التاريخ'),
          fact(m.to, 'إلى', 'إلى'),
          fact(m.subject, 'الموضوع', 'الموضوع'),
          font ? el('span', { class: 'fact' }, 'الخط: ' + font) : null),
        m.to ? el('p', { class: 'tpl-line' }, el('b', {}, 'إلى: '), m.to) : null,
        m.subject ? el('p', { class: 'tpl-line' }, el('b', {}, 'الموضوع: '), m.subject) : null,
        (m.warnings || []).length ? el('p', { class: 'tpl-line' }, (m.warnings || []).join(' — ')) : null,
        el('div', { class: 'actions' },
          t.id !== S.defaultTpl ? el('button', { class: 'btn small', onclick: () => { S.defaultTpl = t.id; saveS(); renderTemplates(); } }, 'اجعله الافتراضي') : null,
          el('button', { class: 'btn small', onclick: () => testTemplate(t) }, 'تجربة'),
          el('button', { class: 'btn small danger', onclick: async () => { if (!confirm('حذف هذا النموذج؟')) return; await DB.del(t.id); await loadTemplates(); saveS(); renderTemplates(); } }, 'حذف'))));
    });
  }
  async function testTemplate(t) {
    const L = { template_id: t.id, number: nextNumber() || '1', date: ymd(today()), to: '', subject: 'تجربة تطبيق مطالعة', body: ['هذا كتاب تجريبي للتأكد من أن الترويسة والشعار والخط تظهر بشكل صحيح.', 'للتفضل بالاطلاع.'], copies: [] };
    const buf = await tplBuffer(t);
    const { bytes } = await E.fill(buf, Object.assign({}, L, { date: today(), digits: S.digits }));
    await saveFile('تجربة - ' + safeName(t.name) + '.docx', bytes);
  }

  /* ---------- الإعدادات ---------- */
  function fillSettings() {
    $('#setKey').value = S.key || '';
    $('#setModel').value = S.model || '';
    $('#setOrg1').value = S.org[0] || '';
    $('#setOrg2').value = S.org[1] || '';
    $('#setOrg3').value = S.org[2] || '';
    $('#setSigner').value = S.signer || '';
    $('#setTitle').value = S.title || '';
    $('#setLast').value = S.last || '';
    document.querySelectorAll('#setDigits button').forEach((b) => b.classList.toggle('on', b.dataset.v === S.digits));
  }
  document.querySelectorAll('#setDigits button').forEach((b) => b.addEventListener('click', () => {
    S.digits = b.dataset.v;
    document.querySelectorAll('#setDigits button').forEach((x) => x.classList.toggle('on', x === b));
  }));
  $('#saveSettings').addEventListener('click', () => {
    const hadKey = !!S.key;
    S.key = $('#setKey').value.trim();
    S.model = $('#setModel').value.trim();
    S.org = [$('#setOrg1').value.trim(), $('#setOrg2').value.trim(), $('#setOrg3').value.trim()];
    S.signer = $('#setSigner').value.trim();
    S.title = $('#setTitle').value.trim();
    S.last = E.toLatinDigits($('#setLast').value.trim());
    saveS();
    toast('تم الحفظ');
    if (hadKey !== !!S.key) welcome();
  });

  /* ---------- البدء ---------- */
  (async () => {
    await loadTemplates();
    saveS();
    welcome();
    // طلب جاهز قادم من تطبيق دليل الموظف (?q=...)
    try {
      const q = new URLSearchParams(location.search).get('q');
      if (q && q.trim()) {
        input.value = q.trim().slice(0, 1000);
        input.dispatchEvent(new Event('input'));
        input.focus();
        toast('تمت تعبئة الطلب، راجعه واضغط إرسال');
        history.replaceState(null, '', location.pathname);
      }
    } catch (e) {}
    if ('serviceWorker' in navigator && location.protocol === 'https:' && !isAndroid) {
      navigator.serviceWorker.register('../sw.js').catch(() => {});
    }
  })();
})();
