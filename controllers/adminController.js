const Admin = require("../models/adminModel");
const bcrypt = require("bcrypt");
const {sendOtpEmail} = require("../utils/sendMail");


// ✅ Create Admin
const createAdmin = async (req, res) => {
  try {
    const { name, email, phoneNumber, gstNumber, password, address, role } =
      req.body;

    const existingAdmin = await Admin.findOne({ email });
    if (existingAdmin) {
      return res.status(400).json({ message: "Email already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const admin = await Admin.create({
      name,
      email,
      phoneNumber,
      gstNumber,
      password: hashedPassword,
      address,
      role,
    });

   return res.status(201).json({ 
      success: true,
      message:"Admin Created Successfully", 
      admin 
    });
  } catch (error) {
    return res.status(500).json({ 
      success: false,
      message:"Failed to create admin",
      error: error.message 
    });
  }
};


// ✅ Login Admin
const loginAdmin = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find admin and select password explicitly
    const admin = await Admin.findOne({ email }).select("+password");
    if (!admin) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid email or password" });
    }

    // Call instance method, not Admin.comparePassword
    const isMatch = await admin.comparePassword(password);
    if (!isMatch) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid email or password" });
    }

    // Generate JWT token
    const token = await admin.generateToken();

   return res.status(200).json({
      success: true,
      token,
      admin: {
        id: admin._id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
        status: admin.status,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};



// ✅ Get Admin Profile
const getAdminProfile = async (req, res) => {
  try {
    const adminId = req.admin._id;
    if(!adminId){
      return res.status(401).json({
        success:false,
        message:"Unauthorized"
      })
    }

    const admin = await Admin.findById(adminId).select("-password");
    if(!admin){
      return res.status(404).json({
        success:false,
        message:"Admin not found"
      })
    }

   return res.json({ 
      success: true,
      message:"Admin Profile Fetched Successfully", 
      admin 
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

// ✅ Update Admin
const updateAdmin = async (req, res) => {
  try {
    const { name, phoneNumber, gstNumber, address, role, status } = req.body;

    const admin = await Admin.findByIdAndUpdate(
      req.params.id,
      { name, phoneNumber, gstNumber, address, role, status },
      { new: true, runValidators: true }
    ).select("-password");

    if (!admin) return res.status(404).json({ message: "Admin not found" });

    res.json({ success: true, admin });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};


// ✅ Forgot Password
const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    const admin = await Admin.findOne({ email });

    if (!admin) {
      return res.status(404).json({ message: "Admin not found" });
    }

    const result = await sendOtpEmail(admin);
    // console.log("result",result)

  if(result.success){
    return res.status(200).json({ success: true, message:result.message, otp:result.otp });
  }else{
    return res.status(400).json({ success: false, message:result.message });
  }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ✅ Reset Password
const resetPassword = async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;
    const admin = await Admin.findOne({ email });

    if (!admin) {
      return res.status(404).json({ message: "Admin not found" });
    }

    // Check OTP
    if (admin.otp !== otp || Date.now() > admin.otpExpire) {
      return res.status(400).json({ message: "Invalid or expired OTP" });
    }

    // Update Password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    admin.password = hashedPassword;
    admin.otp = undefined;
    admin.otpExpire = undefined;
    await admin.save();

    res.json({ success: true, message: "Password reset successful" });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

module.exports = {
  createAdmin,
  loginAdmin,
  getAdminProfile,
  updateAdmin,
  forgotPassword,
  resetPassword,
}