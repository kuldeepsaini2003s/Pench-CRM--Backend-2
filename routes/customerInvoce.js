const express = require("express");
const { allCustomerInvoices } = require("../controllers/allCustomerInvoce");
const router = express.Router();

router.get("/invoices", allCustomerInvoices);

module.exports = router;