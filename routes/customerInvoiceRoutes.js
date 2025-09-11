const express = require("express");
const {
  allCustomerInvoices,
  generateInvoiceForCustomer,
  generateEnhancedMonthlyInvoices,
  searchCustomers,
  getCustomerData,
} = require("../controllers/customerInvoiceController");
const router = express.Router();

// router.get("/invoices", allCustomerInvoices);
// router.post("/generate-invoice", generateInvoiceForCustomer);

// // Enhanced monthly invoice generation endpoint
// router.post("/generate-monthly-invoices", generateEnhancedMonthlyInvoices);

router.get("/search-customers", searchCustomers);
router.get("/customer-data/:customerId", getCustomerData);

module.exports = router;
