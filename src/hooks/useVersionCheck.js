import { useState, useEffect, useCallback, useRef } from 'react';

const CHECK_INTERVAL = 5 * 60 * 1000;

export function useVersionCheck() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const currentVersionRef = useRef(null);
  const abortControllerRef = useRef(null);

  const checkForUpdate = useCallback(async () => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();
    try {
      const res = await fetch(`/meta.json?_=${Date.now()}`, {
        cache: 'no-store',
        signal: abortControllerRef.current.signal,
      });
      if (!res.ok) return;

      const data = await res.json();

      if (!currentVersionRef.current) {
        currentVersionRef.current = data.version;
        return;
      }

      if (data.version !== currentVersionRef.current) {
        setUpdateAvailable(true);
      }
    } catch (e) {
      if (e.name === 'AbortError') return;
    }
  }, []);

  useEffect(() => {
    checkForUpdate();
    const interval = setInterval(checkForUpdate, CHECK_INTERVAL);
    return () => {
      clearInterval(interval);
      abortControllerRef.current?.abort();
    };
  }, [checkForUpdate]);

  const applyUpdate = useCallback(() => {
    window.location.reload();
  }, []);

  return { updateAvailable, applyUpdate };
}
