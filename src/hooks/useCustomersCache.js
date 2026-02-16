import { useState, useEffect } from 'react';
import { getAllCustomers } from '../services/customerService';

/**
 * @deprecated Użyj useServiceData z CUSTOMERS_CACHE_KEY zamiast tego hooka.
 * Ten hook jest zachowany dla kompatybilności wstecznej.
 * 
 * Zastępstwo:
 *   import { useServiceData } from './useServiceData';
 *   import { getAllCustomers, CUSTOMERS_CACHE_KEY } from '../services/customerService';
 *   const { data: customers, loading, error, refresh } = useServiceData(CUSTOMERS_CACHE_KEY, getAllCustomers);
 */

// Klucz, pod którym dane klientów będą przechowywane w localStorage
const CACHE_KEY = 'app_customers_cache';
// Czas ważności cache w milisekundach (24 godziny)
const CACHE_TTL = 24 * 60 * 60 * 1000;

/**
 * @deprecated Użyj useServiceData z CUSTOMERS_CACHE_KEY zamiast tego hooka.
 */
export const useCustomersCache = () => {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Funkcja do odświeżania danych klientów (pobierania na nowo z API)
  const refreshCustomers = async (forceRefresh = false) => {
    setLoading(true);
    setError(null);
    
    try {
      // Pobierz dane klientów z API
      const freshCustomers = await getAllCustomers();
      
      // Zapisz dane klientów wraz z czasem pobrania
      const cacheData = {
        customers: freshCustomers,
        timestamp: Date.now()
      };
      
      // Zapisz dane w localStorage
      localStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));
      
      // Zaktualizuj stan
      setCustomers(freshCustomers);
      setLoading(false);
      
      return freshCustomers;
    } catch (err) {
      console.error('Błąd podczas pobierania danych klientów:', err);
      setError(err);
      setLoading(false);
      throw err;
    }
  };

  // Funkcja do sprawdzania, czy cache jest aktualny
  const isCacheValid = (cacheTimestamp) => {
    const now = Date.now();
    return (now - cacheTimestamp) < CACHE_TTL;
  };

  // Efekt, który ładuje dane klientów przy montowaniu komponentu
  useEffect(() => {
    const fetchCustomers = async () => {
      try {
        // Sprawdź, czy mamy dane w localStorage
        const cachedData = localStorage.getItem(CACHE_KEY);
        
        if (cachedData) {
          const parsedData = JSON.parse(cachedData);
          
          // Sprawdź, czy dane są nadal aktualne
          if (isCacheValid(parsedData.timestamp)) {
            console.log('Używam buforowanych danych klientów');
            setCustomers(parsedData.customers);
            setLoading(false);
            return;
          } else {
            console.log('Buforowane dane klientów są nieaktualne, pobieram nowe');
          }
        }
        
        // Jeśli nie ma danych w cache lub są nieaktualne, pobierz nowe
        await refreshCustomers();
      } catch (err) {
        console.error('Błąd podczas pobierania danych klientów:', err);
        setError(err);
        setLoading(false);
      }
    };

    fetchCustomers();
  }, []);

  return { customers, loading, error, refreshCustomers };
};

export default useCustomersCache; 