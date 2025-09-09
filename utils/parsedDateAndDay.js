// Universal date parser that handles both dd-mm-yyyy and dd/mm/yyyy formats
const parseUniversalDate = (dateStr) => {
  if (!dateStr) return null;
    
  const separator = dateStr.includes("/") ? "/" : "-";
  const [day, month, year] = dateStr.split(separator);
  
  if (!day || !month || !year) return null;

  return new Date(`${year}-${month}-${day}`);
};

// helper to format Date object to "dd-mm-yyyy" (standardized format)
const formatDateToDDMMYYYY = (date) => {
  if (!date) return null;
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}-${month}-${year}`;
};

module.exports = {
  parseUniversalDate,
  formatDateToDDMMYYYY,
};
