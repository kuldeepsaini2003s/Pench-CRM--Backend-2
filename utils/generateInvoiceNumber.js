function generateInvoiceNumber() {
    const now = new Date();

    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");

    const randomSixDigit = Math.floor(100000 + Math.random() * 900000);

    return `INV-${yyyy}${mm}${dd}-${randomSixDigit}`;
}

module.exports = generateInvoiceNumber;
