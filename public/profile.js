// ============================================================
// BLUSHDROPS — PROFILE PAGE
// ============================================================
const PROFILE_CONFIG = {
  ZEROX_API_KEY: "8fc750e2-ebc9-4211-b32e-a035fcab239c", // ← paste your 0x key
};

let profileUser = null;

window.addEventListener("walletConnected", (e) => {
  profileUser = e.detail.address;
  loadOrderHistory();
});

// Also handle case where wallet was already connected before profile.js loaded
if (typeof currentUser !== "undefined" && currentUser) {
  profileUser = currentUser;
  loadOrderHistory();
}

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

  // Timeout protection
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    const params = new URLSearchParams({
      taker: profileUser,
      chainId: "1",
      limit: "50",
    });

    const res = await fetch(`/api/0x/trades?${params}`, {
      headers: { "x-api-key": PROFILE_CONFIG.ZEROX_API_KEY },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (res.status === 401 || res.status === 403) {
      listEl.innerHTML = `<div class="rc-empty"><span class="rc-emoji">🔑</span><h3 class="rc-title">API key needed</h3><p class="rc-sub">Add your 0x API key to see trade history.</p></div>`;
      return;
    }

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`HTTP ${res.status}`);
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
    clearTimeout(timeoutId);
    const isTimeout = e.name === "AbortError";
    listEl.innerHTML = `<div class="rc-empty"><span class="rc-emoji">${isTimeout ? "⏱️" : "⚠️"}</span><h3 class="rc-title">${isTimeout ? "Request timed out" : "Couldn't load history"}</h3><p class="rc-sub">${isTimeout ? "The 0x API took too long to respond. Try again later." : e.message}</p></div>`;
  }
}
const searchInput = document.getElementById("orderSearchInput");
if (searchInput) {
  searchInput.addEventListener("input", (e) => loadOrderHistory(e.target.value));
}