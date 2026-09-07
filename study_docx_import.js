/* Δήμος Ρόδου — Ανάλυση μελετών Word (.docx)
 * Εξάγει είδη/εργασίες, μονάδες, ποσότητες, τιμές και προδιαγραφές
 * από τυπικά τεύχη μελέτης προμήθειας (τιμολόγιο, προϋπολογισμός, τεχνικές προδιαγραφές).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.StudyDocxImport = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const OLE_MAGIC = [0xD0, 0xCF, 0x11, 0xE0];
  const ZIP_MAGIC = [0x50, 0x4B];

  const TOTAL_RE = /^(γενικο\s+)?συνολο|καθαρη\s+αξια|φπα|απροβλεπτα|εργολαβικο\s+οφελος|δαπανη\s+με\s+φπα|δαπανη\s+χωρις\s+φπα|στρογγυλοποιηση|κρατησεις|συνολικη\s+δαπανη$/;
  const HEADERISH_RE = /περιγραφ|ειδος|υλικ|εργασι|μοναδα|ποσοτ|τιμη|δαπαν|α\/α|αρθρο|προδιαγραφ/;
  const UNIT_ALIASES = {
    'τεμ': 'τεμ.', 'τεμ.': 'τεμ.', 'τεμαχιο': 'τεμ.', 'τεμαχια': 'τεμ.', 'τμχ': 'τεμ.',
    'piece': 'τεμ.', 'pieces': 'τεμ.', 'pcs': 'τεμ.',
    'm': 'm', 'μετρο': 'm', 'μετρα': 'm', 'τρεχον μετρο': 'm', 'τρεχοντα μετρα': 'm',
    'γραμμικο μετρο': 'm', 'γραμμικα μετρα': 'm', 'μ.': 'm',
    'm2': 'm²', 'm²': 'm²', 'τ.μ.': 'm²', 'τμ': 'm²', 'τετραγωνικο μετρο': 'm²', 'τετραγωνικα μετρα': 'm²',
    'm3': 'm³', 'm³': 'm³', 'κ.μ.': 'm³', 'κμ': 'm³', 'κυβικο μετρο': 'm³', 'κυβικα μετρα': 'm³',
    'kg': 'kg', 'κιλο': 'kg', 'κιλα': 'kg', 'χιλιογραμμο': 'kg', 'χιλιογραμμα': 'kg',
    'lt': 'lt', 'l': 'lt', 'λιτρο': 'lt', 'λιτρα': 'lt',
    'σετ': 'σετ', 'set': 'σετ',
    'ζευγος': 'ζεύγος', 'ζευγη': 'ζεύγος',
    'ρολο': 'ρολό', 'ρολα': 'ρολό',
    'σακος': 'σάκος', 'σακοι': 'σάκος',
    'συσκευασια': 'συσκευασία', 'συσκευασιες': 'συσκευασία',
    'ωρα': 'ώρα', 'ωρες': 'ώρα', 'h': 'ώρα',
    'τεμ/μ': 'τεμ.', 'φυλλο': 'φύλλο', 'φυλλα': 'φύλλο',
    'δοχειο': 'δοχείο', 'δοχεια': 'δοχείο',
    'βαρελι': 'βαρέλι', 'τονος': 't', 't': 't'
  };

  const GROUP_HINTS = [
    { code: 'electrical', re: /ηλεκτρολογ|καλωδι|καλωδ(?!ι)|πινάκ|πινακ(?!ιδ)|φωτιστ|διακοπτ|μικροαυτομ|ρελε|η07v|nym\b|nye\b/ },
    { code: 'building', re: /οικοδομικ|τσιμεντ|σκυροδεμ|τουβλ|σοβα|γυψοσανιδ|πλακιδ|μονωτικ(?!ο χρωμ)/ },
    { code: 'aggregates', re: /αδραν|σκυρα|3α\b|θραυστ|άμμο|αμμο|ρυζακι/ },
    { code: 'asphalt', re: /ασφαλτ|ψυχρ[οό]\s+ασφαλ|bitumen/ },
    { code: 'hardware', re: /σιδηρικ|κιγκαλ|κοχλι|παξιμαδ|ελασμα|κοιλοδοκ|γωνι[αά]|μεντεσ|κλειδαρ/ },
    { code: 'air_conditioning', re: /κλιματιστ|air\s?cond|αντλ[ιί]α\s+θερμοτ|vrv|inverter/ },
    { code: 'plumbing', re: /υδραυλικ|σωλην|βαν[αες]|δικλειδ|φρεατι|αποχετευ|υδρευσ/ },
    { code: 'paint', re: /χρωματ|στεγανωτ|ριπολιν|ασταρι|σιλικον|βερνικ|ελαστομερ/ },
    { code: 'signage', re: /οδικ[ηή]\s+σημανσ|πληροφοριακ[ηή]\s+σημανσ|πινακιδ(?:ες|α)\b|διαγραμμισ|ανακλαστικ[ηή]\s+μεμβραν|\bκ\.?ο\.?κ\.?\b/ },
    { code: 'wood', re: /ξυλει|αντικολλητ|osb|mdf|νοβοπαν/ },
    { code: 'glass', re: /υαλοπινακ|πλεξιγκλ|plexiglas|τζαμ/ },
    { code: 'ppe', re: /\bμαπ\b|ατομικ[ηή]ς\s+προστασ|κραν[οό]ς|γαντ/ },
    { code: 'tools', re: /εργαλει|αναλωσιμ|δισκ[οό]ς\s+κοπ|τρυπαν/ },
    { code: 'urban_equipment', re: /αστικ[οό]ς\s+εξοπλισ|καδ[οό]ς|παγκακ|κολωνακ|παιδικ[ηή]\s+χαρ/ },
    { code: 'SRV01', re: /συντηρηση\s+κλιματιστ/ },
    { code: 'SRV02', re: /εκδοση\s+υδε|\bυδε\b/ },
    { code: 'SRV03', re: /χρωματισμ[οό]ι|διαγραμμισ/ },
    { code: 'SRV04', re: /συντηρηση.{0,24}(οχημ|μηχανημ)/ },
    { code: 'SRV05', re: /απεντομ|μυοκτον|απολυμαν/ },
    { code: 'SRV06', re: /πυροσβεστηρ|αναγομωσ/ },
    { code: 'SRV07', re: /ανελκυστηρ|ανυψωτικ/ },
    { code: 'SRV08', re: /καυστηρ|λεβητ/ }
  ];

  function decodeXml(s) {
    return String(s || '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
      .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
  }

  function norm(s) {
    return String(s || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  }

  function compact(s) {
    return norm(s).replace(/[\s./\-_()]+/g, '');
  }

  function parseElNumber(v) {
    if (v == null) return 0;
    if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
    let s = String(v).trim();
    if (!s) return 0;
    s = s.replace(/\s/g, '').replace(/€/g, '').replace(/eur/ig, '');
    if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.');
    else if (s.includes(',')) s = s.replace(',', '.');
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : 0;
  }

  function looksLikeNumber(s) {
    const t = String(s || '').trim();
    if (!t) return false;
    return /^[+-]?(?:\d{1,3}(?:[.\s]\d{3})+|\d+)(?:[,.]\d+)?(?:\s*€)?$/.test(t);
  }

  function normalizeUnit(v) {
    const raw = String(v || '').replace(/\u00a0/g, ' ').trim();
    if (!raw) return '';
    const c = norm(raw);
    const nospace = c.replace(/\s+/g, '');
    if (/^[+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)(?:€|eur)?$/i.test(nospace)) return '';
    if (UNIT_ALIASES[c]) return UNIT_ALIASES[c];
    if (UNIT_ALIASES[nospace]) return UNIT_ALIASES[nospace];
    if (raw.length <= 12 && /[a-zα-ωµ²µ³]/i.test(raw) && !looksLikeNumber(raw)) return raw;
    return '';
  }

  function sniffBuffer(buf) {
    const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    if (u8.length >= 8 && OLE_MAGIC.every((b, i) => u8[i] === b)) return 'doc';
    if (u8.length >= 2 && ZIP_MAGIC.every((b, i) => u8[i] === b)) return 'zip';
    return 'unknown';
  }

  function xmlTexts(xml) {
    const out = [];
    const re = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g;
    let m;
    while ((m = re.exec(xml))) out.push(decodeXml(m[1]));
    return out.join('').replace(/[ \t]+\n/g, '\n').replace(/\s+/g, ' ').trim();
  }

  function splitBlocks(xml) {
    const bodyMatch = xml.match(/<w:body\b[^>]*>([\s\S]*)<\/w:body>/);
    const inner = bodyMatch ? bodyMatch[1] : xml;
    const blocks = [];
    const re = /<w:tbl\b[\s\S]*?<\/w:tbl>|<w:p\b[\s\S]*?<\/w:p>/g;
    let m;
    while ((m = re.exec(inner))) {
      const chunk = m[0];
      if (chunk.startsWith('<w:tbl')) blocks.push({ type: 'table', xml: chunk });
      else {
        const text = xmlTexts(chunk);
        const styleM = chunk.match(/<w:pStyle\b[^>]*w:val="([^"]+)"/);
        blocks.push({ type: 'p', text: text, style: styleM ? styleM[1] : '' });
      }
    }
    return blocks;
  }

  function tableRows(tblXml) {
    const rows = [];
    const trRe = /<w:tr\b[\s\S]*?<\/w:tr>/g;
    let tr;
    while ((tr = trRe.exec(tblXml))) {
      const cells = [];
      const tcRe = /<w:tc\b[\s\S]*?<\/w:tc>/g;
      let tc;
      while ((tc = tcRe.exec(tr[0]))) cells.push(xmlTexts(tc[0]));
      if (cells.some(c => c)) rows.push(cells);
    }
    return rows;
  }

  function headerKey(cell) {
    return norm(cell).replace(/[:.]/g, '').trim();
  }

  function classifyHeader(h) {
    const k = headerKey(h);
    if (!k) return null;
    if (/^(α\/α|αα|α α|σειρα|aa)$/.test(k) || k === 'αριθμος') return 'ordinal';
    if (/αρθρο|αρθ\b|^art$/.test(k)) return 'article';
    if (/προδιαγραφ|τεχνικη περιγραφ/.test(k)) return 'specs';
    if (/προτυπ|ετεπ|ελοτ|standards/.test(k)) return 'standards';
    if (/\bcpv\b|κωδικος cpv/.test(k)) return 'cpv';
    if (/ποσοτ|quantity|^qty$/.test(k)) return 'qty';
    if (/δαπαν|συνολικη αξια|αξια γραμμ|line total|^cost$/.test(k)) return 'cost';
    if (/τιμη|ενδεικτικ|μον[αά]δας|unit ?price|^price$/.test(k)) return 'price';
    if (/^(μοναδα( μετρ)?|μ μ|μμ|unit|uom)$/.test(k) || /μοναδα μετρ/.test(k)) return 'unit';
    if (/περιγραφ|ειδος|υλικ|εργασι|τιτλος|ονομασι|αντικειμ|^name$/.test(k)) return 'name';
    return null;
  }

  function mapHeaders(headerRow) {
    const map = {};
    headerRow.forEach((h, i) => {
      const kind = classifyHeader(h);
      if (kind && map[kind] == null) map[kind] = i;
    });
    return map;
  }

  function isHeaderRow(row) {
    const keys = (row || []).map(classifyHeader).filter(Boolean);
    return keys.includes('name') && (keys.includes('unit') || keys.includes('price') || keys.includes('qty'));
  }

  function isTotalName(name) {
    return TOTAL_RE.test(norm(name).replace(/[:.]/g, ''));
  }

  function skipRow(name, unit) {
    const n = norm(name);
    if (!n) return true;
    if (isTotalName(n)) return true;
    if (HEADERISH_RE.test(n) && !unit && n.length < 80) {
      if (classifyHeader(name)) return true;
    }
    if (/^ομαδα\s+\d/.test(n)) return true;
    return false;
  }

  function inferMap(rows) {
    const sample = rows.slice(0, 12);
    const width = sample.reduce((m, r) => Math.max(m, r.length), 0);
    const scores = Array.from({ length: width }, () => ({ name: 0, unit: 0, num: 0 }));
    sample.forEach(r => {
      r.forEach((c, i) => {
        if (!c) return;
        if (normalizeUnit(c)) scores[i].unit += 2;
        else if (looksLikeNumber(c)) scores[i].num += 1;
        else if (c.length >= 8) scores[i].name += Math.min(4, Math.round(c.length / 12));
      });
    });
    let nameI = 0, unitI = -1;
    scores.forEach((s, i) => {
      if (s.name > scores[nameI].name) nameI = i;
      if (s.unit && (unitI < 0 || s.unit > scores[unitI].unit)) unitI = i;
    });
    const numCols = scores.map((s, i) => ({ i, n: s.num })).filter(x => x.n >= 2 && x.i !== nameI && x.i !== unitI).map(x => x.i);
    const map = { name: nameI };
    if (unitI >= 0) map.unit = unitI;
    if (numCols[0] != null) map.qty = numCols[0];
    if (numCols[1] != null) map.price = numCols[1];
    if (numCols[2] != null) map.cost = numCols[2];
    if (nameI > 0) map.ordinal = 0;
    return map;
  }

  function cellAt(row, idx) {
    if (idx == null || idx < 0) return '';
    return row[idx] == null ? '' : String(row[idx]).trim();
  }

  function rowToItem(row, map, index) {
    const name = cellAt(row, map.name);
    const unitRaw = cellAt(row, map.unit);
    const unit = normalizeUnit(unitRaw) || (unitRaw && !looksLikeNumber(unitRaw) && unitRaw.length <= 16 ? unitRaw : '');
    if (skipRow(name, unit)) return null;
    if (name.length < 3) return null;
    const qtyRaw = cellAt(row, map.qty);
    const priceRaw = cellAt(row, map.price);
    const costRaw = cellAt(row, map.cost);
    const article = cellAt(row, map.article) || cellAt(row, map.ordinal);
    const specs = cellAt(row, map.specs);
    const standards = cellAt(row, map.standards);
    const cpv = cellAt(row, map.cpv);
    const qty = map.qty != null && hasVal(qtyRaw) ? parseElNumber(qtyRaw) : null;
    let price = map.price != null && hasVal(priceRaw) ? parseElNumber(priceRaw) : null;
    const cost = map.cost != null && hasVal(costRaw) ? parseElNumber(costRaw) : null;
    if ((price == null || price === 0) && cost != null && qty) price = roundMoney(cost / qty);
    return {
      sourceIndex: index,
      article: article || '',
      name: name.replace(/\s+/g, ' ').trim(),
      unit: unit || '',
      qty: qty,
      price: price,
      cost: cost,
      specs: specs,
      standards: standards,
      cpv: cpv,
      selected: true
    };
  }

  function hasVal(v) {
    return v !== undefined && v !== null && String(v).trim() !== '';
  }

  function roundMoney(n) {
    return Math.round(Number(n) * 100) / 100;
  }

  function extractItemsFromTable(rows) {
    if (!rows.length) return [];
    let start = 0;
    let map = null;
    const headerAt = rows.findIndex(isHeaderRow);
    if (headerAt >= 0) {
      map = mapHeaders(rows[headerAt]);
      start = headerAt + 1;
    } else {
      map = inferMap(rows);
      start = 0;
    }
    if (map.name == null) return [];
    const items = [];
    rows.slice(start).forEach((r, i) => {
      if (isHeaderRow(r)) return;
      const it = rowToItem(r, map, start + i);
      if (it) items.push(it);
    });
    return items;
  }

  function isHeading(block) {
    if (block.type !== 'p' || !block.text) return false;
    const t = block.text.trim();
    if (t.length > 140) return false;
    const n = norm(t);
    if (/heading|title|subtitle/i.test(block.style || '')) return true;
    if (/^(τεχνικη εκθεση|τεχνικες προδιαγραφες|ειδικες τεχνικες|γενικες τεχνικες|τιμολογιο|ενδεικτικος προϋπολογισμος|προϋπολογισμος|συγγραφη υποχρεωσεων|περιγραφικο τιμολογιο|ασφαλιστικες|μελετη προμηθειας)/.test(n)) return true;
    if (/^αρθρο\s+\d/.test(n)) return true;
    return false;
  }

  function headingKind(text) {
    const n = norm(text);
    if (/τεχνικη εκθεση|σκοπος|αντικειμενο μελετ/.test(n)) return 'purpose';
    if (/γενικ(ες|η) τεχνικ/.test(n)) return 'groupSpecs';
    if (/ειδικ(ες|η) τεχνικ|προδιαγραφ/.test(n)) return 'itemSpecs';
    if (/τιμολογιο|προϋπολογισμ/.test(n)) return 'bill';
    if (/συγγραφη|ειδικ(οι|η) ορ/.test(n)) return 'special';
    if (/εγγυησ/.test(n)) return 'warranty';
    return 'other';
  }

  function articleKey(text) {
    const m = String(text || '').match(/άρθρο\s*([0-9]+[α-ωa-z]?)/i) || String(text || '').match(/^([0-9]+[α-ωa-z]?(?:\.[0-9]+)*)\s*[\).:-]/);
    return m ? compact(m[1]) : '';
  }

  function attachSpecs(items, specBlocks) {
    if (!items.length || !specBlocks.length) return;
    const byArticle = new Map();
    items.forEach(it => {
      const k = compact(it.article);
      if (k) byArticle.set(k, it);
    });
    specBlocks.forEach(sb => {
      const key = articleKey(sb.title) || compact(sb.title);
      let target = key ? byArticle.get(key) : null;
      if (!target) {
        const tn = norm(sb.title).replace(/^αρθρο\s+\S+\s*/, '');
        target = items.find(it => {
          const n = norm(it.name);
          return tn && (n.includes(tn) || tn.includes(n));
        });
      }
      if (target && sb.body) {
        target.specs = target.specs ? (target.specs + '\n' + sb.body) : sb.body;
      }
    });
  }

  function collectSpecBlocks(blocks) {
    const out = [];
    let cur = null;
    let mode = null;
    blocks.forEach(b => {
      if (b.type !== 'p' || !b.text) return;
      if (isHeading(b)) {
        const kind = headingKind(b.text);
        if (kind === 'itemSpecs' || /^αρθρο\s+\d/.test(norm(b.text))) {
          if (cur) out.push(cur);
          cur = { title: b.text.trim(), body: '' };
          mode = 'item';
          return;
        }
        if (cur) { out.push(cur); cur = null; }
        mode = kind;
        return;
      }
      if (mode === 'item' && cur) {
        cur.body = cur.body ? (cur.body + '\n' + b.text) : b.text;
      }
    });
    if (cur) out.push(cur);
    return out.filter(x => x.body && x.body.length > 20);
  }

  function collectSectionLines(blocks, kind) {
    const lines = [];
    let on = false;
    blocks.forEach(b => {
      if (b.type === 'table') {
        if (on) on = false;
        return;
      }
      if (isHeading(b)) {
        on = headingKind(b.text) === kind;
        return;
      }
      if (on && b.text) lines.push(b.text.trim());
    });
    return uniqueLines(lines);
  }

  function uniqueLines(arr) {
    const seen = new Set();
    const out = [];
    arr.forEach(s => {
      const k = norm(s);
      if (!k || seen.has(k) || k.length < 8) return;
      seen.add(k);
      out.push(s);
    });
    return out;
  }

  function guessTitle(blocks, fileName) {
    const paras = blocks.filter(b => b.type === 'p' && b.text).map(b => b.text.trim());
    const hit = paras.find(p => /μελέτη|προμήθεια|προμηθεια|τεχνικ/i.test(p) && p.length < 180);
    if (hit) return hit.replace(/\s+/g, ' ');
    return (fileName || '').replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ') || 'Μελέτη Word';
  }

  function guessGroupCode(text, title) {
    const n = norm(text);
    const t = norm(title || '');
    let best = null, score = 0;
    GROUP_HINTS.forEach(h => {
      let s = 0;
      const titleHits = t.match(new RegExp(h.re.source, h.re.flags + (h.re.flags.includes('g') ? '' : 'g'))) || [];
      const bodyHits = n.match(new RegExp(h.re.source, 'g')) || [];
      s += titleHits.length * 8 + bodyHits.length;
      if (s > score) { score = s; best = h.code; }
    });
    return score > 0 ? best : null;
  }

  function parseDocumentXml(xml, fileName) {
    const blocks = splitBlocks(xml || '');
    const plain = blocks.filter(b => b.type === 'p').map(b => b.text).join('\n');
    const items = [];
    const seen = new Set();
    blocks.forEach(b => {
      if (b.type !== 'table') return;
      extractItemsFromTable(tableRows(b.xml)).forEach(it => {
        const key = norm(it.name) + '|' + norm(it.unit);
        if (seen.has(key)) return;
        seen.add(key);
        items.push(it);
      });
    });
    attachSpecs(items, collectSpecBlocks(blocks));
    const title = guessTitle(blocks, fileName);
    const hay = title + '\n' + plain.slice(0, 4000) + '\n' + items.map(i => i.name).join(' ');
    return {
      fileName: fileName || '',
      title: title,
      guessedGroupCode: guessGroupCode(hay, title),
      items: items,
      purpose: collectSectionLines(blocks, 'purpose').slice(0, 8),
      groupSpecs: collectSectionLines(blocks, 'groupSpecs').concat(collectSectionLines(blocks, 'itemSpecs')).filter(l => l.length > 20).slice(0, 40),
      special: collectSectionLines(blocks, 'special').slice(0, 20),
      warranty: collectSectionLines(blocks, 'warranty').slice(0, 4),
      paragraphCount: blocks.filter(b => b.type === 'p' && b.text).length,
      tableCount: blocks.filter(b => b.type === 'table').length
    };
  }

  function tokens(s) {
    return norm(s)
      .replace(/[^a-z0-9α-ωμ²μ³×x]+/gi, ' ')
      .split(/\s+/)
      .filter(t => t.length >= 3 || (t.length >= 2 && /\d/.test(t)));
  }

  function nameScore(a, b) {
    const ja = jaccard(a, b);
    const na = norm(a), nb = norm(b);
    if (!na || !nb) return ja;
    if (na === nb) return 1;
    let bonus = 0;
    if (na.includes(nb) || nb.includes(na)) bonus = 0.22;
    return Math.min(1, ja + bonus);
  }

  function jaccard(a, b) {
    const A = new Set(tokens(a));
    const B = new Set(tokens(b));
    if (!A.size || !B.size) return 0;
    let inter = 0;
    A.forEach(t => { if (B.has(t)) inter++; });
    return inter / (A.size + B.size - inter);
  }

  function unitMatchKey(v) {
    return norm(normalizeUnit(v) || v || '');
  }

  function matchItems(items, materials) {
    const mats = materials || [];
    const byExact = new Map();
    mats.forEach(m => {
      byExact.set(norm(m.name) + '|' + unitMatchKey(m.unit), m);
    });
    return (items || []).map(it => {
      const exact = byExact.get(norm(it.name) + '|' + unitMatchKey(it.unit));
      if (exact) {
        return Object.assign({}, it, { match: 'exact', material: exact, score: 1 });
      }
      let best = null, bestScore = 0;
      mats.forEach(m => {
        const sameUnit = !it.unit || !m.unit || unitMatchKey(it.unit) === unitMatchKey(m.unit);
        if (!sameUnit) return;
        const sc = nameScore(it.name, m.name);
        if (sc > bestScore) { bestScore = sc; best = m; }
      });
      if (best && bestScore >= 0.58) {
        return Object.assign({}, it, { match: 'similar', material: best, score: bestScore });
      }
      return Object.assign({}, it, { match: 'new', material: null, score: bestScore });
    });
  }

  async function readZipEntries(arrayBuffer, JSZipLib) {
    if (!JSZipLib) throw new Error('Δεν φορτώθηκε η βιβλιοθήκη ανάγνωσης ZIP/Word.');
    return JSZipLib.loadAsync(arrayBuffer);
  }

  async function parseDocxBuffer(arrayBuffer, fileName, JSZipLib) {
    const kind = sniffBuffer(arrayBuffer);
    if (kind === 'doc') {
      throw new Error('Το αρχείο «' + (fileName || 'μελέτη') + '» είναι παλιό Word (.doc). Αποθηκεύστε το ως .docx και ξαναδοκιμάστε.');
    }
    if (kind !== 'zip') {
      throw new Error('Το αρχείο «' + (fileName || 'μελέτη') + '» δεν αναγνωρίζεται ως Word (.docx).');
    }
    const zip = await readZipEntries(arrayBuffer, JSZipLib);
    const docFile = zip.file('word/document.xml');
    if (!docFile) throw new Error('Το αρχείο δεν περιέχει word/document.xml — δεν είναι έγκυρο .docx.');
    const xml = await docFile.async('string');
    return parseDocumentXml(xml, fileName);
  }

  async function parseStudyFile(file, JSZipLib) {
    const name = (file && file.name) || 'μελέτη';
    const buf = await file.arrayBuffer();
    const lower = name.toLowerCase();
    if (lower.endsWith('.doc') && !lower.endsWith('.docx')) {
      throw new Error('Το αρχείο «' + name + '» είναι παλιό Word (.doc). Αποθηκεύστε το ως .docx.');
    }
    if (lower.endsWith('.zip')) {
      const kind = sniffBuffer(buf);
      if (kind !== 'zip') throw new Error('Το συμπιεσμένο αρχείο δεν είναι έγκυρο ZIP.');
      const zip = await readZipEntries(buf, JSZipLib);
      const names = Object.keys(zip.files).filter(p => {
        const lp = p.toLowerCase();
        return lp.endsWith('.docx') && !p.startsWith('__MACOSX') && !zip.files[p].dir;
      });
      if (!names.length) throw new Error('Το ZIP δεν περιέχει αρχεία .docx.');
      const studies = [];
      for (const p of names) {
        const inner = await zip.files[p].async('arraybuffer');
        studies.push(await parseDocxBuffer(inner, p.split('/').pop(), JSZipLib));
      }
      return studies;
    }
    return [await parseDocxBuffer(buf, name, JSZipLib)];
  }

  return {
    version: '1.0',
    norm: norm,
    parseElNumber: parseElNumber,
    normalizeUnit: normalizeUnit,
    sniffBuffer: sniffBuffer,
    parseDocumentXml: parseDocumentXml,
    extractItemsFromTable: extractItemsFromTable,
    matchItems: matchItems,
    guessGroupCode: guessGroupCode,
    parseStudyFile: parseStudyFile,
    parseDocxBuffer: parseDocxBuffer,
    isTotalName: isTotalName,
    jaccard: jaccard
  };
});
