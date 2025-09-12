const mongoose = require("mongoose");


const customerOverAllOrderSchema = new mongoose.Schema({

    customerId:{
        type:mongoose.Schema.Types.ObjectId,
        ref:"Customer",
    },
    subscriptionPlan:{
        type:String,
        enum:["Monthly","Alternate Days","Custom Date"],
    },
    subscriptionStatus:{
        type:String,
        enum:["active","inactive"],
 
    },
    paymentStatus:{
        type:String,
        enum:["Paid","Unpaid","Partially Paid"],

    }
    
})

module.exports = mongoose.model("CustomerOverAllOrder", customerOverAllOrderSchema);
