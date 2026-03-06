/**
 * Centralny menedżer cache dla serwisów
 * 
 * Zapewnia:
 * - In-memory cache z TTL i LRU eviction
 * - Deduplikację równoległych zapytań (getOrFetch)
 * - Event-based invalidację (subscribe/notify)
 * - Atomowe operacje get-or-fetch
 */

const MAX_CACHE_SIZE = 500;

const cacheStore = new Map();
const listeners = new Map();
const pendingFetches = new Map();

export const ServiceCacheManager = {
  /**
   * Pobiera dane z cache jeśli istnieją i nie wygasły
   * @param {string} key - Klucz cache
   * @returns {*|null} - Dane z cache lub null
   */
  get(key) {
    const entry = cacheStore.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > entry.ttl) {
      cacheStore.delete(key);
      return null;
    }
    entry.lastAccessed = Date.now();
    return entry.data;
  },

  /**
   * Zapisuje dane w cache
   * @param {string} key - Klucz cache
   * @param {*} data - Dane do zapisania
   * @param {number} ttl - Czas życia w ms (domyślnie 5 min)
   */
  set(key, data, ttl = 5 * 60 * 1000) {
    const now = Date.now();
    cacheStore.set(key, { data, timestamp: now, lastAccessed: now, ttl });
    this._evictIfNeeded();
    this._notify(key, data);
  },

  /**
   * Invaliduje cache dla danego klucza i powiadamia subskrybentów
   * @param {string} key - Klucz cache do invalidacji
   */
  invalidate(key) {
    cacheStore.delete(key);
    this._notify(key, null);
  },

  /**
   * Subskrybuje zmiany dla danego klucza cache
   * @param {string} key - Klucz cache
   * @param {Function} callback - Funkcja wywoływana przy zmianie (data | null)
   * @returns {Function} - Funkcja unsubscribe
   */
  subscribe(key, callback) {
    if (!listeners.has(key)) listeners.set(key, new Set());
    listeners.get(key).add(callback);
    return () => listeners.get(key)?.delete(callback);
  },

  /**
   * Atomowy get-or-fetch z deduplikacją równoległych zapytań.
   * Jeśli dane są w cache — zwraca natychmiast.
   * Jeśli fetch już trwa — czeka na jego zakończenie (nie duplikuje).
   * 
   * @param {string} key - Klucz cache
   * @param {Function} fetchFn - Async funkcja pobierająca dane
   * @param {number} ttl - Czas życia w ms (domyślnie 5 min)
   * @returns {Promise<*>} - Dane z cache lub świeżo pobrane
   */
  async getOrFetch(key, fetchFn, ttl = 5 * 60 * 1000) {
    const cached = this.get(key);
    if (cached) return cached;

    if (pendingFetches.has(key)) {
      return pendingFetches.get(key);
    }

    const promise = fetchFn().then(data => {
      this.set(key, data, ttl);
      pendingFetches.delete(key);
      return data;
    }).catch(err => {
      pendingFetches.delete(key);
      throw err;
    });

    pendingFetches.set(key, promise);
    return promise;
  },

  /**
   * Sprawdza czy klucz istnieje w cache i nie wygasł
   * @param {string} key - Klucz cache
   * @returns {boolean}
   */
  has(key) {
    return this.get(key) !== null;
  },

  /**
   * Czyści cały cache
   */
  clear() {
    cacheStore.clear();
    pendingFetches.clear();
  },

  /**
   * Invaliduje wszystkie klucze zaczynające się od podanego prefixu
   * @param {string} prefix - Prefix kluczy do invalidacji
   */
  invalidateByPrefix(prefix) {
    for (const key of [...cacheStore.keys()]) {
      if (key.startsWith(prefix)) {
        cacheStore.delete(key);
        this._notify(key, null);
      }
    }
  },

  /**
   * Invaliduje klucze pasujące do predykatu
   * @param {function(string, *): boolean} predicate - Funkcja (key, data) => boolean
   */
  invalidateByPredicate(predicate) {
    for (const [key, entry] of [...cacheStore.entries()]) {
      if (predicate(key, entry.data)) {
        cacheStore.delete(key);
        this._notify(key, null);
      }
    }
  },

  /**
   * Zwraca statystyki cache (do diagnostyki/monitoringu)
   * @returns {{ total: number, maxSize: number, keys: Array<{ key: string, ageMs: number, ttlMs: number, expired: boolean }> }}
   */
  getStats() {
    const stats = { total: cacheStore.size, maxSize: MAX_CACHE_SIZE, keys: [] };
    for (const [key, entry] of cacheStore.entries()) {
      const age = Date.now() - entry.timestamp;
      stats.keys.push({
        key,
        ageMs: age,
        ttlMs: entry.ttl,
        expired: age > entry.ttl
      });
    }
    return stats;
  },

  /** @private */
  _evictIfNeeded() {
    if (cacheStore.size <= MAX_CACHE_SIZE) return;
    let oldestKey = null;
    let oldestAccess = Infinity;
    for (const [key, entry] of cacheStore) {
      if (entry.lastAccessed < oldestAccess) {
        oldestAccess = entry.lastAccessed;
        oldestKey = key;
      }
    }
    if (oldestKey) cacheStore.delete(oldestKey);
  },

  /** @private */
  _notify(key, data) {
    const keyListeners = listeners.get(key);
    if (keyListeners) {
      keyListeners.forEach(cb => {
        try {
          cb(data);
        } catch (err) {
          console.error(`[ServiceCacheManager] Błąd w listenerze dla klucza "${key}":`, err);
        }
      });
    }
  }
};

export default ServiceCacheManager;
