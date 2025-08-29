const express = require("express");
const router = express.Router();
const {createAdmin, loginAdmin, getAdminProfile, updateAdminProfile, forgotPassword, verifyOtp, resetPassword, logoutAdmin} = require("../controllers/adminController");
const {authToken} = require("../middlewares/admin.middleware");
const {upload} = require("../config/cloudinary");
// CRUD
router.post("/register", createAdmin);
router.post("/login", loginAdmin);
router.get("/getProfile", authToken, getAdminProfile);
router.put("/updateProfile", authToken, upload.single("profileImage"), updateAdminProfile);
router.post("/forgot-password", forgotPassword);
router.post("/verify-otp", verifyOtp);
router.post("/reset-password", resetPassword);
router.post("/logout", authToken, logoutAdmin);

module.exports = router;
