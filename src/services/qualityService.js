// src/services/qualityService.js
import { 
    collection, 
    doc, 
    addDoc, 
    updateDoc, 
    getDoc, 
    getDocs, 
    deleteDoc, 
    query, 
    where,
    orderBy,
    serverTimestamp,
    Timestamp
  } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from './firebase/config';
  
  const QUALITY_TESTS_COLLECTION = 'qualityTests';
  const QUALITY_RESULTS_COLLECTION = 'qualityResults';
  
  // Pobieranie wszystkich testów jakościowych
  export const getAllTests = async () => {
    try {
      const testsQuery = query(
        collection(db, QUALITY_TESTS_COLLECTION), 
        orderBy('createdAt', 'desc')
      );
      const querySnapshot = await getDocs(testsQuery);
      
      const tests = [];
      querySnapshot.forEach((doc) => {
        tests.push({
          id: doc.id,
          ...doc.data()
        });
      });
      
      return tests;
    } catch (error) {
      console.error('Error getting tests:', error);
      throw error;
    }
  };
  
  // Pobieranie testu po ID
  export const getTestById = async (testId) => {
    try {
      const testDoc = await getDoc(doc(db, QUALITY_TESTS_COLLECTION, testId));
      
      if (!testDoc.exists()) {
        throw new Error('Test nie został znaleziony');
      }
      
      return {
        id: testDoc.id,
        ...testDoc.data()
      };
    } catch (error) {
      console.error('Error getting test:', error);
      throw error;
    }
  };
  
  // Tworzenie nowego testu jakościowego
  export const createTest = async (testData, userId) => {
    try {
      // Wykonaj walidację danych testu
      validateTestData(testData);
      
      const newTest = {
        ...testData,
        createdBy: userId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };
      
      const docRef = await addDoc(collection(db, QUALITY_TESTS_COLLECTION), newTest);
      return docRef.id;
    } catch (error) {
      console.error('Error creating test:', error);
      throw error;
    }
  };
  
  // Aktualizacja testu jakościowego
  export const updateTest = async (testId, testData, userId) => {
    try {
      // Wykonaj walidację danych testu
      validateTestData(testData);
      
      const updatedTest = {
        ...testData,
        updatedBy: userId,
        updatedAt: serverTimestamp()
      };
      
      await updateDoc(doc(db, QUALITY_TESTS_COLLECTION, testId), updatedTest);
      return true;
    } catch (error) {
      console.error('Error updating test:', error);
      throw error;
    }
  };
  
  // Usuwanie testu jakościowego
  export const deleteTest = async (testId) => {
    try {
      // Najpierw pobierz wszystkie wyniki związane z tym testem
      const resultsRef = collection(db, QUALITY_RESULTS_COLLECTION);
      const q = query(resultsRef, where('testId', '==', testId));
      const resultsSnapshot = await getDocs(q);
      
      // Usuń wszystkie wyniki
      const resultDeletions = resultsSnapshot.docs.map(doc => 
        deleteDoc(doc.ref)
      );
      
      // Poczekaj na usunięcie wszystkich wyników
      await Promise.all(resultDeletions);
      
      // Na końcu usuń sam test
      await deleteDoc(doc(db, QUALITY_TESTS_COLLECTION, testId));
      return true;
    } catch (error) {
      console.error('Error deleting test:', error);
      throw error;
    }
  };
  
  // Pobieranie wszystkich wyników testów
  export const getAllResults = async () => {
    try {
      const resultsQuery = query(
        collection(db, QUALITY_RESULTS_COLLECTION), 
        orderBy('createdAt', 'desc')
      );
      const querySnapshot = await getDocs(resultsQuery);
      
      const results = [];
      querySnapshot.forEach((doc) => {
        results.push({
          id: doc.id,
          ...doc.data()
        });
      });
      
      return results;
    } catch (error) {
      console.error('Error getting test results:', error);
      throw error;
    }
  };
  
  // Pobieranie wyników testu po ID testu
  export const getResultsByTestId = async (testId) => {
    try {
      const resultsQuery = query(
        collection(db, QUALITY_RESULTS_COLLECTION),
        where('testId', '==', testId),
        orderBy('createdAt', 'desc')
      );
      
      const querySnapshot = await getDocs(resultsQuery);
      
      const results = [];
      querySnapshot.forEach((doc) => {
        results.push({
          id: doc.id,
          ...doc.data()
        });
      });
      
      return results;
    } catch (error) {
      console.error('Error getting test results:', error);
      throw error;
    }
  };
  
  // Pobieranie wyniku po ID
  export const getResultById = async (resultId) => {
    try {
      const resultDoc = await getDoc(doc(db, QUALITY_RESULTS_COLLECTION, resultId));
      
      if (!resultDoc.exists()) {
        throw new Error('Wynik testu nie został znaleziony');
      }
      
      return {
        id: resultDoc.id,
        ...resultDoc.data()
      };
    } catch (error) {
      console.error('Error getting test result:', error);
      throw error;
    }
  };
  
  // Dodawanie wyniku testu
  export const addTestResult = async (resultData, photoFile = null) => {
    try {
      // Sprawdź zgodność parametrów i określ status
      const processedResult = processTestResult(resultData);
      
      // Jeśli jest zdjęcie, prześlij je do magazynu
      let photoUrl = null;
      if (photoFile) {
        photoUrl = await uploadResultPhoto(photoFile, processedResult.testId);
      }
      
      // Dodaj URL zdjęcia do wyniku
      const resultToSave = {
        ...processedResult,
        photoUrl,
        // Konwertuj daty na timestampy Firestore
        date: Timestamp.fromDate(processedResult.date),
        createdAt: Timestamp.fromDate(processedResult.createdAt)
      };
      
      const docRef = await addDoc(collection(db, QUALITY_RESULTS_COLLECTION), resultToSave);
      return docRef.id;
    } catch (error) {
      console.error('Error adding test result:', error);
      throw error;
    }
  };
  
  // Pobieranie wyników dla konkretnej partii/produktu
  export const getResultsByBatchId = async (batchId) => {
    const resultsRef = collection(db, QUALITY_RESULTS_COLLECTION);
    const q = query(
      resultsRef, 
      where('batchId', '==', batchId),
      orderBy('testDate', 'desc')
    );
    
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  };
  
  // Pobieranie testów według kategorii
  export const getTestsByCategory = async (category) => {
    const testsRef = collection(db, QUALITY_TESTS_COLLECTION);
    const q = query(
      testsRef, 
      where('category', '==', category),
      orderBy('name', 'asc')
    );
    
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  };

  /**
   * Przesyła zdjęcie wyniku testu do magazynu
   * @param {File} file - Plik ze zdjęciem
   * @param {string} testId - ID testu
   * @returns {Promise<string>} URL do przesłanego zdjęcia
   */
  const uploadResultPhoto = async (file, testId) => {
    try {
      const timestamp = new Date().getTime();
      const storageRef = ref(storage, `quality_test_photos/${testId}/${timestamp}_${file.name}`);
      
      // Przesyłanie pliku
      await uploadBytes(storageRef, file);
      
      // Pobieranie URL
      const downloadURL = await getDownloadURL(storageRef);
      return downloadURL;
    } catch (error) {
      console.error('Error uploading photo:', error);
      throw new Error('Błąd podczas przesyłania zdjęcia: ' + error.message);
    }
  };

  /**
   * Walidacja danych testu
   * @param {Object} testData - Dane testu do zwalidowania
   */
  const validateTestData = (testData) => {
    if (!testData.name || testData.name.trim() === '') {
      throw new Error('Nazwa testu jest wymagana');
    }
    
    if (!testData.parameters || !Array.isArray(testData.parameters) || testData.parameters.length === 0) {
      throw new Error('Test musi mieć co najmniej jeden parametr');
    }
    
    // Walidacja parametrów
    testData.parameters.forEach((param, index) => {
      if (!param.name || param.name.trim() === '') {
        throw new Error(`Parametr #${index + 1} musi mieć nazwę`);
      }
      
      // Dla parametrów typu select muszą być zdefiniowane opcje
      if (param.type === 'select' && (!param.options || param.options.length === 0)) {
        throw new Error(`Parametr "${param.name}" typu lista wyboru musi mieć zdefiniowane opcje`);
      }
      
      // Sprawdź poprawność zakresów dla parametrów numerycznych
      if (param.type === 'numeric' && param.minValue && param.maxValue) {
        const min = parseFloat(param.minValue);
        const max = parseFloat(param.maxValue);
        if (!isNaN(min) && !isNaN(max) && min > max) {
          throw new Error(`Dla parametru "${param.name}" wartość minimalna nie może być większa od maksymalnej`);
        }
      }
    });
  };

  /**
   * Przetwarzanie wyników testu - sprawdzanie zgodności parametrów i ustalenie statusu
   * @param {Object} resultData - Dane wyniku testu
   * @returns {Object} Przetworzone dane wyniku
   */
  const processTestResult = (resultData) => {
    // Głęboka kopia danych wyniku
    const processedResult = JSON.parse(JSON.stringify(resultData));
    
    let hasFailures = false;
    let hasCriticalFailures = false;
    
    // Przetwarzanie i sprawdzanie zgodności każdego parametru
    processedResult.parameters = processedResult.parameters.map(param => {
      const isCompliant = checkParameterCompliance(param);
      
      // Jeśli parametr jest niezgodny, oznacz jako niespełniający wymagań
      if (isCompliant === false) {
        hasFailures = true;
        
        // Jeśli to parametr krytyczny, oznacz jako krytyczny błąd
        if (param.criticalParameter) {
          hasCriticalFailures = true;
        }
      }
      
      return {
        ...param,
        isCompliant
      };
    });
    
    // Ustalenie ogólnego statusu testu
    if (hasCriticalFailures) {
      // Zawsze ustawiaj status jako negatywny, jeśli są błędy krytyczne
      processedResult.status = 'Negatywny';
    } else if (hasFailures) {
      // Ustaw status jako negatywny tylko wtedy, gdy nie ma konfiguracji ignorowania niekrytycznych błędów
      processedResult.status = 'Negatywny';
    } else {
      processedResult.status = 'Pozytywny';
    }
    
    return processedResult;
  };

  /**
   * Sprawdza zgodność parametru z wymaganiami
   * @param {Object} param - Parametr do sprawdzenia
   * @returns {boolean|null} true - zgodny, false - niezgodny, null - nie można określić
   */
  const checkParameterCompliance = (param) => {
    // Dla parametrów innych niż numeryczne lub bez wartości, nie możemy określić zgodności
    if (param.type !== 'numeric' || param.value === '' || param.value === null) {
      return null;
    }
    
    const value = parseFloat(param.value);
    if (isNaN(value)) {
      return false;  // Nieprawidłowa wartość liczbowa
    }
    
    // Sprawdź zakres minimalny
    if (param.minValue !== '' && !isNaN(parseFloat(param.minValue)) && value < parseFloat(param.minValue)) {
      return false;
    }
    
    // Sprawdź zakres maksymalny
    if (param.maxValue !== '' && !isNaN(parseFloat(param.maxValue)) && value > parseFloat(param.maxValue)) {
      return false;
    }
    
    // Jeśli test przeszedł wszystkie sprawdzenia, jest zgodny
    return true;
  };

  /**
   * Pobiera statystyki testów jakościowych
   * @returns {Promise<Object>} Statystyki testów
   */
  export const getQualityStats = async () => {
    try {
      // Pobierz wszystkie wyniki testów
      const allResults = await getAllResults();
      
      // Podstawowe statystyki
      const stats = {
        total: allResults.length,
        passed: 0,
        failed: 0,
        byCategory: {},
        byMonth: {},
        recentFailures: []
      };
      
      // Przygotuj statystyki
      allResults.forEach(result => {
        // Zliczaj wyniki pozytywne/negatywne
        if (result.status === 'Pozytywny') {
          stats.passed++;
        } else {
          stats.failed++;
          
          // Dodaj do listy ostatnich niepowodzeń (max 5)
          if (stats.recentFailures.length < 5) {
            stats.recentFailures.push({
              id: result.id,
              testName: result.testName,
              date: result.date,
              productName: result.productName,
              batchNumber: result.batchNumber
            });
          }
        }
        
        // Statystyki według kategorii (pobierz kategorię z danych testu)
        const resultDate = result.date instanceof Timestamp 
          ? result.date.toDate() 
          : new Date(result.date);
          
        // Statystyki według miesiąca
        const monthKey = `${resultDate.getFullYear()}-${(resultDate.getMonth() + 1).toString().padStart(2, '0')}`;
        
        if (!stats.byMonth[monthKey]) {
          stats.byMonth[monthKey] = {
            total: 0,
            passed: 0,
            failed: 0
          };
        }
        
        stats.byMonth[monthKey].total++;
        if (result.status === 'Pozytywny') {
          stats.byMonth[monthKey].passed++;
        } else {
          stats.byMonth[monthKey].failed++;
        }
      });
      
      // Pobierz testy aby uzyskać kategorie
      const allTests = await getAllTests();
      const testsById = {};
      
      allTests.forEach(test => {
        testsById[test.id] = test;
      });
      
      // Statystyki według kategorii
      allResults.forEach(result => {
        const test = testsById[result.testId];
        
        if (test && test.category) {
          if (!stats.byCategory[test.category]) {
            stats.byCategory[test.category] = {
              total: 0,
              passed: 0,
              failed: 0
            };
          }
          
          stats.byCategory[test.category].total++;
          if (result.status === 'Pozytywny') {
            stats.byCategory[test.category].passed++;
          } else {
            stats.byCategory[test.category].failed++;
          }
        }
      });
      
      return stats;
    } catch (error) {
      console.error('Error getting quality stats:', error);
      throw error;
    }
  };