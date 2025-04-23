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
  export const UNITS_OF_MEASURE = ['szt.', 'kg', 'caps'];
  
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
    SEMI_PRODUCTS: 'Opakowania zbiorcze',
    PACKAGING: 'Opakowania jednostkowe',
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
      yield: { quantity: '', unit: UNITS_OF_MEASURE[0] },
      prepTime: '',
      ingredients: [{
        name: '',
        quantity: '',
        unit: UNITS_OF_MEASURE[1]
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
      unit: UNITS_OF_MEASURE[0],
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
      unit: UNITS_OF_MEASURE[0],
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

// Stałe CRM
export const CRM_CONTACT_TYPES = {
  CUSTOMER: 'Klient',
  LEAD: 'Lead',
  PROSPECT: 'Potencjalny klient',
  SUPPLIER: 'Dostawca',
  PARTNER: 'Partner',
  OTHER: 'Inny'
};

export const INTERACTION_TYPES = {
  CALL: 'Rozmowa telefoniczna',
  MEETING: 'Spotkanie',
  EMAIL: 'E-mail',
  NOTE: 'Notatka',
  TASK: 'Zadanie',
  OTHER: 'Inne'
};

export const INTERACTION_STATUSES = {
  PLANNED: 'Zaplanowane',
  COMPLETED: 'Zakończone',
  CANCELLED: 'Anulowane'
};

export const LEAD_STATUSES = {
  NEW: 'Nowy',
  CONTACTED: 'Nawiązano kontakt',
  QUALIFIED: 'Zakwalifikowany',
  UNQUALIFIED: 'Niezakwalifikowany',
  CONVERTED: 'Przekształcony w klienta'
};

export const LEAD_SOURCES = {
  WEBSITE: 'Strona internetowa',
  REFERRAL: 'Polecenie',
  SOCIAL_MEDIA: 'Media społecznościowe',
  TRADE_SHOW: 'Targi',
  COLD_CALL: 'Zimny telefon',
  EMAIL_CAMPAIGN: 'Kampania e-mail',
  OTHER: 'Inne'
};

export const OPPORTUNITY_STAGES = {
  PROSPECTING: 'Poszukiwanie',
  QUALIFICATION: 'Kwalifikacja',
  NEEDS_ANALYSIS: 'Analiza potrzeb',
  VALUE_PROPOSITION: 'Propozycja wartości',
  NEGOTIATION: 'Negocjacje',
  CLOSED_WON: 'Zamknięte wygrane',
  CLOSED_LOST: 'Zamknięte przegrane'
};

export const CAMPAIGN_TYPES = {
  EMAIL: 'E-mail',
  SOCIAL_MEDIA: 'Media społecznościowe',
  TELEMARKETING: 'Telemarketing',
  EVENT: 'Wydarzenie',
  WEBINAR: 'Webinar',
  DIRECT_MAIL: 'Poczta bezpośrednia',
  OTHER: 'Inne'
};

export const CAMPAIGN_STATUSES = {
  PLANNED: 'Planowana',
  ACTIVE: 'Aktywna',
  COMPLETED: 'Zakończona',
  CANCELLED: 'Anulowana'
};

// Domyślne wartości dla formularzy CRM
export const DEFAULT_CRM_VALUES = {
  // Kontakt
  NEW_CONTACT: {
    type: CRM_CONTACT_TYPES.CUSTOMER,
    firstName: '',
    lastName: '',
    company: '',
    position: '',
    email: '',
    phone: '',
    mobile: '',
    address: {
      street: '',
      city: '',
      postalCode: '',
      country: 'Polska'
    },
    notes: '',
    tags: []
  },
  
  // Interakcja
  NEW_INTERACTION: {
    type: INTERACTION_TYPES.CALL,
    subject: '',
    date: new Date().toISOString(),
    duration: 30, // w minutach
    notes: '',
    status: INTERACTION_STATUSES.PLANNED,
    contactId: '',
    contactName: '',
    assignedTo: '',
    reminderDate: null
  },
  
  // Lead
  NEW_LEAD: {
    firstName: '',
    lastName: '',
    company: '',
    position: '',
    email: '',
    phone: '',
    source: LEAD_SOURCES.WEBSITE,
    status: LEAD_STATUSES.NEW,
    estimatedValue: 0,
    notes: '',
    assignedTo: '',
    tags: []
  },
  
  // Szansa sprzedaży
  NEW_OPPORTUNITY: {
    name: '',
    contactId: '',
    contactName: '',
    stage: OPPORTUNITY_STAGES.PROSPECTING,
    amount: 0,
    probability: 0,
    expectedCloseDate: new Date(new Date().setMonth(new Date().getMonth() + 1)).toISOString(),
    notes: '',
    assignedTo: '',
    products: [],
    relatedCampaignId: ''
  },
  
  // Kampania
  NEW_CAMPAIGN: {
    name: '',
    type: CAMPAIGN_TYPES.EMAIL,
    status: CAMPAIGN_STATUSES.PLANNED,
    startDate: new Date().toISOString(),
    endDate: new Date(new Date().setMonth(new Date().getMonth() + 1)).toISOString(),
    budget: 0,
    expectedRevenue: 0,
    description: '',
    objectives: '',
    targetAudience: '',
    success_metrics: [],
    assignedTo: ''
  }
};

// Przedziały czasowe dla zadań produkcyjnych (w minutach)
export const TIME_INTERVALS = [
  { label: 'Do 30 minut', value: 30 },
  { label: '30-60 minut', value: 60 },
  { label: '1-2 godziny', value: 120 },
  { label: '2-4 godziny', value: 240 },
  { label: '4-8 godzin', value: 480 },
  { label: 'Powyżej 8 godzin', value: 600 }
];