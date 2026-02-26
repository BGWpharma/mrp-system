import { useEffect, useRef, useCallback } from 'react';

/**
 * Lekki hook do synchronizacji między kartami przeglądarki przez BroadcastChannel.
 *
 * Karta widoczna wysyła powiadomienia o zmianach (broadcast).
 * Karty ukryte zbierają te powiadomienia i mogą zareagować
 * gdy staną się widoczne (onWakeWithPendingChanges).
 *
 * @param {string} channelName — nazwa kanału (np. 'orders-sync')
 * @param {Object} options
 * @param {Function} options.onWakeWithPendingChanges — wywoływana gdy karta staje się widoczna
 *   i miała oczekujące zmiany z channela
 */
export const useBroadcastSync = (channelName, { onWakeWithPendingChanges } = {}) => {
  const channelRef = useRef(null);
  const hasPendingRef = useRef(false);

  const broadcast = useCallback((data = {}) => {
    try {
      if (channelRef.current) {
        channelRef.current.postMessage({ type: 'data-changed', ...data });
      }
    } catch {
      // BroadcastChannel may not be supported
    }
  }, []);

  useEffect(() => {
    if (!channelName || typeof BroadcastChannel === 'undefined') return;

    try {
      channelRef.current = new BroadcastChannel(channelName);
    } catch {
      return;
    }

    const channel = channelRef.current;

    channel.onmessage = (event) => {
      if (event.data?.type === 'data-changed') {
        if (document.hidden) {
          hasPendingRef.current = true;
        }
      }
    };

    const handleVisibilityChange = () => {
      if (!document.hidden && hasPendingRef.current) {
        hasPendingRef.current = false;
        onWakeWithPendingChanges?.();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      try { channel.close(); } catch { /* ignore */ }
      channelRef.current = null;
    };
  }, [channelName, onWakeWithPendingChanges]);

  return { broadcast };
};
