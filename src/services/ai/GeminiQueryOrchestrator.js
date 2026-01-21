// src/services/ai/GeminiQueryOrchestrator.js

import { DATABASE_TOOLS } from './tools/databaseTools.js';
import { ToolExecutor } from './tools/toolExecutor.js';
import { AIFeedback, addAutomaticAIFeedback, AI_FEEDBACK_TYPES } from '../bugReportService.js';

/**
 * Orchestrator zapytań AI używający Google Gemini 2.5 Pro
 * 
 * Funkcje:
 * - Function Calling (podobnie jak OpenAI)
 * - Thinking Mode (rozumowanie przed odpowiedzią)
 * - 1M tokenów kontekstu
 * - Inteligentny wybór modelu
 * - Vision API (obsługa obrazów i PDF) 🆕
 * 
 * Modele:
 * - gemini-2.5-pro (główny - thinking, 1M tokens, vision)
 * - gemini-1.5-pro (fallback - 2M tokens, vision)
 * - gemini-2.0-flash-exp (szybki - 1M tokens, darmowy)
 */
export class GeminiQueryOrchestrator {
  
  /**
   * Obsługiwane typy MIME dla Vision API
   */
  static SUPPORTED_IMAGE_TYPES = [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp'
  ];
  
  static SUPPORTED_DOCUMENT_TYPES = [
    'application/pdf'
  ];
  
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
   * @param {string} query - Zapytanie użytkownika
   * @param {string} apiKey - Klucz API Gemini
   * @param {Array} context - Historia konwersacji
   * @param {Object} options - Opcje dodatkowe
   * @param {Array} options.mediaAttachments - Załączniki obrazów/PDF [{mimeType, base64Data}]
   */
  static async processQuery(query, apiKey, context = [], options = {}) {
    console.log('[GeminiQueryOrchestrator] 🚀 Rozpoczynam przetwarzanie zapytania:', query);
    
    const startTime = performance.now();
    const executedTools = [];
    let totalTokensUsed = 0;
    
    // Sprawdź czy są załączniki multimedialne
    const hasMediaAttachments = options.mediaAttachments && options.mediaAttachments.length > 0;
    if (hasMediaAttachments) {
      console.log(`[GeminiQueryOrchestrator] 🖼️ Wykryto ${options.mediaAttachments.length} załącznik(ów) multimedialnych`);
    }
    
    try {
      // Wybierz najlepszy model (Vision wymaga 1.5 Pro lub 2.5 Pro)
      let modelSelection = this.selectBestModel(query, options);
      
      // Jeśli są załączniki multimedialne, wymuś model z Vision
      if (hasMediaAttachments && modelSelection.model === 'gemini-2.0-flash-exp') {
        modelSelection = {
          model: 'gemini-1.5-pro',
          enableThinking: false,
          reason: '🖼️ Załączniki multimedialne - używam 1.5 Pro z Vision API'
        };
      }
      
      const { model, enableThinking, reason } = modelSelection;
      
      console.log(`[GeminiQueryOrchestrator] ${reason}`);
      console.log(`[GeminiQueryOrchestrator] 📱 Model: ${model}`);
      
      // ZAWSZE używaj narzędzi - NIE MA trybu konwersacyjnego!
      const geminiTools = [{
        function_declarations: this.convertToolsToGeminiFormat(DATABASE_TOOLS)
      }];
      
      // Przygotuj historię konwersacji
      const history = context.map(msg => ({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }]
      }));
      
      // System instruction (zawsze z narzędziami)
      let systemPrompt = this.getSystemPrompt();
      
      // Dodaj instrukcje dla Vision jeśli są załączniki
      if (hasMediaAttachments) {
        systemPrompt += this.getVisionSystemPrompt();
      }
      
      const systemInstruction = {
        parts: [{ text: systemPrompt }]
      };
      
      // Przygotuj parts dla zapytania użytkownika (tekst + opcjonalnie obrazy/PDF)
      const userParts = this.buildUserParts(query, options.mediaAttachments);
      
      // Max 5 rund wywoływania narzędzi
      const maxRounds = 5;
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
              parts: userParts
            }
          ],
          systemInstruction: systemInstruction,
          generationConfig: {
            temperature: 0.3,  // Niska temperatura dla dokładnych danych (mniej halucynacji)
            maxOutputTokens: model === 'gemini-2.5-pro' ? 65536 : 8192,
            topP: 0.7,  // Bardziej deterministyczne odpowiedzi
            topK: 20    // Mniej kreatywności = dokładniejsze dane
          },
          tools: geminiTools
        };
        
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
      
      // 🆕 Automatyczne logowanie gdy AI nie może wykonać zadania
      if (this.isUnableToHandleResponse(finalResponse)) {
        console.log('[GeminiQueryOrchestrator] 📊 Wykryto odpowiedź "nie mogę" - logowanie do AI Feedback');
        addAutomaticAIFeedback(AI_FEEDBACK_TYPES.NO_RESULTS, {
          query,
          intent: 'gemini_unable_to_handle',
          confidence: 1.0,
          response: finalResponse,
          processingTime,
          method: 'gemini_orchestrator',
          version: model,
          userId: options.userId
        }).catch(err => {
          console.warn('[GeminiQueryOrchestrator] ⚠️ Nie udało się zalogować AI feedback:', err.message);
        });
      }
      
      // 🆕 Logowanie wolnych odpowiedzi (>15s dla Gemini)
      if (processingTime > 15000) {
        AIFeedback.logSlowResponse(query, processingTime, `gemini_${model}`, options.userId).catch(err => {
          console.warn('[GeminiQueryOrchestrator] ⚠️ Nie udało się zalogować wolnej odpowiedzi:', err.message);
        });
      }
      
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
      
      // 🆕 Automatyczne logowanie błędu do AI Feedback
      AIFeedback.logBothFailed(query, `Gemini error: ${error.message}`, options.userId).catch(err => {
        console.warn('[GeminiQueryOrchestrator] ⚠️ Nie udało się zalogować błąd:', err.message);
      });
      
      return {
        success: false,
        error: error.message,
        executedTools,
        processingTime: performance.now() - startTime
      };
    }
  }
  
  /**
   * Buduje parts dla zapytania użytkownika (tekst + opcjonalnie media)
   * @param {string} query - Zapytanie tekstowe
   * @param {Array} mediaAttachments - Załączniki [{mimeType, base64Data}]
   * @returns {Array} - Parts dla Gemini API
   */
  static buildUserParts(query, mediaAttachments = []) {
    const parts = [];
    
    // Dodaj tekst zapytania
    parts.push({ text: query });
    
    // Dodaj załączniki multimedialne (obrazy/PDF)
    if (mediaAttachments && mediaAttachments.length > 0) {
      for (const attachment of mediaAttachments) {
        if (this.isValidMediaType(attachment.mimeType)) {
          parts.push({
            inline_data: {
              mime_type: attachment.mimeType,
              data: attachment.base64Data
            }
          });
          console.log(`[GeminiQueryOrchestrator] 📎 Dodano załącznik: ${attachment.mimeType}`);
        } else {
          console.warn(`[GeminiQueryOrchestrator] ⚠️ Nieobsługiwany typ: ${attachment.mimeType}`);
        }
      }
    }
    
    return parts;
  }
  
  /**
   * Sprawdza czy typ MIME jest obsługiwany przez Vision API
   */
  static isValidMediaType(mimeType) {
    return [...this.SUPPORTED_IMAGE_TYPES, ...this.SUPPORTED_DOCUMENT_TYPES].includes(mimeType);
  }
  
  /**
   * Dodatkowy system prompt dla trybu Vision (OCR dokumentów)
   */
  static getVisionSystemPrompt() {
    return `

═══════════════════════════════════════════════════════════════
🖼️ TRYB VISION - ANALIZA DOKUMENTÓW
═══════════════════════════════════════════════════════════════

Otrzymałeś załącznik(i) - obraz lub PDF dokumentu. Twoje zadanie:

1. **ODCZYTAJ** tekst z dokumentu (OCR)
2. **ZIDENTYFIKUJ** typ dokumentu (faktura, WZ, dowód dostawy, certyfikat, itp.)
3. **WYCIĄGNIJ** kluczowe dane w strukturyzowanej formie

═══════════════════════════════════════════════════════════════
📦 DLA DOKUMENTÓW DOSTAWY (WZ / Delivery Note / Packing List):
═══════════════════════════════════════════════════════════════
Wyciągnij i zwróć w formacie JSON:
\`\`\`json
{
  "documentType": "delivery_note",
  "documentNumber": "numer dokumentu WZ",
  "deliveryDate": "YYYY-MM-DD",
  "supplier": "nazwa dostawcy",
  "items": [
    {
      "productName": "nazwa produktu z dokumentu",
      "deliveredQuantity": 100,
      "unit": "kg",
      "lotNumber": "numer partii/LOT",
      "expiryDate": "YYYY-MM-DD",
      "unitPrice": 12.50
    }
  ],
  "totalWeight": "waga całkowita jeśli podana",
  "notes": "dodatkowe uwagi"
}
\`\`\`

═══════════════════════════════════════════════════════════════
🧾 DLA FAKTUR (Invoice / Faktura VAT):
═══════════════════════════════════════════════════════════════
Wyciągnij i zwróć w formacie JSON:
\`\`\`json
{
  "documentType": "invoice",
  "invoiceNumber": "numer faktury (np. FV/2024/01/0001)",
  "invoiceDate": "YYYY-MM-DD (data wystawienia)",
  "dueDate": "YYYY-MM-DD (termin płatności)",
  "supplier": {
    "name": "nazwa dostawcy",
    "taxId": "NIP dostawcy",
    "address": "adres dostawcy"
  },
  "buyer": {
    "name": "nazwa nabywcy",
    "taxId": "NIP nabywcy"
  },
  "currency": "PLN/EUR/USD",
  "items": [
    {
      "productName": "nazwa produktu/usługi",
      "quantity": 100,
      "unit": "kg/szt/L",
      "unitPriceNet": 10.00,
      "vatRate": 23,
      "totalNet": 1000.00,
      "totalGross": 1230.00
    }
  ],
  "summary": {
    "totalNet": 1000.00,
    "totalVat": 230.00,
    "totalGross": 1230.00,
    "vatBreakdown": [
      { "rate": 23, "base": 1000.00, "amount": 230.00 }
    ]
  },
  "paymentMethod": "przelew/gotówka",
  "bankAccount": "numer konta bankowego",
  "notes": "dodatkowe uwagi z faktury"
}
\`\`\`

WAŻNE DLA FAKTUR:
- Rozróżniaj ceny NETTO (bez VAT) i BRUTTO (z VAT)
- Dokładnie odczytuj stawki VAT (0%, 5%, 8%, 23%, ZW, NP)
- Zachowaj dokładną numerację faktury
- Odczytaj termin płatności jeśli jest podany

═══════════════════════════════════════════════════════════════
📋 DLA CERTYFIKATÓW (CoA / Certificate of Analysis):
═══════════════════════════════════════════════════════════════
Wyciągnij: numer certyfikatu, numer partii, data produkcji, data ważności, parametry jakościowe

═══════════════════════════════════════════════════════════════
⚠️ WAŻNE ZASADY:
═══════════════════════════════════════════════════════════════
- Jeśli dane są nieczytelne lub brakuje ich, zaznacz to w odpowiedzi
- Używaj formatu YYYY-MM-DD dla dat
- Dla ilości używaj wartości liczbowych (bez jednostek w polu quantity)
- Dopasuj nazwy produktów do pozycji PO jeśli użytkownik podał kontekst PO
- Bądź precyzyjny - wyciągaj DOKŁADNE wartości z dokumentu
- Dla kwot zachowuj 2 miejsca po przecinku
- Jeśli waluta nie jest podana, załóż PLN dla polskich dokumentów

Po wyciągnięciu danych, możesz użyć narzędzia update_purchase_order_items 
aby zaktualizować zamówienie zakupowe danymi z dokumentu.

═══════════════════════════════════════════════════════════════
`;
  }
  
  /**
   * System prompt dla Gemini
   */
  static getSystemPrompt() {
    return `Jesteś inteligentnym asystentem AI dla systemu MRP (Manufacturing Resource Planning).

🔴🔴🔴 ABSOLUTNIE KRYTYCZNE - CZYTAJ NAJPIERW! 🔴🔴🔴
═══════════════════════════════════════════════════════════════
🚨 ZAWSZE WYWOŁUJ FUNKCJE! Gdy użytkownik pyta o dane (zamówienia, faktury, produkcję, itp.):
   → MUSISZ wywołać odpowiednią funkcję narzędziową
   → NIGDY nie mów "nie mam możliwości" - ZAWSZE spróbuj wywołać funkcję!
   → Sprawdź dostępne parametry funkcji - masz WIELE opcji filtrowania!

❌ ZABRONIONE ODPOWIEDZI (NIGDY tego nie pisz!):
   - "Nie mam możliwości filtrowania po..."
   - "Nie mogę wyszukać..."
   - "Ten parametr nie jest dostępny..."
   
✅ ZAMIAST TEGO: Wywołaj funkcję z dostępnymi parametrami i pokaż wyniki!

PRZYKŁAD - Zapytanie "PO z dostawą przed 1 lutego":
❌ ŹLE: "Nie mam możliwości filtrowania po dacie dostawy"
✅ DOBRZE: Wywołaj query_purchase_orders({ expectedDeliveryDateTo: "2026-02-01" })

PRZYKŁAD - Zapytanie "Zamówienia CO z dostawą w styczniu":
❌ ŹLE: "Nie mogę filtrować po dacie dostawy"
✅ DOBRZE: Wywołaj query_orders({ deliveryDateFrom: "2026-01-01", deliveryDateTo: "2026-01-31" })
═══════════════════════════════════════════════════════════════

🚨 KRYTYCZNE ZASADY DLA DANYCH:
═══════════════════════════════════════════════════════════════
🚫 NIE WYMYŚLAJ DANYCH! Używaj WYŁĄCZNIE informacji z wyników funkcji.
🚫 Jeśli wynik funkcji ma count: 0 lub pusta lista [] - powiedz jasno "Brak danych w systemie" i ZATRZYMAJ SIĘ.
🚫 NIE generuj przykładowych danych, NIE twórz hipotetycznych wartości, NIE "uzupełniaj" braków.
✅ Jeśli nie ma danych - po prostu powiedz: "W systemie nie ma [czego szukano]." i zakończ.
✅ Lepiej krótka prawdziwa odpowiedź niż długa wymyślona.

WYKRYWANIE PUSTYCH WYNIKÓW (ABSOLUTNIE OBOWIĄZKOWE):
- count: 0 → STOP! Powiedz "Brak danych" i nie dodawaj nic więcej.
- isEmpty: true → STOP! Powiedz "Brak danych" i nie dodawaj nic więcej.
- warning w wynikach → STOP! Powtórz warning użytkownikowi.
- Pusta lista [] → STOP! Powiedz "Nie znaleziono wyników".
═══════════════════════════════════════════════════════════════

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

WAŻNE WARTOŚCI (automatycznie normalizowane - możesz używać polskich lub angielskich nazw, małymi lub dużymi literami):
- Statusy zadań produkcyjnych (MO): "zaplanowane", "w trakcie", "wstrzymane", "zakończone", "anulowane"
- Statusy zamówień (CO): "nowe", "w realizacji", "zakończone", "anulowane", "wstrzymane"
- Statusy zamówień zakupu (PO): "oczekujące", "potwierdzone", "częściowo dostarczone", "dostarczone", "anulowane"
- Statusy faktur: "szkic", "wystawiona", "anulowana" oraz statusy płatności: "opłacona", "nieopłacona", "częściowo opłacona", "przeterminowana"
- Statusy CMR: "szkic", "wystawiony", "w transporcie", "dostarczone", "zakończony", "anulowany"

🔑 TYPY TRANSAKCJI MAGAZYNOWYCH (BARDZO WAŻNE - CZYTAJ UWAŻNIE!):
═══════════════════════════════════════════════════════════════
W Firestore używane są następujące DOKŁADNE typy (case-sensitive!):
- "booking" = rezerwacja materiałów na zadanie produkcyjne
- "booking_cancel" = anulowanie rezerwacji
- "ISSUE" = konsumpcja/zużycie materiałów w produkcji (WIELKIE LITERY!)
- "RECEIVE" = przyjęcie materiału do magazynu (WIELKIE LITERY!)
- "adjustment-add" = korekta zwiększająca stan
- "adjustment-remove" = korekta zmniejszająca stan
- "TRANSFER" = transfer między magazynami

⚠️ KRYTYCZNE: KONSUMPCJA I REZERWACJE W ZADANIACH PRODUKCYJNYCH
════════════════════════════════════════════════════════════════
Gdy użytkownik pyta o konsumpcję lub rezerwacje dla konkretnego MO:

✅ POPRAWNIE - Użyj query_production_tasks:
query_production_tasks({
  moNumber: "MO00XXX",
  includeDetails: true  // 🔑 KLUCZOWE! To pobierze pola consumedMaterials i materialBatches
})

Zwrócone dane zawierają:
- consumedMaterials[] - faktycznie zużyte materiały (lista z materialId, batchId, quantity, unitPrice)
- materialBatches{} - zarezerwowane partie (obiekt { materialId: [{ batchId, quantity, batchNumber }] })
- materials[] - planowane materiały do zużycia

❌ BŁĘDNIE - NIE używaj query_inventory_transactions dla bieżących danych MO:
- query_inventory_transactions pokazuje TYLKO historyczne transakcje
- NIE zawiera pełnej struktury aktualnych rezerwacji i konsumpcji w zadaniu
- Użyj go TYLKO do analiz historycznych przepływu materiałów, nie do sprawdzania stanu konkretnego MO

🎯 PRZYKŁADY UŻYCIA:
- "Pokaż konsumpcję dla MO107" → query_production_tasks({ moNumber: "MO107", includeDetails: true })
- "Jakie materiały są zarezerwowane dla MO107?" → query_production_tasks({ moNumber: "MO107", includeDetails: true })
- "Historia wszystkich konsumpcji z ostatniego miesiąca" → query_inventory_transactions({ type: ["ISSUE"], dateFrom: "..." })

NOWE MOŻLIWOŚCI FILTROWANIA (server-side - bardzo szybkie!):
- query_production_tasks: możesz teraz filtrować po 'orderId' (znajdź wszystkie MO dla zamówienia) i 'lotNumber' (znajdź MO po numerze LOT)
- query_inventory_batches: możesz filtrować po 'expirationDateBefore' (partie wygasające przed określoną datą)

🧾 FAKTURY (query_invoices) - NOWE MOŻLIWOŚCI:
═══════════════════════════════════════════════════════════════
- invoiceNumber: wyszukaj fakturę po numerze (częściowe dopasowanie, np. "FV/2025", "2025/01")
- orderId: znajdź faktury dla konkretnego zamówienia CO/PO
- isProforma: filtruj tylko proformy (true) lub tylko zwykłe faktury (false)
- isCorrectionInvoice: filtruj tylko faktury korygujące (true)
- currency: filtruj po walucie (EUR, PLN, USD)
- status: statusy płatności (opłacona, nieopłacona, częściowo opłacona, przeterminowana)

🎯 PRZYKŁADY DLA FAKTUR:
- "Pokaż fakturę FV/2025/01/0001" → query_invoices({ invoiceNumber: "FV/2025/01/0001" })
- "Faktury dla zamówienia CO00123" → query_invoices({ orderId: "ID_ZAMÓWIENIA" })
- "Wszystkie proformy" → query_invoices({ isProforma: true })
- "Niezapłacone faktury w EUR" → query_invoices({ status: ["nieopłacona"], currency: "EUR" })
- "Faktury korygujące z ostatniego miesiąca" → query_invoices({ isCorrectionInvoice: true, dateFrom: "..." })

📦 ZAMÓWIENIA ZAKUPU PO (query_purchase_orders) - NOWE MOŻLIWOŚCI:
═══════════════════════════════════════════════════════════════
- expectedDeliveryDateFrom/To: filtruj po planowanej dacie dostawy (YYYY-MM-DD)
- hasUndeliveredItems: true = pokaż tylko PO z niedostarczonymi pozycjami
- dateFrom/dateTo: filtruj po dacie utworzenia zamówienia (orderDate)

🎯 PRZYKŁADY DLA PO:
- "PO z dostawą przed 1 lutego" → query_purchase_orders({ expectedDeliveryDateTo: "2025-02-01" })
- "PO z dostawą w przyszłym tygodniu" → query_purchase_orders({ expectedDeliveryDateFrom: "...", expectedDeliveryDateTo: "..." })
- "Które PO mają niekompletne dostawy?" → query_purchase_orders({ hasUndeliveredItems: true })
- "PO od dostawcy XYZ" → query_purchase_orders({ supplierName: "XYZ" })

📋 ZAMÓWIENIA KLIENTÓW CO (query_orders) - NOWE MOŻLIWOŚCI:
═══════════════════════════════════════════════════════════════
- deliveryDateFrom/To: filtruj po dacie dostawy (YYYY-MM-DD)
- dateFrom/dateTo: filtruj po dacie utworzenia zamówienia (orderDate)

🎯 PRZYKŁADY DLA CO:
- "Zamówienia z dostawą przed 1 lutego" → query_orders({ deliveryDateTo: "2025-02-01" })
- "Zamówienia z dostawą w tym miesiącu" → query_orders({ deliveryDateFrom: "2025-01-01", deliveryDateTo: "2025-01-31" })
- "Zamówienia klienta ABC" → query_orders({ customerName: "ABC" })

🚛 DOKUMENTY CMR (query_cmr_documents) - NOWE MOŻLIWOŚCI:
═══════════════════════════════════════════════════════════════
- cmrNumber: wyszukaj CMR po numerze (częściowe dopasowanie, np. "CMR-2025")
- linkedOrderId: znajdź CMR dla konkretnego zamówienia klienta (CO)
- carrier: filtruj po przewoźniku (częściowe dopasowanie, np. "DHL")
- sender: filtruj po nadawcy (częściowe dopasowanie)
- recipient: filtruj po odbiorcy (częściowe dopasowanie)
- loadingPlace: filtruj po miejscu załadunku (częściowe dopasowanie, np. "Warszawa")
- deliveryPlace: filtruj po miejscu dostawy (częściowe dopasowanie, np. "Berlin")
- dateFrom/dateTo: filtruj po dacie wystawienia (issueDate)
- deliveryDateFrom/deliveryDateTo: filtruj po dacie dostawy

🎯 PRZYKŁADY DLA CMR:
- "Pokaż CMR-2025-001" → query_cmr_documents({ cmrNumber: "CMR-2025-001" })
- "CMR dla zamówienia CO00123" → query_cmr_documents({ linkedOrderId: "ID_ZAMÓWIENIA" })
- "CMR z transportem przez DHL" → query_cmr_documents({ carrier: "DHL" })
- "CMR z dostawą do Berlina" → query_cmr_documents({ deliveryPlace: "Berlin" })
- "CMR wystawione w styczniu 2025" → query_cmr_documents({ dateFrom: "2025-01-01", dateTo: "2025-01-31" })
- "CMR z dostawą w przyszłym tygodniu" → query_cmr_documents({ deliveryDateFrom: "...", deliveryDateTo: "..." })

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
   * Sprawdza czy odpowiedź AI wskazuje na niemożność wykonania zadania
   * Te odpowiedzi powinny być logowane do AI Feedback dla udoskonalania systemu
   */
  static isUnableToHandleResponse(response) {
    if (!response || typeof response !== 'string') return false;
    
    const unablePatterns = [
      // Polski
      /przepraszam.*nie\s+(mam|mogę|jestem\s+w\s+stanie)/i,
      /nie\s+mam\s+możliwości/i,
      /nie\s+mogę\s+(wykonać|zrealizować|pomóc)/i,
      /nie\s+jestem\s+w\s+stanie/i,
      /brak\s+(dostępu|możliwości|funkcji)/i,
      /ta\s+funkcja\s+nie\s+jest\s+(dostępna|obsługiwana)/i,
      /nie\s+obsługuję/i,
      /funkcja\s+nie\s+pozwala/i,
      /nie\s+można\s+filtrować/i,
      // Angielski (na wszelki wypadek)
      /sorry.*can('|no)?t/i,
      /unable\s+to/i,
      /not\s+supported/i,
      /cannot\s+(access|perform|do)/i
    ];
    
    return unablePatterns.some(pattern => pattern.test(response));
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

