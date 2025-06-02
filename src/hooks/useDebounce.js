import { useState, useEffect } from 'react';

/**
 * Hook do debounce'owania wartości
 * Przydatny dla optymalizacji wyszukiwania - opóźnia aktualizację wartości
 * do momentu gdy użytkownik przestanie pisać przez określony czas
 * 
 * @param {any} value - Wartość do debounce'owania
 * @param {number} delay - Opóźnienie w milisekundach (domyślnie 300ms)
 * @returns {any} Zdebounce'owana wartość
 */
export const useDebounce = (value, delay = 300) => {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    // Ustaw timer który zaktualizuje debouncedValue po określonym opóźnieniu
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    // Wyczyść timer jeśli value się zmieni (cleanup function)
    // Zapobiega to aktualizacji jeśli nowa wartość pojawi się przed zakończeniem opóźnienia
    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
};

export default useDebounce; 