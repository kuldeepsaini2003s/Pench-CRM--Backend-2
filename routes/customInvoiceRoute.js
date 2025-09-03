const express = require("express");
const { createCustomerInvoice, getAllCustomerInvoices, getPaymentMethods, getPaymentStatus } = require("../controllers/customInvoiceController");

const router = express.Router();

router.post("/createInvoice", createCustomerInvoice);
router.get("/getAllInvoices", getAllCustomerInvoices);
router.get("/payment-methods", getPaymentMethods);
router.get("/payment-status", getPaymentStatus);

module.exports = router;
