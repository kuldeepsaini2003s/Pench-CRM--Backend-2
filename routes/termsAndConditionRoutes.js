const express = require("express");
const router = express.Router();
const {createDeliveryBoyTermsAndCondition, getDeliveryBoyTermsAndCondition, updateDeliveryBoyTermsAndCondition} = require("../controllers/termsAndConditionController");

router.post("/createTermsAndCondition", createDeliveryBoyTermsAndCondition);
router.get("/getTermsAndCondition", getDeliveryBoyTermsAndCondition);
router.put("/updateTermsAndCondition", updateDeliveryBoyTermsAndCondition);

module.exports = router;
