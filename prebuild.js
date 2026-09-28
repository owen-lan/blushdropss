const fs = require('fs');
const path = require('path');

const INPUT = 'merkle.json';
const INDEX_OUT = 'index.json';
const SHARD_DIR = 'shards';

console.log('Reading merkle.json (this takes ~30s)...');
const data = JSON.parse(fs.readFileSync(INPUT, 'utf8'));
const claims = data.claims;
console.log(`Total claims: ${Object.keys(claims).length.toLocaleString()}`);

fs.mkdirSync(SHARD_DIR, { recursive: true });

const index = {};
const buckets = {};

let count = 0;
for (const [addr, claim] of Object.entries(claims)) {
  const a = addr.toLowerCase();
  index[a] = [claim.index, claim.amount];

  const prefix = a.slice(2, 4);
  if (!buckets[prefix]) buckets[prefix] = {};
  buckets[prefix][a] = { proof: claim.proof };

  if (++count % 200000 === 0) console.log(`  processed ${count.toLocaleString()}`);
}

console.log('Writing index.json...');
fs.writeFileSync(INDEX_OUT, JSON.stringify(index));

console.log(`Writing ${Object.keys(buckets).length} shards...`);
for (const [prefix, entries] of Object.entries(buckets)) {
  fs.writeFileSync(path.join(SHARD_DIR, `${prefix}.json`), JSON.stringify(entries));
}

const idxSize = (fs.statSync(INDEX_OUT).size / 1024 / 1024).toFixed(2);
const shardFiles = fs.readdirSync(SHARD_DIR);
let shardTotal = 0, shardMax = 0;
for (const f of shardFiles) {
  const s = fs.statSync(path.join(SHARD_DIR, f)).size;
  shardTotal += s;
  if (s > shardMax) shardMax = s;
}
console.log(`\nDone.`);
console.log(`  index.json:   ${idxSize} MB`);
console.log(`  shards:       ${(shardTotal/1024/1024).toFixed(2)} MB across ${shardFiles.length} files`);
console.log(`  largest shard: ${(shardMax/1024/1024).toFixed(2)} MB`);