const axios = require("axios");

async function sendInvoiceOnWhatsApp(phoneNumber, pdfUrl) {
  try {
    // Example with Meta WhatsApp Cloud API
    await axios.post(
      `https://graph.facebook.com/v17.0/${process.env.WHATSAPP_PHONE_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to: phoneNumber,
        type: "document",
        document: {
          link: pdfUrl,
          caption: "Your monthly invoice",
          filename: "invoice.pdf",
        },
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.error(
      "WhatsApp send error:",
      error.response?.data || error.message
    );
  }
}

module.exports = { sendInvoiceOnWhatsApp };
