import { ref, onValue, get, query, orderByChild, limitToLast } from 'firebase/database';
import { rtdb } from './firebase/config';
import { format, isValid } from 'date-fns';

/**
 * Pobiera listę wszystkich dostępnych czujników
 * @returns {Promise<Array>} Lista czujników z id i nazwą
 */
export const getSensors = async () => {
  try {
    const sensorsRef = ref(rtdb, 'sensors');
    const snapshot = await get(sensorsRef);
    
    if (snapshot.exists()) {
      const sensorsData = snapshot.val();
      const sensorsList = Object.entries(sensorsData).map(([key, data]) => ({
        id: key,
        name: data.device_id || key // Używamy device_id jeśli dostępne, w przeciwnym razie key
      }));
      
      return sensorsList;
    } else {
      // Brak danych czujników w bazie
      return [];
    }
  } catch (error) {
    console.error("Błąd podczas pobierania listy czujników:", error);
    throw new Error("Nie udało się pobrać listy czujników: " + error.message);
  }
};

/**
 * Pobiera aktualne dane z wybranego czujnika
 * @param {string} sensorId - ID czujnika
 * @returns {Promise<Object>} Obiekt z temperaturą, wilgotnością i timestampem
 */
export const getCurrentSensorData = async (sensorId) => {
  try {
    if (!sensorId) {
      throw new Error("ID czujnika jest wymagane");
    }

    const sensorRef = ref(rtdb, `sensors/${sensorId}`);
    const snapshot = await get(sensorRef);
    
    if (snapshot.exists()) {
      const sensorData = snapshot.val();
      
      return {
        temperature: sensorData.temperature || 0,
        humidity: sensorData.humidity || 0,
        timestamp: sensorData.timestamp || new Date().toISOString()
      };
    } else {
      throw new Error("Brak danych dla wybranego czujnika");
    }
  } catch (error) {
    console.error("Błąd podczas pobierania aktualnych danych czujnika:", error);
    throw new Error("Nie udało się pobrać danych czujnika: " + error.message);
  }
};

/**
 * Pobiera dane z czujnika dla określonej daty i godziny
 * @param {string} sensorId - ID czujnika
 * @param {Date|string} date - Data jako obiekt Date lub string w formacie YYYY-MM-DD
 * @param {string} time - Czas w formacie HH:mm
 * @returns {Promise<Object>} Obiekt z temperaturą, wilgotnością, timestampem i różnicą czasową
 */
export const getSensorDataForDateTime = async (sensorId, date, time) => {
  try {
    if (!sensorId || !date || !time) {
      throw new Error("ID czujnika, data i czas są wymagane");
    }

    let targetDate;
    
    // Obsługa różnych formatów daty
    if (date instanceof Date) {
      targetDate = date;
    } else if (typeof date === 'string') {
      targetDate = new Date(date);
    } else {
      throw new Error("Nieprawidłowy format daty");
    }
    
    if (!isValid(targetDate)) {
      throw new Error("Nieprawidłowa data");
    }

    // Sprawdź format czasu
    if (typeof time !== 'string' || !time.match(/^\d{1,2}:\d{2}$/)) {
      throw new Error("Nieprawidłowy format czasu - oczekiwany format HH:mm");
    }

    // Utwórz pełną datę i czas
    const [hours, minutes] = time.split(':').map(num => parseInt(num, 10));
    
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
      throw new Error("Nieprawidłowy czas - godzina musi być 0-23, minuty 0-59");
    }

    // Skopiuj datę i ustaw czas
    const requestedDateTime = new Date(targetDate);
    requestedDateTime.setHours(hours, minutes, 0, 0);
    
    if (!isValid(requestedDateTime)) {
      throw new Error("Nie udało się utworzyć prawidłowej daty i czasu");
    }

    console.log(`Szukam danych dla czujnika ${sensorId} w czasie: ${requestedDateTime.toISOString()}`);

    const historyRef = ref(rtdb, `history/${sensorId}`);
    const snapshot = await get(historyRef);
    
    if (!snapshot.exists()) {
      throw new Error("Brak danych historycznych dla wybranego czujnika");
    }

    let closestReading = null;
    let minTimeDifference = Infinity;

    // Przeszukaj wszystkie odczyty i znajdź najbliższy czasowo
    snapshot.forEach((childSnapshot) => {
      const reading = childSnapshot.val();
      
      try {
        const readingDate = new Date(reading.timestamp);
        
        if (isValid(readingDate)) {
          const timeDifference = Math.abs(readingDate.getTime() - requestedDateTime.getTime());
          
          if (timeDifference < minTimeDifference) {
            minTimeDifference = timeDifference;
            closestReading = {
              temperature: reading.temperature || 0,
              humidity: reading.humidity || 0,
              timestamp: reading.timestamp,
              timeDifference: Math.round(timeDifference / 60000) // różnica w minutach
            };
          }
        }
      } catch (err) {
        console.error("Problem z formatowaniem daty odczytu:", err);
      }
    });

    if (!closestReading) {
      throw new Error("Nie znaleziono danych dla wybranego czasu");
    }

    console.log(`Znaleziono dane z różnicą czasową ${closestReading.timeDifference} minut`);
    return closestReading;
  } catch (error) {
    console.error("Błąd podczas pobierania danych dla określonej daty/czasu:", error);
    throw new Error("Nie udało się pobrać danych: " + error.message);
  }
};

/**
 * Formatuje timestamp z czujnika do czytelnej formy
 * @param {string} timestamp - Timestamp z czujnika
 * @returns {Object} Obiekt z różnymi formatami daty
 */
export const formatSensorTimestamp = (timestamp) => {
  try {
    const date = new Date(timestamp);
    
    if (!isValid(date)) {
      return {
        full: 'Nieprawidłowa data',
        date: 'Nieprawidłowa data',
        time: 'Nieprawidłowy czas'
      };
    }

    return {
      full: format(date, 'dd.MM.yyyy HH:mm:ss'),
      date: format(date, 'dd.MM.yyyy'),
      time: format(date, 'HH:mm:ss')
    };
  } catch (error) {
    console.error("Błąd podczas formatowania timestampu:", error);
    return {
      full: 'Błąd formatowania',
      date: 'Błąd formatowania',
      time: 'Błąd formatowania'
    };
  }
};

/**
 * Sprawdza czy wartości temperatury i wilgotności są w normie
 * @param {number} temperature - Temperatura w stopniach Celsjusza
 * @param {number} humidity - Wilgotność w procentach
 * @returns {Object} Status sprawdzenia norm dla temperatury i wilgotności
 */
export const checkEnvironmentalNorms = (temperature, humidity) => {
  // Normy środowiskowe dla produkcji farmaceutycznej
  const TEMP_MIN = 15; // °C
  const TEMP_MAX = 25; // °C
  const HUMIDITY_MIN = 30; // %
  const HUMIDITY_MAX = 60; // %

  const temperatureStatus = {
    isInRange: temperature >= TEMP_MIN && temperature <= TEMP_MAX,
    message: temperature < TEMP_MIN 
      ? 'Temperatura poniżej normy' 
      : temperature > TEMP_MAX 
      ? 'Temperatura powyżej normy' 
      : 'Temperatura w normie',
    value: temperature
  };

  const humidityStatus = {
    isInRange: humidity >= HUMIDITY_MIN && humidity <= HUMIDITY_MAX,
    message: humidity < HUMIDITY_MIN 
      ? 'Wilgotność poniżej normy' 
      : humidity > HUMIDITY_MAX 
      ? 'Wilgotność powyżej normy' 
      : 'Wilgotność w normie',
    value: humidity
  };

  return {
    temperature: temperatureStatus,
    humidity: humidityStatus,
    overallStatus: temperatureStatus.isInRange && humidityStatus.isInRange ? 'OK' : 'UWAGA'
  };
};

/**
 * Pobiera historyczne dane z czujnika dla określonego przedziału czasowego
 * @param {string} sensorId - ID czujnika
 * @param {Date} startDate - Data początkowa
 * @param {Date} endDate - Data końcowa
 * @param {number} limit - Maksymalna liczba rekordów (domyślnie 1000)
 * @returns {Promise<Array>} Tablica danych historycznych
 */
export const getSensorHistoryData = async (sensorId, startDate, endDate, limit = 1000) => {
  try {
    if (!sensorId || !startDate || !endDate) {
      throw new Error("ID czujnika, data początkowa i końcowa są wymagane");
    }

    if (!isValid(startDate) || !isValid(endDate)) {
      throw new Error("Nieprawidłowy format daty");
    }

    const historyRef = ref(rtdb, `history/${sensorId}`);
    const snapshot = await get(historyRef);
    
    if (!snapshot.exists()) {
      return [];
    }

    const historyData = [];
    const startTimestamp = startDate.getTime();
    const endTimestamp = endDate.getTime();

    snapshot.forEach((childSnapshot) => {
      const reading = childSnapshot.val();
      
      try {
        const date = new Date(reading.timestamp);
        
        if (isValid(date)) {
          const timestamp = date.getTime();
          
          // Sprawdź czy data mieści się w wybranym zakresie
          if (timestamp >= startTimestamp && timestamp <= endTimestamp) {
            historyData.push({
              time: format(date, 'HH:mm'),
              fullTime: format(date, 'dd.MM.yyyy HH:mm:ss'),
              date: format(date, 'dd.MM.yyyy'),
              timestamp: date,
              temperature: reading.temperature || 0,
              humidity: reading.humidity || 0
            });
          }
        }
      } catch (err) {
        console.error("Problem z formatowaniem daty:", err);
      }
    });

    // Sortuj dane wg czasu
    historyData.sort((a, b) => a.timestamp - b.timestamp);

    // Ogranicz liczbę danych jeśli jest ich zbyt dużo
    if (historyData.length > limit) {
      const sampleRate = Math.ceil(historyData.length / limit);
      const limitedData = historyData.filter((_, index) => index % sampleRate === 0);
      
      // Zawsze dodaj ostatni punkt danych
      if (historyData.length > 0 && limitedData.length > 0) {
        const lastOriginal = historyData[historyData.length - 1];
        const lastLimited = limitedData[limitedData.length - 1];
        if (lastOriginal !== lastLimited) {
          limitedData.push(lastOriginal);
        }
      }
      
      return limitedData;
    }

    return historyData;
  } catch (error) {
    console.error("Błąd podczas pobierania danych historycznych:", error);
    throw new Error("Nie udało się pobrać danych historycznych: " + error.message);
  }
}; 