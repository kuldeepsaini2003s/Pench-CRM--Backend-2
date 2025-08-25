const path = require("path");
const ejs = require("ejs");
const puppeteer = require("puppeteer");
const { formatDate } = require("../utils/dateUtils");

async function generateInvoicePDF(invoice) {
  const templatePath = path.join(
    __dirname,
    "../public/templates/customInvoiceTemplate.ejs"
  );

  const formattedDate = formatDate(invoice.invoiceDate);
  const html = await ejs.renderFile(templatePath, { invoice, formattedDate });

  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  await page.setContent(html, { waitUntil: "networkidle0" });

  const pdfBuffer = await page.pdf({
    format: "A4",
    printBackground: true,
  });

  await browser.close();
  return pdfBuffer;
}

module.exports = { generateInvoicePDF };
