import { db } from './firebase/config';
import { 
  collection, 
  addDoc, 
  getDocs, 
  getDoc, 
  updateDoc, 
  doc, 
  query, 
  where, 
  orderBy, 
  serverTimestamp,
  limit,
  deleteDoc,
  setDoc
} from 'firebase/firestore';
import { 
  prepareBusinessDataForAI, 
  getMRPSystemSummary, 
  getInventoryItems, 
  getCustomerOrders, 
  getProductionTasks, 
  getSuppliers,
  getRecipes,
  getPurchaseOrders
} from './aiDataService';

// Deklaracja funkcji getMockResponse przed jej użyciem (hoisting)
let getMockResponse;

// Maksymalna liczba wiadomości w kontekście
const MAX_CONTEXT_MESSAGES = 15;

/**
 * Pobierz klucz API OpenAI zapisany w bazie danych Firebase
 * @param {string} userId - ID użytkownika
 * @returns {Promise<string|null>} - Klucz API OpenAI lub null jeśli nie znaleziono
 */
export const getOpenAIApiKey = async (userId) => {
  try {
    const apiKeyRef = doc(db, 'settings', 'openai', 'users', userId);
    const apiKeyDoc = await getDoc(apiKeyRef);
    
    if (apiKeyDoc.exists() && apiKeyDoc.data().apiKey) {
      return apiKeyDoc.data().apiKey;
    }
    
    return null;
  } catch (error) {
    console.error('Błąd podczas pobierania klucza API OpenAI:', error);
    throw error;
  }
};

/**
 * Zapisz klucz API OpenAI w bazie danych Firebase
 * @param {string} userId - ID użytkownika
 * @param {string} apiKey - Klucz API OpenAI
 * @returns {Promise<void>}
 */
export const saveOpenAIApiKey = async (userId, apiKey) => {
  try {
    const apiKeyRef = doc(db, 'settings', 'openai', 'users', userId);
    await setDoc(apiKeyRef, {
      apiKey,
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    console.error('Błąd podczas zapisywania klucza API OpenAI:', error);
    throw error;
  }
};

/**
 * Wysyła zapytanie do API OpenAI (GPT-4o)
 * @param {string} apiKey - Klucz API OpenAI
 * @param {Array} messages - Wiadomości do wysłania do API
 * @returns {Promise<string>} - Odpowiedź asystenta
 */
export const callOpenAIAPI = async (apiKey, messages) => {
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages,
        temperature: 0.7,
        max_tokens: 4000
      })
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      const errorMessage = errorData.error?.message || 'Błąd podczas komunikacji z API OpenAI';
      
      // Sprawdzamy, czy error dotyczy limitu zapytań lub pobierania
      if (response.status === 429) {
        throw new Error(`Przekroczono limit zapytań do API OpenAI: ${errorMessage}`);
      } else if (errorMessage.includes('quota')) {
        throw new Error(`Przekroczono przydział API OpenAI: ${errorMessage}`);
      } else {
        throw new Error(errorMessage);
      }
    }
    
    const data = await response.json();
    return data.choices[0].message.content;
  } catch (error) {
    console.error('Błąd podczas komunikacji z API OpenAI:', error);
    throw error;
  }
};

/**
 * Formatuje wiadomości do wysłania do API OpenAI wraz z danymi kontekstowymi z bazy danych
 * @param {Array} messages - Lista wiadomości z konwersacji
 * @param {Object} businessData - Dane biznesowe z systemu MRP
 * @returns {Array} - Sformatowane wiadomości dla API OpenAI
 */
const formatMessagesForOpenAI = (messages, businessData = null) => {
  // Przygotowanie danych biznesowych do prezentacji
  let businessDataContext = '';
  
  if (businessData) {
    // Dodaj podstawowe podsumowanie systemu
    if (businessData.summary) {
      businessDataContext += `\n### Podsumowanie systemu MRP:\n`;
      const summary = businessData.summary;
      businessDataContext += `- Łączna liczba produktów: ${summary.totalInventoryItems || 0}\n`;
      businessDataContext += `- Łączna liczba zamówień: ${summary.totalOrders || 0}\n`;
      businessDataContext += `- Łączna liczba zadań produkcyjnych: ${summary.totalProductionTasks || 0}\n`;
      businessDataContext += `- Aktywne zadania produkcyjne: ${summary.activeProductionTasks || 0}\n`;
      businessDataContext += `- Produkty z niskim stanem: ${summary.itemsLowOnStock || 0}\n`;
      
      // Dodatkowe informacje z podsumowania systemu
      if (summary.pendingPurchaseOrders) {
        businessDataContext += `- Oczekujące zamówienia zakupu: ${summary.pendingPurchaseOrders}\n`;
      }
      if (summary.totalSuppliers) {
        businessDataContext += `- Łączna liczba dostawców: ${summary.totalSuppliers}\n`;
      }
      businessDataContext += `- Timestamp danych: ${summary.timestamp}\n`;
    }
    
    // Dodaj dane o produkcji zawsze, gdy są dostępne
    if (businessData.data && businessData.data.productionTasks && 
        businessData.data.productionTasks.length > 0) {
      
      businessDataContext += `\n### Dane o zadaniach produkcyjnych (MO - Manufacturing Orders):\n`;
      const tasks = businessData.data.productionTasks;
      businessDataContext += `Liczba pobranych zadań: ${tasks.length}\n`;
      
      // Dodaj statystyki statusów
      if (businessData.analysis && businessData.analysis.production && 
          businessData.analysis.production.tasksByStatus) {
        businessDataContext += `\nStatusy zadań:\n`;
        const statuses = businessData.analysis.production.tasksByStatus;
        Object.keys(statuses).forEach(status => {
          businessDataContext += `- ${status}: ${statuses[status]}\n`;
        });
      }
      
      // Dodaj szczegóły dotyczące aktywnych zadań
      const activeTasks = tasks.filter(task => 
        task.status !== 'completed' && task.status !== 'cancelled' && 
        task.status !== 'Zakończone' && task.status !== 'Anulowane'
      ).slice(0, 10); // Zwiększono liczbę wyświetlanych zadań
      
      if (activeTasks.length > 0) {
        businessDataContext += `\nAktywne zadania produkcyjne (MO):\n`;
        activeTasks.forEach((task, index) => {
          businessDataContext += `${index + 1}. ID: ${task.id}, Nazwa: ${task.name || task.productName || `Zadanie #${task.id}`} - `;
          businessDataContext += `status: ${task.status || 'nieznany'}`;
          
          if (task.plannedStartDate) {
            const startDate = new Date(task.plannedStartDate);
            businessDataContext += `, planowane rozpoczęcie: ${startDate.toLocaleDateString('pl-PL')}`;
          }
          
          if (task.quantity) {
            businessDataContext += `, ilość: ${task.quantity}`;
          }
          
          if (task.orderNumber || task.productionOrder) {
            businessDataContext += `, nr zlecenia: ${task.orderNumber || task.productionOrder || 'N/A'}`;
          }
          
          businessDataContext += `\n`;
        });
      }
      
      // Dodaj szczegóły dotyczące zakończonych zadań
      if (businessData.analysis && 
          businessData.analysis.production && 
          businessData.analysis.production.completedTasks) {
        
        const completedTasks = businessData.analysis.production.completedTasks;
        const stats = businessData.analysis.production.completedTasksStats;
        
        businessDataContext += `\nZakończone zadania produkcyjne (MO):\n`;
        businessDataContext += `Liczba zakończonych zadań: ${stats?.count || completedTasks.length}\n`;
        
        if (stats && stats.avgDuration) {
          businessDataContext += `Średni czas trwania: ${stats.avgDuration.toFixed(2)} h\n`;
        }
        
        if (stats && stats.totalQuantity) {
          businessDataContext += `Łączna wyprodukowana ilość: ${stats.totalQuantity}\n`;
        }
        
        businessDataContext += `\nOstatnie zakończone zadania:\n`;
        
        // Wyświetl najnowsze zakończone zadania
        const recentTasks = businessData.analysis.production.recentlyCompletedTasks || 
                           completedTasks.slice(0, 8);
        
        recentTasks.forEach((task, index) => {
          businessDataContext += `${index + 1}. ID: ${task.id}, ${task.name} - `;
          if (task.endDate) {
            const endDate = new Date(task.endDate);
            businessDataContext += `zakończone: ${endDate.toLocaleDateString('pl-PL')}`;
          } else {
            businessDataContext += `zakończone`;
          }
          
          if (task.quantity) {
            businessDataContext += `, ilość: ${task.quantity}`;
          }
          
          if (task.duration) {
            businessDataContext += `, czas: ${task.duration} h`;
          }
          
          businessDataContext += `\n`;
        });
      }
    }
    
    // Dodaj dane o recepturach zawsze, gdy są dostępne
    if (businessData.data && businessData.data.recipes && 
        businessData.data.recipes.length > 0) {
      
      businessDataContext += `\n### Dane o recepturach:\n`;
      const recipes = businessData.data.recipes;
      businessDataContext += `Liczba receptur: ${recipes.length}\n`;
      
      // Dodaj statystyki receptur
      if (businessData.analysis && businessData.analysis.recipes) {
        const recipesAnalysis = businessData.analysis.recipes;
        
        if (recipesAnalysis.recipesWithComponents > 0) {
          businessDataContext += `Receptury z komponentami: ${recipesAnalysis.recipesWithComponents}\n`;
          businessDataContext += `Średnia liczba komponentów na recepturę: ${recipesAnalysis.avgComponentsPerRecipe.toFixed(1)}\n`;
        }
        
        // Wyświetl informacje o recepturach
        if (recipesAnalysis.recentRecipes && recipesAnalysis.recentRecipes.length > 0) {
          businessDataContext += `\nDostępne receptury (Top 10):\n`;
          
          // Pokaż więcej receptur (do 10)
          const topRecipes = recipes.slice(0, 10).map(recipe => {
            const componentsCount = recipe.components?.length || 0;
            const ingredientsCount = recipe.ingredients?.length || 0;
            return {
              id: recipe.id,
              name: recipe.name || 'Bez nazwy',
              componentsCount: componentsCount + ingredientsCount,
              product: recipe.productName || recipe.product?.name || 'Nieznany produkt',
              unit: recipe.unit || 'szt.'
            };
          });
          
          topRecipes.forEach((recipe, index) => {
            businessDataContext += `${index + 1}. ${recipe.name} (${recipe.product}) - ${recipe.componentsCount} komponentów\n`;
          });
        }
        
        // Jeśli zapytanie dotyczy konkretnej receptury, pokaż szczegóły
        const recipeName = extractRecipeName(businessData.query);
        if (recipeName) {
          const recipe = recipes.find(r => 
            r.name.toLowerCase().includes(recipeName.toLowerCase())
          );
          
          if (recipe) {
            businessDataContext += `\n### Szczegóły receptury "${recipe.name}":\n`;
            businessDataContext += `Produkt wyjściowy: ${recipe.productName || recipe.product?.name || 'Nieznany'}\n`;
            businessDataContext += `Jednostka: ${recipe.unit || 'szt.'}\n`;
            
            // Sprawdź zarówno pole components jak i ingredients
            const hasComponents = recipe.components && recipe.components.length > 0;
            const hasIngredients = recipe.ingredients && recipe.ingredients.length > 0;
            
            if (hasComponents) {
              businessDataContext += `\nKomponenty (${recipe.components.length}):\n`;
              recipe.components.forEach((component, idx) => {
                businessDataContext += `- ${component.name || component.materialName || `Komponent ${idx+1}`}: ${component.quantity || 1} ${component.unit || 'szt.'}\n`;
              });
            } else if (hasIngredients) {
              businessDataContext += `\nSkładniki (${recipe.ingredients.length}):\n`;
              recipe.ingredients.forEach((ingredient, idx) => {
                businessDataContext += `- ${ingredient.name || `Składnik ${idx+1}`}: ${ingredient.quantity || 1} ${ingredient.unit || 'szt.'}\n`;
              });
            } else {
              businessDataContext += `\nTa receptura nie ma zdefiniowanych komponentów ani składników.\n`;
            }
          }
        }
      }
    }
    
    // Dodaj dane o magazynie zawsze, gdy są dostępne
    if (businessData.data && businessData.data.inventory && 
        businessData.data.inventory.length > 0) {
      
      businessDataContext += `\n### Dane o stanie magazynowym:\n`;
      businessDataContext += `Liczba produktów: ${businessData.data.inventory.length}\n`;
      
      // Dodaj informacje o produktach z niskim stanem
      if (businessData.analysis && businessData.analysis.inventory) {
        const inventory = businessData.analysis.inventory;
        
        if (inventory.lowStockItems && inventory.lowStockItems.length > 0) {
          businessDataContext += `\nProdukty z niskim stanem (${inventory.lowStockItems.length}):\n`;
          inventory.lowStockItems.slice(0, 10).forEach((item, index) => {
            businessDataContext += `- ${item.name}: ${item.quantity} szt. (min: ${item.minQuantity})\n`;
          });
          
          if (inventory.lowStockItems.length > 10) {
            businessDataContext += `... i ${inventory.lowStockItems.length - 10} więcej\n`;
          }
        }
        
        if (inventory.outOfStockItems && inventory.outOfStockItems.length > 0) {
          businessDataContext += `\nProdukty niedostępne (${inventory.outOfStockItems.length}):\n`;
          inventory.outOfStockItems.slice(0, 10).forEach((item, index) => {
            businessDataContext += `- ${item.name}\n`;
          });
          
          if (inventory.outOfStockItems.length > 10) {
            businessDataContext += `... i ${inventory.outOfStockItems.length - 10} więcej\n`;
          }
        }
        
        // Dodaj informacje o produktach z nadmiernym stanem
        if (inventory.overStockItems && inventory.overStockItems.length > 0) {
          businessDataContext += `\nProdukty z nadmiernym stanem (${inventory.overStockItems.length}):\n`;
          inventory.overStockItems.slice(0, 5).forEach((item, index) => {
            businessDataContext += `- ${item.name}: ${item.quantity} szt. (max: ${item.maxQuantity})\n`;
          });
          
          if (inventory.overStockItems.length > 5) {
            businessDataContext += `... i ${inventory.overStockItems.length - 5} więcej\n`;
          }
        }
        
        // Dodaj przykłady produktów z normalnym stanem
        const normalStockItems = businessData.data.inventory.filter(item => 
          item.quantity > (item.minQuantity || 0) && 
          (!item.maxQuantity || item.quantity <= item.maxQuantity)
        ).slice(0, 5);
        
        if (normalStockItems.length > 0) {
          businessDataContext += `\nPrzykładowe produkty z normalnym stanem:\n`;
          normalStockItems.forEach((item, index) => {
            businessDataContext += `- ${item.name}: ${item.quantity} ${item.unit || 'szt.'}\n`;
          });
        }
      }
    }
    
    // Dodaj dane o zamówieniach klientów zawsze, gdy są dostępne
    if (businessData.data && businessData.data.orders && 
        businessData.data.orders.length > 0) {
      
      businessDataContext += `\n### Dane o zamówieniach klientów (CO - Customer Orders):\n`;
      businessDataContext += `Liczba zamówień: ${businessData.data.orders.length}\n`;
      
      // Dodaj statystyki statusów zamówień klientów
      if (businessData.analysis && businessData.analysis.orders && 
          businessData.analysis.orders.ordersByStatus) {
        businessDataContext += `\nStatusy zamówień klientów:\n`;
        const statuses = businessData.analysis.orders.ordersByStatus;
        Object.keys(statuses).forEach(status => {
          businessDataContext += `- ${status}: ${statuses[status]}\n`;
        });
      }
      
      // Wyświetl szczegóły zamówień klientów
      if (businessData.analysis && businessData.analysis.orders) {
        const orders = businessData.analysis.orders;
        
        if (orders.totalValue) {
          businessDataContext += `\nŁączna wartość zamówień: ${orders.totalValue.toFixed(2)} PLN\n`;
        }
        
        if (orders.averageOrderValue) {
          businessDataContext += `Średnia wartość zamówienia: ${orders.averageOrderValue.toFixed(2)} PLN\n`;
        }
        
        // Ostatnie zamówienia
        if (orders.recentOrders && orders.recentOrders.length > 0) {
          businessDataContext += `\nOstatnie zamówienia klientów (CO):\n`;
          orders.recentOrders.forEach((order, index) => {
            businessDataContext += `${index + 1}. ID: ${order.id}, Klient: ${order.customer}, Status: ${order.status}, Data: ${order.date}, Wartość: ${order.value} PLN\n`;
          });
        }
      }
      
      // Dodaj informacje o aktywnych zamówieniach
      const activeOrders = businessData.data.orders.filter(order => 
        order.status !== 'completed' && order.status !== 'cancelled' && 
        order.status !== 'Zakończone' && order.status !== 'Anulowane'
      ).slice(0, 10); // Zwiększono liczbę wyświetlanych zamówień
      
      if (activeOrders.length > 0) {
        businessDataContext += `\nSzczegóły aktywnych zamówień klientów (CO):\n`;
        activeOrders.forEach((order, index) => {
          businessDataContext += `${index + 1}. ID: ${order.id}, Klient: ${order.customerName || 'Nieznany'}, Status: ${order.status || 'nieznany'}\n`;
          if (order.items && order.items.length > 0) {
            businessDataContext += `   Pozycje:\n`;
            order.items.slice(0, 5).forEach(item => { // Zwiększono liczbę pozycji
              businessDataContext += `   - ${item.name || 'Pozycja'}: ${item.quantity} ${item.unit || 'szt.'}, ${item.price ? `cena: ${item.price} PLN` : ''}\n`;
            });
            if (order.items.length > 5) {
              businessDataContext += `   ... i ${order.items.length - 5} więcej pozycji\n`;
            }
          }
        });
      }
    }
    
    // Dodaj dane o dostawcach, jeśli są dostępne
    if (businessData.data && businessData.data.suppliers && 
        businessData.data.suppliers.length > 0) {
      
      businessDataContext += `\n### Dane o dostawcach:\n`;
      businessDataContext += `Liczba dostawców: ${businessData.data.suppliers.length}\n`;
      
      // Dodaj przykłady dostawców
      const topSuppliers = businessData.data.suppliers.slice(0, 8); // Zwiększono liczbę dostawców
      if (topSuppliers.length > 0) {
        businessDataContext += `\nPrzykładowi dostawcy:\n`;
        topSuppliers.forEach((supplier, index) => {
          businessDataContext += `${index + 1}. ID: ${supplier.id}, Nazwa: ${supplier.name || 'Bez nazwy'}, Osoba: ${supplier.contactPerson || 'Brak'}\n`;
          if (supplier.email || supplier.phone) {
            businessDataContext += `   Kontakt: ${supplier.email || ''} ${supplier.phone ? ', tel: ' + supplier.phone : ''}\n`;
          }
          if (supplier.category) {
            businessDataContext += `   Kategoria: ${supplier.category}\n`;
          }
        });
      }
    }
    
    // Dodaj dane o zamówieniach zakupu, jeśli są dostępne
    if (businessData.data && businessData.data.purchaseOrders && 
        businessData.data.purchaseOrders.length > 0) {
      
      businessDataContext += `\n### Dane o zamówieniach zakupu (PO - Purchase Orders):\n`;
      businessDataContext += `Liczba zamówień zakupu: ${businessData.data.purchaseOrders.length}\n`;
      
      // Dodaj statystyki statusów
      if (businessData.analysis && businessData.analysis.purchaseOrders && 
          businessData.analysis.purchaseOrders.poByStatus) {
        businessDataContext += `\nStatusy zamówień zakupu:\n`;
        const statuses = businessData.analysis.purchaseOrders.poByStatus;
        Object.keys(statuses).forEach(status => {
          businessDataContext += `- ${status}: ${statuses[status]}\n`;
        });
      }
      
      // Dodaj wartości zamówień zakupu
      if (businessData.analysis && businessData.analysis.purchaseOrders) {
        const poAnalysis = businessData.analysis.purchaseOrders;
        
        if (poAnalysis.totalValue) {
          businessDataContext += `\nŁączna wartość zamówień zakupu: ${poAnalysis.totalValue.toFixed(2)} PLN\n`;
        }
        
        if (poAnalysis.averagePOValue) {
          businessDataContext += `Średnia wartość zamówienia zakupu: ${poAnalysis.averagePOValue.toFixed(2)} PLN\n`;
        }
      }
      
      // Szczegóły bieżących zamówień zakupu
      if (businessData.analysis && businessData.analysis.purchaseOrders && 
          businessData.analysis.purchaseOrders.currentPOs) {
        const currentPOs = businessData.analysis.purchaseOrders.currentPOs;
        
        if (currentPOs.length > 0) {
          businessDataContext += `\nBieżące zamówienia zakupu (PO):\n`;
          currentPOs.slice(0, 10).forEach((po, index) => { // Zwiększono liczbę zamówień
            businessDataContext += `${index + 1}. ID: ${po.id}, Dostawca: ${po.supplier}, Status: ${po.status}\n`;
            businessDataContext += `   Data zamówienia: ${po.orderDate || 'N/A'}, Oczekiwana dostawa: ${po.expectedDeliveryDate || 'N/A'}, Wartość: ${po.totalValue.toFixed(2)} PLN\n`;
          });
          
          if (currentPOs.length > 10) {
            businessDataContext += `... i ${currentPOs.length - 10} więcej\n`;
          }
        }
      }
      
      // Szczegóły wszystkich zamówień zakupu
      const topPurchaseOrders = businessData.data.purchaseOrders.slice(0, 8); // Dodatkowe szczegóły
      if (topPurchaseOrders.length > 0) {
        businessDataContext += `\nSzczegółowe dane zamówień zakupu (PO):\n`;
        topPurchaseOrders.forEach((po, index) => {
          businessDataContext += `${index + 1}. ID: ${po.id}, Dostawca: ${po.supplierName || po.supplier?.name || 'Nieznany'}, Status: ${po.status || 'nieznany'}\n`;
          
          if (po.items && po.items.length > 0) {
            businessDataContext += `   Pozycje zamówienia:\n`;
            po.items.slice(0, 5).forEach(item => { // Zwiększono liczbę pozycji
              businessDataContext += `   - ${item.name || 'Pozycja'}: ${item.quantity} ${item.unit || 'szt.'} ${item.price ? `, cena: ${item.price} PLN` : ''}\n`;
            });
            if (po.items.length > 5) {
              businessDataContext += `   ... i ${po.items.length - 5} więcej pozycji\n`;
            }
          }
        });
      }
    }
  }
  
  // Instrukcja systemowa jako pierwszy element
  const systemPrompt = `Jesteś zaawansowanym asystentem AI dla systemu MRP, specjalizującym się w szczegółowej analizie danych biznesowych. 
  Wykorzystujesz dane z bazy danych Firebase, na której oparty jest system MRP do przeprowadzania dokładnych i wnikliwych analiz.
  
  Odpowiadaj zawsze w języku polskim. Twoim zadaniem jest dogłębna analiza danych, zarządzanie produkcją, 
  stanami magazynowymi i procesami biznesowymi w przedsiębiorstwie produkcyjnym. Twoje odpowiedzi powinny być:
  
  1. SZCZEGÓŁOWE - zawsze podawaj dokładne liczby, daty, wartości i opisy z danych
  2. ANALITYCZNE - nie tylko opisuj dane, ale wyciągaj z nich wnioski biznesowe
  3. POMOCNE - sugeruj konkretne działania i rozwiązania problemów
  4. PROFESJONALNE - używaj odpowiedniej terminologii z dziedziny zarządzania produkcją
  
  Znasz i rozumiesz wszystkie kluczowe pojęcia i skróty w systemie MRP:
  - MO (Manufacturing Orders) - Zlecenia produkcyjne
  - CO (Customer Orders) - Zamówienia klientów
  - PO (Purchase Orders) - Zamówienia zakupu
  
  Dla zadań produkcyjnych (MO), analizuj:
  - Terminy rozpoczęcia i zakończenia produkcji
  - Potrzebne zasoby i materiały
  - Status zadań i obecny postęp
  - Związki z zamówieniami klientów i recepturami
  - Efektywność i czas realizacji zadań
  
  Dla zamówień klientów (CO), analizuj:
  - Statusy i terminowość realizacji
  - Wartości zamówień i marże
  - Produkty najczęściej zamawiane
  - Relacje z klientami i trendy zamówień
  - Powiązania z zadaniami produkcyjnymi
  
  Dla zamówień zakupu (PO), analizuj:
  - Dostawców i warunki zakupów
  - Terminy dostaw i ich dotrzymywanie
  - Statusy zamówień i etapy realizacji
  - Wartości zamówień i koszty materiałów
  - Wpływ na stany magazynowe

  Dla stanów magazynowych, identyfikuj:
  - Produkty z niskim stanem lub brakiem
  - Produkty z nadmiernym stanem
  - Koszty utrzymania zapasów
  - Lokalizacje magazynowe
  - Surowce wymagające uzupełnienia
  
  Dla receptur, analizuj:
  - Komponenty i ich ilości
  - Koszty produkcji
  - Możliwości optymalizacji
  - Standardy jakości i kontrolę
  
  Zawsze podawaj dane liczbowe, procentowe porównania i uwzględniaj trendy, jeśli są widoczne.
  Pamiętaj o podawaniu konkretnych ID zamówień, zadań i produktów, gdy odnośisz się do konkretnych obiektów.
  
  Masz pełny dostęp do bazy danych Firebase i możesz korzystać z wszystkich danych zawartych w systemie MRP.
  Zawsze podawaj aktualne informacje na podstawie danych z bazy, a nie ogólnej wiedzy.
  
  Struktura danych w Firebase to:
  - aiConversations - Przechowuje historię konwersacji z asystentem AI
  - counters - Liczniki używane przez system
  - customers - Dane klientów firmy
  - inventory - Stany magazynowe produktów
  - inventoryBatches - Partie magazynowe produktów
  - inventorySupplierPrices - Ceny produktów od dostawców
  - inventoryTransactions - Transakcje magazynowe
  - itemGroups - Grupy produktów
  - notifications - Powiadomienia systemowe
  - orders (CO) - Zamówienia klientów
  - priceListItems - Elementy cenników
  - priceLists - Cenniki
  - productionHistory - Historia produkcji
  - productionTasks (MO) - Zadania produkcyjne
  - purchaseOrders (PO) - Zamówienia zakupu
  - recipeVersions - Wersje receptur
  - recipes - Receptury produktów
  - settings - Ustawienia systemu
  - suppliers - Dostawcy
  - users - Użytkownicy systemu
  - warehouses - Magazyny
  - workstations - Stanowiska pracy
  `;
  
  let systemContent = systemPrompt;
  
  // Dodaj kontekst biznesowy, jeśli jest dostępny
  if (businessDataContext) {
    systemContent += `\n\nOto aktualne dane z systemu MRP do wykorzystania w analizie:${businessDataContext}`;
  }
  
  const systemInstruction = {
    role: 'system',
    content: systemContent
  };
  
  // Limitujemy liczbę wiadomości do MAX_CONTEXT_MESSAGES ostatnich
  const recentMessages = messages.slice(-MAX_CONTEXT_MESSAGES);
  
  // Formatowanie wiadomości do formatu wymaganego przez API OpenAI
  const formattedMessages = recentMessages.map(msg => ({
    role: msg.role,
    content: msg.content
  }));
  
  return [systemInstruction, ...formattedMessages];
};

/**
 * Wyciąga nazwę receptury z zapytania użytkownika
 * @param {string} query - Zapytanie użytkownika
 * @returns {string|null} - Znaleziona nazwa receptury lub null
 */
const extractRecipeName = (query) => {
  // Wzorce do rozpoznawania zapytań o konkretne receptury
  const patterns = [
    /receptur[aęy][\s\w]*"([^"]+)"/i,       // receptura "nazwa"
    /receptur[aęy][\s\w]*„([^"]+)"/i,        // receptura „nazwa"
    /receptur[aęy][\s\w]+([a-zżźćńółęąś]{3,})/i,  // receptura nazwa
    /przepis[\s\w]+([a-zżźćńółęąś]{3,})/i,   // przepis nazwa
    /receptur[aęy][\s\w]+dla[\s\w]+([a-zżźćńółęąś]{3,})/i, // receptura dla nazwa
    /receptur[aęy][\s\w]+produktu[\s\w]+([a-zżźćńółęąś]{3,})/i // receptura produktu nazwa
  ];
  
  for (const pattern of patterns) {
    const match = query.match(pattern);
    if (match && match[1] && match[1].length > 2) {
      return match[1].trim();
    }
  }
  
  return null;
};

// Definicja funkcji getMockResponse
/**
 * Generuje lokalne odpowiedzi asystenta na podstawie zapytania i dostępnych danych
 * @param {string} query - Zapytanie użytkownika
 * @param {Object} businessData - Dane biznesowe z systemu MRP (opcjonalne)
 * @returns {string} - Odpowiedź asystenta
 */
getMockResponse = (query, businessData = null) => {
  // Jeśli mamy dane biznesowe, używamy ich do generowania odpowiedzi
  if (businessData && businessData.data) {
    // Dane o magazynie
    if (query.toLowerCase().includes('magazyn') || query.toLowerCase().includes('stan') || 
        query.toLowerCase().includes('produkt') || query.toLowerCase().includes('towar')) {
      
      if (businessData.data.inventory && businessData.data.inventory.length > 0) {
        const inventory = businessData.data.inventory;
        const totalItems = inventory.length;
        
        // Analiza braków i niskich stanów
        const lowStock = businessData.analysis?.inventory?.lowStockItems || [];
        const outOfStock = businessData.analysis?.inventory?.outOfStockItems || [];
        
        if (lowStock.length > 0 || outOfStock.length > 0) {
          let response = `Na podstawie danych z systemu MRP, w magazynie znajduje się łącznie ${totalItems} pozycji. `;
          
          if (lowStock.length > 0) {
            response += `Produkty z niskim stanem magazynowym (${lowStock.length}): `;
            response += lowStock.slice(0, 3).map(item => `${item.name} (${item.quantity} szt.)`).join(', ');
            if (lowStock.length > 3) response += ` i ${lowStock.length - 3} więcej.`;
          }
          
          if (outOfStock.length > 0) {
            response += ` Produkty niedostępne (${outOfStock.length}): `;
            response += outOfStock.slice(0, 3).map(item => item.name).join(', ');
            if (outOfStock.length > 3) response += ` i ${outOfStock.length - 3} więcej.`;
          }
          
          return response;
        } else {
          return `W systemie MRP znajduje się ${totalItems} pozycji magazynowych. Wszystkie produkty mają wystarczający stan magazynowy.`;
        }
      }
    }
    
    // Dane o zamówieniach produkcyjnych
    if (query.toLowerCase().includes('produkcj') || query.toLowerCase().includes('zleceni') || 
        query.toLowerCase().includes('mo ') || query.toLowerCase().includes('zadani')) {
      
      if (businessData.data.productionTasks && businessData.data.productionTasks.length > 0) {
        const tasks = businessData.data.productionTasks;
        const tasksByStatus = businessData.analysis?.production?.tasksByStatus || {};
        const statuses = Object.keys(tasksByStatus);
        
        let response = `W systemie MRP jest ${tasks.length} zadań produkcyjnych. `;
        
        if (statuses.length > 0) {
          response += 'Status zadań: ';
          response += statuses.map(status => `${status}: ${tasksByStatus[status]}`).join(', ');
          
          if (businessData.analysis?.production?.totalPlannedHours) {
            response += `. Łączny planowany czas produkcji: ${businessData.analysis.production.totalPlannedHours.toFixed(1)} godzin.`;
          }
        }
        
        return response;
      }
    }
    
    // Dane o recepturach
    if (query.toLowerCase().includes('receptur') || query.toLowerCase().includes('przepis') || 
        query.toLowerCase().includes('komponent') || query.toLowerCase().includes('składnik')) {
      
      if (businessData.data.recipes && businessData.data.recipes.length > 0) {
        const recipes = businessData.data.recipes;
        
        // Sprawdź czy zapytanie dotyczy konkretnej receptury
        const recipeName = extractRecipeName(query);
        if (recipeName) {
          // Szukaj receptury po nazwie
          const recipe = recipes.find(r => 
            r.name.toLowerCase().includes(recipeName.toLowerCase())
          );
          
          if (recipe) {
            let response = `Znalazłem recepturę "${recipe.name}". `;
            
            // Sprawdź zarówno pole components jak i ingredients
            const hasComponents = recipe.components && recipe.components.length > 0;
            const hasIngredients = recipe.ingredients && recipe.ingredients.length > 0;
            
            if (hasComponents) {
              response += `Zawiera ${recipe.components.length} komponentów. `;
              
              // Dodaj informacje o kilku pierwszych komponentach
              response += `Główne komponenty to: `;
              response += recipe.components.slice(0, 3).map(comp => 
                `${comp.name || comp.materialName || 'Komponent'} (${comp.quantity || 1} ${comp.unit || 'szt.'})`
              ).join(', ');
              
              if (recipe.components.length > 3) {
                response += ` oraz ${recipe.components.length - 3} innych komponentów.`;
              }
            } else if (hasIngredients) {
              response += `Zawiera ${recipe.ingredients.length} składników. `;
              
              // Dodaj informacje o kilku pierwszych składnikach
              response += `Główne składniki to: `;
              response += recipe.ingredients.slice(0, 3).map(ing => 
                `${ing.name || 'Składnik'} (${ing.quantity || 1} ${ing.unit || 'szt.'})`
              ).join(', ');
              
              if (recipe.ingredients.length > 3) {
                response += ` oraz ${recipe.ingredients.length - 3} innych składników.`;
              }
            } else {
              response += `Ta receptura nie ma zdefiniowanych komponentów ani składników.`;
            }
            
            return response;
          } else {
            return `Nie znalazłem receptury zawierającej nazwę "${recipeName}" w bazie danych. W systemie jest dostępnych ${recipes.length} innych receptur.`;
          }
        }
        
        // Ogólne informacje o recepturach
        const recipesWithComponents = recipes.filter(r => r.components && r.components.length > 0).length;
        
        // Dodajemy oddzielne liczenie receptur ze składnikami (ingredients)
        const recipesWithIngredients = recipes.filter(r => r.ingredients && r.ingredients.length > 0).length;
        
        // Ogólna liczba receptur z jakimikolwiek komponentami lub składnikami
        const totalRecipesWithItems = recipes.filter(r => 
          (r.components && r.components.length > 0) || 
          (r.ingredients && r.ingredients.length > 0)
        ).length;
        
        let response = `W systemie MRP jest ${recipes.length} receptur. `;
        
        if (totalRecipesWithItems > 0) {
          if (recipesWithComponents > 0 && recipesWithIngredients > 0) {
            response += `${totalRecipesWithItems} z nich ma zdefiniowane elementy (${recipesWithComponents} z komponentami, ${recipesWithIngredients} ze składnikami). `;
          } else if (recipesWithComponents > 0) {
            response += `${recipesWithComponents} z nich ma zdefiniowane komponenty. `;
          } else if (recipesWithIngredients > 0) {
            response += `${recipesWithIngredients} z nich ma zdefiniowane składniki. `;
          }
        }
        
        // Dodaj informacje o kilku przykładowych recepturach
        if (recipes.length > 0) {
          response += `Przykładowe receptury: `;
          response += recipes.slice(0, 3).map(r => r.name).join(', ');
          
          if (recipes.length > 3) {
            response += ` i ${recipes.length - 3} innych.`;
          }
        }
        
        return response;
      }
    }
    
    // Dane o zamówieniach klientów
    if (query.toLowerCase().includes('zamówieni') || query.toLowerCase().includes('klient') || 
        query.toLowerCase().includes('sprzedaż')) {
      
      if (businessData.data.orders && businessData.data.orders.length > 0) {
        const orders = businessData.data.orders;
        const ordersByStatus = businessData.analysis?.orders?.ordersByStatus || {};
        const statuses = Object.keys(ordersByStatus);
        
        let response = `W systemie MRP jest ${orders.length} zamówień klientów. `;
        
        if (statuses.length > 0) {
          response += 'Status zamówień: ';
          response += statuses.map(status => `${status}: ${ordersByStatus[status]}`).join(', ');
        }
        
        if (businessData.analysis?.orders?.recentOrders?.length > 0) {
          const recentOrders = businessData.analysis.orders.recentOrders;
          response += `. Najnowsze zamówienia: `;
          response += recentOrders.slice(0, 3).map(order => `${order.customer} (${order.status}, ${order.date})`).join(', ');
        }
        
        return response;
      }
    }
  }
  
  // Jeśli nie mamy danych lub nie pasują do zapytania, używamy standardowych odpowiedzi
  const mockResponses = [
    `Na podstawie danych w systemie MRP, mogę odpowiedzieć na pytanie o "${query}". System jest połączony z bazą danych, ale dla pełnej funkcjonalności zalecam skonfigurowanie klucza API OpenAI.`,
    `Analizując dane magazynowe, mogłbym powiedzieć więcej o "${query}". Mam dostęp do bazy danych systemu MRP, ale potrzebuję klucza API OpenAI do bardziej zaawansowanych analiz.`,
    `Aby udzielić precyzyjnej odpowiedzi na temat "${query}", korzystam z danych w bazie systemu MRP. Dla lepszych wyników zalecam konfigurację klucza API OpenAI.`,
    `System połączony z bazą danych może analizować "${query}", ale bardziej zaawansowane funkcje wymagają klucza API OpenAI.`
  ];
  
  return mockResponses[Math.floor(Math.random() * mockResponses.length)];
};

/**
 * Pobierz historię konwersacji dla danego użytkownika
 * @param {string} userId - ID użytkownika
 * @param {number} limitCount - Limit liczby konwersacji do pobrania
 * @returns {Promise<Array>} - Lista konwersacji
 */
export const getUserConversations = async (userId, limitCount = 10) => {
  try {
    const conversationsRef = collection(db, 'aiConversations');
    const q = query(
      conversationsRef,
      where('userId', '==', userId),
      orderBy('updatedAt', 'desc'),
      limit(limitCount)
    );
    
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  } catch (error) {
    console.error('Błąd podczas pobierania konwersacji użytkownika:', error);
    throw error;
  }
};

/**
 * Pobierz wiadomości dla danej konwersacji
 * @param {string} conversationId - ID konwersacji
 * @returns {Promise<Array>} - Lista wiadomości
 */
export const getConversationMessages = async (conversationId) => {
  try {
    const messagesRef = collection(db, 'aiConversations', conversationId, 'messages');
    const q = query(messagesRef, orderBy('timestamp', 'asc'));
    
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  } catch (error) {
    console.error('Błąd podczas pobierania wiadomości konwersacji:', error);
    throw error;
  }
};

/**
 * Utwórz nową konwersację
 * @param {string} userId - ID użytkownika
 * @param {string} title - Tytuł konwersacji
 * @returns {Promise<string>} - ID utworzonej konwersacji
 */
export const createConversation = async (userId, title = 'Nowa konwersacja') => {
  try {
    const conversationsRef = collection(db, 'aiConversations');
    const docRef = await addDoc(conversationsRef, {
      userId,
      title,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      messageCount: 0
    });
    
    return docRef.id;
  } catch (error) {
    console.error('Błąd podczas tworzenia nowej konwersacji:', error);
    throw error;
  }
};

/**
 * Dodaj wiadomość do konwersacji
 * @param {string} conversationId - ID konwersacji
 * @param {string} role - Rola nadawcy ('user' lub 'assistant')
 * @param {string} content - Treść wiadomości
 * @returns {Promise<string>} - ID dodanej wiadomości
 */
export const addMessageToConversation = async (conversationId, role, content) => {
  try {
    // Dodanie wiadomości
    const messagesRef = collection(db, 'aiConversations', conversationId, 'messages');
    const timestamp = new Date().toISOString();
    
    const docRef = await addDoc(messagesRef, {
      role,
      content,
      timestamp
    });
    
    // Aktualizacja licznika wiadomości i daty aktualizacji konwersacji
    const conversationRef = doc(db, 'aiConversations', conversationId);
    const conversationDoc = await getDoc(conversationRef);
    
    if (conversationDoc.exists()) {
      await updateDoc(conversationRef, {
        messageCount: (conversationDoc.data().messageCount || 0) + 1,
        updatedAt: serverTimestamp(),
        // Aktualizujemy tytuł konwersacji na podstawie pierwszej wiadomości użytkownika
        ...(role === 'user' && conversationDoc.data().messageCount === 0 ? 
          { title: content.substring(0, 50) + (content.length > 50 ? '...' : '') } 
          : {})
      });
    }
    
    return docRef.id;
  } catch (error) {
    console.error('Błąd podczas dodawania wiadomości do konwersacji:', error);
    throw error;
  }
};

/**
 * Funkcja przetwarzająca zapytanie użytkownika i zwracająca odpowiedź asystenta
 * Używa GPT-4o poprzez API OpenAI, wzbogacone o dane z bazy danych
 * @param {string} query - Zapytanie użytkownika
 * @param {Array} context - Kontekst konwersacji (poprzednie wiadomości)
 * @param {string} userId - ID użytkownika
 * @returns {Promise<string>} - Odpowiedź asystenta
 */
export const processAIQuery = async (query, context = [], userId) => {
  // Limit czasu na pobranie danych (w milisekundach)
  const DATA_FETCH_TIMEOUT = 8000;
  
  // Źródła danych - bufor do śledzenia czy dane zostały pobrane
  const dataSources = {
    'businessData': { ready: false, data: null },
    'apiKey': { ready: false, data: null }
  };
  
  try {
    // Wystartuj odliczanie dla limitu czasu - gdy czas upłynie, użyjemy dostępnych danych
    const timeoutPromise = new Promise(resolve => {
      setTimeout(() => {
        console.log('Upłynął limit czasu na pobranie danych, generuję odpowiedź z dostępnymi danymi');
        resolve();
      }, DATA_FETCH_TIMEOUT);
    });
    
    // Równoległe pobieranie danych biznesowych
    const businessDataPromise = (async () => {
      try {
        // Pobierz podsumowanie systemu dla każdego zapytania
        const systemSummary = await getMRPSystemSummary();
        
        // Pobierz szczegółowe dane na podstawie zapytania
        const detailedData = await prepareBusinessDataForAI(query);
        
        // Zawsze włączamy wszystkie dostępne dane dla GPT-4o
        if (detailedData.data) {
          // Sprawdzamy, czy potrzebujemy pobrać jakieś dodatkowe dane
          // które nie zostały jeszcze pobrane w prepareBusinessDataForAI
          // W tej wersji po zmianach w aiDataService.js nie potrzebujemy tego robić,
          // ponieważ wszystkie dane są już pobierane tam
          console.log('Dane dla GPT-4o zostały już pobrane w ramach funkcji prepareBusinessDataForAI');
        }
        
        // Połącz dane
        dataSources.businessData.data = {
          summary: systemSummary,
          ...detailedData
        };
        
        console.log('Pobrano dane z bazy dla AI:', Object.keys(dataSources.businessData.data));
        dataSources.businessData.ready = true;
      } catch (err) {
        console.error('Błąd podczas pobierania danych biznesowych:', err);
        console.error('Szczegóły błędu:', err.message, err.stack);
        // Kontynuuj bez danych biznesowych w przypadku błędu
        dataSources.businessData.ready = true;
      }
    })();
    
    // Równoległe pobieranie klucza API
    const apiKeyPromise = (async () => {
      try {
        dataSources.apiKey.data = await getOpenAIApiKey(userId);
        dataSources.apiKey.ready = true;
      } catch (err) {
        console.error('Błąd podczas pobierania klucza API OpenAI:', err);
        dataSources.apiKey.ready = true;
      }
    })();
    
    // Poczekaj na wszystkie procesy lub na upływ limitu czasu
    await Promise.race([
      Promise.all([businessDataPromise, apiKeyPromise]),
      timeoutPromise
    ]);
    
    // Pobierz dostępne dane
    const businessData = dataSources.businessData.data;
    const apiKey = dataSources.apiKey.data;
    
    // Sprawdź czy nadal trwa pobieranie danych
    const isDataFetchingActive = !dataSources.businessData.ready || !dataSources.apiKey.ready;
    
    // Jeśli dane są nadal pobierane, a nie mamy klucza API lub musimy go użyć
    if (isDataFetchingActive && (!apiKey || query.toLowerCase().includes('dane') || query.toLowerCase().includes('system'))) {
      // Wygeneruj tymczasową odpowiedź
      return `Pracuję nad analizą danych dla Twojego zapytania "${query}". Dane są obszerne i ich przetwarzanie chwilę potrwa. Proszę o cierpliwość, odpowiem jak najszybciej się da.`;
    }
    
    // Jeśli nie ma klucza API, używamy funkcji z danymi lokalnymi
    if (!apiKey) {
      console.log('Brak klucza API - generuję odpowiedź lokalnie');
      return getMockResponse(query, businessData);
    }
    
    // Przygotowanie wiadomości do wysłania
    const allMessages = [...context, { role: 'user', content: query }];
    const formattedMessages = formatMessagesForOpenAI(allMessages, businessData);
    
    console.log('Wysyłam zapytanie do API OpenAI z danymi z Firebase...');
    
    // Wywołanie API OpenAI
    try {
      const response = await callOpenAIAPI(apiKey, formattedMessages);
      console.log('Otrzymano odpowiedź z API OpenAI');
      
      if (!response || response.trim() === '') {
        console.error('API OpenAI zwróciło pustą odpowiedź');
        return getMockResponse(query, businessData); // Fallback do lokalnej odpowiedzi
      }
      
      return response;
    } catch (apiError) {
      console.error('Błąd podczas komunikacji z API OpenAI:', apiError);
      
      // Szczegółowa obsługa różnych rodzajów błędów
      if (apiError.message.includes('Przekroczono limit zapytań')) {
        return `😞 Przekroczono limit zapytań do API OpenAI. Spróbuj ponownie za kilka minut lub sprawdź ustawienia swojego konta OpenAI (https://platform.openai.com/account/limits).`;
      } else if (apiError.message.includes('Przekroczono przydział') || apiError.message.includes('quota') || apiError.message.includes('billing')) {
        return `⚠️ Przekroczono limit dostępnych środków na koncie OpenAI. Aby kontynuować korzystanie z asystenta AI, sprawdź swój plan i dane rozliczeniowe na stronie: https://platform.openai.com/account/billing`;
      } else if (apiError.message.includes('API')) {
        return `❌ Wystąpił błąd podczas komunikacji z API OpenAI: ${apiError.message}. Sprawdź swój klucz API lub spróbuj ponownie później.`;
      }
      
      // Fallback do mocka w przypadku innego błędu
      return getMockResponse(query, businessData);
    }
  } catch (error) {
    console.error('Błąd podczas przetwarzania zapytania przez AI:', error);
    console.error('Szczegóły błędu:', error.message, error.stack);
    
    // Generowanie lokalnej odpowiedzi z informacją o błędzie
    return `Przepraszam, ale napotkałem problem podczas przetwarzania zapytania. Spróbuj ponownie za chwilę lub skontaktuj się z administratorem systemu. (Błąd: ${error.message || 'Nieznany błąd'})`;
  }
};

/**
 * Usuń konwersację
 * @param {string} conversationId - ID konwersacji do usunięcia
 * @returns {Promise<void>}
 */
export const deleteConversation = async (conversationId) => {
  try {
    // W pełnej implementacji należałoby również usunąć wszystkie wiadomości w podkolekcji
    const conversationRef = doc(db, 'aiConversations', conversationId);
    await deleteDoc(conversationRef);
  } catch (error) {
    console.error('Błąd podczas usuwania konwersacji:', error);
    throw error;
  }
}; 