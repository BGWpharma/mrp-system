import { ref, get, query, orderByChild, limitToLast, onValue } from 'firebase/database';
import { rtdb } from './firebase/config';
import { parseISO, isValid, format, differenceInMinutes, isAfter, isBefore } from 'date-fns';

/**
 * Serwis do obsługi danych z maszyn z Realtime Database
 * Obsługuje odczyty weight_summaries_history z polami final_ok_count i final_nok_count
 */

/**
 * Pobiera dane historyczne z maszyny dla określonego zakresu czasowego
 * @param {string} machineId - ID maszyny
 * @param {Date} startTime - Czas początkowy
 * @param {Date} endTime - Czas końcowy
 * @returns {Promise<Array>} - Lista odczytów z maszyny w określonym czasie
 */
export const getMachineDataForTimeRange = async (machineId, startTime, endTime) => {
  try {
    if (!machineId || !startTime || !endTime) {
      throw new Error('ID maszyny, czas początkowy i końcowy są wymagane');
    }

    if (!isValid(startTime) || !isValid(endTime)) {
      throw new Error('Nieprawidłowy format daty');
    }

    console.log(`Pobieranie danych maszyny ${machineId} dla zakresu: ${format(startTime, 'yyyy-MM-dd HH:mm')} - ${format(endTime, 'yyyy-MM-dd HH:mm')}`);

    // Referencja do historii maszyny
    const historyRef = ref(rtdb, `weight_summaries_history/${machineId}`);
    const snapshot = await get(historyRef);

    if (!snapshot.exists()) {
      console.log(`Brak danych historycznych dla maszyny ${machineId}`);
      return [];
    }

    const machineData = [];
    const startTimestamp = startTime.getTime();
    const endTimestamp = endTime.getTime();

    // Przetwarzaj dane z historii
    snapshot.forEach((childSnapshot) => {
      try {
        const record = childSnapshot.val();
        
        // Sprawdź czy rekord ma wymagane pola
        if (!record) return;

        // Pobierz timestamp z rekordu (może być w różnych polach)
        const recordTime = record.end_time || record.generated_at || record.timestamp;
        if (!recordTime) return;

        const recordDate = new Date(recordTime);
        if (!isValid(recordDate)) return;

        const recordTimestamp = recordDate.getTime();

        // Sprawdź czy rekord mieści się w zakresie czasowym
        if (recordTimestamp >= startTimestamp && recordTimestamp <= endTimestamp) {
          machineData.push({
            id: childSnapshot.key,
            timestamp: recordDate,
            endTime: recordTime,
            startTime: record.start_time || null,
            duration: record.duration_minutes || 0,
            totalReadings: record.total_readings || 0,
            weightStats: {
              finalOkCount: record.weight_stats?.final_ok_count || 0,
              finalNokCount: record.weight_stats?.final_nok_count || 0,
              okCount: record.weight_stats?.ok_count || 0,
              nokCount: record.weight_stats?.nok_count || 0,
              finalAvgWeight: record.weight_stats?.final_avg_weight || 0,
              avgWeight: record.weight_stats?.avg_weight || 0,
              finalMinWeight: record.weight_stats?.final_min_weight || 0,
              finalMaxWeight: record.weight_stats?.final_max_weight || 0,
              finalMedianWeight: record.weight_stats?.final_median_weight || 0,
              finalStdDev: record.weight_stats?.final_std_dev || 0
            },
            errorsCount: record.errors_count || 0
          });
        }
      } catch (error) {
        console.error(`Błąd podczas przetwarzania rekordu ${childSnapshot.key}:`, error);
      }
    });

    // Sortuj według czasu (od najstarszych)
    machineData.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    console.log(`Znaleziono ${machineData.length} rekordów dla maszyny ${machineId} w określonym czasie`);
    return machineData;

  } catch (error) {
    console.error(`Błąd podczas pobierania danych maszyny ${machineId}:`, error);
    throw error;
  }
};

/**
 * Oblicza różnice w produkcji między odczytami (OK i NOK)
 * @param {Array} machineData - Dane z maszyny posortowane chronologicznie
 * @returns {Array} - Lista różnic między kolejnymi odczytami
 */
export const calculateProductionDifferences = (machineData) => {
  if (!machineData || machineData.length < 2) {
    return [];
  }

  const differences = [];

  for (let i = 1; i < machineData.length; i++) {
    const currentReading = machineData[i];
    const previousReading = machineData[i - 1];

    const okDifference = currentReading.weightStats.finalOkCount - previousReading.weightStats.finalOkCount;
    const nokDifference = currentReading.weightStats.finalNokCount - previousReading.weightStats.finalNokCount;

    // Sprawdź czy różnice są dodatnie (odczyty powinny rosnąć)
    if (okDifference >= 0 && nokDifference >= 0) {
      differences.push({
        startTime: previousReading.timestamp,
        endTime: currentReading.timestamp,
        startReading: {
          finalOkCount: previousReading.weightStats.finalOkCount,
          finalNokCount: previousReading.weightStats.finalNokCount
        },
        endReading: {
          finalOkCount: currentReading.weightStats.finalOkCount,
          finalNokCount: currentReading.weightStats.finalNokCount
        },
        production: {
          okCount: okDifference,
          nokCount: nokDifference,
          totalCount: okDifference + nokDifference
        },
        duration: differenceInMinutes(currentReading.timestamp, previousReading.timestamp),
        formattedPeriod: `${format(previousReading.timestamp, 'HH:mm')} - ${format(currentReading.timestamp, 'HH:mm')}`
      });
    }
  }

  return differences;
};

/**
 * Pobiera dane produkcji dla historii produkcyjnej zadania
 * @param {string} machineId - ID maszyny
 * @param {Array} productionHistory - Historia produkcji z zadania (zawiera startTime i endTime)
 * @returns {Promise<Array>} - Historia produkcji wzbogacona o dane z maszyn
 */
export const getProductionDataForHistory = async (machineId, productionHistory) => {
  try {
    if (!machineId || !productionHistory || productionHistory.length === 0) {
      return productionHistory || [];
    }

    console.log(`Wzbogacanie historii produkcji danymi z maszyny ${machineId}`);

    const enrichedHistory = [];

    for (const historyItem of productionHistory) {
      let enrichedItem = { ...historyItem };

      // Sprawdź czy mamy okresy czasu dla sesji produkcyjnej
      if (historyItem.startTime && historyItem.endTime) {
        try {
          // Konwertuj na obiekty Date jeśli potrzeba
          let startTime = historyItem.startTime;
          let endTime = historyItem.endTime;

          if (typeof startTime === 'string') {
            startTime = parseISO(startTime);
          } else if (startTime && typeof startTime.toDate === 'function') {
            startTime = startTime.toDate();
          }

          if (typeof endTime === 'string') {
            endTime = parseISO(endTime);
          } else if (endTime && typeof endTime.toDate === 'function') {
            endTime = endTime.toDate();
          }

          if (isValid(startTime) && isValid(endTime)) {
            // Pobierz dane z maszyny dla tego okresu (z małym buforem czasowym)
            const bufferMinutes = 5; // 5 minut buforu przed i po
            const searchStartTime = new Date(startTime.getTime() - bufferMinutes * 60000);
            const searchEndTime = new Date(endTime.getTime() + bufferMinutes * 60000);

            const machineData = await getMachineDataForTimeRange(machineId, searchStartTime, searchEndTime);
            
            if (machineData.length > 0) {
              // Oblicz różnice w produkcji
              const productionDifferences = calculateProductionDifferences(machineData);
              
              // Znajdź różnice które pokrywają się z okresem produkcji
              const relevantProduction = productionDifferences.filter(diff => {
                const diffStart = diff.startTime;
                const diffEnd = diff.endTime;
                
                // Sprawdź czy okresy się pokrywają
                return (diffStart <= endTime && diffEnd >= startTime);
              });

              if (relevantProduction.length > 0) {
                // Zsumuj produkcję z wszystkich pokrywających się okresów
                const totalOkProduced = relevantProduction.reduce((sum, prod) => sum + prod.production.okCount, 0);
                const totalNokProduced = relevantProduction.reduce((sum, prod) => sum + prod.production.nokCount, 0);

                enrichedItem.machineData = {
                  okProduced: totalOkProduced,
                  nokProduced: totalNokProduced,
                  totalProduced: totalOkProduced + totalNokProduced,
                  productionPeriods: relevantProduction,
                  machineId: machineId
                };

                console.log(`Sesja ${historyItem.id || 'unknown'}: wyprodukowano ${totalOkProduced} OK i ${totalNokProduced} NOK`);
              }
            }
          }
        } catch (error) {
          console.error(`Błąd podczas wzbogacania pozycji historii ${historyItem.id}:`, error);
        }
      }

      enrichedHistory.push(enrichedItem);
    }

    return enrichedHistory;

  } catch (error) {
    console.error('Błąd podczas wzbogacania historii produkcji danymi z maszyn:', error);
    return productionHistory || [];
  }
};

/**
 * Pobiera dostępne maszyny z weight_summaries
 * @returns {Promise<Array>} - Lista dostępnych maszyn
 */
export const getAvailableMachines = async () => {
  try {
    const summariesRef = ref(rtdb, 'weight_summaries');
    const snapshot = await get(summariesRef);

    if (!snapshot.exists()) {
      return [];
    }

    const machines = [];
    snapshot.forEach((childSnapshot) => {
      const machineData = childSnapshot.val();
      machines.push({
        id: childSnapshot.key,
        name: machineData.device_id || childSnapshot.key,
        lastUpdate: machineData.last_update || null,
        status: machineData.status || 'unknown'
      });
    });

    return machines;
  } catch (error) {
    console.error('Błąd podczas pobierania listy maszyn:', error);
    throw error;
  }
};

/**
 * Pobiera aktualne dane z maszyny
 * @param {string} machineId - ID maszyny
 * @returns {Promise<Object|null>} - Aktualne dane z maszyny
 */
export const getCurrentMachineData = async (machineId) => {
  try {
    if (!machineId) {
      throw new Error('ID maszyny jest wymagane');
    }

    const machineRef = ref(rtdb, `weight_summaries/${machineId}`);
    const snapshot = await get(machineRef);

    if (!snapshot.exists()) {
      return null;
    }

    const data = snapshot.val();
    
    return {
      id: machineId,
      name: data.device_id || machineId,
      lastUpdate: data.last_update || null,
      status: data.status || 'unknown',
      weightStats: {
        finalOkCount: data.weight_stats?.final_ok_count || 0,
        finalNokCount: data.weight_stats?.final_nok_count || 0,
        okCount: data.weight_stats?.ok_count || 0,
        nokCount: data.weight_stats?.nok_count || 0,
        finalAvgWeight: data.weight_stats?.final_avg_weight || 0,
        avgWeight: data.weight_stats?.avg_weight || 0
      },
      totalReadings: data.total_readings || 0,
      errorsCount: data.errors_count || 0
    };

  } catch (error) {
    console.error(`Błąd podczas pobierania aktualnych danych maszyny ${machineId}:`, error);
    throw error;
  }
}; 