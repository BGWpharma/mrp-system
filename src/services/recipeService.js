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
  import { clearCache } from './aiDataService';
  
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
  
  /**
   * Pobiera receptury z paginacją
   * @param {number} page - Numer strony (numeracja od 1)
   * @param {number} limit - Liczba elementów na stronę
   * @param {string} sortField - Pole, po którym sortujemy (domyślnie 'updatedAt')
   * @param {string} sortOrder - Kierunek sortowania (asc/desc) (domyślnie 'desc')
   * @param {string} customerId - Opcjonalne filtrowanie wg ID klienta
   * @param {string} searchTerm - Opcjonalne filtrowanie wg tekstu wyszukiwania
   * @returns {Object} - Obiekt zawierający dane i informacje o paginacji
   */
  export const getRecipesWithPagination = async (page = 1, limit = 10, sortField = 'updatedAt', sortOrder = 'desc', customerId = null, searchTerm = null) => {
    try {
      // Pobierz całkowitą liczbę receptur (przed filtrowaniem przez customerId)
      let countQuery;
      if (customerId) {
        countQuery = query(
          collection(db, RECIPES_COLLECTION),
          where('customerId', '==', customerId)
        );
      } else {
        countQuery = collection(db, RECIPES_COLLECTION);
      }
      
      const countSnapshot = await getDocs(countQuery);
      const totalCount = countSnapshot.size;
      
      // Ustaw realne wartości dla page i limit
      const pageNum = Math.max(1, page);
      const itemsPerPage = Math.max(1, limit);
      
      // Oblicz liczbę stron
      const totalPages = Math.ceil(totalCount / itemsPerPage);
      
      // Jeśli żądana strona jest większa niż liczba stron, ustaw na ostatnią stronę
      const safePageNum = Math.min(pageNum, Math.max(1, totalPages));
      
      // Przygotuj zapytanie
      let q;
      if (customerId) {
        q = query(
          collection(db, RECIPES_COLLECTION),
          where('customerId', '==', customerId),
          orderBy(sortField, sortOrder)
        );
      } else {
        q = query(
          collection(db, RECIPES_COLLECTION),
          orderBy(sortField, sortOrder)
        );
      }
      
      // Pobierz wszystkie dokumenty dla sortowania
      // W Firebase nie ma bezpośredniego mechanizmu OFFSET i LIMIT jak w SQL
      // Musimy pobrać dokumenty i ręcznie zaimplementować paginację
      const querySnapshot = await getDocs(q);
      const allDocs = querySnapshot.docs;
      
      // Filtruj wyniki na serwerze jeśli podano searchTerm
      let filteredDocs = allDocs;
      if (searchTerm && searchTerm.trim() !== '') {
        const searchTermLower = searchTerm.toLowerCase().trim();
        filteredDocs = allDocs.filter(doc => {
          const data = doc.data();
          return (
            (data.name && data.name.toLowerCase().includes(searchTermLower)) ||
            (data.description && data.description.toLowerCase().includes(searchTermLower))
          );
        });
        
        // Aktualizujemy liczby po filtrowaniu
        const filteredTotalCount = filteredDocs.length;
        const filteredTotalPages = Math.ceil(filteredTotalCount / itemsPerPage);
        const filteredSafePageNum = Math.min(pageNum, Math.max(1, filteredTotalPages));
        
        // Ręczna paginacja po filtrowaniu
        const startIndex = (filteredSafePageNum - 1) * itemsPerPage;
        const endIndex = Math.min(startIndex + itemsPerPage, filteredDocs.length);
        const paginatedDocs = filteredDocs.slice(startIndex, endIndex);
        
        // Mapujemy dokumenty na obiekty
        const recipes = paginatedDocs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        
        // Zwróć dane wraz z informacjami o paginacji
        return {
          data: recipes,
          pagination: {
            page: filteredSafePageNum,
            limit: itemsPerPage,
            totalItems: filteredTotalCount,
            totalPages: filteredTotalPages
          }
        };
      }
      
      // Standardowa paginacja bez wyszukiwania
      const startIndex = (safePageNum - 1) * itemsPerPage;
      const endIndex = Math.min(startIndex + itemsPerPage, allDocs.length);
      const paginatedDocs = allDocs.slice(startIndex, endIndex);
      
      // Mapujemy dokumenty na obiekty
      const recipes = paginatedDocs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      // Zwróć dane wraz z informacjami o paginacji
      return {
        data: recipes,
        pagination: {
          page: safePageNum,
          limit: itemsPerPage,
          totalItems: totalCount,
          totalPages: totalPages
        }
      };
    } catch (error) {
      console.error('Błąd podczas pobierania receptur z paginacją:', error);
      throw error;
    }
  };
  
  // Pobieranie receptur dla konkretnego klienta
  export const getRecipesByCustomer = async (customerId) => {
    console.log('getRecipesByCustomer - customerId:', customerId);
    
    if (!customerId) {
      // Jeśli nie podano ID klienta, zwróć wszystkie receptury
      console.log('Brak ID klienta, zwracam wszystkie receptury');
      return getAllRecipes();
    }

    console.log('Tworzę zapytanie dla klienta:', customerId);
    const recipesRef = collection(db, RECIPES_COLLECTION);
    const q = query(
      recipesRef, 
      where('customerId', '==', customerId),
      orderBy('updatedAt', 'desc')
    );
    
    try {
      console.log('Wykonuję zapytanie do Firestore');
      const querySnapshot = await getDocs(q);
      console.log('Otrzymano dokumentów:', querySnapshot.docs.length);
      
      const results = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      console.log('Wyniki zapytania:', results.length);
      return results;
    } catch (error) {
      console.error('Błąd podczas pobierania receptur dla klienta:', error);
      throw error;
    }
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
    // Upewnij się, że wydajność jest zawsze ustawiona na 1
    const processedRecipeData = {
      ...recipeData,
      yield: { quantity: 1, unit: 'szt.' },
      processingCostPerUnit: parseFloat(recipeData.processingCostPerUnit) || 0,
      productionTimePerUnit: parseFloat(recipeData.productionTimePerUnit) || 0
    };
    
    const recipeWithMeta = {
      ...processedRecipeData,
      createdBy: userId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      version: 1,
      customerId: recipeData.customerId || null
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
    
    // Wyczyść cache receptur, aby mieć pewność, że nowa receptura będzie widoczna
    clearCache('recipes');
    
    // Odśwież indeks wyszukiwania receptur
    try {
      const searchService = (await import('./searchService')).default;
      if (searchService && typeof searchService.refreshIndex === 'function') {
        await searchService.refreshIndex(RECIPES_COLLECTION);
      }
    } catch (error) {
      console.error('Błąd podczas odświeżania indeksu wyszukiwania receptur:', error);
      // Błąd odświeżania indeksu nie powinien przerwać całej operacji
    }
    
    return {
      id: docRef.id,
      ...recipeWithMeta
    };
  };
  
  // Aktualizacja receptury (tworzy nową wersję)
  export const updateRecipe = async (recipeId, recipeData, userId) => {
    try {
      // Pobierz aktualną wersję
      const recipeRef = doc(db, RECIPES_COLLECTION, recipeId);
      const recipeSnapshot = await getDoc(recipeRef);
      
      if (!recipeSnapshot.exists()) {
        throw new Error('Receptura nie istnieje');
      }
      
      const currentRecipe = {
        id: recipeSnapshot.id,
        ...recipeSnapshot.data()
      };
      
      // Zwiększ numer wersji
      const newVersion = (currentRecipe.version || 0) + 1;
      
      // Upewnij się, że wydajność jest zawsze ustawiona na 1
      const processedRecipeData = {
        ...recipeData,
        yield: { quantity: 1, unit: 'szt.' },
        processingCostPerUnit: parseFloat(recipeData.processingCostPerUnit) || 0,
        productionTimePerUnit: parseFloat(recipeData.productionTimePerUnit) || 0
      };
      
      // Przygotuj dane do aktualizacji
      const updateData = {
        ...processedRecipeData,
        version: newVersion,
        updatedAt: serverTimestamp(),
        updatedBy: userId,
        customerId: recipeData.customerId !== undefined ? recipeData.customerId : (currentRecipe.customerId || null)
      };
      
      // Aktualizuj dokument
      await updateDoc(recipeRef, updateData);
      
      // Zapisz nową wersję w kolekcji wersji
      await addDoc(collection(db, RECIPE_VERSIONS_COLLECTION), {
        recipeId,
        version: newVersion,
        data: updateData,
        createdBy: userId,
        createdAt: serverTimestamp()
      });
      
      // Wyczyść cache receptur, aby mieć pewność, że zaktualizowana receptura będzie widoczna
      clearCache('recipes');
      
      // Odśwież indeks wyszukiwania receptur
      try {
        const searchService = (await import('./searchService')).default;
        if (searchService && typeof searchService.refreshIndex === 'function') {
          await searchService.refreshIndex(RECIPES_COLLECTION);
        }
      } catch (error) {
        console.error('Błąd podczas odświeżania indeksu wyszukiwania receptur po aktualizacji:', error);
        // Błąd odświeżania indeksu nie powinien przerwać całej operacji
      }
      
      return {
        id: recipeId,
        ...updateData
      };
    } catch (error) {
      console.error('Error updating recipe:', error);
      throw error;
    }
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
    try {
      // Usuń główny dokument
      await deleteDoc(doc(db, RECIPES_COLLECTION, recipeId));
      
      // Usuń wszystkie wersje receptury
      const versionsRef = collection(db, RECIPE_VERSIONS_COLLECTION);
      const q = query(versionsRef, where('recipeId', '==', recipeId));
      const versionsSnapshot = await getDocs(q);
      
      const batch = [];
      versionsSnapshot.forEach(doc => {
        batch.push(deleteDoc(doc.ref));
      });
      
      // Wykonaj usuwanie wszysktich wersji równolegle
      if (batch.length > 0) {
        await Promise.all(batch);
      }
      
      // Wyczyść cache receptur, aby usunięta receptura nie była widoczna
      clearCache('recipes');
      
      // Odśwież indeks wyszukiwania receptur
      try {
        const searchService = (await import('./searchService')).default;
        if (searchService && typeof searchService.refreshIndex === 'function') {
          await searchService.refreshIndex(RECIPES_COLLECTION);
        }
      } catch (error) {
        console.error('Błąd podczas odświeżania indeksu wyszukiwania receptur po usunięciu:', error);
        // Błąd odświeżania indeksu nie powinien przerwać całej operacji
      }
      
      return true;
    } catch (error) {
      console.error('Error deleting recipe:', error);
      throw error;
    }
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
      
      // Wyczyść cache receptur, aby przywrócona wersja receptury była widoczna
      clearCache('recipes');
      
      // Odśwież indeks wyszukiwania receptur
      try {
        const searchService = (await import('./searchService')).default;
        if (searchService && typeof searchService.refreshIndex === 'function') {
          await searchService.refreshIndex(RECIPES_COLLECTION);
        }
      } catch (error) {
        console.error('Błąd podczas odświeżania indeksu wyszukiwania receptur po przywróceniu:', error);
        // Błąd odświeżania indeksu nie powinien przerwać całej operacji
      }
      
      return {
        id: recipeId,
        ...restoredData
      };
    } catch (error) {
      console.error('Error restoring recipe version:', error);
      throw new Error(`Błąd podczas przywracania wersji: ${error.message}`);
    }
  };
  
  // Funkcja naprawiająca wydajność w istniejących recepturach
  export const fixRecipeYield = async (recipeId, userId) => {
    try {
      // Pobierz recepturę
      const recipe = await getRecipeById(recipeId);
      
      if (!recipe) {
        throw new Error('Receptura nie istnieje');
      }
      
      // Napraw wydajność - zawsze ustaw na 1
      const fixedYield = { quantity: 1, unit: 'szt.' };
      
      // Aktualizuj recepturę
      const recipeRef = doc(db, RECIPES_COLLECTION, recipeId);
      await updateDoc(recipeRef, {
        yield: fixedYield,
        updatedAt: serverTimestamp(),
        updatedBy: userId
      });
      
      // Wyczyść cache receptur po naprawieniu wydajności
      clearCache('recipes');
      
      // Odśwież indeks wyszukiwania receptur
      try {
        const searchService = (await import('./searchService')).default;
        if (searchService && typeof searchService.refreshIndex === 'function') {
          await searchService.refreshIndex(RECIPES_COLLECTION);
        }
      } catch (error) {
        console.error('Błąd podczas odświeżania indeksu wyszukiwania receptur po naprawie wydajności:', error);
        // Błąd odświeżania indeksu nie powinien przerwać całej operacji
      }
      
      return {
        success: true,
        message: 'Wydajność receptury została naprawiona'
      };
    } catch (error) {
      console.error('Błąd podczas naprawiania wydajności receptury:', error);
      throw error;
    }
  };
  
  // Funkcja do odświeżania cache'u receptur
  export const refreshRecipesCache = async () => {
    try {
      // Wyczyść cache receptur w aiDataService
      clearCache('recipes');
      
      // Wyczyść również lokalny indeks wyszukiwania receptur
      try {
        const searchService = (await import('./searchService')).default;
        if (searchService && typeof searchService.refreshIndex === 'function') {
          await searchService.refreshIndex(RECIPES_COLLECTION);
        }
      } catch (error) {
        console.error('Błąd podczas odświeżania indeksu wyszukiwania receptur:', error);
        // Błąd odświeżania indeksu nie powinien przerwać całej operacji
      }
      
      return {
        success: true,
        message: 'Cache receptur został odświeżony'
      };
    } catch (error) {
      console.error('Błąd podczas odświeżania cache receptur:', error);
      throw error;
    }
  };