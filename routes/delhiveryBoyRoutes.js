const express = require("express");
const {
  registerDeliveryBoy,
  loginDeliveryBoy,
  getAllDeliveryBoys,
  updateDeliveryBoy,
  deleteDeliveryBoy,
  getDeliveryBoyProfile,
  getOrders,
  getOrdersByDateRange,
  getOrderStatistics,
} = require("../controllers/delhiveryBoyController");
const {
  verifyDeliveryBoyToken,
} = require("../middlewares/deliveryBoy.middleware");

const router = express.Router();

// Auth routes
router.post("/register", registerDeliveryBoy);
router.post("/login", loginDeliveryBoy);
router.get("/getAll", getAllDeliveryBoys);
router.get(
  "/deliveryBoyProfile",
  verifyDeliveryBoyToken,
  getDeliveryBoyProfile
);
router.put("/update", verifyDeliveryBoyToken, updateDeliveryBoy);
router.delete("/delete/:id", deleteDeliveryBoy);

// Order routes
router.get("/getOrders", getOrders);
router.get("/range/:deliveryBoyId", getOrdersByDateRange);
// router.get('/stats/:deliveryBoyId', getOrderStatistics);

module.exports = router;
