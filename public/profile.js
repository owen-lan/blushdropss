// ============================================================
// BLUSHDROPS — PROFILE PAGE
// ============================================================

const PROFILE_CONFIG = {
  ZEROX_API_KEY: "8fc750e2-ebc9-4211-b32e-a035fcab239c", // ← paste your 0x key here
};

let profileUser = null;

window.addEventListener("walletConnected", (e) => {
  profileUser = e.detail.address;
  loadOrderHistory();
});

async function loadOrderHistory(searchQuery = "") {
  const listEl = document.getElementById("orderHistoryList");
  const summaryEl = document.getElementById("portfolioSummary");
  if (!listEl) return;

  if (!profileUser) {
    listEl.innerHTML = `<div class="rc-empty"><span class="rc-emoji">🔌</span><h3 class="rc-title">Connect your wallet</h3><p class="rc-sub">Connect a wallet to see your order history.</p></div>`;
    if (summaryEl) summaryEl.innerHTML = "";
    return;
  }

  listEl.innerHTML = `<div class="rc-empty"><div class="spinner"></div><p class="rc-sub">Loading order history…</p></div>`;

  try {
    const params = new URLSearchParams({
      taker: profileUser,
      chainId: "1",
      limit: "50",
    });

    const res = await fetch(`/api/0x/trades?${params}`, {
      headers: { "x-api-key": PROFILE_CONFIG.ZEROX_API_KEY },
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`HTTP ${res.status} — ${errText.slice(0, 120)}`);
    }

    const data = await res.json();
    let trades = data.trades || data.records || [];

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      trades = trades.filter(t =>
        (t.sellToken?.symbol || t.takerToken?.symbol || "").toLowerCase().includes(q) ||
        (t.buyToken?.symbol || t.makerToken?.symbol || "").toLowerCase().includes(q)
      );
    }

    if (trades.length === 0) {
      listEl.innerHTML = `<div class="rc-empty"><span class="rc-emoji">📭</span><h3 class="rc-title">No trades yet</h3><p class="rc-sub">Your swap history will appear here after your first trade.</p></div>`;
      if (summaryEl) summaryEl.innerHTML = "";
      return;
    }

    const total = trades.length;
    const lastTrade = trades[0]?.blockTimestamp || trades[0]?.timestamp;
    if (summaryEl) {
      summaryEl.innerHTML = `
        <div class="summary-card"><div class="label">Total trades</div><div class="value">${total}</div></div>
        <div class="summary-card"><div class="label">Chain</div><div class="value">Ethereum</div></div>
        <div class="summary-card"><div class="label">Last trade</div><div class="value">${lastTrade ? new Date(lastTrade * 1000).toLocaleDateString() : "—"}</div></div>
      `;
    }

    listEl.innerHTML = trades.map(t => {
      const sellSym = t.sellToken?.symbol || t.takerToken?.symbol || "?";
      const buySym = t.buyToken?.symbol || t.makerToken?.symbol || "?";
      const sellAmt = parseFloat(t.sellAmount || t.takerAmount || "0").toFixed(4);
      const buyAmt = parseFloat(t.buyAmount || t.makerAmount || "0").toFixed(4);
      const ts = t.blockTimestamp || t.timestamp;
      const date = ts ? new Date(ts * 1000).toLocaleDateString() : "—";
      const txHash = t.transactionHash || t.txHash || "";
      return `
        <div class="order-row">
          <div class="order-token">
            <div>
              <div class="symbol">${sellSym} → ${buySym}</div>
              <div class="name">${date}</div>
            </div>
          </div>
          <div class="order-value">${sellAmt} ${sellSym}</div>
          <div class="order-value">${buyAmt} ${buySym}</div>
          <div class="order-pnl">filled</div>
          <div class="order-value">${txHash ? `<a href="https://etherscan.io/tx/${txHash}" target="_blank" rel="noopener">↗</a>` : "—"}</div>
        </div>
      `;
    }).join("");

  } catch (e) {
    console.error(e);
    listEl.innerHTML = `<div class="rc-empty"><span class="rc-emoji">⚠️</span><h3 class="rc-title">Couldn't load history</h3><p class="rc-sub">${e.message}</p></div>`;
  }
}

const searchInput = document.getElementById("orderSearchInput");
if (searchInput) {
  searchInput.addEventListener("input", (e) => loadOrderHistory(e.target.value));
}

// Initial state
if (typeof currentUser !== "undefined" && currentUser) {
  profileUser = currentUser;
  loadOrderHistory();
} else {
  loadOrderHistory();
}