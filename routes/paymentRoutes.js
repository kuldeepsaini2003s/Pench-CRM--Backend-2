const express = require("express");
const router = express.Router();
const {
  createPaymentForCustomer,
  verifyPayment,
  getAllPaymentsByStatus,
  getPendingPaymentsCount,
  getCustomerBalanceAmount,
  getAllCashPaymentsForDeliveryBoy,
} = require("../controllers/paymentController");

const{verifyDeliveryBoyToken} = require("../middlewares/deliveryBoy.middleware");

router.post("/createPayment/:customerId", createPaymentForCustomer);
router.get("/verifyPayment", verifyPayment);
router.get("/getAllPayments", getAllPaymentsByStatus);
router.get("/getPendingPaymentsCount", getPendingPaymentsCount);
router.get("/getCustomerBalanceAmount/:customerId", getCustomerBalanceAmount)
router.get("/getAllCashPaymentsForDeliveryBoy", verifyDeliveryBoyToken, getAllCashPaymentsForDeliveryBoy)

module.exports = router;
