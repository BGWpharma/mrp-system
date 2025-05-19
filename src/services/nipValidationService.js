import axios from 'axios';
import isValidNIP from 'is-valid-nip';

// URL API Ministerstwa Finansów 
const NIP_API_URL = 'https://wl-api.mf.gov.pl/api/search/nip';

/**
 * Sprawdza formalną poprawność numeru NIP 
 * @param {string} nip - Numer NIP do sprawdzenia
 * @returns {boolean} - Czy NIP jest formalnie poprawny
 */
export const validateNipFormat = (nip) => {
  if (!nip) return false;
  return isValidNIP(nip);
};

/**
 * Formatuje numer NIP usuwając spacje i myślniki
 * @param {string} nip - Numer NIP do sformatowania
 * @returns {string} - Sformatowany numer NIP
 */
export const formatNip = (nip) => {
  if (!nip) return '';
  return nip.replace(/[^0-9]/g, '');
};

/**
 * Weryfikuje NIP w API Ministerstwa Finansów
 * @param {string} nip - Numer NIP do weryfikacji (może być z prefiksem PL)
 * @param {string} date - Data do weryfikacji (format YYYY-MM-DD), domyślnie dzisiejsza
 * @returns {Promise<Object>} - Dane podmiotu lub null jeśli nie znaleziono
 */
export const verifyNip = async (nip, date = null) => {
  try {
    if (!nip) {
      throw new Error('Numer NIP jest wymagany');
    }
    
    // Usuń prefiks PL jeśli istnieje
    const nipWithoutPrefix = nip.replace(/^PL/i, '');
    
    // Usuń wszystkie nie-cyfry z NIP-u
    const formattedNip = formatNip(nipWithoutPrefix);
    
    if (!validateNipFormat(formattedNip)) {
      throw new Error('Niepoprawny format numeru NIP');
    }
    
    // Przygotuj datę w formacie YYYY-MM-DD
    const searchDate = date || new Date().toISOString().split('T')[0];
    
    // Wykonaj zapytanie do API
    const response = await axios.get(`${NIP_API_URL}/${formattedNip}`, {
      params: {
        date: searchDate
      }
    });
    
    // Sprawdź czy zapytanie było udane i czy znaleziono podmiot
    if (response.data && response.data.result && response.data.result.subject) {
      return response.data.result.subject;
    } else {
      return null;
    }
  } catch (error) {
    console.error('Błąd podczas weryfikacji NIP:', error);
    throw error;
  }
};

/**
 * Pobiera podstawowe dane podmiotu na podstawie NIP
 * @param {string} nip - Numer NIP (może być z prefiksem PL)
 * @returns {Promise<Object>} - Podstawowe dane podmiotu
 */
export const getBasicCompanyDataByNip = async (nip) => {
  try {
    const subject = await verifyNip(nip);
    
    if (!subject) {
      return null;
    }
    
    return {
      name: subject.name,
      nip: subject.nip,
      regon: subject.regon,
      workingAddress: subject.workingAddress 
        ? `${subject.workingAddress.street || ''} ${subject.workingAddress.buildingNumber || ''} ${subject.workingAddress.flatNumber || ''}`.trim() + 
          `, ${subject.workingAddress.postalCode || ''} ${subject.workingAddress.city || ''}`.trim()
        : '',
      residenceAddress: subject.residenceAddress 
        ? `${subject.residenceAddress.street || ''} ${subject.residenceAddress.buildingNumber || ''} ${subject.residenceAddress.flatNumber || ''}`.trim() + 
          `, ${subject.residenceAddress.postalCode || ''} ${subject.residenceAddress.city || ''}`.trim()
        : '',
      statusVat: subject.statusVat
    };
  } catch (error) {
    console.error('Błąd podczas pobierania danych podmiotu:', error);
    throw error;
  }
}; 