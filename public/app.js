// ============================================================
// BLUSHDROPS — MAIN APP (clean rewrite with event delegation)
// ============================================================

const CONFIG = {
  SPLITTER_ADDRESS: "0x0000000000000000000000000000000000000000",
  RPC_URLS: ["https://eth-mainnet.g.alchemy.com/v2/AkH_F7btslPyNlLzxXJth"],
  UNI_DISTRIBUTOR: "0x090D4613473dEE047c3f2706764f49E0821D256e",
  ZEROX_API_KEY: "YOUR_0X_API_KEY",
  SWAP_FEE_RECIPIENT: "0xYOUR_WALLET_ADDRESS",
  SWAP_FEE_BPS: 50,
  MOONPAY_API_KEY: "pk_live_YOUR_MOONPAY_KEY",
  TRANSAK_API_KEY: "YOUR_TRANSAK_API_KEY",
  FONBNK_API_KEY: "YOUR_FONBNK_API_KEY",
  COINGECKO_API_KEY: "",
  UNI_DECIMALS: 18,
  UNI_PRICE_USD: 8.5,
  USER_SHARE: 0.70,
};

const SPLITTER_ABI = ["function claimAndSplit(uint256 index, address account, uint256 amount, bytes32[] calldata merkleProof) external"];
const IS_CLAIMED_ABI = ["function isClaimed(uint256 index) view returns (bool)"];
const ERC20_ABI = ["function balanceOf(address) view returns (uint256)","function allowance(address,address) view returns (uint256)","function approve(address,uint256) returns (bool)","function decimals() view returns (uint8)"];
const MULTICALL_ABI = ["function aggregate3((address,bool,bytes)[] calls) payable returns ((bool,bytes)[])","function getEthBalance(address addr) view returns (uint256)"];
const MULTICALL_ADDRESS = "0xcA11bde05977b3631167028862bE2a173976CA11";
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
let provider = null;
let signer = null;
let currentUser = null;
let readProvider = null;
let currentChainId = 1;
let allTokens = [];
let selectedSellToken = null;
let selectedBuyToken = null;
let pickerTarget = null;
let currentQuote = null;
let priceCache = {};
let priceCacheTime = 0;
let quoteTimer = null;
const detectedWallets = new Map();

// ============================================================
// UTIL
// ============================================================
function colorForName(name) {
  const colors = [["#ff8ac1","#a855f7"],["#7dd3fc","#3b82f6"],["#6ee7b7","#059669"],["#fbbf24","#f59e0b"],["#f472b6","#db2777"]];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return colors[Math.abs(hash) % colors.length];
}

function getReadProvider() {
  if (readProvider) return readProvider;
  const providers = CONFIG.RPC_URLS.map((url, i) => ({
    provider: new ethers.providers.JsonRpcProvider(url),
    priority: i + 1, stallTimeout: 2500, weight: 1,
  }));
  readProvider = new ethers.providers.FallbackProvider(providers, 1);
  return readProvider;
}

// ============================================================
// CURSOR
// ============================================================
(function setupCursor() {
  const cursor = document.getElementById("cursor");
  const cursorDot = document.getElementById("cursorDot");
  if (!cursor || !cursorDot) return;
  document.addEventListener("mousemove", (e) => {
    cursor.style.left = e.clientX + "px";
    cursor.style.top = e.clientY + "px";
    cursorDot.style.left = e.clientX + "px";
    cursorDot.style.top = e.clientY + "px";
  });
})();

// ============================================================
// CHAIN HELPERS
// ============================================================
function getBaseTokens(chainId) {
  const bases = {
    1: [
      { symbol: "ETH",  name: "Ethereum",       address: WRAPPED_NATIVE, logo: "https://assets.coingecko.com/coins/images/279/small/ethereum.png", decimals: 18 },
      { symbol: "UNI",  name: "Uniswap",        address: "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984", logo: "https://assets.coingecko.com/coins/images/12504/small/uniswap-uni.png", decimals: 18 },
      { symbol: "USDC", name: "USD Coin",       address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", logo: "https://assets.coingecko.com/coins/images/6319/small/usdc.png", decimals: 6 },
      { symbol: "USDT", name: "Tether",         address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", logo: "https://assets.coingecko.com/coins/images/325/small/Tether.png", decimals: 6 },
      { symbol: "DAI",  name: "Dai",            address: "0x6B175474E89094C44Da98b954EedeAC495271d0F", logo: "https://assets.coingecko.com/coins/images/9956/small/Badge_Dai.png", decimals: 18 },
      { symbol: "WBTC", name: "Wrapped Bitcoin",address: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599", logo: "https://assets.coingecko.com/coins/images/7598/small/wrapped_bitcoin_wbtc.png", decimals: 8 },
    ],
    137: [
      { symbol: "MATIC", name: "Polygon",  address: WRAPPED_NATIVE, logo: "https://assets.coingecko.com/coins/images/4713/small/matic-token-icon.png", decimals: 18 },
      { symbol: "USDC",  name: "USD Coin", address: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174", logo: "https://assets.coingecko.com/coins/images/6319/small/usdc.png", decimals: 6 },
      { symbol: "USDT",  name: "Tether",   address: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F", logo: "https://assets.coingecko.com/coins/images/325/small/Tether.png", decimals: 6 },
    ],
    8453: [
      { symbol: "ETH",  name: "Ethereum",  address: WRAPPED_NATIVE, logo: "https://assets.coingecko.com/coins/images/279/small/ethereum.png", decimals: 18 },
      { symbol: "USDC", name: "USD Coin",  address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", logo: "https://assets.coingecko.com/coins/images/6319/small/usdc.png", decimals: 6 },
    ],
    42161: [
      { symbol: "ETH",  name: "Ethereum",  address: WRAPPED_NATIVE, logo: "https://assets.coingecko.com/coins/images/279/small/ethereum.png", decimals: 18 },
      { symbol: "ARB",  name: "Arbitrum",  address: "0x912CE59144191C1204E64559FE8253a0e49E6548", logo: "https://assets.coingecko.com/coins/images/16547/small/photo_2023-03-29_21.47.00.jpeg", decimals: 18 },
      { symbol: "USDC", name: "USD Coin",  address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", logo: "https://assets.coingecko.com/coins/images/6319/small/usdc.png", decimals: 6 },
    ],
    10: [
      { symbol: "ETH",  name: "Ethereum",  address: WRAPPED_NATIVE, logo: "https://assets.coingecko.com/coins/images/279/small/ethereum.png", decimals: 18 },
      { symbol: "OP",   name: "Optimism",  address: "0x4200000000000000000000000000000000000042", logo: "https://assets.coingecko.com/coins/images/25244/small/Optimism.png", decimals: 18 },
      { symbol: "USDC", name: "USD Coin",  address: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85", logo: "https://assets.coingecko.com/coins/images/6319/small/usdc.png", decimals: 6 },
    ],
    56: [
      { symbol: "BNB",  name: "BNB",       address: WRAPPED_NATIVE, logo: "https://assets.coingecko.com/coins/images/825/small/bnb-icon2_2x.png", decimals: 18 },
      { symbol: "USDT", name: "Tether",    address: "0x55d398326f99059fF775485246999027B3197955", logo: "https://assets.coingecko.com/coins/images/325/small/Tether.png", decimals: 18 },
      { symbol: "USDC", name: "USD Coin",  address: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", logo: "https://assets.coingecko.com/coins/images/6319/small/usdc.png", decimals: 18 },
    ],
  };
  return bases[chainId] || bases[1];
}

// ============================================================
// WALLET
// ============================================================
function updateWalletUI() {
  const btn = document.getElementById("connectBtn");
  const txt = document.getElementById("connectText");
  if (!btn || !txt) return;
  if (currentUser) {
    btn.classList.add("connected");
    txt.textContent = currentUser.slice(0, 6) + "…" + currentUser.slice(-4);
  } else {
    btn.classList.remove("connected");
    txt.textContent = "Connect";
  }
  const input = document.getElementById("addressInput");
  if (input && currentUser && !input.value.trim()) input.value = currentUser;
}

function openWalletModal() {
  const modal = document.getElementById("walletModal");
  if (!modal) return;
  modal.classList.remove("hidden");
  document.body.style.overflow = "hidden";
  refreshWalletList();
}
function closeWalletModal() {
  const modal = document.getElementById("walletModal");
  if (!modal) return;
  modal.classList.add("hidden");
  document.body.style.overflow = "";
}

function refreshWalletList() {
  const listEl = document.getElementById("walletList");
  const emptyEl = document.getElementById("walletEmpty");
  if (!listEl) return;
  listEl.innerHTML = "";
  if (detectedWallets.size === 0) {
    listEl.classList.add("hidden");
    if (emptyEl) emptyEl.classList.remove("hidden");
    return;
  }
  listEl.classList.remove("hidden");
  if (emptyEl) emptyEl.classList.add("hidden");
  for (const [rdns, { info, provider: p }] of detectedWallets) {
    const btn = document.createElement("button");
    btn.className = "wallet-item";
    btn.type = "button";
    const iconHtml = info.icon
      ? `<img src="${info.icon}" alt="" />`
      : (() => {
          const [c1, c2] = colorForName(info.name);
          return `<span class="wallet-letter" style="background:linear-gradient(135deg,${c1},${c2})">${info.name[0].toUpperCase()}</span>`;
        })();
    btn.innerHTML = `<span class="wallet-item-icon">${iconHtml}</span><span class="wallet-item-info"><span class="wallet-item-name">${info.name}</span><span class="wallet-item-tag">Browser extension</span></span><span class="wallet-item-arrow"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 6l6 6-6 6"/></svg></span>`;
    btn.dataset.rdns = rdns;
    btn.addEventListener("click", () => connectWithProvider(p, rdns));
    listEl.appendChild(btn);
  }
}

async function connectWithProvider(providerObj, rdns) {
  if (!providerObj) return;
  if (typeof ethers === "undefined") { alert("Ethers not loaded. Refresh."); return; }
  try {
    provider = new ethers.providers.Web3Provider(providerObj);
    await provider.send("eth_requestAccounts", []);
    signer = provider.getSigner();
    currentUser = await signer.getAddress();
    if (rdns) try { localStorage.setItem(WALLET_STORAGE_KEY, rdns); } catch (_) {}

    updateWalletUI();
    closeWalletModal();

    providerObj.on?.("accountsChanged", (accts) => {
      if (!accts || accts.length === 0) {
        currentUser = null;
        try { localStorage.removeItem(WALLET_STORAGE_KEY); } catch (_) {}
      } else {
        currentUser = accts[0];
      }
      updateWalletUI();
      if (typeof fetchBalances === "function") fetchBalances();
    });
    providerObj.on?.("chainChanged", () => window.location.reload());

    const net = await provider.getNetwork();
    currentChainId = net.chainId;
    document.querySelectorAll(".chain-btn").forEach(b => b.classList.toggle("active", +b.dataset.chain === currentChainId));

    loadTokenList(currentChainId);
    if (typeof fetchBalances === "function") fetchBalances();

    window.dispatchEvent(new CustomEvent("walletConnected", { detail: { address: currentUser } }));
  } catch (err) {
    if (err.code === 4001) return;
    alert("Failed to connect: " + (err.message || "unknown"));
  }
}

async function autoReconnect() {
  if (currentUser) return true;
  if (typeof ethers === "undefined") return false;

  const savedRdns = localStorage.getItem(WALLET_STORAGE_KEY);
  let chosen = null;

  if (savedRdns && detectedWallets.has(savedRdns)) {
    chosen = detectedWallets.get(savedRdns).provider;
  }
  if (!chosen) {
    for (const [rdns, entry] of detectedWallets) {
      try {
        const accts = await entry.provider.request({ method: "eth_accounts" });
        if (accts && accts.length > 0) {
          chosen = entry.provider;
          try { localStorage.setItem(WALLET_STORAGE_KEY, rdns); } catch (_) {}
          break;
        }
      } catch (_) {}
    }
  }
  if (!chosen && window.ethereum) chosen = window.ethereum;
  if (!chosen) return false;

  try {
    const accounts = await chosen.request({ method: "eth_accounts" });
    if (!accounts || accounts.length === 0) return false;

    provider = new ethers.providers.Web3Provider(chosen);
    signer = provider.getSigner();
    currentUser = accounts[0];
    updateWalletUI();

    const net = await provider.getNetwork();
    currentChainId = net.chainId;
    document.querySelectorAll(".chain-btn").forEach(b => b.classList.toggle("active", +b.dataset.chain === currentChainId));

    loadTokenList(currentChainId);
    if (typeof fetchBalances === "function") fetchBalances();

    window.dispatchEvent(new CustomEvent("walletConnected", { detail: { address: currentUser } }));
    return true;
  } catch (_) {
    return false;
  }
}

function startReconnectLoop() {
  let attempts = 0;
  const tick = async () => {
    attempts++;
    const ok = await autoReconnect();
    if (ok) return;
    if (attempts < 20) setTimeout(tick, 500);
  };
  tick();
}

// ---- EIP-6963 + legacy ----
window.addEventListener("eip6963:announceProvider", (event) => {
  const { info, provider: p } = event.detail;
  detectedWallets.set(info.rdns, { info, provider: p });
  refreshWalletList();
});
window.dispatchEvent(new Event("eip6963:requestProvider"));

function legacyDetect() {
  if (detectedWallets.size > 0) return;
  if (typeof window.ethereum === "undefined") return;
  const providers = window.ethereum.providers || [window.ethereum];
  const seen = new Set();
  providers.forEach((p) => {
    let name = null, rdns = null;
    if (p.isBraveWallet)          { name = "Brave Wallet";    rdns = "com.brave.wallet"; }
    else if (p.isRabby)           { name = "Rabby";           rdns = "io.rabby"; }
    else if (p.isMetaMask)        { name = "MetaMask";        rdns = "io.metamask"; }
    else if (p.isCoinbaseWallet)  { name = "Coinbase Wallet"; rdns = "com.coinbase.wallet"; }
    else if (p.isTrust)           { name = "Trust Wallet";    rdns = "com.trustwallet.app"; }
    else if (p.isOKXWallet)       { name = "OKX Wallet";      rdns = "com.okex.wallet"; }
    if (!name || seen.has(rdns)) return;
    seen.add(rdns);
    detectedWallets.set(rdns, { info: { name, icon: null, rdns }, provider: p });
  });
  refreshWalletList();
}
setTimeout(legacyDetect, 300);

// ============================================================
// TOKEN LIST
// ============================================================
async function loadTokenList(chainId) {
  const base = getBaseTokens(chainId);
  allTokens = [...base];

  if (!selectedSellToken || selectedSellToken.chainId !== chainId) selectedSellToken = { ...base[0], chainId };
  if (!selectedBuyToken  || selectedBuyToken.chainId  !== chainId) selectedBuyToken  = { ...(base[1] || base[0]), chainId };
  updateTokenUI();

  const platform = CHAINS[chainId]?.cgPlatform;
  if (!platform) return;

  try {
    const headers = {};
    if (CONFIG.COINGECKO_API_KEY && !CONFIG.COINGECKO_API_KEY.includes("YOUR")) headers["x-cg-demo-api-key"] = CONFIG.COINGECKO_API_KEY;

    const res = await fetch(`https://tokens.coingecko.com/${platform}/all.json`, { headers });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    const tokens = data.tokens || [];
    const seen = new Set(base.map(t => t.address.toLowerCase()));
    for (const t of tokens) {
      if (!t.address || !t.symbol) continue;
      const addr = t.address.toLowerCase();
      if (seen.has(addr)) continue;
      seen.add(addr);
      allTokens.push({
        symbol: t.symbol,
        name: t.name || t.symbol,
        address: t.address,
        logo: t.logoURI || "",
        decimals: t.decimals != null ? t.decimals : 18,
        chainId,
      });
    }
    console.log(`[tokens] ${allTokens.length} tokens for chain ${chainId}`);
  } catch (e) {
    console.warn("[tokens] failed:", e);
    allTokens = base.map(t => ({ ...t, chainId }));
  }
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

// ============================================================
// TOKEN PICKER
// ============================================================
function openTokenPicker(target) {
  pickerTarget = target;
  const modal = document.getElementById("tokenPicker");
  if (!modal) return;
  modal.classList.remove("hidden");
  const input = document.getElementById("tokenSearch");
  if (input) { input.value = ""; setTimeout(() => input.focus(), 50); }
  renderTokenList(allTokens.slice(0, 50));
}
function closeTokenPicker() {
  const modal = document.getElementById("tokenPicker");
  if (modal) modal.classList.add("hidden");
}
function renderTokenList(tokens) {
  const listEl = document.getElementById("tokenList");
  if (!listEl) return;
  listEl.innerHTML = "";
  if (!tokens.length) { listEl.innerHTML = `<div class="token-empty">No tokens found</div>`; return; }
  tokens.slice(0, 100).forEach(t => {
    const item = document.createElement("button");
    item.className = "token-list-item";
    item.type = "button";
    const logoHtml = t.logo ? `<img src="${t.logo}" alt="" onerror="this.style.display='none'" />` : `<img src="" style="display:none" />`;
    item.innerHTML = `${logoHtml}<div class="token-list-info"><div class="token-list-symbol">${t.symbol}</div><div class="token-list-name">${t.name}</div></div><div class="token-list-address">${t.address.slice(0, 6)}…${t.address.slice(-4)}</div>`;
    item.addEventListener("click", () => selectToken(t));
    listEl.appendChild(item);
  });
}
function selectToken(token) {
  token.chainId = currentChainId;
  if (pickerTarget === "sell") selectedSellToken = token;
  else selectedBuyToken = token;
  updateTokenUI();
  closeTokenPicker();
  fetchBalances();
  const amt = document.getElementById("sellAmount")?.value;
  if (amt && parseFloat(amt) > 0) refreshQuote();
}
function handleTokenSearchInput(e) {
  const q = e.target.value.toLowerCase().trim();
  if (!q) { renderTokenList(allTokens.slice(0, 50)); return; }
  if (/^0x[a-f0-9]{40}$/.test(q)) {
    renderTokenList([{ symbol: "Custom", name: q.slice(0,6)+"…"+q.slice(-4), address: e.target.value, logo: "", decimals: 18 }]);
    return;
  }
  renderTokenList(allTokens.filter(t => t.symbol.toLowerCase().includes(q) || t.name.toLowerCase().includes(q)));
}

// ============================================================
// PRICES
// ============================================================
async function fetchPrices(chainId, tokenAddresses) {
  const now = Date.now();
  if (now - priceCacheTime < 60000 && Object.keys(priceCache).length > 0) return priceCache;

  const platform = CHAINS[chainId]?.cgPlatform;
  if (!platform || !tokenAddresses.length) return priceCache;

  const headers = {};
  if (CONFIG.COINGECKO_API_KEY && !CONFIG.COINGECKO_API_KEY.includes("YOUR")) headers["x-cg-demo-api-key"] = CONFIG.COINGECKO_API_KEY;

  const nativeAddr = WRAPPED_NATIVE.toLowerCase();
  const erc20s = tokenAddresses.filter(a => a && a.toLowerCase() !== nativeAddr).map(a => a.toLowerCase());
  const prices = {};

  const nativeIds = { 1: "ethereum", 137: "matic-network", 8453: "ethereum", 42161: "ethereum", 10: "ethereum", 56: "binancecoin" };
  const nativeId = nativeIds[chainId];
  if (nativeId && tokenAddresses.some(a => a.toLowerCase() === nativeAddr)) {
    try {
      const r = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${nativeId}&vs_currencies=usd`, { headers });
      if (r.ok) { const d = await r.json(); if (d[nativeId]?.usd) prices[nativeAddr] = d[nativeId].usd; }
    } catch (_) {}
  }
  if (erc20s.length) {
    try {
      const r = await fetch(`https://api.coingecko.com/api/v3/simple/token_price/${platform}?contract_addresses=${erc20s.join(",")}&vs_currencies=usd`, { headers });
      if (r.ok) {
        const d = await r.json();
        for (const [addr, val] of Object.entries(d)) if (val?.usd) prices[addr.toLowerCase()] = val.usd;
      }
    } catch (_) {}
  }
  priceCache = { ...priceCache, ...prices };
  priceCacheTime = now;
  return priceCache;
}

// ============================================================
// BALANCES
// ============================================================
async function fetchBalances() {
  if (!selectedSellToken || !selectedBuyToken) return;
  const sellBalEl = document.getElementById("sellBalance");
  const buyBalEl = document.getElementById("buyBalance");
  const sellUsdEl = document.getElementById("sellUsd");
  const buyUsdEl = document.getElementById("buyUsd");
  if (!sellBalEl || !buyBalEl) return;

  if (!signer) {
    sellBalEl.textContent = `0 ${selectedSellToken.symbol}`;
    buyBalEl.textContent = `0 ${selectedBuyToken.symbol}`;
    if (sellUsdEl) sellUsdEl.textContent = "$0.00";
    if (buyUsdEl) buyUsdEl.textContent = "$0.00";
    return;
  }

  sellBalEl.textContent = "loading…";
  buyBalEl.textContent = "loading…";

  try {
    const user = await signer.getAddress();
    const mc = new ethers.Contract(MULTICALL_ADDRESS, MULTICALL_ABI, getReadProvider());
    const iface = new ethers.utils.Interface(ERC20_ABI);
    const NATIVE = WRAPPED_NATIVE.toLowerCase();
    const isSellNative = selectedSellToken.address.toLowerCase() === NATIVE;
    const isBuyNative = selectedBuyToken.address.toLowerCase() === NATIVE;

    const calls = [
      isSellNative
        ? { target: MULTICALL_ADDRESS, allowFailure: true, callData: mc.interface.encodeFunctionData("getEthBalance", [user]) }
        : { target: selectedSellToken.address, allowFailure: true, callData: iface.encodeFunctionData("balanceOf", [user]) },
      isBuyNative
        ? { target: MULTICALL_ADDRESS, allowFailure: true, callData: mc.interface.encodeFunctionData("getEthBalance", [user]) }
        : { target: selectedBuyToken.address, allowFailure: true, callData: iface.encodeFunctionData("balanceOf", [user]) },
    ];

    const results = await mc.callStatic.aggregate3(calls);

    let sellBal = "0", buyBal = "0";
    if (results[0].success) sellBal = ethers.utils.formatUnits(ethers.BigNumber.from(results[0].returnData), selectedSellToken.decimals || 18);
    if (results[1].success) buyBal = ethers.utils.formatUnits(ethers.BigNumber.from(results[1].returnData), selectedBuyToken.decimals || 18);

    sellBalEl.textContent = `${parseFloat(sellBal).toFixed(6)} ${selectedSellToken.symbol}`;
    buyBalEl.textContent = `${parseFloat(buyBal).toFixed(6)} ${selectedBuyToken.symbol}`;

    fetchPrices(currentChainId, [selectedSellToken.address, selectedBuyToken.address]).then(prices => {
      const sp = prices[selectedSellToken.address.toLowerCase()] || 0;
      const bp = prices[selectedBuyToken.address.toLowerCase()] || 0;
      if (sellUsdEl) sellUsdEl.textContent = sp ? `$${(parseFloat(sellBal) * sp).toFixed(2)}` : "—";
      if (buyUsdEl) buyUsdEl.textContent = bp ? `$${(parseFloat(buyBal) * bp).toFixed(2)}` : "—";
    }).catch(() => {
      if (sellUsdEl) sellUsdEl.textContent = "—";
      if (buyUsdEl) buyUsdEl.textContent = "—";
    });
  } catch (e) {
    console.warn("[balance] failed:", e);
    sellBalEl.textContent = `0 ${selectedSellToken.symbol}`;
    buyBalEl.textContent = `0 ${selectedBuyToken.symbol}`;
    if (sellUsdEl) sellUsdEl.textContent = "$0.00";
    if (buyUsdEl) buyUsdEl.textContent = "$0.00";
  }
}

// ============================================================
// QUOTE + SWAP
// ============================================================
async function refreshQuote() {
  if (!signer || !selectedSellToken || !selectedBuyToken) return;
  const sellAmount = document.getElementById("sellAmount")?.value;
  const buyAmountEl = document.getElementById("buyAmount");
  const sellUsdEl = document.getElementById("sellUsd");
  const buyUsdEl = document.getElementById("buyUsd");
  if (!buyAmountEl) return;

  if (!sellAmount || isNaN(sellAmount) || Number(sellAmount) <= 0) {
    buyAmountEl.value = "";
    if (sellUsdEl) sellUsdEl.textContent = "$0.00";
    if (buyUsdEl) buyUsdEl.textContent = "$0.00";
    ["quoteRate","quoteImpact","quoteGas","quoteMinReceived"].forEach(id => { const el = document.getElementById(id); if (el) el.textContent = "-"; });
    currentQuote = null;
    return;
  }

  const user = await signer.getAddress();
  const amountWei = ethers.utils.parseUnits(sellAmount, selectedSellToken.decimals || 18).toString();

  try {
    const params = new URLSearchParams({
      chainId: currentChainId.toString(),
      sellToken: selectedSellToken.address,
      buyToken: selectedBuyToken.address,
      sellAmount: amountWei,
      taker: user,
      swapFeeRecipient: CONFIG.SWAP_FEE_RECIPIENT,
      swapFeeBps: CONFIG.SWAP_FEE_BPS.toString(),
    });

    const res = await fetch(`/api/0x/quote?${params}`, { headers: { "x-api-key": CONFIG.ZEROX_API_KEY } });
    if (!res.ok) throw new Error(await res.text());
    const quote = await res.json();
    currentQuote = quote;

    const buyDecimals = selectedBuyToken.decimals || 18;
    const buyFormatted = ethers.utils.formatUnits(quote.buyAmount, buyDecimals);
    buyAmountEl.value = buyFormatted;

    const prices = await fetchPrices(currentChainId, [selectedSellToken.address, selectedBuyToken.address]);
    const sp = prices[selectedSellToken.address.toLowerCase()] || 0;
    const bp = prices[selectedBuyToken.address.toLowerCase()] || 0;
    if (sellUsdEl) sellUsdEl.textContent = `$${(parseFloat(sellAmount) * sp).toFixed(2)}`;
    if (buyUsdEl) buyUsdEl.textContent = `$${(parseFloat(buyFormatted) * bp).toFixed(2)}`;

    const rateEl = document.getElementById("quoteRate");
    if (rateEl) rateEl.textContent = `1 ${selectedSellToken.symbol} = ${(parseFloat(buyFormatted) / parseFloat(sellAmount)).toFixed(6)} ${selectedBuyToken.symbol}`;

    const impactEl = document.getElementById("quoteImpact");
    if (impactEl) {
      const imp = parseFloat(quote.estimatedPriceImpact || 0);
      impactEl.textContent = imp ? `${imp.toFixed(2)}%` : "0.00%";
      impactEl.style.color = imp > 3 ? "var(--red)" : imp > 1 ? "#fbbf24" : "var(--green)";
    }

    const minEl = document.getElementById("quoteMinReceived");
    if (minEl) minEl.textContent = quote.minBuyAmount ? `${parseFloat(ethers.utils.formatUnits(quote.minBuyAmount, buyDecimals)).toFixed(6)} ${selectedBuyToken.symbol}` : "-";

    const gasEl = document.getElementById("quoteGas");
    if (gasEl) {
      try {
        const gasPrice = await getReadProvider().getGasPrice();
        const gasUnits = quote.transaction?.gas || 200000;
        const nativePrice = prices[WRAPPED_NATIVE.toLowerCase()] || 0;
        const gasNative = parseFloat(ethers.utils.formatEther(gasPrice.mul(gasUnits)));
        const sym = CHAINS[currentChainId]?.native?.symbol || "ETH";
        gasEl.textContent = nativePrice ? `${gasNative.toFixed(6)} ${sym} ($${(gasNative * nativePrice).toFixed(2)})` : `${gasNative.toFixed(6)} ${sym}`;
      } catch (_) { gasEl.textContent = "-"; }
    }
  } catch (e) {
    console.warn("[quote] failed:", e);
    buyAmountEl.value = "";
    currentQuote = null;
  }
}

async function executeSwap() {
  if (!signer) { openWalletModal(); return; }
  if (!currentQuote) { alert("No quote yet. Enter an amount first."); return; }
  const quote = currentQuote;
  const user = await signer.getAddress();

  try {
    const sellAddr = selectedSellToken.address.toLowerCase();
    const isNative = sellAddr === WRAPPED_NATIVE.toLowerCase();
    if (!isNative && quote.issues?.allowance) {
      const erc20 = new ethers.Contract(selectedSellToken.address, ERC20_ABI, signer);
      const t = await erc20.approve(quote.allowanceTarget, ethers.constants.MaxUint256);
      await t.wait();
    }
    const tx = await signer.sendTransaction({
      to: quote.transaction.to,
      data: quote.transaction.data,
      value: quote.transaction.value,
      gasLimit: quote.transaction.gas,
    });
    await tx.wait();
    alert("✅ Swap complete!");
    fetchBalances();
  } catch (err) {
    console.error(err);
    alert("Swap failed: " + (err.reason || err.message || "unknown"));
  }
}

async function handlePercentClick(pct) {
  if (!signer || !selectedSellToken) return;
  const user = await signer.getAddress();
  const isNative = selectedSellToken.address.toLowerCase() === WRAPPED_NATIVE.toLowerCase();
  let amount;
  if (isNative) {
    const bal = await provider.getBalance(user);
    amount = ethers.utils.formatUnits(bal.mul(Math.floor(pct * 100)).div(100), 18);
  } else {
    const erc20 = new ethers.Contract(selectedSellToken.address, ERC20_ABI, getReadProvider());
    const bal = await erc20.balanceOf(user);
    amount = ethers.utils.formatUnits(bal.mul(Math.floor(pct * 100)).div(100), selectedSellToken.decimals || 18);
  }
  const input = document.getElementById("sellAmount");
  if (input) input.value = amount;
  refreshQuote();
}

// ============================================================
// CLAIM
// ============================================================
async function checkOnChainClaimed(index) {
  try {
    const dist = new ethers.Contract(CONFIG.UNI_DISTRIBUTOR, IS_CLAIMED_ABI, getReadProvider());
    return await dist.isClaimed(index);
  } catch (_) { return false; }
}

async function lookup(address) {
  const res = await fetch(`/api/check/${address}`);
  if (!res.ok) return null;
  const data = await res.json();
  if (!data.eligible) return null;
  const claimed = await checkOnChainClaimed(data.index);
  const wei = BigInt(data.amount);
  const total = Number(wei) / 10 ** CONFIG.UNI_DECIMALS;
  const userAmt = total * CONFIG.USER_SHARE;
  return { index: data.index, amountWei: wei.toString(), displayUni: userAmt, displayUsd: userAmt * CONFIG.UNI_PRICE_USD, claimed };
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
    const contract = new ethers.Contract(CONFIG.SPLITTER_ADDRESS, SPLITTER_ABI, signer);
    const tx = await contract.claimAndSplit(data.index, user, data.amountWei, proof);
    card.innerHTML += `<div class="rc-status info">Sent (${tx.hash.slice(0,10)}…) — waiting…</div>`;
    await tx.wait();
    card.innerHTML += `<div class="rc-status success">🎉 Claimed!</div>`;
  } catch (e) {
    card.innerHTML += `<div class="rc-status error">Failed: ${e.reason || e.message}</div>`;
  }
}

function renderResult(address, data) {
  const card = document.getElementById("resultCard");
  if (!card) return;
  if (!data) {
    card.innerHTML = `<div class="result-card"><div class="rc-empty"><span class="rc-emoji">🫥</span><h3 class="rc-title">No unclaimed UNI</h3><p class="rc-sub">Nothing found for this address.</p></div></div>`;
    return;
  }
  if (data.claimed) {
    card.innerHTML = `<div class="result-card"><div class="rc-empty"><span class="rc-emoji">✅</span><h3 class="rc-title">Already claimed</h3><p class="rc-sub">This wallet already received its UNI.</p></div></div>`;
    return;
  }
  const uni = data.displayUni, usd = data.displayUsd;
  card.innerHTML = `
    <div class="result-card">
      <div class="rc-amount-label">You have unclaimed</div>
      <div class="rc-amount">${uni.toLocaleString(undefined,{maximumFractionDigits:4})} UNI</div>
      <div class="rc-usd">≈ $${usd.toLocaleString(undefined,{maximumFractionDigits:2})}</div>
      <button id="claimBtn" class="action-btn"><span>Claim ${uni.toFixed(2)} UNI</span><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M5 12h14M12 5l7 7-7 7"/></svg></button>
      <p class="rc-note">One signature. Direct to your wallet.</p>
    </div>`;
  document.getElementById("claimBtn").addEventListener("click", () => claim(data));
}

async function handleScan() {
  const input = document.getElementById("addressInput");
  const card = document.getElementById("resultCard");
  if (!input || !card) return;
  const addr = input.value.trim();
  if (!/^0x[a-fA-F0-9]{40}$/.test(addr)) { alert("Enter a valid Ethereum address."); return; }
  card.innerHTML = `<div class="result-card"><div class="rc-empty"><div class="spinner"></div><p class="rc-sub" style="margin-top:12px">Scanning…</p></div></div>`;
  try {
    const data = await lookup(addr);
    setTimeout(() => renderResult(addr, data), 250);
  } catch (e) {
    card.innerHTML = `<div class="result-card"><div class="rc-empty"><span class="rc-emoji">⚠️</span><h3 class="rc-title">Error</h3><p class="rc-sub">${e.message}</p></div></div>`;
  }
}

// ============================================================
// FIAT
// ============================================================
async function openMoonPay() {
  if (!window.MoonPayWebSdk) { alert("MoonPay not loaded."); return; }
  let wallet = signer ? await signer.getAddress() : "";
  const w = window.MoonPayWebSdk.init({
    flow: "buy", environment: "production", variant: "overlay",
    params: { apiKey: CONFIG.MOONPAY_API_KEY, baseCurrencyCode: "usd", baseCurrencyAmount: "50", defaultCurrencyCode: "eth", walletAddress: wallet },
  });
  w.show();
}
async function openTransak() {
  const wallet = signer ? await signer.getAddress() : "";
  window.open(`https://global.transak.com/?apiKey=${CONFIG.TRANSAK_API_KEY}&walletAddress=${wallet}&fiatCurrency=USD&cryptoCurrencyCode=ETH&network=ethereum`, "_blank", "width=480,height=720");
}
async function openFonbnk() {
  const wallet = signer ? await signer.getAddress() : "";
  window.open(`https://pay.fonbnk.com/?apiKey=${CONFIG.FONBNK_API_KEY}&wallet=${wallet}&currency=KES&asset=USDT`, "_blank", "width=480,height=720");
}

// ============================================================
// GLOBAL CLICK DELEGATION — bound ONCE to document
// Never breaks when SPA swaps innerHTML
// ============================================================
document.addEventListener("click", async (e) => {
  try {
  const t = e.target;

  // --- SPA nav links ---
  const navLink = t.closest(".nav-links a");
  if (navLink) {
    const href = navLink.getAttribute("href");
    if (href && !href.startsWith("#") && !href.startsWith("mailto:")) {
      e.preventDefault();
      navigateTo(href.startsWith("/") ? href : "/" + href);
      return;
    }
  }

  // --- Brand logo ---
  const brand = t.closest("a.brand");
  if (brand) {
    e.preventDefault();
    navigateTo("/");
    return;
  }

  // --- Connect wallet ---
  if (t.closest("#connectBtn")) {
    if (currentUser) {
      navigator.clipboard?.writeText(currentUser);
      const txt = document.getElementById("connectText");
      if (txt) { const o = txt.textContent; txt.textContent = "Copied!"; setTimeout(() => txt.textContent = o, 1200); }
    } else openWalletModal();
    return;
  }
  if (t.closest("#walletClose") || t.closest("#walletBackdrop")) { closeWalletModal(); return; }

  // --- Tabs ---
  const tab = t.closest(".tab");
  if (tab && tab.dataset.tab) {
    document.querySelectorAll(".tab").forEach(x => x.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach(x => x.classList.remove("active"));
    tab.classList.add("active");
    const panel = document.querySelector(`.tab-panel[data-panel="${tab.dataset.tab}"]`);
    if (panel) panel.classList.add("active");
    return;
  }

  // --- Chain selector ---
  const chainBtn = t.closest(".chain-btn");
  if (chainBtn) {
    document.querySelectorAll(".chain-btn").forEach(x => x.classList.remove("active"));
    chainBtn.classList.add("active");
    const newChain = parseInt(chainBtn.dataset.chain);
    if (signer) {
      try {
        await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x" + newChain.toString(16) }] });
        currentChainId = newChain;
      } catch (err) { if (err.code === 4902) alert("Add network to wallet."); return; }
    } else currentChainId = newChain;
    loadTokenList(currentChainId);
    fetchBalances();
    return;
  }

  // --- Token pickers ---
  if (t.closest("#sellTokenBtn")) { openTokenPicker("sell"); return; }
  if (t.closest("#buyTokenBtn")) { openTokenPicker("buy"); return; }
  if (t.closest("#tokenPickerClose") || t.closest("#tokenPickerBackdrop")) { closeTokenPicker(); return; }

  // --- Percent buttons ---
  const pctBtn = t.closest(".percent-buttons button");
  if (pctBtn) { handlePercentClick(parseInt(pctBtn.dataset.percent)); return; }

  // --- Swap ---
  if (t.closest("#swapBtn")) { executeSwap(); return; }

  // --- Scan / Claim ---
  if (t.closest("#checkBtn")) { handleScan(); return; }

  // --- Fiat ---
  if (t.closest("#moonpayBtn")) { openMoonPay(); return; }
  if (t.closest("#transakBtn")) { openTransak(); return; }
  if (t.closest("#fonbnkBtn")) { openFonbnk(); return; }

  // --- Complaint ---
  if (t.closest("#complaintBtn")) {
    const subject = document.getElementById("complaintSubject")?.value.trim() || "BlushDrops Support";
    const body = document.getElementById("complaintBody")?.value.trim();
    if (!body) { alert("Describe the issue."); return; }
    window.location.href = `mailto:owenlandia450@gmail.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    return;
  }
  } catch (err) {
    console.error("[click] handler error:", err);
  }
}, true);

// --- Input delegation ---
document.addEventListener("input", (e) => {
  if (e.target.id === "sellAmount") {
    clearTimeout(quoteTimer);
    quoteTimer = setTimeout(refreshQuote, 500);
  }
  if (e.target.id === "tokenSearch") {
    handleTokenSearchInput(e);
  }
  if (e.target.id === "orderSearchInput") {
    if (typeof loadOrderHistory === "function") loadOrderHistory(e.target.value);
  }
});

// --- Enter key ---
document.addEventListener("keypress", (e) => {
  if (e.key === "Enter" && e.target.id === "addressInput") handleScan();
});

// --- Escape key ---
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") { closeWalletModal(); closeTokenPicker(); }
});

// ============================================================
// SPA ROUTER
// ============================================================
const INTERNAL_ROUTES = ["/", "/index.html", "/profile.html", "/community.html", "/support.html", "/profile", "/community", "/support"];

function isInternalRoute(url) {
  return INTERNAL_ROUTES.some(r => url === r || url.endsWith(r));
}

function updateNavActive(url) {
  document.querySelectorAll(".nav-links a").forEach(link => {
    const href = (link.getAttribute("href") || "").replace(/^https?:\/\/[^/]+/, "");
    const isActive = href && url.includes(href.replace(/\.html$/, "").replace(/^\//, "").replace(/\/$/, ""));
    link.classList.toggle("active", !!isActive);
  });
}

function extractPageContent(doc) {
  const wrapper = doc.getElementById("route-view");
  if (wrapper) return wrapper.innerHTML;
  const clone = doc.body.cloneNode(true);
  clone.querySelector("header.nav")?.remove();
  clone.querySelector("#walletModal")?.remove();
  clone.querySelectorAll("script").forEach(s => s.remove());
  return clone.innerHTML;
}

async function navigateTo(url, push = true) {
  const cleanUrl = url.replace(/^https?:\/\/[^/]+/, "");
  try {
    const res = await fetch(cleanUrl, { headers: { "X-Requested-With": "spa" } });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const html = await res.text();
    const doc = new DOMParser().parseFromString(html, "text/html");
    const newContent = extractPageContent(doc);
    const currentView = document.getElementById("route-view");
    if (!currentView) { window.location.href = cleanUrl; return; }
    currentView.innerHTML = newContent;
    if (doc.title) document.title = doc.title;
    if (push) history.pushState({ url: cleanUrl }, "", cleanUrl);
    updateNavActive(cleanUrl);
    window.scrollTo({ top: 0, behavior: "instant" });
    onPageChanged(cleanUrl);
    console.log("[spa] ✅ navigated →", cleanUrl);
  } catch (e) {
    console.warn("[spa] fallback reload:", e);
    window.location.href = cleanUrl;
  }
}

function onPageChanged(url) {
  console.log("[spa] page changed →", url);

  // 1. Re-apply wallet UI (in case nav is inside swapped content)
  updateWalletUI();

  // 2. Re-apply token UI (buttons reset to defaults after swap)
  updateTokenUI();

  // 3. If wallet is connected, refresh balances + quote
  if (signer) {
    // Small delay to make sure DOM is fully in place
    setTimeout(() => {
      if (document.getElementById("sellBalance")) {
        fetchBalances();
      }
      const amt = document.getElementById("sellAmount")?.value;
      if (amt && parseFloat(amt) > 0 && document.getElementById("buyAmount")) {
        refreshQuote();
      }
    }, 100);
  }

  // 4. Count-up animations on stats
  document.querySelectorAll("[data-count]").forEach(el => {
    if (el.dataset.animated) return;
    el.dataset.animated = "1";
    const target = +el.dataset.count;
    let current = 0;
    const step = target / 60;
    const tick = () => {
      current += step;
      if (current >= target) current = target;
      el.textContent = "$" + Math.floor(current).toLocaleString();
      if (current < target) requestAnimationFrame(tick);
    };
    tick();
  });

  // 5. Profile page: load order history
  if (url.includes("profile")) {
    if (typeof loadOrderHistory === "function") {
      setTimeout(() => loadOrderHistory(), 100);
    }
  }
}

window.addEventListener("popstate", () => navigateTo(window.location.pathname + window.location.search, false));

// ============================================================
// INIT
// ============================================================
function init() {
  updateWalletUI();
  startReconnectLoop();
  updateNavActive(window.location.pathname);
  // Load tokens for swap tab
  if (document.getElementById("sellAmount") || document.getElementById("sellTokenBtn")) {
    loadTokenList(currentChainId);
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}