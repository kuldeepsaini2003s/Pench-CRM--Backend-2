const DeliveryHistory = require("../models/delhiveryHistory");
const Customer = require("../models/coustomerModel");
const DeliveryBoy = require("../models/delhiveryBoyModel");
const Payment = require("../models/paymentModel");

// ➡️ Create a new delivery history entry
exports.createDeliveryHistory = async (req, res) => {
  try {
    const {
      customer,
      deliveryBoy,
      product,
      quantityDelivered,
      totalPrice,
      status,
      remarks,
    } = req.body;

    if (!customer || !product || !totalPrice) {
      return res.status(400).json({
        success: false,
        message: "Customer, Product and TotalPrice are required",
      });
    }

    const delivery = await DeliveryHistory.create({
      customer,
      deliveryBoy,
      product,
      quantityDelivered,
      totalPrice,
      status,
      remarks,
    });

    res.status(201).json({ success: true, delivery });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ➡️ Get all delivery histories (with filters)
exports.getAllDeliveries = async (req, res) => {
  try {
    const { customer, deliveryBoy, status, startDate, endDate } = req.query;
    let filter = {};

    if (customer) filter.customer = customer;
    if (deliveryBoy) filter.deliveryBoy = deliveryBoy;
    if (status) filter.status = status;
    if (startDate && endDate) {
      let start = new Date(startDate);
      let end = new Date(endDate);
      end.setHours(23, 59, 59, 999); // include the whole day
      filter.date = { $gte: start, $lte: end };
    }

    const deliveries = await DeliveryHistory.find(filter)
      .populate("customer", "name phoneNumber address")
      .populate("deliveryBoy", "name phoneNumber area")
      .populate("product", "productName price size stock");

    res
      .status(200)
      .json({ success: true, count: deliveries.length, deliveries });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ➡️ Get deliveries by customer
exports.getDeliveriesByCustomer = async (req, res) => {
  try {
    const { customerId } = req.params;
    const deliveries = await DeliveryHistory.find({ customer: customerId })
      .populate("customer", "name phoneNumber address")
      .populate("deliveryBoy", "name phoneNumber area")
      .populate("product", "name price size");

    res
      .status(200)
      .json({ success: true, count: deliveries.length, deliveries });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ➡️ Get deliveries by delivery boy
exports.getDeliveriesByDeliveryBoy = async (req, res) => {
  try {
    const { deliveryBoyId } = req.params;
    const deliveries = await DeliveryHistory.find({
      deliveryBoy: deliveryBoyId,
    })
      .populate("customer", "name phoneNumber address")
      .populate("deliveryBoy", "name phoneNumber area")
      .populate("product", "name price size");

    res
      .status(200)
      .json({ success: true, count: deliveries.length, deliveries });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ➡️ Update a delivery history record
exports.updateDeliveryHistory = async (req, res) => {
  try {
    const { id } = req.params;

    console.log("id----------", id);

    const delivery = await DeliveryHistory.findByIdAndUpdate(id, req.body, {
      new: true,
      runValidators: true,
    })
      .populate("customer", "name phoneNumber")
      .populate("deliveryBoy", "name phoneNumber")

      .populate("product", "productName price size");



    // console.log("delivery----------", delivery);


    if (!delivery) {
      return res
        .status(404)
        .json({ success: false, message: "Delivery record not found" });
    }

    res.status(200).json({ success: true, delivery });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ➡️ Delete a delivery history record
exports.deleteDeliveryHistory = async (req, res) => {
  try {
    const { id } = req.params;
    const delivery = await DeliveryHistory.findByIdAndDelete(id);

    if (!delivery) {
      return res
        .status(404)
        .json({ success: false, message: "Delivery record not found" });
    }

    res
      .status(200)
      .json({ success: true, message: "Delivery record deleted successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateDeliveryStatus = async (req, res) => {
  try {
    const {
      customerId,
      deliveryBoyId,
      date,
      status,
      products,
      amountPaid,
      paymentMethod,
      bottleIssued,
      bottleReturn,
      remarks
    } = req.body;

    // Validate required fields
    if (!customerId || !mongoose.Types.ObjectId.isValid(customerId)) {
      return res.status(400).json({
        success: false,
        message: "Valid customer ID is required",
      });
    }

    if (!deliveryBoyId || !mongoose.Types.ObjectId.isValid(deliveryBoyId)) {
      return res.status(400).json({
        success: false,
        message: "Valid delivery boy ID is required",
      });
    }

    // Check if customer exists
    const customer = await Customer.findById(customerId);
    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "Customer not found",
      });
    }

    // Check if delivery boy exists
    const deliveryBoy = await DeliveryBoy.findById(deliveryBoyId);
    if (!deliveryBoy) {
      return res.status(404).json({
        success: false,
        message: "Delivery boy not found",
      });
    }

    // Set target date (default to today if not provided)
    const targetDate = date ? new Date(date) : new Date();
    targetDate.setHours(0, 0, 0, 0);

    // Check if delivery history already exists for this date
    let deliveryHistory = await DeliveryHistory.findOne({
      customer: customerId,
      date: {
        $gte: new Date(targetDate.setHours(0, 0, 0, 0)),
        $lt: new Date(targetDate.setHours(23, 59, 59, 999))
      }
    });

    // If no existing record, create a new one
    if (!deliveryHistory) {
      // Calculate total price from products
      const totalPrice = products ? products.reduce((total, product) => {
        return total + (product.totalPrice || 0);
      }, 0) : 0;

      deliveryHistory = await DeliveryHistory.create({
        customer: customerId,
        deliveryBoy: deliveryBoyId,
        date: targetDate,
        products: products || [],
        totalPrice: totalPrice,
        status: status || "Pending",

        amountPaid: amountPaid || 0,
        paymentMethod: paymentMethod,
        bottleIssued: bottleIssued || [],
        bottleReturn: bottleReturn || [],
        remarks: remarks
      });
    } else {
      // Update existing record
      const updateData = {};

      if (status && ["Delivered", "Missed", "Pending"].includes(status)) {
        updateData.status = status;
      }

      if (products && Array.isArray(products)) {
        updateData.products = products;
      }

      if (amountPaid !== undefined) {
        updateData.amountPaid = amountPaid;
      }

      if (paymentMethod && ["cash", "upi", "card"].includes(paymentMethod)) {
        updateData.paymentMethod = paymentMethod;
      }

      if (bottleIssued && Array.isArray(bottleIssued)) {
        updateData.bottleIssued = bottleIssued;
      }

      if (bottleReturn && Array.isArray(bottleReturn)) {
        updateData.bottleReturn = bottleReturn;
      }

      if (remarks !== undefined) {
        updateData.remarks = remarks;
      }

      deliveryHistory = await DeliveryHistory.findByIdAndUpdate(
        deliveryHistory._id,
        { $set: updateData },
        { new: true, runValidators: true }
      );
    }

    // Create payment record if amount is paid
    let payment = null;
    if (amountPaid && amountPaid > 0) {
      // Generate invoice number
      const invoiceNumber = `INV-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;

      // Get product IDs from delivery history
      const productIds = deliveryHistory.products.map(p => p.product);

      // Calculate payment status
      let paymentStatus = "Partially Paid";
      if (amountPaid >= deliveryHistory.totalPrice) {
        paymentStatus = "Paid";
      }

      // Create payment record
      payment = await Payment.create({
        invoiceNumber: invoiceNumber,
        customer: customerId,
        totalAmount: deliveryHistory.totalPrice,
        paidAmount: amountPaid,
        productId: productIds,
        paidDate: new Date(),
        note: remarks || `Payment for delivery on ${targetDate.toDateString()}`,
        paymentMethod: paymentMethod || "Cash",
        status: paymentStatus
      });

      // Update customer's payment records
      customer.amountPaidTillDate = (customer.amountPaidTillDate || 0) + amountPaid;
      customer.amountDue = Math.max(0, (customer.amountDue || 0) - amountPaid);
      await customer.save();
    }

    // Populate the delivery history for response
    const populatedHistory = await DeliveryHistory.findById(deliveryHistory._id)
      .populate('customer', 'name phoneNumber address')
      .populate('deliveryBoy', 'name phoneNumber')
      .populate('products.product', 'productName price');

    res.status(200).json({
      success: true,
      message: "Delivery status updated successfully",
      data: {
        deliveryHistory: populatedHistory,
        payment: payment
      }
    });

  } catch (error) {
    console.error("Error updating delivery status:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};