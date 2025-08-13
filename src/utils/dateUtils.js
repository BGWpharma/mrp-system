/**
 * Formatuje obiekt Timestamp z Firestore na czytelny dla użytkownika format daty
 * @param {Object|Date} timestamp - Obiekt Timestamp z Firestore lub obiekt Date
 * @param {Boolean} includeTime - Czy dołączyć czas (domyślnie true)
 * @returns {String} Sformatowana data w formacie DD.MM.YYYY HH:MM lub DD.MM.YYYY
 */
export const formatTimestamp = (timestamp, includeTime = true) => {
  if (!timestamp) return '-';
  
  // Konwersja z Firestore Timestamp na Date jeśli potrzebne
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  
  return formatDate(date, includeTime);
};

/**
 * Formatuje obiekt Date na czytelny dla użytkownika format
 * @param {Date} date - Obiekt Date do sformatowania
 * @param {Boolean} includeTime - Czy dołączyć czas (domyślnie true)
 * @returns {String} Sformatowana data w formacie DD.MM.YYYY HH:MM lub DD.MM.YYYY
 */
export const formatDate = (date, includeTime = true) => {
  if (!date) return '-';
  
  // Obsługa przypadku gdy date jest stringiem
  if (typeof date === 'string') {
    date = new Date(date);
  }
  
  // Sprawdź czy data jest prawidłowa
  if (!(date instanceof Date) || isNaN(date.getTime())) {
    return '-';
  }
  
  // Formatowanie daty
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear();
  
  if (!includeTime) {
    return `${day}.${month}.${year}`;
  }
  
  // Formatowanie czasu
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  
  return `${day}.${month}.${year} ${hours}:${minutes}`;
};

/**
 * Formatuje datę do formatu ISO dla inputów typu date
 * @param {Date|String} date - Data do sformatowania
 * @returns {String} Data w formacie YYYY-MM-DD
 */
export const formatDateForInput = (date) => {
  if (!date) return '';
  
  try {
    // Obsługa obiektu timestamp z Firebase
    if (date && typeof date.toDate === 'function') {
      date = date.toDate();
    }
    
    // Zapewnij, że pracujemy z obiektem Date
    let dateObj;
    
    if (typeof date === 'string') {
      // Sprawdź, czy format jest już poprawny dla pola input (YYYY-MM-DD)
      if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return date;
      }
      
      // Spróbuj sparsować datę
      dateObj = new Date(date);
    } else if (date instanceof Date) {
      // Jeśli to obiekt Date, użyj go bezpośrednio
      dateObj = date;
    } else {
      // Inne przypadki - próba konwersji na Date
      try {
        dateObj = new Date(date);
      } catch (error) {
        console.warn('Błąd konwersji daty:', error);
        return '';
      }
    }
    
    // Sprawdź czy data jest prawidłowa
    if (isNaN(dateObj.getTime())) {
      console.warn('Nieprawidłowy format daty:', date);
      return '';
    }
    
    // Formatuj do YYYY-MM-DD
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const day = String(dateObj.getDate()).padStart(2, '0');
    
    const formattedDate = `${year}-${month}-${day}`;
    
    return formattedDate;
  } catch (error) {
    console.error('formatDateForInput - wyjątek przy formatowaniu daty:', error, 'dla wartości:', date);
    // W przypadku błędu zwracamy pusty string, aby nie łamać interfejsu
    return '';
  }
};

/**
 * Zwraca pierwszy dzień miesiąca
 * @param {Date} date - Data (opcjonalna, domyślnie bieżąca data)
 * @returns {Date} Pierwszy dzień miesiąca
 */
export const getFirstDayOfMonth = (date = new Date()) => {
  const newDate = new Date(date);
  newDate.setDate(1);
  return newDate;
};

/**
 * Zwraca ostatni dzień miesiąca
 * @param {Date} date - Data (opcjonalna, domyślnie bieżąca data)
 * @returns {Date} Ostatni dzień miesiąca
 */
export const getLastDayOfMonth = (date = new Date()) => {
  const newDate = new Date(date);
  newDate.setMonth(newDate.getMonth() + 1);
  newDate.setDate(0);
  return newDate;
};

/**
 * Bezpiecznie konwertuje różne formaty daty na obiekt Date
 * @param {*} dateValue - Wartość daty (Date, Timestamp, string, itp.)
 * @returns {Date|null} Zwraca obiekt Date lub null jeśli konwersja nie jest możliwa
 */
export const safeParseDate = (dateValue) => {
  if (!dateValue) {
    return null;
  }
  
  try {
    // Jeśli to już obiekt Date
    if (dateValue instanceof Date) {
      return dateValue;
    }
    
    // Sprawdź czy to serverTimestamp placeholder - nie próbuj konwertować
    if (dateValue && typeof dateValue === 'object' && dateValue._methodName === 'serverTimestamp') {
      return null; // serverTimestamp jeszcze nie został zapisany w bazie
    }
    
    // Jeśli to Timestamp z Firestore
    if (dateValue && typeof dateValue.toDate === 'function') {
      return dateValue.toDate();
    }
    
    // Jeśli to timestamp w sekundach (obiekt z polem seconds)
    if (dateValue && typeof dateValue === 'object' && dateValue.seconds) {
      return new Date(dateValue.seconds * 1000);
    }
    
    // Jeśli to string lub liczba - próba konwersji
    if (typeof dateValue === 'string' || typeof dateValue === 'number') {
      const parsedDate = new Date(dateValue);
      if (!isNaN(parsedDate.getTime())) {
        return parsedDate;
      }
    }
    
    // Jeśli dotarliśmy tutaj, to nieobsługiwany format
    console.warn('safeParseDate - nieprawidłowy format daty:', dateValue);
    return null;
  } catch (error) {
    console.error('safeParseDate - błąd podczas konwersji daty:', error);
    return null;
  }
};

/**
 * Zapewnia, że wartość daty używana w formularzu jest stringiem w formacie YYYY-MM-DD
 * @param {*} dateValue - Dowolna wartość daty (obiekt Date, string, timestamp, itp.)
 * @returns {String} Data w formacie YYYY-MM-DD lub pusty string
 */
export const ensureDateInputFormat = (dateValue) => {
  if (!dateValue) return '';
  
  // Jeśli to już string w formacie YYYY-MM-DD, zwróć go bezpośrednio
  if (typeof dateValue === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
    return dateValue;
  }
  
  // W przeciwnym razie użyj formatDateForInput
  return formatDateForInput(dateValue);
};

/**
 * Sprawdza czy podana data to weekend (sobota lub niedziela)
 * @param {Date} date - Data do sprawdzenia
 * @returns {Boolean} true jeśli to weekend, false w przeciwnym przypadku
 */
export const isWeekend = (date) => {
  if (!date || !(date instanceof Date)) {
    return false;
  }
  
  const dayOfWeek = date.getDay();
  return dayOfWeek === 0 || dayOfWeek === 6; // 0 = niedziela, 6 = sobota
};

/**
 * Sprawdza czy podana data to dzień roboczy (poniedziałek-piątek)
 * @param {Date} date - Data do sprawdzenia
 * @returns {Boolean} true jeśli to dzień roboczy, false w przeciwnym przypadku
 */
export const isWorkingDay = (date) => {
  return !isWeekend(date);
};

/**
 * Dodaje określoną liczbę dni roboczych do podanej daty
 * @param {Date} startDate - Data początkowa
 * @param {number} workingDaysToAdd - Liczba dni roboczych do dodania
 * @returns {Date} Nowa data z dodanymi dniami roboczymi
 */
export const addWorkingDays = (startDate, workingDaysToAdd) => {
  if (!startDate || !(startDate instanceof Date)) {
    throw new Error('startDate musi być prawidłowym obiektem Date');
  }
  
  if (workingDaysToAdd <= 0) {
    return new Date(startDate);
  }
  
  const result = new Date(startDate);
  let daysAdded = 0;
  
  while (daysAdded < workingDaysToAdd) {
    result.setDate(result.getDate() + 1);
    
    if (isWorkingDay(result)) {
      daysAdded++;
    }
  }
  
  return result;
};

/**
 * Oblicza liczbę dni roboczych między dwiema datami (wyłączając datę końcową)
 * @param {Date} startDate - Data początkowa
 * @param {Date} endDate - Data końcowa
 * @returns {number} Liczba dni roboczych między datami
 */
export const getWorkingDaysBetween = (startDate, endDate) => {
  if (!startDate || !endDate || !(startDate instanceof Date) || !(endDate instanceof Date)) {
    return 0;
  }
  
  if (startDate >= endDate) {
    return 0;
  }
  
  let workingDays = 0;
  const current = new Date(startDate);
  
  while (current < endDate) {
    if (isWorkingDay(current)) {
      workingDays++;
    }
    current.setDate(current.getDate() + 1);
  }
  
  return workingDays;
};

/**
 * Dodaje minuty produkcji do daty, uwzględniając tylko dni robocze
 * @param {Date} startDate - Data rozpoczęcia
 * @param {number} productionMinutes - Liczba minut produkcji
 * @param {Object} options - Opcje obliczania
 * @param {number} options.workingHoursPerDay - Liczba godzin roboczych dziennie (domyślnie 8)
 * @param {number} options.startHour - Godzina rozpoczęcia pracy (domyślnie 8)
 * @param {number} options.endHour - Godzina zakończenia pracy (domyślnie 16)
 * @returns {Date} Data zakończenia produkcji
 */
export const addProductionTime = (startDate, productionMinutes, options = {}) => {
  const {
    workingHoursPerDay = 8,
    startHour = 8,
    endHour = 16
  } = options;
  
  if (!startDate || !(startDate instanceof Date)) {
    throw new Error('startDate musi być prawidłowym obiektem Date');
  }
  
  if (productionMinutes <= 0) {
    return new Date(startDate);
  }
  
  const workingMinutesPerDay = workingHoursPerDay * 60;
  const result = new Date(startDate);
  let remainingMinutes = productionMinutes;
  
  // Jeśli data rozpoczęcia jest w weekend, przenieś do następnego dnia roboczego
  while (isWeekend(result)) {
    result.setDate(result.getDate() + 1);
    result.setHours(startHour, 0, 0, 0);
  }
  
  // Upewnij się, że zaczynamy w godzinach roboczych
  if (result.getHours() < startHour) {
    result.setHours(startHour, 0, 0, 0);
  } else if (result.getHours() >= endHour) {
    // Jeśli po godzinach roboczych, przenieś do następnego dnia roboczego
    result.setDate(result.getDate() + 1);
    while (isWeekend(result)) {
      result.setDate(result.getDate() + 1);
    }
    result.setHours(startHour, 0, 0, 0);
  }
  
  while (remainingMinutes > 0) {
    // Sprawdź ile minut zostało do końca dnia roboczego
    const currentHour = result.getHours();
    const currentMinute = result.getMinutes();
    const minutesUntilEndOfWorkDay = (endHour * 60) - (currentHour * 60 + currentMinute);
    
    if (remainingMinutes <= minutesUntilEndOfWorkDay) {
      // Można zakończyć w tym samym dniu roboczym
      result.setMinutes(result.getMinutes() + remainingMinutes);
      remainingMinutes = 0;
    } else {
      // Potrzeba więcej dni roboczych
      remainingMinutes -= minutesUntilEndOfWorkDay;
      
      // Przejdź do następnego dnia roboczego
      result.setDate(result.getDate() + 1);
      while (isWeekend(result)) {
        result.setDate(result.getDate() + 1);
      }
      result.setHours(startHour, 0, 0, 0);
    }
  }
  
  return result;
};

/**
 * Oblicza czas produkcji w minutach między dwiema datami, uwzględniając tylko dni robocze
 * @param {Date} startDate - Data rozpoczęcia
 * @param {Date} endDate - Data zakończenia
 * @param {Object} options - Opcje obliczania
 * @param {number} options.workingHoursPerDay - Liczba godzin roboczych dziennie (domyślnie 8)
 * @param {number} options.startHour - Godzina rozpoczęcia pracy (domyślnie 8)
 * @param {number} options.endHour - Godzina zakończenia pracy (domyślnie 16)
 * @returns {number} Liczba minut produkcji
 */
export const getProductionTimeBetween = (startDate, endDate, options = {}) => {
  const {
    workingHoursPerDay = 8,
    startHour = 8,
    endHour = 16
  } = options;
  
  if (!startDate || !endDate || !(startDate instanceof Date) || !(endDate instanceof Date)) {
    return 0;
  }
  
  if (startDate >= endDate) {
    return 0;
  }
  
  let totalMinutes = 0;
  const current = new Date(startDate);
  const end = new Date(endDate);
  
  // Upewnij się, że zaczynamy w dniu roboczym
  while (isWeekend(current) && current < end) {
    current.setDate(current.getDate() + 1);
    current.setHours(startHour, 0, 0, 0);
  }
  
  if (current >= end) {
    return 0;
  }
  
  while (current < end) {
    if (isWorkingDay(current)) {
      const dayStart = new Date(current);
      dayStart.setHours(startHour, 0, 0, 0);
      
      const dayEnd = new Date(current);
      dayEnd.setHours(endHour, 0, 0, 0);
      
      const effectiveStart = current < dayStart ? dayStart : current;
      const effectiveEnd = end > dayEnd ? dayEnd : end;
      
      if (effectiveStart < effectiveEnd) {
        const dailyMinutes = (effectiveEnd - effectiveStart) / (1000 * 60);
        totalMinutes += dailyMinutes;
      }
    }
    
    // Przejdź do następnego dnia
    current.setDate(current.getDate() + 1);
    current.setHours(startHour, 0, 0, 0);
  }
  
  return Math.round(totalMinutes);
};

/**
 * Rozszerza okres o weekendy - dodaje 48h za każdy weekend w okresie
 * ale nie zmienia godzin - tylko wydłuża okres o całe dni weekendowe
 * @param {Date} startDate - Data rozpoczęcia
 * @param {Date} endDate - Data zakończenia
 * @returns {Date} Nowa data zakończenia z uwzględnionymi weekendami
 */
export const extendPeriodForWeekends = (startDate, endDate) => {
  if (!startDate || !endDate || !(startDate instanceof Date) || !(endDate instanceof Date)) {
    return endDate;
  }
  
  if (startDate >= endDate) {
    return endDate;
  }
  
  const result = new Date(endDate);
  const current = new Date(startDate);
  
  // Przechodź przez wszystkie dni w okresie i licz weekendy
  while (current < endDate) {
    if (isWeekend(current)) {
      // Dodaj 24 godziny za każdy dzień weekendu
      result.setTime(result.getTime() + (24 * 60 * 60 * 1000));
    }
    current.setDate(current.getDate() + 1);
  }
  
  return result;
};

/**
 * Oblicza datę zakończenia pomijając weekendy w czasie produkcji
 * Weekendy nie są wliczane do czasu produkcji
 * @param {Date} startDate - Data rozpoczęcia produkcji
 * @param {number} productionMinutes - Czas produkcji w minutach (tylko dni robocze)
 * @returns {Date} Data zakończenia z pominięciem weekendów
 */
export const calculateEndDateExcludingWeekends = (startDate, productionMinutes) => {
  if (!startDate || !(startDate instanceof Date)) {
    return startDate;
  }
  
  if (!productionMinutes || productionMinutes <= 0) {
    return new Date(startDate);
  }
  
  const result = new Date(startDate);
  let remainingMinutes = productionMinutes;
  
  // Jeśli zaczynamy w weekend, przesuń do następnego poniedziałku z tą samą godziną
  while (isWeekend(result)) {
    result.setDate(result.getDate() + 1);
  }
  
  // Dodawaj czas minutę po minucie, pomijając weekendy
  while (remainingMinutes > 0) {
    // Dodaj jedną minutę
    result.setMinutes(result.getMinutes() + 1);
    remainingMinutes--;
    
    // Sprawdź czy nie wpadliśmy w weekend
    if (isWeekend(result)) {
      // Jeśli tak, przesuń do następnego poniedziałku z tą samą godziną co była w piątek
      const hourBeforeWeekend = result.getHours();
      const minuteBeforeWeekend = result.getMinutes();
      
      // Przesuń do poniedziałku
      while (isWeekend(result)) {
        result.setDate(result.getDate() + 1);
      }
      
      // Ustaw tę samą godzinę co była przed weekendem
      result.setHours(hourBeforeWeekend, minuteBeforeWeekend, 0, 0);
    }
  }
  
  return result;
};

/**
 * Oblicza czas produkcji w minutach między dwiema datami, pomijając weekendy
 * @param {Date} startDate - Data rozpoczęcia
 * @param {Date} endDate - Data zakończenia
 * @returns {number} Liczba minut produkcji (tylko dni robocze)
 */
export const calculateProductionTimeBetweenExcludingWeekends = (startDate, endDate) => {
  if (!startDate || !endDate || !(startDate instanceof Date) || !(endDate instanceof Date)) {
    return 0;
  }
  
  if (startDate >= endDate) {
    return 0;
  }
  
  let totalMinutes = 0;
  const current = new Date(startDate);
  
  // Przechodź przez każdą minutę i liczbę tylko te w dni robocze
  while (current < endDate) {
    if (isWorkingDay(current)) {
      totalMinutes++;
    }
    current.setMinutes(current.getMinutes() + 1);
  }
  
  return totalMinutes;
};

/**
 * Oblicza datę zakończenia dla timeline - nie przesuwa daty rozpoczęcia, tylko pomija weekendy w obliczeniach
 * @param {Date} startDate - Data rozpoczęcia (zachowana bez zmian)
 * @param {number} productionMinutes - Czas produkcji w minutach (tylko dni robocze)
 * @returns {Date} Data zakończenia z pominięciem weekendów
 */
export const calculateEndDateForTimeline = (startDate, productionMinutes) => {
  if (!startDate || !(startDate instanceof Date)) {
    return startDate;
  }
  
  if (!productionMinutes || productionMinutes <= 0) {
    return new Date(startDate);
  }
  
  const result = new Date(startDate);
  let remainingMinutes = productionMinutes;
  
  // NIE przesuwaj daty rozpoczęcia - zachowaj ją dokładnie tak jak użytkownik ustawił
  // ALE jeśli zaczynamy w weekend, przeskocz do poniedziałku zachowując godzinę
  if (isWeekend(result)) {
    const originalHour = result.getHours();
    const originalMinute = result.getMinutes();
    
    // Przesuń do następnego poniedziałku
    while (isWeekend(result)) {
      result.setDate(result.getDate() + 1);
    }
    
    // Przywróć oryginalną godzinę
    result.setHours(originalHour, originalMinute, 0, 0);
  }
  
  // Dodawaj czas minutę po minucie, ale TYLKO w dni robocze
  while (remainingMinutes > 0) {
    // Sprawdź czy aktualny moment to dzień roboczy
    if (isWorkingDay(result)) {
      // Jest dzień roboczy - odejmij minutę z pozostałego czasu i dodaj do wyniku
      remainingMinutes--;
      result.setMinutes(result.getMinutes() + 1);
    } else {
      // Jest weekend - przeskocz do następnego dnia bez odejmowania minut z remainingMinutes
      result.setDate(result.getDate() + 1);
      result.setHours(result.getHours(), result.getMinutes(), 0, 0); // Zachowaj godzinę
    }
  }
  
  return result;
};

/**
 * Oblicza szacowany czas produkcji z pominięciem weekendów
 * @param {number} baseProductionTimeMinutes - Podstawowy czas produkcji w minutach
 * @param {Date} startDate - Data rozpoczęcia (opcjonalna, używana do sprawdzenia weekendów)
 * @returns {number} Czas produkcji z uwzględnieniem tylko dni roboczych
 */
export const calculateProductionTimeExcludingWeekends = (baseProductionTimeMinutes, startDate = new Date()) => {
  if (!baseProductionTimeMinutes || baseProductionTimeMinutes <= 0) {
    return 0;
  }
  
  // Jeśli to krótkie zadanie (mniej niż dzień roboczy), nie modyfikuj
  const workingMinutesPerDay = 8 * 60; // 8 godzin roboczych
  if (baseProductionTimeMinutes <= workingMinutesPerDay) {
    return baseProductionTimeMinutes;
  }
  
  // Dla dłuższych zadań, oblicz tylko dni robocze
  const workingDays = Math.ceil(baseProductionTimeMinutes / workingMinutesPerDay);
  
  // Jeśli zadanie trwa więcej niż 5 dni roboczych (tydzień), 
  // usuń proporcjonalnie weekendy (2 dni na każde 7 dni kalendarzowych)
  if (workingDays > 5) {
    const weeks = Math.floor(workingDays / 5);
    const remainingDays = workingDays % 5;
    
    // Każdy pełny tydzień roboczy (5 dni) ma 2 dni weekendu
    const weekendDaysToRemove = weeks * 2;
    
    // Sprawdź czy pozostałe dni zahaczają o weekend
    let additionalWeekendDays = 0;
    if (remainingDays > 0) {
      const testDate = new Date(startDate);
      // Przesuń do początku sprawdzanego okresu
      for (let i = 0; i < weeks * 7; i++) {
        testDate.setDate(testDate.getDate() + 1);
      }
      
      // Sprawdź pozostałe dni
      for (let i = 0; i < remainingDays; i++) {
        if (isWeekend(testDate)) {
          additionalWeekendDays++;
        }
        testDate.setDate(testDate.getDate() + 1);
      }
    }
    
    const totalWeekendMinutes = (weekendDaysToRemove + additionalWeekendDays) * 24 * 60;
    return Math.max(baseProductionTimeMinutes - totalWeekendMinutes, baseProductionTimeMinutes * 0.7); // Minimum 70% oryginalnego czasu
  }
  
  return baseProductionTimeMinutes;
};

/**
 * Oblicza datę zakończenia z uwzględnieniem godzin pracy zakładu i pominięciem weekendów
 * @param {Date} startDate - Data rozpoczęcia produkcji
 * @param {number} productionMinutes - Czas produkcji w minutach (tylko dni robocze)
 * @param {number} workingHoursPerDay - Godziny pracy zakładu dziennie (domyślnie 16)
 * @returns {Date} Data zakończenia z uwzględnieniem godzin pracy i weekendów
 */
export const calculateEndDateWithWorkingHours = (startDate, productionMinutes, workingHoursPerDay = 16) => {
  if (!startDate || !(startDate instanceof Date)) {
    return startDate;
  }
  
  if (!productionMinutes || productionMinutes <= 0) {
    return new Date(startDate);
  }
  
  const result = new Date(startDate);
  let remainingMinutes = productionMinutes;
  
  // Jeśli zaczynamy w weekend, przesuń do następnego poniedziałku o 8:00
  while (isWeekend(result)) {
    result.setDate(result.getDate() + 1);
    result.setHours(8, 0, 0, 0);
  }
  
  // Upewnij się, że zaczynamy w godzinach roboczych (8:00-24:00 dla 16h lub 8:00-16:00 dla 8h)
  const startHour = 8;
  const endHour = startHour + workingHoursPerDay;
  
  if (result.getHours() < startHour) {
    result.setHours(startHour, 0, 0, 0);
  } else if (result.getHours() >= endHour) {
    // Jeśli po godzinach roboczych, przenieś do następnego dnia roboczego
    result.setDate(result.getDate() + 1);
    while (isWeekend(result)) {
      result.setDate(result.getDate() + 1);
    }
    result.setHours(startHour, 0, 0, 0);
  }
  
  while (remainingMinutes > 0) {
    const currentHour = result.getHours();
    const currentMinute = result.getMinutes();
    
    // Sprawdź czy jesteśmy w godzinach roboczych i w dniu roboczym
    if (!isWeekend(result) && currentHour >= startHour && currentHour < endHour) {
      // Oblicz ile minut pozostało do końca dnia roboczego
      const minutesUntilEndOfWorkDay = (endHour * 60) - (currentHour * 60 + currentMinute);
      
      if (remainingMinutes <= minutesUntilEndOfWorkDay) {
        // Czas produkcji mieści się w obecnym dniu roboczym
        result.setMinutes(result.getMinutes() + remainingMinutes);
        remainingMinutes = 0;
      } else {
        // Potrzebujemy więcej czasu - przejdź do następnego dnia roboczego
        remainingMinutes -= minutesUntilEndOfWorkDay;
        result.setDate(result.getDate() + 1);
        
        // Pomiń weekendy
        while (isWeekend(result)) {
          result.setDate(result.getDate() + 1);
        }
        result.setHours(startHour, 0, 0, 0);
      }
    } else {
      // Nie jesteśmy w godzinach roboczych lub w dniu roboczym
      if (isWeekend(result)) {
        // Przesuń do następnego poniedziałku
        while (isWeekend(result)) {
          result.setDate(result.getDate() + 1);
        }
        result.setHours(startHour, 0, 0, 0);
      } else if (currentHour >= endHour) {
        // Po godzinach roboczych - przejdź do następnego dnia roboczego
        result.setDate(result.getDate() + 1);
        while (isWeekend(result)) {
          result.setDate(result.getDate() + 1);
        }
        result.setHours(startHour, 0, 0, 0);
      } else {
        // Przed godzinami roboczymi - ustaw na początek dnia roboczego
        result.setHours(startHour, 0, 0, 0);
      }
    }
  }
  
  return result;
};

/**
 * Oblicza czas produkcji w minutach między dwiema datami z uwzględnieniem godzin pracy zakładu
 * @param {Date} startDate - Data rozpoczęcia
 * @param {Date} endDate - Data zakończenia
 * @param {number} workingHoursPerDay - Godziny pracy zakładu dziennie (domyślnie 16)
 * @returns {number} Liczba minut produkcji w ramach godzin roboczych
 */
export const calculateProductionTimeWithWorkingHours = (startDate, endDate, workingHoursPerDay = 16) => {
  if (!startDate || !endDate || !(startDate instanceof Date) || !(endDate instanceof Date)) {
    return 0;
  }
  
  if (startDate >= endDate) {
    return 0;
  }
  
  const startHour = 8;
  const endHour = startHour + workingHoursPerDay;
  let totalMinutes = 0;
  const current = new Date(startDate);
  const end = new Date(endDate);
  
  // Upewnij się, że zaczynamy w dniu roboczym
  while (isWeekend(current) && current < end) {
    current.setDate(current.getDate() + 1);
    current.setHours(startHour, 0, 0, 0);
  }
  
  if (current >= end) {
    return 0;
  }
  
  while (current < end) {
    if (isWorkingDay(current)) {
      const dayStart = new Date(current);
      dayStart.setHours(startHour, 0, 0, 0);
      
      const dayEnd = new Date(current);
      dayEnd.setHours(endHour, 0, 0, 0);
      
      const effectiveStart = current < dayStart ? dayStart : current;
      const effectiveEnd = end > dayEnd ? dayEnd : end;
      
      if (effectiveStart < effectiveEnd) {
        const dailyMinutes = (effectiveEnd - effectiveStart) / (1000 * 60);
        totalMinutes += dailyMinutes;
      }
    }
    
    // Przejdź do następnego dnia
    current.setDate(current.getDate() + 1);
    current.setHours(startHour, 0, 0, 0);
  }
  
  return Math.round(totalMinutes);
}; 