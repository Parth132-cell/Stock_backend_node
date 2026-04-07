const express = require("express");
const router = express.Router();
const store = require("../cache/store");

router.get("/", (req, res) => {
  res.json(store.metals);
});

module.exports = router;