const Customer = require("../models/customerModel");
const CustomerOrders = require("../models/customerOrderModel"); // daily orders
const Payment = require("../models/paymentModel");
const Razorpay = require("razorpay");
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});


// ✅ Create Payment for Customer
const createPaymentForCustomer = async (req, res) => {
  try {
    const { customerId } = req.params;
    const { wantToPay, paymentMethod, paidAmount } = req.body;

    // 🔍 Find customer
    const customer = await Customer.findById(customerId);
    if (!customer) {
      return res.status(404).json({ success: false, message: "Customer not found" });
    }

    if (!wantToPay) {
      return res.status(400).json({ success: false, message: "wantToPay must be true to create a payment" });
    }

    if (!paymentMethod || !["Online", "COD"].includes(paymentMethod)) {
      return res.status(400).json({ success: false, message: "Invalid paymentMethod" });
    }

    if (!paidAmount || paidAmount <= 0) {
      return res.status(400).json({ success: false, message: "Provide a valid paidAmount" });
    }

    // ✅ Calculate total payable from all delivered CustomerOrders
    const allOrders = await CustomerOrders.find({ customer: customerId, status: "Delivered" });
    const totalAmount = allOrders.reduce((sum, order) => sum + (order.totalAmount || 0), 0);

    if (paidAmount > totalAmount) {
      return res.status(400).json({ success: false, message: `Paid amount cannot exceed total amount (${totalAmount})` });
    }

    let paymentDocData = {
      customer: customerId,
      totalAmount,
      paidAmount: 0,
      balanceAmount: totalAmount,
      paidDates: [new Date()],
      paymentMethod,
      paymentStatus: "Unpaid",
    };

    // ✅ Online payment: generate Razorpay link
    if (paymentMethod === "Online") {
      try {
        const paymentLink = await razorpay.paymentLink.create({
          amount: Math.round(paidAmount * 100),
          currency: "INR",
          description: `Payment of ₹${paidAmount} for ${customer.name}`,
          customer: {
            name: customer.name,
            email: customer.email || "test@example.com",
            contact: String(customer.phoneNumber),
          },
          callback_url: `${process.env.BASE_URL}/api/payment/verifyPayment?customerId=${customerId}`,
          callback_method: "get",
        });

        paymentDocData.razorpayLinkId = paymentLink.id;
        paymentDocData.razorpayLinkStatus = paymentLink.status;
      } catch (err) {
        console.error("Razorpay error:", err);
        return res.status(500).json({ success: false, message: "Failed to create Razorpay link", error: err.message });
      }
    }

    // ✅ For COD, we immediately record the paidAmount as collected
    if (paymentMethod === "COD") {
      paymentDocData.paidAmount = paidAmount;
      paymentDocData.balanceAmount = totalAmount - paidAmount;
      paymentDocData.paymentStatus = paymentDocData.balanceAmount === 0 ? "Paid" : "Partially Paid";
    }

    const paymentDoc = new Payment(paymentDocData);
    await paymentDoc.save();

    // ✅ Update Customer
    customer.amountPaidTillDate += paymentDoc.paidAmount;
    customer.amountDue = totalAmount - customer.amountPaidTillDate;
    customer.paymentStatus = customer.amountPaidTillDate < totalAmount ? "Partially Paid" : "Paid";
    await customer.save();

    // ✅ Update CustomerOrders
    const updatedOrderStatus = paymentDoc.paidAmount < totalAmount ? "Partially Paid" : "Paid";
    await CustomerOrders.updateMany(
      { customer: customerId, status: "Delivered" },
      { $set: { paymentStatus: updatedOrderStatus, paymentMethod } }
    );

    res.status(200).json({
      success: true,
      message: "Payment recorded successfully",
      payment: paymentDoc,
      ...(paymentMethod === "Online" && { paymentUrl: paymentDoc.razorpayLinkId }), // send link if Online
    });
  } catch (error) {
    console.error("createPaymentForCustomer Error:", error);
    res.status(500).json({ success: false, message: "Error creating payment", error: error.message });
  }
};


// ✅ Verify Payment
const verifyPayment = async (req, res) => {
  try {
    const {
      razorpay_payment_id,
      razorpay_payment_link_id,
      razorpay_payment_link_status,
      customerId, // from query string
    } = req.query;

    if (!razorpay_payment_id || !razorpay_payment_link_id || !customerId) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment verification request",
      });
    }

    // 🔍 Find payment record by link ID
    const paymentDoc = await Payment.findOne({
      customer: customerId,
      razorpayLinkId: razorpay_payment_link_id,
    });

    if (!paymentDoc) {
      return res.status(404).json({
        success: false,
        message: "Payment record not found for this link",
      });
    }

    // ✅ Fetch payment details from Razorpay
    const payment = await razorpay.payments.fetch(razorpay_payment_id);
    const paidAmount = payment.amount / 100; // paise → INR

    if (!paidAmount || paidAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment amount",
      });
    }

    // ✅ Update Payment model
    paymentDoc.paidAmount += paidAmount;
    paymentDoc.balanceAmount = paymentDoc.totalAmount - paymentDoc.paidAmount;
    paymentDoc.razorpayPaymentId = razorpay_payment_id;               // 🔥 store payment id
    paymentDoc.razorpayLinkStatus = razorpay_payment_link_status;     // 🔥 update link status

    if (paymentDoc.paidAmount < paymentDoc.totalAmount) {
      paymentDoc.paymentStatus = "Partially Paid";
    } else {
      paymentDoc.paymentStatus = "Paid";
      paymentDoc.balanceAmount = 0;
    }
    await paymentDoc.save();

    // ✅ Update Customer model
    const customer = await Customer.findById(customerId);
    if (customer) {
      customer.amountPaidTillDate = paymentDoc.paidAmount;
      customer.amountDue = paymentDoc.balanceAmount;
      customer.paymentStatus = paymentDoc.paymentStatus;
      await customer.save();
    }

    // ✅ Update all Delivered CustomerOrders
    await CustomerOrders.updateMany(
      { customer: customerId, status: "Delivered" },
      {
        $set: {
          paymentStatus: paymentDoc.paymentStatus,
          paymentMethod: paymentDoc.paymentMethod || "Online",
        },
      }
    );

    return res.status(200).json({
      success: true,
      message: "Payment verified successfully",
      paymentDetails: {
        paidAmount,
        totalPaid: paymentDoc.paidAmount,
        balance: paymentDoc.balanceAmount,
        status: paymentDoc.paymentStatus,
      },
      payment: paymentDoc,
    });
  } catch (error) {
    console.error("verifyPayment Error:", error);
    return res.status(500).json({
      success: false,
      message: "Error verifying payment",
      error: error.message,
    });
  }
};

//✅ Make Payment for Balance
const makePaymentForBalance = async (req, res) => {
  try {
    const { customerId } = req.params;

    // 🔍 Validate environment variables first
    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
      console.error("❌ Missing Razorpay credentials");
      return res.status(500).json({
        success: false,
        message: "Razorpay configuration missing. Please check environment variables.",
      });
    }

    if (!process.env.BASE_URL) {
      console.error("❌ Missing BASE_URL");
      return res.status(500).json({
        success: false,
        message: "BASE_URL environment variable is not configured.",
      });
    }

    console.log("🔍 Looking for payment record for customer:", customerId);

    // 🔍 Find existing payment record
    const paymentDoc = await Payment.findOne({
      customer: customerId,
      $or: [
        { paymentStatus: { $in: ["Unpaid", "Partially Paid"] } },
        { paymentStatus: { $exists: false } },
        { paymentStatus: null }
      ]
    }).populate("customer");

    console.log("📄 Payment document found:", paymentDoc ? "Yes" : "No");

    if (!paymentDoc) {
      return res.status(404).json({
        success: false,
        message: "No pending balance found for this customer",
      });
    }

    const customer = paymentDoc.customer;
    let balanceAmount = paymentDoc.balanceAmount;

    console.log("👤 Customer data:", {
      name: customer?.name,
      email: customer?.email,
      phone: customer?.phoneNumber,
      balanceAmount: balanceAmount
    });

    // 🔍 Validate balance amount
    if (!balanceAmount || balanceAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: "No balance left to pay. Already settled.",
      });
    }

    // 🔍 Validate customer data
    if (!customer || !customer.name) {
      return res.status(400).json({
        success: false,
        message: "Customer data is incomplete or missing.",
      });
    }

    // 🔍 Validate customer phone number
    if (!customer.phoneNumber) {
      return res.status(400).json({
        success: false,
        message: "Customer phone number is required for payment.",
      });
    }

    // ✅ Razorpay per-link max = 10,00,000 INR
    const MAX_LIMIT = 1000000;
    const amountToPay = balanceAmount > MAX_LIMIT ? MAX_LIMIT : balanceAmount;

    console.log("💰 Creating payment link for amount:", amountToPay);

    // ✅ Create Razorpay link
    let paymentLink;
    try {
      const paymentLinkData = {
        amount: Math.round(amountToPay * 100), // convert to paise
        currency: "INR",
        description: `Balance Payment of ₹${amountToPay} for ${customer.name}`,
        customer: {
          name: customer.name,
          email: customer.email || "customer@example.com",
          // ensure only digits, no +91 or spaces
          contact: String(customer.phoneNumber).replace(/\D/g, "").slice(-10),
        },
        reference_id: `balpay_${customerId}_${Date.now()}`, // unique ref
        callback_url: `${process.env.BASE_URL}/api/payment/verifyPayment?customerId=${customerId}`,
        callback_method: "get",
      };

      console.log("🔗 Payment link data:", JSON.stringify(paymentLinkData, null, 2));
      
      paymentLink = await razorpay.paymentLink.create(paymentLinkData);
      
      console.log("✅ Payment link created successfully:", paymentLink.id);
      
    } catch (error) {
      console.error("❌ Razorpay error details:", {
        message: error.message,
        response: error.response?.body,
        stack: error.stack
      });
      
      // Provide more specific error messages
      let errorMessage = "Failed to create Razorpay link for balance";
      if (error.response?.body?.error?.description) {
        errorMessage = `Razorpay error: ${error.response.body.error.description}`;
      } else if (error.message.includes("401")) {
        errorMessage = "Invalid Razorpay credentials. Please check your API keys.";
      } else if (error.message.includes("ECONNREFUSED")) {
        errorMessage = "Unable to connect to Razorpay. Please check your internet connection.";
      } else if (error.message.includes("400")) {
        errorMessage = "Invalid request data sent to Razorpay.";
      }
      
      return res.status(500).json({
        success: false,
        message: errorMessage,
        error: error.message,
        ...(process.env.NODE_ENV === 'development' && { 
          debug: {
            response: error.response?.body,
            stack: error.stack
          }
        })
      });
    }

    // ✅ Validate payment link response
    if (!paymentLink || !paymentLink.id || !paymentLink.short_url) {
      console.error("❌ Invalid payment link response:", paymentLink);
      return res.status(500).json({
        success: false,
        message: "Invalid payment link response from Razorpay",
      });
    }

    // ✅ Save Razorpay details in existing payment record
    paymentDoc.razorpayLinkId = paymentLink.id;
    paymentDoc.razorpayLinkStatus = paymentLink.status || "created";
    await paymentDoc.save();

    console.log("💾 Payment document updated successfully");

    return res.status(200).json({
      success: true,
      message: "Balance payment link generated successfully",
      balance: balanceAmount,
      amountToPay: amountToPay,
      paymentUrl: paymentLink.short_url,
      payment: paymentDoc,
    });
  } catch (error) {
    console.error("❌ makePaymentForBalance Error:", {
      message: error.message,
      stack: error.stack,
      customerId: req.params.customerId
    });
    
    return res.status(500).json({
      success: false,
      message: "Error generating balance payment link",
      error: error.message,
    });
  }
};


//✅ Get All Payments whose paymnetStatus is Paid
const getAllPartiallyPaid = async (req, res) => {
  try {
    let { page = 1, limit = 10, sortOrder = "", search = "" } = req.query;

    page = parseInt(page);
    limit = parseInt(limit);

    // ---- Base Filter ----
    const filter = { paymentStatus: "Partially Paid" };

    // ---- Search Filter ----
    if (search) {
      filter.$or = [
        { "customer.fullName": { $regex: search, $options: "i" } },
        { "customer.phoneNumber": { $regex: search, $options: "i" } },
        { "orders.products.productName": { $regex: search, $options: "i" } },
        { "orders.products.productSize": { $regex: search, $options: "i" } },
      ];
    }

    // ---- Sorting ----
    let sort = {};
    if (sortOrder) {
      sort[sortOrder] = sortOrder === "asc" ? 1 : -1;
    } else {
      sort = { createdAt: -1 };
    }

    // ---- Aggregation ----
    const pipeline = [
      { $match: { paymentStatus: "Partially Paid" } },

      // Join Customer
      {
        $lookup: {
          from: "customers",
          localField: "customer",
          foreignField: "_id",
          as: "customer",
        },
      },
      { $unwind: "$customer" },

      // Join Orders
      {
        $lookup: {
          from: "customerorders",
          localField: "customer._id",
          foreignField: "customer",
          as: "orders",
        },
      },

      // Flatten Orders
      { $unwind: "$orders" },
      { $unwind: "$orders.products" },

      // Project Required Fields
      {
        $project: {
          _id: 1,
          customerName: "$customer.name",
          phoneNumber: "$customer.phoneNumber",
          productName: "$orders.products.productName",
          size: "$orders.products.productSize",
          paymentStatus: 1,
          createdAt: {
            $dateToString: {
              format: "%d/%m/%Y",
              date: "$createdAt",
            },
          },
        },
      },

      // Search filter
      ...(search
        ? [
            {
              $match: {
                $or: [
                  { customerName: { $regex: search, $options: "i" } },
                  { phoneNumber: { $regex: search, $options: "i" } },
                  { productName: { $regex: search, $options: "i" } },
                  { size: { $regex: search, $options: "i" } },
                ],
              },
            },
          ]
        : []),

      // Sort
      { $sort: sort },

      // Pagination
      { $skip: (page - 1) * limit },
      { $limit: limit },
    ];

    // ---- Execute Query ----
    const results = await Payment.aggregate(pipeline);

    // ---- Count Total ----
    const countPipeline = pipeline.filter(
      (stage) => !("$skip" in stage) && !("$limit" in stage) && !("$sort" in stage)
    );
    countPipeline.push({ $count: "total" });

    const totalCountResult = await Payment.aggregate(countPipeline);
    const totalRecords = totalCountResult.length > 0 ? totalCountResult[0].total : 0;

    const totalPages = Math.ceil(totalRecords / limit);
    const hasPrevious = page > 1;
    const hasNext = page < totalPages;

    return res.status(200).json({
      success: true,
      message: "Partially Paid Records Fetched Successfully",
      totalRecords,
      totalPages,
      currentPage: page,
      previous: hasPrevious,
      next: hasNext,
      data: results,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: "Failed To Fetch Partially Paid Records",
      error: error.message,
    });
  }
};




module.exports = {
  createPaymentForCustomer,
  verifyPayment,
  makePaymentForBalance,
  getAllPartiallyPaid,
};