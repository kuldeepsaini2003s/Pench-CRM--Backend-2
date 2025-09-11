const express = require("express");
const {
  searchCustomers,
  getCustomerData,
} = require("../controllers/customerInvoiceController");
const router = express.Router();

router.get("/search-customers", searchCustomers);
router.get("/customer-data/:customerId", getCustomerData);

module.exports = router;
