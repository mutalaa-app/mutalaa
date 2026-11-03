/* مطالعة — محرك ملفات الوورد
 * يقرأ كتاباً رسمياً سابقاً (docx) ويستخرج منه القالب، ثم يملأ كتاباً جديداً بنفس الشكل.
 * يعمل في المتصفح (JSZip + DOMParser) ويمكن تشغيله في Node للاختبار.
 */
(function (root) {
  'use strict';
  const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const XML_NS = 'http://www.w3.org/XML/1998/namespace';
  const AR = '٠١٢٣٤٥٦٧٨٩';

  const env = {
    JSZip: root.JSZip,
    DOMParser: root.DOMParser,
    XMLSerializer: root.XMLSerializer,
  };

  const toArabicDigits = (s) => String(s).replace(/[0-9]/g, (d) => AR[d]);
  const toLatinDigits = (s) => String(s).replace(/[٠-٩]/g, (d) => AR.indexOf(d));
  const hasArabicDigits = (s) => /[٠-٩]/.test(s);

  /* ---------- أدوات XML ---------- */
  function kids(node, local) {
    const out = [];
    for (let n = node.firstChild; n; n = n.nextSibling) {
      if (n.nodeType === 1 && n.namespaceURI === W && (!local || n.localName === local)) out.push(n);
    }
    return out;
  }
  function all(node, local) {
    return Array.from(node.getElementsByTagNameNS(W, local));
  }
  function walk(node, fn) {
    for (let n = node.firstChild; n; n = n.nextSibling) {
      if (n.nodeType !== 1) continue;
      if (n.localName === 'txbxContent') continue; // مربعات النص فقراتها مستقلة
      if (n.localName === 'pPr') continue;
      fn(n);
      walk(n, fn);
    }
  }
  function segments(p) {
    const segs = [];
    walk(p, (n) => {
      if (n.namespaceURI !== W) return;
      if (n.localName === 't') segs.push({ node: n, text: n.textContent || '' });
      else if (n.localName === 'tab' && n.parentNode && n.parentNode.localName === 'r') segs.push({ node: null, text: '\t' });
      else if ((n.localName === 'br' || n.localName === 'cr') && n.parentNode && n.parentNode.localName === 'r') segs.push({ node: null, text: '\n' });
    });
    return segs;
  }
  function textOf(node) {
    if (node.localName === 'p') return segments(node).map((s) => s.text).join('');
    return all(node, 'p').map((p) => segments(p).map((s) => s.text).join('')).join('\n');
  }
  function hasDrawing(node) {
    return all(node, 'drawing').length > 0 || node.getElementsByTagName('v:imagedata').length > 0 || node.getElementsByTagName('w:pict').length > 0;
  }
  function setText(tNode, text) {
    tNode.textContent = text;
    tNode.setAttributeNS(XML_NS, 'xml:space', 'preserve');
  }
  // يستبدل النص بين موضعين داخل فقرة مع الحفاظ على تنسيق المقاطع
  function replaceRange(p, start, end, newText) {
    const segs = segments(p);
    let pos = 0;
    let placed = false;
    if (start === end) {
      for (const s of segs) {
        const a = pos, b = pos + s.text.length;
        pos = b;
        if (s.node && a <= start && start <= b) {
          const off = start - a;
          setText(s.node, s.text.slice(0, off) + newText + s.text.slice(off));
          return true;
        }
      }
      return false;
    }
    for (const s of segs) {
      const a = pos, b = pos + s.text.length;
      pos = b;
      if (b <= start || a >= end || !s.node) continue;
      const ls = Math.max(start, a) - a;
      const le = Math.min(end, b) - a;
      setText(s.node, s.text.slice(0, ls) + (placed ? '' : newText) + s.text.slice(le));
      placed = true;
    }
    return placed;
  }

  /* ---------- أنماط الحقول ---------- */
  const RX = {
    number: /(العدد|الرقم|رقم الكتاب)\s*[:：\/\-]?\s*/,
    date: /(التاريخ|تاريخ)\s*[:：\/\-]?\s*/,
    to: /^\s*(إلى|الى|الي|إلي|السيد|السادة)\s*[\/:／\-]?\s*/,
    toStrict: /^\s*(إلى|الى|الي|إلي)\s*[\/:／\-]?\s*/,
    subj: /^\s*(م|الموضوع)\s*[\/:／]\s*/,
    closing: /(مع\s+(فائق\s+)?(التقدير|الاحترام|الشكر)|ولكم\s+(منا\s+)?(فائق\s+|جزيل\s+|وافر\s+)?(الشكر|الاحترام|التقدير)|مع\s+وافر)/,
    copies: /^\s*(نسخة|نسخه|نسخ)\s+(منه|منها)/,
    greet: /^\s*(تحية\s+طيبة|تحيه\s+طيبه|السلام\s+عليكم|بعد\s+التحية|تحية\s+وتقدير|تحية)/,
  };

  function findValue(text, labelRx, kind) {
    const m = labelRx.exec(text);
    if (!m) return null;
    // يجب أن تبدأ التسمية في أول السطر أو بعد مسافة/فاصل
    const before = text.slice(0, m.index);
    if (before && !/[\s\t\n:]$/.test(before)) return null;
    const vStart = m.index + m[0].length;
    let rest = text.slice(vStart);
    let len;
    if (kind === 'date') {
      const dm = /^[0-9٠-٩][0-9٠-٩\/\-\.\s]*[0-9٠-٩]|^[0-9٠-٩]/.exec(rest);
      len = dm ? dm[0].length : 0;
    } else {
      const stop = rest.search(/\t|\n|\s{2,}|التاريخ|تاريخ/);
      len = stop === -1 ? rest.length : stop;
      while (len > 0 && /\s/.test(rest[len - 1])) len--;
    }
    return { start: vStart, end: vStart + len, value: rest.slice(0, len), label: m[0] };
  }

  function dateStyle(sample) {
    const s = toLatinDigits(sample || '');
    const sep = (s.match(/[\/\-\.]/) || ['/'])[0];
    const parts = s.split(/[\/\-\.]/).map((x) => x.trim());
    const ymd = parts.length === 3 && parts[0].length === 4;
    return { sep, ymd, arabic: hasArabicDigits(sample || '') };
  }
  function formatDate(d, style, arabicDefault) {
    const st = style || { sep: '/', ymd: true, arabic: arabicDefault };
    const y = d.getFullYear(), m = d.getMonth() + 1, day = d.getDate();
    const s = st.ymd ? [y, m, day].join(st.sep) : [day, m, y].join(st.sep);
    return st.arabic ? toArabicDigits(s) : s;
  }

  /* ---------- قراءة الملف ---------- */
  async function open(buf) {
    const zip = await env.JSZip.loadAsync(buf);
    const docFile = zip.file('word/document.xml');
    if (!docFile) throw new Error('الملف ليس ملف وورد صالح (docx)');
    const parser = new env.DOMParser();
    const doc = parser.parseFromString(await docFile.async('string'), 'application/xml');
    const parts = [];
    for (const name of Object.keys(zip.files)) {
      if (/^word\/(header|footer)\d*\.xml$/.test(name)) {
        parts.push({ name, doc: parser.parseFromString(await zip.file(name).async('string'), 'application/xml') });
      }
    }
    let styles = null;
    if (zip.file('word/styles.xml')) styles = parser.parseFromString(await zip.file('word/styles.xml').async('string'), 'application/xml');
    return { zip, doc, parts, styles };
  }

  function bodyOf(doc) {
    return all(doc, 'body')[0];
  }
  function blocks(body) {
    // عناصر المتن الرئيسية: فقرات وجداول (مع فتح عناصر sdt)
    const out = [];
    for (const n of kids(body)) {
      if (n.localName === 'sectPr') continue;
      if (n.localName === 'sdt') {
        const c = kids(n, 'sdtContent')[0];
        if (c) { for (const k of kids(c)) out.push(k); continue; }
      }
      out.push(n);
    }
    return out;
  }

  function locate(doc) {
    const body = bodyOf(doc);
    const bl = blocks(body);
    const info = bl.map((n) => ({ node: n, type: n.localName, text: textOf(n).trim(), drawing: hasDrawing(n) }));
    const isP = (i) => info[i] && info[i].type === 'p';
    const firstIdx = (rx, from = 0, maxLen = 400) => {
      for (let i = from; i < info.length; i++) if (isP(i) && info[i].text.length <= maxLen && rx.test(info[i].text)) return i;
      return -1;
    };
    let toIdx = firstIdx(RX.toStrict, 0, 200);
    let subjIdx = firstIdx(RX.subj, 0, 250);
    let start = [toIdx, subjIdx].filter((x) => x >= 0).sort((a, b) => a - b)[0];
    if (start === undefined) {
      // لا توجد "إلى" ولا "م/": نبدأ من أول فقرة طويلة
      start = info.findIndex((x, i) => isP(i) && x.text.length > 50);
      if (start < 0) start = info.length;
    }
    const greetIdx = (() => {
      for (let i = start; i < Math.min(info.length, start + 8); i++) if (isP(i) && info[i].text.length < 60 && RX.greet.test(info[i].text)) return i;
      return -1;
    })();
    let copiesIdx = firstIdx(RX.copies, start + 1, 120);
    let closingIdx = -1, closingEmbedded = false;
    const limit = copiesIdx >= 0 ? copiesIdx : info.length;
    for (let i = Math.max(start, subjIdx, toIdx) + 1; i < limit; i++) {
      if (!isP(i)) continue;
      if (RX.closing.test(info[i].text)) {
        closingIdx = i;
        closingEmbedded = info[i].text.length > 45;
        break;
      }
    }
    let end; // نهاية المنطقة المستبدلة (غير مشمولة)
    if (closingIdx >= 0) end = closingEmbedded ? closingIdx + 1 : closingIdx;
    else {
      let last = -1;
      for (let i = start; i < limit; i++) if (isP(i) && info[i].text.length > 45) last = i;
      end = last >= 0 ? last + 1 : Math.min(limit, start + 1);
    }
    // الفقرة النموذجية للمتن: أطول فقرة بعد الموضوع/التحية
    let protoIdx = -1, best = 0;
    const kept = new Set([toIdx, subjIdx, greetIdx]);
    for (let i = start; i < end; i++) {
      if (!isP(i) || kept.has(i)) continue;
      const L = info[i].text.length;
      if (L > best) { best = L; protoIdx = i; }
    }
    return { body, blocks: bl, info, toIdx, subjIdx, greetIdx, start, end, closingIdx, closingEmbedded, copiesIdx, protoIdx };
  }

  function firstRunProps(p) {
    for (const r of all(p, 'r')) {
      if (all(r, 't').some((t) => (t.textContent || '').trim())) {
        const rp = kids(r, 'rPr')[0];
        return rp || null;
      }
    }
    const r = all(p, 'r')[0];
    return r ? kids(r, 'rPr')[0] || null : null;
  }

  function readFont(rPr) {
    if (!rPr) return {};
    const f = kids(rPr, 'rFonts')[0];
    const sz = kids(rPr, 'szCs')[0] || kids(rPr, 'sz')[0];
    const g = (el, a) => (el ? el.getAttributeNS(W, a) || el.getAttribute('w:' + a) : null);
    return { cs: g(f, 'cs'), ascii: g(f, 'ascii'), size: sz ? Number(g(sz, 'val')) / 2 : null };
  }

  /* ---------- تحليل النموذج ---------- */
  async function analyze(buf) {
    const d = await open(buf);
    const L = locate(d.doc);
    const res = {
      number: null, date: null, to: '', subject: '', greeting: '', closing: '',
      closingEmbedded: L.closingEmbedded, copies: [], body: [], fullText: '',
      hasLogo: false, font: {}, warnings: [],
    };
    // العدد والتاريخ: في الترويسة أو قبل بداية المتن
    const candidates = [];
    for (const part of d.parts) for (const p of all(part.doc, 'p')) candidates.push({ p, where: 'header' });
    for (let i = 0; i < L.start; i++) {
      const n = L.blocks[i];
      if (n.localName === 'p') candidates.push({ p: n, where: 'body' });
      else for (const p of all(n, 'p')) candidates.push({ p, where: 'body' });
    }
    for (const c of candidates) {
      const t = segments(c.p).map((s) => s.text).join('');
      if (t.length > 90) continue;
      if (!res.number) { const v = findValue(t, RX.number, 'number'); if (v) res.number = { sample: v.value }; }
      if (!res.date) { const v = findValue(t, RX.date, 'date'); if (v) res.date = { sample: v.value, style: dateStyle(v.value) }; }
    }
    res.hasLogo = d.parts.some((p) => p.name.includes('header') && hasDrawing(p.doc.documentElement)) ||
      L.blocks.slice(0, Math.max(L.start, 1)).some(hasDrawing);
    const val = (i, rx) => (i >= 0 ? L.info[i].text.replace(rx, '').trim() : '');
    res.to = val(L.toIdx, RX.toStrict);
    res.subject = val(L.subjIdx, RX.subj);
    res.greeting = L.greetIdx >= 0 ? L.info[L.greetIdx].text : '';
    if (L.closingIdx >= 0 && !L.closingEmbedded) res.closing = L.info[L.closingIdx].text;
    const kept = new Set([L.toIdx, L.subjIdx, L.greetIdx]);
    for (let i = L.start; i < L.end; i++) if (!kept.has(i) && L.info[i].text) res.body.push(L.info[i].text);
    if (L.copiesIdx >= 0) for (let i = L.copiesIdx + 1; i < L.info.length; i++) if (L.info[i].text) res.copies.push(L.info[i].text.replace(/^[\s\-–•·]+/, ''));
    res.fullText = L.info.map((x) => x.text).filter(Boolean).join('\n');
    const proto = L.protoIdx >= 0 ? L.blocks[L.protoIdx] : L.blocks[L.start];
    res.font = proto ? readFont(firstRunProps(proto)) : {};
    if (!res.font.cs && d.styles) {
      const rd = all(d.styles, 'rPrDefault')[0];
      if (rd) res.font = readFont(kids(rd, 'rPr')[0]);
    }
    if (!res.number) res.warnings.push('لم أجد حقل "العدد" — سيبقى كما هو في الملف');
    if (!res.date) res.warnings.push('لم أجد حقل "التاريخ" — سيبقى كما هو في الملف');
    if (L.toIdx < 0) res.warnings.push('لم أجد سطر "إلى /"');
    if (L.subjIdx < 0) res.warnings.push('لم أجد سطر الموضوع "م /"');
    return res;
  }

  /* ---------- إنشاء فقرة بنفس تنسيق فقرة أخرى ---------- */
  function makePara(doc, proto, text) {
    const p = doc.createElementNS(W, 'w:p');
    const pPr = proto ? kids(proto, 'pPr')[0] : null;
    if (pPr) {
      const c = pPr.cloneNode(true);
      for (const n of kids(c, 'numPr')) c.removeChild(n);
      for (const n of kids(c, 'rPr')) c.removeChild(n);
      p.appendChild(c);
    } else {
      const c = doc.createElementNS(W, 'w:pPr');
      c.appendChild(doc.createElementNS(W, 'w:bidi'));
      p.appendChild(c);
    }
    const lines = String(text).split('\n');
    const r = doc.createElementNS(W, 'w:r');
    const rPr = proto ? firstRunProps(proto) : null;
    if (rPr) r.appendChild(rPr.cloneNode(true));
    else {
      const rp = doc.createElementNS(W, 'w:rPr');
      rp.appendChild(doc.createElementNS(W, 'w:rtl'));
      r.appendChild(rp);
    }
    lines.forEach((line, i) => {
      if (i) r.appendChild(doc.createElementNS(W, 'w:br'));
      const t = doc.createElementNS(W, 'w:t');
      setText(t, line);
      r.appendChild(t);
    });
    p.appendChild(r);
    return p;
  }

  function replaceLabelValue(p, rx, value) {
    const text = segments(p).map((s) => s.text).join('');
    const m = rx.exec(text);
    if (!m) return false;
    const start = m.index + m[0].length;
    let end = text.length;
    while (end > start && /\s/.test(text[end - 1])) end--;
    return replaceRange(p, start, end, value);
  }

  /* ---------- ملء كتاب جديد ---------- */
  // data: { number, date (Date|string), to, subject, body: [..], copies: [..] }
  async function fill(buf, data) {
    const d = await open(buf);
    const L = locate(d.doc);
    const report = { number: false, date: false };

    // 1) العدد والتاريخ
    const dateStr = (style) => {
      if (!data.date) return null;
      if (data.date instanceof Date) return formatDate(data.date, style);
      let s = String(data.date).trim();
      if (style) s = style.arabic ? toArabicDigits(s) : toLatinDigits(s);
      return s;
    };
    const editFields = (p) => {
      const t = segments(p).map((s) => s.text).join('');
      if (t.length > 90) return;
      if (data.number != null && data.number !== '' && !report.number) {
        const v = findValue(t, RX.number, 'number');
        if (v) {
          let num = String(data.number).trim();
          const pm = /^(\D*?)([0-9٠-٩]+)(\D*)$/.exec(v.value);
          if (pm && /^[0-9٠-٩]+$/.test(num)) num = pm[1] + num + pm[3]; // احتفظ بالرمز مثل "ق/"
          num = hasArabicDigits(v.value) ? toArabicDigits(num) : (v.value ? toLatinDigits(num) : (data.digits === 'ar' ? toArabicDigits(num) : num));
          let label = '';
          if (!v.value && !/\s$/.test(v.label)) label = ' ';
          replaceRange(p, v.start, v.end, label + num);
          report.number = true;
        }
      }
      const t2 = segments(p).map((s) => s.text).join('');
      if (data.date && !report.date) {
        const v = findValue(t2, RX.date, 'date');
        if (v) {
          const st = v.value ? dateStyle(v.value) : { sep: '/', ymd: true, arabic: data.digits ? data.digits === 'ar' : hasArabicDigits(t2) };
          replaceRange(p, v.start, v.end, (!v.value && !/\s$/.test(v.label) ? ' ' : '') + dateStr(st));
          report.date = true;
        }
      }
    };
    for (const part of d.parts) for (const p of all(part.doc, 'p')) editFields(p);
    for (let i = 0; i < L.start; i++) {
      const n = L.blocks[i];
      if (n.localName === 'p') editFields(n);
      else for (const p of all(n, 'p')) editFields(p);
    }

    // 2) الجهة والموضوع
    if (data.to && L.toIdx >= 0) replaceLabelValue(L.blocks[L.toIdx], RX.toStrict, data.to);
    if (data.subject && L.subjIdx >= 0) replaceLabelValue(L.blocks[L.subjIdx], RX.subj, data.subject);

    // 3) المتن
    const body = L.body;
    const proto = L.protoIdx >= 0 ? L.blocks[L.protoIdx] : (L.blocks[L.end - 1] || L.blocks[L.start]);
    const keptIdx = new Set([L.toIdx, L.subjIdx, L.greetIdx].filter((x) => x >= 0));
    const region = [];
    for (let i = L.start; i < L.end; i++) region.push({ i, node: L.blocks[i], kept: keptIdx.has(i), empty: !L.info[i].text && !L.info[i].drawing });
    // إذا لم يُعثر على "إلى" ولا "م/" نضيف السطرين قبل المتن
    const newNodes = [];
    if (L.subjIdx < 0 && data.subject) newNodes.push(makePara(d.doc, proto, 'م / ' + data.subject));
    for (const line of data.body || []) newNodes.push(makePara(d.doc, proto, line));
    const firstContent = region.findIndex((x) => !x.kept && !x.empty);
    let lastContent = -1;
    region.forEach((x, k) => { if (!x.kept && !x.empty) lastContent = k; });
    const anchor = L.blocks[L.end] || null; // ما بعد المنطقة
    const parentOf = (n) => n.parentNode;
    const container = region.length ? parentOf(region[0].node) : (anchor ? parentOf(anchor) : body);
    // احذف المحتوى القديم والفراغات بينه
    region.forEach((x, k) => {
      if (x.kept) return;
      if (firstContent >= 0 && k >= firstContent && k <= lastContent) parentOf(x.node).removeChild(x.node);
    });
    // موضع الإدراج: قبل أول فراغ لاحق للمحتوى القديم، أو قبل ما بعد المنطقة
    let insertBefore = anchor;
    if (lastContent >= 0 && lastContent + 1 < region.length) insertBefore = region[lastContent + 1].node;
    else if (firstContent < 0) {
      // لا يوجد محتوى قديم: أدرج بعد آخر سطر محفوظ
      const lastKept = [...region].reverse().find((x) => x.kept);
      insertBefore = lastKept ? lastKept.node.nextSibling : anchor;
    }
    const sectPr = kids(body, 'sectPr')[0];
    for (const n of newNodes) {
      if (insertBefore && insertBefore.parentNode) insertBefore.parentNode.insertBefore(n, insertBefore);
      else if (sectPr) body.insertBefore(n, sectPr);
      else container.appendChild(n);
    }

    // 4) نسخة منه
    if (Array.isArray(data.copies) && data.copies.length && L.copiesIdx >= 0) {
      const items = [];
      for (let i = L.copiesIdx + 1; i < L.blocks.length; i++) if (L.blocks[i].localName === 'p' && L.info[i].text) items.push(L.blocks[i]);
      const itemProto = items[0] || L.blocks[L.copiesIdx];
      const prefix = items.length && /^\s*[-–•·]/.test(L.info[L.blocks.indexOf(items[0])].text) ? '- ' : '';
      const after = items.length ? items[items.length - 1].nextSibling : L.blocks[L.copiesIdx].nextSibling;
      const parent = L.blocks[L.copiesIdx].parentNode;
      const fresh = data.copies.map((c) => makePara(d.doc, itemProto, prefix + c));
      for (const it of items) it.parentNode.removeChild(it);
      for (const n of fresh) {
        if (after && after.parentNode === parent) parent.insertBefore(n, after);
        else if (sectPr && sectPr.parentNode === parent) parent.insertBefore(n, sectPr);
        else parent.appendChild(n);
      }
    }

    // 5) الحفظ
    const ser = new env.XMLSerializer();
    d.zip.file('word/document.xml', ser.serializeToString(d.doc));
    for (const part of d.parts) d.zip.file(part.name, ser.serializeToString(part.doc));
    const out = await d.zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    return { bytes: out, report };
  }

  /* ---------- قالب افتراضي (عند عدم رفع أي نموذج) ---------- */
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  async function blankTemplate(opts) {
    const o = Object.assign({ org: ['جمهورية العراق'], signer: '', title: '', font: 'Simplified Arabic', size: 14 }, opts || {});
    const sz = o.size * 2;
    const rpr = (b, u, s) => `<w:rPr><w:rFonts w:ascii="${esc(o.font)}" w:hAnsi="${esc(o.font)}" w:cs="${esc(o.font)}"/>${b ? '<w:b/><w:bCs/>' : ''}${u ? '<w:u w:val="single"/>' : ''}<w:sz w:val="${s || sz}"/><w:szCs w:val="${s || sz}"/><w:rtl/></w:rPr>`;
    const P = (text, { b, u, jc, ind, s, after } = {}) =>
      `<w:p><w:pPr><w:bidi/>${after != null ? `<w:spacing w:after="${after}"/>` : ''}${ind ? `<w:ind w:firstLine="${ind}"/>` : ''}${jc ? `<w:jc w:val="${jc}"/>` : ''}</w:pPr>` +
      (text ? `<w:r>${rpr(b, u, s)}<w:t xml:space="preserve">${esc(text)}</w:t></w:r>` : '') + '</w:p>';
    const orgLines = (o.org || []).filter(Boolean);
    const right = orgLines.map((l) => P(l, { b: true, after: 0 })).join('') || P('');
    const left = P('العدد : ', { b: true, after: 0 }) + P('التاريخ : ', { b: true, after: 0 });
    const cell = (inner, w) => `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/></w:tcPr>${inner}</w:tc>`;
    const header = `<w:tbl><w:tblPr><w:bidiVisual/><w:tblW w:w="9360" w:type="dxa"/><w:tblBorders><w:bottom w:val="single" w:sz="8" w:color="1E3A5F"/></w:tblBorders></w:tblPr><w:tblGrid><w:gridCol w:w="5600"/><w:gridCol w:w="3760"/></w:tblGrid><w:tr>${cell(right, 5600)}${cell(left, 3760)}</w:tr></w:tbl>`;
    const body =
      header + P('') +
      P('إلى / ', { b: true }) +
      P('م / ', { b: true, u: true }) +
      P('تحية طيبة ...') +
      P('نص الكتاب', { ind: 720, jc: 'both' }) +
      P('') + P('مع التقدير', { b: true, jc: 'center' }) + P('') +
      P(o.signer || '', { b: true, jc: 'right', after: 0 }) + P(o.title || '', { b: true, jc: 'right' });
    const docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="${W}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="567" w:footer="567" w:gutter="0"/><w:bidi/></w:sectPr></w:body></w:document>`;
    const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="${W}"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${esc(o.font)}" w:hAnsi="${esc(o.font)}" w:cs="${esc(o.font)}"/><w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/><w:rtl/><w:lang w:bidi="ar-IQ"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:bidi/><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style></w:styles>`;
    const zip = new env.JSZip();
    zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>');
    zip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
    zip.file('word/_rels/document.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>');
    zip.file('word/document.xml', docXml);
    zip.file('word/styles.xml', styles);
    return zip.generateAsync({ type: 'uint8array' });
  }

  const Engine = { analyze, fill, blankTemplate, formatDate, toArabicDigits, toLatinDigits, env };
  if (typeof module !== 'undefined' && module.exports) module.exports = Engine;
  root.MutalaaEngine = Engine;
})(typeof window !== 'undefined' ? window : globalThis);
