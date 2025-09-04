const express = require("express");
const router = express.Router();
const {createCustomer, getAllCustomers, getCustomerById, updateCustomer, deleteCustomer, makeAbsentDays, createCustomOrder, getDeliveryDays, getSubscriptionPlan, getPaymentMethods, getPaymentStatus} = require("../controllers/customerController");

// CRUD routes
router.post("/createCustomer", createCustomer);
router.get("/getAllCustomers", getAllCustomers);
router.get("/getCustomerById/:id", getCustomerById);
router.put("/update/:id", updateCustomer);
router.delete("/delete/:id", deleteCustomer);
router.post("/makeAbsentDays/:id", makeAbsentDays);
router.post("/makeCustomOrders", createCustomOrder);
router.get("/getDeliveryDays", getDeliveryDays);
router.get("/getSubscriptionPlan", getSubscriptionPlan);
router.get("/payment-methods", getPaymentMethods);
router.get("/payment-status", getPaymentStatus);




module.exports = router;
