import { useState, useEffect, useCallback, useRef } from 'react';
import { isAbortError } from '../utils/cancellableAsync';

/**
 * Uniwersalny hook do pobierania danych z automatycznym anulowaniem
 * przy odmontowaniu komponentu lub zmianie zaleznosci.
 *
 * Zastepuje wzorzec: useEffect + async fetch + setState
 *
 * @param {Function} fetchFn - Async funkcja pobierajaca dane. Otrzymuje AbortSignal jako pierwszy argument: (signal) => ...
 * @param {Array} deps - Tablica zaleznosci (jak w useEffect). Zmiana uruchamia nowy fetch i anuluje poprzedni.
 * @param {Object} [options] - Opcje konfiguracyjne
 * @param {boolean} [options.enabled=true] - Czy fetch jest aktywny
 * @param {*} [options.initialData=null] - Dane poczatkowe (unika loading flash)
 * @param {Function} [options.onError] - Callback przy bledzie (opcjonalny)
 * @param {Function} [options.onSuccess] - Callback przy sukcesie (opcjonalny)
 * @returns {{ data: *, loading: boolean, error: Error|null, refetch: Function }}
 */
export const useCancellableFetch = (fetchFn, deps = [], options = {}) => {
  const { enabled = true, initialData = null, onError, onSuccess } = options;

  const [data, setData] = useState(initialData);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState(null);

  const abortControllerRef = useRef(null);
  const mountedRef = useRef(true);
  const fetchFnRef = useRef(fetchFn);
  fetchFnRef.current = fetchFn;

  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const onSuccessRef = useRef(onSuccess);
  onSuccessRef.current = onSuccess;

  const execute = useCallback(async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      const result = await fetchFnRef.current(controller.signal);

      if (!controller.signal.aborted && mountedRef.current) {
        setData(result);
        setLoading(false);
        onSuccessRef.current?.(result);
      }
      return result;
    } catch (err) {
      if (isAbortError(err)) return;

      if (mountedRef.current) {
        setError(err);
        setLoading(false);
        onErrorRef.current?.(err);
      }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    mountedRef.current = true;

    if (enabled) {
      execute();
    } else {
      setLoading(false);
    }

    return () => {
      mountedRef.current = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, enabled]);

  const refetch = useCallback(() => {
    if (mountedRef.current) {
      return execute();
    }
  }, [execute]);

  return { data, loading, error, refetch };
};

export default useCancellableFetch;
