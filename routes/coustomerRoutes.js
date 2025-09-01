const express = require("express");
const router = express.Router();
const {createCustomer, getAllCustomers, getCustomerById, updateCustomer, deleteCustomer, makeAbsentDays, createCustomOrder} = require("../controllers/customerController");

// CRUD routes
router.post("/createCustomer", createCustomer);
router.get("/getAllCustomers", getAllCustomers);
router.get("/getCustomerById/:id", getCustomerById);
router.put("/update/:id", updateCustomer);
router.delete("/delete/:id", deleteCustomer);
router.post("/makeAbsentDays/:id", makeAbsentDays);
router.post("/makeCustomOrders", createCustomOrder);


// Delivery history
// router.post("/:customerId/delivery-history", customerController.addDeliveryHistory);

module.exports = router;
