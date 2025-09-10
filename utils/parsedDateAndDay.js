// helper to parse "dd/mm/yyyy" or "dd-mm-yyyy" to Date object
const parseUniversalDate = (dateStr) => {
  if (!dateStr) return null;

  const separator = dateStr.includes("/") ? "/" : "-";
  const parts = dateStr.split(separator);

  if (parts.length !== 3) return null;

  // Check if it's DD-MM-YYYY or DD/MM/YYYY format (day is first)
  if (parts[0].length <= 2 && parts[1].length <= 2 && parts[2].length === 4) {
    const [day, month, year] = parts;
    return new Date(
      `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`
    );
  }

  // Check if it's YYYY-MM-DD format (year is first)
  if (parts[0].length === 4 && parts[1].length <= 2 && parts[2].length <= 2) {
    const [year, month, day] = parts;
    return new Date(
      `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`
    );
  }

  return null;
};

const formatDateToDDMMYYYY = (date) => {
  if (!date) return null;
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
};

module.exports = {
  parseUniversalDate,
  formatDateToDDMMYYYY,
};
