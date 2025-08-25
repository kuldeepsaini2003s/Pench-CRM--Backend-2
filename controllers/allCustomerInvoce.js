const Customer = require("../models/coustomerModel");
const ErrorHandler = require("../utils/errorhendler");
const catchAsyncErrors = require("../middlewares/catchAsyncErrors");


exports.allCustomerInvoices = catchAsyncErrors(async (req, res, next) => {



    const customers = await Customer.find()
        .select("name phoneNumber products createdAt");

    if (!customers || customers.length === 0) {
        return next(new ErrorHandler("No customers found", 404));
    }

    const formattedCustomers = customers.map((cust) => {
        const firstProduct = cust.products[0];
        return {
            id: cust._id,
            name: cust.name,
            phoneNumber: cust.phoneNumber,
            startDate: firstProduct?.startDate || null,
            subscriptionPlan: firstProduct?.subscriptionPlan || "None",
            totalAmount: cust.products.reduce(
                (acc, p) => acc + (p.totalPrice || 0),
                0
            ),
            status: "Unpaid",
        };
    });



    res.status(200).json({
        success: true,
        count: formattedCustomers.length,
        customers: formattedCustomers,
    });
});
