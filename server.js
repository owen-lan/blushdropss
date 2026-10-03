const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_BASE = process.env.DATA_BASE ||
  'https://github.com/owen-lan/blushdropss/releases/download/v2';



// ---------- In-memory merkle index + shard cache ----------
let LIGHT_INDEX = null;
const SHARD_CACHE = new Map();
const MAX_CACHED_SHARDS = 30;

async function loadIndex() {
  console.log('Fetching index.json...');
  const res = await fetch(`${DATA_BASE}/index.json`);
  if (!res.ok) throw new Error('index fetch failed: ' + res.status);
  LIGHT_INDEX = await res.json();
  console.log(`Loaded ${Object.keys(LIGHT_INDEX).length.toLocaleString()} addresses`);
}

async function getShard(prefix) {
  if (SHARD_CACHE.has(prefix)) return SHARD_CACHE.get(prefix);
  const res = await fetch(`${DATA_BASE}/${prefix}.json`);
  if (!res.ok) return null;
  const shard = await res.json();
  if (SHARD_CACHE.size >= MAX_CACHED_SHARDS) {
    SHARD_CACHE.delete(SHARD_CACHE.keys().next().value);
  }
  SHARD_CACHE.set(prefix, shard);
  return shard;
}

// ---------- Airdrop API ----------
app.get('/api/health', (req, res) => {
  res.json({
    ready: !!LIGHT_INDEX,
    addresses: LIGHT_INDEX ? Object.keys(LIGHT_INDEX).length : 0,
    cachedShards: SHARD_CACHE.size,
  });
});

app.get('/api/check/:address', (req, res) => {
  if (!LIGHT_INDEX) return res.status(503).json({ error: 'warming up' });
  const addr = req.params.address.toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(addr)) return res.status(400).json({ error: 'invalid address' });
  const entry = LIGHT_INDEX[addr];
  if (!entry) return res.json({ eligible: false });
  res.json({ eligible: true, index: entry[0], amount: entry[1] });
});

app.get('/api/proof/:address', async (req, res) => {
  if (!LIGHT_INDEX) return res.status(503).json({ error: 'warming up' });
  const addr = req.params.address.toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(addr)) return res.status(400).json({ error: 'invalid address' });
  if (!LIGHT_INDEX[addr]) return res.status(404).json({ error: 'not in tree' });
  const prefix = addr.slice(2, 4);
  try {
    const shard = await getShard(prefix);
    if (!shard || !shard[addr]) return res.status(404).json({ error: 'proof missing' });
    res.json({ proof: shard[addr].proof });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'shard fetch failed' });
  }
});

// ---------- 0x API proxy (fixes CORS for the 0x-version header) ----------
app.get('/api/0x/quote', async (req, res) => {
  try {
    const apiKey = req.headers['x-api-key'];
    if (!apiKey) return res.status(400).json({ error: 'missing 0x api key' });
    const qs = new URLSearchParams(req.query).toString();
    const r = await fetch(`https://api.0x.org/swap/allowance-holder/quote?${qs}`, {
      headers: { '0x-api-key': apiKey, '0x-version': 'v2' },
    });
    const text = await r.text();
    res.status(r.status).set('Content-Type', 'application/json').send(text);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/0x/trades', async (req, res) => {
  try {
    const apiKey = req.headers['x-api-key'];
    if (!apiKey) return res.status(400).json({ error: 'missing 0x api key' });
    const qs = new URLSearchParams(req.query).toString();
    const r = await fetch(`https://api.0x.org/trade-analytics/swap?${qs}`, {
      headers: { '0x-api-key': apiKey, '0x-version': 'v2' },
    });
    const text = await r.text();
    res.status(r.status).set('Content-Type', 'application/json').send(text);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---------- Static site + page routes ----------
app.use(express.static(path.join(__dirname, 'public')));

app.get('/profile',   (req, res) => res.sendFile(path.join(__dirname, 'public', 'profile.html')));
app.get('/community', (req, res) => res.sendFile(path.join(__dirname, 'public', 'community.html')));
app.get('/support',   (req, res) => res.sendFile(path.join(__dirname, 'public', 'support.html')));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ---------- Start ----------
app.listen(PORT, () => {
  console.log(`Server listening on ${PORT}`);
  loadIndex().catch(e => console.error('Index load failed:', e));
});