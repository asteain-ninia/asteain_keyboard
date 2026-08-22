// かなもじページの構造 (セクション → 行グループ) を取得して rows.json に書き出す。
//   node figma_structure.mjs <出力先rows.json> [取得済みの応答.json]
// 第2引数を渡すと API を呼ばず、その JSON (…?ids=…&depth=3 の応答) から作る。
// /v1/files?ids=... を使う (/v1/files/.../nodes とは別のレート制限枠で、こちらの方が生きやすい)。
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const token = (process.env.FIGMA_TOKEN || readFileSync(join(here, 'figma_token.txt'), 'utf8')).trim();
const FILE_KEY = 'MjWgTZUrTpt7BFMZ70W790';
const PAGE = 'かなもじ';
const GRID_Y = 444;
const CELL_H = 64;

const out = process.argv[2] || 'rows.json';
const cached = process.argv[3];

async function api(path) {
  const r = await fetch('https://api.figma.com' + path, { headers: { 'X-Figma-Token': token } });
  const j = await r.json();
  if (!r.ok || j.err) throw new Error(`${r.status} ${j.err || ''} (Retry-After: ${r.headers.get('retry-after') || '-'})`);
  return j;
}

let detail;
if (cached) {
  detail = JSON.parse(readFileSync(cached, 'utf8'));
} else {
  // ① ページ直下 (セクション) を取る
  const top = await api(`/v1/files/${FILE_KEY}?depth=2`);
  const page = top.document.children.find((c) => c.name === PAGE);
  if (!page) throw new Error(`ページ "${PAGE}" が見つからない`);
  const sections = page.children.filter((c) => c.name in { 基本カタカナ: 1, 濁点付き: 1, 小書き: 1 });
  if (!sections.length) throw new Error('セクション (基本カタカナ/濁点付き/小書き) が見つからない');
  // ② セクションの中の行グループを取る
  // depth はドキュメント根からの深さ: 1=ページ, 2=セクション, 3=行グループ
  const ids = sections.map((s) => s.id).join(',');
  detail = await api(`/v1/files/${FILE_KEY}?ids=${encodeURIComponent(ids)}&depth=3`);
}
const dpage = detail.document.children.find((c) => c.name === PAGE);

const rows = [];
for (const sec of dpage.children) {
  if (!(sec.name in { 基本カタカナ: 1, 濁点付き: 1, 小書き: 1 })) continue;
  const base = Math.floor((sec.absoluteBoundingBox.y - GRID_Y) / CELL_H); // セクションの先頭升目行
  for (const row of sec.children || []) {
    rows.push({
      id: row.id,
      name: row.name,
      section: sec.name,
      sectionBaseRow: base,
      absoluteBoundingBox: row.absoluteBoundingBox,
    });
  }
  console.log(`${sec.name}: ${(sec.children || []).length} 行 (先頭升目行 ${base})`);
}

writeFileSync(out, JSON.stringify({ rows }, null, 1));
console.log(`計 ${rows.length} 行 -> ${out}`);
console.log('ids=' + rows.map((r) => r.id).join(','));
