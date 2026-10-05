// ============================================================
// BLUSHDROPS — app.js (final)
// ============================================================
// ============================================================
// LEDGER COUNTERS — self-contained, runs no matter what
// ============================================================
(function setupCounters() {
  function applyCounters() {
    const els = document.querySelectorAll("[data-count]");
    if (els.length === 0) return;
    console.log(`[counter] applying to ${els.length} element(s)`);
    els.forEach((el, i) => {
      const target = +el.dataset.count || 0;
      const prefix = el.dataset.prefix !== undefined ? el.dataset.prefix : "$";
      const text = prefix + target.toLocaleString();
      if (el.textContent !== text) {
        el.textContent = text;
        console.log(`[counter] el ${i} → "${text}"`);
      }
    });
  }

  // Run on load
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", applyCounters);
  } else {
    applyCounters();
  }

  // Retry every 200ms for the first 10 seconds (handles any timing issue)
  let ticks = 0;
  const interval = setInterval(() => {
    applyCounters();
    if (++ticks > 50) clearInterval(interval);
  }, 200);

  // Watch for DOM changes (SPA navigation swaps content)
  const observer = new MutationObserver(() => applyCounters());
  window.addEventListener("load", () => {
    observer.observe(document.body, { childList: true, subtree: true });
  });
})();

const CONFIG = {
  SPLITTER_ADDRESS: "0x0000000000000000000000000000000000000000",
  RPC_URLS: {
    1:     "https://eth-mainnet.g.alchemy.com/v2/AkH_F7btslPyNlLzxXJth",
    137:   "https://polygon-mainnet.infura.io/v3/e6c913f06dbd4bdfafc295e9bceaf8b2",
    8453:  "https://base-mainnet.infura.io/v3/e6c913f06dbd4bdfafc295e9bceaf8b2",
    42161: "https://arbitrum-mainnet.infura.io/v3/e6c913f06dbd4bdfafc295e9bceaf8b2",
    10:    "https://optimism-mainnet.infura.io/v3/e6c913f06dbd4bdfafc295e9bceaf8b2",
    56:    "https://bnb-mainnet.g.alchemy.com/v2/-zEYYA_DbG4COJ3zwoJjR",
    
  },
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
const TOKEN_LIST_URLS = {
  1:     ["https://tokens.coingecko.com/ethereum/all.json", "https://gateway.ipfs.io/ipns/tokens.uniswap.org"],
  137:   ["https://tokens.coingecko.com/polygon-pos/all.json", "https://unpkg.com/quickswap-default-token-list@latest/build/quickswap-default.tokenlist.json"],
  8453:  ["https://tokens.coingecko.com/base/all.json"],
  42161: ["https://tokens.coingecko.com/arbitrum-one/all.json"],
  10:    ["https://tokens.coingecko.com/optimistic-ethereum/all.json"],
  56:    ["https://tokens.coingecko.com/binance-smart-chain/all.json", "https://tokens.pancakeswap.finance/pancakeswap-extended.json"],
};
// ---------- STATE ----------
let provider = null, signer = null, currentUser = null, readProvider = null;
let activeProvider = null;
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
  const url = CONFIG.RPC_URLS[currentChainId] || CONFIG.RPC_URLS[1];
  if (!readProvider || readProvider._chainId !== currentChainId) {
    readProvider = new ethers.providers.JsonRpcProvider(url);
    readProvider._chainId = currentChainId;
  }
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
// ============================================================
// HANDLE CHAIN CHANGE WITHOUT RELOADING
// ============================================================
async function handleChainChange(newChain) {
  if (currentChainId === newChain) return;

  console.log("[chain] detected change →", newChain);

  currentChainId = newChain;
  readProvider = null;
  priceCache = {};
  priceCacheTime = 0;
  currentQuote = null;

  // Update chain selector active state
  document.querySelectorAll(".chain-btn").forEach(b => {
    b.classList.toggle("active", parseInt(b.dataset.chain) === newChain);
  });

  // Rebuild provider + signer (ethers caches the old network)
  if (activeProvider) {
    try {
      provider = new ethers.providers.Web3Provider(activeProvider);
      signer = provider.getSigner();
      await provider.getNetwork();
      console.log("[chain] provider rebuilt for", newChain);
    } catch (e) {
      console.warn("[chain] rebuild failed:", e.message);
    }
  }

  // Reload tokens + balances for the new chain
  allTokens = [];
  await loadTokenList(newChain);
  fetchBalances();

  // Refresh quote if user already entered an amount
  const amt = document.getElementById("sellAmount")?.value;
  if (amt && parseFloat(amt) > 0) refreshQuote();
}

function getBaseTokens(chainId) {
  const bases = {
    1: [
      { symbol:"ETH",   name:"Ethereum",        address:WRAPPED_NATIVE, logo:"https://assets.coingecko.com/coins/images/279/small/ethereum.png", decimals:18 },
      { symbol:"WETH",  name:"Wrapped Ether",   address:"0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", logo:"https://assets.coingecko.com/coins/images/2518/small/weth.png", decimals:18 },
      { symbol:"USDC",  name:"USD Coin",        address:"0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", logo:"https://assets.coingecko.com/coins/images/6319/small/usdc.png", decimals:6 },
      { symbol:"USDT",  name:"Tether",          address:"0xdAC17F958D2ee523a2206206994597C13D831ec7", logo:"https://assets.coingecko.com/coins/images/325/small/Tether.png", decimals:6 },
      { symbol:"DAI",   name:"Dai",             address:"0x6B175474E89094C44Da98b954EedeAC495271d0F", logo:"https://assets.coingecko.com/coins/images/9956/small/Badge_Dai.png", decimals:18 },
      { symbol:"WBTC",  name:"Wrapped Bitcoin", address:"0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599", logo:"https://assets.coingecko.com/coins/images/7598/small/wrapped_bitcoin_wbtc.png", decimals:8 },
      { symbol:"UNI",   name:"Uniswap",         address:"0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984", logo:"https://assets.coingecko.com/coins/images/12504/small/uniswap-uni.png", decimals:18 },
      { symbol:"LINK",  name:"Chainlink",       address:"0x514910771AF9Ca656af840dff83E8264EcF986CA", logo:"https://assets.coingecko.com/coins/images/877/small/chainlink-new-logo.png", decimals:18 },
      { symbol:"AAVE",  name:"Aave",            address:"0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9", logo:"https://assets.coingecko.com/coins/images/12645/small/AAVE.png", decimals:18 },
      { symbol:"MATIC", name:"Polygon",         address:"0x7D1AfA7B718fb893dB30A3aBc0Cfc608AaCfeBB0", logo:"https://assets.coingecko.com/coins/images/4713/small/matic-token-icon.png", decimals:18 },
      { symbol:"SHIB",  name:"Shiba Inu",       address:"0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE", logo:"https://assets.coingecko.com/coins/images/11939/small/shiba.png", decimals:18 },
      { symbol:"PEPE",  name:"Pepe",            address:"0x6982508145454Ce325dDbE47a25d4ec3d2311933", logo:"https://assets.coingecko.com/coins/images/29850/small/pepe-token.jpeg", decimals:18 },
      { symbol:"MKR",   name:"Maker",           address:"0x9f8F72aA9304c8B593d555F12eF6589cC3A579A2", logo:"https://assets.coingecko.com/coins/images/1364/small/Mark_Maker.png", decimals:18 },
      { symbol:"CRV",   name:"Curve DAO",       address:"0xD533a949740bb3306d119CC777fa900bA034cd52", logo:"https://assets.coingecko.com/coins/images/12124/small/Curve.png", decimals:18 },
      { symbol:"LDO",   name:"Lido DAO",        address:"0x5A98FcBEA516Cf06857215779Fd812CA3beF1B32", logo:"https://assets.coingecko.com/coins/images/13573/small/Lido_DAO.png", decimals:18 },
      { symbol:"ENS",   name:"Ethereum Name Service", address:"0xC18360217D8F7Ab5e7c516566761Ea12Ce7F9D72", logo:"https://assets.coingecko.com/coins/images/19785/small/acatxTm8_400x400.jpg", decimals:18 },
      { symbol:"COMP",  name:"Compound",        address:"0xc00e94Cb662C3520282E6f5717214004A7f26888", logo:"https://assets.coingecko.com/coins/images/10775/small/COMP.png", decimals:18 },
      { symbol:"SNX",   name:"Synthetix",       address:"0xC011a73ee8576Fb46F5E1c5751cA3B9Fe0af2a6F", logo:"https://assets.coingecko.com/coins/images/3406/small/SNX.png", decimals:18 },
      { symbol:"GRT",   name:"The Graph",       address:"0xc944E90C64B2c07662A292be6244BDf05Cda44a7", logo:"https://assets.coingecko.com/coins/images/13397/small/Graph_Token.png", decimals:18 },
      { symbol:"1INCH", name:"1inch",           address:"0x111111111117dC0aa78b770fA6A738034120C302", logo:"https://assets.coingecko.com/coins/images/13469/small/1inch-token.png", decimals:18 },
      { symbol:"SUSHI", name:"SushiSwap",       address:"0x6B3595068778DD592e39A122f4f5a5cF09C90fE2", logo:"https://assets.coingecko.com/coins/images/12271/small/512x512_Logo_no_chop.png", decimals:18 },
      { symbol:"YFI",   name:"yearn.finance",   address:"0x0bc529c00C6401aEF6D220BE8C6Ea1667F6Ad93e", logo:"https://assets.coingecko.com/coins/images/11849/small/yfi-192x192.png", decimals:18 },
      { symbol:"BAT",   name:"Basic Attention", address:"0x0D8775F648430679A709E98d2b0Cb6250d2887EF", logo:"https://assets.coingecko.com/coins/images/677/small/basic-attention-token.png", decimals:18 },
    ],
    137: [
      { symbol:"MATIC", name:"Polygon",       address:WRAPPED_NATIVE, logo:"https://assets.coingecko.com/coins/images/4713/small/matic-token-icon.png", decimals:18 },
      { symbol:"WMATIC",name:"Wrapped MATIC", address:"0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270", logo:"https://assets.coingecko.com/coins/images/4713/small/matic-token-icon.png", decimals:18 },
      { symbol:"WETH",  name:"Wrapped Ether", address:"0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619", logo:"https://assets.coingecko.com/coins/images/2518/small/weth.png", decimals:18 },
      { symbol:"USDC",  name:"USD Coin",      address:"0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174", logo:"https://assets.coingecko.com/coins/images/6319/small/usdc.png", decimals:6 },
      { symbol:"USDT",  name:"Tether",        address:"0xc2132D05D31c914a87C6611C10748AEb04B58e8F", logo:"https://assets.coingecko.com/coins/images/325/small/Tether.png", decimals:6 },
      { symbol:"DAI",   name:"Dai",           address:"0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063", logo:"https://assets.coingecko.com/coins/images/9956/small/Badge_Dai.png", decimals:18 },
      { symbol:"WBTC",  name:"Wrapped Bitcoin", address:"0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6", logo:"https://assets.coingecko.com/coins/images/7598/small/wrapped_bitcoin_wbtc.png", decimals:8 },
      { symbol:"LINK",  name:"Chainlink",     address:"0x53E0bca35eC356BD5ddDFebbD1Fc0fD03FaBad39", logo:"https://assets.coingecko.com/coins/images/877/small/chainlink-new-logo.png", decimals:18 },
      { symbol:"AAVE",  name:"Aave",          address:"0xD6DF932A45C0f255f85145f286eA0b292B21C90B", logo:"https://assets.coingecko.com/coins/images/12645/small/AAVE.png", decimals:18 },
      { symbol:"CRV",   name:"Curve DAO",     address:"0x172370d5Cd63279eFa6d502DAB29171933a610AF", logo:"https://assets.coingecko.com/coins/images/12124/small/Curve.png", decimals:18 },
      { symbol:"SUSHI", name:"SushiSwap",     address:"0x0b3F868E0BE5597D5DB7fEB59E1CADBb0fdDa50a", logo:"https://assets.coingecko.com/coins/images/12271/small/512x512_Logo_no_chop.png", decimals:18 },
      { symbol:"GHST",  name:"Aavegotchi",    address:"0x385Eeac5cB85A38A9a07A70c73e0a3271CfB54A7", logo:"https://assets.coingecko.com/coins/images/12467/small/GHST.png", decimals:18 },
      { symbol:"QUICK", name:"QuickSwap",     address:"0xB5C064F955D8e7F38fE0460C556a72987494eE17", logo:"https://assets.coingecko.com/coins/images/13970/small/quick.png", decimals:18 },
      { symbol:"BAL",   name:"Balancer",      address:"0x9a71012B13CA4d3D0Cdc72A177DF3ef03b0E76A3", logo:"https://assets.coingecko.com/coins/images/11683/small/Balancer.png", decimals:18 },
      { symbol:"SNX",   name:"Synthetix",     address:"0x50B728D8D964fd00C2d0AAD81718b71311feF68a", logo:"https://assets.coingecko.com/coins/images/3406/small/SNX.png", decimals:18 },
    ],
    8453: [
      { symbol:"ETH",   name:"Ethereum",       address:WRAPPED_NATIVE, logo:"https://assets.coingecko.com/coins/images/279/small/ethereum.png", decimals:18 },
      { symbol:"WETH",  name:"Wrapped Ether",  address:"0x4200000000000000000000000000000000000006", logo:"https://assets.coingecko.com/coins/images/2518/small/weth.png", decimals:18 },
      { symbol:"USDC",  name:"USD Coin",       address:"0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", logo:"https://assets.coingecko.com/coins/images/6319/small/usdc.png", decimals:6 },
      { symbol:"USDbC", name:"USD Base Coin",  address:"0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA", logo:"https://assets.coingecko.com/coins/images/6319/small/usdc.png", decimals:6 },
      { symbol:"DAI",   name:"Dai",            address:"0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb", logo:"https://assets.coingecko.com/coins/images/9956/small/Badge_Dai.png", decimals:18 },
      { symbol:"cbETH", name:"Coinbase ETH",   address:"0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22", logo:"https://assets.coingecko.com/coins/images/27008/small/cbeth.png", decimals:18 },
      { symbol:"AERO",  name:"Aerodrome",      address:"0x940181a94A35A4569E4529A3CDfB74e38FD98631", logo:"https://assets.coingecko.com/coins/images/31745/small/token.png", decimals:18 },
      { symbol:"DEGEN", name:"Degen",          address:"0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed", logo:"https://assets.coingecko.com/coins/images/34515/small/android-chrome-512x512.png", decimals:18 },
      { symbol:"TOSHI", name:"Toshi",          address:"0xAC1Bd2486aAf3B5C0fc3Fd868558b082a531B2B4", logo:"https://assets.coingecko.com/coins/images/31126/small/Toshi_Logo_-_Transparent.png", decimals:18 },
      { symbol:"BRETT", name:"Brett",          address:"0x532f27101965dd16442E59d40670FaF5eBB142E4", logo:"https://assets.coingecko.com/coins/images/35529/small/1000050750.png", decimals:18 },
    ],
    42161: [
      { symbol:"ETH",   name:"Ethereum",       address:WRAPPED_NATIVE, logo:"https://assets.coingecko.com/coins/images/279/small/ethereum.png", decimals:18 },
      { symbol:"WETH",  name:"Wrapped Ether",  address:"0x82aF49447D8a07e3bd95BD0d56f35241523fBab1", logo:"https://assets.coingecko.com/coins/images/2518/small/weth.png", decimals:18 },
      { symbol:"USDC",  name:"USD Coin",       address:"0xaf88d065e77c8cC2239327C5EDb3A432268e5831", logo:"https://assets.coingecko.com/coins/images/6319/small/usdc.png", decimals:6 },
      { symbol:"USDC.e",name:"Bridged USDC",   address:"0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8", logo:"https://assets.coingecko.com/coins/images/6319/small/usdc.png", decimals:6 },
      { symbol:"USDT",  name:"Tether",         address:"0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9", logo:"https://assets.coingecko.com/coins/images/325/small/Tether.png", decimals:6 },
      { symbol:"DAI",   name:"Dai",            address:"0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1", logo:"https://assets.coingecko.com/coins/images/9956/small/Badge_Dai.png", decimals:18 },
      { symbol:"ARB",   name:"Arbitrum",       address:"0x912CE59144191C1204E64559FE8253a0e49E6548", logo:"https://assets.coingecko.com/coins/images/16547/small/photo_2023-03-29_21.47.00.jpeg", decimals:18 },
      { symbol:"WBTC",  name:"Wrapped Bitcoin", address:"0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f", logo:"https://assets.coingecko.com/coins/images/7598/small/wrapped_bitcoin_wbtc.png", decimals:8 },
      { symbol:"LINK",  name:"Chainlink",      address:"0xf97f4df75117a78c1A5a0DBb814Af92458539FB4", logo:"https://assets.coingecko.com/coins/images/877/small/chainlink-new-logo.png", decimals:18 },
      { symbol:"GMX",   name:"GMX",            address:"0xfc5A1A6EB076a2C7aD06eD22C90d7E710E35ad0a", logo:"https://assets.coingecko.com/coins/images/18323/small/arbit.png", decimals:18 },
      { symbol:"MAGIC", name:"Magic",          address:"0x539bdE0d7Dbd336b79148AA742883198BBF60342", logo:"https://assets.coingecko.com/coins/images/18623/small/magic.png", decimals:18 },
      { symbol:"RDNT",  name:"Radiant Capital", address:"0x3082CC23568eA640225c2467653dB90e9250AaA0", logo:"https://assets.coingecko.com/coins/images/26536/small/Radiant-Logo-200x200.png", decimals:18 },
      { symbol:"GRAIL", name:"Camelot",        address:"0x3d9907F9a368ad0a51Be60f7Da3b97cf940982D8", logo:"https://assets.coingecko.com/coins/images/27244/small/GRAIL.png", decimals:18 },
      { symbol:"PENDLE",name:"Pendle",         address:"0x0c880f6761F1af8d9Aa9C466984b80DAb9a8c9e8", logo:"https://assets.coingecko.com/coins/images/15069/small/Pendle_Logo_Normal-03.png", decimals:18 },
    ],
    10: [
      { symbol:"ETH",   name:"Ethereum",       address:WRAPPED_NATIVE, logo:"https://assets.coingecko.com/coins/images/279/small/ethereum.png", decimals:18 },
      { symbol:"WETH",  name:"Wrapped Ether",  address:"0x4200000000000000000000000000000000000006", logo:"https://assets.coingecko.com/coins/images/2518/small/weth.png", decimals:18 },
      { symbol:"USDC",  name:"USD Coin",       address:"0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85", logo:"https://assets.coingecko.com/coins/images/6319/small/usdc.png", decimals:6 },
      { symbol:"USDC.e",name:"Bridged USDC",   address:"0x7F5c764cBc14f9669B88837ca1490cCa17c31607", logo:"https://assets.coingecko.com/coins/images/6319/small/usdc.png", decimals:6 },
      { symbol:"USDT",  name:"Tether",         address:"0x94b008aA00579c1307B0EF2c499aD98a8ce58e58", logo:"https://assets.coingecko.com/coins/images/325/small/Tether.png", decimals:6 },
      { symbol:"DAI",   name:"Dai",            address:"0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1", logo:"https://assets.coingecko.com/coins/images/9956/small/Badge_Dai.png", decimals:18 },
      { symbol:"OP",    name:"Optimism",       address:"0x4200000000000000000000000000000000000042", logo:"https://assets.coingecko.com/coins/images/25244/small/Optimism.png", decimals:18 },
      { symbol:"WBTC",  name:"Wrapped Bitcoin", address:"0x68f180fcCe6836688e9084f035309E29Bf0A2095", logo:"https://assets.coingecko.com/coins/images/7598/small/wrapped_bitcoin_wbtc.png", decimals:8 },
      { symbol:"LINK",  name:"Chainlink",      address:"0x350a791Bfc2C21F9Ed5d10980Dad2e2638ffa7f6", logo:"https://assets.coingecko.com/coins/images/877/small/chainlink-new-logo.png", decimals:18 },
      { symbol:"SNX",   name:"Synthetix",      address:"0x8700dAec35aF8Ff88c16BdF0418774CB3D7599B4", logo:"https://assets.coingecko.com/coins/images/3406/small/SNX.png", decimals:18 },
      { symbol:"AAVE",  name:"Aave",           address:"0x76FB31fb4af56892A25e32cFC43De717950c9278", logo:"https://assets.coingecko.com/coins/images/12645/small/AAVE.png", decimals:18 },
      { symbol:"PERP",  name:"Perpetual",      address:"0x9e1028F5F1D5eDE59748FFceE5532509976840E0", logo:"https://assets.coingecko.com/coins/images/12381/small/60d18e06844a844ad75901a9_mark_only_03.png", decimals:18 },
    ],
    56: [
      { symbol:"BNB",   name:"BNB",            address:WRAPPED_NATIVE, logo:"https://assets.coingecko.com/coins/images/825/small/bnb-icon2_2x.png", decimals:18 },
      { symbol:"WBNB",  name:"Wrapped BNB",    address:"0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c", logo:"https://assets.coingecko.com/coins/images/12591/small/binance-coin-logo.png", decimals:18 },
      { symbol:"USDT",  name:"Tether",         address:"0x55d398326f99059fF775485246999027B3197955", logo:"https://assets.coingecko.com/coins/images/325/small/Tether.png", decimals:18 },
      { symbol:"USDC",  name:"USD Coin",       address:"0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", logo:"https://assets.coingecko.com/coins/images/6319/small/usdc.png", decimals:18 },
      { symbol:"BUSD",  name:"Binance USD",    address:"0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56", logo:"https://assets.coingecko.com/coins/images/9576/small/BUSD.png", decimals:18 },
      { symbol:"DAI",   name:"Dai",            address:"0x1AF3F329e8BE154074D8769D1FFa4eE058B1DBc3", logo:"https://assets.coingecko.com/coins/images/9956/small/Badge_Dai.png", decimals:18 },
      { symbol:"BTCB",  name:"Bitcoin BEP2",   address:"0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c", logo:"https://assets.coingecko.com/coins/images/14108/small/Binance-bitcoin.png", decimals:18 },
      { symbol:"ETH",   name:"Ethereum",       address:"0x2170Ed0880ac9A755fd29B2688956BD959F933F8", logo:"https://assets.coingecko.com/coins/images/279/small/ethereum.png", decimals:18 },
      { symbol:"CAKE",  name:"PancakeSwap",    address:"0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82", logo:"https://assets.coingecko.com/coins/images/12632/small/pancakeswap-cake-logo_%281%29.png", decimals:18 },
      { symbol:"XRP",   name:"XRP",            address:"0x1D2F0da169ceB9fC7B3144628dB156f3F6c60dBE", logo:"https://assets.coingecko.com/coins/images/44/small/xrp-symbol-white-128.png", decimals:18 },
      { symbol:"ADA",   name:"Cardano",        address:"0x3EE2200Efb3400fAbB9AacF31297cBdD1d435D47", logo:"https://assets.coingecko.com/coins/images/975/small/cardano.png", decimals:18 },
      { symbol:"DOGE",  name:"Dogecoin",       address:"0xbA2aE424d960c26247Dd6c32edC70B295c744C43", logo:"https://assets.coingecko.com/coins/images/5/small/dogecoin.png", decimals:8 },
      { symbol:"SHIB",  name:"Shiba Inu",      address:"0x2859e4544C4bB03966803b044A93563Bd2D0DD4D", logo:"https://assets.coingecko.com/coins/images/11939/small/shiba.png", decimals:18 },
      { symbol:"MATIC", name:"Polygon",        address:"0xCC42724C6683B7E57334c4E856f4c9965ED682bD", logo:"https://assets.coingecko.com/coins/images/4713/small/matic-token-icon.png", decimals:18 },
      { symbol:"LINK",  name:"Chainlink",      address:"0xF8A0BF9cF54Bb92F17374d9e9A321E6a111a51bD", logo:"https://assets.coingecko.com/coins/images/877/small/chainlink-new-logo.png", decimals:18 },
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
    activeProvider = providerObj;
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
    providerObj.on?.("chainChanged", (chainIdHex) => {
      const newChain = parseInt(chainIdHex, 16);
      handleChainChange(newChain);
    });
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
    activeProvider = chosen;
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

async function loadTokenList(chainId) {
  if (allTokens.length > 50 && allTokens[0]?.chainId === chainId && selectedSellToken?.address && selectedBuyToken?.address) return;

  const base = getBaseTokens(chainId);
  allTokens = base.map(t => ({ ...t, chainId }));
  selectedSellToken = { ...base[0], chainId };
  selectedBuyToken = { ...(base[1] || base[0]), chainId };
  updateTokenUI();
  console.log(`[tokens] base set for chain ${chainId}: ${allTokens.length} tokens`);

  const urls = TOKEN_LIST_URLS[chainId] || [];
  if (!urls.length) return;

  const headers = {};
  if (CONFIG.COINGECKO_API_KEY && !CONFIG.COINGECKO_API_KEY.includes("YOUR")) headers["x-cg-demo-api-key"] = CONFIG.COINGECKO_API_KEY;

  let data = null;
  for (const url of urls) {
    try {
      console.log(`[tokens] trying ${url}`);
      const res = await fetch(url, { headers });
      if (!res.ok) { console.warn(`[tokens] ${url} → HTTP ${res.status}`); continue; }
      data = await res.json();
      if (data && Array.isArray(data.tokens) && data.tokens.length) {
        console.log(`[tokens] ✅ loaded ${data.tokens.length} from ${url}`);
        break;
      } else {
        console.warn(`[tokens] ${url} → empty or wrong shape`, Object.keys(data || {}));
        data = null;
      }
    } catch (e) {
      console.warn(`[tokens] ${url} → ${e.message}`);
    }
  }

  if (!data) { console.warn(`[tokens] all sources failed for chain ${chainId}`); return; }

  const seen = new Set(base.map(t => t.address.toLowerCase()));
  let added = 0;
  for (const t of data.tokens) {
    if (!t.address || !t.symbol) continue;
    const a = t.address.toLowerCase();
    if (seen.has(a)) continue;
    seen.add(a);
    allTokens.push({
      symbol: t.symbol,
      name: t.name || t.symbol,
      address: t.address,
      logo: t.logoURI || t.logo || "",
      decimals: t.decimals != null ? t.decimals : 18,
      chainId,
    });
    added++;
  }
  console.log(`[tokens] chain ${chainId}: ${added} added → ${allTokens.length} total`);
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
      try {
        if (token.address.toLowerCase() === NATIVE) {
          const b = await rp.getBalance(user);
          return ethers.utils.formatUnits(b, 18);
        }
        const c = new ethers.Contract(token.address, ERC20_ABI, rp);
        const b = await c.balanceOf(user);
        return ethers.utils.formatUnits(b, token.decimals ?? 18);
      } catch (e) {
        console.warn(`[balance] ${token.symbol} read failed on chain ${currentChainId}:`, e.message);
        return "0";
      }
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
  const sellAmountEl = document.getElementById("sellAmount");
  const buyAmountEl = document.getElementById("buyAmount");
  const sellUsdEl = document.getElementById("sellUsd");
  const buyUsdEl = document.getElementById("buyUsd");
  const swapBtn = document.getElementById("swapBtn");

  if (!buyAmountEl) return;

  // Remove any existing gas warning
  const oldWarn = document.getElementById("gasWarning");
  if (oldWarn) oldWarn.remove();

  const sellAmount = sellAmountEl?.value;

  // ---- Empty / invalid input ----
  if (!sellAmount || isNaN(sellAmount) || Number(sellAmount) <= 0) {
    buyAmountEl.value = "";
    if (sellUsdEl) sellUsdEl.textContent = "$0.00";
    if (buyUsdEl) buyUsdEl.textContent = "$0.00";
    ["quoteRate", "quoteImpact", "quoteGas", "quoteMinReceived"].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = "-";
    });
    currentQuote = null;
    return;
  }

  if (!signer || !selectedSellToken?.address || !selectedBuyToken?.address) return;

  const user = await signer.getAddress();
  const sellDecimals = selectedSellToken.decimals ?? 18;
  const buyDecimals = selectedBuyToken.decimals ?? 18;

  let amountWei;
  try {
    amountWei = ethers.utils.parseUnits(sellAmount, sellDecimals).toString();
  } catch (_) {
    return;
  }

  try {
    // ---- 1. Fetch quote from 0x via proxy ----
    const params = new URLSearchParams({
      chainId: currentChainId.toString(),
      sellToken: selectedSellToken.address,
      buyToken: selectedBuyToken.address,
      sellAmount: amountWei,
      taker: user,
      swapFeeRecipient: CONFIG.SWAP_FEE_RECIPIENT,
      swapFeeBps: CONFIG.SWAP_FEE_BPS.toString(),
    });

    const res = await fetch(`/api/0x/quote?${params}`, {
      headers: { "x-api-key": CONFIG.ZEROX_API_KEY },
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Quote failed (${res.status}): ${errText.slice(0, 100)}`);
    }

    const quote = await res.json();
    currentQuote = quote;

    // ---- 2. Show buy amount ----
    const buyFormatted = ethers.utils.formatUnits(quote.buyAmount, buyDecimals);
    buyAmountEl.value = buyFormatted;

    // ---- 3. Fetch live prices ----
    const prices = await fetchPrices(currentChainId, [
      selectedSellToken.address,
      selectedBuyToken.address,
    ]);
    const sp = prices[selectedSellToken.address.toLowerCase()] || 0;
    const bp = prices[selectedBuyToken.address.toLowerCase()] || 0;

    if (sellUsdEl) {
      sellUsdEl.textContent = sp
        ? `$${(parseFloat(sellAmount) * sp).toFixed(2)}`
        : "$0.00";
    }
    if (buyUsdEl) {
      buyUsdEl.textContent = bp
        ? `$${(parseFloat(buyFormatted) * bp).toFixed(2)}`
        : "$0.00";
    }

    // ---- 4. Rate ----
    const rateEl = document.getElementById("quoteRate");
    if (rateEl) {
      const rate = parseFloat(buyFormatted) / parseFloat(sellAmount);
      rateEl.textContent = `1 ${selectedSellToken.symbol} = ${rate.toFixed(6)} ${selectedBuyToken.symbol}`;
    }

    // ---- 5. Price impact ----
    const impEl = document.getElementById("quoteImpact");
    if (impEl) {
      const imp = parseFloat(quote.estimatedPriceImpact || 0);
      impEl.textContent = imp ? `${imp.toFixed(2)}%` : "0.00%";
      impEl.style.color = imp > 3 ? "var(--red)" : imp > 1 ? "#fbbf24" : "var(--green)";
    }

    // ---- 6. Minimum received ----
    const minEl = document.getElementById("quoteMinReceived");
    if (minEl) {
      minEl.textContent = quote.minBuyAmount
        ? `${parseFloat(ethers.utils.formatUnits(quote.minBuyAmount, buyDecimals)).toFixed(6)} ${selectedBuyToken.symbol}`
        : "-";
    }

    // ---- 7. Network fee + gas pre-flight check ----
    const gasEl = document.getElementById("quoteGas");
    const nativeSymbol = CHAINS[currentChainId]?.native?.symbol || "ETH";
    let gasNative = 0;
    let gasUsd = 0;
    let estGasCost = ethers.BigNumber.from(0);
    let gasPrice = null;

    try {
      const feeData = await getReadProvider().getFeeData();
      if (feeData.gasPrice) {
        const min = currentChainId === 1
          ? ethers.utils.parseUnits("1.5", "gwei")
          : ethers.utils.parseUnits("0.1", "gwei");
        gasPrice = feeData.gasPrice.mul(120).div(100);
        if (gasPrice.lt(min)) gasPrice = min;
      } else {
        gasPrice = feeData.maxFeePerGas || ethers.utils.parseUnits("30", "gwei");
      }

      const gasLimit = quote.transaction?.gas
        ? ethers.BigNumber.from(quote.transaction.gas)
        : ethers.BigNumber.from(300000);

      estGasCost = gasPrice.mul(gasLimit);
      gasNative = parseFloat(ethers.utils.formatEther(estGasCost));
      const nativePrice = prices[WRAPPED_NATIVE.toLowerCase()] || 0;
      gasUsd = gasNative * nativePrice;

      if (gasEl) {
        gasEl.textContent = nativePrice
          ? `${gasNative.toFixed(6)} ${nativeSymbol} ($${gasUsd.toFixed(2)})`
          : `${gasNative.toFixed(6)} ${nativeSymbol}`;
      }
    } catch (e) {
      if (gasEl) gasEl.textContent = "-";
    }

    // ---- 8. Insufficient gas warning ----
    if (signer && estGasCost.gt(0)) {
      try {
        const nativeBal = await getReadProvider().getBalance(user);
        const isNativeSell = selectedSellToken.address.toLowerCase() === WRAPPED_NATIVE.toLowerCase();

        let required = estGasCost;
        if (isNativeSell) {
          const sellWei = ethers.utils.parseUnits(sellAmount, sellDecimals);
          required = sellWei.add(estGasCost);
        }

        if (nativeBal.lt(required)) {
          const shortBy = required.sub(nativeBal);
          const shortEth = ethers.utils.formatEther(shortBy);
          const nativePrice = prices[WRAPPED_NATIVE.toLowerCase()] || 0;
          const shortUsd = nativePrice ? (parseFloat(shortEth) * nativePrice).toFixed(2) : "?";

          const warn = document.createElement("div");
          warn.id = "gasWarning";
          warn.className = "rc-status error";
          warn.style.marginTop = "12px";
          warn.style.textAlign = "left";
          warn.innerHTML = `
            <strong>Insufficient ${nativeSymbol} for gas</strong><br>
            Your balance: ${ethers.utils.formatEther(nativeBal)} ${nativeSymbol}<br>
            Required: ${ethers.utils.formatEther(required)} ${nativeSymbol}<br>
            Short by: ${shortEth} ${nativeSymbol}${nativePrice ? ` (~$${shortUsd})` : ""}
          `;

          if (swapBtn && swapBtn.parentNode) {
            swapBtn.parentNode.insertBefore(warn, swapBtn);
          }
        }
      } catch (_) {}
    }

  } catch (e) {
    console.warn("[quote] failed:", e.message);
    buyAmountEl.value = "";
    currentQuote = null;

    // Show quote error briefly
    const errEl = document.getElementById("quoteError");
    if (errEl) errEl.remove();

    const errBox = document.createElement("div");
    errBox.id = "quoteError";
    errBox.className = "rc-status error";
    errBox.style.marginTop = "12px";
    errBox.textContent = "No quote available: " + (e.message || "unknown");
    if (swapBtn && swapBtn.parentNode) {
      swapBtn.parentNode.insertBefore(errBox, swapBtn);
    }
  }
}

async function executeSwap() {
  if (!signer) { openWalletModal(); return; }
  if (!currentQuote) { alert("No quote yet."); return; }
  const q = currentQuote;

  try {
    const user = await signer.getAddress();
    const isNative = selectedSellToken.address.toLowerCase() === WRAPPED_NATIVE.toLowerCase();
    const nativeSymbol = CHAINS[currentChainId]?.native?.symbol || "ETH";

    // ---- PRE-FLIGHT: check native balance vs estimated gas ----
    const nativeBal = await getReadProvider().getBalance(user);
    const feeData = await getReadProvider().getFeeData();
    let gasPrice;
    if (feeData.gasPrice) {
      const min = currentChainId === 1 ? ethers.utils.parseUnits("1.5", "gwei") : ethers.utils.parseUnits("0.1", "gwei");
      gasPrice = feeData.gasPrice.mul(120).div(100);
      if (gasPrice.lt(min)) gasPrice = min;
    } else {
      gasPrice = feeData.maxFeePerGas || ethers.utils.parseUnits("30", "gwei");
    }

    const gasLimit = q.transaction.gas ? ethers.BigNumber.from(q.transaction.gas) : ethers.BigNumber.from(300000);
    const estGasCost = gasPrice.mul(gasLimit);

    // If selling native, need balance >= (sell amount + gas)
    let required = estGasCost;
    if (isNative) {
      const sellWei = ethers.utils.parseUnits(
        document.getElementById("sellAmount").value,
        selectedSellToken.decimals ?? 18
      );
      required = sellWei.add(estGasCost);
    }

    if (nativeBal.lt(required)) {
      const shortBy = required.sub(nativeBal);
      const shortEth = ethers.utils.formatEther(shortBy);
      const shortUsd = (parseFloat(shortEth) * 2580).toFixed(2);
      alert(
        `Not enough ${nativeSymbol} for gas.\n\n` +
        `Your balance: ${ethers.utils.formatEther(nativeBal)} ${nativeSymbol}\n` +
        `Required: ${ethers.utils.formatEther(required)} ${nativeSymbol}\n` +
        `Short by: ${shortEth} ${nativeSymbol} (~$${shortUsd})\n\n` +
        `Add more ${nativeSymbol} to your wallet to continue.`
      );
      return;
    }

    // ---- Approval if needed ----
    if (!isNative && q.issues?.allowance) {
      const c = new ethers.Contract(selectedSellToken.address, ERC20_ABI, signer);
      const t = await c.approve(q.allowanceTarget, ethers.constants.MaxUint256);
      await t.wait();
    }

    // ---- Send the swap ----
    const txRequest = {
      to: q.transaction.to,
      data: q.transaction.data,
      value: q.transaction.value || "0x0",
      gasLimit: gasLimit,
    };
    if (feeData.gasPrice) txRequest.gasPrice = gasPrice;
    if (feeData.maxFeePerGas) txRequest.maxFeePerGas = feeData.maxFeePerGas.mul(120).div(100);
    if (feeData.maxPriorityFeePerGas) txRequest.maxPriorityFeePerGas = feeData.maxPriorityFeePerGas.mul(120).div(100);

    const tx = await signer.sendTransaction(txRequest);
    console.log("[swap] sent:", tx.hash);
    await tx.wait();
    alert("✅ Swap complete!");
    fetchBalances();
    refreshQuote();
  } catch (err) {
    console.error("[swap] failed:", err);
    if (err.code === 4001) return;
    alert("Swap failed: " + (err.reason || err.message || "unknown"));
  }
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

  runCounters();
  
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

    currentChainId = nc;
    readProvider = null;
    priceCache = {};
    priceCacheTime = 0;
    currentQuote = null;  

    // Use the ACTUAL connected wallet provider (not window.ethereum)
    const wp = activeProvider || window.ethereum;

    if (signer && wp) {
      try {
        await wp.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: "0x" + nc.toString(16) }],
        });
      } catch (err) {
        if (err.code === 4902) {
          const chainParams = {
            137:   { chainId: "0x89",   chainName: "Polygon",      nativeCurrency: { name: "MATIC", symbol: "MATIC", decimals: 18 }, rpcUrls: ["https://polygon-rpc.com"],          blockExplorerUrls: ["https://polygonscan.com"] },
            8453:  { chainId: "0x2105", chainName: "Base",         nativeCurrency: { name: "ETH",   symbol: "ETH",   decimals: 18 }, rpcUrls: ["https://mainnet.base.org"],        blockExplorerUrls: ["https://basescan.org"] },
            42161: { chainId: "0xa4b1", chainName: "Arbitrum One", nativeCurrency: { name: "ETH",   symbol: "ETH",   decimals: 18 }, rpcUrls: ["https://arb1.arbitrum.io/rpc"],   blockExplorerUrls: ["https://arbiscan.io"] },
            10:    { chainId: "0xa",    chainName: "OP Mainnet",   nativeCurrency: { name: "ETH",   symbol: "ETH",   decimals: 18 }, rpcUrls: ["https://mainnet.optimism.io"],    blockExplorerUrls: ["https://optimistic.etherscan.io"] },
            56:    { chainId: "0x38",   chainName: "BNB Chain",    nativeCurrency: { name: "BNB",   symbol: "BNB",   decimals: 18 }, rpcUrls: ["https://bsc-dataseed.binance.org"], blockExplorerUrls: ["https://bscscan.com"] },
          };
          if (chainParams[nc]) {
            try {
              await wp.request({
                method: "wallet_addEthereumChain",
                params: [chainParams[nc]],
              });
            } catch (addErr) {
              console.warn("[chain] add network failed:", addErr.message);
            }
          }
        } else if (err.code !== 4001) {
          console.warn("[chain] switch failed:", err.message);
        }
      }

      // ---- Rebuild provider + signer for the new chain ----
      // MetaMask changes network, but our ethers provider is still bound to the old one.
      // Recreate it so signer.sendTransaction() uses the correct chain.
      try {
        provider = new ethers.providers.Web3Provider(wp);
        signer = provider.getSigner();
        await provider.getNetwork(); // force detection
        console.log("[chain] provider rebuilt for chain", nc);
      } catch (rebuildErr) {
        console.warn("[chain] provider rebuild failed:", rebuildErr.message);
      }
    }

    // Always reload tokens for the new chain, regardless of wallet state
    allTokens = [];
    await loadTokenList(nc);
    console.log(`[chain] switched to ${nc}, tokens loaded: ${allTokens.length}`);
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
  updateWalletUI();
  updateNavActive(window.location.pathname);

  // Run counters immediately on first load
  runCounters();

  // Load real stats from backend
  loadRealStats();

  if (document.getElementById("sellTokenBtn")) {
    await loadTokenList(currentChainId);
  }

  startReconnectLoop();
}

// ---- Counter animation (runs on load AND after SPA nav) ----
function runCounters() {
  document.querySelectorAll("[data-count]").forEach(el => {
    const target = +el.dataset.count || 0;
    const prefix = el.dataset.prefix !== undefined ? el.dataset.prefix : "$";
    const finalText = prefix + target.toLocaleString();

    // If target is 0, just set it
    if (target === 0) {
      el.textContent = finalText;
      return;
    }

    // Guaranteed fallback — always snap to final value after 1.5s
    setTimeout(() => { el.textContent = finalText; }, 1500);

    // Animate
    const start = performance.now();
    const duration = 900;
    const step = (now) => {
      const p = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = prefix + Math.floor(target * eased).toLocaleString();
      if (p < 1) requestAnimationFrame(step);
      else el.textContent = finalText;
    };
    requestAnimationFrame(step);
  });
}

// ---- Fetch real stats from backend ----
async function loadRealStats() {
  try {
    const res = await fetch("/api/health");
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    console.log("[stats] backend:", data);

    if (data.addresses && data.addresses > 0) {
      // Find the "Wallets indexed" element (2nd ledger-value)
      const els = document.querySelectorAll(".ledger-value");
      if (els[1]) {
        els[1].dataset.count = data.addresses;
        els[1].dataset.prefix = "";
        // Re-run counters with new value
        els[1].textContent = "0";
        runCounters();
      }
    }
  } catch (e) {
    console.warn("[stats] backend fetch failed:", e.message);
  }
}