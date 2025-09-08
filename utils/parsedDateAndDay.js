// helper to parse "dd/mm/yyyy" to Date object
const parseDDMMYYYYtoDate = (dateStr) => {
    if (!dateStr) return null;
    const [day, month, year] = dateStr.split("/");
    return new Date(`${year}-${month}-${day}`);
  };
   
  // helper to format Date object to "dd/mm/yyyy"
  const formatDateToDDMMYYYY = (date) => {
    if (!date) return null;
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  };

  module.exports = {
    parseDDMMYYYYtoDate,
    formatDateToDDMMYYYY,
  };
  