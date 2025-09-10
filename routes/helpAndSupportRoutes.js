const express = require("express");
const router = express.Router();
const { addSupportNumber, getSupportNumber, updateSupportNumber } = require("../controllers/helpAndSupportController");

router.post("/addSupportNumber", addSupportNumber);
router.get("/getSupportNumber", getSupportNumber);
router.put("/updateSupportNumber/:contactId", updateSupportNumber);

module.exports = router;
