const express = require("express");
const router = express.Router();
const { generateDeliveryBoyShareLink, shareConsumeToken } = require("../controllers/shareTokenController");

router.post("/generateDeliveryBoyShareLink/:id", generateDeliveryBoyShareLink);
router.get("/getShareToken", shareConsumeToken);

module.exports = router;