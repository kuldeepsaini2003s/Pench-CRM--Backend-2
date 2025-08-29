const jwt = require("jsonwebtoken");
const AdminModel = require("../models/adminModel");

const authToken = async(req, res, next) =>{
    try {
        const token = req.headers.authorization.split(" ")[1] || req.cookies.token;
        if(!token){
            return res.status(401).json({
                success:false,
                message:"Unauthorized"
            })
        }
        const decoded = await jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
        if(!decoded){
            return res.status(401).json({
                success:false,
                message:"Invalid Token"
            })
        }
        const admin = await AdminModel.findById(decoded.id);
        if(!admin){
            return res.status(401).json({
                success:false,
                message:"Admin not found"
            })
        }
        req.admin = admin;
        next();
        
    } catch (error) {
        console.log("Authentication Error",error)
        if(error.name ==="TokenExpiredError"){
            return res.status(401).json({
                success:false,
                message:"Token Expired"
            })
        }
        if(error.name === "JsonWebTokenError"){
            return res.status(401).json({
                success:false,
                message:"Invalid Token"
            })
        }
        return res.status(500).json({
            success:false,
            message:"Failed to authenticate"
        })
        
    }
} 

module.exports = authToken;