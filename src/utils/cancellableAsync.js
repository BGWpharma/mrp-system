/**
 * Wrapper na funkcje async umozliwiajacy anulowanie przez AbortSignal.
 * Konieczny poniewaz Firestore SDK (getDocs/getDoc) nie obsluguje AbortSignal natywnie.
 *
 * @param {Function} asyncFn - Funkcja async do wykonania
 * @param {AbortSignal} [signal] - Opcjonalny AbortSignal do anulowania
 * @returns {Promise<*>} - Wynik asyncFn lub odrzucony Promise jesli anulowano
 */
export const cancellableAsync = (asyncFn, signal) => {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }

    let settled = false;

    const onAbort = () => {
      if (!settled) {
        settled = true;
        reject(new DOMException('Aborted', 'AbortError'));
      }
    };

    signal?.addEventListener('abort', onAbort, { once: true });

    asyncFn()
      .then(result => {
        signal?.removeEventListener('abort', onAbort);
        if (settled) return;
        settled = true;
        if (signal?.aborted) {
          reject(new DOMException('Aborted', 'AbortError'));
        } else {
          resolve(result);
        }
      })
      .catch(err => {
        signal?.removeEventListener('abort', onAbort);
        if (settled) return;
        settled = true;
        reject(err);
      });
  });
};

/**
 * Sprawdza czy blad jest wynikiem anulowania (AbortError).
 * Uzyj w blokach catch zeby nie logowac anulowanych requestow jako bledow.
 *
 * @param {Error} err - Blad do sprawdzenia
 * @returns {boolean}
 */
export const isAbortError = (err) => {
  return err?.name === 'AbortError' || err?.message === 'Aborted';
};
