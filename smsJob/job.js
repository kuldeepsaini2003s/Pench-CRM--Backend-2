const cron = require("node-cron");
const {
  generateMonthlyInvoices,
} = require("../controllers/customerInvoiceController");

// Run at 12:00 PM on the last day of the month
cron.schedule("0 12 28-31 * *", async () => {
  const today = new Date();
  const lastDay = new Date(
    today.getFullYear(),
    today.getMonth() + 1,
    0
  ).getDate();

  if (today.getDate() === lastDay) {

    try {
      const currentMonth = today.getMonth() + 1; // JavaScript months are 0-indexed
      const currentYear = today.getFullYear();

      // Create a mock request object for the function
      const mockReq = {
        body: {
          month: currentMonth,
          year: currentYear,
        },
      };

      // Create a mock response object
      const mockRes = {
        status: (code) => ({
          json: (data) => {
            console.log(`Response Status: ${code}`);
            console.log(
              `Monthly Invoice Generation Result:`,
              JSON.stringify(data, null, 2)
            );
          },
        }),
      };

      await generateMonthlyInvoices(mockReq, mockRes);
    } catch (error) {
      console.error("Error in monthly invoice job:", error);
    }
  }
});

// Alternative: Run at 12:30 PM on the last day of the month (30 minutes later)
cron.schedule("30 12 28-31 * *", async () => {
  const today = new Date();
  const lastDay = new Date(
    today.getFullYear(),
    today.getMonth() + 1,
    0
  ).getDate();

  if (today.getDate() === lastDay) {

    try {
      const currentMonth = today.getMonth() + 1; // JavaScript months are 0-indexed
      const currentYear = today.getFullYear();

      const mockReq = {
        body: {
          month: currentMonth,
          year: currentYear,
        },
      };

      const mockRes = {
        status: (code) => ({
          json: (data) => {
            console.log(`Response Status: ${code}`);
            console.log(
              `Monthly Invoice Generation Result (Alternative):`,
              JSON.stringify(data, null, 2)
            );
          },
        }),
      };

      await generateMonthlyInvoices(mockReq, mockRes);
    } catch (error) {
      console.error("Error in monthly invoice job (alternative):", error);
    }
  }
});
