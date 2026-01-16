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
  import { db, storage } from './firebase/config';
  import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
  import { clearCache } from './aiDataService';
  
  const RECIPES_COLLECTION = 'recipes';
  const RECIPE_VERSIONS_COLLECTION = 'recipeVersions';
  
  // Funkcja sortująca składniki według ilości w ramach grup jednostek
  export const sortIngredientsByQuantity = (ingredients) => {
    if (!ingredients || !Array.isArray(ingredients)) {
      return [];
    }
    
    // Grupuj składniki według jednostek
    const unitGroups = {};
    
    ingredients.forEach((ingredient, index) => {
      const unit = ingredient.unit || 'brak';
      if (!unitGroups[unit]) {
        unitGroups[unit] = [];
      }
      unitGroups[unit].push({ ...ingredient, originalIndex: index });
    });
    
    // Sortuj składniki w każdej grupie według ilości (malejąco)
    const sortedIngredients = [];
    
    // Sortuj grupy jednostek alfabetycznie dla konsystentności
    const sortedUnits = Object.keys(unitGroups).sort();
    
    sortedUnits.forEach(unit => {
      const group = unitGroups[unit];
      
      // Sortuj składniki w grupie według ilości (malejąco)
      group.sort((a, b) => {
        const quantityA = parseFloat(a.quantity) || 0;
        const quantityB = parseFloat(b.quantity) || 0;
        return quantityB - quantityA; // Malejąco
      });
      
      // Dodaj posortowane składniki do wynikowej tablicy
      group.forEach(ingredient => {
        // Usuń pomocnicze pole originalIndex
        const { originalIndex, ...cleanIngredient } = ingredient;
        sortedIngredients.push(cleanIngredient);
      });
    });
    
    return sortedIngredients;
  };
  
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
   * ⚡ OPTYMALIZACJA WYDAJNOŚCI: Pobiera aktywne receptury z podstawowymi polami
   * Używane w formularzach gdzie potrzebne są tylko podstawowe dane do wyboru receptury
   * @param {number} maxResults - Maksymalna liczba receptur do pobrania (domyślnie 150)
   * @returns {Promise<Array>} - Tablica receptur z podstawowymi polami
   */
  export const getActiveRecipesMinimal = async (maxResults = 150) => {
    try {
      const recipesRef = collection(db, RECIPES_COLLECTION);
      
      // Pobierz tylko aktywne receptury, posortowane po nazwie
      // Używamy query z limitem dla lepszej wydajności
      const q = query(
        recipesRef,
        where('status', '==', 'active'),
        orderBy('name', 'asc')
      );
      
      const querySnapshot = await getDocs(q);
      
      // Mapuj tylko potrzebne pola dla wydajności
      const recipes = querySnapshot.docs.slice(0, maxResults).map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          name: data.name || '',
          productName: data.productName || data.name || '',
          category: data.category || '',
          unit: data.unit || 'szt.',
          expectedYield: data.expectedYield || null,
          // Pola potrzebne do TaskForm
          productMaterialId: data.productMaterialId || null,
          lotNumber: data.lotNumber || null,
          processingCostPerUnit: data.processingCostPerUnit || 0,
          productionTimePerUnit: data.productionTimePerUnit || null
        };
      });
      
      console.log(`⚡ getActiveRecipesMinimal: Pobrano ${recipes.length} aktywnych receptur (limit: ${maxResults})`);
      
      return recipes;
    } catch (error) {
      console.error('Błąd w getActiveRecipesMinimal:', error);
      // Fallback do getAllRecipes w przypadku błędu (np. brak indeksu)
      console.warn('Fallback: Używam getAllRecipes');
      const allRecipes = await getAllRecipes();
      return allRecipes
        .filter(r => r.status === 'active')
        .slice(0, maxResults)
        .map(r => ({
          id: r.id,
          name: r.name || '',
          productName: r.productName || r.name || '',
          category: r.category || '',
          unit: r.unit || 'szt.',
          expectedYield: r.expectedYield || null,
          productMaterialId: r.productMaterialId || null,
          lotNumber: r.lotNumber || null,
          processingCostPerUnit: r.processingCostPerUnit || 0,
          productionTimePerUnit: r.productionTimePerUnit || null
        }));
    }
  };
  
  /**
   * Pobiera receptury z paginacją
   * @param {number} page - Numer strony (numeracja od 1)
   * @param {number} limit - Liczba elementów na stronę
   * @param {string} sortField - Pole, po którym sortujemy (domyślnie 'updatedAt')
   * @param {string} sortOrder - Kierunek sortowania (asc/desc) (domyślnie 'desc')
   * @param {string} customerId - Opcjonalne filtrowanie wg ID klienta
   * @param {string} searchTerm - Opcjonalne filtrowanie wg tekstu wyszukiwania
   * @param {boolean|null} hasNotes - Opcjonalne filtrowanie wg notatek (true = z notatkami, false = bez notatek, null = wszystkie)
   * @returns {Object} - Obiekt zawierający dane i informacje o paginacji
   */
  export const getRecipesWithPagination = async (page = 1, limit = 10, sortField = 'updatedAt', sortOrder = 'desc', customerId = null, searchTerm = null, hasNotes = null) => {
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
      
      // Filtruj wyniki na serwerze jeśli podano searchTerm lub hasNotes
      let filteredDocs = allDocs;
      
      // Filtrowanie po notatce
      if (hasNotes !== null) {
        filteredDocs = filteredDocs.filter(doc => {
          const data = doc.data();
          const hasRecipeNotes = data.notes && data.notes.trim() !== '';
          return hasNotes ? hasRecipeNotes : !hasRecipeNotes;
        });
      }
      
      // Filtrowanie po terminie wyszukiwania
      if (searchTerm && searchTerm.trim() !== '') {
        const searchTermLower = searchTerm.toLowerCase().trim();
        filteredDocs = filteredDocs.filter(doc => {
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
      
      // Standardowa paginacja z opcjonalnym filtrowaniem po notatce
      if (hasNotes !== null) {
        // Jeśli filtrujemy po notatce, również należy to uwzględnić
        filteredDocs = allDocs.filter(doc => {
          const data = doc.data();
          const hasRecipeNotes = data.notes && data.notes.trim() !== '';
          return hasNotes ? hasRecipeNotes : !hasRecipeNotes;
        });
        
        // Przelicz statystyki po filtrowaniu
        const filteredTotalCount = filteredDocs.length;
        const filteredTotalPages = Math.ceil(filteredTotalCount / itemsPerPage);
        const filteredSafePageNum = Math.min(pageNum, Math.max(1, filteredTotalPages));
        
        const startIndex = (filteredSafePageNum - 1) * itemsPerPage;
        const endIndex = Math.min(startIndex + itemsPerPage, filteredDocs.length);
        const paginatedDocs = filteredDocs.slice(startIndex, endIndex);
        
        const recipes = paginatedDocs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        
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
      productionTimePerUnit: parseFloat(recipeData.productionTimePerUnit) || 0,
      // Zachowaj kolejność składników ustawioną przez użytkownika (drag&drop)
      ingredients: recipeData.ingredients || [],
      // Załączniki designu produktu - przechowywane w wersjonowaniu
      designAttachments: recipeData.designAttachments || []
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
        productionTimePerUnit: parseFloat(recipeData.productionTimePerUnit) || 0,
        // Zachowaj kolejność składników ustawioną przez użytkownika (drag&drop)
        ingredients: recipeData.ingredients || [],
        // Załączniki designu produktu - przechowywane w wersjonowaniu
        designAttachments: recipeData.designAttachments || []
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
  
  /**
   * Synchronizuje numery CAS dla wszystkich receptur
   * Pobiera numery CAS z pozycji magazynowych i aktualizuje receptury
   * @param {Function} onProgress - Funkcja callback do śledzenia postępu (opcjonalna)
   * @returns {Promise<Object>} - Wyniki synchronizacji
   */
  export const syncAllRecipesCAS = async (onProgress = null) => {
    try {
      console.log('Rozpoczynam masową synchronizację numerów CAS...');
      
      // Pobierz wszystkie receptury
      const recipes = await getAllRecipes();
      let syncedRecipes = 0;
      let skippedRecipes = 0;
      let errorRecipes = 0;
      const updatedRecipes = [];
      
      console.log(`Znaleziono ${recipes.length} receptur do sprawdzenia`);
      
      // Pobierz wszystkie pozycje magazynowe raz dla optymalizacji
      const inventoryRef = collection(db, 'inventory');
      const inventorySnapshot = await getDocs(inventoryRef);
      const inventoryMap = new Map();
      
      inventorySnapshot.docs.forEach(doc => {
        const data = doc.data();
        if (data.casNumber) {
          inventoryMap.set(doc.id, data.casNumber);
        }
      });
      
      console.log(`Załadowano ${inventoryMap.size} pozycji magazynowych z numerami CAS`);
      
      // Przejdź przez każdą recepturę
      for (let i = 0; i < recipes.length; i++) {
        const recipe = recipes[i];
        
        if (onProgress) {
          onProgress({
            current: i + 1,
            total: recipes.length,
            recipeName: recipe.name,
            status: 'processing'
          });
        }
        
        try {
          let recipeUpdated = false;
          const updatedIngredients = [...(recipe.ingredients || [])];
          let ingredientsCASUpdated = 0;
          
          // Sprawdź każdy składnik w recepturze
          for (let j = 0; j < updatedIngredients.length; j++) {
            const ingredient = updatedIngredients[j];
            
            // Jeśli składnik ma ID (powiązany z magazynem)
            if (ingredient.id) {
              const casNumber = inventoryMap.get(ingredient.id);
              
              // Aktualizuj numer CAS jeśli:
              // 1. Składnik nie ma numeru CAS lub ma pusty
              // 2. Numer CAS w pozycji magazynowej różni się od tego w składniku
              if (casNumber && 
                  (!ingredient.casNumber || 
                   ingredient.casNumber.trim() === '' || 
                   ingredient.casNumber.trim() !== casNumber.trim())) {
                
                updatedIngredients[j] = {
                  ...ingredient,
                  casNumber: casNumber
                };
                ingredientsCASUpdated++;
                recipeUpdated = true;
                
                console.log(`Składnik "${ingredient.name}" - aktualizuję CAS z "${ingredient.casNumber || 'brak'}" na "${casNumber}"`);
              }
            }
          }
          
          // Jeśli receptura została zaktualizowana, zapisz zmiany
          if (recipeUpdated) {
            await updateDoc(doc(db, RECIPES_COLLECTION, recipe.id), {
              ingredients: updatedIngredients,
              updatedAt: serverTimestamp()
            });
            
            syncedRecipes++;
            updatedRecipes.push({
              id: recipe.id,
              name: recipe.name,
              casUpdated: ingredientsCASUpdated
            });
            
            console.log(`Zaktualizowano recepturę "${recipe.name}" - dodano ${ingredientsCASUpdated} numerów CAS`);
          } else {
            skippedRecipes++;
          }
          
        } catch (error) {
          console.error(`Błąd podczas aktualizacji receptury "${recipe.name}":`, error);
          errorRecipes++;
        }
      }
      
      // Wyczyść cache receptur po synchronizacji CAS
      clearCache('recipes');
      
      // Odśwież indeks wyszukiwania receptur
      try {
        const searchService = (await import('./searchService')).default;
        if (searchService && typeof searchService.refreshIndex === 'function') {
          await searchService.refreshIndex(RECIPES_COLLECTION);
        }
      } catch (error) {
        console.error('Błąd podczas odświeżania indeksu wyszukiwania receptur po synchronizacji CAS:', error);
        // Błąd odświeżania indeksu nie powinien przerwać całej operacji
      }
      
      const results = {
        success: true,
        totalRecipes: recipes.length,
        syncedRecipes,
        skippedRecipes,
        errorRecipes,
        updatedRecipes
      };
      
      console.log('Synchronizacja CAS zakończona:', results);
      return results;
      
    } catch (error) {
      console.error('Błąd podczas masowej synchronizacji CAS:', error);
      return {
        success: false,
        error: error.message,
        totalRecipes: 0,
        syncedRecipes: 0,
        skippedRecipes: 0,
        errorRecipes: 0,
        updatedRecipes: []
      };
    }
  };

// ========================
// FUNKCJE ZAŁĄCZNIKÓW DESIGNU
// ========================

/**
 * Przesyła załącznik designu produktu
 * @param {File} file - Plik do przesłania
 * @param {string} recipeId - ID receptury
 * @param {string} userId - ID użytkownika przesyłającego
 * @returns {Promise<Object>} - Informacje o przesłanym pliku
 */
export const uploadRecipeDesignAttachment = async (file, recipeId, userId) => {
  try {
    if (!file || !recipeId || !userId) {
      throw new Error('Brak wymaganych parametrów');
    }

    // Sprawdź rozmiar pliku (maksymalnie 20 MB)
    const fileSizeInMB = file.size / (1024 * 1024);
    if (fileSizeInMB > 20) {
      throw new Error(`Plik jest zbyt duży (${fileSizeInMB.toFixed(2)} MB). Maksymalny rozmiar to 20 MB.`);
    }

    // Sprawdź typ pliku - dozwolone są głównie obrazy i dokumenty designu
    const allowedTypes = [
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'image/bmp',
      'image/tiff',
      'image/svg+xml',
      'application/pdf',
      'application/postscript', // .eps files
      'image/x-adobe-dng' // Adobe DNG
    ];

    if (!allowedTypes.includes(file.type)) {
      throw new Error(`Nieobsługiwany typ pliku: ${file.type}. Dozwolone są obrazy (JPG, PNG, GIF, WebP, BMP, TIFF, SVG) i dokumenty designu (PDF, EPS).`);
    }

    // Tworzymy ścieżkę do pliku w Firebase Storage
    const timestamp = new Date().getTime();
    const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const fileName = `${timestamp}_${sanitizedFileName}`;
    const storagePath = `recipe-design-attachments/${recipeId}/${fileName}`;

    // Przesyłamy plik do Firebase Storage
    const fileRef = ref(storage, storagePath);
    await uploadBytes(fileRef, file);

    // Pobieramy URL do pobrania pliku
    const downloadURL = await getDownloadURL(fileRef);

    return {
      id: `${timestamp}_${Math.random().toString(36).substr(2, 9)}`,
      fileName: file.name,
      originalFileName: file.name,
      storagePath,
      downloadURL,
      contentType: file.type,
      size: file.size,
      uploadedBy: userId,
      uploadedAt: new Date().toISOString(),
      description: '' // Pole na opis załącznika
    };
  } catch (error) {
    console.error('Błąd podczas przesyłania załącznika designu:', error);
    throw error;
  }
};

/**
 * Usuwa załącznik designu produktu
 * @param {Object} attachment - Obiekt załącznika do usunięcia
 * @returns {Promise<void>}
 */
export const deleteRecipeDesignAttachment = async (attachment) => {
  try {
    if (!attachment || !attachment.storagePath) {
      throw new Error('Brak wymaganych parametrów');
    }

    // Usuń plik z Firebase Storage
    const fileRef = ref(storage, attachment.storagePath);
    await deleteObject(fileRef);
  } catch (error) {
    console.error('Błąd podczas usuwania załącznika designu:', error);
    throw error;
  }
};

/**
 * Pobiera załączniki designu dla konkretnej wersji receptury
 * @param {string} recipeId - ID receptury
 * @param {number} version - Numer wersji receptury
 * @returns {Promise<Array>} - Lista załączników designu
 */
export const getRecipeDesignAttachmentsByVersion = async (recipeId, version) => {
  try {
    const versionData = await getRecipeVersion(recipeId, version);
    return versionData.data?.designAttachments || [];
  } catch (error) {
    console.error('Błąd podczas pobierania załączników designu dla wersji:', error);
    return [];
  }
};

// ========================
// FUNKCJE ZAŁĄCZNIKÓW ZASAD
// ========================

/**
 * Przesyła załącznik zasad receptury
 * @param {File} file - Plik do przesłania
 * @param {string} recipeId - ID receptury
 * @param {string} userId - ID użytkownika przesyłającego
 * @returns {Promise<Object>} - Informacje o przesłanym pliku
 */
export const uploadRecipeRulesAttachment = async (file, recipeId, userId) => {
  try {
    if (!file || !recipeId || !userId) {
      throw new Error('Brak wymaganych parametrów');
    }

    // Sprawdź rozmiar pliku (maksymalnie 20 MB)
    const fileSizeInMB = file.size / (1024 * 1024);
    if (fileSizeInMB > 20) {
      throw new Error(`Plik jest zbyt duży (${fileSizeInMB.toFixed(2)} MB). Maksymalny rozmiar to 20 MB.`);
    }

    // Sprawdź typ pliku - dozwolone są dokumenty PDF, obrazy i Word
    const allowedTypes = [
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];

    if (!allowedTypes.includes(file.type)) {
      throw new Error(`Nieobsługiwany typ pliku: ${file.type}. Dozwolone są PDF, obrazy (JPG, PNG, GIF, WebP) i dokumenty Word.`);
    }

    // Tworzymy ścieżkę do pliku w Firebase Storage
    const timestamp = new Date().getTime();
    const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const fileName = `${timestamp}_${sanitizedFileName}`;
    const storagePath = `recipe-rules-attachments/${recipeId}/${fileName}`;

    // Przesyłamy plik do Firebase Storage
    const fileRef = ref(storage, storagePath);
    await uploadBytes(fileRef, file);

    // Pobieramy URL do pobrania pliku
    const downloadURL = await getDownloadURL(fileRef);

    return {
      id: `${timestamp}_${Math.random().toString(36).substr(2, 9)}`,
      fileName: file.name,
      storagePath,
      downloadURL,
      contentType: file.type,
      size: file.size,
      uploadedAt: new Date().toISOString(),
      uploadedBy: userId
    };
  } catch (error) {
    console.error('Błąd podczas przesyłania załącznika zasad:', error);
    throw error;
  }
};

/**
 * Usuwa załącznik zasad receptury z Firebase Storage
 * @param {Object} attachment - Obiekt załącznika z właściwością storagePath
 * @returns {Promise<void>}
 */
export const deleteRecipeRulesAttachment = async (attachment) => {
  try {
    if (!attachment || !attachment.storagePath) {
      throw new Error('Brak wymaganych parametrów');
    }

    // Usuń plik z Firebase Storage
    const fileRef = ref(storage, attachment.storagePath);
    await deleteObject(fileRef);
  } catch (error) {
    // Jeśli plik nie istnieje, traktujemy to jako sukces
    if (error.code === 'storage/object-not-found') {
      console.warn('Plik nie istnieje w Storage, kontynuuję usuwanie z bazy');
      return;
    }
    console.error('Błąd podczas usuwania załącznika zasad:', error);
    throw error;
  }
};

/**
 * Pobiera załączniki zasad dla konkretnej wersji receptury
 * @param {string} recipeId - ID receptury
 * @param {number} version - Numer wersji receptury
 * @returns {Promise<Array>} - Lista załączników zasad
 */
export const getRecipeRulesAttachmentsByVersion = async (recipeId, version) => {
  try {
    const versionData = await getRecipeVersion(recipeId, version);
    return versionData.data?.rulesAttachments || [];
  } catch (error) {
    console.error('Błąd podczas pobierania załączników zasad dla wersji:', error);
    return [];
  }
};