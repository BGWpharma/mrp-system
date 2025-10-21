import { db, storage } from './firebase/config';
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
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
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
import { getSystemSettings, getGlobalOpenAIApiKey } from './settingsService';
import { AIAssistantV2 } from './ai/AIAssistantV2.js';
import { SmartModelSelector } from './ai/optimization/SmartModelSelector.js';
import { ContextOptimizer } from './ai/optimization/ContextOptimizer.js';
import { GPTResponseCache } from './ai/optimization/GPTResponseCache.js';

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
    // Najpierw sprawdzamy ustawienia systemowe
    const systemSettings = await getSystemSettings();
    
    // Jeśli włączona jest opcja globalnego klucza API, pobieramy go
    if (systemSettings.useGlobalApiKey) {
      const globalApiKey = await getGlobalOpenAIApiKey();
      if (globalApiKey) {
        return globalApiKey;
      }
    }
    
    // Jeśli nie ma globalnego klucza lub nie jest używany, próbujemy pobrać klucz użytkownika
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
 * Wysyła zapytanie do API OpenAI z optymalizacjami
 * @param {string} apiKey - Klucz API OpenAI
 * @param {Array} messages - Wiadomości do wysłania do API
 * @param {Object} options - Opcje optymalizacji
 * @returns {Promise<string>} - Odpowiedź asystenta
 */
export const callOpenAIAPI = async (apiKey, messages, options = {}) => {
  try {
    // Wyciągnij zapytanie użytkownika dla optymalizacji
    const userQuery = messages[messages.length - 1]?.content || '';
    const contextSize = JSON.stringify(messages).length;
    
    // NOWA OPTYMALIZACJA: Inteligentny wybór modelu
    const modelConfig = SmartModelSelector.selectOptimalModel(
      userQuery, 
      contextSize, 
      options.complexity || 'medium',
      options.optimizationOptions || {}
    );

    console.log(`[callOpenAIAPI] Użyję modelu ${modelConfig.model} (szacowany koszt: $${modelConfig.estimatedCost.toFixed(4)})`);

    // NOWA OPTYMALIZACJA: Cache dla odpowiedzi
    const contextHash = GPTResponseCache.generateContextHash(messages);
    const cacheOptions = {
      enableCache: true,
      estimatedCost: modelConfig.estimatedCost,
      cacheDuration: options.cacheDuration || GPTResponseCache.CACHE_DURATION
    };

    const apiStartTime = performance.now();
    
    const cachedResponse = await GPTResponseCache.getCachedOrFetch(
      userQuery,
      contextHash,
      async () => {
        // Wykonanie rzeczywistego zapytania API
        // GPT-5 ma inne wymagania API niż poprzednie modele
        const isGPT5 = modelConfig.model === 'gpt-5';
        
        const requestBody = {
          model: modelConfig.model,
          messages
        };
        
        // GPT-5 wymaga innych parametrów:
        if (isGPT5) {
          // GPT-5 używa max_completion_tokens i nie wspiera niestandardowego temperature
          // WAŻNE: max_completion_tokens obejmuje reasoning_tokens + output_tokens
          // Musimy dać dużo więcej miejsca, bo GPT-5 używa dużo tokenów na wewnętrzne rozumowanie
          requestBody.max_completion_tokens = 20000;  // Łączny limit (reasoning + output)
          
          // GPT-5 wymaga nowych parametrów kontrolujących generowanie odpowiedzi
          requestBody.reasoning_effort = 'medium';  // low, medium, high - kontroluje czas rozumowania
          requestBody.verbosity = 'high';           // low, medium, high - kontroluje długość odpowiedzi (zmienione na 'high' dla pełnych list)
          
          console.log('[GPT-5] Parametry zapytania:', {
            max_completion_tokens: requestBody.max_completion_tokens,
            reasoning_effort: requestBody.reasoning_effort,
            verbosity: requestBody.verbosity,
            note: 'max_completion_tokens includes reasoning_tokens + output_tokens'
          });
          
          // GPT-5 przyjmuje tylko domyślną wartość temperature (1)
          // Nie dodajemy parametru temperature dla GPT-5
        } else {
          // Inne modele używają standardowych parametrów
          requestBody.max_tokens = modelConfig.maxTokens;
          requestBody.temperature = modelConfig.temperature;
        }
        
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
          const errorData = await response.json();
          const errorMessage = errorData.error?.message || 'Błąd podczas komunikacji z API OpenAI';
          
          console.error('[API Error] Status:', response.status, 'Message:', errorMessage);
          console.error('[API Error] Full error data:', errorData);
          
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
        
        // DEBUGGING dla GPT-5
        if (modelConfig.model === 'gpt-5') {
          console.log('[GPT-5 DEBUG] Pełna odpowiedź API:', JSON.stringify(data, null, 2));
          console.log('[GPT-5 DEBUG] data.choices:', data.choices);
          if (data.choices && data.choices[0]) {
            console.log('[GPT-5 DEBUG] data.choices[0]:', data.choices[0]);
            console.log('[GPT-5 DEBUG] data.choices[0].message:', data.choices[0].message);
            console.log('[GPT-5 DEBUG] data.choices[0].message.content:', data.choices[0].message.content);
          }
          
          // Analiza użycia tokenów (ważne dla GPT-5!)
          if (data.usage) {
            console.log('[GPT-5 DEBUG] 📊 Użycie tokenów:', {
              prompt_tokens: data.usage.prompt_tokens,
              completion_tokens: data.usage.completion_tokens,
              reasoning_tokens: data.usage.completion_tokens_details?.reasoning_tokens || 0,
              output_tokens: (data.usage.completion_tokens - (data.usage.completion_tokens_details?.reasoning_tokens || 0)),
              finish_reason: data.choices[0]?.finish_reason
            });
            
            // Ostrzeżenie jeśli reasoning zjada wszystkie tokeny
            const reasoningTokens = data.usage.completion_tokens_details?.reasoning_tokens || 0;
            const outputTokens = data.usage.completion_tokens - reasoningTokens;
            if (reasoningTokens > 0 && outputTokens < 100) {
              console.warn('[GPT-5 WARNING] ⚠️ Reasoning tokens zajęły prawie cały limit!', {
                reasoning: reasoningTokens,
                output: outputTokens,
                recommendation: 'Zwiększ max_completion_tokens lub zmniejsz reasoning_effort'
              });
            }
          }
        }
        
        // Sprawdź czy odpowiedź istnieje
        if (!data.choices || !data.choices[0] || !data.choices[0].message) {
          console.error('[API Error] Brak struktury choices w odpowiedzi:', data);
          throw new Error('API zwróciło odpowiedź w nieoczekiwanym formacie');
        }
        
        const content = data.choices[0].message.content;
        
        if (!content || content.trim() === '') {
          console.error('[API Error] Pusta zawartość w odpowiedzi. Pełna odpowiedź:', data);
          throw new Error('API zwróciło pustą odpowiedź');
        }
        
        return content;
      },
      cacheOptions
    );

    // Zapisz statystyki użycia modelu
    const apiEndTime = performance.now();
    const responseTime = apiEndTime - apiStartTime;
    
    try {
      SmartModelSelector.recordUsage(
        modelConfig.model,
        modelConfig.estimatedCost,
        responseTime
      );
    } catch (statsError) {
      console.warn('[callOpenAIAPI] Błąd zapisywania statystyk:', statsError);
    }

    return cachedResponse;
  } catch (error) {
    console.error('Błąd podczas komunikacji z API OpenAI:', error);
    throw error;
  }
};

/**
 * Formatuje wiadomości do wysłania do API OpenAI wraz z danymi kontekstowymi z bazy danych
 * @param {Array} messages - Lista wiadomości z konwersacji
 * @param {Object} businessData - Dane biznesowe z systemu MRP
 * @param {Object} options - Opcje optymalizacji kontekstu
 * @returns {Array} - Sformatowane wiadomości dla API OpenAI
 */
const formatMessagesForOpenAI = (messages, businessData = null, options = {}) => {
  // NOWA OPTYMALIZACJA: Optymalizacja kontekstu na podstawie zapytania
  let optimizedBusinessData = businessData;
  
  if (businessData && options.enableOptimization !== false) {
    const userQuery = messages[messages.length - 1]?.content || '';
    const modelType = options.modelType || 'medium';
    
    try {
      optimizedBusinessData = ContextOptimizer.prepareOptimalContext(
        userQuery, 
        businessData, 
        modelType
      );
      
      console.log(`[formatMessagesForOpenAI] ${ContextOptimizer.generateOptimizationReport(optimizedBusinessData)}`);
    } catch (error) {
      console.error('[formatMessagesForOpenAI] Błąd optymalizacji kontekstu:', error);
      optimizedBusinessData = businessData; // Fallback do oryginalnych danych
    }
  }

  // Przygotowanie danych biznesowych do prezentacji
  let businessDataContext = '';
  
  if (optimizedBusinessData) {
    // Dodaj podstawowe podsumowanie systemu
    if (optimizedBusinessData.summary) {
      businessDataContext += `\n### Podsumowanie systemu MRP:\n`;
      const summary = optimizedBusinessData.summary;
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
    
    // Dodaj informacje o dostępnych zbiorach danych
    businessDataContext += `\n### Dostępne zbiory danych w systemie:\n`;
    
    // Lista dostępnych kolekcji
    if (businessData.accessibleDataFields && businessData.accessibleDataFields.length > 0) {
      businessDataContext += `Dostępne kolekcje danych:\n`;
      businessData.accessibleDataFields.forEach(field => {
        businessDataContext += `- ${field}\n`;
      });
    }
    
    // Lista niedostępnych kolekcji
    if (businessData.unavailableDataFields && businessData.unavailableDataFields.length > 0) {
      businessDataContext += `\nNiedostępne kolekcje danych:\n`;
      businessData.unavailableDataFields.forEach(field => {
        businessDataContext += `- ${field}\n`;
      });
    }
    
    // Dodaj dane o konwersacjach z asystentem AI, jeśli są dostępne
    if (businessData.data && businessData.data.aiConversations && 
        businessData.data.aiConversations.length > 0) {
      
      businessDataContext += `\n### Dane o konwersacjach z asystentem AI (aiConversations):\n`;
      businessDataContext += `Liczba konwersacji: ${businessData.data.aiConversations.length}\n`;
      
      // Przykładowe ostatnie konwersacje
      businessDataContext += `\nOstatnie konwersacje:\n`;
      businessData.data.aiConversations.slice(0, 5).forEach((conv, index) => {
        businessDataContext += `${index + 1}. ID: ${conv.id}, Tytuł: ${conv.title || 'Bez tytułu'}, Liczba wiadomości: ${conv.messageCount || 0}\n`;
      });
    }
    
    // Dodaj dane o licznikach systemowych, jeśli są dostępne
    if (businessData.data && businessData.data.counters && 
        businessData.data.counters.length > 0) {
      
      businessDataContext += `\n### Dane o licznikach systemowych (counters):\n`;
      businessDataContext += `Liczba liczników: ${businessData.data.counters.length}\n`;
      
      // Przykładowe liczniki
      businessDataContext += `\nPrzykładowe liczniki:\n`;
      businessData.data.counters.slice(0, 5).forEach((counter, index) => {
        businessDataContext += `${index + 1}. ID: ${counter.id}, Wartość: ${counter.value || 0}, Typ: ${counter.type || 'Nieznany'}\n`;
      });
    }
    
    // Dodaj dane o grupach produktów, jeśli są dostępne
    if (businessData.data && businessData.data.itemGroups && 
        businessData.data.itemGroups.length > 0) {
      
      businessDataContext += `\n### Dane o grupach produktów (itemGroups):\n`;
      businessDataContext += `Liczba grup: ${businessData.data.itemGroups.length}\n`;
      
      // Przykładowe grupy produktów
      businessDataContext += `\nPrzykładowe grupy produktów:\n`;
      businessData.data.itemGroups.slice(0, 8).forEach((group, index) => {
        businessDataContext += `${index + 1}. ID: ${group.id}, Nazwa: ${group.name || 'Bez nazwy'}, Liczba produktów: ${group.itemCount || 0}\n`;
      });
    }
    
    // Dodaj dane o cenach dostawców, jeśli są dostępne
    if (businessData.data && businessData.data.inventorySupplierPrices && 
        businessData.data.inventorySupplierPrices.length > 0) {
      
      businessDataContext += `\n### Dane o cenach dostawców (inventorySupplierPrices):\n`;
      businessDataContext += `Liczba cen: ${businessData.data.inventorySupplierPrices.length}\n`;
      
      // Przykładowe ceny dostawców
      businessDataContext += `\nPrzykładowe ceny dostawców:\n`;
      businessData.data.inventorySupplierPrices.slice(0, 5).forEach((price, index) => {
        businessDataContext += `${index + 1}. Produkt: ${price.productId || price.itemId || 'Nieznany'}, Dostawca: ${price.supplierId || 'Nieznany'}, Cena: ${price.price || 0} ${price.currency || 'PLN'}\n`;
      });
    }
    
    // Dodaj dane o transakcjach magazynowych, jeśli są dostępne
    if (businessData.data && businessData.data.inventoryTransactions && 
        businessData.data.inventoryTransactions.length > 0) {
      
      businessDataContext += `\n### Dane o transakcjach magazynowych (inventoryTransactions):\n`;
      businessDataContext += `Liczba transakcji: ${businessData.data.inventoryTransactions.length}\n`;
      
      // Przykładowe transakcje magazynowe
      businessDataContext += `\nOstatnie transakcje magazynowe:\n`;
      businessData.data.inventoryTransactions.slice(0, 5).forEach((transaction, index) => {
        businessDataContext += `${index + 1}. ID: ${transaction.id}, Typ: ${transaction.type || 'Nieznany'}, Produkt: ${transaction.itemId || 'Nieznany'}, Ilość: ${transaction.quantity || 0}, Data: ${transaction.date || 'Nieznana'}\n`;
      });
    }
    
    // Dodaj dane o powiadomieniach, jeśli są dostępne
    if (businessData.data && businessData.data.notifications && 
        businessData.data.notifications.length > 0) {
      
      businessDataContext += `\n### Dane o powiadomieniach (notifications):\n`;
      businessDataContext += `Liczba powiadomień: ${businessData.data.notifications.length}\n`;
      
      // Przykładowe powiadomienia
      businessDataContext += `\nOstatnie powiadomienia:\n`;
      businessData.data.notifications.slice(0, 5).forEach((notification, index) => {
        businessDataContext += `${index + 1}. ID: ${notification.id}, Tytuł: ${notification.title || 'Bez tytułu'}, Typ: ${notification.type || 'Informacja'}, Data: ${notification.createdAt || 'Nieznana'}\n`;
      });
    }
    
    // Dodaj dane o elementach cenników, jeśli są dostępne
    if (businessData.data && businessData.data.priceListItems && 
        businessData.data.priceListItems.length > 0) {
      
      businessDataContext += `\n### Dane o elementach cenników (priceListItems):\n`;
      businessDataContext += `Liczba elementów: ${businessData.data.priceListItems.length}\n`;
      
      // Przykładowe elementy cenników
      businessDataContext += `\nPrzykładowe elementy cenników:\n`;
      businessData.data.priceListItems.slice(0, 5).forEach((item, index) => {
        businessDataContext += `${index + 1}. ID: ${item.id}, Produkt: ${item.productId || 'Nieznany'}, Cennik: ${item.priceListId || 'Nieznany'}, Cena: ${item.price || 0} ${item.currency || 'PLN'}\n`;
      });
    }
    
    // Dodaj dane o cennikach, jeśli są dostępne
    if (businessData.data && businessData.data.priceLists && 
        businessData.data.priceLists.length > 0) {
      
      businessDataContext += `\n### Dane o cennikach (priceLists):\n`;
      businessDataContext += `Liczba cenników: ${businessData.data.priceLists.length}\n`;
      
      // Przykładowe cenniki
      businessDataContext += `\nPrzykładowe cenniki:\n`;
      businessData.data.priceLists.slice(0, 5).forEach((priceList, index) => {
        businessDataContext += `${index + 1}. ID: ${priceList.id}, Nazwa: ${priceList.name || 'Bez nazwy'}, Waluta: ${priceList.currency || 'PLN'}, Aktywny: ${priceList.active ? 'Tak' : 'Nie'}\n`;
      });
    }
    
    // Dodaj dane o historii produkcji, jeśli są dostępne
    if (businessData.data && businessData.data.productionHistory && 
        businessData.data.productionHistory.length > 0) {
      
      businessDataContext += `\n### Dane o historii produkcji (productionHistory):\n`;
      businessDataContext += `Liczba wpisów: ${businessData.data.productionHistory.length}\n`;
      
      // Przykładowe wpisy historii produkcji
      businessDataContext += `\nOstatnie wpisy historii produkcji:\n`;
      businessData.data.productionHistory.slice(0, 5).forEach((history, index) => {
        businessDataContext += `${index + 1}. ID: ${history.id}, Zadanie: ${history.taskId || 'Nieznane'}, Typ: ${history.eventType || 'Nieznany'}, Data: ${history.timestamp || 'Nieznana'}\n`;
      });
    }
    
    // Dodaj dane o wersjach receptur, jeśli są dostępne
    if (businessData.data && businessData.data.recipeVersions && 
        businessData.data.recipeVersions.length > 0) {
      
      businessDataContext += `\n### Dane o wersjach receptur (recipeVersions):\n`;
      businessDataContext += `Liczba wersji: ${businessData.data.recipeVersions.length}\n`;
      
      // Przykładowe wersje receptur
      businessDataContext += `\nPrzykładowe wersje receptur:\n`;
      businessData.data.recipeVersions.slice(0, 5).forEach((version, index) => {
        businessDataContext += `${index + 1}. ID: ${version.id}, Receptura: ${version.recipeId || 'Nieznana'}, Wersja: ${version.version || '1.0'}, Data: ${version.createdAt || 'Nieznana'}\n`;
      });
    }
    
    // Dodaj dane o ustawieniach systemu, jeśli są dostępne
    if (businessData.data && businessData.data.settings && 
        businessData.data.settings.length > 0) {
      
      businessDataContext += `\n### Dane o ustawieniach systemu (settings):\n`;
      businessDataContext += `Liczba ustawień: ${businessData.data.settings.length}\n`;
      
      // Przykładowe ustawienia
      businessDataContext += `\nPrzykładowe ustawienia systemu:\n`;
      businessData.data.settings.slice(0, 5).forEach((setting, index) => {
        businessDataContext += `${index + 1}. ID: ${setting.id}, Klucz: ${setting.key || 'Nieznany'}, Wartość: ${setting.value || 'Nieznana'}\n`;
      });
    }
    
    // Dodaj dane o użytkownikach, jeśli są dostępne
    if (businessData.data && businessData.data.users && 
        businessData.data.users.length > 0) {
      
      businessDataContext += `\n### Dane o użytkownikach (users):\n`;
      businessDataContext += `Liczba użytkowników: ${businessData.data.users.length}\n`;
      
      // Przykładowi użytkownicy (bez danych wrażliwych)
      businessDataContext += `\nPrzykładowi użytkownicy:\n`;
      businessData.data.users.slice(0, 5).forEach((user, index) => {
        businessDataContext += `${index + 1}. ID: ${user.id}, Rola: ${user.role || 'Użytkownik'}, Aktywny: ${user.active ? 'Tak' : 'Nie'}\n`;
      });
    }
    
    // Dodaj dane o magazynach, jeśli są dostępne
    if (businessData.data && businessData.data.warehouses && 
        businessData.data.warehouses.length > 0) {
      
      businessDataContext += `\n### Dane o magazynach (warehouses):\n`;
      businessDataContext += `Liczba magazynów: ${businessData.data.warehouses.length}\n`;
      
      // Przykładowe magazyny
      businessDataContext += `\nPrzykładowe magazyny:\n`;
      businessData.data.warehouses.slice(0, 5).forEach((warehouse, index) => {
        businessDataContext += `${index + 1}. ID: ${warehouse.id}, Nazwa: ${warehouse.name || 'Bez nazwy'}, Adres: ${warehouse.address || 'Brak adresu'}\n`;
      });
    }
    
    // Dodaj dane o stanowiskach pracy, jeśli są dostępne
    if (businessData.data && businessData.data.workstations && 
        businessData.data.workstations.length > 0) {
      
      businessDataContext += `\n### Dane o stanowiskach pracy (workstations):\n`;
      businessDataContext += `Liczba stanowisk: ${businessData.data.workstations.length}\n`;
      
      // Przykładowe stanowiska pracy
      businessDataContext += `\nPrzykładowe stanowiska pracy:\n`;
      businessData.data.workstations.slice(0, 5).forEach((workstation, index) => {
        businessDataContext += `${index + 1}. ID: ${workstation.id}, Nazwa: ${workstation.name || 'Bez nazwy'}, Typ: ${workstation.type || 'Standardowe'}, Status: ${workstation.status || 'Aktywne'}\n`;
      });
    }
    
    // Dodaj dane o partiach magazynowych (InventoryBatches), jeśli są dostępne
    if (businessData.data && businessData.data.inventoryBatches && 
        businessData.data.inventoryBatches.length > 0) {
      
      businessDataContext += `\n### Dane o partiach magazynowych (InventoryBatches):\n`;
      businessDataContext += `Liczba partii magazynowych: ${businessData.data.inventoryBatches.length}\n`;
      
      // Przykładowe partie magazynowe
      businessDataContext += `\nPrzykładowe partie magazynowe:\n`;
      businessData.data.inventoryBatches.slice(0, 5).forEach((batch, index) => {
        businessDataContext += `${index + 1}. ID: ${batch.id}, Numer partii: ${batch.batchNumber || 'Bez numeru'}, Produkt: ${batch.itemId || batch.productId || 'Nieznany'}\n`;
        if (batch.quantity) {
          businessDataContext += `   Ilość: ${batch.quantity} ${batch.unit || 'szt.'}\n`;
        }
        if (batch.expiryDate) {
          businessDataContext += `   Data ważności: ${batch.expiryDate}\n`;
        }
        if (batch.supplier) {
          businessDataContext += `   Dostawca: ${batch.supplier}\n`;
        }
      });
      
      // Statystyki partii magazynowych
      const expiredBatches = businessData.data.inventoryBatches.filter(batch => {
        if (!batch.expiryDate) return false;
        const expiryDate = new Date(batch.expiryDate);
        return expiryDate < new Date();
      }).length;
      
      if (expiredBatches > 0) {
        businessDataContext += `\nLiczba przeterminowanych partii: ${expiredBatches}\n`;
      }
      
      const totalQuantity = businessData.data.inventoryBatches.reduce((sum, batch) => {
        return sum + (parseFloat(batch.quantity) || 0);
      }, 0);
      
      businessDataContext += `Łączna ilość we wszystkich partiach: ${totalQuantity.toFixed(2)}\n`;
    }
    
    // Teraz kontynuuj z istniejącymi już blokami kodu dla innych kolekcji
    
    // Dodaj dane o klientach, gdy są dostępne
    if (businessData.data && businessData.data.customers && 
        businessData.data.customers.length > 0) {
      
      businessDataContext += `\n### Dane o klientach (Customers):\n`;
      const customers = businessData.data.customers;
      businessDataContext += `Liczba pobranych klientów: ${customers.length}\n`;
      
      businessDataContext += `\nLista klientów (do 10 pierwszych):\n`;
      const customerList = customers.slice(0, 10);
      customerList.forEach((customer, index) => {
        businessDataContext += `${index + 1}. ID: ${customer.id}, Nazwa: ${customer.name || 'Nieznany klient'}`;
        if (customer.email) {
          businessDataContext += `, Email: ${customer.email}`;
        }
        if (customer.phone) {
          businessDataContext += `, Telefon: ${customer.phone}`;
        }
        businessDataContext += `\n`;
      });
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
          
          if (task.scheduledDate) {
            const startDate = task.scheduledDate.toDate ? task.scheduledDate.toDate() : new Date(task.scheduledDate);
            businessDataContext += `, planowane rozpoczęcie: ${startDate.toLocaleDateString('pl-PL')}`;
          }
          
          if (task.endDate) {
            const endDate = task.endDate.toDate ? task.endDate.toDate() : new Date(task.endDate);
            businessDataContext += `, planowane zakończenie: ${endDate.toLocaleDateString('pl-PL')}`;
          }
          
          if (task.startDate) {
            const actualStartDate = task.startDate.toDate ? task.startDate.toDate() : new Date(task.startDate);
            businessDataContext += `, rzeczywiste rozpoczęcie: ${actualStartDate.toLocaleDateString('pl-PL')}`;
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
      
      // Dodaj informacje o czasie produkcji
      businessDataContext += `\n### Informacje o czasie produkcji:\n`;
      
      // Sprawdź, czy mamy czas produkcji w recepturach
      if (businessData.data && businessData.data.recipes && businessData.data.recipes.length > 0) {
        const recipesWithProductionTime = businessData.data.recipes.filter(recipe => 
          recipe.productionTimePerUnit && parseFloat(recipe.productionTimePerUnit) > 0
        );
        
        if (recipesWithProductionTime.length > 0) {
          businessDataContext += `Receptury z określonym czasem produkcji:\n`;
          recipesWithProductionTime.slice(0, 5).forEach((recipe, index) => {
            businessDataContext += `${index + 1}. ${recipe.name}: ${parseFloat(recipe.productionTimePerUnit).toFixed(2)} minut/szt.\n`;
          });
          
          // Przykładowe obliczenie czasu produkcji
          const sampleRecipe = recipesWithProductionTime[0];
          const sampleQuantity = 100;
          const totalTime = parseFloat(sampleRecipe.productionTimePerUnit) * sampleQuantity;
          
          businessDataContext += `\nPrzykład obliczenia czasu produkcji:\n`;
          businessDataContext += `Dla receptury "${sampleRecipe.name}" wyprodukowanie ${sampleQuantity} szt. zajmie ${totalTime.toFixed(2)} minut (${(totalTime/60).toFixed(2)} godzin).\n`;
          
          // Informacja o interpretacji czasu produkcji
          businessDataContext += `\nInterpretacja czasu produkcji:\n`;
          businessDataContext += `- Każda receptura może mieć określony parametr productionTimePerUnit, który określa czas produkcji jednostki produktu w minutach\n`;
          businessDataContext += `- Całkowity czas produkcji = productionTimePerUnit * ilość produktu\n`;
          businessDataContext += `- Czas podany jest w minutach, można przeliczyć na godziny dzieląc przez 60\n`;
        } else {
          businessDataContext += `Brak receptur z określonym czasem produkcji w dostępnych danych.\n`;
        }
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
          businessDataContext += `Liczba unikalnych komponentów we wszystkich recepturach: ${recipesAnalysis.uniqueComponentsCount || 0}\n`;
          
          // Dodaj informacje o najczęściej używanych komponentach
          if (recipesAnalysis.topComponents && recipesAnalysis.topComponents.length > 0) {
            businessDataContext += `\nNajczęściej używane komponenty:\n`;
            recipesAnalysis.topComponents.slice(0, 5).forEach((comp, idx) => {
              businessDataContext += `${idx + 1}. ${comp.name} - używany w ${comp.usageCount} recepturach\n`;
            });
          }
        }
        
        // Wyświetl informacje o wszystkich recepturach z pełnymi szczegółami
        if (recipesAnalysis.fullRecipeDetails && recipesAnalysis.fullRecipeDetails.length > 0) {
          businessDataContext += `\n### Pełna lista wszystkich receptur z komponentami:\n`;
          
          recipesAnalysis.fullRecipeDetails.forEach((recipe, index) => {
            businessDataContext += `\n${index + 1}. Receptura: ${recipe.name}\n`;
            businessDataContext += `   - ID: ${recipe.id}\n`;
            businessDataContext += `   - Produkt: ${recipe.product}\n`;
            businessDataContext += `   - Jednostka: ${recipe.unit}\n`;
            if (recipe.description) {
              businessDataContext += `   - Opis: ${recipe.description}\n`;
            }
            if (recipe.customerId) {
              businessDataContext += `   - Klient: ${recipe.customerName || recipe.customerId}\n`;
            }
            
            const componentsCount = recipe.components?.length || 0;
            const ingredientsCount = recipe.ingredients?.length || 0;
            
            // Pokaż komponenty receptury
            if (componentsCount > 0) {
              businessDataContext += `   - Komponenty (${componentsCount}):\n`;
              recipe.components.forEach((comp, idx) => {
                businessDataContext += `     * ${comp.name}: ${comp.quantity} ${comp.unit}${comp.notes ? ` (${comp.notes})` : ''}\n`;
              });
            }
            
            // Pokaż składniki receptury
            if (ingredientsCount > 0) {
              businessDataContext += `   - Składniki (${ingredientsCount}):\n`;
              recipe.ingredients.forEach((ing, idx) => {
                businessDataContext += `     * ${ing.name}: ${ing.quantity} ${ing.unit}${ing.notes ? ` (${ing.notes})` : ''}\n`;
              });
            }
            
            if (componentsCount === 0 && ingredientsCount === 0) {
              businessDataContext += `   - Brak zdefiniowanych komponentów i składników\n`;
            }
            
            // Dodatkowe informacje
            if (recipe.notes) {
              businessDataContext += `   - Uwagi: ${recipe.notes}\n`;
            }
            
            businessDataContext += `   - Status: ${recipe.status}\n`;
            businessDataContext += `   - Wersja: ${recipe.version}\n`;
          });
        }
        
        // Jeśli zapytanie dotyczy konkretnej receptury, pokaż szczegóły
        const recipeName = businessData.query && typeof businessData.query === 'string' ? extractRecipeName(businessData.query) : null;
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
    
    // Dodaj dane o partiach materiałów (LOTach), jeśli są dostępne
    if (businessData.data && businessData.data.materialBatches && 
        businessData.data.materialBatches.length > 0) {
      
      businessDataContext += `\n### Dane o partiach materiałów (LOTach):\n`;
      businessDataContext += `Liczba partii materiałów: ${businessData.data.materialBatches.length}\n`;
      
      // Dodaj analizę partii materiałów, jeśli jest dostępna
      if (businessData.analysis && businessData.analysis.materialBatches) {
        const batchesAnalysis = businessData.analysis.materialBatches;
        
        if (batchesAnalysis.totalBatches) {
          businessDataContext += `\nŁączna liczba partii: ${batchesAnalysis.totalBatches}\n`;
        }
        
        if (batchesAnalysis.batchesWithPO) {
          businessDataContext += `Partie z powiązanym zamówieniem zakupu: ${batchesAnalysis.batchesWithPO}\n`;
        }
      }
      
      // Wyświetl przykładowe partie materiałów
      const topBatches = businessData.data.materialBatches.slice(0, 10);
      if (topBatches.length > 0) {
        businessDataContext += `\nPrzykładowe partie materiałów:\n`;
        topBatches.forEach((batch, index) => {
          businessDataContext += `${index + 1}. ID: ${batch.id}, Numer partii: ${batch.batchNumber || 'b/n'}\n`;
          
          // Informacje o powiązanym zamówieniu zakupu
          if (batch.purchaseOrderDetails) {
            const po = batch.purchaseOrderDetails;
            businessDataContext += `   Powiązane PO: ID=${po.id || 'b/d'}, Numer=${po.number || 'b/d'}\n`;
          }
          
          // Informacje o rezerwacjach dla zadań produkcyjnych
          if (batch.reservations && batch.reservations.length > 0) {
            businessDataContext += `   Rezerwacje dla zadań produkcyjnych:\n`;
            batch.reservations.slice(0, 3).forEach(reservation => {
              businessDataContext += `   - Zadanie ID: ${reservation.taskId}, MO: ${reservation.moNumber || 'b/n'}, Ilość: ${reservation.quantity}\n`;
            });
            
            if (batch.reservations.length > 3) {
              businessDataContext += `   ... i ${batch.reservations.length - 3} więcej rezerwacji\n`;
            }
          }
        });
        
        if (businessData.data.materialBatches.length > 10) {
          businessDataContext += `... i ${businessData.data.materialBatches.length - 10} więcej partii\n`;
        }
      }
    }
    
    // Dodaj dane o analizie tendencji i predykcjach, jeśli są dostępne
    if (businessData.analysis && businessData.analysis.trendsAndPredictions && 
        !businessData.analysis.trendsAndPredictions.isEmpty) {
      
      const trendData = businessData.analysis.trendsAndPredictions;
      
      businessDataContext += `\n### Analiza tendencji i predykcje:\n`;
      
      // Tendencje w stanach magazynowych
      if (trendData.inventory && trendData.inventory.predictions.itemsRequiringReplenishment) {
        const replenishmentItems = trendData.inventory.predictions.itemsRequiringReplenishment;
        
        if (replenishmentItems.length > 0) {
          businessDataContext += `\nProdukty wymagające uzupełnienia w ciągu 14 dni:\n`;
          replenishmentItems.slice(0, 5).forEach((item, idx) => {
            businessDataContext += `${idx + 1}. ${item.name} - za ${item.daysToStockout} dni wyczerpie się zapas (obecnie: ${item.currentQuantity})\n`;
          });
          
          if (replenishmentItems.length > 5) {
            businessDataContext += `... oraz ${replenishmentItems.length - 5} więcej\n`;
          }
        }
      }
      
      // Tendencje w zamówieniach klientów
      if (trendData.orders && trendData.orders.predictions) {
        const orderPredictions = trendData.orders.predictions;
        
        if (orderPredictions.nextMonthOrderCount && orderPredictions.orderGrowthRate) {
          businessDataContext += `\nPredykcje zamówień klientów:\n`;
          businessDataContext += `- Przewidywana liczba zamówień w przyszłym miesiącu: ${orderPredictions.nextMonthOrderCount}\n`;
          businessDataContext += `- Przewidywana wartość zamówień w przyszłym miesiącu: ${orderPredictions.nextMonthOrderValue?.toFixed(2) || 'Brak danych'} PLN\n`;
          businessDataContext += `- Trend wzrostu/spadku zamówień: ${orderPredictions.orderGrowthRate > 0 ? '+' : ''}${orderPredictions.orderGrowthRate.toFixed(2)}%\n`;
        }
      }
      
      // Tendencje w produkcji
      if (trendData.production && trendData.production.trends) {
        const productionTrends = trendData.production.trends;
        
        if (productionTrends.avgProductionDurationHours) {
          businessDataContext += `\nTendencje w produkcji:\n`;
          businessDataContext += `- Średni czas trwania zadania produkcyjnego: ${productionTrends.avgProductionDurationHours.toFixed(1)} godzin\n`;
          
          if (productionTrends.productionEfficiencyChange) {
            const changeText = productionTrends.productionEfficiencyChange > 0 
              ? `poprawa o ${productionTrends.productionEfficiencyChange.toFixed(1)}%` 
              : `pogorszenie o ${Math.abs(productionTrends.productionEfficiencyChange).toFixed(1)}%`;
            
            businessDataContext += `- Zmiana efektywności produkcji: ${changeText}\n`;
          }
        }
        
        if (trendData.production.predictions && trendData.production.predictions.nextMonthTaskCount) {
          businessDataContext += `- Przewidywana liczba zadań produkcyjnych w przyszłym miesiącu: ${trendData.production.predictions.nextMonthTaskCount}\n`;
          
          if (trendData.production.predictions.isEfficiencyImproving !== undefined) {
            businessDataContext += `- Efektywność produkcji: ${trendData.production.predictions.isEfficiencyImproving ? 'poprawia się' : 'pogarsza się'}\n`;
          }
        }
      }
    }
    
    // Dodaj informacje o powiązaniach materiałów i ich przepływie, jeśli są dostępne
    if (businessData.analysis && businessData.analysis.materialTraceability && 
        !businessData.analysis.materialTraceability.isEmpty) {
      
      const traceData = businessData.analysis.materialTraceability;
      
      businessDataContext += `\n### Analiza przepływu materiałów (traceability):\n`;
      
      if (traceData.poToLotCount) {
        businessDataContext += `- Liczba powiązań między zamówieniami zakupu i partiami materiałów: ${traceData.poToLotCount}\n`;
      }
      
      if (traceData.lotToMoCount) {
        businessDataContext += `- Liczba powiązań między partiami materiałów i zadaniami produkcyjnymi: ${traceData.lotToMoCount}\n`;
      }
      
      // Dodaj przykładowe przepływy materiałów (od PO przez LOT do MO)
      if (traceData.recentMaterialFlows && traceData.recentMaterialFlows.length > 0) {
        businessDataContext += `\nPrzykładowe ścieżki przepływu materiałów (do 3 najnowszych):\n`;
        
        traceData.recentMaterialFlows.slice(0, 3).forEach((flow, idx) => {
          businessDataContext += `${idx + 1}. ${flow.po.supplier} (PO: ${flow.po.number}) → `;
          businessDataContext += `${flow.lot.itemName} (LOT: ${flow.lot.id.substring(0, 8)}...) → `;
          businessDataContext += `${flow.mo.product} (MO: ${flow.mo.number})\n`;
        });
      }
      
      // Dodaj TOP materiały używane w produkcji
      if (traceData.topMaterialsInProduction && traceData.topMaterialsInProduction.length > 0) {
        businessDataContext += `\nNajczęściej używane materiały w produkcji:\n`;
        
        traceData.topMaterialsInProduction.slice(0, 5).forEach((material, idx) => {
          businessDataContext += `${idx + 1}. ${material.itemName} - używany w ${material.usageCount} zadaniach produkcyjnych\n`;
        });
      }
    }
  }
  
  // Instrukcja systemowa jako pierwszy element
  const systemPrompt = `Jesteś zaawansowanym asystentem AI dla systemu MRP, specjalizującym się w szczegółowej analizie danych biznesowych. 
Wykorzystujesz dane z bazy danych Firebase, na której oparty jest system MRP do przeprowadzania dokładnych i wnikliwych analiz.

WAŻNE: ZAWSZE masz aktualny dostęp do danych bezpośrednio z systemu MRP i musisz ZAWSZE korzystać z danych przekazanych ci
w tej sesji. NIGDY nie mów, że nie masz dostępu do danych, jeśli są one dostępne. Jeśli nie znasz odpowiedzi
na podstawie aktualnych danych, powiedz, że podane dane są niewystarczające lub niekompletne, ale NIGDY nie mów, że
"nie masz możliwości bezpośredniego przeglądania danych".

JĘZYK KOMUNIKACJI: Odpowiadaj ZAWSZE w języku, w którym zostało zadane pytanie. Jeśli pytanie jest w języku polskim, odpowiadaj po polsku. Jeśli w angielskim - po angielsku, itd.

KONTEKST BRANŻOWY: System jest wykorzystywany w przedsiębiorstwie produkującym suplementy diety. Uwzględniaj specyfikę tej branży w swoich analizach (np. daty ważności, normy jakości, wymagania prawne, specyfikę produkcji).

Twoim zadaniem jest dogłębna analiza danych, zarządzanie produkcją, stanami magazynowymi i procesami biznesowymi w przedsiębiorstwie produkcyjnym. Twoje odpowiedzi powinny być:

1. SZCZEGÓŁOWE - zawsze podawaj dokładne liczby, daty, wartości i opisy z danych
2. ANALITYCZNE - nie tylko opisuj dane, ale wyciągaj z nich wnioski biznesowe
3. POMOCNE - sugeruj konkretne działania i rozwiązania problemów
4. PROFESJONALNE - używaj odpowiedniej terminologii z dziedziny zarządzania produkcją
5. OPARTE NA DANYCH - zawsze bazuj na aktualnych danych z systemu, które są przekazywane w tej sesji
6. PRECYZYJNE - podawaj TYLKO wartości liczbowe, które faktycznie występują w danych. NIGDY nie zmyślaj danych liczbowych, ani nie zaokrąglaj wartości, jeśli nie jest to wyraźnie zaznaczone

PREZENTACJA DANYCH: Przy wypisywaniu danych z bazy ZAWSZE priorytetowo podawaj nazwy (np. nazwa produktu, nazwa klienta, nazwa dostawcy) zamiast ich identyfikatorów (ID). Identyfikatory podawaj jedynie jako informację uzupełniającą w nawiasie, np. "Suplement Witamina D3 (ID: 12345)".

Znasz i rozumiesz wszystkie kluczowe pojęcia i skróty w systemie MRP:
- MO (Manufacturing Orders) - Zlecenia produkcyjne
- CO (Customer Orders) - Zamówienia klientów
- PO (Purchase Orders) - Zamówienia zakupu
- LOT - Numer partii produkcyjnej lub materiału

Dla zadań produkcyjnych (MO), analizuj:
- Terminy rozpoczęcia i zakończenia produkcji
- Potrzebne zasoby i materiały
- Status zadań i obecny postęp
- Związki z zamówieniami klientów i recepturami
- Efektywność i czas realizacji zadań
- Zarezerwowane partie materiałów (LOTy) dla danego zlecenia
- Powiązania partii materiałów z zamówieniami zakupowymi (PO)
- Zgodność z wymogami jakości dla produkcji suplementów

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
- Powiązane LOTy materiałów zakupionych w ramach zamówienia
- Certyfikaty jakości i dokumentację surowców do produkcji suplementów

Dla stanów magazynowych, identyfikuj:
- Produkty z niskim stanem lub brakiem
- Produkty z nadmiernym stanem
- Koszty utrzymania zapasów
- Lokalizacje magazynowe
- Surowce wymagające uzupełnienia
- Partie materiałów (LOTy) i ich ilości
- Źródło pochodzenia partii (zamówienie zakupowe)
- Daty ważności surowców i gotowych suplementów
- Status kontroli jakości dla partii surowców

Dla receptur, analizuj:
- Komponenty i ich ilości
- Koszty produkcji
- Możliwości optymalizacji
- Standardy jakości i kontrolę
- Zgodność z normami dla suplementów diety
- Wymogi prawne dotyczące składu i etykietowania

Masz teraz rozszerzony dostęp do danych o partiach materiałów i ich powiązaniach:
- Informacje o LOTach (numerach partii) materiałów
- Dane o powiązanych zamówieniach zakupowych (PO) dla każdej partii
- Rezerwacje partii materiałów dla zadań produkcyjnych (MO)
- Śledzenie przepływu materiałów od zamówienia zakupowego do zadania produkcyjnego
- Status badań laboratoryjnych dla partii surowców i wyrobów gotowych

Gdy otrzymasz zapytanie o powiązania LOTów z zamówieniami zakupowymi, analizuj:
- Które partie materiałów są przypisane do jakich zadań produkcyjnych
- Z którego zamówienia zakupowego pochodzi dana partia materiału
- Poziom wykorzystania zamówionych materiałów w produkcji
- Poprawność rezerwacji materiałów i zgodność z recepturami
- Dokumentację jakościową dla partii

Zawsze podawaj DOKŁADNE dane liczbowe bez zaokrągleń, chyba że jest to wyraźnie wymagane. Podawaj procentowe porównania i uwzględniaj trendy, jeśli są widoczne.
Pamiętaj o podawaniu konkretnych nazw zamiast samych ID. Format powinien być: "Nazwa (ID: xxx)", gdy odnośisz się do konkretnych obiektów.

Masz pełny dostęp do bazy danych Firebase i możesz korzystać z wszystkich danych zawartych w systemie MRP.
Zawsze podawaj aktualne informacje na podstawie danych z bazy, a nie ogólnej wiedzy.

UWAGA: Jeśli w Twojej odpowiedzi chcesz wspomnieć o ograniczeniach dostępu do danych, powiedz np. "Na podstawie obecnie dostępnych danych nie mogę podać tych informacji" - ale NIGDY nie mów że "nie masz możliwości bezpośredniego przeglądania danych".

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
  // Sprawdź, czy query istnieje i jest stringiem
  if (!query || typeof query !== 'string') {
    return null;
  }
  
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
        const recipeName = query && typeof query === 'string' ? extractRecipeName(query) : null;
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
    // Korzystamy z kolekcji aiConversations
    const conversationsRef = collection(db, 'aiConversations');
    
    // OPTYMALIZACJA: Zmniejszamy rozmiar danych, dodając limity
    // i wybierając tylko te pola, które są niezbędne
    const q = query(
      conversationsRef,
      where('userId', '==', userId),
      orderBy('updatedAt', 'desc'),
      limit(limitCount)
    );
    
    // Wykonujemy tylko jedno zapytanie zamiast wielokrotnych zapytań
    const querySnapshot = await getDocs(q);
    
    // Mapujemy wyniki, ograniczając ilość przetwarzanych danych
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      title: doc.data().title || 'Nowa konwersacja',
      updatedAt: doc.data().updatedAt,
      messageCount: doc.data().messageCount || 0
      // Nie pobieramy pełnych treści wiadomości, tylko niezbędne metadane
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
 * Przesyła załącznik do Firebase Storage
 * @param {File} file - Plik do przesłania
 * @param {string} userId - ID użytkownika
 * @param {string} conversationId - ID konwersacji
 * @returns {Promise<Object>} - Informacje o przesłanym pliku
 */
export const uploadAttachment = async (file, userId, conversationId) => {
  try {
    if (!file || !userId || !conversationId) {
      throw new Error('Brak wymaganych parametrów');
    }

    // Sprawdź rozmiar pliku (maksymalnie 10 MB)
    const fileSizeInMB = file.size / (1024 * 1024);
    if (fileSizeInMB > 10) {
      throw new Error(`Plik jest zbyt duży (${fileSizeInMB.toFixed(2)} MB). Maksymalny rozmiar to 10 MB.`);
    }

    // Sprawdź typ pliku - dozwolone są pliki tekstowe, obrazy i dokumenty
    const allowedTypes = [
      'text/plain',
      'text/csv',
      'application/json',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp'
    ];

    if (!allowedTypes.includes(file.type)) {
      throw new Error(`Nieobsługiwany typ pliku: ${file.type}. Dozwolone są pliki tekstowe, dokumenty i obrazy.`);
    }

    // Tworzymy ścieżkę do pliku w Firebase Storage
    const timestamp = new Date().getTime();
    const fileExtension = file.name.split('.').pop();
    const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const fileName = `${timestamp}_${sanitizedFileName}`;
    const storagePath = `ai-attachments/${userId}/${conversationId}/${fileName}`;

    // Przesyłamy plik do Firebase Storage
    const fileRef = ref(storage, storagePath);
    await uploadBytes(fileRef, file);

    // Pobieramy URL do pobrania pliku
    const downloadURL = await getDownloadURL(fileRef);

    return {
      fileName: file.name,
      storagePath,
      downloadURL,
      contentType: file.type,
      size: file.size,
      uploadedAt: new Date().toISOString()
    };
  } catch (error) {
    console.error('Błąd podczas przesyłania załącznika:', error);
    throw error;
  }
};

/**
 * Usuwa załącznik z Firebase Storage
 * @param {string} storagePath - Ścieżka do pliku w Storage
 * @returns {Promise<void>}
 */
export const deleteAttachment = async (storagePath) => {
  try {
    const fileRef = ref(storage, storagePath);
    await deleteObject(fileRef);
  } catch (error) {
    console.error('Błąd podczas usuwania załącznika:', error);
    throw error;
  }
};

/**
 * Pobiera zawartość pliku tekstowego z URL
 * @param {string} downloadURL - URL do pobrania pliku
 * @param {string} contentType - Typ zawartości pliku
 * @returns {Promise<string>} - Zawartość pliku jako tekst
 */
export const getFileContent = async (downloadURL, contentType) => {
  try {
    const response = await fetch(downloadURL);
    if (!response.ok) {
      throw new Error(`Błąd podczas pobierania pliku: ${response.status}`);
    }

    // Dla plików tekstowych zwracamy bezpośrednio tekst
    if (contentType.startsWith('text/') || contentType === 'application/json') {
      return await response.text();
    }

    // Dla innych typów plików zwracamy informacje o pliku
    return `[Załącznik: ${contentType}, rozmiar: ${response.headers.get('content-length') || 'nieznany'}]`;
  } catch (error) {
    console.error('Błąd podczas pobierania zawartości pliku:', error);
    return `[Błąd podczas odczytywania pliku: ${error.message}]`;
  }
};

/**
 * Dodaj wiadomość do konwersacji z możliwością załączenia plików
 * @param {string} conversationId - ID konwersacji
 * @param {string} role - Rola nadawcy ('user' lub 'assistant')
 * @param {string} content - Treść wiadomości
 * @param {Array} attachments - Lista załączników (opcjonalne)
 * @returns {Promise<string>} - ID dodanej wiadomości
 */
export const addMessageToConversation = async (conversationId, role, content, attachments = []) => {
  try {
    // Dodanie wiadomości
    const messagesRef = collection(db, 'aiConversations', conversationId, 'messages');
    const timestamp = new Date().toISOString();
    
    const messageData = {
      role,
      content,
      timestamp
    };

    // Dodaj załączniki jeśli są dostępne
    if (attachments && attachments.length > 0) {
      messageData.attachments = attachments;
    }
    
    const docRef = await addDoc(messagesRef, messageData);
    
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
 * @param {Array} attachments - Lista załączników (opcjonalne)
 * @returns {Promise<string>} - Odpowiedź asystenta
 */
export const processAIQuery = async (query, context = [], userId, attachments = []) => {
  console.log('[processAIQuery] Rozpoczynam przetwarzanie zapytania:', query);
  
  // NOWY SYSTEM V2: Sprawdź czy zapytanie może być obsłużone przez zoptymalizowany system
  try {
    if (AIAssistantV2.canHandleQuery(query)) {
      console.log('[processAIQuery] Zapytanie może być obsłużone przez AIAssistantV2');
      
      const v2Result = await AIAssistantV2.processQuery(query, { userId, attachments });
      
      if (v2Result.success) {
        console.log(`[processAIQuery] AIAssistantV2 zakończył w ${v2Result.processingTime.toFixed(2)}ms`);
        
        // Dodaj informację o metodzie przetwarzania dla użytkownika
        let response = v2Result.response;
        
        // Jeśli to bardzo szybka odpowiedź (< 2s), dodaj info o optymalizacji
        if (v2Result.processingTime < 2000) {
          response += `\n\n_⚡ Odpowiedź wygenerowana w ${v2Result.processingTime.toFixed(0)}ms przez zoptymalizowany system AI v2.0_`;
        }
        
        return response;
      } else {
        console.log('[processAIQuery] AIAssistantV2 nie zdołał przetworzyć zapytania, fallback do standardowego systemu');
      }
    } else {
      console.log('[processAIQuery] Zapytanie przekraczające możliwości AIAssistantV2, używam standardowego systemu');
    }
  } catch (v2Error) {
    console.error('[processAIQuery] Błąd w AIAssistantV2, fallback do standardowego systemu:', v2Error);
  }
  
  // STANDARDOWY SYSTEM: Fallback dla zapytań, których nowy system nie obsługuje
  console.log('[processAIQuery] Używam standardowego systemu z OpenAI API');
  
  // Limit czasu na pobranie danych (w milisekundach) - zwiększony na 20 sekund
  const DATA_FETCH_TIMEOUT = 20000;
  
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
    
    // Równoległe pobieranie danych
    const businessDataPromise = Promise.resolve().then(async () => {
      try {
        // Przekazujemy zapytanie użytkownika do funkcji pobierającej dane
        const data = await prepareBusinessDataForAI(query);
        dataSources.businessData = { ready: true, data };
        console.log('Dane biznesowe zostały pomyślnie pobrane z pełnymi szczegółami');
      } catch (error) {
        console.error('Błąd podczas pobierania danych biznesowych:', error);
        dataSources.businessData = { ready: true, data: null };
      }
    });
    
    const apiKeyPromise = Promise.resolve().then(async () => {
      try {
        const apiKey = await getOpenAIApiKey(userId);
        dataSources.apiKey = { ready: true, data: apiKey };
      } catch (error) {
        console.error('Błąd podczas pobierania klucza API:', error);
        dataSources.apiKey = { ready: true, data: null };
      }
    });
    
    // Poczekaj na wszystkie procesy lub na upływ limitu czasu
    await Promise.race([
      Promise.all([businessDataPromise, apiKeyPromise]),
      timeoutPromise
    ]);
    
    // Pobierz dostępne dane
    const businessData = dataSources.businessData.data;
    const apiKey = dataSources.apiKey.data;
    
    // Sprawdź czy nadal trwa pobieranie danych
    const isDataFetchingActive = !dataSources.businessData.ready || 
                                 !dataSources.apiKey.ready;
    
    // Jeśli dane są nadal pobierane, a nie mamy klucza API lub musimy go użyć
    if (isDataFetchingActive && (!apiKey || query.toLowerCase().includes('dane') || query.toLowerCase().includes('system'))) {
      // Wygeneruj tymczasową odpowiedź
      return `Pracuję nad szczegółową analizą danych dla Twojego zapytania "${query}". Pobieram wszystkie dostępne dane z systemu MRP, aby zapewnić pełne i dokładne informacje. To może potrwać chwilę ze względu na dużą ilość danych. Proszę o cierpliwość.`;
    }
    
    // Jeśli nie ma klucza API, używamy funkcji z danymi lokalnymi
    if (!apiKey) {
      console.log('Brak klucza API - generuję odpowiedź lokalnie');
      return getMockResponse(query, businessData);
    }
    
    // Przygotowanie treści zapytania z załącznikami
    let queryWithAttachments = query;
    
    if (attachments && attachments.length > 0) {
      queryWithAttachments += '\n\n--- Załączone pliki ---\n';
      
      for (const attachment of attachments) {
        try {
          queryWithAttachments += `\nPlik: ${attachment.fileName} (${attachment.contentType})\n`;
          
          // Jeśli to plik tekstowy, pobierz jego zawartość
          if (attachment.contentType.startsWith('text/') || attachment.contentType === 'application/json') {
            const fileContent = await getFileContent(attachment.downloadURL, attachment.contentType);
            queryWithAttachments += `Zawartość:\n${fileContent}\n`;
          } else if (attachment.contentType.startsWith('image/')) {
            queryWithAttachments += `[Obraz: ${attachment.fileName}]\n`;
          } else {
            queryWithAttachments += `[Dokument: ${attachment.fileName}]\n`;
          }
        } catch (error) {
          console.error('Błąd podczas przetwarzania załącznika:', error);
          queryWithAttachments += `[Błąd podczas odczytywania pliku: ${attachment.fileName}]\n`;
        }
      }
    }
    
    // Przygotowanie wiadomości do wysłania z optymalizacjami
    const allMessages = [...context, { role: 'user', content: queryWithAttachments }];
    
    // Określ poziom złożoności zapytania dla optymalizacji
    const complexity = queryWithAttachments.length > 100 ? 'complex' : 
                      queryWithAttachments.length > 50 ? 'medium' : 'simple';
    
    const formattedMessages = formatMessagesForOpenAI(allMessages, businessData, {
      enableOptimization: true,
      modelType: complexity
    });
    
    console.log('Wysyłam zapytanie do API OpenAI z pełnymi danymi z Firebase...');
    
    // Wywołanie API OpenAI z optymalizacjami
    try {
      const apiCallStartTime = performance.now();
      const response = await callOpenAIAPI(apiKey, formattedMessages, {
        complexity,
        optimizationOptions: {
          prioritizeSpeed: complexity === 'simple',
          prioritizeCost: true,
          enableCache: true
        }
      });
      const apiCallEndTime = performance.now();
      const responseTime = apiCallEndTime - apiCallStartTime;
      
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