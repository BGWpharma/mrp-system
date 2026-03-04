import { useState, useEffect, useCallback, useRef } from 'react';

const CHECK_INTERVAL = 5 * 60 * 1000;

export function useVersionCheck() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const currentVersionRef = useRef(null);

  const checkForUpdate = useCallback(async () => {
    try {
      const res = await fetch(`/meta.json?_=${Date.now()}`, {
        cache: 'no-store'
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
    } catch {
      // Network error - ignore
    }
  }, []);

  useEffect(() => {
    checkForUpdate();
    const interval = setInterval(checkForUpdate, CHECK_INTERVAL);
    return () => clearInterval(interval);
  }, [checkForUpdate]);

  const applyUpdate = useCallback(() => {
    window.location.reload();
  }, []);

  return { updateAvailable, applyUpdate };
}
