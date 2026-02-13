/**
 * BGW Pool Calculation Utilities
 *
 * Oblicza sumę kosztów zakładu (Pula BGW) na podstawie obrotów Wn
 * z kont księgowych za dany miesiąc.
 *
 * Konfiguracja kont jest przechowywana w Firestore (bgwPoolConfig/default)
 * i edytowalna z panelu księgowego.
 *
 * @module utils/bgwPool
 */

const logger = require("firebase-functions/logger");
const {getNBPExchangeRate} = require("./exchangeRates");

// Import lazy (unikamy circular deps) - getOverlappingSessions i calculateEffectiveTime
// są dostępne z factoryCost.js, ale reimplementujemy tu dla niezależności


// ============================================================================
// DOMYŚLNA KONFIGURACJA (fallback gdy brak dokumentu w Firestore)
// ============================================================================

const DEFAULT_POOL_CONFIG = {
  // Konta WŁĄCZONE do Puli BGW (prefiksy accountNumber)
  includedPrefixes: [
    "401", // Amortyzacja
    "402-03", // Materiały pomocnicze
    "402-04", // Energia
    "403", // Usługi obce (wszystkie analityki: 403-01..05)
    "404", // Podatki i opłaty
    "405", // Wynagrodzenia
    "406", // Ubezpieczenia społeczne
    "409", // Pozostałe koszty rodzajowe
    "550", // Koszty ogólnego zarządu
  ],
  // Konta WYKLUCZONE (nawet jeśli pasują do włączonych)
  excludedPrefixes: [
    "402-01", // Surowce do produkcji (już w BOM)
    "402-02", // Opakowania (już w BOM)
  ],
  // Całe grupy ignorowane
  ignoredPrefixes: [
    "7", // Przychody i koszty finansowe (w tym 711, 742)
  ],
};

const BGW_POOL_CONFIG_COLLECTION = "bgwPoolConfig";
const BGW_POOL_CONFIG_DOC_ID = "default";

// ============================================================================
// KONFIGURACJA
// ============================================================================

/**
 * Pobiera konfigurację Puli BGW z Firestore
 * Fallback na domyślną konfigurację jeśli dokument nie istnieje
 * @param {FirebaseFirestore.Firestore} db - Instancja Firestore
 * @return {Promise<Object>} - Konfiguracja puli
 */
const getPoolConfig = async (db) => {
  try {
    const configDoc = await db
        .collection(BGW_POOL_CONFIG_COLLECTION)
        .doc(BGW_POOL_CONFIG_DOC_ID)
        .get();

    if (!configDoc.exists) {
      logger.info("[BGW Pool] Brak konfiguracji w Firestore, używam domyślnej");
      return {...DEFAULT_POOL_CONFIG};
    }

    const data = configDoc.data();
    return {
      includedPrefixes: data.includedPrefixes || DEFAULT_POOL_CONFIG.includedPrefixes,
      excludedPrefixes: data.excludedPrefixes || DEFAULT_POOL_CONFIG.excludedPrefixes,
      ignoredPrefixes: data.ignoredPrefixes || DEFAULT_POOL_CONFIG.ignoredPrefixes,
    };
  } catch (error) {
    logger.error("[BGW Pool] Błąd odczytu konfiguracji, używam domyślnej:", error);
    return {...DEFAULT_POOL_CONFIG};
  }
};

/**
 * Inicjalizuje domyślną konfigurację w Firestore (jeśli nie istnieje)
 * @param {FirebaseFirestore.Firestore} db - Instancja Firestore
 * @return {Promise<void>}
 */
const initializePoolConfig = async (db) => {
  const configRef = db
      .collection(BGW_POOL_CONFIG_COLLECTION)
      .doc(BGW_POOL_CONFIG_DOC_ID);

  const configDoc = await configRef.get();
  if (!configDoc.exists) {
    await configRef.set({
      ...DEFAULT_POOL_CONFIG,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    logger.info("[BGW Pool] Utworzono domyślną konfigurację w Firestore");
  }
};

// ============================================================================
// DOPASOWYWANIE KONT
// ============================================================================

/**
 * Sprawdza czy numer konta pasuje do konfiguracji Puli BGW
 * @param {string} accountNumber - Numer konta (np. "402-03", "403-01")
 * @param {Object} config - Konfiguracja puli
 * @return {boolean} - true jeśli konto wchodzi do puli
 */
const matchesPool = (accountNumber, config) => {
  if (!accountNumber) return false;

  const num = accountNumber.trim();

  // 1. Sprawdź ignorowane (całe grupy, np. "7")
  for (const prefix of config.ignoredPrefixes) {
    if (num.startsWith(prefix)) {
      return false;
    }
  }

  // 2. Sprawdź wykluczone (bardziej szczegółowe, np. "402-01")
  for (const prefix of config.excludedPrefixes) {
    if (num.startsWith(prefix)) {
      return false;
    }
  }

  // 3. Sprawdź włączone
  for (const prefix of config.includedPrefixes) {
    if (num.startsWith(prefix)) {
      return true;
    }
  }

  return false;
};

// ============================================================================
// OBLICZANIE PULI BGW
// ============================================================================

/**
 * Konwertuje Firestore Timestamp na Date
 * @param {any} value - Wartość daty
 * @return {Date|null}
 */
const toDate = (value) => {
  if (!value) return null;
  if (value.toDate) return value.toDate();
  if (value instanceof Date) return value;
  if (typeof value === "string" || typeof value === "number") return new Date(value);
  return null;
};

/**
 * Zwraca początek i koniec miesiąca
 * @param {number} year - Rok
 * @param {number} month - Miesiąc (1-based)
 * @return {{start: Date, end: Date}}
 */
const getMonthBoundaries = (year, month) => {
  const start = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const end = new Date(year, month, 0, 23, 59, 59, 999); // Ostatni dzień miesiąca
  return {start, end};
};

/**
 * Oblicza Pulę BGW dla danego miesiąca
 * Sumuje obroty Wn z kont pasujących do konfiguracji
 *
 * @param {FirebaseFirestore.Firestore} db - Instancja Firestore
 * @param {number} year - Rok
 * @param {number} month - Miesiąc (1-based)
 * @return {Promise<Object>} - Wynik obliczenia puli
 */
const calculateBGWPoolForMonth = async (db, year, month) => {
  const periodKey = `${year}-${String(month).padStart(2, "0")}`;
  logger.info(`[BGW Pool] Obliczanie puli dla ${periodKey}`);

  // 1. Pobierz konfigurację
  const config = await getPoolConfig(db);
  logger.info("[BGW Pool] Konfiguracja:", {
    included: config.includedPrefixes.length,
    excluded: config.excludedPrefixes.length,
    ignored: config.ignoredPrefixes.length,
  });

  // 2. Pobierz wszystkie aktywne konta z BookkeepingAccounts
  const accountsSnapshot = await db
      .collection("BookkeepingAccounts")
      .where("isActive", "==", true)
      .get();

  if (accountsSnapshot.empty) {
    logger.warn("[BGW Pool] Brak aktywnych kont w BookkeepingAccounts");
    return {
      totalAmountPLN: 0,
      totalAmountEUR: 0,
      exchangeRate: 0,
      rateDate: null,
      breakdown: [],
      entriesCount: 0,
      accountsCount: 0,
      periodKey,
    };
  }

  // 3. Filtruj konta pasujące do Puli BGW
  const poolAccounts = {};
  accountsSnapshot.forEach((doc) => {
    const data = doc.data();
    const accountNumber = data.accountNumber || "";
    if (matchesPool(accountNumber, config)) {
      poolAccounts[doc.id] = {
        id: doc.id,
        accountNumber,
        accountName: data.accountName || accountNumber,
      };
    }
  });

  const poolAccountIds = Object.keys(poolAccounts);
  logger.info(`[BGW Pool] Znaleziono ${poolAccountIds.length} kont w puli:`,
      Object.values(poolAccounts).map((a) => `${a.accountNumber} (${a.accountName})`));

  if (poolAccountIds.length === 0) {
    logger.warn("[BGW Pool] Żadne konto nie pasuje do konfiguracji puli");
    return {
      totalAmountPLN: 0,
      totalAmountEUR: 0,
      exchangeRate: 0,
      rateDate: null,
      breakdown: [],
      entriesCount: 0,
      accountsCount: 0,
      periodKey,
    };
  }

  // 4. Pobierz zaksięgowane wpisy w danym miesiącu
  const {start: monthStart, end: monthEnd} = getMonthBoundaries(year, month);

  const entriesSnapshot = await db
      .collection("journalEntries")
      .where("status", "==", "posted")
      .get();

  // Filtruj po dacie (client-side, bo Firestore nie pozwala na range + equality)
  const postedEntryIds = [];
  entriesSnapshot.forEach((doc) => {
    const data = doc.data();
    const entryDate = toDate(data.entryDate);
    if (entryDate && entryDate >= monthStart && entryDate <= monthEnd) {
      postedEntryIds.push(doc.id);
    }
  });

  logger.info(`[BGW Pool] Znaleziono ${postedEntryIds.length} zaksięgowanych wpisów w ${periodKey}`);

  if (postedEntryIds.length === 0) {
    return {
      totalAmountPLN: 0,
      totalAmountEUR: 0,
      exchangeRate: 0,
      rateDate: null,
      breakdown: [],
      entriesCount: 0,
      accountsCount: poolAccountIds.length,
      periodKey,
    };
  }

  // 5. Pobierz linie dziennika dla tych wpisów - batch'ami (max 30 w "in")
  const poolAccountIdSet = new Set(poolAccountIds);
  const accountDebits = {}; // accountId -> suma Wn

  const entryChunks = [];
  for (let i = 0; i < postedEntryIds.length; i += 30) {
    entryChunks.push(postedEntryIds.slice(i, i + 30));
  }

  for (const chunk of entryChunks) {
    const linesSnapshot = await db
        .collection("journalLines")
        .where("journalEntryId", "in", chunk)
        .get();

    linesSnapshot.forEach((doc) => {
      const line = doc.data();
      const accountId = line.accountId;

      // Sprawdź czy konto jest w puli
      if (!poolAccountIdSet.has(accountId)) return;

      // Sumuj obroty Wn (debitAmount)
      const debit = parseFloat(line.debitAmount) || 0;
      if (debit > 0) {
        accountDebits[accountId] = (accountDebits[accountId] || 0) + debit;
      }
    });
  }

  // 6. Zbuduj rozbicie po kontach
  const breakdown = [];
  let totalAmountPLN = 0;

  for (const [accountId, debitTotal] of Object.entries(accountDebits)) {
    const account = poolAccounts[accountId];
    if (!account) continue;

    breakdown.push({
      accountId,
      accountNumber: account.accountNumber,
      accountName: account.accountName,
      debitTotalPLN: Math.round(debitTotal * 100) / 100,
    });

    totalAmountPLN += debitTotal;
  }

  // Sortuj rozbicie po numerze konta
  breakdown.sort((a, b) => a.accountNumber.localeCompare(b.accountNumber));
  totalAmountPLN = Math.round(totalAmountPLN * 100) / 100;

  logger.info(`[BGW Pool] Suma obrotów Wn: ${totalAmountPLN} PLN z ${breakdown.length} kont`);

  // 7. Konwersja PLN -> EUR (kurs na ostatni dzień roboczy miesiąca)
  let totalAmountEUR = 0;
  let exchangeRate = 0;
  let rateDate = null;

  if (totalAmountPLN > 0) {
    try {
      const lastDay = new Date(year, month, 0); // Ostatni dzień miesiąca
      const eurRateInfo = await getNBPExchangeRate("EUR", lastDay);
      exchangeRate = eurRateInfo.rate;
      rateDate = eurRateInfo.date;
      totalAmountEUR = Math.round((totalAmountPLN / exchangeRate) * 100) / 100;

      logger.info(`[BGW Pool] Konwersja: ${totalAmountPLN} PLN / ${exchangeRate} = ${totalAmountEUR} EUR (kurs z ${rateDate})`);
    } catch (error) {
      logger.error("[BGW Pool] Błąd pobierania kursu EUR, próbuję kurs bieżący:", error);
      try {
        const {getNBPCurrentExchangeRate} = require("./exchangeRates");
        const eurRateInfo = await getNBPCurrentExchangeRate("EUR");
        exchangeRate = eurRateInfo.rate;
        rateDate = eurRateInfo.date;
        totalAmountEUR = Math.round((totalAmountPLN / exchangeRate) * 100) / 100;
      } catch (fallbackError) {
        logger.error("[BGW Pool] Nie udało się pobrać kursu EUR:", fallbackError);
        totalAmountEUR = 0;
      }
    }
  }

  return {
    totalAmountPLN,
    totalAmountEUR,
    exchangeRate,
    rateDate,
    breakdown,
    entriesCount: postedEntryIds.length,
    accountsCount: poolAccountIds.length,
    periodKey,
  };
};

// ============================================================================
// EFEKTYWNY CZAS PRODUKCJI
// ============================================================================

/**
 * Pobiera sesje produkcyjne nachodzące na zakres dat
 * Obsługuje zarówno Firestore Timestamp jak i string ISO w polu startTime/endTime
 * @param {FirebaseFirestore.Firestore} db - Instancja Firestore
 * @param {Date} rangeStart - Początek zakresu
 * @param {Date} rangeEnd - Koniec zakresu
 * @param {Array} excludedTaskIds - Lista ID zadań do wykluczenia
 * @return {Promise<Array>} - Lista sesji
 */
const getProductionSessionsInRange = async (db, rangeStart, rangeEnd, excludedTaskIds = []) => {
  const snapshot = await db.collection("productionHistory").get();
  const excludedSet = new Set(excludedTaskIds || []);

  const sessions = [];
  snapshot.forEach((doc) => {
    const data = doc.data();
    const startTime = toDate(data.startTime);
    const endTime = toDate(data.endTime);

    if (!startTime || !endTime) return;
    if (isNaN(startTime.getTime()) || isNaN(endTime.getTime())) return;
    if (startTime >= endTime) return;

    // Sprawdź wykluczenie
    if (data.taskId && excludedSet.has(data.taskId)) return;

    // Sprawdź nakładanie na zakres
    if (startTime <= rangeEnd && endTime >= rangeStart) {
      sessions.push({startTime, endTime, taskId: data.taskId});
    }
  });

  sessions.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
  return sessions;
};

/**
 * Oblicza efektywny czas produkcji (z eliminacją nakładających się sesji)
 * @param {Array} sessions - Lista sesji [{startTime, endTime}]
 * @param {Date} rangeStart - Początek zakresu
 * @param {Date} rangeEnd - Koniec zakresu
 * @return {Object} - {totalMinutes, totalHours, sessionsCount, mergedPeriodsCount}
 */
const computeEffectiveTime = (sessions, rangeStart, rangeEnd) => {
  if (!sessions || sessions.length === 0) {
    return {totalMinutes: 0, totalHours: 0, sessionsCount: 0, mergedPeriodsCount: 0};
  }

  // Łączenie nakładających się sesji
  const merged = [];
  let current = {
    startTime: sessions[0].startTime,
    endTime: sessions[0].endTime,
  };

  for (let i = 1; i < sessions.length; i++) {
    if (sessions[i].startTime <= current.endTime) {
      current.endTime = new Date(
          Math.max(current.endTime.getTime(), sessions[i].endTime.getTime()),
      );
    } else {
      merged.push(current);
      current = {startTime: sessions[i].startTime, endTime: sessions[i].endTime};
    }
  }
  merged.push(current);

  // Oblicz łączny czas z przycinaniem do granic zakresu
  let totalMinutes = 0;
  merged.forEach((period) => {
    const effectiveStart = new Date(
        Math.max(period.startTime.getTime(), rangeStart.getTime()),
    );
    const effectiveEnd = new Date(
        Math.min(period.endTime.getTime(), rangeEnd.getTime()),
    );
    if (effectiveStart < effectiveEnd) {
      totalMinutes += (effectiveEnd.getTime() - effectiveStart.getTime()) / (1000 * 60);
    }
  });

  return {
    totalMinutes: Math.round(totalMinutes * 100) / 100,
    totalHours: Math.round((totalMinutes / 60) * 100) / 100,
    sessionsCount: sessions.length,
    mergedPeriodsCount: merged.length,
  };
};

// ============================================================================
// SYNCHRONIZACJA Z FACTORY COSTS
// ============================================================================

/**
 * Synchronizuje koszt zakładu z danymi księgowymi dla danego miesiąca
 * Szuka lub tworzy dokument factoryCosts z source="accounting"
 * Aktualizuje kwotę (amount) na podstawie Puli BGW
 *
 * @param {FirebaseFirestore.Firestore} db - Instancja Firestore
 * @param {number} year - Rok
 * @param {number} month - Miesiąc (1-based)
 * @return {Promise<Object>} - Wynik synchronizacji
 */
const syncFactoryCostWithAccounting = async (db, year, month) => {
  const periodKey = `${year}-${String(month).padStart(2, "0")}`;
  logger.info(`[BGW Pool] Synchronizacja factoryCosts dla ${periodKey}`);

  // 1. Oblicz Pulę BGW
  const pool = await calculateBGWPoolForMonth(db, year, month);

  // 2. Szukaj istniejącego dokumentu factoryCosts z source="accounting"
  const {start: monthStart, end: monthEnd} = getMonthBoundaries(year, month);
  const costsSnapshot = await db
      .collection("factoryCosts")
      .where("source", "==", "accounting")
      .get();

  let existingCostDoc = null;
  costsSnapshot.forEach((doc) => {
    const data = doc.data();
    if (data.periodKey === periodKey) {
      existingCostDoc = {id: doc.id, ref: doc.ref, data};
    }
  });

  // 3. Oblicz efektywny czas produkcji w tym miesiącu
  const excludedTaskIds = existingCostDoc?.data?.excludedTaskIds || [];
  const sessions = await getProductionSessionsInRange(
      db, monthStart, monthEnd, excludedTaskIds,
  );
  const effectiveTime = computeEffectiveTime(sessions, monthStart, monthEnd);

  // Oblicz costPerMinute
  const amount = pool.totalAmountEUR;
  const costPerMinute = effectiveTime.totalMinutes > 0 ?
    Math.round((amount / effectiveTime.totalMinutes) * 100) / 100 : 0;
  const costPerHour = Math.round(costPerMinute * 60 * 100) / 100;

  logger.info(`[BGW Pool] Efektywny czas: ${effectiveTime.totalHours}h (${effectiveTime.sessionsCount} sesji), costPerMinute: ${costPerMinute}`);

  // 4. Przygotuj dane do zapisu
  const admin = require("firebase-admin");
  const costData = {
    amount,
    source: "accounting",
    periodKey,
    bgwAmountPLN: pool.totalAmountPLN,
    bgwExchangeRate: pool.exchangeRate,
    bgwRateDate: pool.rateDate,
    bgwBreakdown: pool.breakdown,
    bgwEntriesCount: pool.entriesCount,
    bgwAccountsCount: pool.accountsCount,
    bgwLastSyncAt: admin.firestore.FieldValue.serverTimestamp(),
    // Efektywny czas i koszt na minutę (obliczone tu, nie czekając na frontend)
    effectiveMinutes: effectiveTime.totalMinutes,
    effectiveHours: effectiveTime.totalHours,
    sessionsCount: effectiveTime.sessionsCount,
    mergedPeriodsCount: effectiveTime.mergedPeriodsCount,
    costPerMinute,
    costPerHour,
    excludedSessionsCount: 0,
    duplicatesEliminated: 0,
    clippedPeriods: 0,
    lastCalculatedAt: admin.firestore.FieldValue.serverTimestamp(),
    _triggeredByFunction: true,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  let costDocId;

  if (existingCostDoc) {
    // Aktualizuj istniejący dokument (nawet jeśli kwota = 0, bo mogło być storno)
    await existingCostDoc.ref.update(costData);
    costDocId = existingCostDoc.id;
    logger.info(`[BGW Pool] Zaktualizowano factoryCosts/${costDocId}: ${amount} EUR, costPerMinute: ${costPerMinute}`);
  } else if (pool.totalAmountPLN > 0) {
    // Utwórz nowy dokument TYLKO jeśli suma > 0 (nie tworzymy pustych)
    const newDoc = await db.collection("factoryCosts").add({
      ...costData,
      startDate: admin.firestore.Timestamp.fromDate(monthStart),
      endDate: admin.firestore.Timestamp.fromDate(monthEnd),
      description: `Koszt zakładu (księgowość) - ${periodKey}`,
      excludedTaskIds: [],
      isPaid: true,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    costDocId = newDoc.id;
    logger.info(`[BGW Pool] Utworzono factoryCosts/${costDocId}: ${amount} EUR, costPerMinute: ${costPerMinute}`);
  } else {
    logger.info(`[BGW Pool] Pula = 0 PLN dla ${periodKey}, nie tworzę dokumentu`);
    costDocId = null;
  }

  return {
    costDocId,
    periodKey,
    totalAmountPLN: pool.totalAmountPLN,
    totalAmountEUR: pool.totalAmountEUR,
    exchangeRate: pool.exchangeRate,
    isNew: !existingCostDoc,
    accountsCount: pool.accountsCount,
    entriesCount: pool.entriesCount,
    effectiveHours: effectiveTime.totalHours,
    effectiveMinutes: effectiveTime.totalMinutes,
    costPerMinute,
    sessionsCount: effectiveTime.sessionsCount,
  };
};

module.exports = {
  DEFAULT_POOL_CONFIG,
  BGW_POOL_CONFIG_COLLECTION,
  BGW_POOL_CONFIG_DOC_ID,
  getPoolConfig,
  initializePoolConfig,
  matchesPool,
  calculateBGWPoolForMonth,
  syncFactoryCostWithAccounting,
  getMonthBoundaries,
};
