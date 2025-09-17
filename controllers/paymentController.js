const Customer = require("../models/customerModel");
const CustomerOrders = require("../models/customerOrderModel"); // daily orders
const Payment = require("../models/paymentModel");
const Invoice = require("../models/customerInvoicesModel");
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

    // ✅ Fetch all delivered orders (oldest first)
    const allOrders = await CustomerOrders.find({ customer: customerId, status: "Delivered" }).sort({ createdAt: 1 });
    const totalAmount = allOrders.reduce((sum, order) => sum + (order.totalAmount || 0), 0);

    if (paidAmount > totalAmount) {
      return res.status(400).json({ success: false, message: `Paid amount cannot exceed total amount (${totalAmount})` });
    }

    let paymentDocData = {
      customer: customerId,
      totalAmount,
      paidAmount: 0,
      balanceAmount: totalAmount,
      carryForwardBalance: 0,
      paidDates: [new Date()],
      paymentMethod,
      paymentStatus: "Unpaid",
    };

    // ✅ Online payment: generate Razorpay link
    if (paymentMethod === "Online") {
      try {
        const paymentLink = await razorpay.paymentLink.create({
          amount: Math.round(paidAmount * 100), // paise me bhejna hai
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
        paymentDocData.razorpayLinkUrl = paymentLink.short_url; // ✅ actual clickable link
       
      } catch (err) {
        console.error("Razorpay error:", err);
        return res.status(500).json({ success: false, message: "Failed to create Razorpay link", error: err.message });
      }
    }

    // ✅ COD / confirmed payment: allocate paidAmount to orders
    if (paymentMethod === "COD") {
      let remainingAmount = paidAmount;

      for (const order of allOrders) {
        if (remainingAmount <= 0) break;

        if (remainingAmount >= order.totalAmount) {
          // Full payment for this order
          await CustomerOrders.findByIdAndUpdate(order._id, {
            $set: {
              paymentStatus: "Paid",
              paymentMethod,
              paidAmount: order.totalAmount,
            },
          });
          remainingAmount -= order.totalAmount;
          paymentDocData.paidAmount += order.totalAmount;
        } else {
          // Partial payment for this order
          await CustomerOrders.findByIdAndUpdate(order._id, {
            $set: {
              paymentStatus: "Partially Paid",
              paymentMethod,
              paidAmount: remainingAmount,
            },
          });
          paymentDocData.paidAmount += remainingAmount;
          paymentDocData.carryForwardBalance = remainingAmount; // ✅ remainder tracked
          remainingAmount = 0;
        }
      }

      paymentDocData.balanceAmount = totalAmount - paymentDocData.paidAmount;
      paymentDocData.paymentStatus =
        paymentDocData.balanceAmount === 0 ? "Paid" : paymentDocData.paidAmount > 0 ? "Partially Paid" : "Unpaid";
    }

    // ✅ Save Payment doc
    const paymentDoc = new Payment(paymentDocData);
    await paymentDoc.save();

    // ✅ Convert to plain object & hide razorpayLinkUrl inside `payment`
    const paymentObj = paymentDoc.toObject();
    delete paymentObj.razorpayLinkUrl;

    // ✅ Update Customer
    customer.amountPaidTillDate += paymentDoc.paidAmount;
    customer.amountDue = totalAmount - customer.amountPaidTillDate;
    customer.paymentStatus = customer.amountPaidTillDate < totalAmount ? "Partially Paid" : "Paid";
    await customer.save();

    res.status(200).json({
      success: true,
      message: "Payment recorded successfully",
      payment: paymentObj,
      ...(paymentMethod === "Online" && { paymentUrl: paymentDoc.razorpayLinkUrl }), // ✅ clickable link
    });
  } catch (error) {
    console.error("createPaymentForCustomer Error:", error);
    res.status(500).json({ success: false, message: "Error creating payment", error: error.message });
  }
};




// ✅ Verify Payment
// const verifyPayment = async (req, res) => {
//   try {
//     const {
//       razorpay_payment_id,
//       razorpay_payment_link_id,
//       razorpay_payment_link_status,
//       customerId, // from query string
//     } = req.query;

//     if (!razorpay_payment_id || !razorpay_payment_link_id || !customerId) {
//       return res.status(400).json({
//         success: false,
//         message: "Invalid payment verification request",
//       });
//     }

//     // 🔍 Find payment record by link ID
//     const paymentDoc = await Payment.findOne({
//       customer: customerId,
//       razorpayLinkId: razorpay_payment_link_id,
//     });

//     if (!paymentDoc) {
//       return res.status(404).json({
//         success: false,
//         message: "Payment record not found for this link",
//       });
//     }

//     // ✅ Fetch payment details from Razorpay
//     const payment = await razorpay.payments.fetch(razorpay_payment_id);
//     const paidAmount = payment.amount / 100; // paise → INR

//     if (!paidAmount || paidAmount <= 0) {
//       return res.status(400).json({
//         success: false,
//         message: "Invalid payment amount",
//       });
//     }

//     // ✅ Update Payment model
//     paymentDoc.paidAmount += paidAmount;
//     paymentDoc.balanceAmount = paymentDoc.totalAmount - paymentDoc.paidAmount;
//     paymentDoc.razorpayPaymentId = razorpay_payment_id;               // 🔥 store payment id
//     paymentDoc.razorpayLinkStatus = razorpay_payment_link_status;     // 🔥 update link status

//     if (paymentDoc.paidAmount < paymentDoc.totalAmount) {
//       paymentDoc.paymentStatus = "Partially Paid";
//     } else {
//       paymentDoc.paymentStatus = "Paid";
//       paymentDoc.balanceAmount = 0;
//     }
//     await paymentDoc.save();

//     // ✅ Update Customer model
//     const customer = await Customer.findById(customerId);
//     if (customer) {
//       customer.amountPaidTillDate = paymentDoc.paidAmount;
//       customer.amountDue = paymentDoc.balanceAmount;
//       customer.paymentStatus = paymentDoc.paymentStatus;
//       await customer.save();
//     }

//     // ✅ Update all Delivered CustomerOrders
//     await CustomerOrders.updateMany(
//       { customer: customerId, status: "Delivered" },
//       {
//         $set: {
//           paymentStatus: paymentDoc.paymentStatus,
//           paymentMethod: paymentDoc.paymentMethod || "Online",
//         },
//       }
//     );

//     return res.status(200).json({
//       success: true,
//       message: "Payment verified successfully",
//       paymentDetails: {
//         paidAmount,
//         totalPaid: paymentDoc.paidAmount,
//         balance: paymentDoc.balanceAmount,
//         status: paymentDoc.paymentStatus,
//       },
//       payment: paymentDoc,
//     });
//   } catch (error) {
//     console.error("verifyPayment Error:", error);
//     return res.status(500).json({
//       success: false,
//       message: "Error verifying payment",
//       error: error.message,
//     });
//   }
// };

// ✅ New Verify Payment Code
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

    // ✅ Allocate paidAmount to orders (oldest first)
    const allOrders = await CustomerOrders.find({ customer: customerId, status: "Delivered" }).sort({ createdAt: 1 });

    let remainingAmount = paidAmount;
    let totalPaidNow = 0;

    for (const order of allOrders) {
      if (remainingAmount <= 0) break;

      if (remainingAmount >= order.totalAmount) {
        // Full payment for this order
        await CustomerOrders.findByIdAndUpdate(order._id, {
          $set: {
            paymentStatus: "Paid",
            paymentMethod: "Online",
            paidAmount: order.totalAmount,
          },
        });
        remainingAmount -= order.totalAmount;
        totalPaidNow += order.totalAmount;
      } else {
        // Partial payment for this order
        await CustomerOrders.findByIdAndUpdate(order._id, {
          $set: {
            paymentStatus: "Partially Paid",
            paymentMethod: "Online",
            paidAmount: remainingAmount,
          },
        });
        totalPaidNow += remainingAmount;
        remainingAmount = 0;
      }
    }

    // ✅ Update Payment document
    paymentDoc.paidAmount += totalPaidNow;
    paymentDoc.balanceAmount = paymentDoc.totalAmount - paymentDoc.paidAmount;
    paymentDoc.razorpayPaymentId = razorpay_payment_id;
    paymentDoc.razorpayLinkStatus = razorpay_payment_link_status;

    if (paymentDoc.paidAmount < paymentDoc.totalAmount) {
      paymentDoc.paymentStatus = "Partially Paid";
    } else {
      paymentDoc.paymentStatus = "Paid";
      paymentDoc.balanceAmount = 0;
    }
    await paymentDoc.save();

    // ✅ Update Customer document
    const customer = await Customer.findById(customerId);
    if (customer) {
      customer.amountPaidTillDate += totalPaidNow; // 🔥 increment not overwrite
      customer.amountDue = paymentDoc.totalAmount - customer.amountPaidTillDate;
      customer.paymentStatus = customer.amountDue > 0 ? "Partially Paid" : "Paid";
      await customer.save();
    }

    return res.status(200).json({
      success: true,
      message: "Payment verified successfully",
      paymentDetails: {
        paidAmount: totalPaidNow,
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
// const makePaymentForBalance = async (req, res) => {
//   try {
//     const { customerId } = req.params;

//     // 🔍 Validate Razorpay credentials & BASE_URL
//     if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
//       return res.status(500).json({
//         success: false,
//         message: "Razorpay configuration missing. Please check environment variables.",
//       });
//     }
//     if (!process.env.BASE_URL) {
//       return res.status(500).json({
//         success: false,
//         message: "BASE_URL environment variable is not configured.",
//       });
//     }

//     // 🔍 Find existing unpaid/partial payment record
//     const paymentDoc = await Payment.findOne({
//       customer: customerId,
//       paymentStatus: { $in: ["Unpaid", "Partially Paid"] }
//     }).populate("customer");

//     if (!paymentDoc) {
//       return res.status(404).json({
//         success: false,
//         message: "No pending balance found for this customer",
//       });
//     }

//     const customer = paymentDoc.customer;
//     const balanceAmount = paymentDoc.balanceAmount;

//     if (!balanceAmount || balanceAmount <= 0) {
//       return res.status(400).json({
//         success: false,
//         message: "No balance left to pay. Already settled.",
//       });
//     }

//     if (!customer || !customer.name || !customer.phoneNumber) {
//       return res.status(400).json({
//         success: false,
//         message: "Customer data is incomplete or missing.",
//       });
//     }

//     // ✅ Razorpay per-link max = 10,00,000 INR
//     const MAX_LIMIT = 1000000;
//     const amountToPay = balanceAmount > MAX_LIMIT ? MAX_LIMIT : balanceAmount;

//     // 🔑 Create a short unique reference_id (max 40 chars)
//     const shortId = Math.random().toString(36).substring(2, 10); // 8-char random string
//     const referenceId = `balpay_${shortId}`;

//     // ✅ Create Razorpay link
//     let paymentLink;
//     try {
//       paymentLink = await razorpay.paymentLink.create({
//         amount: Math.round(amountToPay * 100), // in paise
//         currency: "INR",
//         description: `Balance Payment of ₹${amountToPay} for ${customer.name}`,
//         customer: {
//           name: customer.name,
//           email: customer.email || "customer@example.com",
//           contact: String(customer.phoneNumber).replace(/\D/g, "").slice(-10),
//         },
//         reference_id: referenceId,
//         callback_url: `${process.env.BASE_URL}/api/payment/verifyPayment?customerId=${customerId}`,
//         callback_method: "get",
//       });
//     } catch (error) {
//       console.error("Razorpay error:", error);
//       return res.status(500).json({
//         success: false,
//         message: "Failed to create Razorpay link for balance",
//         error: error.message,
//       });
//     }

//     if (!paymentLink || !paymentLink.id || !paymentLink.short_url) {
//       return res.status(500).json({
//         success: false,
//         message: "Invalid payment link response from Razorpay",
//       });
//     }

//     // ✅ Update Payment record
//     paymentDoc.razorpayLinkId = paymentLink.id;
//     paymentDoc.razorpayLinkStatus = paymentLink.status || "created";
//     paymentDoc.razorpayLinkUrl = paymentLink.short_url;
//     paymentDoc.paidDates.push(new Date()); // 🆕 Track when new link generated
//     await paymentDoc.save();

//     // ✅ Convert to object & hide razorpayLinkUrl inside payment
//     const paymentObj = paymentDoc.toObject();
//     delete paymentObj.razorpayLinkUrl;

//     return res.status(200).json({
//       success: true,
//       message: "Balance payment link generated successfully",
//       balance: balanceAmount,
//       amountToPay,
//       payment: paymentObj,
//       paymentUrl: paymentLink.short_url, // ✅ Only expose here
//     });
//   } catch (error) {
//     console.error("makePaymentForBalance Error:", error);
//     return res.status(500).json({
//       success: false,
//       message: "Error generating balance payment link",
//       error: error.message,
//     });
//   }
// };

const makePaymentForBalance = async (req, res) => {
  try {
    const { customerId } = req.params;
    const { payAmount } = req.body; 

    // 🔍 Validate Razorpay credentials & BASE_URL
    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
      return res.status(500).json({
        success: false,
        message: "Razorpay configuration missing. Please check environment variables.",
      });
    }
    if (!process.env.BASE_URL) {
      return res.status(500).json({
        success: false,
        message: "BASE_URL environment variable is not configured.",
      });
    }

    // 🔍 Find existing unpaid/partial payment record
    const paymentDoc = await Payment.findOne({
      customer: customerId,
      paymentStatus: { $in: ["Unpaid", "Partially Paid"] }
    }).populate("customer");

    if (!paymentDoc) {
      return res.status(404).json({
        success: false,
        message: "No pending balance found for this customer",
      });
    }

    const customer = paymentDoc.customer;
    const balanceAmount = paymentDoc.balanceAmount;

    if (!balanceAmount || balanceAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: "No balance left to pay. Already settled.",
      });
    }

    if (!customer || !customer.name || !customer.phoneNumber) {
      return res.status(400).json({
        success: false,
        message: "Customer data is incomplete or missing.",
      });
    }

    // 🔑 Validate payAmount
    if (!payAmount || typeof payAmount !== "number" || payAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid payAmount provided in request body.",
      });
    }

    if (payAmount > balanceAmount) {
      return res.status(400).json({
        success: false,
        message: `payAmount cannot be greater than remaining balance (${balanceAmount}).`,
      });
    }

    // ✅ Razorpay per-link max = 10,00,000 INR
    const MAX_LIMIT = 1000000;
    const amountToPay = payAmount > MAX_LIMIT ? MAX_LIMIT : payAmount;

    // 🔑 Create a short unique reference_id (max 40 chars)
    const shortId = Math.random().toString(36).substring(2, 10); // 8-char random string
    const referenceId = `balpay_${shortId}`;

    // ✅ Create Razorpay link
    let paymentLink;
    try {
      paymentLink = await razorpay.paymentLink.create({
        amount: Math.round(amountToPay * 100), // in paise
        currency: "INR",
        description: `Payment of ₹${amountToPay} for ${customer.name}`,
        customer: {
          name: customer.name,
          email: customer.email || "customer@example.com",
          contact: String(customer.phoneNumber).replace(/\D/g, "").slice(-10),
        },
        reference_id: referenceId,
        callback_url: `${process.env.BASE_URL}/api/payment/verifyPayment?customerId=${customerId}`,
        callback_method: "get",
      });
    } catch (error) {
      console.error("Razorpay error:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to create Razorpay link for balance",
        error: error.message,
      });
    }

    if (!paymentLink || !paymentLink.id || !paymentLink.short_url) {
      return res.status(500).json({
        success: false,
        message: "Invalid payment link response from Razorpay",
      });
    }

    // ✅ Update Payment record
    paymentDoc.razorpayLinkId = paymentLink.id;
    paymentDoc.razorpayLinkStatus = paymentLink.status || "created";
    paymentDoc.razorpayLinkUrl = paymentLink.short_url;
    paymentDoc.paidDates.push(new Date()); // 🆕 Track when new link generated
    await paymentDoc.save();

    // ✅ Convert to object & hide razorpayLinkUrl inside payment
    const paymentObj = paymentDoc.toObject();
    delete paymentObj.razorpayLinkUrl;

    return res.status(200).json({
      success: true,
      message: "Payment link generated successfully",
      balance: balanceAmount,
      amountToPay,
      payment: paymentObj,
      paymentUrl: paymentLink.short_url, // ✅ Only expose here
    });
  } catch (error) {
    console.error("makePaymentForBalance Error:", error);
    return res.status(500).json({
      success: false,
      message: "Error generating payment link",
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