import { readFig, id } from './fig.mjs';
const f = readFig(process.argv[2]);
console.log('Message keys:', Object.keys(f.message));
console.log('Nodes:', f.message.nodeChanges.length);
for (const n of f.message.nodeChanges) {
  if (n.type === 'CANVAS' || ['855:12006','855:12926','855:11991'].includes(id(n.guid))) {
    console.log(JSON.stringify(n));
  }
}
