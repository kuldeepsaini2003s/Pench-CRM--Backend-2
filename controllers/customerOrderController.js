const CustomerOrders = require("../models/customerOrderModel");
const Customer = require("../models/customerModel");
const { generateOrderNumber } = require("../utils/generateOrderNumber");
const Product = require("../models/productModel");
const DeliveryBoy = require("../models/deliveryBoyModel");
const Invoice = require("../models/customerInvoicesModel");
const { generateInvoicePDF } = require("../service/pdfService");
const { cloudinary } = require("../config/cloudinary");
const generateInvoiceNumber = require("../utils/generateInvoiceNumber");
const moment = require("moment");
const Razorpay = require("razorpay");

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

const gstNumber = process.env.GST_NUMBER;

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
    const { status, bottleReturnSize } = req.body;


    const order = await CustomerOrders.findById(orderId).populate("customer");

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    const allowedOrderStatus = ["Pending", "Delivered", "Returned"];

    if (status && !allowedOrderStatus.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid order status",
        allowedOrderStatus,
      });
    }

    const allowedBottleReturnSize = ["1ltr", "1/2ltr"];

    if (
      bottleReturnSize &&
      !allowedBottleReturnSize.includes(bottleReturnSize)
    ) {

    if(bottleReturnSize && !allowedBottleReturnSize.includes(bottleReturnSize)){

      return res.status(400).json({
        success: false,
        message: "Invalid bottle return size",
        allowedBottleReturnSize,
      });
    }

    // ✅ Update status if provided
    if (status) {
      order.status = status;
    }

    // ✅ Handle bottle return
    if (bottleReturnSize) {
      order.bottleReturnSize = bottleReturnSize;

      // Increase bottleReturned count
      order.bottlesReturned = (order.bottlesReturned || 0) + 1;
    }

    await order.save();

    // Create or update invoice if order is delivered
    let invoiceResult = null;
    if (status === "Delivered") {
      if (order.isInvoiced) {
        invoiceResult = {
          success: true,
          message: "Invoice already created for this order",
          isUpdated: false,
        };
      } else {
        invoiceResult = await createOrUpdateInvoice(order, order.customer);
      }

      if (!invoiceResult.success) {
        console.error("Failed to create/update invoice:", invoiceResult.error);
      }
    }

    let message = "Order Status updated successfully";

    if (invoiceResult && invoiceResult.success) {
      if (invoiceResult.message) {
        message = invoiceResult.message;
      }
    }

    return res.status(200).json({
      success: true,
      message: "Order status updated successfully",
      order,

    });
  } catch (error) {
    console.error("updateOrderStatus Error:", error);
    return res.status(500).json({
      success: false,
      message: "Error updating order",
      error: error.message,
    });
  }
};

// Helper function to create or update invoice for delivered order
const createOrUpdateInvoice = async (order, customer) => {
  try {
    // Check if this specific order has already been invoiced
    if (order.isInvoiced) {
      const existingInvoice = await Invoice.findOne({
        includedOrders: order._id,
      });

      return {
        success: true,
        message: "Invoice already created for this order",
      };
    }

    // Check if customer has an existing invoice
    const existingInvoice = await Invoice.findOne({
      customer: order.customer,
      state: "Draft" || "Sent",
    }).sort({ createdAt: -1 });

    const orderProducts = order.products.map((product) => ({
      productId: product._id,
      productName: product.productName,
      productSize: product.productSize,
      quantity: product.quantity,
      price: parseFloat(product.price),
      totalPrice: product.totalPrice,
    }));

    let invoice;
    let isUpdated = false;

    if (existingInvoice) {
      // Update existing invoice
      invoice = existingInvoice;
      isUpdated = true;

      // Check for duplicate products and update quantities
      for (const orderProduct of orderProducts) {
        const existingProductIndex = existingInvoice.products.findIndex(
          (existingProduct) =>
            existingProduct.productId.toString() ===
              orderProduct.productId.toString() &&
            existingProduct.productSize === orderProduct.productSize
        );

        if (existingProductIndex !== -1) {
          // Product exists, update quantity and total price
          existingInvoice.products[existingProductIndex].quantity +=
            orderProduct.quantity;
          existingInvoice.products[existingProductIndex].totalPrice +=
            orderProduct.totalPrice;
        } else {
          // New product, add to invoice
          existingInvoice.products.push(orderProduct);
        }
      }

      // Recalculate totals
      const newSubtotal = existingInvoice.products.reduce(
        (sum, product) => sum + product.totalPrice,
        0
      );

      existingInvoice.totals.subtotal = newSubtotal;
      existingInvoice.totals.balanceAmount =
        newSubtotal - existingInvoice.totals.paidAmount;

      // Add this order to the included orders list
      if (!existingInvoice.includedOrders.includes(order._id)) {
        existingInvoice.includedOrders.push(order._id);
      }
    } else {
      // Create new invoice
      const invoiceNumber = generateInvoiceNumber();
      const subtotal = orderProducts.reduce(
        (sum, product) => sum + product.totalPrice,
        0
      );

      invoice = await Invoice.create({
        invoiceNumber,
        gstNumber: parseInt(gstNumber),
        customer: order.customer,
        phoneNumber: parseInt(customer.phoneNumber),
        address: customer.address,
        subscriptionPlan: customer.subscriptionPlan,
        Deliveries: 1,
        absentDays: [],
        actualOrders: 1,
        period: {
          startDate: new Date(),
          endDate: moment().add(1, "month").toDate(),
        },
        products: orderProducts,
        payment: {
          status: "Unpaid",
          method: order.paymentMethod || "COD",
        },
        totals: {
          subtotal,
          paidAmount: 0,
          balanceAmount: subtotal,
          carryForwardAmount: 0,
          paidDate: null,
        },
        state: "Draft",
        includedOrders: [order._id],
      });
    }
    
    const invoiceWithStats = {
      ...invoice.toObject(),
      customer: {
        name: customer.name,
        phoneNumber: customer.phoneNumber,
        address: customer.address,
      },
      deliveryStats: {
        actualOrders: invoice.actualOrders + (isUpdated ? 1 : 0),
        absentDays: invoice.absentDays.length,
        deliveries: invoice.Deliveries + (isUpdated ? 1 : 0),
      },
    };

    const pdfBuffer = await generateInvoicePDF(invoiceWithStats);

    const result = await new Promise((resolve, reject) => {
      cloudinary.uploader
        .upload_stream(
          {
            resource_type: "raw",
            folder: "Pench/Invoices",
            public_id: `invoice-${invoice.invoiceNumber}`,
            format: "pdf",
          },
          (error, result) => {
            if (error) reject(error);
            else resolve(result);
          }
        )
        .end(pdfBuffer);
    });

    invoice.pdfUrl = result.secure_url;
    await invoice.save();

    // Mark the order as invoiced
    order.isInvoiced = true;
    await order.save();

    return {
      success: true,            
      message: isUpdated
        ? "Invoice already created for this order"
        : "Order status updated and created invoice",
    };
  } catch (error) {
    console.error("Error creating/updating invoice:", error);
    return { success: false, error: error.message };
  }
};



module.exports = {
  createAutomaticOrdersForCustomer,
  createAdditionalOrder,
  initializeOrders,
  updateOrderStatus,
};
