import { useState, useEffect } from 'react';
import { getFormOptions, FORM_OPTION_TYPES } from '../services/formOptionsService';
import { getAllProducts } from '../services/productService';

/**
 * Hook do pobierania opcji formularzy z bazy danych
 * @param {string} optionType - Typ opcji do pobrania
 * @returns {Object} Obiekt zawierający opcje, stan ładowania i błędy
 */
export const useFormOptions = (optionType) => {
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchOptions = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await getFormOptions(optionType);
        
        // Konwertuj do formatu używanego przez komponenty Select
        const formattedOptions = data.map(option => option.value);
        setOptions(formattedOptions);
      } catch (err) {
        console.error(`Błąd podczas pobierania opcji ${optionType}:`, err);
        setError(err.message);
        
        // W przypadku błędu, użyj domyślnych opcji jako fallback
        setOptions(getFallbackOptions(optionType));
      } finally {
        setLoading(false);
      }
    };

    if (optionType) {
      fetchOptions();
    }
  }, [optionType]);

  return { options, loading, error };
};

/**
 * Hook do pobierania opcji produktów z bazy danych produktów
 * Używany w polach "Rodzaj nadrukowanych doypack/tub"
 */
export const useProductOptionsForPrinting = () => {
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchProducts = async () => {
      try {
        setLoading(true);
        setError(null);
        const products = await getAllProducts();
        setOptions(products);
      } catch (err) {
        console.error('Błąd podczas pobierania produktów:', err);
        setError(err.message);
        
        // W przypadku błędu, użyj domyślnych opcji jako fallback
        setOptions([
          "BLC-COLL-GLYC",
          "BW3Y-Glycine",
          "BW3Y-MAGN-BISG",
          "BW3Y-VITAMINC",
          "COR-MULTIVIT 60 caps"
        ]);
      } finally {
        setLoading(false);
      }
    };

    fetchProducts();
  }, []);

  return { options, loading, error };
};

/**
 * Hook do pobierania opcji pracowników
 */
export const useStaffOptions = () => {
  return useFormOptions(FORM_OPTION_TYPES.STAFF);
};

/**
 * Hook do pobierania opcji stanowisk
 */
export const usePositionOptions = () => {
  return useFormOptions(FORM_OPTION_TYPES.POSITIONS);
};

/**
 * Hook do pobierania opcji pracowników zmian
 */
export const useShiftWorkerOptions = () => {
  return useFormOptions(FORM_OPTION_TYPES.SHIFT_WORKERS);
};

/**
 * Funkcja zwracająca domyślne opcje w przypadku błędu
 * @param {string} optionType - Typ opcji
 * @returns {Array} Tablica domyślnych opcji
 */
const getFallbackOptions = (optionType) => {
  const fallbackOptions = {
    [FORM_OPTION_TYPES.STAFF]: [
      "Valentyna Tarasiuk",
      "Seweryn Burandt", 
      "Łukasz Bojke",
      "Mariia Pokrovets"
    ],
    [FORM_OPTION_TYPES.POSITIONS]: [
      "Mistrz produkcji",
      "Kierownik Magazynu"
    ],
    [FORM_OPTION_TYPES.SHIFT_WORKERS]: [
      "Luis Carlos Tapiero",
      "Ewa Bojke",
      "Maria Angelica Bermudez",
      "Mariia Pokrovets",
      "Valentyna Tarasiuk",
      "Daria Shadiuk"
    ]
  };

  return fallbackOptions[optionType] || [];
}; 