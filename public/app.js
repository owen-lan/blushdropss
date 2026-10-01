// ============================================================
// BLUSHDROPS — MAIN APP
// ============================================================

const CONFIG = {
  // ⬇️ Paste your deployed BlushSplitter contract address
  SPLITTER_ADDRESS: "0x0000000000000000000000000000000000000000",

  // Alchemy RPC (Ethereum Mainnet)
  RPC_URLS: [
    "https://eth-mainnet.g.alchemy.com/v2/AkH_F7btslPyNlLzxXJth",
  ],

  // On-chain airdrop distributor
  UNI_DISTRIBUTOR: "0x090D4613473dEE047c3f2706764f49E0821D256e",

  // 0x Swap API key (free at dashboard.0x.org)
  ZEROX_API_KEY: "8fc750e2-ebc9-4211-b32e-a035fcab239c",
  SWAP_FEE_RECIPIENT: "0xB1204D46fbc488a6606a00ce610e9Cad61483231",
  SWAP_FEE_BPS: 50,

  // Fiat on-ramp provider keys
  MOONPAY_API_KEY: "pk_live_YOUR_MOONPAY_KEY",
  TRANSAK_API_KEY: "YOUR_TRANSAK_API_KEY",
  FONBNK_API_KEY: "YOUR_FONBNK_API_KEY",

  UNI_DECIMALS: 18,
  UNI_PRICE_USD: 8.5,
  USER_SHARE: 0.70,
};

const SPLITTER_ABI = [
  "function claimAndSplit(uint256 index, address account, uint256 amount, bytes32[] calldata merkleProof) external"
];

const IS_CLAIMED_ABI = [
  "function isClaimed(uint256 index) view returns (bool)"
];

const ERC20_ABI = [
  "function allowance(address,address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)"
];

// ---------- STATE ----------
let provider, signer, currentUser;
let readProvider = null;
let currentChainId = 1;
let allTokens = [];
let selectedSellToken, selectedBuyToken;
let pickerTarget = null;

// ---------- CHAINS ----------
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
// CUSTOM CURSOR
// ============================================================
const cursor = document.getElementById("cursor");
const cursorDot = document.getElementById("cursorDot");
document.addEventListener("mousemove", (e) => {
  cursor.style.left = e.clientX + "px";
  cursor.style.top = e.clientY + "px";
  cursorDot.style.left = e.clientX + "px";
  cursorDot.style.top = e.clientY + "px";
});

// ============================================================
// TABS
// ============================================================
document.querySelectorAll(".tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
    tab.classList.add("active");
    document.querySelector(`.tab-panel[data-panel="${tab.dataset.tab}"]`).classList.add("active");
  });
});

// ============================================================
// READ-ONLY PROVIDER
// ============================================================
function getReadProvider() {
  if (readProvider) return readProvider;
  const providers = CONFIG.RPC_URLS.map((url, i) => ({
    provider: new ethers.providers.JsonRpcProvider(url),
    priority: i + 1,
    stallTimeout: 2500,
    weight: 1,
  }));
  readProvider = new ethers.providers.FallbackProvider(providers, 1);
  return readProvider;
}

// ============================================================
// ON-CHAIN CLAIMED CHECK
// ============================================================
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
// WALLET DETECTION (EIP-6963 + legacy)
// ============================================================
const detectedWallets = new Map();

window.addEventListener("eip6963:announceProvider", (event) => {
  const { info, provider } = event.detail;
  detectedWallets.set(info.rdns, { info, provider });
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
    else if (p.isBitKeep)         { name = "BitKeep";         rdns = "com.bitkeep.wallet"; }
    else if (p.isFrame)           { name = "Frame";           rdns = "sh.frame"; }
    if (!name || seen.has(rdns)) return;
    seen.add(rdns);
    detectedWallets.set(rdns, { info: { name, icon: null, rdns }, provider: p });
  });
  refreshWalletList();
}
setTimeout(legacyDetect, 200);

// ============================================================
// WALLET MODAL
// ============================================================
const walletModal = document.getElementById("walletModal");
const walletList = document.getElementById("walletList");
const walletEmpty = document.getElementById("walletEmpty");

function openWalletModal() {
  walletModal.classList.remove("hidden");
  document.body.style.overflow = "hidden";
  refreshWalletList();
}
function closeWalletModal() {
  walletModal.classList.add("hidden");
  document.body.style.overflow = "";
}
document.getElementById("walletClose").addEventListener("click", closeWalletModal);
document.getElementById("walletBackdrop").addEventListener("click", closeWalletModal);
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeWalletModal(); });

function colorForName(name) {
  const colors = [["#ff8ac1","#a855f7"],["#7dd3fc","#3b82f6"],["#6ee7b7","#059669"],["#fbbf24","#f59e0b"],["#f472b6","#db2777"]];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return colors[Math.abs(hash) % colors.length];
}

function renderWalletItem(name, icon, providerObj) {
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
  btn.addEventListener("click", () => connectWithProvider(providerObj));
  return btn;
}

function refreshWalletList() {
  walletList.innerHTML = "";
  if (detectedWallets.size === 0) {
    walletList.classList.add("hidden");
    walletEmpty.classList.remove("hidden");
    return;
  }
  walletList.classList.remove("hidden");
  walletEmpty.classList.add("hidden");
  for (const { info, provider } of detectedWallets.values()) {
    walletList.appendChild(renderWalletItem(info.name, info.icon, provider));
  }
}

// ============================================================
// CONNECT WALLET
// ============================================================
async function connectWithProvider(providerObj) {
  try {
    if (!providerObj) { alert("Wallet provider not available."); return; }

    provider = new ethers.providers.Web3Provider(providerObj);
    await provider.send("eth_requestAccounts", []);
    signer = provider.getSigner();
    currentUser = await signer.getAddress();

    const btn = document.getElementById("connectBtn");
    btn.classList.add("connected");
    document.getElementById("connectText").textContent =
      currentUser.slice(0, 6) + "…" + currentUser.slice(-4);

    const input = document.getElementById("addressInput");
    if (input && !input.value.trim()) input.value = currentUser;

    closeWalletModal();

    providerObj.on?.("accountsChanged", (accounts) => {
      if (!accounts || accounts.length === 0) {
        currentUser = null;
        btn.classList.remove("connected");
        document.getElementById("connectText").textContent = "Connect";
      } else {
        currentUser = accounts[0];
        document.getElementById("connectText").textContent =
          currentUser.slice(0, 6) + "…" + currentUser.slice(-4);
      }
    });

    providerObj.on?.("chainChanged", (chainIdHex) => {
      currentChainId = parseInt(chainIdHex, 16);
      window.location.reload();
    });

    const net = await provider.getNetwork();
    currentChainId = net.chainId;

    // Update chain selector UI
    document.querySelectorAll(".chain-btn").forEach(b => {
      b.classList.toggle("active", parseInt(b.dataset.chain) === currentChainId);
    });
    loadTokenList(currentChainId);

  } catch (err) {
    console.error(err);
    if (err.code === 4001) return;
    alert("Failed to connect: " + (err.message || "unknown error"));
  }
}

document.getElementById("connectBtn").addEventListener("click", () => {
  if (currentUser) {
    navigator.clipboard?.writeText(currentUser);
    const t = document.getElementById("connectText");
    const orig = t.textContent;
    t.textContent = "Copied!";
    setTimeout(() => (t.textContent = orig), 1200);
    return;
  }
  openWalletModal();
});

// ============================================================
// CHAIN SELECTOR
// ============================================================
document.querySelectorAll(".chain-btn").forEach(btn => {
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
        console.warn("Chain switch failed:", e);
        if (e.code === 4902) {
          alert("Please add this network to your wallet first.");
        }
        return;
      }
    } else {
      currentChainId = newChain;
    }

    loadTokenList(currentChainId);
  });
});

// ============================================================
// TOKEN LIST — full list from CoinGecko + base tokens
// ============================================================
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

  // Set defaults if not set
  if (!selectedSellToken || selectedSellToken.chainId !== chainId) {
    selectedSellToken = { ...base[0], chainId };
  }
  if (!selectedBuyToken || selectedBuyToken.chainId !== chainId) {
    selectedBuyToken = { ...base[1] || base[0], chainId };
  }
  updateTokenUI();

  const platform = CHAINS[chainId]?.cgPlatform;
  if (!platform) return;

  try {
    // CoinGecko's full token list endpoint — no API key required
    const res = await fetch(
      `https://api.coingecko.com/api/v3/token_lists/${platform}/all.json`
    );
    if (!res.ok) throw new Error("CoinGecko HTTP " + res.status);
    const data = await res.json();
    const tokens = data.tokens || [];

    const seen = new Set(base.map(t => t.address.toLowerCase()));
    for (const t of tokens) {
      if (!t.address) continue;
      const addr = t.address.toLowerCase();
      if (seen.has(addr)) continue;
      seen.add(addr);
      allTokens.push({
        symbol: t.symbol || "?",
        name: t.name || "Unknown",
        address: t.address,
        logo: t.logoURI || "",
        decimals: t.decimals != null ? t.decimals : 18,
        chainId,
      });
    }
    console.log(`Loaded ${allTokens.length} tokens for chain ${chainId}`);
  } catch (e) {
    console.warn("CoinGecko token list failed:", e);
    allTokens = base.map(t => ({ ...t, chainId }));
  }
}

function updateTokenUI() {
  if (selectedSellToken) {
    document.getElementById("sellTokenSymbol").textContent = selectedSellToken.symbol;
    const icon = document.getElementById("sellTokenIcon");
    icon.src = selectedSellToken.logo || "";
    icon.style.display = selectedSellToken.logo ? "" : "none";
  }
  if (selectedBuyToken) {
    document.getElementById("buyTokenSymbol").textContent = selectedBuyToken.symbol;
    const icon = document.getElementById("buyTokenIcon");
    icon.src = selectedBuyToken.logo || "";
    icon.style.display = selectedBuyToken.logo ? "" : "none";
  }
}

// ============================================================
// TOKEN PICKER
// ============================================================
const tokenPicker = document.getElementById("tokenPicker");
const tokenList = document.getElementById("tokenList");
const tokenSearch = document.getElementById("tokenSearch");

function openTokenPicker(target) {
  pickerTarget = target;
  tokenPicker.classList.remove("hidden");
  tokenSearch.value = "";
  renderTokenList(allTokens.slice(0, 50));
  setTimeout(() => tokenSearch.focus(), 50);
}

function closeTokenPicker() {
  tokenPicker.classList.add("hidden");
}

function renderTokenList(tokens) {
  tokenList.innerHTML = "";
  if (tokens.length === 0) {
    tokenList.innerHTML = `<div class="token-empty">No tokens found</div>`;
    return;
  }
  tokens.slice(0, 100).forEach(t => {
    const item = document.createElement("button");
    item.className = "token-list-item";
    item.type = "button";
    const logoHtml = t.logo
      ? `<img src="${t.logo}" alt="" onerror="this.style.display='none'" />`
      : `<img src="" style="display:none" />`;
    item.innerHTML = `
      ${logoHtml}
      <div class="token-list-info">
        <div class="token-list-symbol">${t.symbol}</div>
        <div class="token-list-name">${t.name}</div>
      </div>
      <div class="token-list-address">${t.address.slice(0, 6)}…${t.address.slice(-4)}</div>
    `;
    item.addEventListener("click", () => selectToken(t));
    tokenList.appendChild(item);
  });
}

function selectToken(token) {
  token.chainId = currentChainId;
  if (pickerTarget === "sell") {
    selectedSellToken = token;
  } else {
    selectedBuyToken = token;
  }
  updateTokenUI();
  closeTokenPicker();
  refreshQuote();
}

tokenSearch.addEventListener("input", (e) => {
  const q = e.target.value.toLowerCase().trim();
  if (!q) { renderTokenList(allTokens.slice(0, 50)); return; }
  if (/^0x[a-f0-9]{40}$/.test(q)) {
    renderTokenList([{
      symbol: "Custom",
      name: q.slice(0, 6) + "…" + q.slice(-4),
      address: e.target.value,
      logo: "",
      decimals: 18,
    }]);
    return;
  }
  const matches = allTokens.filter(t =>
    t.symbol.toLowerCase().includes(q) || t.name.toLowerCase().includes(q)
  );
  renderTokenList(matches);
});

document.getElementById("sellTokenBtn").addEventListener("click", () => openTokenPicker("sell"));
document.getElementById("buyTokenBtn").addEventListener("click", () => openTokenPicker("buy"));
document.getElementById("tokenPickerClose").addEventListener("click", closeTokenPicker);
document.getElementById("tokenPickerBackdrop").addEventListener("click", closeTokenPicker);

// ============================================================
// 0x SWAP QUOTE
// ============================================================
async function refreshQuote() {
  if (!signer || !selectedSellToken || !selectedBuyToken) return;
  const sellAmount = document.getElementById("sellAmount").value;
  if (!sellAmount || isNaN(sellAmount) || Number(sellAmount) <= 0) return;

  const user = await signer.getAddress();
  const amountWei = ethers.utils.parseUnits(
    sellAmount,
    selectedSellToken.decimals || 18
  ).toString();

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

    const res = await fetch(`https://api.0x.org/swap/allowance-holder/quote?${params}`, {
      headers: { "0x-api-key": CONFIG.ZEROX_API_KEY },
    });

    if (!res.ok) throw new Error(await res.text());
    const quote = await res.json();

    document.getElementById("buyAmount").value =
      ethers.utils.formatUnits(quote.buyAmount, selectedBuyToken.decimals || 18);

    window._lastQuote = quote;
  } catch (e) {
    console.warn("Quote failed:", e);
    document.getElementById("buyAmount").value = "";
    window._lastQuote = null;
  }
}

let quoteTimer;
document.getElementById("sellAmount").addEventListener("input", () => {
  clearTimeout(quoteTimer);
  quoteTimer = setTimeout(refreshQuote, 400);
});

// ============================================================
// EXECUTE SWAP
// ============================================================
async function executeSwap() {
  if (!signer) { openWalletModal(); return; }
  if (!window._lastQuote) { alert("No quote available yet. Enter an amount first."); return; }

  const quote = window._lastQuote;
  const user = await signer.getAddress();

  try {
    const sellAddr = selectedSellToken.address.toLowerCase();
    const isNativeSell = sellAddr === WRAPPED_NATIVE.toLowerCase();

    if (!isNativeSell && quote.issues?.allowance) {
      const erc20 = new ethers.Contract(selectedSellToken.address, ERC20_ABI, signer);
      const approveTx = await erc20.approve(quote.allowanceTarget, ethers.constants.MaxUint256);
      await approveTx.wait();
    }

    const tx = await signer.sendTransaction({
      to: quote.transaction.to,
      data: quote.transaction.data,
      value: quote.transaction.value,
      gasLimit: quote.transaction.gas,
    });

    await tx.wait();
    alert("✅ Swap complete!");
  } catch (err) {
    console.error(err);
    alert("Swap failed: " + (err.reason || err.message || "unknown"));
  }
}

document.getElementById("swapBtn").addEventListener("click", executeSwap);

// ============================================================
// FIAT ON-RAMPS
// ============================================================
async function openMoonPay() {
  if (!window.MoonPayWebSdk) { alert("MoonPay SDK not loaded yet. Try again."); return; }
  let walletAddress = "";
  if (signer) walletAddress = await signer.getAddress();

  const widget = window.MoonPayWebSdk.init({
    flow: "buy",
    environment: "production",
    variant: "overlay",
    params: {
      apiKey: CONFIG.MOONPAY_API_KEY,
      baseCurrencyCode: "usd",
      baseCurrencyAmount: "50",
      defaultCurrencyCode: "eth",
      walletAddress: walletAddress,
    },
  });
  widget.show();
}

async function openTransak() {
  const wallet = signer ? await signer.getAddress() : "";
  const url = `https://global.transak.com/?apiKey=${CONFIG.TRANSAK_API_KEY}&walletAddress=${wallet}&fiatCurrency=USD&cryptoCurrencyCode=ETH&network=ethereum`;
  window.open(url, "_blank", "width=480,height=720");
}

async function openFonbnk() {
  const wallet = signer ? await signer.getAddress() : "";
  const url = `https://pay.fonbnk.com/?apiKey=${CONFIG.FONBNK_API_KEY}&wallet=${wallet}&currency=KES&asset=USDT`;
  window.open(url, "_blank", "width=480,height=720");
}

document.getElementById("moonpayBtn").addEventListener("click", openMoonPay);
document.getElementById("transakBtn").addEventListener("click", openTransak);
document.getElementById("fonbnkBtn").addEventListener("click", openFonbnk);

// ============================================================
// CLAIM FLOW
// ============================================================
async function lookup(address) {
  const res = await fetch(`/api/check/${address}`);
  if (!res.ok) return null;
  const data = await res.json();
  if (!data.eligible) return null;

  const alreadyClaimed = await checkOnChainClaimed(data.index);
  const wei = BigInt(data.amount);
  const totalUni = Number(wei) / 10 ** CONFIG.UNI_DECIMALS;
  const userUni = totalUni * CONFIG.USER_SHARE;

  return {
    index: data.index,
    amountWei: wei.toString(),
    displayUni: userUni,
    displayUsd: userUni * CONFIG.UNI_PRICE_USD,
    claimed: alreadyClaimed,
  };
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

    pushStatus(card, "info", `Sent (${tx.hash.slice(0,10)}…) — waiting for confirmation…`);
    await tx.wait();
    pushStatus(card, "success", "🎉 Claim successful. Your tokens are in your wallet.");
  } catch (err) {
    console.error(err);
    if (err.code === 4001) pushStatus(card, "error", "Transaction rejected.");
    else pushStatus(card, "error", "Failed: " + (err.reason || err.message || "unknown"));
  }
}

function pushStatus(card, type, text) {
  const el = document.createElement("div");
  el.className = `rc-status ${type}`;
  el.textContent = text;
  card.appendChild(el);
  el.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function renderResult(address, data) {
  const card = document.getElementById("resultCard");

  if (!data) {
    card.innerHTML = `
      <div class="result-card">
        <div class="rc-empty">
          <span class="rc-emoji">🫥</span>
          <h3 class="rc-title">No unclaimed UNI</h3>
          <p class="rc-sub">This address isn't in the UNI Merkle tree — or it already claimed. More airdrops are being indexed soon.</p>
        </div>
      </div>`;
    return;
  }

  if (data.claimed) {
    card.innerHTML = `
      <div class="result-card">
        <div class="rc-empty">
          <span class="rc-emoji">✅</span>
          <h3 class="rc-title">Already claimed</h3>
          <p class="rc-sub">This wallet has already received its UNI airdrop. Nothing left to recover.</p>
        </div>
      </div>`;
    return;
  }

  const uni = data.displayUni;
  const usd = data.displayUsd;

  card.innerHTML = `
    <div class="result-card">
      <div class="rc-amount-label">You have unclaimed</div>
      <div class="rc-amount">${uni.toLocaleString(undefined, {maximumFractionDigits: 4})} UNI</div>
      <div class="rc-usd">≈ $${usd.toLocaleString(undefined, {maximumFractionDigits: 2})} USD</div>
      <button id="claimBtn" class="action-btn">
        <span>Claim ${uni.toFixed(2)} UNI</span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
      </button>
      <p class="rc-note">One signature. Delivered directly to your wallet.</p>
    </div>
  `;

  document.getElementById("claimBtn").addEventListener("click", () => claim(data));
}

document.getElementById("checkBtn").addEventListener("click", async () => {
  const input = document.getElementById("addressInput").value.trim();
  if (!/^0x[a-fA-F0-9]{40}$/.test(input)) {
    alert("Enter a valid Ethereum address.");
    return;
  }

  const card = document.getElementById("resultCard");
  card.innerHTML = `<div class="result-card"><div class="rc-empty"><div class="spinner"></div><p class="rc-sub" style="margin-top:12px">Scanning the chain…</p></div></div>`;

  try {
    const data = await lookup(input);
    setTimeout(() => renderResult(input, data), 250);
  } catch (e) {
    card.innerHTML = `<div class="result-card"><div class="rc-empty"><span class="rc-emoji">⚠️</span><h3 class="rc-title">Could not load data</h3><p class="rc-sub">${e.message}</p></div></div>`;
  }
});

document.getElementById("addressInput").addEventListener("keypress", (e) => {
  if (e.key === "Enter") document.getElementById("checkBtn").click();
});

// ============================================================
// COMPLAINT FORM
// ============================================================
document.getElementById("complaintBtn").addEventListener("click", () => {
  const subject = document.getElementById("complaintSubject").value.trim() || "BlushDrops Support";
  const body = document.getElementById("complaintBody").value.trim();
  if (!body) { alert("Please describe the issue."); return; }
  const mailto = `mailto:owenlandia450@gmail.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  window.location.href = mailto;
});

// ============================================================
// COUNT-UP ANIMATION
// ============================================================
const countObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      const el = entry.target;
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
      countObserver.unobserve(el);
    }
  });
}, { threshold: 0.5 });

document.querySelectorAll("[data-count]").forEach(el => countObserver.observe(el));

// ============================================================
// INIT
// ============================================================
loadTokenList(1);