// src/services/recipeService.js
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
  
  const RECIPES_COLLECTION = 'recipes';
  const RECIPE_VERSIONS_COLLECTION = 'recipeVersions';
  
  // Pobieranie wszystkich receptur
  export const getAllRecipes = async () => {
    const recipesRef = collection(db, RECIPES_COLLECTION);
    const q = query(recipesRef, orderBy('updatedAt', 'desc'));
    
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  };
  
  // Pobieranie receptury po ID
  export const getRecipeById = async (recipeId) => {
    const docRef = doc(db, RECIPES_COLLECTION, recipeId);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      return {
        id: docSnap.id,
        ...docSnap.data()
      };
    } else {
      throw new Error('Receptura nie istnieje');
    }
  };
  
  // Tworzenie nowej receptury
  export const createRecipe = async (recipeData, userId) => {
    const recipeWithMeta = {
      ...recipeData,
      createdBy: userId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      version: 1
    };
    
    // Dodaj recepturę do głównej kolekcji
    const docRef = await addDoc(collection(db, RECIPES_COLLECTION), recipeWithMeta);
    
    // Dodaj pierwszą wersję do kolekcji wersji
    await addDoc(collection(db, RECIPE_VERSIONS_COLLECTION), {
      recipeId: docRef.id,
      version: 1,
      data: recipeWithMeta,
      createdBy: userId,
      createdAt: serverTimestamp()
    });
    
    return {
      id: docRef.id,
      ...recipeWithMeta
    };
  };
  
  // Aktualizacja receptury (tworzy nową wersję)
  export const updateRecipe = async (recipeId, recipeData, userId) => {
    const recipeRef = doc(db, RECIPES_COLLECTION, recipeId);
    
    // Pobierz aktualną wersję
    const currentRecipe = await getRecipeById(recipeId);
    const newVersion = (currentRecipe.version || 0) + 1;
    
    const updatedRecipe = {
      ...recipeData,
      updatedAt: serverTimestamp(),
      updatedBy: userId,
      version: newVersion
    };
    
    // Aktualizuj główny dokument
    await updateDoc(recipeRef, updatedRecipe);
    
    // Zapisz nową wersję w kolekcji wersji
    await addDoc(collection(db, RECIPE_VERSIONS_COLLECTION), {
      recipeId,
      version: newVersion,
      data: {
        ...recipeData,
        version: newVersion
      },
      createdBy: userId,
      createdAt: serverTimestamp()
    });
    
    return {
      id: recipeId,
      ...updatedRecipe
    };
  };
  
  // Pobieranie historii wersji receptury
  export const getRecipeVersions = async (recipeId) => {
    const versionsRef = collection(db, RECIPE_VERSIONS_COLLECTION);
    const q = query(
      versionsRef, 
      where('recipeId', '==', recipeId),
      orderBy('version', 'desc')
    );
    
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  };
  
  // Pobieranie konkretnej wersji receptury
  export const getRecipeVersion = async (recipeId, version) => {
    const versionsRef = collection(db, RECIPE_VERSIONS_COLLECTION);
    const q = query(
      versionsRef, 
      where('recipeId', '==', recipeId),
      where('version', '==', version)
    );
    
    const querySnapshot = await getDocs(q);
    if (querySnapshot.docs.length === 0) {
      throw new Error(`Wersja ${version} receptury nie istnieje`);
    }
    
    return {
      id: querySnapshot.docs[0].id,
      ...querySnapshot.docs[0].data()
    };
  };
  
  // Usuwanie receptury
  export const deleteRecipe = async (recipeId) => {
    const recipeRef = doc(db, RECIPES_COLLECTION, recipeId);
    await deleteDoc(recipeRef);
    
    // Uwaga: Historia wersji pozostaje w bazie danych
    // dla celów audytu i możliwości odtworzenia
    
    return { success: true };
  };
  
  // Przywracanie poprzedniej wersji receptury
  export const restoreRecipeVersion = async (recipeId, versionNumber, userId) => {
    try {
      // Pobierz wersję, którą chcemy przywrócić
      const versionToRestore = await getRecipeVersion(recipeId, versionNumber);
      
      // Pobierz aktualną wersję
      const currentRecipe = await getRecipeById(recipeId);
      const newVersion = (currentRecipe.version || 0) + 1;
      
      // Przygotuj dane do aktualizacji
      const restoredData = {
        ...versionToRestore.data,
        updatedAt: serverTimestamp(),
        updatedBy: userId,
        version: newVersion,
        restoredFrom: versionNumber
      };
      
      // Aktualizuj główny dokument
      const recipeRef = doc(db, RECIPES_COLLECTION, recipeId);
      await updateDoc(recipeRef, restoredData);
      
      // Zapisz nową wersję w kolekcji wersji (z informacją, że to przywrócona wersja)
      await addDoc(collection(db, RECIPE_VERSIONS_COLLECTION), {
        recipeId,
        version: newVersion,
        data: restoredData,
        createdBy: userId,
        createdAt: serverTimestamp(),
        restoredFrom: versionNumber
      });
      
      return {
        id: recipeId,
        ...restoredData
      };
    } catch (error) {
      console.error('Error restoring recipe version:', error);
      throw new Error(`Błąd podczas przywracania wersji: ${error.message}`);
    }
  };