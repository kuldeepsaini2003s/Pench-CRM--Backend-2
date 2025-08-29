const express = require("express");
const router = express.Router();
const {createAdmin, loginAdmin, getAdminProfile, updateAdmin, forgotPassword, resetPassword} = require("../controllers/adminController");
const {authToken} = require("../middlewares/admin.middleware");
// CRUD
router.post("/register", createAdmin);
router.post("/login", loginAdmin);
router.get("/getProfile", authToken, getAdminProfile);
router.put("/:id", updateAdmin);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);

module.exports = router;
