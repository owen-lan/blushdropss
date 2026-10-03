// ============================================================
// BLUSHDROPS — MAIN APP
// ============================================================

const CONFIG = {
  SPLITTER_ADDRESS: "0x0000000000000000000000000000000000000000",
  RPC_URLS: ["https://eth-mainnet.g.alchemy.com/v2/AkH_F7btslPyNlLzxXJth"],
  UNI_DISTRIBUTOR: "0x090D4613473dEE047c3f2706764f49E0821D256e",

  // 0x Swap API key (free at dashboard.0x.org)
  ZEROX_API_KEY: "8fc750e2-ebc9-4211-b32e-a035fcab239c",
  SWAP_FEE_RECIPIENT: "0xB1204D46fbc488a6606a00ce610e9Cad61483231",
  SWAP_FEE_BPS: 50, // 0.5%

  // Fiat on-ramp provider keys
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
const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
  "function decimals() view returns (uint8)",
];

const MULTICALL_ABI = [
  "function aggregate3((address target, bool allowFailure, bytes callData)[] calls) payable returns ((bool success, bytes returnData)[] returnData)",
  "function getEthBalance(address addr) view returns (uint256 balance)",
];
const MULTICALL_ADDRESS = "0xcA11bde05977b3631167028862bE2a173976CA11";

let provider, signer, currentUser;
let readProvider = null;
let currentChainId = 1;
let allTokens = [];
let selectedSellToken, selectedBuyToken;
let pickerTarget = null;
let currentQuote = null;

const CHAINS = {
  1:     { name: "Ethereum", cgPlatform: "ethereum",            native: { symbol: "ETH",  name: "Ethereum",  logo: "https://assets.coingecko.com/coins/images/279/small/ethereum.png" } },
  137:   { name: "Polygon",  cgPlatform: "polygon-pos",         native: { symbol: "MATIC", name: "Polygon",  logo: "https://assets.coingecko.com/coins/images/4713/small/matic-token-icon.png" } },
  8453:  { name: "Base",     cgPlatform: "base",                native: { symbol: "ETH",  name: "Ethereum",  logo: "https://assets.coingecko.com/coins/images/279/small/ethereum.png" } },
  42161: { name: "Arbitrum", cgPlatform: "arbitrum-one",        native: { symbol: "ETH",  name: "Ethereum",  logo: "https://assets.coingecko.com/coins/images/279/small/ethereum.png" } },
  10:    { name: "Optimism", cgPlatform: "optimistic-ethereum", native: { symbol: "ETH",  name: "Ethereum",  logo: "https://assets.coingecko.com/coins/images/279/small/ethereum.png" } },
  56:    { name: "BNB",      cgPlatform: "binance-smart-chain", native: { symbol: "BNB",  name: "BNB",       logo: "https://assets.coingecko.com/coins/images/825/small/bnb-icon2_2x.png" } },
};

const WRAPPED_NATIVE = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
// ============================================================
// DOM REFERENCES (declared first to avoid TDZ errors)
// ============================================================
const walletModalEl = document.getElementById("walletModal");
const walletListEl = document.getElementById("walletList");
const walletEmptyEl = document.getElementById("walletEmpty");

// ============================================================
// CUSTOM CURSOR
// ============================================================
// ---------- CURSOR ----------
const cursor = document.getElementById("cursor");
const cursorDot = document.getElementById("cursorDot");
document.addEventListener("mousemove", (e) => {
  if (cursor) { cursor.style.left = e.clientX + "px"; cursor.style.top = e.clientY + "px"; }
  if (cursorDot) { cursorDot.style.left = e.clientX + "px"; cursorDot.style.top = e.clientY + "px"; }
});


// ============================================================

// ---------- READ PROVIDER ----------
function getReadProvider() {
  if (readProvider) return readProvider;
  const providers = CONFIG.RPC_URLS.map((url, i) => ({
    provider: new ethers.providers.JsonRpcProvider(url),
    priority: i + 1, stallTimeout: 2500, weight: 1,
  }));
  readProvider = new ethers.providers.FallbackProvider(providers, 1);
  return readProvider;
}

// ---------- ON-CHAIN CLAIMED CHECK ----------
async function checkOnChainClaimed(index) {
  try {
    const p = getReadProvider();
    const dist = new ethers.Contract(CONFIG.UNI_DISTRIBUTOR, IS_CLAIMED_ABI, p);
    return await dist.isClaimed(index);
  } catch (e) {
    console.warn("isClaimed check failed:", e);
    return false;
  }
}

// ============================================================
// WALLET — persistent across all pages
// ============================================================
const detectedWallets = new Map();
const WALLET_STORAGE_KEY = "blushdrops_wallet_rdns";

function colorForName(name) {
  const colors = [["#ff8ac1","#a855f7"],["#7dd3fc","#3b82f6"],["#6ee7b7","#059669"],["#fbbf24","#f59e0b"],["#f472b6","#db2777"]];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return colors[Math.abs(hash) % colors.length];
}

function renderWalletItem(name, icon, providerObj, rdns) {
  const btn = document.createElement("button");
  btn.className = "wallet-item";
  btn.type = "button";
  const iconHtml = icon
    ? `<img src="${icon}" alt="${name}" />`
    : (() => {
        const [c1, c2] = colorForName(name);
        return `<span class="wallet-letter" style="background:linear-gradient(135deg,${c1},${c2})">${name[0].toUpperCase()}</span>`;
      })();
  btn.innerHTML = `
    <span class="wallet-item-icon">${iconHtml}</span>
    <span class="wallet-item-info">
      <span class="wallet-item-name">${name}</span>
      <span class="wallet-item-tag">Browser extension</span>
    </span>
    <span class="wallet-item-arrow">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 6l6 6-6 6"/></svg>
    </span>`;
  btn.addEventListener("click", () => connectWithProvider(providerObj, rdns));
  return btn;
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
  for (const [rdns, entry] of detectedWallets.entries()) {
    listEl.appendChild(renderWalletItem(entry.info.name, entry.info.icon, entry.provider, rdns));
  }
}

function openWalletModal() {
  const modalEl = document.getElementById("walletModal");
  if (!modalEl) return;
  modalEl.classList.remove("hidden");
  document.body.style.overflow = "hidden";
  refreshWalletList();
}

function closeWalletModal() {
  const modalEl = document.getElementById("walletModal");
  if (!modalEl) return;
  modalEl.classList.add("hidden");
  document.body.style.overflow = "";
}

// ---- Connect + persist choice ----
async function connectWithProvider(providerObj, rdns) {
  if (!providerObj) { alert("Wallet provider not available."); return; }
  if (typeof ethers === "undefined") { alert("Ethers library failed to load. Refresh the page."); return; }

  try {
    provider = new ethers.providers.Web3Provider(providerObj);
    await provider.send("eth_requestAccounts", []);
    signer = provider.getSigner();
    currentUser = await signer.getAddress();

    // Save chosen wallet so we auto-reconnect on other pages
    if (rdns) {
      try { localStorage.setItem(WALLET_STORAGE_KEY, rdns); } catch (_) {}
    }

    updateWalletUI();
    closeWalletModal();

    providerObj.on?.("accountsChanged", (accounts) => {
      if (!accounts || accounts.length === 0) {
        currentUser = null;
        try { localStorage.removeItem(WALLET_STORAGE_KEY); } catch (_) {}
        updateWalletUI();
      } else {
        currentUser = accounts[0];
        updateWalletUI();
        if (typeof fetchBalances === "function") fetchBalances();
      }
    });
    providerObj.on?.("chainChanged", () => window.location.reload());

    const net = await provider.getNetwork();
    currentChainId = net.chainId;
    document.querySelectorAll(".chain-btn").forEach(b => {
      b.classList.toggle("active", parseInt(b.dataset.chain) === currentChainId);
    });

    if (typeof loadTokenList === "function") loadTokenList(currentChainId);
    if (typeof fetchBalances === "function") fetchBalances();

    window.dispatchEvent(new CustomEvent("walletConnected", { detail: { address: currentUser } }));
  } catch (err) {
    console.error("[wallet] connect failed:", err);
    if (err.code === 4001) return;
    alert("Failed to connect: " + (err.message || "unknown error"));
  }
}

function updateWalletUI() {
  const btn = document.getElementById("connectBtn");
  const txt = document.getElementById("connectText");
  const input = document.getElementById("addressInput");

  if (currentUser) {
    if (btn) btn.classList.add("connected");
    if (txt) txt.textContent = currentUser.slice(0, 6) + "…" + currentUser.slice(-4);
    if (input && !input.value.trim()) input.value = currentUser;
  } else {
    if (btn) btn.classList.remove("connected");
    if (txt) txt.textContent = "Connect";
  }
}

// ---- Silent auto-reconnect on every page load ----
async function tryReconnect(providerObj) {
  if (typeof ethers === "undefined") return false;
  if (!providerObj) return false;
  if (currentUser) return true; // already connected

  try {
    const accounts = await providerObj.request({ method: "eth_accounts" });
    if (!accounts || accounts.length === 0) return false;

    provider = new ethers.providers.Web3Provider(providerObj);
    signer = provider.getSigner();
    currentUser = accounts[0];

    updateWalletUI();

    const net = await provider.getNetwork();
    currentChainId = net.chainId;
    document.querySelectorAll(".chain-btn").forEach(b => {
      b.classList.toggle("active", parseInt(b.dataset.chain) === currentChainId);
    });

    if (typeof loadTokenList === "function") loadTokenList(currentChainId);
    if (typeof fetchBalances === "function") fetchBalances();

    window.dispatchEvent(new CustomEvent("walletConnected", { detail: { address: currentUser } }));
    return true;
  } catch (e) {
    console.warn("[wallet] reconnect failed:", e);
    return false;
  }
}

// ---- Auto-reconnect: keep trying for 10 seconds ----
async function autoReconnect() {
  if (currentUser) return true; // already connected
  if (typeof ethers === "undefined") return false;
  if (!window.ethereum) return false;

  try {
    const accounts = await window.ethereum.request({ method: "eth_accounts" });
    if (!accounts || accounts.length === 0) return false;

    provider = new ethers.providers.Web3Provider(window.ethereum);
    signer = provider.getSigner();
    currentUser = accounts[0];

    updateWalletUI();

    const net = await provider.getNetwork();
    currentChainId = net.chainId;
    document.querySelectorAll(".chain-btn").forEach(b => {
      b.classList.toggle("active", parseInt(b.dataset.chain) === currentChainId);
    });

    if (typeof loadTokenList === "function") loadTokenList(currentChainId);
    if (typeof fetchBalances === "function") fetchBalances();

    window.dispatchEvent(new CustomEvent("walletConnected", { detail: { address: currentUser } }));
    console.log("[wallet] ✅ reconnected as", currentUser);
    return true;
  } catch (e) {
    console.warn("[wallet] reconnect attempt failed:", e);
    return false;
  }
}

// Kick off retry loop — runs every 250ms for up to 10 seconds
function startReconnectLoop() {
  let attempts = 0;
  const maxAttempts = 40; // 40 * 250ms = 10 seconds

  const tick = async () => {
    attempts++;
    const ok = await autoReconnect();

    if (ok) {
      console.log(`[wallet] reconnected on attempt ${attempts}`);
      return;
    }
    if (attempts < maxAttempts) {
      setTimeout(tick, 250);
    } else {
      console.log("[wallet] gave up after 10s — no wallet to reconnect");
    }
  };

  tick();
}

// ---- EIP-6963 ----
window.addEventListener("eip6963:announceProvider", (event) => {
  const { info, provider } = event.detail;
  detectedWallets.set(info.rdns, { info, provider });
  refreshWalletList();
  autoReconnect(); // try again the moment a wallet announces itself
});
window.dispatchEvent(new Event("eip6963:requestProvider"));

// Legacy injection events
window.addEventListener("ethereum#initialized", () => autoReconnect());
if (window.ethereum) {
  window.ethereum.on?.("connect", () => autoReconnect());
}

// ---- Legacy detection ----
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

// ---- Attach handlers after DOM is ready ----
function setupWalletHandlers() {
  const closeBtn = document.getElementById("walletClose");
  const backdrop = document.getElementById("walletBackdrop");
  const connectBtn = document.getElementById("connectBtn");

  if (closeBtn) closeBtn.addEventListener("click", closeWalletModal);
  if (backdrop) backdrop.addEventListener("click", closeWalletModal);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeWalletModal(); });

  if (connectBtn) {
    connectBtn.addEventListener("click", () => {
      if (currentUser) {
        navigator.clipboard?.writeText(currentUser);
        const t = document.getElementById("connectText");
        if (!t) return;
        const orig = t.textContent;
        t.textContent = "Copied!";
        setTimeout(() => (t.textContent = orig), 1200);
        return;
      }
      openWalletModal();
    });
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    setupWalletHandlers();
    startReconnectLoop();
  });
} else {
  setupWalletHandlers();
  startReconnectLoop();
}


// ---------- TOKEN LIST ----------
const BASE_TOKENS = {
  1: [
    { symbol: "ETH",  name: "Ethereum",       address: WRAPPED_NATIVE, logo: "https://assets.coingecko.com/coins/images/279/small/ethereum.png", decimals: 18 },
    { symbol: "UNI",  name: "Uniswap",        address: "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984", logo: "https://assets.coingecko.com/coins/images/12504/small/uniswap-uni.png", decimals: 18 },
    { symbol: "USDC", name: "USD Coin",       address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", logo: "https://assets.coingecko.com/coins/images/6319/small/usdc.png", decimals: 6 },
    { symbol: "USDT", name: "Tether",         address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", logo: "https://assets.coingecko.com/coins/images/325/small/Tether.png", decimals: 6 },
    { symbol: "DAI",  name: "Dai",            address: "0x6B175474E89094C44Da98b954EedeAC495271d0F", logo: "https://assets.coingecko.com/coins/images/9956/small/Badge_Dai.png", decimals: 18 },
    { symbol: "WBTC", name: "Wrapped Bitcoin",address: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599", logo: "https://assets.coingecko.com/coins/images/7598/small/wrapped_bitcoin_wbtc.png", decimals: 8 },
    { symbol: "LINK", name: "Chainlink",      address: "0x514910771AF9Ca656af840dff83E8264EcF986CA", logo: "https://assets.coingecko.com/coins/images/877/small/chainlink-new-logo.png", decimals: 18 },
    { symbol: "AAVE", name: "Aave",           address: "0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9", logo: "https://assets.coingecko.com/coins/images/12645/small/AAVE.png", decimals: 18 },
  ],
  137: [
    { symbol: "MATIC", name: "Polygon",       address: WRAPPED_NATIVE, logo: "https://assets.coingecko.com/coins/images/4713/small/matic-token-icon.png", decimals: 18 },
    { symbol: "USDC",  name: "USD Coin",      address: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174", logo: "https://assets.coingecko.com/coins/images/6319/small/usdc.png", decimals: 6 },
    { symbol: "USDT",  name: "Tether",        address: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F", logo: "https://assets.coingecko.com/coins/images/325/small/Tether.png", decimals: 6 },
    { symbol: "DAI",   name: "Dai",           address: "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063", logo: "https://assets.coingecko.com/coins/images/9956/small/Badge_Dai.png", decimals: 18 },
    { symbol: "WETH",  name: "Wrapped Ether", address: "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619", logo: "https://assets.coingecko.com/coins/images/2518/small/weth.png", decimals: 18 },
    { symbol: "LINK",  name: "Chainlink",     address: "0x53E0bca35eC356BD5ddDFebbD1Fc0fD03FaBad39", logo: "https://assets.coingecko.com/coins/images/877/small/chainlink-new-logo.png", decimals: 18 },
  ],
  8453: [
    { symbol: "ETH",   name: "Ethereum",      address: WRAPPED_NATIVE, logo: "https://assets.coingecko.com/coins/images/279/small/ethereum.png", decimals: 18 },
    { symbol: "USDC",  name: "USD Coin",      address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", logo: "https://assets.coingecko.com/coins/images/6319/small/usdc.png", decimals: 6 },
    { symbol: "DAI",   name: "Dai",           address: "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb", logo: "https://assets.coingecko.com/coins/images/9956/small/Badge_Dai.png", decimals: 18 },
  ],
  42161: [
    { symbol: "ETH",   name: "Ethereum",      address: WRAPPED_NATIVE, logo: "https://assets.coingecko.com/coins/images/279/small/ethereum.png", decimals: 18 },
    { symbol: "ARB",   name: "Arbitrum",      address: "0x912CE59144191C1204E64559FE8253a0e49E6548", logo: "https://assets.coingecko.com/coins/images/16547/small/photo_2023-03-29_21.47.00.jpeg", decimals: 18 },
    { symbol: "USDC",  name: "USD Coin",      address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", logo: "https://assets.coingecko.com/coins/images/6319/small/usdc.png", decimals: 6 },
    { symbol: "USDT",  name: "Tether",        address: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9", logo: "https://assets.coingecko.com/coins/images/325/small/Tether.png", decimals: 6 },
  ],
  10: [
    { symbol: "ETH",   name: "Ethereum",      address: WRAPPED_NATIVE, logo: "https://assets.coingecko.com/coins/images/279/small/ethereum.png", decimals: 18 },
    { symbol: "OP",    name: "Optimism",      address: "0x4200000000000000000000000000000000000042", logo: "https://assets.coingecko.com/coins/images/25244/small/Optimism.png", decimals: 18 },
    { symbol: "USDC",  name: "USD Coin",      address: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85", logo: "https://assets.coingecko.com/coins/images/6319/small/usdc.png", decimals: 6 },
  ],
  56: [
    { symbol: "BNB",   name: "BNB",           address: WRAPPED_NATIVE, logo: "https://assets.coingecko.com/coins/images/825/small/bnb-icon2_2x.png", decimals: 18 },
    { symbol: "USDT",  name: "Tether",        address: "0x55d398326f99059fF775485246999027B3197955", logo: "https://assets.coingecko.com/coins/images/325/small/Tether.png", decimals: 18 },
    { symbol: "USDC",  name: "USD Coin",      address: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", logo: "https://assets.coingecko.com/coins/images/6319/small/usdc.png", decimals: 18 },
    { symbol: "BUSD",  name: "Binance USD",   address: "0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56", logo: "https://assets.coingecko.com/coins/images/9576/small/BUSD.png", decimals: 18 },
  ],
};

async function loadTokenList(chainId) {
  const base = BASE_TOKENS[chainId] || [];
  allTokens = [...base];

  if (!selectedSellToken || selectedSellToken.chainId !== chainId) {
    selectedSellToken = { ...base[0], chainId };
  }
  if (!selectedBuyToken || selectedBuyToken.chainId !== chainId) {
    selectedBuyToken = { ...(base[1] || base[0]), chainId };
  }
  updateTokenUI();

  // CoinGecko token list CDN — different domain, no API key required
  const CG_TOKEN_LIST = {
    1:     "https://tokens.coingecko.com/ethereum/all.json",
    137:   "https://tokens.coingecko.com/polygon-pos/all.json",
    8453:  "https://tokens.coingecko.com/base/all.json",
    42161: "https://tokens.coingecko.com/arbitrum-one/all.json",
    10:    "https://tokens.coingecko.com/optimistic-ethereum/all.json",
    56:    "https://tokens.coingecko.com/binance-smart-chain/all.json",
  };

  const url = CG_TOKEN_LIST[chainId];
  if (!url) return;

  try {
    console.log(`Fetching token list for chain ${chainId}...`);
    const res = await fetch(url);
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();

    // Standard token list format: { tokens: [{ address, symbol, name, decimals, logoURI }, ...] }
    const tokens = data.tokens || [];
    console.log(`CoinGecko returned ${tokens.length} tokens`);

    const seen = new Set(base.map(t => t.address.toLowerCase()));
    let added = 0;

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
      added++;
    }

    console.log(`✅ Token list ready: ${allTokens.length} total (${added} added from CoinGecko)`);
  } catch (e) {
    console.warn("❌ CoinGecko token list failed, using base tokens only:", e);
    allTokens = base.map(t => ({ ...t, chainId }));
  }
}

function updateTokenUI() {
  if (selectedSellToken) {
    const el = document.getElementById("sellTokenSymbol"); if (el) el.textContent = selectedSellToken.symbol;
    const icon = document.getElementById("sellTokenIcon"); if (icon) { icon.src = selectedSellToken.logo || ""; icon.style.display = selectedSellToken.logo ? "" : "none"; }
  }
  if (selectedBuyToken) {
    const el = document.getElementById("buyTokenSymbol"); if (el) el.textContent = selectedBuyToken.symbol;
    const icon = document.getElementById("buyTokenIcon"); if (icon) { icon.src = selectedBuyToken.logo || ""; icon.style.display = selectedBuyToken.logo ? "" : "none"; }
  }
}

// ---------- TOKEN PICKER ----------
const tokenPicker = document.getElementById("tokenPicker");
const tokenListEl = document.getElementById("tokenList");
const tokenSearch = document.getElementById("tokenSearch");

function openTokenPicker(target) { pickerTarget = target; tokenPicker.classList.remove("hidden"); tokenSearch.value = ""; renderTokenList(allTokens.slice(0, 50)); setTimeout(() => tokenSearch.focus(), 50); }
function closeTokenPicker() { tokenPicker.classList.add("hidden"); }
function renderTokenList(tokens) {
  tokenListEl.innerHTML = "";
  if (tokens.length === 0) { tokenListEl.innerHTML = `<div class="token-empty">No tokens found</div>`; return; }
  tokens.slice(0, 100).forEach(t => {
    const item = document.createElement("button"); item.className = "token-list-item"; item.type = "button";
    const logoHtml = t.logo ? `<img src="${t.logo}" alt="" onerror="this.style.display='none'" />` : `<img src="" style="display:none" />`;
    item.innerHTML = `${logoHtml}<div class="token-list-info"><div class="token-list-symbol">${t.symbol}</div><div class="token-list-name">${t.name}</div></div><div class="token-list-address">${t.address.slice(0, 6)}…${t.address.slice(-4)}</div>`;
    item.addEventListener("click", () => selectToken(t)); tokenListEl.appendChild(item);
  });
}
function selectToken(token) {
  token.chainId = currentChainId;
  if (pickerTarget === "sell") selectedSellToken = token;
  else selectedBuyToken = token;

  updateTokenUI();
  closeTokenPicker();

  // INSTANT: refresh balances the moment a token is picked
  fetchBalances();

  // Refresh the quote only if there's already an amount typed
  const amt = document.getElementById("sellAmount")?.value;
  if (amt && parseFloat(amt) > 0) refreshQuote();
}

if (tokenSearch) tokenSearch.addEventListener("input", (e) => {
  const q = e.target.value.toLowerCase().trim();
  if (!q) { renderTokenList(allTokens.slice(0, 50)); return; }
  if (/^0x[a-f0-9]{40}$/.test(q)) { renderTokenList([{ symbol: "Custom", name: q.slice(0, 6) + "…" + q.slice(-4), address: e.target.value, logo: "", decimals: 18 }]); return; }
  const matches = allTokens.filter(t => t.symbol.toLowerCase().includes(q) || t.name.toLowerCase().includes(q));
  renderTokenList(matches);
});


if (document.getElementById("tokenPickerClose")) document.getElementById("tokenPickerClose").addEventListener("click", closeTokenPicker);
if (document.getElementById("tokenPickerBackdrop")) document.getElementById("tokenPickerBackdrop").addEventListener("click", closeTokenPicker);


// ---------- BALANCE FETCHING ----------
async function fetchBalances() {
  if (!signer || !selectedSellToken || !selectedBuyToken) return;

  const sellBalEl = document.getElementById("sellBalance");
  const buyBalEl = document.getElementById("buyBalance");
  const sellUsdEl = document.getElementById("sellUsd");
  const buyUsdEl = document.getElementById("buyUsd");

  if (!sellBalEl) return; // not on swap page

  // Show loading state
  sellBalEl.textContent = "loading…";
  buyBalEl.textContent = "loading…";

  try {
    const user = await signer.getAddress();
    const multicall = new ethers.Contract(MULTICALL_ADDRESS, MULTICALL_ABI, getReadProvider());
    const iface = new ethers.utils.Interface(ERC20_ABI);
    const NATIVE = WRAPPED_NATIVE.toLowerCase();

    const isSellNative = selectedSellToken.address.toLowerCase() === NATIVE;
    const isBuyNative = selectedBuyToken.address.toLowerCase() === NATIVE;

    const calls = [
      isSellNative
        ? { target: MULTICALL_ADDRESS, allowFailure: true, callData: multicall.interface.encodeFunctionData("getEthBalance", [user]) }
        : { target: selectedSellToken.address, allowFailure: true, callData: iface.encodeFunctionData("balanceOf", [user]) },
      isBuyNative
        ? { target: MULTICALL_ADDRESS, allowFailure: true, callData: multicall.interface.encodeFunctionData("getEthBalance", [user]) }
        : { target: selectedBuyToken.address, allowFailure: true, callData: iface.encodeFunctionData("balanceOf", [user]) },
    ];

    const results = await multicall.callStatic.aggregate3(calls);
    // ---- Parse balances ----
    let sellBal = "0";
    if (results[0].success) {
      sellBal = ethers.utils.formatUnits(
        ethers.BigNumber.from(results[0].returnData),
        selectedSellToken.decimals || 18
      );
    }
    let buyBal = "0";
    if (results[1].success) {
      buyBal = ethers.utils.formatUnits(
        ethers.BigNumber.from(results[1].returnData),
        selectedBuyToken.decimals || 18
      );
    }

    // ---- INSTANT: show token balances (no prices needed) ----
    sellBalEl.textContent = `${parseFloat(sellBal).toFixed(6)} ${selectedSellToken.symbol}`;
    buyBalEl.textContent = `${parseFloat(buyBal).toFixed(6)} ${selectedBuyToken.symbol}`;

    // ---- ASYNC: fetch prices and update USD ----
    fetchPrices(currentChainId, [selectedSellToken.address, selectedBuyToken.address])
      .then(prices => {
        const sellPrice = prices[selectedSellToken.address.toLowerCase()] || 0;
        const buyPrice = prices[selectedBuyToken.address.toLowerCase()] || 0;

        if (sellUsdEl) {
          sellUsdEl.textContent = sellPrice
            ? `$${(parseFloat(sellBal) * sellPrice).toFixed(2)}`
            : "$0.00";
        }
        if (buyUsdEl) {
          buyUsdEl.textContent = buyPrice
            ? `$${(parseFloat(buyBal) * buyPrice).toFixed(2)}`
            : "$0.00";
        }
      })
      .catch(() => {
        if (sellUsdEl) sellUsdEl.textContent = "$0.00";
        if (buyUsdEl) buyUsdEl.textContent = "$0.00";
      });

  } catch (e) {
    console.warn("Balance fetch failed:", e);
    sellBalEl.textContent = "0 " + selectedSellToken.symbol;
    buyBalEl.textContent = "0 " + selectedBuyToken.symbol;
    if (sellUsdEl) sellUsdEl.textContent = "$0.00";
    if (buyUsdEl) buyUsdEl.textContent = "$0.00";
  }
}



// ---------- LIVE PRICES (CoinGecko) ----------
let priceCache = {};
let priceCacheTime = 0;
const PRICE_CACHE_TTL = 60_000;

async function fetchPrices(chainId, tokenAddresses) {
  const now = Date.now();
  if (now - priceCacheTime < PRICE_CACHE_TTL && Object.keys(priceCache).length > 0) {
    return priceCache;
  }

  const platform = CHAINS[chainId]?.cgPlatform;
  if (!platform || !tokenAddresses.length) return priceCache;

  const headers = {};
  if (CONFIG.COINGECKO_API_KEY && !CONFIG.COINGECKO_API_KEY.includes("YOUR")) {
    headers["x-cg-demo-api-key"] = CONFIG.COINGECKO_API_KEY;
  }

  const nativeAddress = WRAPPED_NATIVE.toLowerCase();
  const erc20s = tokenAddresses
    .filter(a => a && a.toLowerCase() !== nativeAddress)
    .map(a => a.toLowerCase());

  const prices = {};

  // --- Native token price ---
  const nativeTokenIds = {
    1: "ethereum", 137: "matic-network", 8453: "ethereum",
    42161: "ethereum", 10: "ethereum", 56: "binancecoin",
  };
  const nativeId = nativeTokenIds[chainId];
  if (nativeId && tokenAddresses.some(a => a.toLowerCase() === nativeAddress)) {
    try {
      const r = await fetch(
        `https://api.coingecko.com/api/v3/simple/price?ids=${nativeId}&vs_currencies=usd`,
        { headers }
      );
      if (r.ok) {
        const d = await r.json();
        if (d[nativeId]?.usd) prices[nativeAddress] = d[nativeId].usd;
      }
    } catch (_) { /* silent */ }
  }

  // --- ERC-20 prices ---
  if (erc20s.length > 0) {
    try {
      const r = await fetch(
        `https://api.coingecko.com/api/v3/simple/token_price/${platform}?contract_addresses=${erc20s.join(",")}&vs_currencies=usd`,
        { headers }
      );
      if (r.ok) {
        const d = await r.json();
        for (const [addr, val] of Object.entries(d)) {
          if (val?.usd) prices[addr.toLowerCase()] = val.usd;
        }
      }
    } catch (_) { /* silent */ }
  }

  priceCache = { ...priceCache, ...prices };
  priceCacheTime = now;
  return priceCache;
}

// ---------- 0x SWAP QUOTE ----------
async function refreshQuote() {
  if (!signer || !selectedSellToken || !selectedBuyToken) return;

  const sellAmountStr = document.getElementById("sellAmount").value;
  const buyAmountEl = document.getElementById("buyAmount");
  const sellUsdEl = document.getElementById("sellUsd");
  const buyUsdEl = document.getElementById("buyUsd");

  // Reset if empty
  if (!sellAmountStr || isNaN(sellAmountStr) || Number(sellAmountStr) <= 0) {
    buyAmountEl.value = "";
    if (sellUsdEl) sellUsdEl.textContent = "$0.00";
    if (buyUsdEl) buyUsdEl.textContent = "$0.00";
    document.getElementById("quoteRate").textContent = "-";
    document.getElementById("quoteImpact").textContent = "-";
    document.getElementById("quoteGas").textContent = "-";
    document.getElementById("quoteMinReceived").textContent = "-";
    currentQuote = null;
    return;
  }

  const user = await signer.getAddress();
  const amountWei = ethers.utils.parseUnits(
    sellAmountStr,
    selectedSellToken.decimals || 18
  ).toString();

  try {
    // ---- 1. Fetch 0x quote ----
    const params = new URLSearchParams({
      chainId: currentChainId.toString(),
      sellToken: selectedSellToken.address,
      buyToken: selectedBuyToken.address,
      sellAmount: amountWei,
      taker: user,
      swapFeeRecipient: CONFIG.SWAP_FEE_RECIPIENT,
      swapFeeBps: CONFIG.SWAP_FEE_BPS.toString(),
    });

    const res = await fetch(
      `https://api.0x.org/swap/allowance-holder/quote?${params}`,
      { 
        headers: { 
          "0x-api-key": CONFIG.ZEROX_API_KEY,
          "0x-version": "v2",
        }, 
      }
    );

    if (!res.ok) throw new Error(await res.text());
    const quote = await res.json();
    currentQuote = quote;

    // ---- 2. Display buy amount ----
    const buyDecimals = selectedBuyToken.decimals || 18;
    const buyAmountFormatted = ethers.utils.formatUnits(quote.buyAmount, buyDecimals);
    buyAmountEl.value = buyAmountFormatted;

    // ---- 3. Fetch live USD prices ----
    const prices = await fetchPrices(currentChainId, [
      selectedSellToken.address,
      selectedBuyToken.address,
    ]);

    const sellPrice = prices[selectedSellToken.address.toLowerCase()] || 0;
    const buyPrice = prices[selectedBuyToken.address.toLowerCase()] || 0;

    const sellUsd = parseFloat(sellAmountStr) * sellPrice;
    const buyUsd = parseFloat(buyAmountFormatted) * buyPrice;

    if (sellUsdEl) sellUsdEl.textContent = `$${sellUsd.toFixed(2)}`;
    if (buyUsdEl) buyUsdEl.textContent = `$${buyUsd.toFixed(2)}`;

    // ---- 4. Rate & price impact ----
    const rateEl = document.getElementById("quoteRate");
    if (rateEl) {
      if (sellPrice && buyPrice) {
        const impliedRate = buyUsd / sellUsd;
        rateEl.textContent = `1 ${selectedSellToken.symbol} = ${(
          parseFloat(buyAmountFormatted) / parseFloat(sellAmountStr)
        ).toFixed(6)} ${selectedBuyToken.symbol}`;
      } else if (quote.price) {
        rateEl.textContent = `1 ${selectedSellToken.symbol} = ${parseFloat(
          quote.price
        ).toFixed(6)} ${selectedBuyToken.symbol}`;
      } else {
        rateEl.textContent = "-";
      }
    }

    const impactEl = document.getElementById("quoteImpact");
    if (impactEl) {
      const impact = quote.estimatedPriceImpact
        ? parseFloat(quote.estimatedPriceImpact)
        : 0;
      const impactColor = impact > 3 ? "var(--red)" : impact > 1 ? "#fbbf24" : "var(--green)";
      impactEl.textContent = impact ? `${impact.toFixed(2)}%` : "0.00%";
      impactEl.style.color = impactColor;
    }

    // ---- 5. Min received ----
    const minReceivedEl = document.getElementById("quoteMinReceived");
    if (minReceivedEl) {
      minReceivedEl.textContent = quote.minBuyAmount
        ? `${parseFloat(
            ethers.utils.formatUnits(quote.minBuyAmount, buyDecimals)
          ).toFixed(6)} ${selectedBuyToken.symbol}`
        : "-";
    }

    // ---- 6. Gas estimate ----
    const gasEl = document.getElementById("quoteGas");
    if (gasEl) {
      try {
        const gasPrice = await getReadProvider().getGasPrice();
        const nativePrice = prices[WRAPPED_NATIVE.toLowerCase()] || 0;
        const gasUnits = quote.transaction?.gas || quote.estimatedGas || 200000;
        const gasCostNative = parseFloat(
          ethers.utils.formatEther(gasPrice.mul(gasUnits))
        );
        const gasCostUsd = gasCostNative * nativePrice;
        const nativeSymbol = CHAINS[currentChainId]?.native?.symbol || "ETH";

        gasEl.textContent = nativePrice
          ? `${gasCostNative.toFixed(6)} ${nativeSymbol} ($${gasCostUsd.toFixed(2)})`
          : `${gasCostNative.toFixed(6)} ${nativeSymbol}`;
      } catch (e) {
        gasEl.textContent = "-";
      }
    }

  } catch (e) {
    console.warn("Quote failed:", e);
    buyAmountEl.value = "";
    if (sellUsdEl) sellUsdEl.textContent = "$0.00";
    if (buyUsdEl) buyUsdEl.textContent = "$0.00";
    currentQuote = null;

    // Show error in the status area if it's a hard fail
    const statusEl = document.getElementById("swapStatus");
    if (statusEl) {
      statusEl.className = "rc-status error";
      statusEl.textContent = "Quote failed: " + (e.message || "unknown");
      statusEl.classList.remove("hidden");
      setTimeout(() => statusEl.classList.add("hidden"), 4000);
    }
  }
}



// ---------- EXECUTE SWAP ----------
async function executeSwap() {
  if (!signer) { openWalletModal(); return; }
  if (!currentQuote) { alert("No quote available yet. Enter an amount and wait for a quote."); return; }
  const user = await signer.getAddress();
  try {
    const sellAddr = selectedSellToken.address.toLowerCase();
    const isNativeSell = sellAddr === WRAPPED_NATIVE.toLowerCase();
    if (!isNativeSell && currentQuote.issues?.allowance) {
      const erc20 = new ethers.Contract(selectedSellToken.address, ERC20_ABI, signer);
      const approveTx = await erc20.approve(currentQuote.allowanceTarget, ethers.constants.MaxUint256);
      await approveTx.wait();
    }
    const tx = await signer.sendTransaction({
      to: currentQuote.transaction.to, data: currentQuote.transaction.data,
      value: currentQuote.transaction.value, gasLimit: currentQuote.transaction.gas,
    });
    await tx.wait();
    alert("✅ Swap complete!");
    fetchBalances(); // Refresh balances
  } catch (err) {
    console.error(err);
    alert("Swap failed: " + (err.reason || err.message || "unknown"));
  }
}


// ---------- FIAT ON-RAMPS ----------
async function openMoonPay() {
  if (!window.MoonPayWebSdk) { alert("MoonPay SDK not loaded yet. Try again."); return; }
  let walletAddress = "";
  if (signer) walletAddress = await signer.getAddress();
  const widget = window.MoonPayWebSdk.init({
    flow: "buy", environment: "production", variant: "overlay",
    params: { apiKey: CONFIG.MOONPAY_API_KEY, baseCurrencyCode: "usd", baseCurrencyAmount: "50", defaultCurrencyCode: "eth", walletAddress: walletAddress },
  });
  widget.show();
}
async function openTransak() { const wallet = signer ? await signer.getAddress() : ""; const url = `https://global.transak.com/?apiKey=${CONFIG.TRANSAK_API_KEY}&walletAddress=${wallet}&fiatCurrency=USD&cryptoCurrencyCode=ETH&network=ethereum`; window.open(url, "_blank", "width=480,height=720"); }
async function openFonbnk() { const wallet = signer ? await signer.getAddress() : ""; const url = `https://pay.fonbnk.com/?apiKey=${CONFIG.FONBNK_API_KEY}&wallet=${wallet}&currency=KES&asset=USDT`; window.open(url, "_blank", "width=480,height=720"); }


// ---------- CLAIM FLOW ----------
async function lookup(address) {
  const res = await fetch(`/api/check/${address}`);
  if (!res.ok) return null;
  const data = await res.json();
  if (!data.eligible) return null;
  const alreadyClaimed = await checkOnChainClaimed(data.index);
  const wei = BigInt(data.amount);
  const totalUni = Number(wei) / 10 ** CONFIG.UNI_DECIMALS;
  const userUni = totalUni * CONFIG.USER_SHARE;
  return { index: data.index, amountWei: wei.toString(), displayUni: userUni, displayUsd: userUni * CONFIG.UNI_PRICE_USD, claimed: alreadyClaimed };
}
async function claim(data) {
  if (!signer) { openWalletModal(); return; }
  const user = await signer.getAddress();
  const card = document.getElementById("resultCard");
  try {
    pushStatus(card, "info", "Fetching proof…");
    const proofRes = await fetch(`/api/proof/${user}`);
    if (!proofRes.ok) throw new Error("Could not fetch proof");
    const { proof } = await proofRes.json();
    pushStatus(card, "info", "Preparing transaction…");
    const contract = new ethers.Contract(CONFIG.SPLITTER_ADDRESS, SPLITTER_ABI, signer);
    const tx = await contract.claimAndSplit(data.index, user, data.amountWei, proof);
    pushStatus(card, "info", `Sent (${tx.hash.slice(0, 10)}…) — waiting for confirmation…`);
    await tx.wait();
    pushStatus(card, "success", "🎉 Claim successful. Your tokens are in your wallet.");
  } catch (err) {
    console.error(err);
    if (err.code === 4001) pushStatus(card, "error", "Transaction rejected.");
    else pushStatus(card, "error", "Failed: " + (err.reason || err.message || "unknown"));
  }
}
function pushStatus(card, type, text) { const el = document.createElement("div"); el.className = `rc-status ${type}`; el.textContent = text; card.appendChild(el); el.scrollIntoView({ behavior: "smooth", block: "nearest" }); }
function renderResult(address, data) {
  const card = document.getElementById("resultCard");
  if (!data) { card.innerHTML = `<div class="result-card"><div class="rc-empty"><span class="rc-emoji">🫥</span><h3 class="rc-title">No unclaimed UNI</h3><p class="rc-sub">This address isn't in the UNI Merkle tree — or it already claimed.</p></div></div>`; return; }
  if (data.claimed) { card.innerHTML = `<div class="result-card"><div class="rc-empty"><span class="rc-emoji">✅</span><h3 class="rc-title">Already claimed</h3><p class="rc-sub">This wallet has already received its UNI airdrop.</p></div></div>`; return; }
  const uni = data.displayUni; const usd = data.displayUsd;
  card.innerHTML = `<div class="result-card"><div class="rc-amount-label">You have unclaimed</div><div class="rc-amount">${uni.toLocaleString(undefined, { maximumFractionDigits: 4 })} UNI</div><div class="rc-usd">≈ $${usd.toLocaleString(undefined, { maximumFractionDigits: 2 })} USD</div><button id="claimBtn" class="action-btn"><span>Claim ${uni.toFixed(2)} UNI</span><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M5 12h14M12 5l7 7-7 7"/></svg></button><p class="rc-note">One signature. Delivered directly to your wallet.</p></div>`;
  document.getElementById("claimBtn").addEventListener("click", () => claim(data));
}





// ---------- COUNT-UP ANIMATION ----------
const countObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      const el = entry.target; const target = +el.dataset.count; let current = 0; const step = target / 60;
      const tick = () => { current += step; if (current >= target) current = target; el.textContent = "$" + Math.floor(current).toLocaleString(); if (current < target) requestAnimationFrame(tick); };
      tick(); countObserver.unobserve(el);
    }
  });
}, { threshold: 0.5 });
document.querySelectorAll("[data-count]").forEach(el => countObserver.observe(el));

// ---------- SILENT AUTO-RECONNECT ----------
async function autoReconnect() {
  if (!window.ethereum) return;
  try {
    // eth_accounts does NOT prompt — returns already-authorized accounts
    const accounts = await window.ethereum.request({ method: "eth_accounts" });
    if (!accounts || accounts.length === 0) return;

    provider = new ethers.providers.Web3Provider(window.ethereum);
    signer = provider.getSigner();
    currentUser = accounts[0];

    // Update nav UI
    const btn = document.getElementById("connectBtn");
    if (btn) {
      btn.classList.add("connected");
      const txt = document.getElementById("connectText");
      if (txt) txt.textContent = currentUser.slice(0, 6) + "…" + currentUser.slice(-4);
    }

    // Prefill address input if on claim page
    const input = document.getElementById("addressInput");
    if (input && !input.value.trim()) input.value = currentUser;

    // Sync chain
    const net = await provider.getNetwork();
    currentChainId = net.chainId;
    document.querySelectorAll(".chain-btn").forEach(b => {
      b.classList.toggle("active", parseInt(b.dataset.chain) === currentChainId);
    });

    // Refresh balances if we're on the swap page
    if (document.getElementById("sellAmount")) {
      await loadTokenList(currentChainId);
      await fetchBalances();
    }

    // Notify other scripts (like profile.js)
    window.dispatchEvent(new CustomEvent("walletConnected", {
      detail: { address: currentUser }
    }));

    // Handle wallet events
    window.ethereum.on?.("accountsChanged", (accts) => {
      if (!accts || accts.length === 0) {
        currentUser = null;
        if (btn) { btn.classList.remove("connected"); document.getElementById("connectText").textContent = "Connect"; }
      } else {
        currentUser = accts[0];
        if (btn) document.getElementById("connectText").textContent = currentUser.slice(0, 6) + "…" + currentUser.slice(-4);
        fetchBalances();
        window.dispatchEvent(new CustomEvent("walletConnected", { detail: { address: currentUser } }));
      }
    });

    window.ethereum.on?.("chainChanged", () => window.location.reload());

  } catch (e) {
    console.warn("Auto-reconnect failed:", e);
  }
}

// ---------- INIT ----------
window.addEventListener("load", async () => {
  await autoReconnect();
  if (!signer && document.getElementById("sellAmount")) {
    loadTokenList(1); // cold start, no wallet — still load token list
  }
});
// ============================================================
// SPA ROUTER — bulletproof, no wrapper required
// ============================================================
const INTERNAL_ROUTES = [
  "/", "/index.html",
  "/profile.html", "/community.html", "/support.html",
  "/profile", "/community", "/support",
];

function isInternalRoute(url) {
  return INTERNAL_ROUTES.some(r => url === r || url.endsWith(r));
}

function updateNavActive(url) {
  document.querySelectorAll(".nav-links a").forEach(link => {
    const href = (link.getAttribute("href") || "").replace(/^https?:\/\/[^/]+/, "");
    const isActive = href && url.includes(href.replace(/\.html$/, "").replace(/^\//, ""));
    link.classList.toggle("active", !!isActive);
  });
}

function extractPageContent(doc) {
  // 1. Prefer #route-view wrapper if present
  const wrapper = doc.getElementById("route-view");
  if (wrapper) {
    console.log("[spa] using #route-view wrapper");
    return wrapper.innerHTML;
  }

  // 2. Fallback: clone body, strip nav + modal + scripts
  console.log("[spa] no wrapper — extracting body manually");
  const clone = doc.body.cloneNode(true);
  clone.querySelector("header.nav")?.remove();
  clone.querySelector("#walletModal")?.remove();
  clone.querySelectorAll("script").forEach(s => s.remove());
  return clone.innerHTML;
}

async function navigateTo(url, push = true) {
  const cleanUrl = url.replace(/^https?:\/\/[^/]+/, "");
  console.log("[spa] navigating →", cleanUrl);

  try {
    const res = await fetch(cleanUrl, { headers: { "X-Requested-With": "spa" } });
    console.log("[spa] fetch status:", res.status);
    if (!res.ok) throw new Error("HTTP " + res.status);

    const html = await res.text();
    const doc = new DOMParser().parseFromString(html, "text/html");
    const newContent = extractPageContent(doc);

    const currentView = document.getElementById("route-view");
    if (!currentView) {
      console.warn("[spa] current page missing #route-view — full nav");
      window.location.href = cleanUrl;
      return;
    }

    currentView.innerHTML = newContent;
    if (doc.title) document.title = doc.title;
    if (push) history.pushState({ url: cleanUrl }, "", cleanUrl);
    updateNavActive(cleanUrl);
    window.scrollTo({ top: 0, behavior: "instant" });
    onPageChanged(cleanUrl);
    console.log("[spa] ✅ navigated →", cleanUrl);
  } catch (e) {
    console.warn("[spa] ❌ fallback reload:", e);
    window.location.href = cleanUrl;
  }
}
// ============================================================
// REBIND HANDLERS after SPA navigation
// (elements inside #route-view get recreated, listeners are lost)
// ============================================================
function rebindDynamicHandlers() {
  console.log("[spa] rebinding dynamic handlers");

  // ---- Tabs ----
  document.querySelectorAll(".tab").forEach(tab => {
    if (tab.dataset.bound) return;
    tab.dataset.bound = "1";
    tab.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
      document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
      tab.classList.add("active");
      const panel = document.querySelector(`.tab-panel[data-panel="${tab.dataset.tab}"]`);
      if (panel) panel.classList.add("active");
    });
  });

  // ---- Chain selector ----
  document.querySelectorAll(".chain-btn").forEach(btn => {
    if (btn.dataset.bound) return;
    btn.dataset.bound = "1";
    btn.addEventListener("click", async () => {
      document.querySelectorAll(".chain-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      const newChain = parseInt(btn.dataset.chain);

      if (signer) {
        try {
          await window.ethereum.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: "0x" + newChain.toString(16) }],
          });
          currentChainId = newChain;
        } catch (e) {
          if (e.code === 4902) alert("Add this network to your wallet first.");
          return;
        }
      } else {
        currentChainId = newChain;
      }
      if (typeof loadTokenList === "function") loadTokenList(currentChainId);
      if (typeof fetchBalances === "function") fetchBalances();
    });
  });

  // ---- Token pickers ----
  const sellBtn = document.getElementById("sellTokenBtn");
  if (sellBtn && !sellBtn.dataset.bound) {
    sellBtn.dataset.bound = "1";
    sellBtn.addEventListener("click", () => openTokenPicker("sell"));
  }
  const buyBtn = document.getElementById("buyTokenBtn");
  if (buyBtn && !buyBtn.dataset.bound) {
    buyBtn.dataset.bound = "1";
    buyBtn.addEventListener("click", () => openTokenPicker("buy"));
  }

  // ---- Sell amount input ----
  const sellAmount = document.getElementById("sellAmount");
  if (sellAmount && !sellAmount.dataset.bound) {
    sellAmount.dataset.bound = "1";
    sellAmount.addEventListener("input", () => {
      clearTimeout(window.__quoteTimer);
      window.__quoteTimer = setTimeout(refreshQuote, 500);
    });
  }

  // ---- Percent buttons ----
  document.querySelectorAll(".percent-buttons button").forEach(btn => {
    if (btn.dataset.bound) return;
    btn.dataset.bound = "1";
    btn.addEventListener("click", async () => {
      if (!signer || !selectedSellToken) return;
      const pct = parseInt(btn.dataset.percent) / 100;
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
    });
  });

  // ---- Swap button ----
  const swapBtn = document.getElementById("swapBtn");
  if (swapBtn && !swapBtn.dataset.bound) {
    swapBtn.dataset.bound = "1";
    swapBtn.addEventListener("click", executeSwap);
  }

  // ---- Claim scan ----
  const checkBtn = document.getElementById("checkBtn");
  if (checkBtn && !checkBtn.dataset.bound) {
    checkBtn.dataset.bound = "1";
    checkBtn.addEventListener("click", async () => {
      const input = document.getElementById("addressInput");
      const addr = input?.value.trim();
      if (!addr || !/^0x[a-fA-F0-9]{40}$/.test(addr)) {
        alert("Enter a valid Ethereum address.");
        return;
      }
      const card = document.getElementById("resultCard");
      card.innerHTML = `<div class="result-card"><div class="rc-empty"><div class="spinner"></div><p class="rc-sub" style="margin-top:12px">Scanning the chain…</p></div></div>`;
      try {
        const data = await lookup(addr);
        setTimeout(() => renderResult(addr, data), 250);
      } catch (e) {
        card.innerHTML = `<div class="result-card"><div class="rc-empty"><span class="rc-emoji">⚠️</span><h3 class="rc-title">Could not load data</h3><p class="rc-sub">${e.message}</p></div></div>`;
      }
    });
  }

  const addrInput = document.getElementById("addressInput");
  if (addrInput && !addrInput.dataset.bound) {
    addrInput.dataset.bound = "1";
    addrInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter") document.getElementById("checkBtn")?.click();
    });
  }

  // ---- Fiat on-ramps ----
  const mp = document.getElementById("moonpayBtn");
  if (mp && !mp.dataset.bound) { mp.dataset.bound = "1"; mp.addEventListener("click", openMoonPay); }
  const tk = document.getElementById("transakBtn");
  if (tk && !tk.dataset.bound) { tk.dataset.bound = "1"; tk.addEventListener("click", openTransak); }
  const fb = document.getElementById("fonbnkBtn");
  if (fb && !fb.dataset.bound) { fb.dataset.bound = "1"; fb.addEventListener("click", openFonbnk); }

  // ---- Complaint form ----
  const complaintBtn = document.getElementById("complaintBtn");
  if (complaintBtn && !complaintBtn.dataset.bound) {
    complaintBtn.dataset.bound = "1";
    complaintBtn.addEventListener("click", () => {
      const subject = document.getElementById("complaintSubject")?.value.trim() || "BlushDrops Support";
      const body = document.getElementById("complaintBody")?.value.trim();
      if (!body) { alert("Please describe the issue."); return; }
      window.location.href = `mailto:owenlandia450@gmail.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    });
  }

  // ---- Order search (profile) ----
  const orderSearch = document.getElementById("orderSearchInput");
  if (orderSearch && !orderSearch.dataset.bound) {
    orderSearch.dataset.bound = "1";
    orderSearch.addEventListener("input", (e) => {
      if (typeof loadOrderHistory === "function") loadOrderHistory(e.target.value);
    });
  }

  // ---- Restore balances + quote if wallet is connected ----
  if (signer) {
    if (document.getElementById("sellBalance")) fetchBalances();
    if (document.getElementById("sellAmount")?.value) refreshQuote();
  }
}
function onPageChanged(url) {
  rebindDynamicHandlers();
  // Profile: load order history if wallet is connected
  if (url.includes("profile") && typeof loadOrderHistory === "function") {
    loadOrderHistory();
  }

  // Count-up animations
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

}

// Attach the click interceptor ONCE
if (!window.__spaClickBound) {
  window.__spaClickBound = true;

  document.addEventListener("click", (e) => {
    const link = e.target.closest("a");
    if (!link) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;

    const rawHref = link.getAttribute("href");
    if (!rawHref) return;
    if (rawHref.startsWith("#") || rawHref.startsWith("mailto:") || rawHref.startsWith("tel:")) return;

    // Resolve href to a full URL no matter what format it's in
    let url;
    try {
      url = new URL(rawHref, window.location.origin);
    } catch (_) {
      return;
    }

    // Compare domain ignoring www
    const siteDomain = window.location.hostname.replace(/^www\./, "");
    const linkDomain = url.hostname.replace(/^www\./, "");
    if (linkDomain !== siteDomain) {
      // External link — open in new tab, do nothing else
      link.setAttribute("target", "_blank");
      link.setAttribute("rel", "noopener");
      return;
    }

    // Extract the path
    const path = url.pathname;

    // Check if this is one of our internal pages
    const isInternal = INTERNAL_ROUTES.some(r => path === r || path.endsWith(r));
    if (!isInternal) return;

    e.preventDefault();
    e.stopImmediatePropagation();
    console.log("[spa] intercepting click →", path);
    navigateTo(path);
  }, true);

  console.log("[spa] click interceptor bound (v2 — URL-normalized)");
}
window.addEventListener("popstate", () => {
  navigateTo(window.location.pathname + window.location.search, false);
});

updateNavActive(window.location.pathname);