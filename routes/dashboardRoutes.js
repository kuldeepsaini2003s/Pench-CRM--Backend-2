const express = require("express");
const router = express.Router();
const {
  getAllSales,
  getLowStockProducts,
  getActiveSubscriptions,
  getSalesSummary,
  getTopProducts
} = require("../controllers/dashboardController");

// Sales Routes
router.get("/sales", getAllSales);
router.get("/sales/summary", getSalesSummary);
router.get("/sales/top-products", getTopProducts);

// Inventory Routes
router.get("/inventory/low-stock", getLowStockProducts);

// Customer Routes
router.get("/customers/active-subscriptions", getActiveSubscriptions);

module.exports = router;