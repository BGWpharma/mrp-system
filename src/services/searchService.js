import { db } from './firebase/config';
import { collection, getDocs } from 'firebase/firestore';

// Klucze dla cache
const CACHE_KEYS = {
  RECIPES: 'search_index_recipes',
  PURCHASE_ORDERS: 'search_index_purchase_orders',
  INVENTORY: 'search_index_inventory',
  PRODUCTIONS: 'search_index_productions'
};

// Czas ważności cache w milisekundach (6 godzin)
const CACHE_TTL = 6 * 60 * 60 * 1000;

// Czas ważności cache dla receptur (5 minut)
const RECIPES_CACHE_TTL = 5 * 60 * 1000;

/**
 * Klasa przechowująca indeks wyszukiwania lokalnie w pamięci
 * Przyszła implementacja może zostać rozszerzona o Algolię lub ElasticSearch
 */
class SearchIndexService {
  constructor() {
    this.indexes = {};
    this.lastRefreshTime = {};
    this.initFromLocalStorage();
  }

  /**
   * Inicjalizuje indeksy z localStorage
   */
  initFromLocalStorage() {
    try {
      // Iteruj po wszystkich kluczach cache
      Object.values(CACHE_KEYS).forEach(key => {
        const cachedData = localStorage.getItem(key);
        if (cachedData) {
          const parsed = JSON.parse(cachedData);
          if (this.isCacheValid(parsed.timestamp, key)) {
            this.indexes[key] = parsed.data;
            this.lastRefreshTime[key] = parsed.timestamp;
            console.log(`Załadowano indeks wyszukiwania z cache: ${key}`);
          } else {
            console.log(`Cache nieaktualny dla: ${key}, zostanie odświeżony przy następnym użyciu`);
          }
        }
      });
    } catch (error) {
      console.error('Błąd podczas inicjalizacji indeksów z localStorage:', error);
    }
  }

  /**
   * Sprawdza czy cache jest aktualny
   * @param {number} timestamp - Czas ostatniej aktualizacji cache
   * @param {string} key - Klucz indeksu do sprawdzenia (opcjonalny)
   * @returns {boolean} - Czy cache jest aktualny
   */
  isCacheValid(timestamp, key) {
    // Jeśli to indeks receptur, użyj krótszego czasu ważności
    if (key === CACHE_KEYS.RECIPES) {
      return Date.now() - timestamp < RECIPES_CACHE_TTL;
    }
    return Date.now() - timestamp < CACHE_TTL;
  }

  /**
   * Zapisuje indeks do localStorage
   * @param {string} key - Klucz indeksu
   * @param {Array} data - Dane indeksu
   */
  saveToLocalStorage(key, data) {
    try {
      const cacheData = {
        data,
        timestamp: Date.now()
      };
      
      localStorage.setItem(key, JSON.stringify(cacheData));
      console.log(`Zapisano indeks wyszukiwania do cache: ${key}`);
    } catch (error) {
      console.error(`Błąd podczas zapisywania indeksu do localStorage: ${key}`, error);
    }
  }

  /**
   * Pobiera lub tworzy indeks dla kolekcji receptur
   * @returns {Promise<Array>} - Zindeksowane dane
   */
  async getOrCreateRecipesIndex(forceRefresh = false) {
    const key = CACHE_KEYS.RECIPES;
    
    // Sprawdź czy indeks istnieje i jest aktualny
    if (this.indexes[key] && this.isCacheValid(this.lastRefreshTime[key], key) && !forceRefresh) {
      console.log('Używam buforowanego indeksu dla receptur');
      return this.indexes[key];
    }
    
    console.log('Tworzę nowy indeks dla receptur');
    try {
      // Pobierz wszystkie receptury z Firestore
      const recipesRef = collection(db, 'recipes');
      const snapshot = await getDocs(recipesRef);
      
      // Przygotuj indeks
      const recipes = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          name: data.name || '',
          description: data.description || '',
          notes: data.notes || '',
          customerId: data.customerId || null,
          createdAt: data.createdAt,
          updatedAt: data.updatedAt,
          // Dodaj inne pola potrzebne do wyszukiwania
        };
      });
      
      // Zapisz indeks
      this.indexes[key] = recipes;
      this.lastRefreshTime[key] = Date.now();
      this.saveToLocalStorage(key, recipes);
      
      return recipes;
    } catch (error) {
      console.error('Błąd podczas tworzenia indeksu receptur:', error);
      throw error;
    }
  }

  /**
   * Wyszukuje receptury według zadanego terminu
   * @param {string} searchTerm - Termin wyszukiwania
   * @param {Object} options - Opcje wyszukiwania (paginacja, sortowanie)
   * @returns {Promise<Object>} - Wyniki wyszukiwania z paginacją
   */
  async searchRecipes(searchTerm, options = {}) {
    try {
      // Zdefiniuj domyślne opcje
      const defaultOptions = {
        page: 1,
        limit: 10,
        sortField: 'name',
        sortOrder: 'asc',
        customerId: null,
        hasNotes: null, // null = wszytskie, true = tylko z notatkami, false = tylko bez notatek
      };
      
      // Połącz opcje z domyślnymi
      const { page, limit, sortField, sortOrder, customerId, hasNotes } = {
        ...defaultOptions,
        ...options
      };
      
      // Pobierz indeks
      const recipes = await this.getOrCreateRecipesIndex();
      
      // Filtruj według terminu wyszukiwania i customerId
      const searchTermLower = searchTerm ? searchTerm.toLowerCase().trim() : '';
      
      let filteredRecipes = recipes;
      
      // Filtruj według klienta jeśli podano
      if (customerId) {
        filteredRecipes = filteredRecipes.filter(recipe => recipe.customerId === customerId);
      }
      
      // Filtruj według notatek jeśli podano
      if (hasNotes !== null) {
        filteredRecipes = filteredRecipes.filter(recipe => {
          const hasRecipeNotes = recipe.notes && recipe.notes.trim() !== '';
          return hasNotes ? hasRecipeNotes : !hasRecipeNotes;
        });
      }
      
      // Filtruj według terminu wyszukiwania jeśli podano
      if (searchTermLower) {
        filteredRecipes = filteredRecipes.filter(recipe => 
          recipe.name.toLowerCase().includes(searchTermLower) ||
          recipe.description.toLowerCase().includes(searchTermLower)
        );
      }
      
      // Sortuj wyniki
      const sortMultiplier = sortOrder === 'desc' ? -1 : 1;
      
      filteredRecipes.sort((a, b) => {
        // Obsługa różnych typów pól
        if (sortField === 'updatedAt' || sortField === 'createdAt') {
          // Daty - obsługa różnych formatów daty w bezpieczny sposób
          let aValue = 0;
          let bValue = 0;
          
          try {
            if (a[sortField]) {
              // Obsługa obiektu Firestore Timestamp
              if (typeof a[sortField] === 'object' && typeof a[sortField].toDate === 'function') {
                aValue = a[sortField].toDate().getTime();
              }
              // Obsługa obiektu Date 
              else if (a[sortField] instanceof Date) {
                aValue = a[sortField].getTime();
              }
              // Obsługa stringa z datą
              else if (typeof a[sortField] === 'string') {
                aValue = new Date(a[sortField]).getTime();
                if (isNaN(aValue)) aValue = 0;
              }
              // Obsługa obiektu z sekundami i nanosekundami (format Firestore Timestamp)
              else if (typeof a[sortField] === 'object' && 'seconds' in a[sortField]) {
                aValue = a[sortField].seconds * 1000;
              }
              // Obsługa liczby (timestamp)
              else if (typeof a[sortField] === 'number') {
                aValue = a[sortField];
              }
            }
            
            if (b[sortField]) {
              // Obsługa obiektu Firestore Timestamp
              if (typeof b[sortField] === 'object' && typeof b[sortField].toDate === 'function') {
                bValue = b[sortField].toDate().getTime();
              }
              // Obsługa obiektu Date
              else if (b[sortField] instanceof Date) {
                bValue = b[sortField].getTime();
              }
              // Obsługa stringa z datą
              else if (typeof b[sortField] === 'string') {
                bValue = new Date(b[sortField]).getTime();
                if (isNaN(bValue)) bValue = 0;
              }
              // Obsługa obiektu z sekundami i nanosekundami (format Firestore Timestamp)
              else if (typeof b[sortField] === 'object' && 'seconds' in b[sortField]) {
                bValue = b[sortField].seconds * 1000;
              }
              // Obsługa liczby (timestamp)
              else if (typeof b[sortField] === 'number') {
                bValue = b[sortField];
              }
            }
          } catch (error) {
            console.error('Błąd podczas sortowania według daty:', error);
          }
          
          return sortMultiplier * (aValue - bValue);
        } else {
          // Standardowe porównanie string/number
          const aValue = a[sortField] || '';
          const bValue = b[sortField] || '';
          
          if (typeof aValue === 'string' && typeof bValue === 'string') {
            return sortMultiplier * aValue.localeCompare(bValue);
          } else {
            return sortMultiplier * (aValue - bValue);
          }
        }
      });
      
      // Paginacja wyników
      const totalItems = filteredRecipes.length;
      const totalPages = Math.ceil(totalItems / limit);
      const startIndex = (page - 1) * limit;
      const paginatedRecipes = filteredRecipes.slice(startIndex, startIndex + limit);
      
      // Zwróć wyniki z paginacją
      return {
        data: paginatedRecipes,
        pagination: {
          page,
          limit,
          totalItems,
          totalPages
        }
      };
    } catch (error) {
      console.error('Błąd podczas wyszukiwania receptur:', error);
      throw error;
    }
  }

  /**
   * Odświeża indeks wyszukiwania dla podanej kolekcji
   * @param {string} collectionName - Nazwa kolekcji do odświeżenia
   * @returns {Promise<boolean>} - Czy udało się odświeżyć indeks
   */
  async refreshIndex(collectionName) {
    try {
      let result = false;
      
      // Odśwież indeks w zależności od kolekcji
      if (collectionName === 'recipes') {
        await this.getOrCreateRecipesIndex(true); // Dodajemy parametr forceRefresh
        result = true;
      } else if (collectionName === 'inventory') {
        // TODO: Zaimplementować odświeżanie indeksu dla inventory
        result = false;
      } else if (collectionName === 'purchase_orders') {
        // TODO: Zaimplementować odświeżanie indeksu dla purchase_orders
        result = false;
      } else if (collectionName === 'production_tasks') {
        // TODO: Zaimplementować odświeżanie indeksu dla production_tasks
        result = false;
      }
      
      return result;
    } catch (error) {
      console.error(`Błąd podczas odświeżania indeksu dla ${collectionName}:`, error);
      return false;
    }
  }
}

// Eksportuj singleton instancję klasy
const searchIndexService = new SearchIndexService();
export default searchIndexService; 