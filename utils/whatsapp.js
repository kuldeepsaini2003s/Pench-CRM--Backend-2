const axios = require('axios');

const sendWhatsAppMessage = async (customerPhoneNumber, paymentLink) => {
  try {
    const response = await axios.post(
      `https://graph.facebook.com/v17.0/${process.env.WHATSAPP_PHONE_NUMBER}/messages`,
      {
        messaging_product: 'whatsapp',
        to: customerPhoneNumber,
        text: {
          body: `Hello! Your payment link is ready: ${paymentLink}. Please complete your payment at your earliest convenience.`,
        },
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
      }
    );

    console.log('Message sent successfully:', response.data);
  } catch (error) {
    console.error('Error sending message:', error.response ? error.response.data : error.message);
  }
};

module.exports = {
  sendWhatsAppMessage,
};