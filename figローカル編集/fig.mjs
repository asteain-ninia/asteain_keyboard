import fs from 'node:fs';
import { inflateRawSync } from 'node:zlib';
import { unzipSync, zipSync } from 'fflate';
import { decompress } from 'fzstd';
import kiwi from 'kiwi-schema';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export function readFig(path) {
  const archive = unzipSync(fs.readFileSync(path));
  const canvas = Buffer.from(archive['canvas.fig']);
  if (canvas.subarray(0, 8).toString() !== 'fig-kiwi') throw new Error('Unsupported canvas header');
  const chunks = [];
  for (let p = 12; p < canvas.length;) {
    const length = canvas.readUInt32LE(p); p += 4;
    if (p + length > canvas.length) throw new Error('Truncated chunk');
    chunks.push(canvas.subarray(p, p + length)); p += length;
  }
  const inflate = b => b.readUInt32LE(0) === 0xfd2fb528 ? decompress(b) : inflateRawSync(b);
  const schema = kiwi.decodeBinarySchema(inflate(chunks[0]));
  const codec = kiwi.compileSchema(schema);
  const raw = inflate(chunks[1]);
  const message = codec.decodeMessage(raw);
  return { archive, canvas, chunks, schema, codec, raw, message };
}

export const id = guid => guid ? `${guid.sessionID}:${guid.localID}` : null;

export async function writeFig(f, path) {
  const compressed = spawnSync('python', [fileURLToPath(new URL('./compress.py', import.meta.url))], {
    input: f.codec.encodeMessage(f.message), maxBuffer: 128 * 1024 * 1024,
    windowsHide: true,
  });
  if (compressed.error || compressed.status !== 0) {
    throw new Error(`Zstandard compression failed: ${compressed.error ?? compressed.stderr.toString()}`);
  }
  const payload = compressed.stdout;
  const chunks = [f.chunks[0], payload, ...f.chunks.slice(2)];
  const parts = [f.canvas.subarray(0, 12)];
  for (const chunk of chunks) {
    const size = Buffer.alloc(4); size.writeUInt32LE(chunk.length);
    parts.push(size, chunk);
  }
  const archive = { ...f.archive, 'canvas.fig': Buffer.concat(parts) };
  // Exclusive creation: never overwrite a source or a previous experiment.
  fs.writeFileSync(path, zipSync(archive, { level: 0 }), { flag: 'wx' });
}
