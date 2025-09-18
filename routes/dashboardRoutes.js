const express = require("express");
const router = express.Router();
const {
  TotalSales,
  getLowStockProducts,
  getActiveSubscriptions,
  getNewOnboardCustomers,
  getProductOfTheDay,
  getLowestProductSale,
  getTotalDeliveredProductUnit,
  getEarningOverview,
} = require("../controllers/dashboardController");

router.get("/total-sales", TotalSales);
router.get("/inventory/low-stock", getLowStockProducts);
router.get("/active-subscriptions", getActiveSubscriptions);
router.get("/newOnboardCustomers", getNewOnboardCustomers);
router.get("/getEarningOverview", getEarningOverview);
router.get("/productOfTheDay", getProductOfTheDay);
router.get("/lowestProductSale", getLowestProductSale);
router.get("/totalDeliveredProductUnit", getTotalDeliveredProductUnit);
module.exports = router;
