import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readFig, writeFig, id } from './fig.mjs';

const [source, destination] = process.argv.slice(2);
if (!source || !destination) throw Error('Usage: node add-sample-guides.mjs input.fig output.fig');
assert.notEqual(path.resolve(source), path.resolve(destination));
assert.ok(!fs.existsSync(destination), 'Output already exists');
const hash = p => createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const sourceHash = hash(source);
const f = readFig(source);
const original = structuredClone(f.message);
const nodes = f.message.nodeChanges;
const children = parent => nodes.filter(n => id(n.parentIndex?.guid) === id(parent.guid));
const page = nodes.find(n => n.type === 'CANVAS' && n.name === 'ラテン文字');
assert.ok(page);
assert.ok(!children(page).some(n => n.name.startsWith('追加ガイド')), 'Use the original .fig as input');
const templateGuide = children(page).find(n => n.name === 'ガイド');
const templateRow = children(templateGuide).find(n => n.name === '大文字');
const cells = children(templateRow).sort((a, b) => a.transform.m02 - b.transform.m02);
assert.equal(cells.length, 26);
const templateTextGroup = children(page).find(n => n.name === '文字配列');
const templateText = children(templateTextGroup).find(n => n.name === '大文字');
assert.equal(templateText.fontName.family, 'MS Gothic');
const caps = Array.from({ length: 31 }, (_, i) => String.fromCodePoint(0xC0 + i)).filter(ch => ch !== '×');
const lower = Array.from({ length: 33 }, (_, i) => String.fromCodePoint(0xDF + i)).filter(ch => ch !== '÷');
const rows = [
  { name: 'ラテン1・大文字1', chars: caps.slice(0, 26) },
  { name: 'ラテン1・大文字2', chars: caps.slice(26) },
  { name: 'ラテン1・小文字1', chars: lower.slice(0, 26) },
  { name: 'ラテン1・小文字2', chars: lower.slice(26) },
];
const generated = spawnSync('python', [fileURLToPath(new URL('./font-samples.py', import.meta.url))], {
  input: JSON.stringify([...caps, ...lower]), encoding: 'utf8', windowsHide: true,
});
assert.equal(generated.status, 0, generated.stderr);
const fontSamples = JSON.parse(generated.stdout);
const sessionID = Math.max(...nodes.map(n => n.guid.sessionID)) + 1;
let localID = 0;
const added = [];
function clone(n, parent, position) {
  const copy = structuredClone(n);
  copy.guid = { sessionID, localID: ++localID };
  copy.parentIndex = { guid: parent.guid, position };
  added.push(copy);
  return copy;
}
function cloneTree(n, parent) {
  assert.ok(['FRAME', 'ROUNDED_RECTANGLE'].includes(n.type));
  const copy = clone(n, parent, n.parentIndex.position);
  for (const ch of children(n)) cloneTree(ch, copy);
  return copy;
}
const bottom = Math.max(...children(page).map(n => n.transform.m12 + (n.size?.y ?? 0)));
const y = templateGuide.transform.m12 + Math.ceil((bottom + 128 + 61 - templateGuide.transform.m12) / 128) * 128;
const position = children(page).map(n => n.parentIndex.position).sort().at(-1) + '~';
const guide = clone(templateGuide, page, position);
guide.name = '追加ガイド（ラテン1補助）';
guide.transform.m02 = templateGuide.transform.m02;
guide.transform.m12 = y;
guide.size = { x: 1456, y: 448 };
const textGroup = clone(templateTextGroup, page, position + '~');
textGroup.name = 'お手本文字（ラテン1補助）';
textGroup.transform.m02 = guide.transform.m02;
textGroup.transform.m12 = y - 61;
textGroup.size = { x: 1456, y: 444 };
textGroup.locked = true;
const newBlobStart = f.message.blobs.length;

for (const [r, definition] of rows.entries()) {
  const row = clone(templateRow, guide, String.fromCharCode(33 + r));
  row.name = definition.name;
  row.transform.m12 = r * 128;
  row.size.x = definition.chars.length * 56;
  for (const [c, ch] of definition.chars.entries()) {
    const cell = cloneTree(cells[c], row);
    cell.name = `${ch} U+${ch.codePointAt(0).toString(16).toUpperCase()}`;
    const sample = fontSamples[ch];
    const commandsBlob = f.message.blobs.length;
    f.message.blobs.push({ bytes: new Uint8Array(Buffer.from(sample.blob, 'base64')) });
    const text = clone(templateText, textGroup, String.fromCharCode(33 + r) + String.fromCharCode(33 + c));
    text.name = cell.name;
    const advance = sample.advance * text.fontSize;
    text.transform.m02 = c * 56 + (56 - advance) / 2;
    text.transform.m12 = r * 128;
    text.size = { x: advance, y: 60 };
    text.letterSpacing = { value: 0, units: 'PIXELS' };
    text.textTracking = 0;
    text.textData = { characters: ch, lines: structuredClone(templateText.textData.lines) };
    const d = structuredClone(templateText.derivedTextData);
    d.layoutSize = { ...text.size };
    d.baselines[0].width = advance;
    d.baselines[0].endCharacter = 1;
    d.glyphs = [{ ...d.glyphs[0], commandsBlob, firstCharacter: 0, advance: sample.advance }];
    d.logicalIndexToCharacterOffsetMap = [0];
    text.derivedTextData = d;
  }
}
nodes.push(...added);
await writeFig(f, destination);
const check = readFig(destination);
assert.deepStrictEqual(check.message, f.message);
assert.deepStrictEqual(check.message.nodeChanges.slice(0, original.nodeChanges.length), original.nodeChanges);
assert.deepStrictEqual(check.message.blobs.slice(0, newBlobStart), original.blobs);
for (const [key, value] of Object.entries(original)) {
  if (!['nodeChanges', 'blobs'].includes(key)) assert.deepStrictEqual(check.message[key], value);
}
assert.deepStrictEqual(check.chunks[0], f.chunks[0]);
for (const [name, value] of Object.entries(f.archive)) {
  if (name !== 'canvas.fig') assert.deepStrictEqual(check.archive[name], value);
}
const ids = new Set(nodes.map(n => id(n.guid)));
assert.equal(ids.size, nodes.length);
for (const n of added) assert.ok(ids.has(id(n.parentIndex.guid)));
const textNodes = added.filter(n => n.type === 'TEXT');
assert.equal(textNodes.length, 62);
assert.equal(new Set(textNodes.map(n => n.textData.characters)).size, 62);
assert.ok(textGroup.transform.m12 >= bottom + 128);
assert.equal(hash(source), sourceHash);
const report = {
  source, destination, sourceSha256: sourceHash, outputSha256: hash(destination),
  guidePosition: { x: guide.transform.m02, y }, samplePosition: { x: textGroup.transform.m02, y: y - 61 },
  rows: rows.map(r => ({ name: r.name, characters: r.chars.join(''), cells: r.chars.length })),
  addedNodes: added.length, addedTextOutlines: textNodes.length,
  checks: ['full output decode equality', 'original nodes and blobs unchanged', 'images and schema unchanged',
    'unique IDs, valid parents', '62 unique text samples', 'placed below existing content', 'source hash unchanged'],
  figmaImport: 'User verification pending',
};
fs.writeFileSync(destination + '.report.json', JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify(report, null, 2));
