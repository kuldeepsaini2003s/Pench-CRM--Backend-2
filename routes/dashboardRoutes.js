const express = require("express");
const router = express.Router();
const {
  TotalSales,
  getLowStockProducts,
  getActiveSubscriptions,
  getPendingPayments,
  getNewOnboardCustomers,
  getProductOfTheDay,
  getLowestProductSale,
  getTotalDeliveredProductUnit
} = require("../controllers/dashboardController");

router.get("/total-sales", TotalSales);
router.get("/inventory/low-stock", getLowStockProducts);
router.get("/active-subscriptions", getActiveSubscriptions);
router.get("/payments/pending", getPendingPayments);
router.get("/newOnboardCustomers", getNewOnboardCustomers);
router.get("/productOfTheDay", getProductOfTheDay);
router.get("/lowestProductSale", getLowestProductSale);
router.get("/totalDeliveredProductUnit", getTotalDeliveredProductUnit);
module.exports = router;
