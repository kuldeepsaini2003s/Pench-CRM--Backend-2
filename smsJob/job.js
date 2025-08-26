const cron = require("node-cron");
const { generateMonthlyInvoices } = require("../controllers/allCustomerInvoce");

// Run at 23:59 on the last day of the month
cron.schedule("59 23 28-31 * *", async () => {
  const today = new Date();
  const lastDay = new Date(
    today.getFullYear(),
    today.getMonth() + 1,
    0
  ).getDate();

  if (today.getDate() === lastDay) {
    console.log("Running monthly invoice job...");
    await generateMonthlyInvoices();
  }
});
