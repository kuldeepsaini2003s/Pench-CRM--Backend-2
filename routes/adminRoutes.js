const express = require("express");
const router = express.Router();
const {createAdmin, loginAdmin, getAdminProfile, updateAdmin, forgotPassword, resetPassword} = require("../controllers/adminController");

// CRUD
router.post("/register", createAdmin);
router.post("/login", loginAdmin);
router.get("/profile", getAdminProfile);
router.put("/:id", updateAdmin);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);

module.exports = router;
