// src/services/ai/GeminiQueryOrchestrator.js

import { DATABASE_TOOLS } from './tools/databaseTools.js';
import { ToolExecutor } from './tools/toolExecutor.js';

/**
 * Orchestrator zapytań AI używający Google Gemini 2.5 Pro
 * 
 * Funkcje:
 * - Function Calling (podobnie jak OpenAI)
 * - Thinking Mode (rozumowanie przed odpowiedzią)
 * - 1M tokenów kontekstu
 * - Inteligentny wybór modelu
 * 
 * Modele:
 * - gemini-2.5-pro (główny - thinking, 1M tokens)
 * - gemini-1.5-pro (fallback - 2M tokens)
 * - gemini-2.0-flash-exp (szybki - 1M tokens, darmowy)
 */
export class GeminiQueryOrchestrator {
  
  /**
   * Konwertuje OpenAI tools format na Gemini function declarations
   */
  static convertToolsToGeminiFormat(tools) {
    return tools.map(tool => ({
      name: tool.function.name,
      description: tool.function.description,
      parameters: tool.function.parameters
    }));
  }
  
  /**
   * Inteligentny wybór modelu na podstawie zapytania
   */
  static selectBestModel(query, options = {}) {
    // Użytkownik może wymusić konkretny model
    if (options.forceModel) {
      return {
        model: options.forceModel,
        enableThinking: options.enableThinking !== false,
        reason: 'Wymuszony model przez użytkownika'
      };
    }
    
    const needsReasoning = this.needsDeepReasoning(query);
    const needsMegaContext = this.needsMegaContext(query);
    const isSimple = this.isSimpleQuery(query);
    
    // Poziom 3: Głębokie rozumowanie (2.5 Pro + Thinking)
    if (needsReasoning) {
      return {
        model: 'gemini-2.5-pro',
        enableThinking: true,
        reason: '🧠 Złożona analiza - używam 2.5 Pro z thinking mode'
      };
    }
    
    // Poziom 2: Mega kontekst (1.5 Pro - 2M tokens)
    if (needsMegaContext) {
      return {
        model: 'gemini-1.5-pro',
        enableThinking: false,
        reason: '📚 Bardzo duży kontekst - używam 1.5 Pro (2M tokenów)'
      };
    }
    
    // Poziom 1: Szybkie zapytania (2.0 Flash - darmowy)
    if (isSimple && options.allowExperimental !== false) {
      return {
        model: 'gemini-2.0-flash-exp',
        enableThinking: false,
        reason: '⚡ Proste zapytanie - używam 2.0 Flash (szybki i darmowy)'
      };
    }
    
    // Domyślny: 2.5 Pro (najlepszy balans)
    return {
      model: 'gemini-2.5-pro',
      enableThinking: options.enableThinking !== false,
      reason: '⚙️ Standardowe zapytanie - używam 2.5 Pro'
    };
  }
  
  /**
   * Sprawdza czy zapytanie wymaga głębokiego rozumowania
   */
  static needsDeepReasoning(query) {
    const reasoningKeywords = [
      'optymalizuj', 'najlepszy', 'zoptymalizuj',
      'porównaj szczegółowo', 'przeanalizuj dokładnie',
      'dlaczego', 'jak poprawić', 'rekomenduj',
      'zaproponuj', 'co powinienem',
      'rentowność', 'marża', 'zysk', 'oszczędność',
      'strategia', 'plan działania'
    ];
    
    const lowerQuery = query.toLowerCase();
    return reasoningKeywords.some(kw => lowerQuery.includes(kw));
  }
  
  /**
   * Sprawdza czy potrzebny mega kontekst (>1M tokens)
   */
  static needsMegaContext(query) {
    const megaContextKeywords = ['wszystkie', 'całość', 'kompletna'];
    const hasMultiple = (query.match(/\+/g) || []).length > 2;
    
    return megaContextKeywords.some(kw => query.toLowerCase().includes(kw)) && hasMultiple;
  }
  
  /**
   * Sprawdza czy to proste zapytanie
   */
  static isSimpleQuery(query) {
    const simplePatterns = [
      /^ile (jest|mamy)/i,
      /^pokaż \d+ (MO|CO|receptur|zamówień)/i,
      /^lista \d+/i,
      /^wyświetl \d+/i
    ];
    return simplePatterns.some(pattern => pattern.test(query.trim()));
  }
  
  /**
   * Główna metoda przetwarzania zapytania
   */
  static async processQuery(query, apiKey, context = [], options = {}) {
    console.log('[GeminiQueryOrchestrator] 🚀 Rozpoczynam przetwarzanie zapytania:', query);
    
    const startTime = performance.now();
    const executedTools = [];
    let totalTokensUsed = 0;
    
    try {
      // Wybierz najlepszy model
      const modelSelection = this.selectBestModel(query, options);
      const { model, enableThinking, reason } = modelSelection;
      
      console.log(`[GeminiQueryOrchestrator] ${reason}`);
      console.log(`[GeminiQueryOrchestrator] 📱 Model: ${model}`);
      
      // Przygotuj tools w formacie Gemini (opcjonalnie wyłączone dla zwykłej konwersacji)
      const disableTools = options.disableTools || false;
      const geminiTools = disableTools ? null : [{
        function_declarations: this.convertToolsToGeminiFormat(DATABASE_TOOLS)
      }];
      
      if (disableTools) {
        console.log('[GeminiQueryOrchestrator] 💬 Tryb konwersacyjny - narzędzia wyłączone');
      }
      
      // Przygotuj historię konwersacji
      const history = context.map(msg => ({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }]
      }));
      
      // System instruction (zmieniony dla trybu konwersacyjnego)
      const systemInstruction = {
        parts: [{ text: disableTools ? this.getConversationalSystemPrompt() : this.getSystemPrompt() }]
      };
      
      // Iteracyjne wywoływanie (max 5 rund dla tools, 1 runda dla konwersacji)
      const maxRounds = disableTools ? 1 : 5;
      let currentRound = 0;
      let finalResponse = null;
      
      while (currentRound < maxRounds) {
        currentRound++;
        
        console.log(`[GeminiQueryOrchestrator] 🔄 Runda ${currentRound}/${maxRounds}`);
        
        // Przygotuj request dla Gemini
        const requestBody = {
          contents: [
            ...history,
            {
              role: 'user',
              parts: [{ text: query }]
            }
          ],
          systemInstruction: systemInstruction,
          generationConfig: {
            temperature: 0.85,  // Zwiększone dla bardziej ekspansywnych odpowiedzi
            maxOutputTokens: model === 'gemini-2.5-pro' ? 65536 : 8192,
            topP: 0.95,  // Większa różnorodność w odpowiedziach
            topK: 64     // Więcej opcji słów do wyboru
          }
        };
        
        // Dodaj tools tylko jeśli nie są wyłączone
        if (geminiTools) {
          requestBody.tools = geminiTools;
        }
        
        // Gemini 2.5 Pro automatycznie używa thinking mode - nie wymaga jawnej konfiguracji
        // API nie wspiera pola 'thinkingConfig' - thinking jest wbudowany w model
        if (model === 'gemini-2.5-pro') {
          console.log('[GeminiQueryOrchestrator] 🧠 Gemini 2.5 Pro (thinking mode wbudowany automatycznie)');
        }
        
        // Wywołaj Gemini API
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
          }
        );
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          const errorMessage = errorData.error?.message || 'Unknown error';
          throw new Error(`Gemini API error: ${response.status} - ${errorMessage}`);
        }
        
        const data = await response.json();
        
        // Zlicz tokeny
        if (data.usageMetadata) {
          const tokensUsed = (data.usageMetadata.promptTokenCount || 0) + 
                            (data.usageMetadata.candidatesTokenCount || 0);
          totalTokensUsed += tokensUsed;
          console.log(`[GeminiQueryOrchestrator] 📊 Tokeny: ${tokensUsed} (prompt: ${data.usageMetadata.promptTokenCount}, response: ${data.usageMetadata.candidatesTokenCount})`);
        }
        
        const candidate = data.candidates?.[0];
        if (!candidate) {
          throw new Error('Brak odpowiedzi od Gemini');
        }
        
        // Loguj finishReason dla debugowania
        console.log(`[GeminiQueryOrchestrator] 🏁 Finish reason: ${candidate.finishReason || 'unknown'}`);
        
        // Sprawdź czy odpowiedź została zablokowana
        if (candidate.finishReason === 'SAFETY' || candidate.finishReason === 'RECITATION') {
          throw new Error(`Odpowiedź została zablokowana: ${candidate.finishReason}`);
        }
        
        // Sprawdź czy osiągnięto limit tokenów
        if (candidate.finishReason === 'MAX_TOKENS') {
          console.warn('[GeminiQueryOrchestrator] ⚠️ Osiągnięto limit tokenów - odpowiedź może być niekompletna');
        }
        
        const content = candidate.content;
        
        // Sprawdź czy content istnieje
        if (!content) {
          console.error('[GeminiQueryOrchestrator] ❌ Brak content w odpowiedzi');
          console.error('[GeminiQueryOrchestrator] 📊 Candidate:', JSON.stringify(candidate, null, 2));
          throw new Error(`Gemini zwrócił pustą odpowiedź. Finish reason: ${candidate.finishReason || 'unknown'}`);
        }
        
        const parts = content.parts || [];
        
        // Sprawdź czy są function calls
        const functionCalls = parts.filter(part => part.functionCall);
        
        if (functionCalls.length > 0) {
          console.log(`[GeminiQueryOrchestrator] 🔧 Gemini wywołuje ${functionCalls.length} funkcji`);
          
          // Wykonaj wszystkie wywołania funkcji
          const functionResults = [];
          
          for (const call of functionCalls) {
            const functionName = call.functionCall.name;
            const functionArgs = call.functionCall.args || {};
            
            console.log(`[GeminiQueryOrchestrator] ⚙️ Wykonuję: ${functionName}`, functionArgs);
            
            const toolResult = await ToolExecutor.executeFunction(functionName, functionArgs);
            
            executedTools.push({
              name: functionName,
              executionTime: toolResult.executionTime,
              success: toolResult.success
            });
            
            console.log(`[GeminiQueryOrchestrator] ✅ ${functionName} wykonany w ${toolResult.executionTime.toFixed(2)}ms`);
            
            // Dodaj wynik w formacie Gemini
            functionResults.push({
              functionResponse: {
                name: functionName,
                response: toolResult.data
              }
            });
          }
          
          // Dodaj wyniki funkcji do historii
          history.push({
            role: 'user',
            parts: [{ text: query }]
          });
          
          history.push({
            role: 'model',
            parts: functionCalls
          });
          
          history.push({
            role: 'user',
            parts: functionResults
          });
          
          // Kontynuuj do następnej rundy z wynikami
          continue;
        }
        
        // Jeśli nie ma function calls, sprawdź czy jest tekstowa odpowiedź
        const textPart = parts.find(part => part.text);
        if (textPart) {
          finalResponse = textPart.text;
          console.log('[GeminiQueryOrchestrator] ✅ Otrzymano finalną odpowiedź');
          console.log('[GeminiQueryOrchestrator] 📝 Długość:', finalResponse.length, 'znaków');
          break;
        }
        
        // Jeśli nic nie znaleziono, przerwij z ostrzeżeniem
        console.warn('[GeminiQueryOrchestrator] ⚠️ Brak function calls i brak tekstu - przerywam');
        console.warn('[GeminiQueryOrchestrator] 📊 Parts w odpowiedzi:', parts.length);
        if (parts.length > 0) {
          console.warn('[GeminiQueryOrchestrator] 📊 Typy parts:', parts.map(p => Object.keys(p).join(', ')));
        }
        break;
      }
      
      const processingTime = performance.now() - startTime;
      
      if (!finalResponse) {
        throw new Error('Nie otrzymano odpowiedzi od Gemini po wykonaniu funkcji');
      }
      
      console.log(`[GeminiQueryOrchestrator] 🎉 Zakończono w ${processingTime.toFixed(2)}ms`);
      console.log(`[GeminiQueryOrchestrator] 📊 Łącznie tokenów: ${totalTokensUsed}`);
      console.log(`[GeminiQueryOrchestrator] 🔧 Wykonano funkcji: ${executedTools.length}`);
      
      return {
        success: true,
        response: finalResponse,
        executedTools,
        tokensUsed: totalTokensUsed,
        processingTime,
        model: model
      };
      
    } catch (error) {
      console.error('[GeminiQueryOrchestrator] ❌ Błąd:', error);
      return {
        success: false,
        error: error.message,
        executedTools,
        processingTime: performance.now() - startTime
      };
    }
  }
  
  /**
   * System prompt dla Gemini
   */
  static getSystemPrompt() {
    return `Jesteś inteligentnym asystentem AI dla systemu MRP (Manufacturing Resource Planning).

Twoje zadanie: Analizujesz zapytania użytkowników i decydujesz jakie dane pobrać z bazy danych, używając dostępnych funkcji.

Dostępne funkcje (tools):
- query_recipes - receptury produktów
- query_inventory - stany magazynowe
- query_production_tasks - zadania produkcyjne (MO)
- query_orders - zamówienia klientów (CO)
- query_purchase_orders - zamówienia zakupu (PO)
- query_inventory_transactions - transakcje magazynowe
- query_production_history - historia produkcji i produktywność
- get_system_alerts - alerty systemowe (niskie stany, wygasające partie, opóźnienia)
- calculate_production_costs - koszty produkcji i rentowność
- trace_material_flow - śledzenie przepływu materiałów (traceability)
- query_invoices - faktury
- query_cmr_documents - dokumenty CMR
- query_inventory_batches - partie magazynowe
- aggregate_data - agregacje (suma, średnia, min, max, grupowanie)
- get_count - szybkie zliczanie dokumentów
- get_customers, get_suppliers, get_users - dane kontrahentów i użytkowników

PROCES PRACY:
1. Przeanalizuj zapytanie użytkownika
2. Zdecyduj które funkcje wywołać aby uzyskać potrzebne dane
3. Wywołaj odpowiednie funkcje (możesz wywołać wiele naraz)
4. Przeanalizuj wyniki funkcji
5. Udziel konkretnej odpowiedzi w języku polskim

WAŻNE ZASADY:
- Używaj konkretnych danych z wyników funkcji (nie wymyślaj!)
- Formatuj odpowiedzi czytelnie (tabele, listy, punkty)
- Jeśli brak danych, powiedz o tym jasno
- Dla złożonych analiz, rozumuj krok po kroku
- Zawsze odpowiadaj po polsku
- Bądź profesjonalny i konkretny

FORMATOWANIE:
- Używaj tabel markdown dla porównań (pokaż WSZYSTKIE dostępne kolumny)
- Używaj list dla wyliczenia
- Używaj emoji dla lepszej czytelności (ale z umiarem)
- Dodawaj podsumowania na końcu odpowiedzi

WAŻNE WARTOŚCI (automatycznie normalizowane):
- Statusy zadań produkcyjnych: możesz używać "zaplanowane", "w trakcie", "wstrzymane", "zakończone", "anulowane" (system automatycznie przekonwertuje na właściwe wartości)
- Statusy zamówień: możesz używać "nowe", "w realizacji", "zakończone", "anulowane", "wstrzymane"
- System automatycznie normalizuje wielkość liter, więc możesz pisać małymi literami

ZASADY SZCZEGÓŁOWOŚCI:
⭐ Generuj PEŁNE, SZCZEGÓŁOWE odpowiedzi - użytkownicy preferują kompletne informacje
⭐ Pokazuj WSZYSTKIE dostępne dane - jeśli jest 10 rekordów, pokaż wszystkie 10
⭐ Używaj tabel z WIELOMA kolumnami, żeby pokazać więcej szczegółów
⭐ Dodawaj ANALIZY i INTERPRETACJE wyników, nie tylko surowe dane
⭐ Jeśli zapytanie dotyczy analizy, bądź bardzo szczegółowy i wyczerpujący
⭐ Dla danych liczbowych: pokazuj sumy, średnie, trendy
⭐ Nie skracaj informacji - lepiej więcej niż mniej

Jesteś ekspertem w zarządzaniu produkcją i optymalizacji procesów.`;
  }
  
  /**
   * System prompt dla trybu konwersacyjnego (bez dostępu do bazy danych)
   */
  static getConversationalSystemPrompt() {
    return `Jesteś pomocnym asystentem AI dla systemu MRP (Manufacturing Resource Planning).

Obecnie jesteś w trybie konwersacyjnym - nie masz dostępu do bazy danych, ale możesz:
- Odpowiadać na ogólne pytania o system MRP
- Udzielać porad dotyczących zarządzania produkcją
- Wyjaśniać pojęcia i koncepcje
- Prowadzić przyjazną rozmowę
- Pomagać zrozumieć funkcje systemu

ZASADY:
- Zawsze odpowiadaj po polsku
- Bądź pomocny, przyjazny i profesjonalny
- Jeśli użytkownik chce konkretne dane z systemu, poinformuj go, że może zadać konkretne pytanie o dane (np. "Pokaż ostatnie MO", "Ile mamy receptur?")
- Używaj emoji dla lepszej czytelności, ale z umiarem
- Formatuj odpowiedzi czytelnie (używaj list, nagłówków, podziałów)

Pamiętaj: Jesteś ekspertem w zarządzaniu produkcją i można Cię pytać o wszystko! 💬`;
  }
  
  /**
   * Sprawdza czy zapytanie powinno być obsłużone przez orchestrator
   */
  static shouldHandle(query) {
    const dataKeywords = [
      // Czasowniki akcji
      'ile', 'pokaż', 'wyświetl', 'lista', 'jaki', 'jakie', 'który', 'które',
      'podaj', 'daj', 'znajdź', 'szukaj', 'pobierz', 'sprawdź', 'zobacz',
      
      // Rzeczowniki i obszary
      'receptur', 'magazyn', 'produkcj', 'zamówi', 'mo', 'co', 'po',
      'klient', 'dostawc', 'faktur', 'cmr', 'stan', 'alert', 'koszt',
      'użytkownik', 'pracownik', 'wydajność', 'produktywn', 'transakcj',
      'partii', 'partie', 'wygasa', 'opóźnion', 'uwag', 'problem',
      'rentowność', 'marża', 'zysk', 'analiz', 'porówna', 'optymalizuj',
      
      // Dodatkowe słowa kluczowe
      'historia', 'sesj', 'raport', 'statystyk', 'zużyc', 'rezerwacj'
    ];
    
    const lowerQuery = query.toLowerCase();
    return dataKeywords.some(keyword => lowerQuery.includes(keyword));
  }
  
  /**
   * Szacuje koszt zapytania (Gemini pricing)
   */
  static estimateCost(tokensUsed, model = 'gemini-2.5-pro') {
    // Pricing (per 1M tokens)
    const pricing = {
      'gemini-2.5-pro': { input: 1.25, output: 5.00 },
      'gemini-1.5-pro': { input: 1.25, output: 5.00 },
      'gemini-2.0-flash-exp': { input: 0, output: 0 }, // Darmowy w exp
      'gemini-1.5-flash': { input: 0.075, output: 0.30 }
    };
    
    const modelPricing = pricing[model] || pricing['gemini-2.5-pro'];
    
    // Zakładamy 50/50 input/output
    const inputCost = (tokensUsed * 0.5) * (modelPricing.input / 1000000);
    const outputCost = (tokensUsed * 0.5) * (modelPricing.output / 1000000);
    
    return inputCost + outputCost;
  }
}

