const express = require("express");
const router = express.Router();
const {
  createPaymentForCustomer,
  verifyPayment,
  makePaymentForBalance,
  getAllPaymentsByStatus,
  getAllCashPaymentsForDeliveryBoy,
  getPendingPaymentsCount,
} = require("../controllers/paymentController");
const{verifyDeliveryBoyToken} = require("../middlewares/deliveryBoy.middleware");

router.post("/createPayment/:customerId", createPaymentForCustomer);
router.get("/verifyPayment", verifyPayment);
router.post("/makePaymentForBalance/:customerId", makePaymentForBalance);
router.get("/getAllPayments", getAllPaymentsByStatus);
router.get("/getAllCashPaymentsForDeliveryBoy", verifyDeliveryBoyToken, getAllCashPaymentsForDeliveryBoy);
router.get("/getPendingPaymentsCount", getPendingPaymentsCount);

module.exports = router;
