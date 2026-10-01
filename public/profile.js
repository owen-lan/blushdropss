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

// ---------- FETCH ORDER HISTORY ----------
async function loadOrderHistory(searchQuery = "") {
  const listEl = document.getElementById("orderHistoryList");
  listEl.innerHTML = `<div class="rc-empty"><div class="spinner"></div><p class="rc-sub">Loading order history...</p></div>`;

  if (!currentUser) {
    listEl.innerHTML = `<div class="rc-empty"><span class="rc-emoji">🔌</span><h3 class="rc-title">Connect your wallet</h3><p class="rc-sub">Connect your wallet to see your order history.</p></div>`;
    return;
  }

  try {
    // 0x Trade Analytics API — getSwapTrades
    const params = new URLSearchParams({
      taker: currentUser,
      limit: "50",
      chainId: "1", // Can be extended to support multiple chains
    });

    const res = await fetch(`${CONFIG.ZEROX_API_URL}/trade-analytics/v1/getSwapTrades?${params}`, {
      headers: { "0x-api-key": CONFIG.ZEROX_API_KEY },
    });

    if (!res.ok) throw new Error("Failed to fetch trades");
    const data = await res.json();
    let trades = data.trades || [];

    // Filter by search query
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      trades = trades.filter(t =>
        (t.takerToken?.symbol || "").toLowerCase().includes(q) ||
        (t.makerToken?.symbol || "").toLowerCase().includes(q)
      );
    }

    if (trades.length === 0) {
      listEl.innerHTML = `<div class="rc-empty"><span class="rc-emoji">📭</span><h3 class="rc-title">No trades yet</h3><p class="rc-sub">Your swap history will appear here once you make a trade.</p></div>`;
      return;
    }

    // Render summary
    const totalTrades = trades.length;
    const totalVolume = trades.reduce((sum, t) => sum + parseFloat(t.takerAmount || "0"), 0);
    const totalFees = trades.reduce((sum, t) => sum + parseFloat(t.fees?.totalFee || "0"), 0);

    document.getElementById("portfolioSummary").innerHTML = `
      <div class="summary-card"><div class="label">Total trades</div><div class="value">${totalTrades}</div></div>
      <div class="summary-card"><div class="label">Total volume</div><div class="value">$${totalVolume.toFixed(2)}</div></div>
      <div class="summary-card"><div class="label">Total fees paid</div><div class="value">$${totalFees.toFixed(2)}</div></div>
    `;

    // Render table
    listEl.innerHTML = trades.map(t => {
      const sellSymbol = t.takerToken?.symbol || "?";
      const buySymbol = t.makerToken?.symbol || "?";
      const sellAmount = parseFloat(t.takerAmount || "0").toFixed(4);
      const buyAmount = parseFloat(t.makerAmount || "0").toFixed(4);
      const status = t.status || "filled";
      return `
        <div class="order-row">
          <div class="order-token">
            <div><div class="symbol">${sellSymbol} → ${buySymbol}</div><div class="name">${new Date(t.timestamp * 1000).toLocaleDateString()}</div></div>
          </div>
          <div class="order-value">${sellAmount} ${sellSymbol}</div>
          <div class="order-value">${buyAmount} ${buySymbol}</div>
          <div class="order-pnl">${status}</div>
          <div class="order-value">${t.txHash ? `<a href="https://etherscan.io/tx/${t.txHash}" target="_blank">↗</a>` : "-"}</div>
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