// src/services/ai/AIQueryOrchestrator.js

import { DATABASE_TOOLS } from './tools/databaseTools.js';
import { ToolExecutor } from './tools/toolExecutor.js';

/**
 * Orchestrator zapytań AI - używa GPT do decydowania jakie zapytania wykonać do bazy
 * 
 * System działa w następujący sposób:
 * 1. Użytkownik zadaje pytanie w języku naturalnym
 * 2. GPT analizuje pytanie i decyduje jakie funkcje (tools) wywołać
 * 3. System wykonuje wybrane funkcje (targetowane zapytania do Firestore)
 * 4. GPT otrzymuje wyniki i generuje odpowiedź w języku naturalnym
 * 
 * Zalety:
 * - Pobiera TYLKO potrzebne dane (nie całą bazę)
 * - Elastyczny - działa z dowolnymi zapytaniami
 * - AI sam orkiestruje zapytania
 * - Możliwość wielu rund (AI może wywoływać funkcje sekwencyjnie)
 */
export class AIQueryOrchestrator {
  
  /**
   * Przetwarza zapytanie używając AI do decydowania o zapytaniach do bazy
   * @param {string} query - Zapytanie użytkownika
   * @param {string} apiKey - Klucz API OpenAI
   * @param {Array} context - Kontekst konwersacji (poprzednie wiadomości)
   * @param {Object} options - Opcje dodatkowe
   * @returns {Promise<Object>} - Wynik przetwarzania
   */
  static async processQuery(query, apiKey, context = [], options = {}) {
    console.log('[AIQueryOrchestrator] 🚀 Rozpoczynam przetwarzanie zapytania:', query);
    
    const startTime = performance.now();
    const executedTools = [];
    let totalTokensUsed = 0;
    
    try {
      // Krok 1: Przygotuj wiadomości dla GPT
      let messages = [
        {
          role: 'system',
          content: this.getSystemPrompt()
        },
        ...context.map(msg => ({
          role: msg.role,
          content: msg.content
        })),
        {
          role: 'user',
          content: query
        }
      ];
      
      // Iteracyjne wywoływanie API (maksymalnie 5 rund - AI może wywoływać funkcje wielokrotnie)
      const maxRounds = 5;
      let currentRound = 0;
      let finalResponse = null;
      
      while (currentRound < maxRounds) {
        currentRound++;
        
        console.log(`[AIQueryOrchestrator] 🔄 Runda ${currentRound}/${maxRounds}: Wysyłam do GPT...`);
        
        // Krok 2: Wywołanie OpenAI API z tools
        const requestBody = {
          model: options.model || 'gpt-4o',  // lub gpt-4o-mini dla oszczędności
          messages: messages,
          tools: DATABASE_TOOLS,
          tool_choice: 'auto',  // GPT sam decyduje czy wywołać narzędzia
          temperature: 0.7,
          max_tokens: 2000
        };
        
        // UWAGA: OpenAI nie obsługuje streamingu z Function Calling (tools)
        // Jeśli onChunk jest przekazany, wyłączamy tools - ale to nie powinno się zdarzyć
        // bo w aiAssistantService.js nie przekazujemy onChunk do orchestratora
        if (options.onChunk) {
          console.warn('[AIQueryOrchestrator] ⚠️ Otrzymano callback streamingu - ale orchestrator nie obsługuje streamingu z tools!');
          console.warn('[AIQueryOrchestrator] 💡 Streaming zostanie zignorowany, aby umożliwić Function Calling');
          // NIE usuwamy tools - Function Calling jest priorytetem
          // delete requestBody.tools;
          // delete requestBody.tool_choice;
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
          const errorData = await response.json().catch(() => ({}));
          throw new Error(`OpenAI API error: ${response.status} ${response.statusText} - ${errorData.error?.message || 'Unknown error'}`);
        }
        
        const data = await response.json();
        const assistantMessage = data.choices[0].message;
        
        // Śledź użycie tokenów
        if (data.usage) {
          totalTokensUsed += data.usage.total_tokens;
          console.log(`[AIQueryOrchestrator] 📊 Użyto ${data.usage.total_tokens} tokenów (${data.usage.prompt_tokens} prompt + ${data.usage.completion_tokens} completion)`);
        }
        
        // Dodaj odpowiedź asystenta do kontekstu
        messages.push(assistantMessage);
        
        // Krok 3: Sprawdź czy GPT chce wywołać narzędzia
        if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
          console.log(`[AIQueryOrchestrator] 🔧 GPT chce wywołać ${assistantMessage.tool_calls.length} narzędzi:`);
          
          assistantMessage.tool_calls.forEach(tc => {
            console.log(`  - ${tc.function.name}`);
          });
          
          // Wykonaj wszystkie wywołania narzędzi równolegle
          const toolResults = await Promise.all(
            assistantMessage.tool_calls.map(async (toolCall) => {
              const functionName = toolCall.function.name;
              let functionArgs;
              
              try {
                functionArgs = JSON.parse(toolCall.function.arguments);
              } catch (parseError) {
                console.error(`[AIQueryOrchestrator] ❌ Błąd parsowania argumentów dla ${functionName}:`, parseError);
                return {
                  tool_call_id: toolCall.id,
                  role: 'tool',
                  name: functionName,
                  content: JSON.stringify({ 
                    error: 'Błąd parsowania argumentów',
                    details: parseError.message
                  })
                };
              }
              
              console.log(`[AIQueryOrchestrator] ⚙️ Wykonuję: ${functionName}`, functionArgs);
              
              const result = await ToolExecutor.executeFunction(functionName, functionArgs);
              
              if (result.success) {
                executedTools.push({
                  name: functionName,
                  arguments: functionArgs,
                  result: result.data,
                  executionTime: result.executionTime
                });
                
                console.log(`[AIQueryOrchestrator] ✅ ${functionName} wykonany w ${result.executionTime.toFixed(2)}ms`);
              } else {
                console.error(`[AIQueryOrchestrator] ❌ ${functionName} zakończył się błędem:`, result.error);
              }
              
              // Zwróć wynik do GPT
              return {
                tool_call_id: toolCall.id,
                role: 'tool',
                name: functionName,
                content: JSON.stringify(result.success ? result.data : { error: result.error })
              };
            })
          );
          
          // Dodaj wyniki narzędzi do kontekstu
          messages.push(...toolResults);
          
          // Kontynuuj kolejną rundę (GPT przetworzy wyniki i może wywołać więcej funkcji lub wygenerować odpowiedź)
          continue;
        }
        
        // Krok 4: Jeśli GPT nie wywołał narzędzi, mamy finalną odpowiedź
        if (assistantMessage.content) {
          finalResponse = assistantMessage.content;
          console.log('[AIQueryOrchestrator] ✅ Otrzymano finalną odpowiedź od GPT');
          console.log('[AIQueryOrchestrator] 📝 Treść odpowiedzi:', finalResponse.substring(0, 200) + '...');
          console.log('[AIQueryOrchestrator] 📏 Długość odpowiedzi:', finalResponse.length, 'znaków');
          break;
        }
        
        // Jeśli nie ma ani tool_calls ani content, coś poszło nie tak
        if (!assistantMessage.content && !assistantMessage.tool_calls) {
          console.warn('[AIQueryOrchestrator] ⚠️ GPT nie zwrócił ani odpowiedzi ani wywołań narzędzi');
          finalResponse = "Przepraszam, nie mogłem przetworzyć tego zapytania. Spróbuj przeformułować pytanie.";
          break;
        }
      }
      
      // Jeśli wyczerpaliśmy rundy bez odpowiedzi
      if (!finalResponse && currentRound >= maxRounds) {
        console.warn('[AIQueryOrchestrator] ⚠️ Osiągnięto maksymalną liczbę rund bez finalnej odpowiedzi');
        finalResponse = "Przepraszam, przetwarzanie tego zapytania wymaga zbyt wielu kroków. Spróbuj uprościć pytanie lub podzielić je na mniejsze części.";
      }
      
      const processingTime = performance.now() - startTime;
      
      console.log(`[AIQueryOrchestrator] 🎉 Zakończono w ${processingTime.toFixed(2)}ms`);
      console.log(`[AIQueryOrchestrator] 📊 Statystyki:`);
      console.log(`  - Rundy: ${currentRound}`);
      console.log(`  - Wykonane funkcje: ${executedTools.length}`);
      console.log(`  - Tokeny użyte: ${totalTokensUsed}`);
      
      if (executedTools.length > 0) {
        console.log('[AIQueryOrchestrator] 📋 Wykonane zapytania:');
        executedTools.forEach((tool, index) => {
          console.log(`  ${index + 1}. ${tool.name} (${tool.executionTime.toFixed(2)}ms)`);
        });
      }
      
      const result = {
        success: true,
        response: finalResponse,
        processingTime,
        executedTools,
        rounds: currentRound,
        tokensUsed: totalTokensUsed,
        method: 'ai_orchestrator',
        metadata: {
          dataSourcesQueried: [...new Set(executedTools.map(t => t.name))],
          totalQueries: executedTools.length,
          averageQueryTime: executedTools.length > 0 
            ? executedTools.reduce((sum, t) => sum + t.executionTime, 0) / executedTools.length 
            : 0
        }
      };
      
      console.log('[AIQueryOrchestrator] 🎁 Zwracam wynik:', {
        success: result.success,
        responseLength: result.response?.length,
        responsePreview: result.response?.substring(0, 100),
        executedTools: result.executedTools.length
      });
      
      return result;
      
    } catch (error) {
      console.error('[AIQueryOrchestrator] ❌ Błąd krytyczny:', error);
      
      const processingTime = performance.now() - startTime;
      
      return {
        success: false,
        error: error.message,
        processingTime,
        executedTools,
        rounds: 0,
        method: 'ai_orchestrator_error'
      };
    }
  }
  
  /**
   * Generuje system prompt dla GPT
   */
  static getSystemPrompt() {
    return `Jesteś zaawansowanym asystentem AI dla systemu MRP (Manufacturing Resource Planning) firmy BGW Pharma.

Twoje zadanie to:
1. Analizowanie zapytań użytkownika w języku polskim
2. Wywoływanie odpowiednich funkcji do pobrania TYLKO potrzebnych danych z bazy
3. Generowanie czytelnych, pomocnych odpowiedzi po polsku

DOSTĘPNE FUNKCJE (tools):
- query_recipes: receptury i przepisy
- query_inventory: stany magazynowe, partie, surowce
- query_production_tasks: zadania produkcyjne (MO)
- query_orders: zamówienia klientów (CO)
- query_purchase_orders: zamówienia zakupu (PO)
- aggregate_data: agregacje (suma, średnia, grupowanie)
- get_count: szybkie zliczanie (najszybsze!)
- get_customers: lista klientów
- get_suppliers: lista dostawców

WAŻNE ZASADY:
✅ ZAWSZE używaj filtrów aby pobrać TYLKO potrzebne dane
✅ Dla prostych pytań "ile jest..." użyj get_count (najszybsze)
✅ Ogranicz limit do minimum (nie pobieraj 1000 rekordów jeśli wystarczy 10)
✅ Jeśli nie jesteś pewien jakie dane potrzebne, wywołaj funkcję z podstawowymi parametrami
✅ Możesz wywoływać funkcje wielokrotnie jeśli potrzebujesz więcej danych
✅ Odpowiadaj ZAWSZE po polsku, używając polskiej terminologii

TERMINOLOGIA MRP:
- MO = Manufacturing Order = Zlecenie produkcyjne
- CO = Customer Order = Zamówienie klienta  
- PO = Purchase Order = Zamówienie zakupu
- Receptura = Przepis produkcyjny z listą składników
- Partia = Batch = Konkretna dostawa materiału z numerem partii
- Stan magazynowy = Inventory = Aktualna ilość w magazynie

FORMATOWANIE ODPOWIEDZI:
- Używaj emoji dla lepszej czytelności (📊 📦 🏭 ✅ ⚠️)
- Prezentuj dane w postaci list lub tabel
- Dodawaj podsumowania i insights
- Jeśli dane pokazują problem (niski stan, opóźnienia), zasugeruj działanie

Przykład dobrego workflow:
Zapytanie: "Ile mamy receptur o wadze ponad 900g?"
Krok 1: Wywołaj query_recipes({ calculateWeight: true, limit: 500 })
Krok 2: Przefiltruj wyniki i policz te > 900g
Krok 3: Wygeneruj odpowiedź z listą receptur

Pamiętaj: Twoim celem jest dostarczenie DOKŁADNYCH danych w sposób SZYBKI i EFEKTYWNY!`;
  }
  
  /**
   * Sprawdza czy orchestrator powinien obsłużyć zapytanie
   * (używane do decyzji czy użyć orchestratora czy standardowego systemu)
   */
  static shouldHandle(query) {
    // Orchestrator może obsłużyć prawie wszystkie zapytania o dane
    // Jedyny wyjątek to zapytania wymagające attachmentów (dokumenty, zdjęcia)
    
    const lowerQuery = query.toLowerCase();
    
    // Nie obsługuj zapytań o analizę załączników
    if (lowerQuery.includes('załącznik') || 
        lowerQuery.includes('dokument') || 
        lowerQuery.includes('zdjęcie') ||
        lowerQuery.includes('plik')) {
      return false;
    }
    
    // Nie obsługuj zapytań stricte konwersacyjnych
    const conversationalPatterns = [
      /^(cześć|hej|witaj|dzień dobry|dobry wieczór)/i,
      /^(dziękuję|dzięki|thx|thanks)/i,
      /^(jak się masz|co słychać)/i
    ];
    
    if (conversationalPatterns.some(pattern => pattern.test(lowerQuery))) {
      return false;
    }
    
    // Obsługuj wszystkie inne zapytania
    return true;
  }
  
  /**
   * Szacuje koszt wykonania zapytania (w USD)
   */
  static estimateCost(tokensUsed, model = 'gpt-4o') {
    // Ceny OpenAI (stan na 2024)
    const pricing = {
      'gpt-4o': { input: 0.005, output: 0.015 },  // na 1K tokenów
      'gpt-4o-mini': { input: 0.00015, output: 0.00060 }
    };
    
    const prices = pricing[model] || pricing['gpt-4o'];
    
    // Uproszczone - przyjmujemy 50/50 split input/output
    const avgPrice = (prices.input + prices.output) / 2;
    return (tokensUsed / 1000) * avgPrice;
  }
}

