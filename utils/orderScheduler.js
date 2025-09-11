const cron = require("node-cron");
const moment = require("moment");
const Customer = require("../models/Customer"); 
const { createAutomaticOrdersForCustomer } = require("../controllers/customerOrderController"); // agar ye bhi utils me hai

// 🕒 3 AM job → Aaj ke liye orders
cron.schedule("0 3 * * *", async () => {
  console.log("⏰ Running daily order generation job at 3 AM");

  try {
    const today = moment().format("DD/MM/YYYY");

    const customers = await Customer.find({
      subscriptionStatus: "active",
      startDate: { $lte: today }, // customer already started
      endDate: { $gte: today },   // not expired
    }).populate("products.product");

    for (const customer of customers) {
        // 🔹 Monthly subscription auto-renew check
        if (
          customer.subscriptionPlan === "Monthly" &&
          moment(customer.endDate, "DD/MM/YYYY").isSame(today, "day")
        ) {
          const nextMonthEnd = moment(today, "DD/MM/YYYY")
            .add(1, "month")
            .endOf("month")
            .format("DD/MM/YYYY");
  
          customer.endDate = nextMonthEnd;
          await customer.save();
          console.log(`🔄 Renewed subscription for ${customer.name} until ${nextMonthEnd}`);
        }
  
        // 🔹 Generate today’s order
        await createAutomaticOrdersForCustomer(customer._id, customer.deliveryBoy);
      }
  
      console.log("Daily orders generated for", customers.length, "customers");
    } catch (error) {
      console.error("Error in 3 AM job:", error.message);
    }
});

// 🕚 11 AM job → Next day ke liye orders
cron.schedule("0 9 * * *", async () => {
  console.log("⏰ Running next-day order generation at 11 AM");

  try {
    const tomorrow = moment().add(1, "day").format("DD/MM/YYYY");

    const customers = await Customer.find({
      subscriptionStatus: "active",
      startDate: { $lte: tomorrow },
      endDate: { $gte: tomorrow },
    }).populate("products.product");

    for (const customer of customers) {
      await createAutomaticOrdersForCustomer(customer._id, customer.deliveryBoy);
    }

    console.log("✅ Next-day orders generated for", customers.length, "customers");
  } catch (error) {
    console.error("❌ Error in 11 AM job:", error.message);
  }
});
