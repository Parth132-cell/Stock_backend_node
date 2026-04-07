/**
 * cryptoService.js — Render.com compatible (v3)
 *
 * WHY PREVIOUS VERSIONS FAILED:
 *   - Binance WS  → HTTP 451 (datacenter IP geo-block)
 *   - CoinGecko   → HTTP 429 / blocked (rate-limits datacenter IPs on free tier)
 *
 * SOLUTION — waterfall through 3 datacenter-friendly APIs:
 *   1. Kraken REST    — no auth, no geo-block, datacenter-friendly ✅
 *   2. Coinbase REST  — no auth, public, works from any IP ✅
 *   3. Binance US     — separate domain (api.binance.us), less restricted ✅
 *
 * simulatorService.js handles stale data if all 3 fail transiently.
 */

const axios = require("axios");
const store = require("../cache/store");

// ─── Symbol maps ──────────────────────────────────────────────────────────────

// Kraken uses XBT for Bitcoin, and its own pair naming
const KRAKEN_PAIRS = {
  BTCUSDT: "XBTUSD",
  ETHUSDT: "ETHUSD",
  SOLUSDT: "SOLUSD",
  BNBUSDT: "BNBUSD",   // may not exist on Kraken — fallback handles it
  XRPUSDT: "XRPUSD",
};

// Coinbase uses standard symbols
const COINBASE_SYMBOLS = {
  BTCUSDT: "BTC",
  ETHUSDT: "ETH",
  SOLUSDT: "SOL",
  BNBUSDT: "BNB",
  XRPUSDT: "XRP",
};

const ALL_SYMBOLS = Object.keys(KRAKEN_PAIRS);

// ─── Source 1: Kraken ─────────────────────────────────────────────────────────
const fetchFromKraken = async () => {
  const pairs = Object.values(KRAKEN_PAIRS).join(",");
  const res = await axios.get(
    `https://api.kraken.com/0/public/Ticker?pair=${pairs}`,
    { timeout: 8000 }
  );

  if (res.data.error && res.data.error.length > 0) {
    throw new Error(`Kraken error: ${res.data.error.join(", ")}`);
  }

  const result = res.data.result;
  let updated = 0;

  for (const [sym, krakenPair] of Object.entries(KRAKEN_PAIRS)) {
    // Kraken may return the pair under a slightly different key (e.g. XXBTZUSD)
    // So search all result keys for one that contains our pair substring
    const matchKey = Object.keys(result).find(
      (k) => k.includes(krakenPair) || k.includes(krakenPair.replace("USD", "ZUSD"))
    );
    if (!matchKey) continue;

    const ticker = result[matchKey];
    const price = parseFloat(ticker.c[0]);   // c = last trade closed [price, volume]
    const open  = parseFloat(ticker.o);       // o = today's opening price
    const change = open > 0 ? parseFloat((((price - open) / open) * 100).toFixed(2)) : 0;

    if (price > 0) {
      store.crypto[sym] = {
        price: parseFloat(price.toFixed(2)),
        change,
      };
      updated++;
    }
  }

  console.log(`✅ Kraken updated ${updated}/${ALL_SYMBOLS.length} symbols | BTC: ${store.crypto.BTCUSDT?.price}`);
  return updated;
};

// ─── Source 2: Coinbase ───────────────────────────────────────────────────────
const fetchFromCoinbase = async () => {
  let updated = 0;
  for (const [sym, coin] of Object.entries(COINBASE_SYMBOLS)) {
    // Skip symbols already populated by Kraken
    if (store.crypto[sym]?.price > 0) { updated++; continue; }
    try {
      const [spotRes, statsRes] = await Promise.all([
        axios.get(`https://api.coinbase.com/v2/prices/${coin}-USD/spot`, { timeout: 6000 }),
        axios.get(`https://api.coinbase.com/v2/prices/${coin}-USD/historic?period=day`, { timeout: 6000 }),
      ]);
      const price = parseFloat(spotRes.data?.data?.amount ?? 0);
      // Compute 24h change from historic open if available
      const prices = statsRes.data?.data?.prices;
      const open = prices && prices.length > 0 ? parseFloat(prices[prices.length - 1].price) : 0;
      const change = open > 0 ? parseFloat((((price - open) / open) * 100).toFixed(2)) : 0;

      if (price > 0) {
        store.crypto[sym] = { price: parseFloat(price.toFixed(2)), change };
        updated++;
      }
    } catch (e) {
      // silently skip this symbol — next source will cover it
    }
  }
  console.log(`✅ Coinbase covered ${updated} symbols | BTC: ${store.crypto.BTCUSDT?.price}`);
  return updated;
};

// ─── Source 3: Binance US (fallback) ─────────────────────────────────────────
// api.binance.us is the US-regulated endpoint — less geo-restricted than .com
const fetchFromBinanceUS = async () => {
  let updated = 0;
  for (const sym of ALL_SYMBOLS) {
    if (store.crypto[sym]?.price > 0) { updated++; continue; }
    try {
      const res = await axios.get(
        `https://api.binance.us/api/v3/ticker/24hr?symbol=${sym}`,
        { timeout: 6000 }
      );
      const price = parseFloat(parseFloat(res.data.lastPrice).toFixed(2));
      const change = parseFloat(parseFloat(res.data.priceChangePercent).toFixed(2));
      if (price > 0) {
        store.crypto[sym] = { price, change };
        updated++;
      }
    } catch (e) {
      // silently skip
    }
  }
  console.log(`✅ Binance US covered ${updated} symbols | BTC: ${store.crypto.BTCUSDT?.price}`);
  return updated;
};

// ─── Waterfall: try all 3 sources, stop when all symbols populated ────────────
const fetchAllCrypto = async (label = "poll") => {
  const allPopulated = () =>
    ALL_SYMBOLS.every((s) => store.crypto[s]?.price > 0);

  // Source 1: Kraken
  try {
    await fetchFromKraken();
  } catch (e) {
    console.warn(`⚠️  [${label}] Kraken failed: ${e.message}`);
  }
  if (allPopulated()) return;

  // Source 2: Coinbase (fills gaps Kraken missed, e.g. BNB)
  try {
    await fetchFromCoinbase();
  } catch (e) {
    console.warn(`⚠️  [${label}] Coinbase failed: ${e.message}`);
  }
  if (allPopulated()) return;

  // Source 3: Binance US (last resort)
  try {
    await fetchFromBinanceUS();
  } catch (e) {
    console.warn(`⚠️  [${label}] Binance US failed: ${e.message}`);
  }

  if (!allPopulated()) {
    const missing = ALL_SYMBOLS.filter((s) => !(store.crypto[s]?.price > 0));
    console.error(`❌ [${label}] Still missing: ${missing.join(", ")} — simulator will cover`);
  }
};

// ─── Initial load ─────────────────────────────────────────────────────────────
const fetchInitialCrypto = async () => {
  console.log("⏳ Loading initial crypto prices...");
  await fetchAllCrypto("init");

  // Seed zeros only as absolute last resort so Flutter never gets null
  for (const sym of ALL_SYMBOLS) {
    if (!store.crypto[sym]) {
      store.crypto[sym] = { price: 0, change: 0 };
    }
  }

  const btc = store.crypto.BTCUSDT?.price;
  if (btc > 0) {
    console.log(`✅ Initial crypto loaded | BTC: ${btc}`);
  } else {
    console.error("❌ Initial crypto failed — all sources blocked. Simulator will animate prices.");
  }
};

// ─── Polling loop (replaces Binance WebSocket) ───────────────────────────────
// Export name kept as startCryptoWS so server.js needs zero changes.
const startCryptoWS = () => {
  console.log("🔄 Starting crypto polling (Kraken → Coinbase → Binance US)");
  // Poll every 15s — safe for all three free-tier APIs
  setInterval(() => fetchAllCrypto("poll"), 15_000);
};

module.exports = { startCryptoWS, fetchInitialCrypto };