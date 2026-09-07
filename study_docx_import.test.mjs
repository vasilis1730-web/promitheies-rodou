import { createRequire } from 'node:module';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const S = require('./study_docx_import.js');

function t(text) {
  return `<w:t>${text.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</w:t>`;
}
function p(text, style) {
  const st = style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : '';
  return `<w:p>${st}<w:r>${t(text)}</w:r></w:p>`;
}
function cell(text) {
  return `<w:tc><w:p><w:r>${t(text)}</w:r></w:p></w:tc>`;
}
function row(cells) {
  return `<w:tr>${cells.map(cell).join('')}</w:tr>`;
}
function table(rows) {
  return `<w:tbl>${rows.map(row).join('')}</w:tbl>`;
}
function docXml(parts) {
  return `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${parts.join('')}<w:sectPr/></w:body></w:document>`;
}

test('parses τιμολόγιο with Greek headers and skips totals', () => {
  const xml = docXml([
    p('ΜΕΛΕΤΗ ΠΡΟΜΗΘΕΙΑΣ ΗΛΕΚΤΡΟΛΟΓΙΚΩΝ ΥΛΙΚΩΝ', 'Title'),
    p('ΤΙΜΟΛΟΓΙΟ ΜΕΛΕΤΗΣ', 'Heading1'),
    table([
      ['Α/Α', 'Περιγραφή είδους', 'Μονάδα', 'Ποσότητα', 'Τιμή μονάδας', 'Δαπάνη'],
      ['1', 'Καλώδιο NYM 3×1,5 mm²', 'm', '200', '0,85', '170,00'],
      ['2', 'Μικροαυτόματος 1P 10A C', 'τεμ.', '15', '4,20', '63,00'],
      ['', 'ΓΕΝΙΚΟ ΣΥΝΟΛΟ', '', '', '', '233,00']
    ])
  ]);
  const study = S.parseDocumentXml(xml, 'ilektrologika.docx');
  assert.equal(study.items.length, 2);
  assert.equal(study.items[0].name, 'Καλώδιο NYM 3×1,5 mm²');
  assert.equal(study.items[0].unit, 'm');
  assert.equal(study.items[0].qty, 200);
  assert.equal(study.items[0].price, 0.85);
  assert.equal(study.items[1].unit, 'τεμ.');
  assert.equal(study.guessedGroupCode, 'electrical');
  assert.match(study.title, /ΜΕΛΕΤΗ ΠΡΟΜΗΘΕΙΑΣ/);
});

test('parses table without headers using unit/number heuristic', () => {
  const xml = docXml([
    table([
      ['1', 'Έτοιμο σκυρόδεμα C20/25', 'm³', '12', '95,00', '1.140,00'],
      ['2', 'Τσιμέντο Portland CEM II 42,5', 'kg', '500', '0,18', '90,00']
    ])
  ]);
  const study = S.parseDocumentXml(xml, 'oikodomika.docx');
  assert.equal(study.items.length, 2);
  assert.equal(study.items[0].unit, 'm³');
  assert.equal(study.items[1].name.includes('Τσιμέντο'), true);
  assert.equal(study.guessedGroupCode, 'building');
});

test('attaches άρθρο specs to matching bill items', () => {
  const xml = docXml([
    table([
      ['Άρθρο', 'Περιγραφή', 'Μ.Μ.', 'Ποσότητα', 'Τιμή'],
      ['1', 'Σωλήνας PE 32', 'm', '80', '1,10']
    ]),
    p('ΤΕΧΝΙΚΕΣ ΠΡΟΔΙΑΓΡΑΦΕΣ', 'Heading1'),
    p('Άρθρο 1 — Σωλήνας PE 32', 'Heading2'),
    p('Σωλήνες πολυαιθυλενίου PE 100, SDR 11, κατάλληλοι για πόσιμο νερό, με σήμανση κατασκευαστή.')
  ]);
  const study = S.parseDocumentXml(xml, 'ydravlika.docx');
  assert.equal(study.items.length, 1);
  assert.match(study.items[0].specs || '', /PE 100/);
  assert.equal(study.guessedGroupCode, 'plumbing');
});

test('parses Greek thousands separators in prices', () => {
  assert.equal(S.parseElNumber('1.234,56'), 1234.56);
  assert.equal(S.parseElNumber('12,50 €'), 12.5);
  assert.equal(S.normalizeUnit('τ.μ.'), 'm²');
  assert.equal(S.normalizeUnit('123'), '');
});

test('matchItems distinguishes exact, similar and new', () => {
  const materials = [
    { id: 'a', name: 'Καλώδιο NYM 3×1,5 mm²', unit: 'm' },
    { id: 'b', name: 'Μικροαυτόματος 1P 16A καμπύλη C', unit: 'τεμ.' }
  ];
  const items = [
    { name: 'Καλώδιο NYM 3×1,5 mm²', unit: 'm' },
    { name: 'Μικροαυτόματος 1P 16A C', unit: 'τεμ.' },
    { name: 'Πίνακας εξωτερικός στεγανός IP65', unit: 'τεμ.' }
  ];
  const matched = S.matchItems(items, materials);
  assert.equal(matched[0].match, 'exact');
  assert.equal(matched[1].match, 'similar');
  assert.equal(matched[2].match, 'new');
});

test('sniffBuffer detects OLE .doc and ZIP .docx', () => {
  const ole = new Uint8Array([0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1]);
  const zip = new Uint8Array([0x50, 0x4B, 0x03, 0x04, 0x00, 0x00]);
  assert.equal(S.sniffBuffer(ole), 'doc');
  assert.equal(S.sniffBuffer(zip), 'zip');
});

test('parses a real minimal .docx zip via document.xml inside', () => {
  const xml = docXml([
    p('ΠΡΟΜΗΘΕΙΑ ΑΣΦΑΛΤΙΚΩΝ ΥΛΙΚΩΝ'),
    table([
      ['Περιγραφή είδους', 'Μονάδα μέτρησης', 'Ποσότητα', 'Ενδεικτική τιμή'],
      ['Έτοιμο ψυχρό ασφαλτόμιγμα', 'kg', '1000', '0,42']
    ])
  ]);
  const dir = mkdtempSync(join(tmpdir(), 'docx-'));
  const wordDir = join(dir, 'word');
  execFileSync('mkdir', ['-p', wordDir, join(dir, '_rels')]);
  writeFileSync(join(dir, '[Content_Types].xml'), '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  writeFileSync(join(dir, '_rels', '.rels'), '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  writeFileSync(join(wordDir, 'document.xml'), xml);
  const docxPath = join(dir, 'meleti.docx');
  execFileSync('bash', ['-lc', `cd "${dir}" && zip -q -r meleti.docx "[Content_Types].xml" _rels word`]);
  const buf = readFileSync(docxPath);
  assert.equal(S.sniffBuffer(buf), 'zip');
  const study = S.parseDocumentXml(xml, 'meleti.docx');
  assert.equal(study.items.length, 1);
  assert.equal(study.items[0].name, 'Έτοιμο ψυχρό ασφαλτόμιγμα');
  assert.equal(study.guessedGroupCode, 'asphalt');
});
