const WebSocket = require("ws");
const axios = require("axios");
const store = require("../cache/store");

const symbols = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT"];

const fetchInitialCrypto = async () => {
  try {
    for (let s of symbols) {
      const res = await axios.get(
        `https://api.binance.com/api/v3/ticker/24hr?symbol=${s}`
      );
      store.crypto[s] = {
        price: parseFloat(parseFloat(res.data.lastPrice).toFixed(2)),
        change: parseFloat(parseFloat(res.data.priceChangePercent).toFixed(2))
      };
    }
    console.log("✅ Initial crypto loaded:", Object.keys(store.crypto));
  } catch (e) {
    console.error("❌ Initial crypto error:", e.message);
  }
};

const startCryptoWS = () => {
  const ws = new WebSocket("wss://stream.binance.com:9443/ws/!ticker@arr");

  ws.on("open", () => {
    console.log("✅ Binance WebSocket connected");
  });

  ws.on("message", (data) => {
    try {
      const tickers = JSON.parse(data);

      tickers.forEach((t) => {
        if (symbols.includes(t.s)) {
          // ✅ FIXED: Removed oldPrice !== newPrice check — float comparison
          // was silently blocking all updates. Always write to store;
          // the server.js JSON.stringify diff-check handles dedup for broadcast.
          store.crypto[t.s] = {
            price: parseFloat(parseFloat(t.c).toFixed(2)),
            change: parseFloat(parseFloat(t.P).toFixed(2))
          };
        }
      });
    } catch (e) {
      console.error("❌ Crypto WS parse error:", e.message);
    }
  });

  ws.on("error", (err) => {
    console.error("❌ Binance WS Error:", err.message);
  });

  ws.on("close", () => {
    console.warn("⚠️  Binance WS closed — reconnecting in 3s...");
    setTimeout(startCryptoWS, 3000);
  });
};

module.exports = { startCryptoWS, fetchInitialCrypto };