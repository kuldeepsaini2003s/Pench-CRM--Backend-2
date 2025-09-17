const Customer = require("../models/customerModel");
const CustomerOrders = require("../models/customerOrderModel"); // daily orders
const Payment = require("../models/paymentModel");
const Invoice = require("../models/customerInvoicesModel");
const Razorpay = require("razorpay");
const { formatDateToDDMMYYYY } = require("../utils/parsedDateAndDay");
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// ✅ Create Payment for Customer
const createPaymentForCustomer = async (req, res) => {
  try {
    const { customerId } = req.params;
    const { wantToPay, paymentMethod, paidAmount } = req.body;

    // 🔍 Find customer
    const customer = await Customer.findById(customerId);
    if (!customer) {
      return res
        .status(404)
        .json({ success: false, message: "Customer not found" });
    }

    if (!wantToPay) {
      return res.status(400).json({
        success: false,
        message: "wantToPay must be true to create a payment",
      });
    }

    if (!paymentMethod || !["Online", "COD"].includes(paymentMethod)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid paymentMethod" });
    }

    if (!paidAmount || paidAmount <= 0) {
      return res
        .status(400)
        .json({ success: false, message: "Provide a valid paidAmount" });
    }

    // ✅ Fetch all delivered orders (oldest first)
    const allOrders = await CustomerOrders.find({
      customer: customerId,
      status: "Delivered",
    }).sort({ createdAt: 1 });
    const totalAmount = allOrders.reduce(
      (sum, order) => sum + (order.totalAmount || 0),
      0
    );

    if (paidAmount > totalAmount) {
      return res.status(400).json({
        success: false,
        message: `Paid amount cannot exceed total amount (${totalAmount})`,
      });
    }

    let paymentDocData = {
      customer: customerId,
      totalAmount,
      paidAmount: 0,
      balanceAmount: totalAmount,
      carryForwardBalance: 0,
      paidDates: [formatDateToDDMMYYYY(new Date())],
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
        return res.status(500).json({
          success: false,
          message: "Failed to create Razorpay link",
          error: err.message,
        });
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
        paymentDocData.balanceAmount === 0
          ? "Paid"
          : paymentDocData.paidAmount > 0
          ? "Partially Paid"
          : "Unpaid";
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
    customer.paymentStatus =
      customer.amountPaidTillDate < totalAmount ? "Partially Paid" : "Paid";
    await customer.save();

    res.status(200).json({
      success: true,
      message: "Payment recorded successfully",
      payment: paymentObj,
      ...(paymentMethod === "Online" && {
        paymentUrl: paymentDoc.razorpayLinkUrl,
      }), // ✅ clickable link
    });
  } catch (error) {
    console.error("createPaymentForCustomer Error:", error);
    res.status(500).json({
      success: false,
      message: "Error creating payment",
      error: error.message,
    });
  }
};

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
    const allOrders = await CustomerOrders.find({
      customer: customerId,
      status: "Delivered",
    }).sort({ createdAt: 1 });

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
      customer.paymentStatus =
        customer.amountDue > 0 ? "Partially Paid" : "Paid";
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
const makePaymentForBalance = async (req, res) => {
  try {
    const { customerId } = req.params;
    const { payAmount } = req.body;

    // 🔍 Validate Razorpay credentials & BASE_URL
    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
      return res.status(500).json({
        success: false,
        message:
          "Razorpay configuration missing. Please check environment variables.",
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
      paymentStatus: { $in: ["Unpaid", "Partially Paid"] },
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

//✅ Get All Payments by Payment Status
const getAllPaymentsByStatus = async (req, res) => {
  try {
    let {
      page = 1,
      limit = 10,
      paymentStatus = "All",
      paymentMode = "All",
      productName = "",
      productSize = "",
      from = "",
      to = "",
    } = req.query;

    page = parseInt(page);
    limit = parseInt(limit);

    // Validate paymentStatus
    const validStatuses = ["All", "Paid", "Partially Paid"];
    if (!validStatuses.includes(paymentStatus)) {
      return res.status(400).json({
        success: false,
        message: "Invalid paymentStatus. Use: All, Paid, and Partially Paid",
      });
    }

    // Validate paymentMode
    const validModes = ["All", "COD", "Online"];
    if (!validModes.includes(paymentMode)) {
      return res.status(400).json({
        success: false,
        message: "Invalid paymentMode. Use: All, COD, or Online",
      });
    }

    // Base Filter - Only fetch Paid and Partially Paid payments
    const filter = {
      paymentStatus: { $in: ["Paid", "Partially Paid"] },
    };
    if (paymentStatus !== "All") {
      filter.paymentStatus = paymentStatus;
    }
    if (paymentMode !== "All") {
      filter.paymentMethod = paymentMode;
    }

    // Date filter - Filter by paidDates field (DD/MM/YYYY string format)
    if (from || to) {
      const fromDate = new Date(from);
      const toDate = new Date(to);

      // Generate all dates in the range
      const generateDateRange = (start, end) => {
        const dates = [];
        const current = new Date(start);
        const endDate = new Date(end);

        while (current <= endDate) {
          dates.push(formatDateToDDMMYYYY(current));
          current.setDate(current.getDate() + 1);
        }
        return dates;
      };

      if (from && to) {
        // Both from and to provided - generate date range
        const dateRange = generateDateRange(fromDate, toDate);
        filter.paidDates = { $in: dateRange };
      } else if (from) {
        // Only from provided - generate dates from fromDate to today
        const today = new Date();
        const dateRange = generateDateRange(fromDate, today);
        filter.paidDates = { $in: dateRange };
      } else if (to) {
        // Only to provided - generate dates from beginning to toDate
        const beginning = new Date("2020-01-01"); // Start from a reasonable date
        const dateRange = generateDateRange(beginning, toDate);
        filter.paidDates = { $in: dateRange };
      }
    }

    // Aggregation Pipeline
    const pipeline = [
      { $match: filter },
      {
        $lookup: {
          from: "customers",
          localField: "customer",
          foreignField: "_id",
          as: "customer",
        },
      },
      { $unwind: "$customer" },
      {
        $lookup: {
          from: "products",
          localField: "customer.products.product",
          foreignField: "_id",
          as: "productDetails",
        },
      },
      { $unwind: "$customer.products" },
      {
        $lookup: {
          from: "products",
          localField: "customer.products.product",
          foreignField: "_id",
          as: "productInfo",
        },
      },
      { $unwind: "$productInfo" },
      {
        $group: {
          _id: "$_id",
          customerName: { $first: "$customer.name" },
          phoneNumber: { $first: "$customer.phoneNumber" },
          productNames: { $push: "$productInfo.productName" },
          productSizes: { $push: "$customer.products.productSize" },
          paymentStatus: { $first: "$paymentStatus" },
          paymentMethod: { $first: "$paymentMethod" },
          createdAt: { $first: "$createdAt" },
        },
      },
      // Apply product filters after grouping
      ...(productName || productSize
        ? [
            {
              $match: {
                ...(productName && {
                  productNames: { $regex: productName, $options: "i" },
                }),
                ...(productSize && {
                  productSizes: { $regex: productSize, $options: "i" },
                }),
              },
            },
          ]
        : []),
      {
        $project: {
          _id: 0,
          customerName: 1,
          phoneNumber: 1,
          productName: {
            $reduce: {
              input: "$productNames",
              initialValue: "",
              in: {
                $cond: [
                  { $eq: ["$$value", ""] },
                  "$$this",
                  { $concat: ["$$value", ", ", "$$this"] },
                ],
              },
            },
          },
          productSize: {
            $reduce: {
              input: "$productSizes",
              initialValue: "",
              in: {
                $cond: [
                  { $eq: ["$$value", ""] },
                  "$$this",
                  { $concat: ["$$value", ", ", "$$this"] },
                ],
              },
            },
          },
          date: {
            $dateToString: {
              format: "%d/%m/%Y",
              date: "$createdAt",
            },
          },
          paymentMode: "$paymentMethod",
          status: "$paymentStatus",
        },
      },
      { $skip: (page - 1) * limit },
      { $limit: limit },
    ];

    // Count Pipeline
    const countPipeline = [
      { $match: filter },
      {
        $lookup: {
          from: "customers",
          localField: "customer",
          foreignField: "_id",
          as: "customer",
        },
      },
      { $unwind: "$customer" },
      {
        $lookup: {
          from: "products",
          localField: "customer.products.product",
          foreignField: "_id",
          as: "productDetails",
        },
      },
      { $unwind: "$customer.products" },
      {
        $lookup: {
          from: "products",
          localField: "customer.products.product",
          foreignField: "_id",
          as: "productInfo",
        },
      },
      { $unwind: "$productInfo" },
      {
        $group: {
          _id: "$_id",
          productNames: { $push: "$productInfo.productName" },
          productSizes: { $push: "$customer.products.productSize" },
        },
      },
      // Apply product filters after grouping
      ...(productName || productSize
        ? [
            {
              $match: {
                ...(productName && {
                  productNames: { $regex: productName, $options: "i" },
                }),
                ...(productSize && {
                  productSizes: { $regex: productSize, $options: "i" },
                }),
              },
            },
          ]
        : []),
      { $count: "total" },
    ];

    // Get counts for partially paid and paid
    const countPartiallyPaid = await Payment.countDocuments({
      paymentStatus: "Partially Paid",
    });

    const countPaid = await Payment.countDocuments({ paymentStatus: "Paid" });

    const [results, countResult] = await Promise.all([
      Payment.aggregate(pipeline),
      Payment.aggregate(countPipeline),
    ]);

    const totalRecords = countResult.length > 0 ? countResult[0].total : 0;
    const totalPages = Math.ceil(totalRecords / limit);

    return res.status(200).json({
      success: true,
      message: `Payments fetched successfully`,
      partiallyPaid: countPartiallyPaid,
      paid: countPaid,
      totalPages,
      currentPage: page,
      previous: page > 1,
      next: page < totalPages,
      data: results,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: "Failed To Fetch Payments",
      error: error.message,
    });
  }
};

module.exports = {
  createPaymentForCustomer,
  verifyPayment,
  makePaymentForBalance,
  getAllPaymentsByStatus,
};
