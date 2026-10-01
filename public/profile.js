// ============================================================
// BLUSHDROPS — PROFILE PAGE
// ============================================================

const CONFIG = {
  ZEROX_API_KEY: "8fc750e2-ebc9-4211-b32e-a035fcab239c",
  ZEROX_API_URL: "https://api.0x.org",
};

let provider, signer, currentUser;

// Wallet connection (reuse from app.js)
async function connectWallet() {
  if (!window.ethereum) { alert("Install MetaMask to continue."); return; }
  provider = new ethers.providers.Web3Provider(window.ethereum);
  await provider.send("eth_requestAccounts", []);
  signer = provider.getSigner();
  currentUser = await signer.getAddress();
  document.getElementById("connectText").textContent = currentUser.slice(0, 6) + "…" + currentUser.slice(-4);
  document.getElementById("connectBtn").classList.add("connected");
  loadOrderHistory();
}

document.getElementById("connectBtn").addEventListener("click", () => {
  if (currentUser) { navigator.clipboard?.writeText(currentUser); return; }
  connectWallet();
});

async function loadOrderHistory(searchQuery = "") {
  const listEl = document.getElementById("orderHistoryList");
  if (!listEl) return;

  listEl.innerHTML = `<div class="rc-empty"><div class="spinner"></div><p class="rc-sub">Loading order history...</p></div>`;

  if (!currentUser) {
    listEl.innerHTML = `<div class="rc-empty"><span class="rc-emoji">🔌</span><h3 class="rc-title">Connect your wallet</h3><p class="rc-sub">Connect your wallet to see your order history.</p></div>`;
    return;
  }

  try {
    const params = new URLSearchParams({
      taker: currentUser,
      chainId: "1",
      limit: "50",
    });

    const res = await fetch(
      `https://api.0x.org/trade-analytics/swap?${params}`,
      {
        headers: {
          "0x-api-key": CONFIG.ZEROX_API_KEY,
          "0x-version": "v2",
        },
      }
    );

    if (!res.ok) throw new Error("HTTP " + res.status + " — " + (await res.text()));
    const data = await res.json();
    let trades = data.trades || [];

    // Filter by search query
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      trades = trades.filter(t =>
        (t.sellToken?.symbol || "").toLowerCase().includes(q) ||
        (t.buyToken?.symbol || "").toLowerCase().includes(q)
      );
    }

    if (trades.length === 0) {
      listEl.innerHTML = `<div class="rc-empty"><span class="rc-emoji">📭</span><h3 class="rc-title">No trades yet</h3><p class="rc-sub">Your swap history will appear here once you make a trade.</p></div>`;
      return;
    }

    // Summary cards
    const totalTrades = trades.length;
    const totalVolume = trades.reduce((sum, t) => sum + parseFloat(t.sellAmount || "0"), 0);

    const summaryEl = document.getElementById("portfolioSummary");
    if (summaryEl) {
      summaryEl.innerHTML = `
        <div class="summary-card"><div class="label">Total trades</div><div class="value">${totalTrades}</div></div>
        <div class="summary-card"><div class="label">Total volume</div><div class="value">${totalVolume.toFixed(4)}</div></div>
        <div class="summary-card"><div class="label">Last trade</div><div class="value">${new Date(trades[0].blockTimestamp * 1000).toLocaleDateString()}</div></div>
      `;
    }

    // Table
    listEl.innerHTML = trades.map(t => {
      const sellSymbol = t.sellToken?.symbol || "?";
      const buySymbol = t.buyToken?.symbol || "?";
      const sellAmount = parseFloat(t.sellAmount || "0").toFixed(4);
      const buyAmount = parseFloat(t.buyAmount || "0").toFixed(4);
      const date = t.blockTimestamp ? new Date(t.blockTimestamp * 1000).toLocaleDateString() : "—";
      const txHash = t.transactionHash || t.txHash || "";
      return `
        <div class="order-row">
          <div class="order-token">
            <div>
              <div class="symbol">${sellSymbol} → ${buySymbol}</div>
              <div class="name">${date}</div>
            </div>
          </div>
          <div class="order-value">${sellAmount} ${sellSymbol}</div>
          <div class="order-value">${buyAmount} ${buySymbol}</div>
          <div class="order-pnl">filled</div>
          <div class="order-value">${txHash ? `<a href="https://etherscan.io/tx/${txHash}" target="_blank" rel="noopener">↗</a>` : "—"}</div>
        </div>
      `;
    }).join("");

  } catch (e) {
    console.error(e);
    listEl.innerHTML = `<div class="rc-empty"><span class="rc-emoji">⚠️</span><h3 class="rc-title">Could not load history</h3><p class="rc-sub">${e.message}</p></div>`;
  }
}
// Search input
document.getElementById("orderSearchInput")?.addEventListener("input", (e) => {
  loadOrderHistory(e.target.value);
});

// ---------- INIT ----------
// Auto-connect if wallet was previously connected
window.addEventListener("load", async () => {
  if (window.ethereum) {
    const accounts = await window.ethereum.request({ method: "eth_accounts" });
    if (accounts.length > 0) {
      provider = new ethers.providers.Web3Provider(window.ethereum);
      signer = provider.getSigner();
      currentUser = accounts[0];
      document.getElementById("connectText").textContent = currentUser.slice(0, 6) + "…" + currentUser.slice(-4);
      document.getElementById("connectBtn").classList.add("connected");
      loadOrderHistory();
    } else {
      loadOrderHistory(); // Show connect prompt
    }
  }
});