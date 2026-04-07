

const axios = require("axios");
const store = require("../cache/store");

// Binance symbol → CoinGecko id mapping
const COINGECKO_IDS = {
  BTCUSDT: "bitcoin",
  ETHUSDT: "ethereum",
  SOLUSDT: "solana",
  BNBUSDT: "binancecoin",
  XRPUSDT: "ripple",
};

const symbols = Object.keys(COINGECKO_IDS);

// ─── CoinGecko fetch (primary) ────────────────────────────────────────────────
const fetchFromCoinGecko = async () => {
  const ids = Object.values(COINGECKO_IDS).join(",");
  const res = await axios.get(
    `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`,
    { timeout: 8000 }
  );

  const data = res.data;
  let updated = 0;

  for (const [sym, id] of Object.entries(COINGECKO_IDS)) {
    if (data[id]) {
      store.crypto[sym] = {
        price: parseFloat(data[id].usd.toFixed(2)),
        change: parseFloat((data[id].usd_24h_change ?? 0).toFixed(2)),
      };
      updated++;
    }
  }

  if (updated > 0) {
    console.log(`✅ CoinGecko updated ${updated} symbols | BTC: ${store.crypto.BTCUSDT?.price}`);
  }
};

// ─── Binance REST fetch (fallback) ───────────────────────────────────────────
const fetchFromBinanceREST = async () => {
  for (const sym of symbols) {
    try {
      const res = await axios.get(
        `https://api.binance.com/api/v3/ticker/24hr?symbol=${sym}`,
        { timeout: 6000 }
      );
      store.crypto[sym] = {
        price: parseFloat(parseFloat(res.data.lastPrice).toFixed(2)),
        change: parseFloat(parseFloat(res.data.priceChangePercent).toFixed(2)),
      };
    } catch (e) {
      // silently skip — simulatorService will cover stale symbols
    }
  }
  console.log(`✅ Binance REST fallback | BTC: ${store.crypto.BTCUSDT?.price}`);
};

// ─── Initial load ─────────────────────────────────────────────────────────────
const fetchInitialCrypto = async () => {
  console.log("⏳ Loading initial crypto prices...");

  // Try CoinGecko first
  try {
    await fetchFromCoinGecko();
    if (store.crypto.BTCUSDT?.price) {
      console.log("✅ Initial crypto loaded via CoinGecko");
      return;
    }
  } catch (e) {
    console.warn("⚠️  CoinGecko initial load failed:", e.message);
  }

  // Fallback to Binance REST
  try {
    await fetchFromBinanceREST();
    if (store.crypto.BTCUSDT?.price) {
      console.log("✅ Initial crypto loaded via Binance REST");
      return;
    }
  } catch (e) {
    console.warn("⚠️  Binance REST initial load failed:", e.message);
  }

  // Last resort: seed with zeros so Flutter doesn't get null
  for (const sym of symbols) {
    if (!store.crypto[sym]) {
      store.crypto[sym] = { price: 0, change: 0 };
    }
  }
  console.error("❌ All crypto sources failed — seeded with zeros");
};

// ─── Polling loop (replaces WebSocket) ───────────────────────────────────────
// NOTE: startCryptoWS is kept as the export name so server.js needs NO changes
let _coinGeckoFailCount = 0;

const startCryptoWS = () => {
  console.log("🔄 Starting crypto polling (CoinGecko primary, Binance REST fallback)");

  const poll = async () => {
    try {
      await fetchFromCoinGecko();
      _coinGeckoFailCount = 0; // reset on success
    } catch (e) {
      _coinGeckoFailCount++;
      console.warn(`⚠️  CoinGecko poll failed (${_coinGeckoFailCount}x): ${e.message}`);

      // After 3 consecutive CoinGecko failures, try Binance REST
      if (_coinGeckoFailCount >= 3) {
        try {
          await fetchFromBinanceREST();
          // Don't reset failCount — keep trying CoinGecko next time
        } catch (e2) {
          console.error("❌ Binance REST fallback also failed:", e2.message);
          // simulatorService.js will keep prices moving — no action needed
        }
      }
    }
  };

  // Poll every 10 seconds
  // CoinGecko free tier: ~30 req/min. 1 req/10s = 6 req/min — well within limit.
  setInterval(poll, 10_000);
};

module.exports = { startCryptoWS, fetchInitialCrypto };