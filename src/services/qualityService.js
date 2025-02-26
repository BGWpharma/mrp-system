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
    serverTimestamp 
  } from 'firebase/firestore';
  import { db } from './firebase/config';
  
  const QUALITY_TESTS_COLLECTION = 'qualityTests';
  const QUALITY_RESULTS_COLLECTION = 'qualityResults';
  
  // Pobieranie wszystkich testów jakościowych
  export const getAllTests = async () => {
    const testsRef = collection(db, QUALITY_TESTS_COLLECTION);
    const q = query(testsRef, orderBy('name', 'asc'));
    
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  };
  
  // Pobieranie testu po ID
  export const getTestById = async (testId) => {
    const docRef = doc(db, QUALITY_TESTS_COLLECTION, testId);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      return {
        id: docSnap.id,
        ...docSnap.data()
      };
    } else {
      throw new Error('Test jakościowy nie istnieje');
    }
  };
  
  // Tworzenie nowego testu jakościowego
  export const createTest = async (testData, userId) => {
    const testWithMeta = {
      ...testData,
      createdBy: userId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      status: testData.status || 'Aktywny'
    };
    
    const docRef = await addDoc(collection(db, QUALITY_TESTS_COLLECTION), testWithMeta);
    
    return {
      id: docRef.id,
      ...testWithMeta
    };
  };
  
  // Aktualizacja testu jakościowego
  export const updateTest = async (testId, testData, userId) => {
    const testRef = doc(db, QUALITY_TESTS_COLLECTION, testId);
    
    const updatedTest = {
      ...testData,
      updatedAt: serverTimestamp(),
      updatedBy: userId
    };
    
    await updateDoc(testRef, updatedTest);
    
    return {
      id: testId,
      ...updatedTest
    };
  };
  
  // Usuwanie testu jakościowego
  export const deleteTest = async (testId) => {
    const testRef = doc(db, QUALITY_TESTS_COLLECTION, testId);
    await deleteDoc(testRef);
    
    return { success: true };
  };
  
  // Pobieranie wszystkich wyników testów
  export const getAllResults = async (limit = 100) => {
    const resultsRef = collection(db, QUALITY_RESULTS_COLLECTION);
    const q = query(
      resultsRef, 
      orderBy('testDate', 'desc'),
      limit ? limit : undefined
    );
    
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  };
  
  // Pobieranie wyników testu po ID testu
  export const getResultsByTestId = async (testId) => {
    const resultsRef = collection(db, QUALITY_RESULTS_COLLECTION);
    const q = query(
      resultsRef, 
      where('testId', '==', testId),
      orderBy('testDate', 'desc')
    );
    
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  };
  
  // Pobieranie wyniku po ID
  export const getResultById = async (resultId) => {
    const docRef = doc(db, QUALITY_RESULTS_COLLECTION, resultId);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      return {
        id: docSnap.id,
        ...docSnap.data()
      };
    } else {
      throw new Error('Wynik testu nie istnieje');
    }
  };
  
  // Dodawanie wyniku testu
  export const addTestResult = async (resultData, userId) => {
    // Pobierz definicję testu
    const test = await getTestById(resultData.testId);
    
    // Określ, czy wynik jest zgodny
    let isCompliant = true;
    const parameters = [];
    
    // Sprawdź każdy parametr
    for (const param of resultData.parameters) {
      const testParam = test.parameters.find(p => p.name === param.name);
      
      if (!testParam) continue;
      
      let paramCompliant = true;
      if (testParam.minValue !== undefined && param.value < testParam.minValue) {
        paramCompliant = false;
      }
      if (testParam.maxValue !== undefined && param.value > testParam.maxValue) {
        paramCompliant = false;
      }
      
      // Dodaj informację o zgodności parametru
      parameters.push({
        ...param,
        isCompliant: paramCompliant
      });
      
      // Jeśli choć jeden parametr jest niezgodny, cały test jest niezgodny
      if (!paramCompliant) {
        isCompliant = false;
      }
    }
    
    const resultWithMeta = {
      ...resultData,
      parameters,
      isCompliant,
      testDate: serverTimestamp(),
      createdBy: userId,
      createdAt: serverTimestamp()
    };
    
    const docRef = await addDoc(collection(db, QUALITY_RESULTS_COLLECTION), resultWithMeta);
    
    return {
      id: docRef.id,
      ...resultWithMeta
    };
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