const express = require("express");
const router = express.Router();
const {
  createAutomaticOrdersForCustomer,
  createAdditionalOrder,
  updateOrderStatus,
  getPendingBottles,
  updateBottleReturns,
} = require("../controllers/customerOrderController");
const{verifyDeliveryBoyToken}=require("../middlewares/deliveryBoy.middleware");

router.post("/createAutomaticOrders", createAutomaticOrdersForCustomer);
router.post("/additionalOrder/:customerId", createAdditionalOrder);
router.put("/updateStatus/:orderId", updateOrderStatus);
router.get("/getPendingBottles/:customerId", verifyDeliveryBoyToken, getPendingBottles);
router.put("/updateBottleReturns/:orderId", updateBottleReturns);


module.exports = router;