const SupportMobileNumber = require("../models/helpAndSupportModel");
 
//✅ Add Support Number
const addSupportNumber = async (req, res) => {
    try {
      let { contactNumber } = req.body;
  
      if (!contactNumber) {
        return res.status(400).json({ success: false, message: "Contact number is required" });
      }
  
     // Convert to string and check length
     if (contactNumber.toString().length !== 10) {
        return res.status(400).json({
          success: false,
          message: "Contact number should be at least 10 digits long",
        });
      }
  
      // Check if valid Indian mobile (6-9 se start hona chahiye)
      if (!/^[6-9]\d{9}$/.test(contactNumber.toString())) {
        return res.status(400).json({
          success: false,
          message: "Invalid mobile number format",
        });
      }
  
  
      // Check if a contact number already exists
      const existingSupportNumber = await SupportMobileNumber.findOne();
  
      if (existingSupportNumber) {
        // If a number exists, do NOT modify it
        return res.status(409).json({
          success: false,
          message: "Help and Support Number already exists",
          contactNumber: existingSupportNumber.contactNumber, // send existing number from DB
        });
      }
  
      // Create a new support number (first and only one)
      const supportNumber = new SupportMobileNumber({ contactNumber });
      await supportNumber.save();
  
      return res.status(201).json({
        success: true,
        message: "Contact support number added successfully",
      });
  
    } catch (error) {
      console.error("Error in addContactSupportNumber:", error);
      return res.status(500).json({ success: false, message: "Failed to add contact number" });
    }
  };
  
 
 
//✅ Get Support Number
const getSupportNumber = async (req, res) => {
    try {
        const supportNumber = await SupportMobileNumber.findOne();
        if (!supportNumber) {
            return res.status(404).json({ success:false,message: "Contact support number not found" });
        }
 
    const contactNumber = await SupportMobileNumber.findOne().select(' _id contactNumber');
        return res.status(200).json({ success:true,message:"Contact Number Fetched Successfully",supportNumber:contactNumber });
    } catch (error) {
        console.error("Error in getContactSupportNumber:", error);
        return res.status(500).json({ success:false,message: "Failed to Fetch ContactNumber" });
    }
};
 
//✅ Update Support Number
const updateSupportNumber = async (req, res) => {
    try {
        const { contactId } = req.params;
        const { contactNumber } = req.body;
 
        if (!contactNumber) {
            return res.status(400).json({ success: false, message: "Contact number is required" });
        }
 
        // Convert to string and check length
        if (contactNumber.toString().length !== 10) {
            return res.status(400).json({
              success: false,
              message: "Contact number should be at least 10 digits long",
            });
          }
      
          // Check if valid Indian mobile (6-9 se start hona chahiye)
          if (!/^[6-9]\d{9}$/.test(contactNumber.toString())) {
            return res.status(400).json({
              success: false,
              message: "Invalid mobile number format",
            });
          }
      
 
        const supportNumber = await SupportMobileNumber.findById(contactId);
 
        if (!supportNumber) {
            return res.status(404).json({ success: false, message: "Contact support number not found" });
        }
 
        // Fix typo and update number
        supportNumber.contactNumber = contactNumber;
 
        await supportNumber.save();
 
        return res.status(200).json({
            success: true,
            message: "Contact support number updated successfully",
            supportNumber
        });
    } catch (error) {
        console.error("Error in updateContactSupportNumber:", error);
        return res.status(500).json({ success: false, message: "Failed to update contact number" });
    }
};
 
module.exports = {
    addSupportNumber,
    getSupportNumber,
    updateSupportNumber
};
 