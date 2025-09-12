const express = require("express");
const {
  searchCustomers,
  getCustomerData,
  createCustomerInvoice,
  getAllCustomerInvoices,
} = require("../controllers/customerInvoiceController");
const router = express.Router();

router.post("/create-invoice", createCustomerInvoice);
router.get("/search-customers", searchCustomers);
router.get("/customer-data/:customerId", getCustomerData);
router.get("/getAllInvoices", getAllCustomerInvoices);

module.exports = router;
