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
  updateCustomerProduct,
  updateSubscriptionStatus,
} = require("../controllers/customerController");
const { upload } = require("../config/cloudinary");

// CRUD routes
router.post("/createCustomer", createCustomer);
router.get("/getAllCustomers", getAllCustomers);
router.get("/getCustomerById/:id", getCustomerById);
router.put("/update/:id", upload.single("customerImage"), updateCustomer);
router.put("/delete/:id", deleteCustomer);
router.post("/makeAbsentDays/:id", makeAbsentDays);
router.get("/getDeliveryDays", getDeliveryDays);
router.get("/getSubscriptionPlan", getSubscriptionPlan);
router.get("/payment-methods", getPaymentMethods);
router.get("/payment-status", getPaymentStatus);
router.post("/addProduct/:id", addProductToCustomer);
router.post("/removeProduct/:id", removeProductFromCustomer);
router.put("/updateCustomerProduct/:customerId", updateCustomerProduct);
router.put("/updateSubscriptionStatus/:id", updateSubscriptionStatus);

module.exports = router;
