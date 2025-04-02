/**
 * Formatuje adres do postaci jednego ciągu znaków
 * @param {Object} address - Obiekt adresu
 * @returns {string} - Sformatowany adres
 */
export const formatAddress = (address) => {
  if (!address) return '';
  return `${address.name ? address.name + ', ' : ''}${address.street}, ${address.postalCode} ${address.city}, ${address.country}`;
}; 