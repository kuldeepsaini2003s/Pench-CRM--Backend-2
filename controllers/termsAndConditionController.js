const deliveryBoyTermsAndConditionSchema = require("../models/termsAndConditionModel");

//✅ Create Terms and Conditions
const createDeliveryBoyTermsAndCondition = async (req, res) => {
    try {
        const { description } = req.body
        if (!description) {
            return res.status(400).json({
                success: false,
                message: "Description is required"
            })
        }

        const existingTermsAndCondition = await deliveryBoyTermsAndConditionSchema.findOne()
        if (existingTermsAndCondition) {
            return res.status(400).json({
                success: false,
                message: "Terms and conditions already exists"
            })
        }
        console.log(existingTermsAndCondition)
        const termsAndCondition = await deliveryBoyTermsAndConditionSchema.create({ description })
        return res.status(200).json({
            success: true,
            message: "Terms and conditions created successfully",
            termsAndCondition
        })
    } catch (error) {
        console.log(error)
        return res.status(500).json({
            success: false,
            message: "Failed to create terms and conditions"
        })
    }
}

//✅ Get Terms and Conditions
const getDeliveryBoyTermsAndCondition = async (req, res) => {
    try {
        const termsAndCondition = await deliveryBoyTermsAndConditionSchema.findOne()
        if (!termsAndCondition) {
            return res.status(404).json({
                success: false,
                message: "Terms and conditions not found"
            })
        }
        return res.status(200).json({
            success: true,
            message: "Terms and conditions fetched successfully",
            termsAndCondition
        })
    } catch (error) {
        console.log(error)
        return res.status(500).json({
            success: false,
            message: "Failed to get terms and conditions"
        })
    }
}

//✅ Update Terms and Conditions
const updateDeliveryBoyTermsAndCondition = async (req, res) => {
    const { description } = req.body;
    if (!description) {
        return res.status(400).json({ message: "Description is required" });
    }

    try {
        const updated = await deliveryBoyTermsAndConditionSchema.findOneAndUpdate(
            {},
            { description },
            { new: true }
        );
        return res.status(200).json({
            success: true,
            message: "Terms and Conditions updated successfully",
            updated,
        });
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
};

module.exports = {
    createDeliveryBoyTermsAndCondition,
    getDeliveryBoyTermsAndCondition,
    updateDeliveryBoyTermsAndCondition
}
