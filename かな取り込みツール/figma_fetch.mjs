// 使い方: node figma_fetch.mjs <APIパス(クエリ込み)> <保存先>
// 429 (レート制限) は Retry-After を尊重して自動リトライする
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
// トークンは環境変数 FIGMA_TOKEN か、スクリプトと同じ場所の figma_token.txt (gitignore 済み) から
const token = (process.env.FIGMA_TOKEN || readFileSync(join(here, 'figma_token.txt'), 'utf8')).trim();
const [apiPath, outFile] = process.argv.slice(2);
const MAX = 6;

for (let i = 1; i <= MAX; i++) {
  const r = await fetch('https://api.figma.com' + apiPath, { headers: { 'X-Figma-Token': token } });
  if (r.status === 429) {
    const raw = Number(r.headers.get('retry-after')) || 60;
    const ra = Math.min(raw, 90); // 数日単位の Retry-After はクォータ枯渇なので待たない
    console.log(`429 レート制限: retry-after=${raw}s → ${ra}秒待機 (試行 ${i}/${MAX})`);
    await new Promise((res) => setTimeout(res, ra * 1000 + 2000));
    continue;
  }
  const text = await r.text();
  if (!r.ok) {
    console.error('HTTP', r.status, text.slice(0, 300));
    process.exit(1);
  }
  writeFileSync(outFile, text);
  console.log('OK', text.length, 'bytes ->', outFile);
  process.exit(0);
}
console.error('リトライ上限に達した');
process.exit(1);
