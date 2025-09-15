const express = require("express");
const router = express.Router();
const {
  TotalSales,
  getLowStockProducts,
  getActiveSubscriptions,
  getTopAndLowestProducts,
  getPendingPayments,
  getNewOnboardCustomers,
  getProductOfTheDay
} = require("../controllers/dashboardController");

router.get("/total-sales", TotalSales);
router.get("/top-lowest/product", getTopAndLowestProducts);
router.get("/inventory/low-stock", getLowStockProducts);
router.get("/active-subscriptions", getActiveSubscriptions);
router.get("/payments/pending", getPendingPayments);
router.get("/newOnboardCustomers", getNewOnboardCustomers);
router.get("/productOfTheDay", getProductOfTheDay);
module.exports = router;
