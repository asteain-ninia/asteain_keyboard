// Local layout check from the saved .fig; this is not a Figma-app screenshot.
import fs from 'node:fs';
import { readFig, id } from './fig.mjs';
const [source, output] = process.argv.slice(2);
const { message } = readFig(source);
const nodes = message.nodeChanges;
function pathData(index) {
  const data = Buffer.from(message.blobs[index].bytes);
  const commands = ['Z', 'M', 'L', 'Q', 'C'];
  const lengths = [0, 2, 2, 4, 6];
  let d = '';
  for (let i = 0; i < data.length;) {
    const op = data[i++];
    if (!(op in commands)) throw Error(`Unknown path opcode ${op}`);
    const values = [];
    for (let j = 0; j < lengths[op]; j++, i += 4) values.push(data.readFloatLE(i));
    d += `${commands[op]}${values.join(' ')} `;
  }
  return d;
}
function paint(p) {
  if (!p || p.visible === false) return 'fill="none"';
  const c = p.color;
  return `fill="rgb(${c.r * 255},${c.g * 255},${c.b * 255})" fill-opacity="${(c.a ?? 1) * (p.opacity ?? 1)}"`;
}
function render(n) {
  const t = n.transform;
  let content = '';
  if (n.type === 'TEXT') {
    content = n.derivedTextData.glyphs.map(g => `<path d="${pathData(g.commandsBlob)}" ${paint(n.fillPaints[0])} transform="translate(${g.position.x} ${g.position.y}) scale(${g.fontSize} ${-g.fontSize})"/>`).join('');
  } else {
    for (const [geometry, paints] of [[n.fillGeometry, n.fillPaints], [n.strokeGeometry, n.strokePaints]]) {
      for (const g of geometry ?? []) content += `<path d="${pathData(g.commandsBlob)}" ${paint(paints?.[0])}/>`;
    }
  }
  const children = nodes.filter(c => id(c.parentIndex?.guid) === id(n.guid)).sort((a, b) => a.parentIndex.position < b.parentIndex.position ? -1 : 1);
  return `<g transform="matrix(${t.m00} ${t.m10} ${t.m01} ${t.m11} ${t.m02} ${t.m12})">${content}${children.map(render).join('')}</g>`;
}
const roots = nodes.filter(n => ['追加ガイド（ラテン1補助）', 'お手本文字（ラテン1補助）'].includes(n.name));
if (roots.length !== 2) throw Error('Expected two added groups');
fs.writeFileSync(output, `<svg xmlns="http://www.w3.org/2000/svg" width="1488" height="541" viewBox="-16 785 1488 541"><rect x="-16" y="785" width="1488" height="541" fill="#a76969"/>${roots.map(render).join('')}</svg>`, { flag: 'wx' });
