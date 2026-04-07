const express = require("express");
const cors = require("cors");
const WebSocket = require("ws");
const http = require("http");

const { fetchNifty, fetchBankNifty } = require("./services/yahooService");
const { fetchMetals } = require("./services/metalsService");
const { startCryptoWS, fetchInitialCrypto } = require("./services/cryptoService");
const { startPriceSimulator } = require("./services/simulatorService");

const store = require("./cache/store");

const app = express();
app.use(cors({ origin: "*" }));

app.get("/api/status", (req, res) => {
  res.json({ nifty: store.nifty, banknifty: store.banknifty, crypto: store.crypto, metals: store.metals });
});

const PORT = 5000;
const server = http.createServer(app);
const wss = new WebSocket.Server({ server, verifyClient: () => true });

server.listen(PORT, () => {
  console.log(`🚀 Server on http://localhost:${PORT}`);
  console.log(`🔍 Debug: http://localhost:${PORT}/api/status`);
});

wss.on("connection", (ws, req) => {
  console.log(`✅ Client connected from: ${req.headers.origin || "unknown"}`);
  ws.send(JSON.stringify({
    nifty: store.nifty, banknifty: store.banknifty,
    crypto: store.crypto, metals: store.metals, ts: Date.now()
  }));
  ws.on("close", () => console.log("🔌 Client disconnected"));
  ws.on("error", (err) => console.error("WS client error:", err.message));
});

// ✅ FIXED: Broadcast every 100ms for real-time feel
let broadcastCount = 0;
setInterval(() => {
  if (wss.clients.size === 0) return;
  const payload = JSON.stringify({
    nifty: store.nifty, banknifty: store.banknifty,
    crypto: store.crypto, metals: store.metals, ts: Date.now()
  });
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) client.send(payload);
  });
  broadcastCount++;
  if (broadcastCount % 50 === 0) { // log every 5s
    console.log(`📡 Broadcasting | BTC: ${store.crypto?.BTCUSDT?.price} | Nifty: ${store.nifty?.price} | clients: ${wss.clients.size}`);
  }
}, 100); // ✅ 100ms = 0.1 seconds

(async () => {
  console.log("⏳ Loading initial data...");

  await fetchInitialCrypto();
  startCryptoWS();
  startPriceSimulator();

  await fetchNifty();
  await fetchBankNifty();
  await fetchMetals();

  console.log("✅ All data loaded:");
  console.log("   Nifty:", store.nifty);
  console.log("   BankNifty:", store.banknifty);
  console.log("   Metals:", store.metals);
  console.log("   BTC:", store.crypto?.BTCUSDT?.price);

  // ✅ FIXED: Poll Nifty/BankNifty every 15s during market hours for faster updates
  // Yahoo Finance updates every ~15s when market is open
  const pollIndices = async () => {
    await fetchNifty();
    await fetchBankNifty();
  };

  setInterval(pollIndices, 500);   // ✅ was 60s, now 15s
  setInterval(fetchMetals, 300000);  // Metals every 5min (API rate limit)
})();