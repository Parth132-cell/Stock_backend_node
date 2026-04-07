const axios = require("axios");
const store = require("../cache/store");

// ✅ NEW API: metalpriceapi.com
const API_KEY = process.env.METALS_API_KEY;

// USD/INR fallback rate in case INR is not in the response
const FALLBACK_USD_INR = 84.5;

const fetchMetals = async () => {
  try {
    const res = await axios.get(
      `https://api.metalpriceapi.com/v1/latest?api_key=${API_KEY}&base=USD&currencies=XAU,XAG,INR`
    );

    if (!res.data.success) {
      console.error("❌ Metals API returned error:", res.data);
      return;
    }

    const rates = res.data.rates;

    // rates.XAU = how many troy oz of gold per 1 USD  (i.e. 1/price_of_gold_in_USD)
    // So gold price in USD per troy oz = 1 / rates.XAU
    const goldPriceUSD = 1 / rates.XAU;   // per troy oz
    const silverPriceUSD = 1 / rates.XAG; // per troy oz

    // USD to INR
    const usdToInr = rates.INR || FALLBACK_USD_INR;

    // Convert to INR
    // 1 troy oz = 31.1035 grams
    const goldPerGramINR = (goldPriceUSD / 31.1035) * usdToInr;
    const silverPer10gINR = (silverPriceUSD / 31.1035) * 10 * usdToInr;

    store.metals = {
      gold_24k: parseFloat((goldPerGramINR * 10).toFixed(2)),  // per 10g
      gold_22k: parseFloat((goldPerGramINR * 10 * 0.916).toFixed(2)),
      silver: parseFloat(silverPer10gINR.toFixed(2))           // per 10g
    };

    console.log("✅ Metals updated:", store.metals);
  } catch (err) {
    console.error("❌ Metals API error:", err.message);
    // Keep last known value — don't reset to zero
  }
};

module.exports = { fetchMetals };