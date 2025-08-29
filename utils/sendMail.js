const nodemailer = require('nodemailer');
 
// Configure Nodemailer
const transport = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});
 
// Send Password Reset Email
const sendOtpEmail = async (admin) => {
  try {
    // Generate a 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString(); // Generates random 6-digit number
    admin.otp = otp;
    admin.otpExpire = Date.now() + 3600000; // OTP expires in 1 hour
    await admin.save(); // Save OTP and expiration to the admin document
 
    const mailOptions = {
      from: `"Your Company" <${process.env.EMAIL_USER}>`,
      to: admin.email,
      subject: 'Password Reset Request',
      html: `
        <p>Hello ${admin.name},</p>
        <p>Your OTP for password reset is:</p>
        <h2>${otp}</h2>
        <p>This OTP will expire in 1 hour. If you did not request this, please ignore this email.</p>
      `,
    };
 console.log(mailOptions);
    await transport.sendMail(mailOptions); // Send email
    return { success: true, message: 'Password reset email sent successfully.', otp };
  } catch (error) {
    console.error('Error sending password reset email:', error);
    return { success: false, message: 'Failed to send password reset email.' };
  }
};
 
module.exports = { sendOtpEmail };