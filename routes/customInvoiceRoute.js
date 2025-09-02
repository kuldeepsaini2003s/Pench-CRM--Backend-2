const express = require("express");
const { createCustomerInvoice, getAllCustomerInvoices } = require("../controllers/customInvoiceController");

const router = express.Router();

router.post("/createInvoice", createCustomerInvoice);
router.get("/getAllInvoices", getAllCustomerInvoices);

module.exports = router;
