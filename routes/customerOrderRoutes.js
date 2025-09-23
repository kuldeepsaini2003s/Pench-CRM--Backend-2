const express = require("express");
const router = express.Router();
const {
  createAutomaticOrdersForCustomer,
  createAdditionalOrder,
  updateOrderStatus,
  updateBottleReturns,
} = require("../controllers/customerOrderController");
const { verifyDeliveryBoyToken } = require("../middlewares/deliveryBoy.middleware");


router.post("/createAutomaticOrders", createAutomaticOrdersForCustomer);
router.post("/additionalOrder/:customerId", createAdditionalOrder);
router.put("/updateStatus/:orderId", updateOrderStatus);
router.put("/updateBottleReturns/:customerId", verifyDeliveryBoyToken, updateBottleReturns);


module.exports = router;