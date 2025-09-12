const path = require("path");
const ejs = require("ejs");
const puppeteer = require("puppeteer");
const { formatDate } = require("../utils/dateUtils");
const { formatDateToDDMMYYYY } = require("../utils/parsedDateAndDay");

async function generateInvoicePDF(invoice) {
  const templatePath = path.join(
    __dirname,
    "../public/templates/invoice-template.ejs"
  );

  // Format dates
  const formattedDate = formatDate(invoice.createdAt || new Date());
  const dueDate = formatDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)); // 7 days from now

  // Format period dates
  const periodStart = invoice.period?.startDate
    ? formatDateToDDMMYYYY(invoice.period.startDate)
    : formatDateToDDMMYYYY(new Date());
  const periodEnd = invoice.period?.endDate
    ? formatDateToDDMMYYYY(invoice.period.endDate)
    : formatDateToDDMMYYYY(new Date());

  // Prepare partial payment data if applicable
  const partialPayment =
    invoice.payment?.status === "Partially Paid"
      ? {
          partialPaymentAmount: invoice.totals?.paidAmount || 0,
          balanceAmount: invoice.totals?.balanceAmount || 0,
          partialPaymentDays:
            Math.ceil(
              (invoice.period?.endDate - invoice.period?.startDate) /
                (1000 * 60 * 60 * 24)
            ) / 2,
        }
      : null;

  // Prepare delivery stats (if available from getCustomerData)
  const deliveryStats = invoice.deliveryStats || null;

  // Render the EJS template
  const html = await ejs.renderFile(templatePath, {
    invoice,
    formattedDate,
    dueDate,
    periodStart,
    periodEnd,
    partialPayment,
    deliveryStats,
  });

  // Configure Puppeteer for different environments
  const isProduction = process.env.NODE_ENV === 'production';
  const isRender = process.env.RENDER === 'true';
  
  let browser;
  try {
    if (isRender || isProduction) {
      // For Render and other production environments
      // Try to use system Chrome first
      const chromePath = process.env.CHROME_PATH || '/usr/bin/google-chrome-stable';
      
      browser = await puppeteer.launch({
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-accelerated-2d-canvas",
          "--no-first-run",
          "--no-zygote",
          "--disable-gpu",
          "--single-process",
          "--disable-extensions",
          "--disable-plugins",
          "--disable-images",
          "--disable-javascript-harmony-promises",
          "--disable-wake-on-wifi",
          "--disable-features=site-per-process",
          "--disable-web-security",
          "--disable-features=VizDisplayCompositor"
        ],
        executablePath: chromePath,
      });
    } else {
      // For local development
      browser = await puppeteer.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      });
    }

    const page = await browser.newPage();

    await page.setContent(html, { waitUntil: "networkidle0" });

    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: {
        top: "0.5in",
        right: "0.5in",
        bottom: "0.5in",
        left: "0.5in",
      },
    });

    await browser.close();
    return pdfBuffer;
  } catch (error) {
    console.error('Puppeteer launch error:', error);
    
    // Fallback: Try with default Puppeteer configuration
    try {
      browser = await puppeteer.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      });
      
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: "networkidle0" });

      const pdfBuffer = await page.pdf({
        format: "A4",
        printBackground: true,
        margin: {
          top: "0.5in",
          right: "0.5in",
          bottom: "0.5in",
          left: "0.5in",
        },
      });

      await browser.close();
      return pdfBuffer;
    } catch (fallbackError) {
      console.error('Puppeteer fallback error:', fallbackError);
      throw new Error(`Failed to generate PDF: ${fallbackError.message}`);
    }
  }
}

module.exports = { generateInvoicePDF };
