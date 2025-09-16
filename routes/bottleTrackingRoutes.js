const express = require("express");
const router = express.Router();
const {
  getBottleCountForDate,
  getAllBottleTrackingOrders,
} = require("../controllers/bottleTrackingController");


// Bottle tracking route
router.get("/bottles/count", getBottleCountForDate);

// GET - all bottle tracking orders (milk products only)
router.get("/orders", getAllBottleTrackingOrders);

module.exports = router;
