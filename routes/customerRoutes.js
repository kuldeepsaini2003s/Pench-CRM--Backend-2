const express = require("express");
const router = express.Router();
const {
  createCustomer,
  getAllCustomers,
  getCustomerById,
  updateCustomer,
  deleteCustomer,
  makeAbsentDays,  
  getDeliveryDays,
  getSubscriptionPlan,
  getPaymentMethods,
  getPaymentStatus,
  addProductToCustomer,
  removeProductFromCustomer,
} = require("../controllers/customerController");

// CRUD routes
router.post("/createCustomer", createCustomer);
router.get("/getAllCustomers", getAllCustomers);
router.get("/getCustomerById/:id", getCustomerById);
router.put("/update/:id", updateCustomer);
router.put("/delete/:id", deleteCustomer);
router.post("/makeAbsentDays/:id", makeAbsentDays);
// router.post("/additionalOrder", additionalOrder);
router.get("/getDeliveryDays", getDeliveryDays);
router.get("/getSubscriptionPlan", getSubscriptionPlan);
router.get("/payment-methods", getPaymentMethods);
router.get("/payment-status", getPaymentStatus);
router.post("/addProduct/:id", addProductToCustomer);
router.delete("/removeProduct/:id", removeProductFromCustomer);

module.exports = router;
