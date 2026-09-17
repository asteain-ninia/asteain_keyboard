import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFig, writeFig, id } from './fig.mjs';

const [source, destination] = process.argv.slice(2);
if (!source || !destination) throw new Error('Usage: node add-guide.mjs input.fig output.fig');
if (path.resolve(source) === path.resolve(destination) || fs.existsSync(destination)) {
  throw new Error('Choose a new output file; overwriting is disabled');
}
const sha256 = p => createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const sourceHash = sha256(source);
const f = readFig(source);
const nodes = f.message.nodeChanges;
const originalCount = nodes.length;
const originalNodes = structuredClone(nodes);
assert.deepStrictEqual(f.codec.decodeMessage(f.codec.encodeMessage(f.message)), f.message);

const byId = new Map(nodes.map(n => [id(n.guid), n]));
assert.equal(byId.size, nodes.length, 'Duplicate source node IDs');
const children = parent => nodes.filter(n => id(n.parentIndex?.guid) === id(parent.guid));
const page = nodes.find(n => n.type === 'CANVAS' && n.name === 'ラテン文字');
assert.ok(page, 'ラテン文字 page not found');
const guide = children(page).find(n => n.name === 'ガイド');
assert.ok(guide, 'Existing guide not found');
const rowTemplates = ['大文字', '小文字'].map(name => children(guide).find(n => n.name === name));
assert.ok(rowTemplates.every(Boolean), 'Uppercase/lowercase guide rows not found');

// Only clone plain geometry. Text, instances, and components need additional handling.
function subtree(root) {
  return [root, ...children(root).flatMap(subtree)];
}
const selected = [guide, ...rowTemplates.flatMap(subtree)];
assert.ok(selected.every(n => ['FRAME', 'ROUNDED_RECTANGLE'].includes(n.type)));
const sessionID = Math.max(...nodes.map(n => n.guid.sessionID)) + 1;
assert.ok(sessionID < 0xffffffff);
const remap = new Map(selected.map((n, i) => [id(n.guid), { sessionID, localID: i + 1 }]));
function remapReferences(value) {
  if (!value || typeof value !== 'object' || ArrayBuffer.isView(value)) return value;
  if (Object.keys(value).length === 2 && 'sessionID' in value && 'localID' in value) {
    return remap.get(id(value)) ?? value;
  }
  for (const key of Object.keys(value)) value[key] = remapReferences(value[key]);
  return value;
}
const added = selected.map(n => remapReferences(structuredClone(n)));
const newGuide = added[0];
newGuide.name = '追加ガイド（ローカル編集テスト）';
newGuide.size = { x: guide.size.x, y: 192 };
const right = Math.max(...children(page).map(n => (n.transform?.m02 ?? 0) + (n.size?.x ?? 0)));
const x = Math.ceil((right + 224) / 56) * 56;
newGuide.transform.m02 = x;
newGuide.parentIndex.position = children(page).map(n => n.parentIndex.position).sort().at(-1) + '~';
for (const [i, template] of rowTemplates.entries()) {
  const row = added.find(n => id(n.guid) === id(remap.get(id(template.guid))));
  row.name = i === 0 ? '追加・大文字用' : '追加・小文字用';
  row.transform.m12 = i * 128;
}
nodes.push(...added);
await writeFig(f, destination);

// Reopen the actual ZIP and decode it again, including preserved image/blob data.
const check = readFig(destination);
assert.deepStrictEqual(check.message, f.message);
assert.deepStrictEqual(check.message.nodeChanges.slice(0, originalCount), originalNodes);
assert.deepStrictEqual(check.chunks[0], f.chunks[0]);
assert.deepStrictEqual(Object.keys(check.archive).sort(), Object.keys(f.archive).sort());
for (const [name, bytes] of Object.entries(f.archive)) {
  if (name !== 'canvas.fig') assert.deepStrictEqual(check.archive[name], bytes, name);
}
const ids = new Set(check.message.nodeChanges.map(n => id(n.guid)));
assert.equal(ids.size, nodes.length);
for (const n of added) assert.ok(ids.has(id(n.parentIndex.guid)), `Missing parent: ${id(n.guid)}`);
assert.equal(sha256(source), sourceHash, 'Source changed');
const report = {
  source: path.resolve(source), destination: path.resolve(destination),
  sourceSha256: sourceHash, outputSha256: sha256(destination),
  page: page.name, guide: newGuide.name, guideId: id(newGuide.guid),
  position: { x, y: newGuide.transform.m12 },
  rowCellCounts: rowTemplates.map(n => children(n).length),
  originalNodes: originalCount, addedNodes: added.length, totalNodes: nodes.length,
  checks: ['semantic encode/decode roundtrip', 'all original nodes unchanged',
    'schema, blobs, images and ZIP entry contents preserved', 'unique IDs and valid new parents',
    'source SHA-256 unchanged'],
  figmaImport: 'Not tested; user will import the output into Figma.',
};
fs.writeFileSync(destination + '.report.json', JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify(report, null, 2));
