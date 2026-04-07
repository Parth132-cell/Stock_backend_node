const express = require("express");
const router = express.Router();
const store = require("../cache/store");

router.get("/nifty", (req, res) => {
  res.json(store.nifty);
});

module.exports = router;