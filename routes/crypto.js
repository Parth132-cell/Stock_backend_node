const express = require("express");
const router = express.Router();
const store = require("../cache/store");

router.get("/", (req, res) => {
  if (Object.keys(store.crypto).length === 0) {
    return res.json({
      BTCUSDT: { price: 0, change: 0 },
      ETHUSDT: { price: 0, change: 0 },
      SOLUSDT: { price: 0, change: 0 },
      BNBUSDT: { price: 0, change: 0 },
      XRPUSDT: { price: 0, change: 0 }
    });
  }

  res.json(store.crypto);
});

module.exports = router;