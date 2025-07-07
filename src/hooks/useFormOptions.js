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
 * Hook do pobierania gotowych produktów z magazynu dla pól drukowania
 * Używany w polach "Rodzaj nadrukowanych doypack/tub"
 */
export const useProductOptionsForPrinting = () => {
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchFinishedProducts = async () => {
      try {
        setLoading(true);
        setError(null);
        
        // Import funkcji do pobierania pozycji magazynowych
        const { getAllInventoryItems } = await import('../services/inventoryService');
        
        // Pobierz wszystkie pozycje magazynowe
        const allItems = await getAllInventoryItems();
        
        // Filtruj tylko gotowe produkty
        const finishedProducts = allItems
          .filter(item => item.category === 'Gotowe produkty')
          .map(item => ({
            id: item.id,
            name: item.name,
            description: item.description || '',
            searchText: `${item.name} ${item.description || ''}`.toLowerCase()
          }));
        
        setOptions(finishedProducts);
      } catch (err) {
        console.error('Błąd podczas pobierania gotowych produktów:', err);
        setError(err.message);
        
        // W przypadku błędu, użyj domyślnych opcji jako fallback
        setOptions([
          { id: 'fallback-1', name: "BLC-COLL-GLYC", description: '', searchText: "blc-coll-glyc" },
          { id: 'fallback-2', name: "BW3Y-Glycine", description: '', searchText: "bw3y-glycine" },
          { id: 'fallback-3', name: "BW3Y-MAGN-BISG", description: '', searchText: "bw3y-magn-bisg" },
          { id: 'fallback-4', name: "BW3Y-VITAMINC", description: '', searchText: "bw3y-vitaminc" },
          { id: 'fallback-5', name: "COR-MULTIVIT 60 caps", description: '', searchText: "cor-multivit 60 caps" }
        ]);
      } finally {
        setLoading(false);
      }
    };

    fetchFinishedProducts();
  }, []);

  return { options, loading, error };
};

/**
 * Hook do wyszukiwania gotowych produktów
 * @param {string} searchTerm - Fraza wyszukiwania
 * @param {Array} allOptions - Wszystkie dostępne opcje produktów
 * @returns {Array} Przefiltrowane opcje produktów
 */
export const useFilteredProductOptions = (searchTerm, allOptions) => {
  const [filteredOptions, setFilteredOptions] = useState([]);

  useEffect(() => {
    if (!searchTerm || searchTerm.trim() === '') {
      setFilteredOptions(allOptions.slice(0, 10)); // Pokaż pierwsze 10 opcji gdy brak wyszukiwania
      return;
    }

    const searchLower = searchTerm.toLowerCase().trim();
    const filtered = allOptions.filter(option => 
      option.searchText.includes(searchLower)
    ).slice(0, 20); // Maksymalnie 20 wyników

    setFilteredOptions(filtered);
  }, [searchTerm, allOptions]);

  return filteredOptions;
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