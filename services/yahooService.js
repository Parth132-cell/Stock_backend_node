const axios = require("axios");
const store = require("../cache/store");

const headers = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
  "Accept": "application/json"
};

const extractData = (meta) => {
  const price =
    meta.regularMarketPrice ??
    meta.currentPrice ??
    meta.previousClose ??
    meta.chartPreviousClose ?? 0;

  // ✅ FIXED: Yahoo returns change% as regularMarketChangePercent
  // Also compute manually from previousClose if field is missing
  let change = meta.regularMarketChangePercent ?? 0;

  // If change is 0 but we have previousClose, compute it manually
  if (change === 0 && meta.chartPreviousClose && price) {
    change = ((price - meta.chartPreviousClose) / meta.chartPreviousClose) * 100;
  }

  return {
    price: parseFloat(Number(price).toFixed(2)),
    change: parseFloat(Number(change).toFixed(2))
  };
};

const fetchYahooSymbol = async (symbol, host = "query1.finance.yahoo.com") => {
  const url = `https://${host}/v8/finance/chart/${encodeURIComponent(symbol)}`;
  const res = await axios.get(url, { headers, timeout: 8000 });
  const result = res.data?.chart?.result?.[0];
  if (!result) throw new Error(`No result for ${symbol}`);
  const meta = result.meta;
  if (!meta) throw new Error(`No meta for ${symbol}`);

  const data = extractData(meta);
  console.log(`🔍 ${symbol}: price=${data.price} change=${data.change}%`);
  if (data.price === 0) throw new Error(`Zero price for ${symbol}`);
  return data;
};

const fetchNifty = async () => {
  const attempts = [
    { symbol: "^NSEI", host: "query1.finance.yahoo.com" },
    { symbol: "^NSEI", host: "query2.finance.yahoo.com" },
  ];
  for (const { symbol, host } of attempts) {
    try {
      store.nifty = await fetchYahooSymbol(symbol, host);
      console.log("✅ Nifty:", store.nifty);
      return;
    } catch (err) {
      console.warn(`⚠️  Nifty ${host}:`, err.message);
    }
  }
  if (!store.nifty?.price) store.nifty = { price: 0, change: 0 };
};

const fetchBankNifty = async () => {
  const attempts = [
    { symbol: "^NSEBANK", host: "query1.finance.yahoo.com" },
    { symbol: "^NSEBANK", host: "query2.finance.yahoo.com" },
  ];
  for (const { symbol, host } of attempts) {
    try {
      store.banknifty = await fetchYahooSymbol(symbol, host);
      console.log("✅ BankNifty:", store.banknifty);
      return;
    } catch (err) {
      console.warn(`⚠️  BankNifty ${host}:`, err.message);
    }
  }
  if (!store.banknifty?.price) store.banknifty = { price: 0, change: 0 };
};

module.exports = { fetchNifty, fetchBankNifty };