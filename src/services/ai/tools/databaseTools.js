// src/services/ai/tools/databaseTools.js

/**
 * Definicje narzędzi (funkcji) dostępnych dla GPT
 * GPT będzie mógł wywoływać te funkcje na podstawie analizy zapytania użytkownika
 * 
 * Używamy OpenAI Function Calling (Tool Use) do inteligentnego orkiestrowania zapytań
 */
export const DATABASE_TOOLS = [
  {
    type: "function",
    function: {
      name: "query_recipes",
      description: "Pobiera receptury z bazy danych z opcjonalnymi filtrami. Użyj tej funkcji gdy użytkownik pyta o receptury, przepisy, składy produktów.",
      parameters: {
        type: "object",
        properties: {
          filters: {
            type: "array",
            description: "Lista filtrów do zastosowania na receptury",
            items: {
              type: "object",
              properties: {
                field: {
                  type: "string",
                  description: "Pole do filtrowania. Dostępne pola: name (nazwa receptury), category (kategoria), active (czy aktywna - boolean)"
                },
                operator: {
                  type: "string",
                  enum: ["==", "!=", ">", "<", ">=", "<=", "array-contains"],
                  description: "Operator porównania"
                },
                value: {
                  description: "Wartość do porównania"
                }
              },
              required: ["field", "operator", "value"]
            }
          },
          limit: {
            type: "number",
            description: "Maksymalna liczba wyników (domyślnie 100, max 500)",
            default: 100
          },
          orderBy: {
            type: "object",
            description: "Sortowanie wyników",
            properties: {
              field: { 
                type: "string",
                description: "Pole do sortowania (np. name, createdAt, updatedAt)"
              },
              direction: { 
                type: "string", 
                enum: ["asc", "desc"],
                description: "Kierunek sortowania"
              }
            }
          },
          calculateWeight: {
            type: "boolean",
            description: "Czy obliczyć łączną wagę składników dla każdej receptury",
            default: true
          }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "query_inventory",
      description: "Pobiera pozycje magazynowe (materiały) z opcjonalnymi filtrami. Użyj parametru 'searchText' do wyszukiwania po nazwie, opisie lub ID (wyszukiwanie częściowe).",
      parameters: {
        type: "object",
        properties: {
          searchText: {
            type: "string",
            description: "Wyszukaj pozycje magazynowe gdzie nazwa, opis lub ID zawiera WSZYSTKIE podane słowa (case-insensitive, częściowe dopasowanie, znaki specjalne są ignorowane, jednostki normalizowane: '300 gr'='300g', '1 kg'='1kg'). Przykład: 'doypack 300g' znajdzie 'Doypack creatine 300 gr', 'tubes 73' znajdzie 'PACKGW-LID TUBES 73'"
          },
          materialId: {
            type: "string",
            description: "ID materiału (exact match - filtrowane po stronie serwera)"
          },
          categoryId: {
            type: "string",
            description: "ID kategorii (exact match - filtrowane po stronie serwera)"
          },
          filters: {
            type: "array",
            description: "Dodatkowe filtry dla stanów magazynowych",
            items: {
              type: "object",
              properties: {
                field: {
                  type: "string",
                  description: "Pole do filtrowania. Dostępne: materialName, batchNumber, supplier, status, expirationDate"
                },
                operator: { 
                  type: "string", 
                  enum: ["==", "!=", ">", "<", ">=", "<="],
                  description: "Operator porównania" 
                },
                value: { 
                  description: "Wartość do porównania" 
                }
              },
              required: ["field", "operator", "value"]
            }
          },
          checkLowStock: {
            type: "boolean",
            description: "Czy zwrócić tylko produkty z niskim stanem (quantity < minQuantity)",
            default: false
          },
          checkExpiring: {
            type: "boolean",
            description: "Czy zwrócić tylko produkty bliskie wygaśnięcia (w ciągu 30 dni)",
            default: false
          },
          calculateTotals: {
            type: "boolean",
            description: "Czy obliczyć łączne wartości (ilość, wartość)",
            default: true
          },
          limit: {
            type: "number",
            description: "Maksymalna liczba wyników (domyślnie 100, automatycznie 500 dla searchText)",
            default: 100
          }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "query_production_tasks",
      description: "Pobiera zadania produkcyjne (Manufacturing Orders - MO) z filtrami. Użyj gdy użytkownik pyta o produkcję, zlecenia, zadania produkcyjne, MO.",
      parameters: {
        type: "object",
        properties: {
          moNumber: {
            type: "string",
            description: "Numer MO (exact match - filtrowane po stronie serwera) - np. 'MO00116'"
          },
          productId: {
            type: "string",
            description: "ID produktu (exact match - filtrowane po stronie serwera)"
          },
          orderId: {
            type: "string",
            description: "ID zamówienia klienta (exact match - filtrowane po stronie serwera) - użyj do znalezienia wszystkich MO powiązanych z konkretnym zamówieniem"
          },
          lotNumber: {
            type: "string",
            description: "Numer LOT/partii produkcyjnej (exact match - filtrowane po stronie serwera) - np. 'SN00117'"
          },
          status: {
            type: "array",
            items: {
              type: "string",
              enum: ["zaplanowane", "w trakcie", "wstrzymane", "zakończone", "anulowane"]
            },
            description: "Lista statusów zadań do pobrania. Jeśli puste, pobierze wszystkie statusy."
          },
          dateFrom: {
            type: "string",
            description: "Data początkowa w formacie ISO (YYYY-MM-DD) dla filtrowania po dacie utworzenia"
          },
          dateTo: {
            type: "string",
            description: "Data końcowa w formacie ISO (YYYY-MM-DD)"
          },
          assignedTo: {
            type: "string",
            description: "ID użytkownika przypisanego do zadania"
          },
          productName: {
            type: "string",
            description: "Nazwa produktu (częściowe dopasowanie - filtrowane po stronie klienta)"
          },
          includeDetails: {
            type: "boolean",
            description: "Czy dołączyć szczegółowe informacje (materiały, koszty) - UWAGA: znacznie zwiększa zużycie tokenów!",
            default: false
          },
          limit: {
            type: "number",
            description: "Maksymalna liczba wyników",
            default: 100
          }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "query_orders",
      description: "Pobiera zamówienia klientów (Customer Orders - CO) z filtrami. Użyj gdy użytkownik pyta o zamówienia, sprzedaż, CO.",
      parameters: {
        type: "object",
        properties: {
          orderNumber: {
            type: "string",
            description: "Numer zamówienia (exact match - filtrowane po stronie serwera) - np. 'CO00123'"
          },
          status: {
            type: "array",
            items: {
              type: "string"
            },
            description: "Lista statusów zamówień do pobrania"
          },
          customerId: {
            type: "string",
            description: "ID konkretnego klienta (exact match - filtrowane po stronie serwera)"
          },
          customerName: {
            type: "string",
            description: "Nazwa klienta (częściowe dopasowanie - filtrowane po stronie klienta)"
          },
          dateFrom: {
            type: "string",
            description: "Data początkowa (ISO format)"
          },
          dateTo: {
            type: "string",
            description: "Data końcowa (ISO format)"
          },
          includeItems: {
            type: "boolean",
            description: "Czy dołączyć pozycje zamówienia - UWAGA: zwiększa zużycie tokenów!",
            default: false
          },
          limit: {
            type: "number",
            description: "Maksymalna liczba wyników",
            default: 100
          }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "query_purchase_orders",
      description: "Pobiera zamówienia zakupu (Purchase Orders - PO) od dostawców. Użyj gdy użytkownik pyta o zakupy, zamówienia do dostawców, PO.",
      parameters: {
        type: "object",
        properties: {
          poNumber: {
            type: "string",
            description: "Numer PO (exact match - filtrowane po stronie serwera) - np. 'PO00092'"
          },
          status: {
            type: "array",
            items: { type: "string" },
            description: "Statusy zamówień zakupu"
          },
          supplierId: {
            type: "string",
            description: "ID dostawcy (exact match - filtrowane po stronie serwera)"
          },
          supplierName: {
            type: "string",
            description: "Nazwa dostawcy (częściowe dopasowanie - filtrowane po stronie klienta)"
          },
          dateFrom: {
            type: "string",
            description: "Data początkowa (ISO)"
          },
          dateTo: {
            type: "string",
            description: "Data końcowa (ISO)"
          },
          limit: {
            type: "number",
            default: 100
          }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "aggregate_data",
      description: "Wykonuje operacje agregujące na danych (suma, średnia, liczba, grupowanie). Użyj do analiz statystycznych i podsumowań.",
      parameters: {
        type: "object",
        properties: {
          collection: {
            type: "string",
            enum: [
              "recipes", 
              "inventory", 
              "inventory_batches",
              "inventory_transactions",
              "production_tasks", 
              "production_history",
              "customer_orders", 
              "purchase_orders",
              "invoices",
              "cmr_documents",
              "customers",
              "suppliers",
              "users"
            ],
            description: "Kolekcja na której wykonać agregację"
          },
          operation: {
            type: "string",
            enum: ["count", "sum", "average", "min", "max", "group_by"],
            description: "Typ operacji agregującej"
          },
          field: {
            type: "string",
            description: "Pole na którym wykonać operację (wymagane dla sum, average, min, max)"
          },
          groupBy: {
            type: "string",
            description: "Pole do grupowania (wymagane dla group_by)"
          },
          filters: {
            type: "array",
            description: "Opcjonalne filtry przed agregacją",
            items: {
              type: "object",
              properties: {
                field: { type: "string" },
                operator: { type: "string" },
                value: {}
              }
            }
          }
        },
        required: ["collection", "operation"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_count",
      description: "Szybkie zliczanie dokumentów w kolekcji (używa getCountFromServer - najszybsza metoda). Użyj do prostych pytań typu 'ile jest...'.",
      parameters: {
        type: "object",
        properties: {
          collection: {
            type: "string",
            enum: [
              "recipes", 
              "inventory", 
              "inventory_batches",
              "inventory_transactions",
              "production_tasks",
              "production_history",
              "customer_orders", 
              "purchase_orders",
              "invoices",
              "cmr_documents",
              "customers", 
              "suppliers",
              "users"
            ],
            description: "Kolekcja do zliczenia"
          },
          filters: {
            type: "array",
            description: "Opcjonalne filtry (jeśli podane, użyje getDocs zamiast getCountFromServer)",
            items: {
              type: "object",
              properties: {
                field: { type: "string" },
                operator: { type: "string" },
                value: {}
              }
            }
          }
        },
        required: ["collection"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_customers",
      description: "Pobiera listę klientów z opcjonalnymi filtrami. Użyj gdy użytkownik pyta o klientów, kontrahentów.",
      parameters: {
        type: "object",
        properties: {
          active: {
            type: "boolean",
            description: "Czy pobrać tylko aktywnych klientów"
          },
          searchName: {
            type: "string",
            description: "Szukaj klienta po nazwie (częściowe dopasowanie)"
          },
          limit: {
            type: "number",
            default: 100
          }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_suppliers",
      description: "Pobiera listę dostawców z opcjonalnymi filtrami. Użyj gdy użytkownik pyta o dostawców.",
      parameters: {
        type: "object",
        properties: {
          active: {
            type: "boolean",
            description: "Czy pobrać tylko aktywnych dostawców"
          },
          searchName: {
            type: "string",
            description: "Szukaj dostawcy po nazwie"
          },
          limit: {
            type: "number",
            default: 100
          }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "query_invoices",
      description: "Pobiera faktury z opcjonalnymi filtrami. Użyj gdy użytkownik pyta o faktury, rozliczenia, płatności.",
      parameters: {
        type: "object",
        properties: {
          status: {
            type: "array",
            items: { type: "string" },
            description: "Statusy faktur (np. opłacona, nieopłacona, częściowo)"
          },
          customerId: {
            type: "string",
            description: "ID klienta"
          },
          dateFrom: {
            type: "string",
            description: "Data początkowa (ISO format)"
          },
          dateTo: {
            type: "string",
            description: "Data końcowa (ISO format)"
          },
          limit: {
            type: "number",
            default: 100
          }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "query_cmr_documents",
      description: "Pobiera dokumenty CMR (dokumenty przewozowe) z filtrami. Użyj gdy użytkownik pyta o CMR, transport, przewozy.",
      parameters: {
        type: "object",
        properties: {
          status: {
            type: "array",
            items: { type: "string" },
            description: "Statusy dokumentów CMR"
          },
          dateFrom: {
            type: "string",
            description: "Data początkowa (ISO)"
          },
          dateTo: {
            type: "string",
            description: "Data końcowa (ISO)"
          },
          limit: {
            type: "number",
            default: 100
          }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "query_inventory_batches",
      description: "Pobiera partie magazynowe (batches) z filtrami. Użyj gdy użytkownik pyta o partie, numery partii, dostawy materiałów, zamówienia zakupu (PO).",
      parameters: {
        type: "object",
        properties: {
          materialName: {
            type: "string",
            description: "Nazwa materiału (częściowe dopasowanie - filtrowane po stronie klienta)"
          },
          materialId: {
            type: "string",
            description: "ID materiału (exact match - filtrowane po stronie serwera)"
          },
          batchNumber: {
            type: "string",
            description: "Numer partii (exact match)"
          },
          purchaseOrderId: {
            type: "string",
            description: "ID zamówienia zakupu (PO) - znajdzie wszystkie partie przyjęte z tego PO"
          },
          supplierId: {
            type: "string",
            description: "ID dostawcy"
          },
          expirationDateBefore: {
            type: "string",
            description: "Data wygaśnięcia - pobierz partie wygasające przed tą datą (format ISO YYYY-MM-DD) - filtrowane po stronie serwera. UWAGA: wymaga Composite Index w Firestore!"
          },
          checkExpiring: {
            type: "boolean",
            description: "Tylko partie wygasające w ciągu 30 dni (filtrowane po stronie klienta)",
            default: false
          },
          limit: {
            type: "number",
            default: 100
          }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_users",
      description: "Pobiera listę użytkowników systemu. Użyj gdy użytkownik pyta o pracowników, użytkowników, zespół.",
      parameters: {
        type: "object",
        properties: {
          role: {
            type: "string",
            description: "Rola użytkownika (admin, user, viewer, itp.)"
          },
          active: {
            type: "boolean",
            description: "Czy pobrać tylko aktywnych użytkowników"
          },
          limit: {
            type: "number",
            default: 100
          }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "query_production_history",
      description: "Pobiera historię sesji produkcyjnych z analizą produktywności. Użyj gdy użytkownik pyta o produktywność, czas produkcji, wydajność pracowników, sesje produkcyjne, historię produkcji.",
      parameters: {
        type: "object",
        properties: {
          taskId: {
            type: "string",
            description: "ID konkretnego zadania produkcyjnego (MO)"
          },
          userId: {
            type: "string",
            description: "ID pracownika (filtr po użytkowniku)"
          },
          dateFrom: {
            type: "string",
            description: "Data początkowa (ISO format)"
          },
          dateTo: {
            type: "string",
            description: "Data końcowa (ISO format)"
          },
          minQuantity: {
            type: "number",
            description: "Minimalna wyprodukowana ilość"
          },
          calculateProductivity: {
            type: "boolean",
            description: "Czy obliczyć średnią wydajność (ilość/czas)",
            default: true
          },
          groupBy: {
            type: "string",
            enum: ["user", "task", "day", "week", "month"],
            description: "Grupowanie wyników"
          },
          limit: {
            type: "number",
            default: 100
          }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "query_inventory_transactions",
      description: "Pobiera transakcje magazynowe (przyjęcia, zużycia, rezerwacje, korekty). Użyj do analiz przepływu materiałów, historii operacji magazynowych. UWAGA: Dla szczegółowych danych o konsumpcji i rezerwacjach w zadaniach użyj query_production_tasks z includeDetails: true.",
      parameters: {
        type: "object",
        properties: {
          type: {
            type: "array",
            items: { 
              type: "string",
              enum: ["booking", "booking_cancel", "ISSUE", "RECEIVE", "adjustment-add", "adjustment-remove", "TRANSFER"]
            },
            description: "Typy transakcji: booking=rezerwacja, booking_cancel=anulowanie rezerwacji, ISSUE=konsumpcja/zużycie, RECEIVE=przyjęcie materiału, adjustment-add/adjustment-remove=korekty, TRANSFER=transfer między magazynami"
          },
          itemId: {
            type: "string",
            description: "ID materiału"
          },
          itemName: {
            type: "string",
            description: "Nazwa materiału (częściowe dopasowanie)"
          },
          taskId: {
            type: "string",
            description: "ID zadania produkcyjnego (MO)"
          },
          batchId: {
            type: "string",
            description: "ID partii magazynowej"
          },
          dateFrom: {
            type: "string",
            description: "Data początkowa (ISO format)"
          },
          dateTo: {
            type: "string",
            description: "Data końcowa (ISO format)"
          },
          userId: {
            type: "string",
            description: "ID użytkownika który wykonał operację"
          },
          calculateTotals: {
            type: "boolean",
            description: "Czy obliczyć sumy ilości per typ transakcji",
            default: true
          },
          groupBy: {
            type: "string",
            enum: ["type", "item", "task", "user", "day", "week"],
            description: "Grupowanie wyników"
          },
          limit: {
            type: "number",
            default: 100
          }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_system_alerts",
      description: "Generuje alerty o problemach wymagających uwagi: niskie stany magazynowe, wygasające partie, opóźnione MO, niezrealizowane zamówienia. Użyj gdy użytkownik pyta 'co wymaga uwagi', 'jakie problemy', 'pokaż alerty'.",
      parameters: {
        type: "object",
        properties: {
          alertTypes: {
            type: "array",
            items: {
              type: "string",
              enum: ["low_stock", "expiring_batches", "delayed_mo", "pending_orders", "overdue_invoices"]
            },
            description: "Typy alertów do sprawdzenia. Jeśli puste, sprawdzi wszystkie."
          },
          severity: {
            type: "string",
            enum: ["critical", "warning", "info", "all"],
            description: "Poziom ważności alertów",
            default: "all"
          },
          limit: {
            type: "number",
            description: "Maksymalna liczba alertów",
            default: 50
          }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "calculate_production_costs",
      description: "Oblicza koszty produkcji dla MO lub produktów na podstawie rzeczywistych cen materiałów. Użyj gdy użytkownik pyta o koszty, rentowność, marże, opłacalność produkcji.",
      parameters: {
        type: "object",
        properties: {
          taskId: {
            type: "string",
            description: "ID konkretnego MO"
          },
          productName: {
            type: "string",
            description: "Nazwa produktu (wszystkie MO danego produktu)"
          },
          dateFrom: {
            type: "string",
            description: "Data początkowa (ISO format)"
          },
          dateTo: {
            type: "string",
            description: "Data końcowa (ISO format)"
          },
          includeBreakdown: {
            type: "boolean",
            description: "Czy rozpisać koszty na poszczególne materiały",
            default: false
          },
          compareWithPrice: {
            type: "boolean",
            description: "Czy porównać z ceną sprzedaży (analiza marży)",
            default: false
          },
          groupByProduct: {
            type: "boolean",
            description: "Czy grupować wyniki po produkcie",
            default: false
          },
          limit: {
            type: "number",
            default: 100
          }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "trace_material_flow",
      description: "Śledzi przepływ materiału przez system: PO → Partia → MO → Produkt → CO. Używany do traceability i analizy pochodzenia materiałów. Użyj gdy użytkownik pyta 'skąd pochodzi', 'gdzie poszedł materiał', 'traceability'.",
      parameters: {
        type: "object",
        properties: {
          batchId: {
            type: "string",
            description: "ID partii do śledzenia"
          },
          taskId: {
            type: "string",
            description: "ID zadania produkcyjnego (MO)"
          },
          orderId: {
            type: "string",
            description: "ID zamówienia klienta (CO)"
          },
          materialId: {
            type: "string",
            description: "ID materiału"
          },
          direction: {
            type: "string",
            enum: ["forward", "backward", "both"],
            description: "forward = gdzie poszło, backward = skąd pochodziło, both = oba kierunki",
            default: "both"
          },
          includeDetails: {
            type: "boolean",
            description: "Czy dołączyć szczegóły dokumentów",
            default: false
          }
        }
      }
    }
  }
];

/**
 * Mapowanie nazw kolekcji używanych w tools na rzeczywiste nazwy w Firestore
 * 
 * UWAGA: Firestore używa camelCase dla większości kolekcji!
 * Nazwy po lewej (keys) to przyjazne nazwy używane w tool definitions
 * Nazwy po prawej (values) to rzeczywiste nazwy kolekcji w Firestore
 */
export const COLLECTION_MAPPING = {
  // Główne kolekcje produkcyjne
  'recipes': 'recipes',                           // Receptury
  'production_tasks': 'productionTasks',          // ✅ FIXED: Zadania produkcyjne (MO)
  'production_history': 'productionHistory',      // Historia produkcji
  
  // Magazyn
  'inventory': 'inventory',                       // Pozycje magazynowe (materiały)
  'inventory_batches': 'inventoryBatches',        // Partie magazynowe
  'inventory_transactions': 'inventoryTransactions', // Transakcje magazynowe
  'inventory_supplier_prices': 'inventorySupplierPrices', // Ceny od dostawców
  
  // Zamówienia i sprzedaż
  'customer_orders': 'orders',                    // ✅ FIXED: Zamówienia klientów (CO)
  'purchase_orders': 'purchaseOrders',            // ✅ FIXED: Zamówienia zakupu (PO)
  'po_reservations': 'poReservations',            // Rezerwacje zamówień zakupu
  'invoices': 'invoices',                         // Faktury
  
  // CMR i transport
  'cmr_documents': 'cmrDocuments',                // Dokumenty CMR
  'cmr_attachments': 'cmrAttachments',            // Załączniki CMR
  
  // Kontrahenci
  'customers': 'customers',                       // Klienci
  'suppliers': 'suppliers',                       // Dostawcy
  
  // Użytkownicy i system
  'users': 'users',                               // Użytkownicy systemu
  'settings': 'settings',                         // Ustawienia systemowe
  'ai_conversations': 'aiConversations'           // Konwersacje z AI
};

