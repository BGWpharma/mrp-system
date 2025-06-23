import { useState, useEffect } from 'react';
import { getNutritionalComponents, getNutritionalComponentsByCategory } from '../services/nutritionalComponentsService';
import { ALL_NUTRITIONAL_COMPONENTS } from '../utils/constants';

/**
 * Hook do zarządzania składnikami odżywczymi
 * Próbuje pobrać składniki z bazy danych, w przypadku błędu używa fallbackiem do constants.js
 */
export const useNutritionalComponents = () => {
  const [components, setComponents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [usingFallback, setUsingFallback] = useState(false);

  const loadComponents = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Próbuj pobrać składniki z bazy danych
      const dbComponents = await getNutritionalComponents();
      
      if (dbComponents && dbComponents.length > 0) {
        setComponents(dbComponents);
        setUsingFallback(false);
        console.log('Składniki odżywcze załadowane z bazy danych');
      } else {
        // Jeśli baza danych jest pusta, użyj fallback
        console.log('Baza danych pusta, używam składników z constants.js');
        setComponents(ALL_NUTRITIONAL_COMPONENTS);
        setUsingFallback(true);
      }
    } catch (err) {
      console.error('Błąd przy ładowaniu składników z bazy danych:', err);
      console.log('Używam składników z constants.js jako fallback');
      
      // W przypadku błędu użyj składników z constants.js
      setComponents(ALL_NUTRITIONAL_COMPONENTS);
      setUsingFallback(true);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadComponents();
  }, []);

  return {
    components,
    loading,
    error,
    usingFallback,
    refreshComponents: loadComponents
  };
};

/**
 * Hook do pobierania składników według kategorii
 */
export const useNutritionalComponentsByCategory = (category) => {
  const [components, setComponents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [usingFallback, setUsingFallback] = useState(false);

  const loadComponentsByCategory = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Próbuj pobrać składniki z bazy danych
      const dbComponents = await getNutritionalComponentsByCategory(category);
      
      if (dbComponents && dbComponents.length > 0) {
        setComponents(dbComponents);
        setUsingFallback(false);
        console.log(`Składniki kategorii ${category} załadowane z bazy danych`);
      } else {
        // Jeśli baza danych jest pusta, użyj fallback
        console.log(`Baza danych pusta dla kategorii ${category}, używam składników z constants.js`);
        const fallbackComponents = ALL_NUTRITIONAL_COMPONENTS.filter(comp => comp.category === category);
        setComponents(fallbackComponents);
        setUsingFallback(true);
      }
    } catch (err) {
      console.error(`Błąd przy ładowaniu składników kategorii ${category} z bazy danych:`, err);
      console.log(`Używam składników kategorii ${category} z constants.js jako fallback`);
      
      // W przypadku błędu użyj składników z constants.js
      const fallbackComponents = ALL_NUTRITIONAL_COMPONENTS.filter(comp => comp.category === category);
      setComponents(fallbackComponents);
      setUsingFallback(true);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (category) {
      loadComponentsByCategory();
    }
  }, [category]);

  return {
    components,
    loading,
    error,
    usingFallback,
    refreshComponents: loadComponentsByCategory
  };
};

export default useNutritionalComponents; 