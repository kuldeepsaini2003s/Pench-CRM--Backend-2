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
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

// Create automatic orders for a customer based on their subscription plan and delivery date
const createAutomaticOrdersForCustomer = async (
  customerId,
  deliveryBoyId,
  deliveryDate = null
) => {
  try {
    const customer = await Customer.findById(customerId).populate(
      "products.product"
    );

    if (!customer || !customer.products || customer.products.length === 0) {
      return { success: false, message: "No products found for customer" };
    }

    const orderDeliveryDate = deliveryDate || customer.startDate;

    const ordersCreated = [];

    let shouldDeliver = false;

    if (
      customer.subscriptionPlan === "Monthly" ||
      customer.subscriptionPlan === "Alternate Days"
    ) {
      shouldDeliver = true;
    } else if (customer.subscriptionPlan === "Custom Date") {
      shouldDeliver =
        customer.customDeliveryDates &&
        customer.customDeliveryDates.includes(orderDeliveryDate);
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
        deliveryDate: orderDeliveryDate,
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
      message: `Created ${ordersCreated.length} automatic orders for delivery date: ${orderDeliveryDate}`,
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

    // Check if orders already exist for today and tomorrow
    const alreadyCreatedToday = await CustomerOrders.findOne({
      deliveryDate: today,
    });

    const alreadyCreatedTomorrow = await CustomerOrders.findOne({
      deliveryDate: tomorrow,
    });

    if (alreadyCreatedToday && alreadyCreatedTomorrow) {
      console.log(`Orders for both ${today} and ${tomorrow} already exist`);
      return;
    }

    const activeCustomers = await Customer.find({
      subscriptionStatus: "active",
      isDeleted: false,
    })
      .populate("products.product")
      .populate("deliveryBoy");

    if (activeCustomers.length === 0) {
      console.log("No active customers found for order creation.");
      return;
    }

    let ordersCreatedToday = 0;
    let ordersCreatedTomorrow = 0;

    for (const customer of activeCustomers) {
      if (!customer.deliveryBoy || customer.deliveryBoy.isDeleted) {
        console.log(`Customer ${customer.name} has no active delivery boy`);
        continue;
      }

      const isWithinSubscriptionPeriod =
        moment(customer.startDate, "DD/MM/YYYY").isSameOrBefore(
          moment(today, "DD/MM/YYYY")
        ) &&
        moment(customer.endDate, "DD/MM/YYYY").isSameOrAfter(
          moment(today, "DD/MM/YYYY")
        );

      if (!isWithinSubscriptionPeriod) {
        continue;
      }

      // Create orders for today if not already created
      if (!alreadyCreatedToday) {
        const shouldCreateToday = await shouldCreateOrderForCustomer(
          customer,
          today
        );
        if (shouldCreateToday) {
          const result = await createAutomaticOrdersForCustomer(
            customer._id,
            customer.deliveryBoy._id,
            today
          );
          if (result.success && result.orders.length > 0) {
            ordersCreatedToday++;
            console.log(
              `Order created for customer ${customer.name} (Delivery Boy: ${customer.deliveryBoy.name}) for ${today}`
            );
          }
        }
      }

      // Create orders for tomorrow if not already created
      if (!alreadyCreatedTomorrow) {
        const shouldCreateTomorrow = await shouldCreateOrderForCustomer(
          customer,
          tomorrow
        );
        if (shouldCreateTomorrow) {
          const result = await createAutomaticOrdersForCustomer(
            customer._id,
            customer.deliveryBoy._id,
            tomorrow
          );
          if (result.success && result.orders.length > 0) {
            ordersCreatedTomorrow++;
            console.log(
              `Order created for customer ${customer.name} (Delivery Boy: ${customer.deliveryBoy.name}) for ${tomorrow}`
            );
          }
        }
      }
    }

    console.log(
      `Orders initialization completed! Created ${ordersCreatedToday} orders for today and ${ordersCreatedTomorrow} orders for tomorrow.`
    );
  } catch (error) {
    console.error("Error in initializing orders:", error.message);
  }
};

// function to check if an order should be created for a customer on a specific date
const shouldCreateOrderForCustomer = async (customer, date) => {
  // Check if the customer is not absent on this date
  const isNotAbsent = !customer.absentDays?.includes(date);
  if (!isNotAbsent) {
    return false;
  }

  // Check subscription plan specific logic
  switch (customer.subscriptionPlan) {
    case "Monthly":
      return true;

    case "Alternate Days":
      const startDate = moment(customer.startDate, "DD/MM/YYYY");
      const currentDate = moment(date, "DD/MM/YYYY");
      const daysDifference = currentDate.diff(startDate, "days");
      return daysDifference % 2 === 0;

    case "Custom Date":
      return customer.customDeliveryDates?.includes(date) || false;

    default:
      return false;
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

    if (bottleReturnSize) order.bottleReturnSize = bottleReturnSize;

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
          console.error(
            "❌ Razorpay error in updateOrderStatus:",
            error.response?.body || error
          );
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

//✅ Verify Payment
const verifyPayment = async (req, res) => {
  try {
    const { razorpay_payment_id, razorpay_payment_link_id, razorpay_payment_link_status } =
      req.query;
    // Razorpay sends these params to callback_url

    if (!razorpay_payment_id || !razorpay_payment_link_id) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment verification request",
      });
    }

    // ✅ Find order by Razorpay Link ID
    const order = await CustomerOrders.findOne({
      razorpayLinkId: razorpay_payment_link_id,
    });
    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found for this payment",
      });
    }

    // ✅ Update order payment details
    order.razorpayPaymentId = razorpay_payment_id;
    order.razorpayLinkStatus = razorpay_payment_link_status || "paid";
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
  createAdditionalOrder,
  initializeOrders,
  updateOrderStatus,
  verifyPayment,
};
