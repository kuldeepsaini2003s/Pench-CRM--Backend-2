const express = require("express")
const router = express.Router();
const { createPaymentForCustomer, verifyPayment } = require("../controllers/paymentController");

router.post("/createPayment/:customerId", createPaymentForCustomer);
router.get("/verifyPayment", verifyPayment);

module.exports = router;

