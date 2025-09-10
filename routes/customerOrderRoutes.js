const express = require("express");
const router = express.Router();
const {
  createAutomaticOrdersForCustomer,  getAllOrders,
  getOrderById,
  updateOrder,
  deleteOrder,
  getOrdersByCustomer,
  createAdditionalOrder,

} = require("../controllers/customerOrderController");

// Basic CRUD routes
router.post("/createAutomaticOrders", createAutomaticOrdersForCustomer);
router.get("/", getAllOrders);
// router.get("/stats", getOrderStats);
router.get("/:id", getOrderById);
router.put("/:id", updateOrder);
router.delete("/:id", deleteOrder);

// Specific functionality routes
router.get("/customer/:customerId", getOrdersByCustomer);
// router.patch("/:id/status", updateOrderStatus);
// router.patch("/:id/assign-delivery-boy", assignDeliveryBoy);
router.post("/additionalOrder/:customerId", createAdditionalOrder);

module.exports = router;