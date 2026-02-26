import { useEffect, useRef, useCallback } from 'react';
import { onSnapshot } from 'firebase/firestore';

const VISIBILITY_DEBOUNCE_MS = 1000;

/**
 * Wrapper na Firestore onSnapshot z Page Visibility API.
 * Ukryte karty przeglądarki nie utrzymują aktywnych listenerów —
 * listener jest odłączany gdy karta staje się ukryta i podłączany ponownie
 * gdy karta wraca do widoczności (z debounce 1s).
 *
 * @param {import('firebase/firestore').Query | import('firebase/firestore').DocumentReference | null} queryOrRef
 * @param {object|null} snapshotOptions  — opcjonalne opcje snapshotu (np. { includeMetadataChanges: false })
 * @param {Function} onNext             — callback wywoływany przy każdym uaktualnieniu snapshotu
 * @param {Function} [onError]          — callback błędu
 * @param {Array}    deps               — tablica zależności (jak w useEffect)
 */
export const useVisibilityAwareSnapshot = (
  queryOrRef,
  snapshotOptions,
  onNext,
  onError,
  deps = []
) => {
  const unsubRef = useRef(null);
  const debounceRef = useRef(null);

  const subscribe = useCallback(() => {
    if (unsubRef.current) return;
    if (!queryOrRef) return;

    if (snapshotOptions) {
      unsubRef.current = onSnapshot(queryOrRef, snapshotOptions, onNext, onError);
    } else {
      unsubRef.current = onSnapshot(queryOrRef, onNext, onError);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  const unsubscribe = useCallback(() => {
    if (unsubRef.current) {
      unsubRef.current();
      unsubRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!queryOrRef) return;

    if (!document.hidden) {
      subscribe();
    }

    const handleVisibilityChange = () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }

      if (document.hidden) {
        debounceRef.current = setTimeout(() => {
          unsubscribe();
        }, VISIBILITY_DEBOUNCE_MS);
      } else {
        subscribe();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      unsubscribe();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
};
