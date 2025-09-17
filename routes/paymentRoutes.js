const express = require("express");
const router = express.Router();
const {
  createPaymentForCustomer,
  verifyPayment,
  makePaymentForBalance,
  getAllPaymentsByStatus,
} = require("../controllers/paymentController");

router.post("/createPayment/:customerId", createPaymentForCustomer);
router.get("/verifyPayment", verifyPayment);
router.post("/makePaymentForBalance/:customerId", makePaymentForBalance);
router.get("/getAllPayments", getAllPaymentsByStatus);

module.exports = router;
