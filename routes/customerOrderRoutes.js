const express = require("express");
const router = express.Router();
const {
  createAutomaticOrdersForCustomer,  getAllOrders,
  getOrderById,
  updateOrder,
  deleteOrder,
  getOrdersByCustomer,
  createAdditionalOrder,
  updateOrderStatus,
  verifyPayment,
} = require("../controllers/customerOrderController");

// Basic CRUD routes
router.post("/createAutomaticOrders", createAutomaticOrdersForCustomer);
router.get("/getAllOrders", getAllOrders);
// router.get("/stats", getOrderStats);
router.get("/:id", getOrderById);
router.put("/:id", updateOrder);
router.delete("/:id", deleteOrder);
// Specific functionality routes
router.get("/customer/:customerId", getOrdersByCustomer);

router.post("/additionalOrder/:customerId", createAdditionalOrder);
router.put("/updateStatus/:orderId", updateOrderStatus);
router.put("/verify-payment", verifyPayment);

module.exports = router;