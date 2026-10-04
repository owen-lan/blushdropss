// ============================================================
// BLUSHDROPS — app.js (final)
// ============================================================

const CONFIG = {
  SPLITTER_ADDRESS: "0x0000000000000000000000000000000000000000",
  RPC_URLS: ["https://eth-mainnet.g.alchemy.com/v2/AkH_F7btslPyNlLzxXJth"],
  UNI_DISTRIBUTOR: "0x090D4613473dEE047c3f2706764f49E0821D256e",
  ZEROX_API_KEY: "8fc750e2-ebc9-4211-b32e-a035fcab239c",
  SWAP_FEE_RECIPIENT: "0xB1204D46fbc488a6606a00ce610e9Cad61483231",
  SWAP_FEE_BPS: 50,
  MOONPAY_API_KEY: "pk_live_YOUR_MOONPAY_KEY",
  TRANSAK_API_KEY: "YOUR_TRANSAK_API_KEY",
  FONBNK_API_KEY: "YOUR_FONBNK_API_KEY",
  COINGECKO_API_KEY: "CG-HCeUwQTSz25aXFu6HmeKwFkN",
  UNI_DECIMALS: 18,
  UNI_PRICE_USD: 8.5,
  USER_SHARE: 0.70,
};

const SPLITTER_ABI = ["function claimAndSplit(uint256 index, address account, uint256 amount, bytes32[] calldata merkleProof) external"];
const IS_CLAIMED_ABI = ["function isClaimed(uint256 index) view returns (bool)"];
const ERC20_ABI = ["function balanceOf(address) view returns (uint256)","function allowance(address,address) view returns (uint256)","function approve(address,uint256) returns (bool)","function decimals() view returns (uint8)"];
const WRAPPED_NATIVE = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const WALLET_STORAGE_KEY = "blushdrops_wallet_rdns";

const CHAINS = {
  1:     { name: "Ethereum", cgPlatform: "ethereum",            native: { symbol: "ETH",   logo: "https://assets.coingecko.com/coins/images/279/small/ethereum.png" } },
  137:   { name: "Polygon",  cgPlatform: "polygon-pos",         native: { symbol: "MATIC", logo: "https://assets.coingecko.com/coins/images/4713/small/matic-token-icon.png" } },
  8453:  { name: "Base",     cgPlatform: "base",                native: { symbol: "ETH",   logo: "https://assets.coingecko.com/coins/images/279/small/ethereum.png" } },
  42161: { name: "Arbitrum", cgPlatform: "arbitrum-one",        native: { symbol: "ETH",   logo: "https://assets.coingecko.com/coins/images/279/small/ethereum.png" } },
  10:    { name: "Optimism", cgPlatform: "optimistic-ethereum", native: { symbol: "ETH",   logo: "https://assets.coingecko.com/coins/images/279/small/ethereum.png" } },
  56:    { name: "BNB",      cgPlatform: "binance-smart-chain", native: { symbol: "BNB",   logo: "https://assets.coingecko.com/coins/images/825/small/bnb-icon2_2x.png" } },
};

// ---------- STATE ----------
let provider = null, signer = null, currentUser = null, readProvider = null;
let currentChainId = 1;
let allTokens = [], selectedSellToken = null, selectedBuyToken = null;
let pickerTarget = null, currentQuote = null;
let priceCache = {}, priceCacheTime = 0, quoteTimer = null;
let visibleTokens = [];
let profileUser = null;
const detectedWallets = new Map();

// ---------- UTIL ----------
function colorForName(name) {
  const c = [["#ff8ac1","#a855f7"],["#7dd3fc","#3b82f6"],["#6ee7b7","#059669"],["#fbbf24","#f59e0b"],["#f472b6","#db2777"]];
  let h = 0; for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return c[Math.abs(h) % c.length];
}
function getReadProvider() {
  if (readProvider) return readProvider;
  const ps = CONFIG.RPC_URLS.map((url, i) => ({ provider: new ethers.providers.JsonRpcProvider(url), priority: i + 1, stallTimeout: 2500, weight: 1 }));
  readProvider = new ethers.providers.FallbackProvider(ps, 1);
  return readProvider;
}
function isValidAddress(a) { return typeof a === "string" && /^0x[a-fA-F0-9]{40}$/.test(a); }

// ---------- CURSOR ----------
(function () {
  const c = document.getElementById("cursor"), d = document.getElementById("cursorDot");
  if (!c || !d) return;
  document.addEventListener("mousemove", (e) => {
    c.style.left = e.clientX + "px"; c.style.top = e.clientY + "px";
    d.style.left = e.clientX + "px"; d.style.top = e.clientY + "px";
  });
})();

// ---------- BASE TOKENS ----------
function getBaseTokens(chainId) {
  const bases = {
    1: [
      { symbol:"ETH",  name:"Ethereum",        address:WRAPPED_NATIVE, logo:"https://assets.coingecko.com/coins/images/279/small/ethereum.png", decimals:18 },
      { symbol:"UNI",  name:"Uniswap",         address:"0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984", logo:"https://assets.coingecko.com/coins/images/12504/small/uniswap-uni.png", decimals:18 },
      { symbol:"USDC", name:"USD Coin",        address:"0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", logo:"https://assets.coingecko.com/coins/images/6319/small/usdc.png", decimals:6 },
      { symbol:"USDT", name:"Tether",          address:"0xdAC17F958D2ee523a2206206994597C13D831ec7", logo:"https://assets.coingecko.com/coins/images/325/small/Tether.png", decimals:6 },
      { symbol:"DAI",  name:"Dai",             address:"0x6B175474E89094C44Da98b954EedeAC495271d0F", logo:"https://assets.coingecko.com/coins/images/9956/small/Badge_Dai.png", decimals:18 },
      { symbol:"WBTC", name:"Wrapped Bitcoin", address:"0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599", logo:"https://assets.coingecko.com/coins/images/7598/small/wrapped_bitcoin_wbtc.png", decimals:8 },
    ],
    137: [
      { symbol:"MATIC", name:"Polygon",  address:WRAPPED_NATIVE, logo:"https://assets.coingecko.com/coins/images/4713/small/matic-token-icon.png", decimals:18 },
      { symbol:"USDC",  name:"USD Coin", address:"0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174", logo:"https://assets.coingecko.com/coins/images/6319/small/usdc.png", decimals:6 },
      { symbol:"USDT",  name:"Tether",   address:"0xc2132D05D31c914a87C6611C10748AEb04B58e8F", logo:"https://assets.coingecko.com/coins/images/325/small/Tether.png", decimals:6 },
    ],
    8453: [
      { symbol:"ETH",  name:"Ethereum",  address:WRAPPED_NATIVE, logo:"https://assets.coingecko.com/coins/images/279/small/ethereum.png", decimals:18 },
      { symbol:"USDC", name:"USD Coin",  address:"0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", logo:"https://assets.coingecko.com/coins/images/6319/small/usdc.png", decimals:6 },
    ],
    42161: [
      { symbol:"ETH",  name:"Ethereum",  address:WRAPPED_NATIVE, logo:"https://assets.coingecko.com/coins/images/279/small/ethereum.png", decimals:18 },
      { symbol:"ARB",  name:"Arbitrum",  address:"0x912CE59144191C1204E64559FE8253a0e49E6548", logo:"https://assets.coingecko.com/coins/images/16547/small/photo_2023-03-29_21.47.00.jpeg", decimals:18 },
      { symbol:"USDC", name:"USD Coin",  address:"0xaf88d065e77c8cC2239327C5EDb3A432268e5831", logo:"https://assets.coingecko.com/coins/images/6319/small/usdc.png", decimals:6 },
    ],
    10: [
      { symbol:"ETH",  name:"Ethereum",  address:WRAPPED_NATIVE, logo:"https://assets.coingecko.com/coins/images/279/small/ethereum.png", decimals:18 },
      { symbol:"OP",   name:"Optimism",  address:"0x4200000000000000000000000000000000000042", logo:"https://assets.coingecko.com/coins/images/25244/small/Optimism.png", decimals:18 },
      { symbol:"USDC", name:"USD Coin",  address:"0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85", logo:"https://assets.coingecko.com/coins/images/6319/small/usdc.png", decimals:6 },
    ],
    56: [
      { symbol:"BNB",  name:"BNB",      address:WRAPPED_NATIVE, logo:"https://assets.coingecko.com/coins/images/825/small/bnb-icon2_2x.png", decimals:18 },
      { symbol:"USDT", name:"Tether",   address:"0x55d398326f99059fF775485246999027B3197955", logo:"https://assets.coingecko.com/coins/images/325/small/Tether.png", decimals:18 },
      { symbol:"USDC", name:"USD Coin", address:"0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", logo:"https://assets.coingecko.com/coins/images/6319/small/usdc.png", decimals:18 },
    ],
  };
  return bases[chainId] || bases[1];
}

// ---------- WALLET UI ----------
function updateWalletUI() {
  const btn = document.getElementById("connectBtn"), txt = document.getElementById("connectText");
  if (!btn || !txt) return;
  if (currentUser) { btn.classList.add("connected"); txt.textContent = currentUser.slice(0,6)+"…"+currentUser.slice(-4); }
  else { btn.classList.remove("connected"); txt.textContent = "Connect"; }
  const input = document.getElementById("addressInput");
  if (input && currentUser && !input.value.trim()) input.value = currentUser;
}

function openWalletModal() {
  const m = document.getElementById("walletModal"); if (!m) return;
  m.classList.remove("hidden"); document.body.style.overflow = "hidden";
  const listEl = document.getElementById("walletList");
  if (listEl && currentUser) {
    listEl.innerHTML = `<div style="padding:16px;border-radius:14px;background:rgba(52,211,153,0.08);border:1px solid rgba(52,211,153,0.3);margin-bottom:12px;">
      <div style="font-size:12px;color:rgba(244,241,255,0.55);margin-bottom:4px;">CONNECTED</div>
      <div style="font-family:'JetBrains Mono',monospace;font-size:14px;word-break:break-all;">${currentUser}</div>
      <button id="disconnectBtn" style="margin-top:12px;padding:8px 16px;border-radius:10px;background:rgba(248,113,113,0.15);border:1px solid rgba(248,113,113,0.35);color:#fca5a5;font-size:13px;cursor:pointer;">Disconnect</button></div>`;
    document.getElementById("disconnectBtn")?.addEventListener("click", () => {
      currentUser = null; signer = null; provider = null;
      try { localStorage.removeItem(WALLET_STORAGE_KEY); } catch (_) {}
      updateWalletUI(); closeWalletModal();
    });
    return;
  }
  refreshWalletList();
}
function closeWalletModal() { const m = document.getElementById("walletModal"); if (m) { m.classList.add("hidden"); document.body.style.overflow = ""; } }

function refreshWalletList() {
  const listEl = document.getElementById("walletList"), emptyEl = document.getElementById("walletEmpty");
  if (!listEl) return;
  listEl.innerHTML = "";
  if (detectedWallets.size === 0) { listEl.classList.add("hidden"); emptyEl?.classList.remove("hidden"); return; }
  listEl.classList.remove("hidden"); emptyEl?.classList.add("hidden");
  for (const [rdns, { info, provider: p }] of detectedWallets) {
    const btn = document.createElement("button");
    btn.className = "wallet-item"; btn.type = "button";
    const icon = info.icon ? `<img src="${info.icon}" />` : (() => { const [c1,c2] = colorForName(info.name); return `<span class="wallet-letter" style="background:linear-gradient(135deg,${c1},${c2})">${info.name[0].toUpperCase()}</span>`; })();
    btn.innerHTML = `<span class="wallet-item-icon">${icon}</span><span class="wallet-item-info"><span class="wallet-item-name">${info.name}</span><span class="wallet-item-tag">Browser extension</span></span><span class="wallet-item-arrow"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 6l6 6-6 6"/></svg></span>`;
    btn.addEventListener("click", () => connectWithProvider(p, rdns));
    listEl.appendChild(btn);
  }
}

async function connectWithProvider(providerObj, rdns) {
  if (!providerObj || typeof ethers === "undefined") return;
  try {
    provider = new ethers.providers.Web3Provider(providerObj);
    await provider.send("eth_requestAccounts", []);
    signer = provider.getSigner();
    currentUser = await signer.getAddress();
    if (rdns) try { localStorage.setItem(WALLET_STORAGE_KEY, rdns); } catch (_) {}
    updateWalletUI(); closeWalletModal();
    providerObj.on?.("accountsChanged", (accts) => {
      if (!accts || accts.length === 0) { currentUser = null; try { localStorage.removeItem(WALLET_STORAGE_KEY); } catch (_) {} }
      else currentUser = accts[0];
      updateWalletUI(); fetchBalances();
    });
    providerObj.on?.("chainChanged", () => window.location.reload());
    const net = await provider.getNetwork();
    currentChainId = net.chainId;
    document.querySelectorAll(".chain-btn").forEach(b => b.classList.toggle("active", +b.dataset.chain === currentChainId));
    await loadTokenList(currentChainId);
    fetchBalances();
    window.dispatchEvent(new CustomEvent("walletConnected", { detail: { address: currentUser } }));
  } catch (err) { if (err.code !== 4001) alert("Failed to connect: " + (err.message || "unknown")); }
}

async function autoReconnect() {
  if (currentUser || typeof ethers === "undefined") return !!currentUser;
  const savedRdns = localStorage.getItem(WALLET_STORAGE_KEY);
  let chosen = null;
  if (savedRdns && detectedWallets.has(savedRdns)) chosen = detectedWallets.get(savedRdns).provider;
  if (!chosen) {
    for (const [rdns, entry] of detectedWallets) {
      try { const a = await entry.provider.request({ method: "eth_accounts" }); if (a?.length) { chosen = entry.provider; try { localStorage.setItem(WALLET_STORAGE_KEY, rdns); } catch (_) {} break; } } catch (_) {}
    }
  }
  if (!chosen && window.ethereum) chosen = window.ethereum;
  if (!chosen) return false;
  try {
    const accounts = await chosen.request({ method: "eth_accounts" });
    if (!accounts?.length) return false;
    provider = new ethers.providers.Web3Provider(chosen);
    signer = provider.getSigner();
    currentUser = accounts[0];
    updateWalletUI();
    const net = await provider.getNetwork();
    currentChainId = net.chainId;
    document.querySelectorAll(".chain-btn").forEach(b => b.classList.toggle("active", +b.dataset.chain === currentChainId));
    await loadTokenList(currentChainId);
    fetchBalances();
    window.dispatchEvent(new CustomEvent("walletConnected", { detail: { address: currentUser } }));
    return true;
  } catch (_) { return false; }
}

function startReconnectLoop() {
  let n = 0;
  const tick = async () => { n++; if (await autoReconnect()) return; if (n < 20) setTimeout(tick, 500); };
  tick();
}

window.addEventListener("eip6963:announceProvider", (e) => {
  const { info, provider: p } = e.detail;
  detectedWallets.set(info.rdns, { info, provider: p });
  refreshWalletList();
});
window.dispatchEvent(new Event("eip6963:requestProvider"));

function legacyDetect() {
  if (detectedWallets.size > 0 || typeof window.ethereum === "undefined") return;
  const list = window.ethereum.providers || [window.ethereum];
  const seen = new Set();
  list.forEach(p => {
    let name, rdns;
    if (p.isBraveWallet) { name="Brave Wallet"; rdns="com.brave.wallet"; }
    else if (p.isRabby) { name="Rabby"; rdns="io.rabby"; }
    else if (p.isMetaMask) { name="MetaMask"; rdns="io.metamask"; }
    else if (p.isCoinbaseWallet) { name="Coinbase Wallet"; rdns="com.coinbase.wallet"; }
    else if (p.isTrust) { name="Trust Wallet"; rdns="com.trustwallet.app"; }
    else if (p.isOKXWallet) { name="OKX Wallet"; rdns="com.okex.wallet"; }
    if (!name || seen.has(rdns)) return;
    seen.add(rdns);
    detectedWallets.set(rdns, { info: { name, icon: null, rdns }, provider: p });
  });
  refreshWalletList();
}
setTimeout(legacyDetect, 300);

// ---------- TOKEN LIST ----------
async function loadTokenList(chainId) {
  if (allTokens.length > 50 && allTokens[0]?.chainId === chainId && selectedSellToken?.address && selectedBuyToken?.address) return;
  const base = getBaseTokens(chainId);
  allTokens = base.map(t => ({ ...t, chainId }));
  selectedSellToken = { ...base[0], chainId };
  selectedBuyToken = { ...(base[1] || base[0]), chainId };
  updateTokenUI();
  const platform = CHAINS[chainId]?.cgPlatform;
  if (!platform) return;
  try {
    const headers = {};
    if (CONFIG.COINGECKO_API_KEY && !CONFIG.COINGECKO_API_KEY.includes("YOUR")) headers["x-cg-demo-api-key"] = CONFIG.COINGECKO_API_KEY;
    const res = await fetch(`https://tokens.coingecko.com/${platform}/all.json`, { headers });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    const seen = new Set(base.map(t => t.address.toLowerCase()));
    (data.tokens || []).forEach(t => {
      if (!t.address || !t.symbol) return;
      const a = t.address.toLowerCase(); if (seen.has(a)) return; seen.add(a);
      allTokens.push({ symbol: t.symbol, name: t.name || t.symbol, address: t.address, logo: t.logoURI || "", decimals: t.decimals ?? 18, chainId });
    });
    console.log(`[tokens] ${allTokens.length} for chain ${chainId}`);
  } catch (e) { console.warn("[tokens] extended failed:", e.message); }
}

function updateTokenUI() {
  if (selectedSellToken) {
    const el = document.getElementById("sellTokenSymbol"); if (el) el.textContent = selectedSellToken.symbol;
    const ic = document.getElementById("sellTokenIcon"); if (ic) { ic.src = selectedSellToken.logo || ""; ic.style.display = selectedSellToken.logo ? "" : "none"; }
  }
  if (selectedBuyToken) {
    const el = document.getElementById("buyTokenSymbol"); if (el) el.textContent = selectedBuyToken.symbol;
    const ic = document.getElementById("buyTokenIcon"); if (ic) { ic.src = selectedBuyToken.logo || ""; ic.style.display = selectedBuyToken.logo ? "" : "none"; }
  }
}

// ---------- TOKEN PICKER ----------
function openTokenPicker(target) {
  pickerTarget = target;
  const m = document.getElementById("tokenPicker"); if (!m) return;
  m.classList.remove("hidden");
  const i = document.getElementById("tokenSearch"); if (i) { i.value = ""; setTimeout(() => i.focus(), 50); }
  renderTokenList(allTokens.slice(0, 50));
}
function closeTokenPicker() { const m = document.getElementById("tokenPicker"); if (m) m.classList.add("hidden"); }
function renderTokenList(tokens) {
  const listEl = document.getElementById("tokenList"); if (!listEl) return;
  listEl.innerHTML = ""; visibleTokens = tokens.slice(0, 100);
  if (!visibleTokens.length) { listEl.innerHTML = `<div class="token-empty">No tokens found</div>`; return; }
  visibleTokens.forEach((t, i) => {
    const it = document.createElement("button");
    it.className = "token-list-item"; it.type = "button"; it.dataset.tokenIndex = i;
    const logo = t.logo ? `<img src="${t.logo}" onerror="this.style.display='none'" />` : `<img src="" style="display:none" />`;
    it.innerHTML = `${logo}<div class="token-list-info"><div class="token-list-symbol">${t.symbol}</div><div class="token-list-name">${t.name}</div></div><div class="token-list-address">${t.address.slice(0,6)}…${t.address.slice(-4)}</div>`;
    listEl.appendChild(it);
  });
}
function selectToken(token) {
  if (!token?.address) return;
  token.chainId = currentChainId;
  if (pickerTarget === "sell") selectedSellToken = token; else selectedBuyToken = token;
  updateTokenUI(); closeTokenPicker();
  setTimeout(() => { fetchBalances(); const a = document.getElementById("sellAmount")?.value; if (a && parseFloat(a) > 0) refreshQuote(); }, 80);
}

// ---------- PRICES ----------
async function fetchPrices(chainId, addrs) {
  const now = Date.now();
  if (now - priceCacheTime < 60000 && Object.keys(priceCache).length) return priceCache;
  const platform = CHAINS[chainId]?.cgPlatform;
  if (!platform || !addrs.length) return priceCache;
  const headers = {};
  if (CONFIG.COINGECKO_API_KEY && !CONFIG.COINGECKO_API_KEY.includes("YOUR")) headers["x-cg-demo-api-key"] = CONFIG.COINGECKO_API_KEY;
  const nativeAddr = WRAPPED_NATIVE.toLowerCase();
  const erc20s = addrs.filter(a => a && a.toLowerCase() !== nativeAddr).map(a => a.toLowerCase());
  const prices = {};

  const nativeIds = { 1:"ethereum", 137:"matic-network", 8453:"ethereum", 42161:"ethereum", 10:"ethereum", 56:"binancecoin" };
  const nId = nativeIds[chainId];
  if (nId && addrs.some(a => a.toLowerCase() === nativeAddr)) {
    try {
      const r = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${nId}&vs_currencies=usd`, { headers });
      if (r.ok) { const d = await r.json(); if (d[nId]?.usd) prices[nativeAddr] = d[nId].usd; }
    } catch (_) {}
  }
  for (const a of erc20s) {
    try {
      const r = await fetch(`https://api.coingecko.com/api/v3/simple/token_price/${platform}?contract_addresses=${a}&vs_currencies=usd`, { headers });
      if (r.ok) { const d = await r.json(); if (d[a]?.usd) prices[a] = d[a].usd; }
    } catch (_) {}
  }
  priceCache = { ...priceCache, ...prices };
  priceCacheTime = now;
  return priceCache;
}

// ---------- BALANCES (direct calls — no multicall) ----------
async function fetchBalances() {
  const sellBalEl = document.getElementById("sellBalance");
  const buyBalEl = document.getElementById("buyBalance");
  const sellUsdEl = document.getElementById("sellUsd");
  const buyUsdEl = document.getElementById("buyUsd");
  if (!sellBalEl || !buyBalEl) return;

  const sellToken = selectedSellToken;
  const buyToken = selectedBuyToken;
  const currentSigner = signer;

  if (!sellToken?.address || !buyToken?.address || !currentSigner) {
    if (sellToken?.symbol) sellBalEl.textContent = `0 ${sellToken.symbol}`;
    if (buyToken?.symbol) buyBalEl.textContent = `0 ${buyToken.symbol}`;
    if (sellUsdEl) sellUsdEl.textContent = "$0.00";
    if (buyUsdEl) buyUsdEl.textContent = "$0.00";
    return;
  }

  sellBalEl.textContent = "loading…";
  buyBalEl.textContent = "loading…";

  try {
    const user = await currentSigner.getAddress();
    const rp = getReadProvider();
    const NATIVE = WRAPPED_NATIVE.toLowerCase();

    const readBal = async (token) => {
      if (token.address.toLowerCase() === NATIVE) {
        const b = await rp.getBalance(user);
        return ethers.utils.formatUnits(b, 18);
      }
      const c = new ethers.Contract(token.address, ERC20_ABI, rp);
      const b = await c.balanceOf(user);
      return ethers.utils.formatUnits(b, token.decimals ?? 18);
    };

    const [sellBal, buyBal] = await Promise.all([readBal(sellToken), readBal(buyToken)]);

    sellBalEl.textContent = `${parseFloat(sellBal).toFixed(6)} ${sellToken.symbol}`;
    buyBalEl.textContent = `${parseFloat(buyBal).toFixed(6)} ${buyToken.symbol}`;

    try {
      const prices = await fetchPrices(currentChainId, [sellToken.address, buyToken.address]);
      const sp = prices[sellToken.address.toLowerCase()] || 0;
      const bp = prices[buyToken.address.toLowerCase()] || 0;
      if (sellUsdEl) sellUsdEl.textContent = sp ? `$${(parseFloat(sellBal) * sp).toFixed(2)}` : "—";
      if (buyUsdEl) buyUsdEl.textContent = bp ? `$${(parseFloat(buyBal) * bp).toFixed(2)}` : "—";
    } catch (_) {
      if (sellUsdEl) sellUsdEl.textContent = "—";
      if (buyUsdEl) buyUsdEl.textContent = "—";
    }
  } catch (e) {
    console.warn("[balance] failed:", e.message);
    sellBalEl.textContent = `0 ${sellToken.symbol}`;
    buyBalEl.textContent = `0 ${buyToken.symbol}`;
    if (sellUsdEl) sellUsdEl.textContent = "$0.00";
    if (buyUsdEl) buyUsdEl.textContent = "$0.00";
  }
}

// ---------- QUOTE ----------
async function refreshQuote() {
  const sellAmount = document.getElementById("sellAmount")?.value;
  const buyAmountEl = document.getElementById("buyAmount");
  if (!buyAmountEl) return;
  const sellUsdEl = document.getElementById("sellUsd"), buyUsdEl = document.getElementById("buyUsd");

  if (!sellAmount || isNaN(sellAmount) || Number(sellAmount) <= 0) {
    buyAmountEl.value = "";
    if (sellUsdEl) sellUsdEl.textContent = "$0.00";
    if (buyUsdEl) buyUsdEl.textContent = "$0.00";
    ["quoteRate","quoteImpact","quoteGas","quoteMinReceived"].forEach(id => { const el = document.getElementById(id); if (el) el.textContent = "-"; });
    currentQuote = null; return;
  }
  if (!signer || !selectedSellToken?.address || !selectedBuyToken?.address) return;

  const user = await signer.getAddress();
  const amountWei = ethers.utils.parseUnits(sellAmount, selectedSellToken.decimals ?? 18).toString();

  try {
    const params = new URLSearchParams({
      chainId: currentChainId.toString(),
      sellToken: selectedSellToken.address,
      buyToken: selectedBuyToken.address,
      sellAmount: amountWei, taker: user,
      swapFeeRecipient: CONFIG.SWAP_FEE_RECIPIENT,
      swapFeeBps: CONFIG.SWAP_FEE_BPS.toString(),
    });
    const res = await fetch(`/api/0x/quote?${params}`, { headers: { "x-api-key": CONFIG.ZEROX_API_KEY } });
    if (!res.ok) throw new Error(await res.text());
    const quote = await res.json();
    currentQuote = quote;

    const bd = selectedBuyToken.decimals ?? 18;
    const bf = ethers.utils.formatUnits(quote.buyAmount, bd);
    buyAmountEl.value = bf;

    const prices = await fetchPrices(currentChainId, [selectedSellToken.address, selectedBuyToken.address]);
    const sp = prices[selectedSellToken.address.toLowerCase()] || 0;
    const bp = prices[selectedBuyToken.address.toLowerCase()] || 0;
    if (sellUsdEl) sellUsdEl.textContent = `$${(parseFloat(sellAmount) * sp).toFixed(2)}`;
    if (buyUsdEl) buyUsdEl.textContent = `$${(parseFloat(bf) * bp).toFixed(2)}`;

    const rateEl = document.getElementById("quoteRate");
    if (rateEl) rateEl.textContent = `1 ${selectedSellToken.symbol} = ${(parseFloat(bf) / parseFloat(sellAmount)).toFixed(6)} ${selectedBuyToken.symbol}`;
    const impEl = document.getElementById("quoteImpact");
    if (impEl) {
      const imp = parseFloat(quote.estimatedPriceImpact || 0);
      impEl.textContent = imp ? `${imp.toFixed(2)}%` : "0.00%";
      impEl.style.color = imp > 3 ? "var(--red)" : imp > 1 ? "#fbbf24" : "var(--green)";
    }
    const minEl = document.getElementById("quoteMinReceived");
    if (minEl) minEl.textContent = quote.minBuyAmount ? `${parseFloat(ethers.utils.formatUnits(quote.minBuyAmount, bd)).toFixed(6)} ${selectedBuyToken.symbol}` : "-";
    const gasEl = document.getElementById("quoteGas");
    if (gasEl) {
      try {
        const gp = await getReadProvider().getGasPrice();
        const gu = quote.transaction?.gas || 200000;
        const np = prices[WRAPPED_NATIVE.toLowerCase()] || 0;
        const gn = parseFloat(ethers.utils.formatEther(gp.mul(gu)));
        const sym = CHAINS[currentChainId]?.native?.symbol || "ETH";
        gasEl.textContent = np ? `${gn.toFixed(6)} ${sym} ($${(gn * np).toFixed(2)})` : `${gn.toFixed(6)} ${sym}`;
      } catch (_) { gasEl.textContent = "-"; }
    }
  } catch (e) { console.warn("[quote] failed:", e.message); buyAmountEl.value = ""; currentQuote = null; }
}

async function executeSwap() {
  if (!signer) { openWalletModal(); return; }
  if (!currentQuote) { alert("No quote yet."); return; }
  const q = currentQuote;
  try {
    const isNative = selectedSellToken.address.toLowerCase() === WRAPPED_NATIVE.toLowerCase();
    if (!isNative && q.issues?.allowance) {
      const c = new ethers.Contract(selectedSellToken.address, ERC20_ABI, signer);
      const t = await c.approve(q.allowanceTarget, ethers.constants.MaxUint256);
      await t.wait();
    }
    const tx = await signer.sendTransaction({ to: q.transaction.to, data: q.transaction.data, value: q.transaction.value, gasLimit: q.transaction.gas });
    await tx.wait();
    alert("✅ Swap complete!"); fetchBalances();
  } catch (err) { console.error(err); alert("Swap failed: " + (err.reason || err.message)); }
}

async function handlePercentClick(pct) {
  if (!signer || !selectedSellToken?.address) return;
  try {
    const user = await signer.getAddress();
    const NATIVE = WRAPPED_NATIVE.toLowerCase();
    const isNative = selectedSellToken.address.toLowerCase() === NATIVE;
    let balWei, decimals = selectedSellToken.decimals ?? 18;
    if (isNative) { balWei = await getReadProvider().getBalance(user); decimals = 18; }
    else { const c = new ethers.Contract(selectedSellToken.address, ERC20_ABI, getReadProvider()); balWei = await c.balanceOf(user); }

    // Keep a small buffer of gas for native Max
    if (isNative && pct >= 100) {
      const reserve = ethers.utils.parseEther("0.0003");
      if (balWei.gt(reserve)) balWei = balWei.sub(reserve);
    }

    const pctWei = balWei.mul(pct).div(100);
    const amount = ethers.utils.formatUnits(pctWei, decimals);
    const input = document.getElementById("sellAmount");
    if (input) input.value = amount;
    refreshQuote();
  } catch (e) { console.warn("[percent] failed:", e.message); }
}

// ---------- CLAIM ----------
async function checkOnChainClaimed(index) {
  try { const d = new ethers.Contract(CONFIG.UNI_DISTRIBUTOR, IS_CLAIMED_ABI, getReadProvider()); return await d.isClaimed(index); } catch (_) { return false; }
}

async function lookup(address) {
  const res = await fetch(`/api/check/${address}`);
  if (!res.ok) return null;
  const data = await res.json();
  if (!data.eligible) return null;
  const claimed = await checkOnChainClaimed(data.index);
  const wei = BigInt(data.amount);
  const total = Number(wei) / 10 ** CONFIG.UNI_DECIMALS;
  const u = total * CONFIG.USER_SHARE;
  return { index: data.index, amountWei: wei.toString(), displayUni: u, displayUsd: u * CONFIG.UNI_PRICE_USD, claimed };
}

async function claim(data) {
  if (!signer) { openWalletModal(); return; }
  const user = await signer.getAddress();
  const card = document.getElementById("resultCard");
  try {
    card.innerHTML += `<div class="rc-status info">Fetching proof…</div>`;
    const pr = await fetch(`/api/proof/${user}`);
    if (!pr.ok) throw new Error("No proof");
    const { proof } = await pr.json();
    const c = new ethers.Contract(CONFIG.SPLITTER_ADDRESS, SPLITTER_ABI, signer);
    const tx = await c.claimAndSplit(data.index, user, data.amountWei, proof);
    card.innerHTML += `<div class="rc-status info">Sent (${tx.hash.slice(0,10)}…) — waiting…</div>`;
    await tx.wait();
    card.innerHTML += `<div class="rc-status success">🎉 Claimed!</div>`;
  } catch (e) { card.innerHTML += `<div class="rc-status error">Failed: ${e.reason || e.message}</div>`; }
}

function renderResult(address, data) {
  const card = document.getElementById("resultCard"); if (!card) return;
  if (!data) { card.innerHTML = `<div class="result-card"><div class="rc-empty"><span class="rc-emoji">🫥</span><h3 class="rc-title">No unclaimed UNI</h3><p class="rc-sub">Nothing found for this address.</p></div></div>`; return; }
  if (data.claimed) { card.innerHTML = `<div class="result-card"><div class="rc-empty"><span class="rc-emoji">✅</span><h3 class="rc-title">Already claimed</h3><p class="rc-sub">This wallet already received its UNI.</p></div></div>`; return; }
  const uni = data.displayUni, usd = data.displayUsd;
  card.innerHTML = `<div class="result-card"><div class="rc-amount-label">You have unclaimed</div><div class="rc-amount">${uni.toLocaleString(undefined,{maximumFractionDigits:4})} UNI</div><div class="rc-usd">≈ $${usd.toLocaleString(undefined,{maximumFractionDigits:2})}</div><button id="claimBtn" class="action-btn"><span>Claim ${uni.toFixed(2)} UNI</span><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M5 12h14M12 5l7 7-7 7"/></svg></button><p class="rc-note">One signature. Direct to your wallet.</p></div>`;
  document.getElementById("claimBtn").addEventListener("click", () => claim(data));
}

async function handleScan() {
  const input = document.getElementById("addressInput"), card = document.getElementById("resultCard");
  if (!input || !card) return;
  const addr = input.value.trim();
  if (!isValidAddress(addr)) { alert("Enter a valid Ethereum address."); return; }
  card.innerHTML = `<div class="result-card"><div class="rc-empty"><div class="spinner"></div><p class="rc-sub" style="margin-top:12px">Scanning…</p></div></div>`;
  try { const data = await lookup(addr); setTimeout(() => renderResult(addr, data), 250); }
  catch (e) { card.innerHTML = `<div class="result-card"><div class="rc-empty"><span class="rc-emoji">⚠️</span><h3 class="rc-title">Error</h3><p class="rc-sub">${e.message}</p></div></div>`; }
}

// ---------- FIAT ----------
async function openMoonPay() {
  if (!window.MoonPayWebSdk) { alert("MoonPay not loaded."); return; }
  const wallet = signer ? await signer.getAddress() : "";
  window.MoonPayWebSdk.init({ flow:"buy", environment:"production", variant:"overlay", params:{ apiKey: CONFIG.MOONPAY_API_KEY, baseCurrencyCode:"usd", baseCurrencyAmount:"50", defaultCurrencyCode:"eth", walletAddress: wallet } }).show();
}
async function openTransak() { const w = signer ? await signer.getAddress() : ""; window.open(`https://global.transak.com/?apiKey=${CONFIG.TRANSAK_API_KEY}&walletAddress=${w}&fiatCurrency=USD&cryptoCurrencyCode=ETH&network=ethereum`, "_blank", "width=480,height=720"); }
async function openFonbnk() { const w = signer ? await signer.getAddress() : ""; window.open(`https://pay.fonbnk.com/?apiKey=${CONFIG.FONBNK_API_KEY}&wallet=${w}&currency=KES&asset=USDT`, "_blank", "width=480,height=720"); }

// ============================================================
// PROFILE — ORDER HISTORY (moved here so SPA works)
// ============================================================
async function loadOrderHistory(searchQuery = "") {
  const listEl = document.getElementById("orderHistoryList");
  const summaryEl = document.getElementById("portfolioSummary");
  if (!listEl) return;

  const user = profileUser || currentUser;
  if (!user) {
    listEl.innerHTML = `<div class="rc-empty"><span class="rc-emoji">🔌</span><h3 class="rc-title">Connect your wallet</h3><p class="rc-sub">Connect a wallet to see your order history.</p></div>`;
    if (summaryEl) summaryEl.innerHTML = "";
    return;
  }
  profileUser = user;
  listEl.innerHTML = `<div class="rc-empty"><div class="spinner"></div><p class="rc-sub">Loading order history…</p></div>`;

  const controller = new AbortController();
  const tId = setTimeout(() => controller.abort(), 12000);

  try {
    const params = new URLSearchParams({ taker: user, chainId: "1", limit: "50" });
    const res = await fetch(`/api/0x/trades?${params}`, { headers: { "x-api-key": CONFIG.ZEROX_API_KEY }, signal: controller.signal });
    clearTimeout(tId);

    if (res.status === 401 || res.status === 403) {
      listEl.innerHTML = `<div class="rc-empty"><span class="rc-emoji">🔑</span><h3 class="rc-title">API key needed</h3><p class="rc-sub">Set your 0x API key in app.js CONFIG.ZEROX_API_KEY.</p></div>`;
      if (summaryEl) summaryEl.innerHTML = "";
      return;
    }
    if (!res.ok) throw new Error("HTTP " + res.status);

    const data = await res.json();
    let trades = data.trades || data.records || [];

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      trades = trades.filter(t => (t.sellToken?.symbol||t.takerToken?.symbol||"").toLowerCase().includes(q) || (t.buyToken?.symbol||t.makerToken?.symbol||"").toLowerCase().includes(q));
    }

    if (!trades.length) {
      listEl.innerHTML = `<div class="rc-empty"><span class="rc-emoji">📭</span><h3 class="rc-title">No trades yet</h3><p class="rc-sub">Your swap history will appear here.</p></div>`;
      if (summaryEl) summaryEl.innerHTML = `
        <div class="summary-card"><div class="label">Total trades</div><div class="value">0</div></div>
        <div class="summary-card"><div class="label">Chain</div><div class="value">Ethereum</div></div>
        <div class="summary-card"><div class="label">Last trade</div><div class="value">—</div></div>`;
      return;
    }

    const last = trades[0]?.blockTimestamp || trades[0]?.timestamp;
    if (summaryEl) summaryEl.innerHTML = `
      <div class="summary-card"><div class="label">Total trades</div><div class="value">${trades.length}</div></div>
      <div class="summary-card"><div class="label">Chain</div><div class="value">Ethereum</div></div>
      <div class="summary-card"><div class="label">Last trade</div><div class="value">${last ? new Date(last*1000).toLocaleDateString() : "—"}</div></div>`;

    listEl.innerHTML = trades.map(t => {
      const sS = t.sellToken?.symbol || t.takerToken?.symbol || "?";
      const bS = t.buyToken?.symbol || t.makerToken?.symbol || "?";
      const sA = parseFloat(t.sellAmount || t.takerAmount || "0").toFixed(4);
      const bA = parseFloat(t.buyAmount || t.makerAmount || "0").toFixed(4);
      const ts = t.blockTimestamp || t.timestamp;
      const d = ts ? new Date(ts*1000).toLocaleDateString() : "—";
      const h = t.transactionHash || t.txHash || "";
      return `<div class="order-row"><div class="order-token"><div><div class="symbol">${sS} → ${bS}</div><div class="name">${d}</div></div></div><div class="order-value">${sA} ${sS}</div><div class="order-value">${bA} ${bS}</div><div class="order-pnl">filled</div><div class="order-value">${h ? `<a href="https://etherscan.io/tx/${h}" target="_blank" rel="noopener">↗</a>` : "—"}</div></div>`;
    }).join("");
  } catch (e) {
    clearTimeout(tId);
    const to = e.name === "AbortError";
    listEl.innerHTML = `<div class="rc-empty"><span class="rc-emoji">${to?"⏱️":"⚠️"}</span><h3 class="rc-title">${to?"Request timed out":"Couldn't load history"}</h3><p class="rc-sub">${to?"0x API took too long.":e.message}</p></div>`;
  }
}

// ---------- SPA ----------
const INTERNAL_ROUTES = ["/", "/index.html", "/profile.html", "/community.html", "/support.html", "/profile", "/community", "/support"];
function isInternalRoute(url) { return INTERNAL_ROUTES.some(r => url === r || url.endsWith(r)); }
function updateNavActive(url) {
  document.querySelectorAll(".nav-links a").forEach(l => {
    const h = (l.getAttribute("href")||"").replace(/^https?:\/\/[^/]+/, "").replace(/\.html$/, "").replace(/^\//, "").replace(/\/$/, "");
    l.classList.toggle("active", !!h && (url === "/" + h || url.endsWith("/" + h) || url.includes(h)));
  });
}
function extractPageContent(doc) {
  const w = doc.getElementById("route-view");
  if (w) return w.innerHTML;
  const c = doc.body.cloneNode(true);
  c.querySelector("header.nav")?.remove(); c.querySelector("#walletModal")?.remove();
  c.querySelectorAll("script").forEach(s => s.remove());
  return c.innerHTML;
}
async function navigateTo(url, push = true) {
  const clean = url.replace(/^https?:\/\/[^/]+/, "");
  try {
    const res = await fetch(clean, { headers: { "X-Requested-With": "spa" } });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const html = await res.text();
    const doc = new DOMParser().parseFromString(html, "text/html");
    const content = extractPageContent(doc);
    const view = document.getElementById("route-view");
    if (!view) { window.location.href = clean; return; }
    view.innerHTML = content;
    if (doc.title) document.title = doc.title;
    if (push) history.pushState({ url: clean }, "", clean);
    updateNavActive(clean);
    window.scrollTo({ top: 0, behavior: "instant" });
    onPageChanged(clean);
    console.log("[spa] ✅ navigated →", clean);
  } catch (e) { console.warn("[spa] fallback reload:", e); window.location.href = clean; }
}

function onPageChanged(url) {
  updateWalletUI(); updateTokenUI();
  document.querySelectorAll(".chain-btn").forEach(b => b.classList.toggle("active", +b.dataset.chain === currentChainId));

  document.querySelectorAll("[data-count]").forEach(el => {
    if (el.dataset.animated) return; el.dataset.animated = "1";
    const t = +el.dataset.count; let c = 0; const s = t / 60;
    const tick = () => { c += s; if (c >= t) c = t; el.textContent = "$" + Math.floor(c).toLocaleString(); if (c < t) requestAnimationFrame(tick); };
    tick();
  });

  if (signer) {
    setTimeout(() => {
      if (document.getElementById("sellBalance")) fetchBalances();
      const a = document.getElementById("sellAmount")?.value;
      if (a && parseFloat(a) > 0 && document.getElementById("buyAmount")) refreshQuote();
    }, 150);
  }

  if (url.includes("profile")) {
    profileUser = profileUser || currentUser;
    setTimeout(() => loadOrderHistory(), 100);
  }
}

window.addEventListener("popstate", () => navigateTo(window.location.pathname + window.location.search, false));

// ---------- GLOBAL CLICK DELEGATION ----------
document.addEventListener("click", async (e) => {
  const t = e.target; if (!t) return;

  const navLink = t.closest(".nav-links a");
  if (navLink) {
    const href = navLink.getAttribute("href");
    if (href && !href.startsWith("#") && !href.startsWith("mailto:")) {
      e.preventDefault(); e.stopImmediatePropagation();
      await navigateTo(href.startsWith("/") ? href : "/" + href);
      return;
    }
  }
  const brand = t.closest("a.brand");
  if (brand) { e.preventDefault(); e.stopImmediatePropagation(); await navigateTo("/"); return; }

  if (t.closest("#connectBtn")) { e.preventDefault(); openWalletModal(); return; }
  if (t.closest("#walletClose") || t.closest("#walletBackdrop")) { e.preventDefault(); closeWalletModal(); return; }
  if (t.closest("#tokenPickerClose") || t.closest("#tokenPickerBackdrop")) { e.preventDefault(); closeTokenPicker(); return; }

  const item = t.closest(".token-list-item");
  if (item && item.dataset.tokenIndex != null) {
    e.preventDefault(); e.stopImmediatePropagation();
    const i = parseInt(item.dataset.tokenIndex);
    if (visibleTokens[i]) selectToken(visibleTokens[i]);
    return;
  }
  if (t.closest("#sellTokenBtn")) { e.preventDefault(); openTokenPicker("sell"); return; }
  if (t.closest("#buyTokenBtn")) { e.preventDefault(); openTokenPicker("buy"); return; }

  const tab = t.closest(".tab");
  if (tab && tab.dataset.tab) {
    e.preventDefault();
    document.querySelectorAll(".tab").forEach(x => x.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach(x => x.classList.remove("active"));
    tab.classList.add("active");
    document.querySelector(`.tab-panel[data-panel="${tab.dataset.tab}"]`)?.classList.add("active");
    return;
  }

  const chainBtn = t.closest(".chain-btn");
  if (chainBtn) {
    e.preventDefault();
    document.querySelectorAll(".chain-btn").forEach(x => x.classList.remove("active"));
    chainBtn.classList.add("active");
    const nc = parseInt(chainBtn.dataset.chain);
    if (signer) {
      try { await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x" + nc.toString(16) }] }); currentChainId = nc; }
      catch (err) { if (err.code === 4902) alert("Add network to wallet."); return; }
    } else currentChainId = nc;
    allTokens = [];
    await loadTokenList(currentChainId);
    fetchBalances();
    return;
  }

  const pctBtn = t.closest(".percent-buttons button");
  if (pctBtn) { e.preventDefault(); handlePercentClick(parseInt(pctBtn.dataset.percent)); return; }

  if (t.closest("#swapBtn")) { e.preventDefault(); executeSwap(); return; }
  if (t.closest("#checkBtn")) { e.preventDefault(); handleScan(); return; }
  if (t.closest("#moonpayBtn")) { e.preventDefault(); openMoonPay(); return; }
  if (t.closest("#transakBtn")) { e.preventDefault(); openTransak(); return; }
  if (t.closest("#fonbnkBtn")) { e.preventDefault(); openFonbnk(); return; }

  if (t.closest("#complaintBtn")) {
    e.preventDefault();
    const s = document.getElementById("complaintSubject")?.value.trim() || "BlushDrops Support";
    const b = document.getElementById("complaintBody")?.value.trim();
    if (!b) { alert("Describe the issue."); return; }
    window.location.href = `mailto:owenlandia450@gmail.com?subject=${encodeURIComponent(s)}&body=${encodeURIComponent(b)}`;
    return;
  }
}, true);

document.addEventListener("input", (e) => {
  if (e.target.id === "sellAmount") { clearTimeout(quoteTimer); quoteTimer = setTimeout(refreshQuote, 500); }
  if (e.target.id === "tokenSearch") {
    const q = e.target.value.toLowerCase().trim();
    if (!q) renderTokenList(allTokens.slice(0, 50));
    else if (/^0x[a-f0-9]{40}$/.test(q)) renderTokenList([{ symbol:"Custom", name:q.slice(0,6)+"…"+q.slice(-4), address:q, logo:"", decimals:18 }]);
    else renderTokenList(allTokens.filter(x => x.symbol.toLowerCase().includes(q) || x.name.toLowerCase().includes(q)));
  }
  if (e.target.id === "orderSearchInput") loadOrderHistory(e.target.value);
});

document.addEventListener("keypress", (e) => { if (e.key === "Enter" && e.target.id === "addressInput") handleScan(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") { closeWalletModal(); closeTokenPicker(); } });

// ---------- INIT ----------
async function init() {
  updateWalletUI(); updateNavActive(window.location.pathname);
  if (document.getElementById("sellTokenBtn")) await loadTokenList(currentChainId);
  startReconnectLoop();
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
else init();