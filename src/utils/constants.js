// src/utils/constants.js

// Statusy receptur
export const RECIPE_STATUSES = {
    DRAFT: 'Robocza',
    REVIEW: 'W przeglądzie',
    APPROVED: 'Zatwierdzona',
    RETIRED: 'Wycofana'
  };
  
  // Statusy zadań produkcyjnych
  export const PRODUCTION_TASK_STATUSES = {
    PLANNED: 'Zaplanowane',
    IN_PROGRESS: 'W trakcie',
    PENDING_CONSUMPTION: 'Potwierdzenie zużycia',
    COMPLETED: 'Zakończone',
    CANCELLED: 'Anulowane',
    PAUSED: 'Wstrzymane'
  };
  
  // Priorytety zadań produkcyjnych
  export const PRODUCTION_TASK_PRIORITIES = {
    LOW: 'Niski',
    NORMAL: 'Normalny',
    HIGH: 'Wysoki',
    CRITICAL: 'Krytyczny'
  };
  
  // Jednostki miary
  export const UNITS_OF_MEASURE = {
    PIECE: 'szt.',
    GRAM: 'g',
    KILOGRAM: 'kg',
    MILLILITER: 'ml',
    LITER: 'l',
    PACKAGE: 'opak.',
    TABLESPOON: 'łyżka',
    TEASPOON: 'łyżeczka'
  };
  
  // Kategorie testów jakościowych
  export const QUALITY_TEST_CATEGORIES = {
    CHEMICAL: 'Chemiczny',
    PHYSICAL: 'Fizyczny',
    ORGANOLEPTIC: 'Organoleptyczny',
    MICROBIOLOGICAL: 'Mikrobiologiczny',
    OTHER: 'Inny'
  };
  
  // Etapy produkcji
  export const PRODUCTION_STAGES = {
    RAW_MATERIALS: 'Surowce',
    IN_PROGRESS: 'Produkcja w toku',
    FINISHED_PRODUCT: 'Produkt końcowy',
    STORAGE: 'Magazynowanie'
  };
  
  // Statusy testów jakościowych
  export const QUALITY_TEST_STATUSES = {
    ACTIVE: 'Aktywny',
    INACTIVE: 'Nieaktywny'
  };
  
  // Powody transakcji magazynowych (przyjęcie)
  export const INVENTORY_RECEIVE_REASONS = {
    PURCHASE: 'Zakup',
    RETURN: 'Zwrot',
    PRODUCTION: 'Z produkcji',
    OTHER: 'Inny'
  };
  
  // Powody transakcji magazynowych (wydanie)
  export const INVENTORY_ISSUE_REASONS = {
    PRODUCTION: 'Do produkcji',
    SALE: 'Sprzedaż',
    DEFECT: 'Wada/Zniszczenie',
    OTHER: 'Inny'
  };
  
  // Kategorie pozycji magazynowych
  export const INVENTORY_CATEGORIES = {
    RAW_MATERIALS: 'Surowce',
    SEMI_PRODUCTS: 'Półprodukty',
    PACKAGING: 'Opakowania',
    FINISHED_PRODUCTS: 'Gotowe produkty',
    OTHER: 'Inne'
  };
  
  // Typy transakcji magazynowych
  export const INVENTORY_TRANSACTION_TYPES = {
    RECEIVE: 'RECEIVE',
    ISSUE: 'ISSUE'
  };
  
  // Domyślne wartości dla formularzy
  export const DEFAULT_VALUES = {
    // Receptury
    NEW_RECIPE: {
      name: '',
      description: '',
      instructions: '',
      yield: { quantity: '', unit: UNITS_OF_MEASURE.PIECE },
      prepTime: '',
      ingredients: [{
        name: '',
        quantity: '',
        unit: UNITS_OF_MEASURE.GRAM
      }],
      allergens: [],
      notes: '',
      status: RECIPE_STATUSES.DRAFT
    },
    
    // Zadania produkcyjne
    NEW_TASK: {
      name: '',
      description: '',
      recipeId: '',
      productName: '',
      quantity: '',
      unit: UNITS_OF_MEASURE.PIECE,
      scheduledDate: new Date(),
      estimatedDuration: '',
      priority: PRODUCTION_TASK_PRIORITIES.NORMAL,
      status: PRODUCTION_TASK_STATUSES.PLANNED,
      notes: ''
    },
    
    // Pozycje magazynowe
    NEW_INVENTORY_ITEM: {
      name: '',
      description: '',
      category: '',
      quantity: 0,
      unit: UNITS_OF_MEASURE.PIECE,
      location: '',
      minStock: '',
      maxStock: '',
      supplierInfo: '',
      notes: ''
    },
    
    // Testy jakościowe
    NEW_QUALITY_TEST: {
      name: '',
      description: '',
      category: '',
      productionStage: '',
      parameters: [{
        name: '',
        unit: '',
        minValue: '',
        maxValue: '',
        description: ''
      }],
      instructions: '',
      frequency: '',
      status: QUALITY_TEST_STATUSES.ACTIVE
    }
  };
  
  // Konfiguracja Firebase (przykład)
  export const FIREBASE_CONFIG = {
    apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
    authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
    storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.REACT_APP_FIREBASE_APP_ID
  };