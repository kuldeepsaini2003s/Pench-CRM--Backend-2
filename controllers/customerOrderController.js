const CustomerOrders = require("../models/customerOrderModel");
const Customer = require("../models/customerModel");
const { generateOrderNumber } = require("../utils/generateOrderNumber");
const mongoose = require("mongoose");
const Product = require("../models/productModel");
const DeliveryBoy = require("../models/deliveryBoyModel");
const moment = require("moment");
const Razorpay = require("razorpay");

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// ✅ Create automatic orders for a customer based on their subscription plan and start date
const createAutomaticOrdersForCustomer = async (customerId, deliveryBoyId) => {
  try {
    const customer = await Customer.findById(customerId).populate(
      "products.product"
    );

    if (!customer || !customer.products || customer.products.length === 0) {
      return { success: false, message: "No products found for customer" };
    }

    const deliveryDate = customer.startDate;

    const ordersCreated = [];

    let shouldDeliver = false;

    if (
      customer.subscriptionPlan === "Monthly" ||
      customer.subscriptionPlan === "Alternate Days"
    ) {
      shouldDeliver = true; // Always deliver on start date for these plans
    } else if (customer.subscriptionPlan === "Custom Date") {
      // For custom date, check if start date is in custom delivery dates
      shouldDeliver =
        customer.customDeliveryDates &&
        customer.customDeliveryDates.includes(deliveryDate);
    }

    if (shouldDeliver) {
      const orderNumber = await generateOrderNumber();
      const orderItems = [];
      let totalAmount = 0;

      // Create order items for all products
      for (const product of customer.products) {
        if (!product.product) continue;

        const itemTotalPrice = product.quantity * parseFloat(product.price);
        totalAmount += itemTotalPrice;

        orderItems.push({
          _id: product.product._id,
          productName: product.product.productName,
          price: product.price,
          productSize: product.productSize,
          quantity: product.quantity,
          totalPrice: itemTotalPrice,
        });
      }

      const order = new CustomerOrders({
        customer: customerId,
        deliveryBoy: deliveryBoyId,
        deliveryDate: deliveryDate, // Use customer's start date directly
        products: orderItems,
        orderNumber,
        totalAmount,
        status: "Pending",
      });

      await order.save();
      ordersCreated.push(order);
    }

    return {
      success: true,
      message: `Created ${ordersCreated.length} automatic orders for start date: ${deliveryDate}`,
      orders: ordersCreated,
    };
  } catch (error) {
    console.error("Error creating automatic orders:", error);
    return {
      success: false,
      message: "Error creating automatic orders",
      error: error.message,
    };
  }
};


// Function for server start
const initializeOrders = async () => {
  try {
    const today = moment().format("DD/MM/YYYY");
    const tomorrow = moment().add(1, "day").format("DD/MM/YYYY");

    //✅ Prevent duplicate orders
    const alreadyCreatedToday = await CustomerOrders.findOne({ deliveryDate: today });
    const alreadyCreatedTomorrow = await CustomerOrders.findOne({ deliveryDate: tomorrow });

    //✅ New customers → first-time orders (tomorrow delivery, run at 3 AM logic)
    if (!alreadyCreatedTomorrow) {
      const newCustomers = await Customer.find({
        subscriptionStatus: "active",
        startDate: tomorrow,
      }).populate("products.product");

      for (const customer of newCustomers) {
        const deliveryBoy = await DeliveryBoy.findOne({ isDeleted: false });
        if (!deliveryBoy) {
          console.log(`No delivery boy available for customer ${customer.name} on ${tomorrow}`);
          continue;
        }
        await createAutomaticOrdersForCustomer(customer._id, deliveryBoy._id);
        console.log(`✅ First-time order created for NEW customer ${customer.name} for ${tomorrow}`);
      }
    } else {
      console.log(`⏭️ Orders for ${tomorrow} already exist, skipping new customer order creation.`);
    }

    //✅ Existing customers → daily orders (today delivery, run at 11 AM logic)
    if (!alreadyCreatedToday) {
      const existingCustomers = await Customer.find({
        subscriptionStatus: "active",
        startDate: { $lte: today },
        endDate: { $gte: today },
      }).populate("products.product");

      for (const customer of existingCustomers) {
        const deliveryBoy = await DeliveryBoy.findOne({ isDeleted: false });
        if (!deliveryBoy) {
          console.log(`No delivery boy available for customer ${customer.name} on ${today}`);
          continue;
        }
        await createAutomaticOrdersForCustomer(customer._id, deliveryBoy._id, today);
        console.log(`✅ Daily order created for EXISTING customer ${customer.name} for ${today}`);
      }
    } else {
      console.log(`⏭️ Orders for ${today} already exist, skipping existing customer order creation.`);
    }

    console.log("🎯 Orders initialization completed!");
  } catch (error) {
    console.error("❌ Error in initializing orders:", error.message);
  }
};



const getAllOrders = async (req, res) => {
  try {
    let { page = 1, limit = 10 } = req.query;
    page = parseInt(page);
    limit = parseInt(limit);
    const skip = (page - 1) * limit;

    // ---- Filter (currently no conditions, can be extended later)
    const filter = {};

    // ---- Fetch orders with pagination ----
    const [totalOrders, orders] = await Promise.all([
      CustomerOrders.countDocuments(filter),
      CustomerOrders.find(filter)
        .select("orderNumber deliveryDate status products")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
    ]);

    // ---- Format response ----
    const formattedOrders = orders.map((order) => ({
      orderId: order._id,
      orderNumber: order.orderNumber,
      deliveryDate: order.deliveryDate,
      status: order.status,
      totalAmount: order.totalAmount,
      createdAt: order.createdAt,
      products: order.products.map((p) => ({
        productName: p.productName,
        productSize: p.productSize,
        quantity: p.quantity,
      })),
    }));

    const totalPages = Math.ceil(totalOrders / limit);

    return res.status(200).json({
      success: true,
      message: "Orders fetched successfully",
      totalOrders,
      totalPages,
      currentPage: page,
      previous: page > 1,
      next: page < totalPages,
      orders: formattedOrders,
    });
  } catch (error) {
    console.error("getAllOrders Error:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching orders",
      error: error.message,
    });
  }
};



// Get single order by ID
const getOrderById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid order ID",
      });
    }

    const order = await CustomerCustomOrder.findById(id)
      .populate("customer", "name phoneNumber address ")
      .populate("product", "productName price size")
      .populate("deliveryBoy", "name phone");

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    res.status(200).json({
      success: true,
      data: order,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching order",
      error: error.message,
    });
  }
};

// Update order
const updateOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid order ID",
      });
    }

    const updatedOrder = await CustomerCustomOrder.findByIdAndUpdate(
      id,
      updates,
      { new: true, runValidators: true }
    )
      .populate("customer", "name phoneNumber address ")
      .populate("product", "productName price size")
      .populate("deliveryBoy", "name phone");

    if (!updatedOrder) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Order updated successfully",
      data: updatedOrder,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error updating order",
      error: error.message,
    });
  }
};

// Delete order
const deleteOrder = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid order ID",
      });
    }

    const deletedOrder = await CustomerCustomOrder.findByIdAndDelete(id);

    if (!deletedOrder) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Order deleted successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error deleting order",
      error: error.message,
    });
  }
};

//✅ Get orders by customer ID
const getOrdersByCustomer = async (req, res) => {
  try {
    const { customerId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    if (!mongoose.Types.ObjectId.isValid(customerId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid customer ID",
      });
    }

    const orders = await CustomerCustomOrder.find({ customer: customerId })
      .populate("customer", "name phoneNumber address ")
      .populate("product", "productName price size")
      .populate("deliveryBoy", "name phone")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const totalOrders = await CustomerCustomOrder.countDocuments({
      customer: customerId,
    });

    res.status(200).json({
      success: true,
      data: orders,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalOrders / limit),
        totalOrders,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching customer orders",
      error: error.message,
    });
  }
};

//✅ Create Additional Order
const createAdditionalOrder = async (req, res) => {
  try {
    const { customerId } = req?.params;
    const { date, products, deliveryBoyId } = req.body;

    // Validation
    if (!customerId || !products || products.length === 0 || !deliveryBoyId) {
      return res.status(400).json({
        success: false,
        message: "Customer, products, and deliveryBoy are required",
      });
    }

    const customer = await Customer.findById(customerId);

    const deliveryBoy = await DeliveryBoy.findById(deliveryBoyId);

    if (!customer) {
      return res.status(400).json({
        success: false,
        message: "Customer not found.",
      });
    } else if (!deliveryBoy) {
      return res.status(400).json({
        success: false,
        message: "Delivery boy not found.",
      });
    }

    for (let item of products) {
      const { productName, price, productSize, quantity, totalPrice } = item;

      if (!productName || !price || !productSize || !quantity || !totalPrice) {
        return res.status(400).json({
          success: false,
          message: "All product fields are required",
        });
      }

      const productDoc = await Product.findOne({ productName: productName });

      if (!productDoc) {
        return res.status(400).json({
          success: false,
          message: `Product ${productName} not found. Please select from the available products.`,
          availableProducts: await Product.find({}, "productName"),
        });
      }

      if (productDoc.size && productDoc.size.length > 0) {
        if (!productDoc.size.includes(productSize)) {
          return res.status(400).json({
            success: false,
            message: `Product size ${productSize} is not available for ${productName}.`,
            availableSizes: productDoc.size.map((size) => size),
          });
        }
      }

      item._id = productDoc._id;
    }

    const existingOrder = await CustomerOrders.findOne({
      customer: customer._id,
      deliveryBoy: deliveryBoy._id,
      deliveryDate: date,
      status: { $in: ["Pending"] },
    });

    let savedOrder;
    let isNewOrder = false;

    if (existingOrder) {
      const newProducts = products.map((item) => {
        return { ...item, _id: item._id };
      });

      const duplicateProducts = [];

      for (const newProduct of newProducts) {
        const existingProductIndex = existingOrder.products.findIndex(
          (existingProduct) =>
            existingProduct._id.toString() === newProduct._id.toString() &&
            existingProduct.productSize === newProduct.productSize
        );

        if (existingProductIndex !== -1) {
          const existingProduct = existingOrder.products[existingProductIndex];
          duplicateProducts.push({
            productName: existingProduct.productName,
            productSize: existingProduct.productSize,
            quantity: existingProduct.quantity,
            price: existingProduct.price,
          });
        }
      }

      if (duplicateProducts.length > 0) {
        return res.status(400).json({
          success: false,
          message: "Product already ordered for this customer",
          duplicateProducts: duplicateProducts,
        });
      }

      existingOrder.products.push(...newProducts);

      existingOrder.totalAmount = existingOrder.products.reduce(
        (total, product) => total + product.totalPrice,
        0
      );

      savedOrder = await existingOrder.save();
    } else {
      // Create new order
      const newOrder = new CustomerOrders({
        customer: customer._id,
        orderNumber: await generateOrderNumber(),
        deliveryDate: date,
        products: products.map((item) => {
          return { ...item, _id: item._id };
        }),
        deliveryBoy: deliveryBoy._id,
        totalAmount: products.reduce(
          (total, product) => total + product.totalPrice,
          0
        ),
        status: "Pending",
      });

      savedOrder = await newOrder.save();
      isNewOrder = true;
    }

    const populatedOrder = await CustomerOrders.findById(savedOrder._id);

    return res.status(201).json({
      success: true,
      message: isNewOrder
        ? "New order created successfully"
        : "Products added to existing order successfully",
      data: populatedOrder,
      isNewOrder: isNewOrder,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Error creating order",
      error: error.message,
    });
  }
};

//✅ Update Order Status
const updateOrderStatus = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status, bottleReturnSize, wantToPay, paymentMethod } = req.body;

    const order = await CustomerOrders.findById(orderId).populate("customer");
    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    // ✅ Update status
    if (status) order.status = status;

    if(bottleReturnSize) order.bottleReturnSize = bottleReturnSize;
   

    // ✅ Want to pay
    if (typeof wantToPay !== "undefined") {
      order.wantToPay = wantToPay;
    }

    let paymentLink = null;

    if (paymentMethod) {
      order.paymentMethod = paymentMethod; // "Online" or "COD"
      order.paymentStatus = wantToPay ? "Pending" : "Unpaid";

      // ✅ Only generate link if Online
      if (paymentMethod === "Online" && wantToPay) {
        try {
          paymentLink = await razorpay.paymentLink.create({
            amount: Math.round(order.totalAmount * 100), // in paise
            currency: "INR",
            description: `Payment for order ${order.orderNumber} – ₹${order.totalAmount}`,
            customer: {
              name: order.customer?.name || "Customer",
              email: order.customer?.email || "test@example.com",
              contact: String(order.customer?.phoneNumber) || "9999999999",
            },
            callback_url: `${process.env.BASE_URL}/api/customOrder/verify-payment`,
            callback_method: "get",
          });

          order.razorpayLinkId = paymentLink.id;
          order.razorpayLinkStatus = "created";
        } catch (error) {
          console.error("❌ Razorpay error in updateOrderStatus:", error.response?.body || error);
          return res.status(500).json({
            success: false,
            message: "Failed to create payment link",
            error: error.message,
          });
        }
      }
    }

    await order.save();

    res.status(200).json({
      success: true,
      message: "Order updated successfully",
      order,
      ...(paymentLink && { paymentUrl: paymentLink.short_url }),
    });
  } catch (error) {
    console.error("updateOrderStatus Error:", error);
    res.status(500).json({
      success: false,
      message: "Error updating order",
      error: error.message,
    });
  }
};

const verifyPayment = async (req, res) => {
  try {
    const { razorpay_payment_id, razorpay_link_id, razorpay_link_status } = req.query; 
    // Razorpay sends these params to callback_url

    if (!razorpay_payment_id || !razorpay_link_id) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment verification request",
      });
    }

    // ✅ Find order by Razorpay Link ID
    const order = await CustomerOrders.findOne({ razorpayLinkId: razorpay_link_id });
    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found for this payment",
      });
    }

    // ✅ Update order payment details
    order.razorpayPaymentId = razorpay_payment_id;
    order.razorpayLinkStatus = razorpay_link_status || "paid";
    order.paymentStatus = "Paid";

    await order.save();

    return res.status(200).json({
      success: true,
      message: "Payment verified successfully",
      order,
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




module.exports = {
  createAutomaticOrdersForCustomer,
  getAllOrders,
  getOrderById,
  updateOrder,
  deleteOrder,
  getOrdersByCustomer,
  createAdditionalOrder,
  initializeOrders,
  updateOrderStatus,
  verifyPayment,
};
