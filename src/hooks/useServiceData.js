import { useState, useEffect, useCallback, useRef } from 'react';
import { ServiceCacheManager } from '../services/cache/serviceCacheManager';

/**
 * Uniwersalny hook do pobierania danych z cache na poziomie serwisów.
 * 
 * Zapewnia:
 * - Automatyczne pobieranie z cache lub Firestore
 * - Deduplikację równoległych fetchów (wiele komponentów = 1 zapytanie)
 * - Automatyczne odświeżanie po invalidacji cache
 * - Stabilną referencję refresh()
 * 
 * @param {string} cacheKey - Unikalny klucz cache (np. 'customers:all')
 * @param {Function} fetchFn - Async funkcja pobierająca dane (np. getAllCustomers)
 * @param {Object} options - Opcje
 * @param {number} options.ttl - Czas życia cache w ms (domyślnie 5 min)
 * @param {boolean} options.enabled - Czy fetch jest aktywny (domyślnie true)
 * @returns {{ data: Array|null, loading: boolean, error: Error|null, refresh: Function }}
 */
export const useServiceData = (cacheKey, fetchFn, options = {}) => {
  const { ttl = 5 * 60 * 1000, enabled = true } = options;

  // Inicjalizuj z danych cache jeśli dostępne
  const [data, setData] = useState(() => ServiceCacheManager.get(cacheKey));
  const [loading, setLoading] = useState(() => !ServiceCacheManager.get(cacheKey) && enabled);
  const [error, setError] = useState(null);

  // Ref dla fetchFn żeby uniknąć re-subskrypcji
  const fetchFnRef = useRef(fetchFn);
  fetchFnRef.current = fetchFn;

  // Ochrona przed race conditions — starsze requesty nie nadpiszą nowszych
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }

    let mounted = true;
    const currentRequestId = ++requestIdRef.current;

    const load = async () => {
      try {
        if (mounted) setLoading(true);
        const result = await ServiceCacheManager.getOrFetch(cacheKey, fetchFnRef.current, ttl);
        if (mounted && currentRequestId === requestIdRef.current) {
          setData(result);
          setError(null);
          setLoading(false);
        }
      } catch (err) {
        if (mounted && currentRequestId === requestIdRef.current) {
          console.error(`[useServiceData] Błąd dla klucza "${cacheKey}":`, err);
          setError(err);
          setLoading(false);
        }
      }
    };

    // Subskrybuj zmiany cache (invalidacja lub odświeżenie z innego komponentu)
    const unsub = ServiceCacheManager.subscribe(cacheKey, (newData) => {
      if (!mounted) return;
      if (newData !== null) {
        setData(newData);
        setError(null);
        setLoading(false);
      } else {
        load();
      }
    });

    // Załaduj dane jeśli nie ma ich w cache
    const cached = ServiceCacheManager.get(cacheKey);
    if (cached) {
      setData(cached);
      setLoading(false);
    } else {
      load();
    }

    return () => {
      mounted = false;
      unsub();
    };
  }, [cacheKey, ttl, enabled]);

  const refresh = useCallback(() => {
    ServiceCacheManager.invalidate(cacheKey);
  }, [cacheKey]);

  return { data: data || [], loading, error, refresh };
};

export default useServiceData;
