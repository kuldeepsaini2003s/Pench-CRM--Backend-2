const express = require("express");
const { allCustomerInvoices, generateInvoiceForCustomer } = require("../controllers/allCustomerInvoce");
const router = express.Router();

router.get("/invoices", allCustomerInvoices);



router.post("/generate-invoice", generateInvoiceForCustomer);




module.exports = router;