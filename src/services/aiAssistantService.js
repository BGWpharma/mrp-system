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
import { AIQueryOrchestrator } from './ai/AIQueryOrchestrator.js';
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
export const callOpenAIAPI = async (apiKey, messages, options = {}, onChunk = null) => {
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
          messages,
          stream: true  // OPTYMALIZACJA: Włączono streaming dla natychmiastowej odpowiedzi
        };
        
        // GPT-5 wymaga innych parametrów:
        if (isGPT5) {
          // GPT-5 używa max_completion_tokens i nie wspiera niestandardowego temperature
          // WAŻNE: max_completion_tokens obejmuje reasoning_tokens + output_tokens
          // OPTYMALIZACJA: Zmniejszono z 20000 do 4000 dla szybszych odpowiedzi
          requestBody.max_completion_tokens = 4000;  // Łączny limit (reasoning + output) - zoptymalizowano
          
          // GPT-5 wymaga nowych parametrów kontrolujących generowanie odpowiedzi
          // OPTYMALIZACJA: Ustawiono 'low' dla szybszego czasu odpowiedzi
          requestBody.reasoning_effort = 'low';     // low, medium, high - kontroluje czas rozumowania (zoptymalizowano)
          requestBody.verbosity = 'medium';         // low, medium, high - kontroluje długość odpowiedzi (zoptymalizowano)
          
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
        
        // STREAMING: Obsługa odpowiedzi strumieniowej
        console.log('[STREAMING] Rozpoczynam odczyt odpowiedzi strumieniowej...');
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullResponse = '';
        let buffer = '';
        let tokenStats = null;
        
        try {
          while (true) {
            const { done, value } = await reader.read();
            
            if (done) {
              console.log('[STREAMING] Zakończono odczyt strumienia');
              break;
            }
            
            // Dekoduj chunk
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            
            // Zachowaj ostatnią niepełną linię w buforze
            buffer = lines.pop() || '';
            
            // Przetwórz każdą kompletną linię
            for (const line of lines) {
              const trimmedLine = line.trim();
              
              if (trimmedLine === '') continue;
              if (trimmedLine === 'data: [DONE]') continue;
              
              if (trimmedLine.startsWith('data: ')) {
                try {
                  const jsonData = JSON.parse(trimmedLine.substring(6));
                  
                  // Wyciągnij content z delta
                  const delta = jsonData.choices?.[0]?.delta;
                  if (delta?.content) {
                    const chunk = delta.content;
                    fullResponse += chunk;
                    
                    // 🔥 STREAMING CALLBACK: Wywołaj callback dla każdego chunka jeśli jest dostarczony
                    if (onChunk && chunk) {
                      try {
                        onChunk(chunk, { 
                          totalLength: fullResponse.length,
                          isComplete: false 
                        });
                      } catch (callbackError) {
                        console.warn('[STREAMING] Błąd w callback onChunk:', callbackError);
                      }
                    }
                  }
                  
                  // Zbierz statystyki użycia (jeśli dostępne)
                  if (jsonData.usage) {
                    tokenStats = jsonData.usage;
                  }
                  
                } catch (parseError) {
                  console.warn('[STREAMING] Błąd parsowania linii:', trimmedLine, parseError);
                }
              }
            }
          }
        } catch (streamError) {
          console.error('[STREAMING] Błąd podczas odczytu strumienia:', streamError);
          throw new Error(`Błąd streaming: ${streamError.message}`);
        }
        
        // DEBUGGING dla GPT-5
        if (modelConfig.model === 'gpt-5' && tokenStats) {
          console.log('[GPT-5 DEBUG] 📊 Użycie tokenów (ze streaming):', {
            prompt_tokens: tokenStats.prompt_tokens,
            completion_tokens: tokenStats.completion_tokens,
            reasoning_tokens: tokenStats.completion_tokens_details?.reasoning_tokens || 0,
            output_tokens: (tokenStats.completion_tokens - (tokenStats.completion_tokens_details?.reasoning_tokens || 0))
          });
          
          // Ostrzeżenie jeśli reasoning zjada wszystkie tokeny
          const reasoningTokens = tokenStats.completion_tokens_details?.reasoning_tokens || 0;
          const outputTokens = tokenStats.completion_tokens - reasoningTokens;
          if (reasoningTokens > 0 && outputTokens < 100) {
            console.warn('[GPT-5 WARNING] ⚠️ Reasoning tokens zajęły prawie cały limit!', {
              reasoning: reasoningTokens,
              output: outputTokens,
              recommendation: 'Zwiększ max_completion_tokens lub zmniejsz reasoning_effort'
            });
          }
        }
        
        // Sprawdź czy mamy odpowiedź
        if (!fullResponse || fullResponse.trim() === '') {
          console.error('[STREAMING] Pusta odpowiedź ze strumienia');
          throw new Error('API zwróciło pustą odpowiedź przez streaming');
        }
        
        // 🔥 STREAMING CALLBACK: Wywołaj ostatni callback z flagą isComplete
        if (onChunk) {
          try {
            onChunk('', { 
              totalLength: fullResponse.length,
              isComplete: true 
            });
          } catch (callbackError) {
            console.warn('[STREAMING] Błąd w finalnym callback onChunk:', callbackError);
          }
        }
        
        console.log(`[STREAMING] Otrzymano odpowiedź: ${fullResponse.length} znaków`);
        return fullResponse;
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

  // NOWA STRATEGIA: Kompresja kontekstu przez JSON zamiast długiego tekstu
  let businessDataContext = '';
  
  if (optimizedBusinessData) {
    // Przygotuj skompresowany kontekst w formacie JSON
    const compactContext = {
      summary: optimizedBusinessData.summary || {},
      collections: {},
      analysis: optimizedBusinessData.analysis || {}
    };
    
    // Funkcja do inteligentnego przycięcia dużych kolekcji
    // 🔥 OPTYMALIZACJA: Zmniejszono z 50 na 20 aby zmieścić się w limicie 272k tokenów GPT-5
    const smartTruncate = (items, maxItems = 20) => {
      if (!Array.isArray(items)) return items;
      if (items.length <= maxItems) return items;
      
      // Dla dużych kolekcji: pierwsze 15 + ostatnie 5 + marker
      return [
        ...items.slice(0, 15),
        { _truncated: true, _hiddenCount: items.length - 20, _message: `[${items.length - 20} more items omitted for brevity]` },
        ...items.slice(-5)
      ];
    };
    
    // 🔥 FIX: Dodaj dane z każdej kolekcji w formacie JSON
    // ContextOptimizer zwraca płaską strukturę {summary, recipes, inventory, ...}
    // a nie {data: {recipes, inventory}, summary}
    const dataToProcess = optimizedBusinessData.data || optimizedBusinessData;
    
    Object.keys(dataToProcess).forEach(collectionName => {
      // Pomiń klucze wewnętrzne i summary
      if (collectionName.startsWith('_') || collectionName === 'summary' || collectionName === 'analysis') {
        return;
      }
      
      const collectionData = dataToProcess[collectionName];
      
      if (Array.isArray(collectionData) && collectionData.length > 0) {
        compactContext.collections[collectionName] = {
          count: collectionData.length,
          items: smartTruncate(collectionData, 20)  // 🔥 OPTYMALIZACJA: Limit 20 zamiast 50
        };
      }
    });
    
    // Wygeneruj zwięzły kontekst tekstowy z najważniejszymi statystykami
    const summary = compactContext.summary;
    businessDataContext = `
=== SYSTEM MRP - DATA SNAPSHOT ===

QUICK STATS:
• Inventory: ${summary.totalInventoryItems || 0} items (${summary.itemsLowOnStock || 0} low stock)
• Orders (CO): ${summary.totalOrders || 0} total
• Production (MO): ${summary.totalProductionTasks || 0} tasks (${summary.activeProductionTasks || 0} active)
• Suppliers: ${summary.totalSuppliers || 0}
• Purchase Orders (PO): ${summary.pendingPurchaseOrders || 0} pending
• Timestamp: ${summary.timestamp || new Date().toISOString()}

AVAILABLE COLLECTIONS (${Object.keys(compactContext.collections).length} total):
${Object.keys(compactContext.collections).map(name => 
  `• ${name}: ${compactContext.collections[name].count} records`
).join('\n')}

DETAILED DATA (JSON format - all data from Firebase):
\`\`\`json
${JSON.stringify(compactContext, null, 1)}
\`\`\`

ANALYSIS INSIGHTS:
${JSON.stringify(compactContext.analysis, null, 1)}

NOTE: Above data comes DIRECTLY from Firebase. All data is available.
Use item NAMES (not IDs) when presenting to users.
`;
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
export const processAIQuery = async (query, context = [], userId, attachments = [], onChunk = null) => {
  console.log('[processAIQuery] 🚀 Rozpoczynam przetwarzanie zapytania:', query);
  
  // 🔥 STREAMING: Jeśli mamy callback, loguj to
  if (onChunk) {
    console.log('[processAIQuery] Streaming włączony - chunki będą przekazywane w czasie rzeczywistym');
  }
  
  try {
    // ✨ NOWY SYSTEM: AI Query Orchestrator - GPT sam decyduje jakie dane pobrać
    // Sprawdź czy orchestrator powinien obsłużyć zapytanie (nie obsługuje załączników)
    const hasAttachments = attachments && attachments.length > 0;
    const shouldUseOrchestrator = !hasAttachments && AIQueryOrchestrator.shouldHandle(query);
    
    if (shouldUseOrchestrator) {
      console.log('[processAIQuery] 🎯 Używam AI Query Orchestrator - GPT zdecyduje jakie dane pobrać');
      
      try {
        // Pobierz klucz API
        const apiKey = await getOpenAIApiKey(userId);
        
        if (!apiKey) {
          return "❌ Nie znaleziono klucza API OpenAI. Proszę skonfigurować klucz w ustawieniach systemu.";
        }
        
        // Użyj orchestratora - AI sam wykona targetowane zapytania
        const orchestratorResult = await AIQueryOrchestrator.processQuery(
          query, 
          apiKey, 
          context,
          {
            model: 'gpt-4o-mini',  // Zmieniono na gpt-4o-mini dla lepszego balansu koszt/jakość
            // Nie przekazujemy onChunk - Function Calling (tool use) wymaga braku streamingu
            // Odpowiedź nadal będzie szybka dzięki targetowanym zapytaniom (~1-3s)
          }
        );
        
        if (orchestratorResult.success) {
          console.log(`[processAIQuery] ✅ Orchestrator zakończył w ${orchestratorResult.processingTime.toFixed(2)}ms`);
          console.log(`[processAIQuery] 📊 Wykonano ${orchestratorResult.executedTools.length} targetowanych zapytań do bazy`);
          console.log(`[processAIQuery] 📝 Otrzymano odpowiedź (długość: ${orchestratorResult.response?.length} znaków):`, orchestratorResult.response?.substring(0, 200) + '...');
          
          // Dodaj informację o zoptymalizowanym przetwarzaniu
          let response = orchestratorResult.response;
          
          if (orchestratorResult.executedTools.length > 0) {
            const queryNames = orchestratorResult.executedTools.map(t => t.name).join(', ');
            const totalQueryTime = orchestratorResult.executedTools.reduce((sum, t) => sum + t.executionTime, 0);
            const estimatedCost = AIQueryOrchestrator.estimateCost(orchestratorResult.tokensUsed);
            
            response += `\n\n_🎯 Wykonano ${orchestratorResult.executedTools.length} zoptymalizowanych zapytań do bazy (${totalQueryTime.toFixed(0)}ms)_`;
            response += `\n_⚡ Całkowity czas: ${orchestratorResult.processingTime.toFixed(0)}ms | Tokeny: ${orchestratorResult.tokensUsed} | Koszt: ~$${estimatedCost.toFixed(4)}_`;
          }
          
          console.log(`[processAIQuery] 🎁 Zwracam odpowiedź (długość: ${response?.length} znaków):`, response?.substring(0, 200) + '...');
          
          return response;
        } else {
          // Orchestrator nie zdołał przetworzyć - zwróć błąd zamiast fallbacku
          console.error('[processAIQuery] ❌ Orchestrator nie zdołał przetworzyć zapytania');
          console.error('[processAIQuery] Błąd:', orchestratorResult.error);
          
          return `❌ **Nie udało się przetworzyć zapytania**\n\n` +
                 `Szczegóły: ${orchestratorResult.error}\n\n` +
                 `💡 Spróbuj:\n` +
                 `• Uprość zapytanie\n` +
                 `• Zmniejsz liczbę żądanych elementów\n` +
                 `• Podziel zapytanie na mniejsze części`;
        }
        
      } catch (orchestratorError) {
        console.error('[processAIQuery] ❌ Błąd w Orchestrator:', orchestratorError);
        
        return `❌ **Wystąpił błąd podczas przetwarzania zapytania**\n\n` +
               `Szczegóły: ${orchestratorError.message}\n\n` +
               `💡 Spróbuj ponownie lub skontaktuj się z administratorem.`;
      }
    } else {
      if (hasAttachments) {
        console.log('[processAIQuery] 📎 Wykryto załączniki - używam standardowego systemu z pełnym kontekstem');
        // Kontynuuj do standardowego systemu poniżej
      } else {
        // Zapytanie nie może być obsłużone przez orchestrator i nie ma załączników
        console.log('[processAIQuery] 💬 Zapytanie konwersacyjne - orchestrator nie może obsłużyć');
        return `💬 To zapytanie wygląda na konwersacyjne lub ogólne.\n\n` +
               `System jest zoptymalizowany pod zapytania o dane (receptury, magazyn, zamówienia, produkcja).\n\n` +
               `💡 Spróbuj zadać konkretne pytanie o dane, na przykład:\n` +
               `• "Pokaż 10 ostatnich MO"\n` +
               `• "Ile mamy receptur?"\n` +
               `• "Które partie wygasają wkrótce?"\n` +
               `• "Jaki jest stan magazynowy?"\n\n` +
               `Lub dodaj załącznik, aby użyć pełnego kontekstu systemu.`;
      }
    }
  } catch (error) {
    console.error('[processAIQuery] ❌ Błąd podczas wyboru systemu:', error);
    return `❌ **Wystąpił nieoczekiwany błąd**\n\n` +
           `Szczegóły: ${error.message}\n\n` +
           `💡 Spróbuj ponownie lub skontaktuj się z administratorem.`;
  }
  
  // STANDARDOWY SYSTEM - TYLKO dla załączników
  console.log('[processAIQuery] 📚 Używam standardowego systemu z pełnym kontekstem danych (załączniki)');
  
  // Limit czasu na pobranie danych (w milisekundach) - zoptymalizowany
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
    
    // 🔥 NOWA OPTYMALIZACJA: Sprawdź rozmiar danych przed wysłaniem
    const messagesSize = JSON.stringify(formattedMessages).length;
    const estimatedTokens = Math.ceil(messagesSize / 3); // ~3 znaki = 1 token dla PL
    const GPT5_INPUT_LIMIT = 272000; // Limit INPUT dla GPT-5
    
    console.log(`[TOKEN CHECK] 📊 Rozmiar danych:`, {
      charactersCount: messagesSize,
      estimatedTokens: estimatedTokens,
      limit: GPT5_INPUT_LIMIT,
      utilizationPercent: ((estimatedTokens / GPT5_INPUT_LIMIT) * 100).toFixed(1) + '%',
      withinLimit: estimatedTokens <= GPT5_INPUT_LIMIT
    });
    
    // Ostrzeżenie jeśli zbliżamy się do limitu
    if (estimatedTokens > GPT5_INPUT_LIMIT * 0.9) {
      console.warn(`⚠️ [TOKEN CHECK] UWAGA: Używasz ${((estimatedTokens / GPT5_INPUT_LIMIT) * 100).toFixed(1)}% limitu tokenów!`);
    }
    
    if (estimatedTokens > GPT5_INPUT_LIMIT) {
      console.error(`❌ [TOKEN CHECK] BŁĄD: Przekroczono limit tokenów! ${estimatedTokens} > ${GPT5_INPUT_LIMIT}`);
      throw new Error(`Zapytanie jest zbyt duże (${estimatedTokens} tokenów). Limit to ${GPT5_INPUT_LIMIT} tokenów. Spróbuj zadać bardziej konkretne pytanie.`);
    }
    
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
      }, onChunk);  // 🔥 STREAMING: Przekazuj callback do API
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