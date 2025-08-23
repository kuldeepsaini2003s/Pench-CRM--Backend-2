const express = require("express");
const { createInvoice } = require("../controllers/customInvoiceController");


const router = express.Router();


router.post("/create", createInvoice);

module.exports = router;
