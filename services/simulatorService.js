const store = require("../cache/store");

const drift = (value, pct = 0.06) => {
  const delta = value * (pct / 100);
  return parseFloat((value + (Math.random() * 2 - 1) * delta).toFixed(4));
};

// ✅ FIXED: Track per-symbol staleness so ALL symbols get simulated
// Previously only checked BTCUSDT — if BTC was live but XRP was stale, XRP never got simulated
const lastPrices = {};
const staleCounts = {};

const SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT"];

const startPriceSimulator = () => {
  setInterval(() => {
    SYMBOLS.forEach(sym => {
      const current = store.crypto?.[sym]?.price;
      if (!current) return;

      if (current === lastPrices[sym]) {
        staleCounts[sym] = (staleCounts[sym] || 0) + 1;
      } else {
        staleCounts[sym] = 0;
      }
      lastPrices[sym] = current;

      // After 3 stale checks (9s), simulate this symbol
      if (staleCounts[sym] >= 3) {
        const cur = store.crypto[sym];
        store.crypto[sym] = {
          price: drift(cur.price),
          change: parseFloat((cur.change + (Math.random() * 0.04 - 0.02)).toFixed(2))
        };
        if (staleCounts[sym] === 3) {
          console.log(`⚡ ${sym} stale — simulating`);
        }
      }
    });
  }, 3000);
};

module.exports = { startPriceSimulator };