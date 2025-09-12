const express = require("express");
const router = express.Router();
const {
  createAutomaticOrdersForCustomer,
  createAdditionalOrder,
  updateOrderStatus,
 
} = require("../controllers/customerOrderController");

router.post("/createAutomaticOrders", createAutomaticOrdersForCustomer);
router.post("/additionalOrder/:customerId", createAdditionalOrder);
router.put("/updateStatus/:orderId", updateOrderStatus);


module.exports = router;