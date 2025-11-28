// src/services/documentOcrService.js
/**
 * Serwis do przetwarzania dokumentów (WZ, faktury) za pomocą Gemini Vision API
 * Używany bezpośrednio w formularzu PO, bez przechodzenia przez Asystenta AI
 */

import { getGeminiApiKey } from './aiAssistantService';

// Bazowy URL API Gemini - model jest dodawany dynamicznie
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

// Dostępne modele dla Vision (w kolejności preferencji)
const VISION_MODELS = [
  'gemini-2.0-flash-exp',  // Darmowy, eksperymentalny - dobry do OCR
  'gemini-1.5-flash-latest', // Szybki, tani
  'gemini-1.5-pro-latest'    // Fallback
];

/**
 * Obsługiwane typy MIME
 */
export const SUPPORTED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf'
];

/**
 * Maksymalny rozmiar pliku (20MB)
 */
export const MAX_FILE_SIZE = 20 * 1024 * 1024;

/**
 * Konwertuje File na base64
 */
const fileToBase64 = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      // Usuń prefix "data:...;base64,"
      const base64 = reader.result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

/**
 * Waliduje plik przed przetwarzaniem
 */
export const validateFile = (file) => {
  if (!file) {
    return { valid: false, error: 'Nie wybrano pliku' };
  }
  
  if (!SUPPORTED_MIME_TYPES.includes(file.type)) {
    return { 
      valid: false, 
      error: `Nieobsługiwany format pliku: ${file.type}. Dozwolone: JPG, PNG, WEBP, PDF` 
    };
  }
  
  if (file.size > MAX_FILE_SIZE) {
    return { 
      valid: false, 
      error: `Plik za duży: ${(file.size / 1024 / 1024).toFixed(2)}MB. Maksymalny rozmiar: 20MB` 
    };
  }
  
  return { valid: true };
};

/**
 * Wywołuje Gemini Vision API z dokumentem
 * Próbuje różne modele w przypadku błędów
 */
const callGeminiVision = async (apiKey, base64Data, mimeType, prompt) => {
  const requestBody = {
    contents: [{
      parts: [
        {
          inline_data: {
            mime_type: mimeType,
            data: base64Data
          }
        },
        {
          text: prompt
        }
      ]
    }],
    generationConfig: {
      temperature: 0.1, // Niska temperatura dla precyzyjnych danych
      topK: 32,
      topP: 1,
      maxOutputTokens: 8192
    }
  };

  // Próbuj każdy model z listy
  let lastError = null;
  
  for (const model of VISION_MODELS) {
    try {
      console.log(`[callGeminiVision] Próbuję model: ${model}`);
      
      const response = await fetch(`${GEMINI_API_BASE}/${model}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        const errorMsg = error.error?.message || `Status: ${response.status}`;
        console.warn(`[callGeminiVision] Model ${model} niedostępny: ${errorMsg}`);
        lastError = new Error(errorMsg);
        continue; // Spróbuj następny model
      }

      const result = await response.json();
      const textResponse = result.candidates?.[0]?.content?.parts?.[0]?.text;
      
      if (!textResponse) {
        console.warn(`[callGeminiVision] Model ${model} zwrócił pustą odpowiedź`);
        lastError = new Error('Gemini nie zwrócił odpowiedzi tekstowej');
        continue;
      }
      
      console.log(`[callGeminiVision] ✅ Sukces z modelem: ${model}`);
      return textResponse;
      
    } catch (error) {
      console.warn(`[callGeminiVision] Błąd z modelem ${model}:`, error.message);
      lastError = error;
    }
  }
  
  // Jeśli żaden model nie zadziałał
  throw new Error(`Błąd Gemini API: ${lastError?.message || 'Wszystkie modele niedostępne'}`);
};

/**
 * Wyciąga JSON z odpowiedzi Gemini
 */
const extractJsonFromResponse = (response) => {
  // Szukaj bloku JSON w odpowiedzi
  const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/);
  if (jsonMatch) {
    return JSON.parse(jsonMatch[1]);
  }
  
  // Próbuj bezpośrednio parsować odpowiedź
  const directMatch = response.match(/\{[\s\S]*\}/);
  if (directMatch) {
    return JSON.parse(directMatch[0]);
  }
  
  throw new Error('Nie udało się wyciągnąć danych JSON z odpowiedzi');
};

/**
 * Przetwarza dokument dostawy (WZ) i wyciąga dane
 * @param {File} file - Plik obrazu lub PDF
 * @param {Array} poItems - Lista pozycji z PO do dopasowania
 * @param {string} userId - ID użytkownika (do pobrania klucza API)
 * @returns {Promise<Object>} - Wyciągnięte dane z dokumentu
 */
export const parseDeliveryDocument = async (file, poItems = [], userId) => {
  // Walidacja
  const validation = validateFile(file);
  if (!validation.valid) {
    throw new Error(validation.error);
  }
  
  // Pobierz klucz API
  const apiKey = await getGeminiApiKey(userId);
  if (!apiKey) {
    throw new Error('Brak klucza API Gemini. Skonfiguruj klucz w ustawieniach systemu.');
  }
  
  // Konwertuj plik na base64
  const base64Data = await fileToBase64(file);
  
  // Przygotuj kontekst pozycji PO
  const poContext = poItems.length > 0 
    ? `\nKONTEKST - Pozycje z zamówienia zakupowego do dopasowania:\n${JSON.stringify(
        poItems.map(item => ({
          id: item.id,
          name: item.name,
          orderedQuantity: item.quantity,
          unit: item.unit
        })), null, 2
      )}\n`
    : '';
  
  const prompt = `Przeanalizuj ten dokument dostawy (WZ / Delivery Note / Packing List) i wyciągnij informacje o dostarczonych produktach.
${poContext}
ZADANIE: Dla każdego produktu na dokumencie znajdź:
1. Nazwę produktu
2. Dostarczoną ilość
3. Jednostkę
4. Numer partii/LOT (jeśli podany)
5. Datę ważności (jeśli podana)

ZWRÓĆ DANE W FORMACIE JSON:
\`\`\`json
{
  "documentType": "delivery_note",
  "documentNumber": "numer dokumentu WZ",
  "deliveryDate": "YYYY-MM-DD",
  "supplier": "nazwa dostawcy",
  "items": [
    {
      "documentProductName": "nazwa produktu z dokumentu",
      "matchedPoItemId": "id pozycji PO jeśli dopasowano lub null",
      "matchedPoItemName": "nazwa dopasowanej pozycji PO lub null",
      "matchConfidence": 0.95,
      "deliveredQuantity": 100,
      "unit": "kg",
      "lotNumber": "LOT123",
      "expiryDate": "YYYY-MM-DD lub null",
      "notes": "dodatkowe uwagi"
    }
  ],
  "totalItems": 5,
  "parseConfidence": 0.9,
  "warnings": []
}
\`\`\`

WAŻNE ZASADY:
- Jeśli dane są nieczytelne, ustaw confidence < 0.5
- Daty w formacie YYYY-MM-DD
- Ilości jako liczby (bez jednostek)
- Dopasuj produkty do pozycji PO jeśli podano kontekst
- matchConfidence: 1.0 = pewne dopasowanie, 0.5 = niepewne, null = nie dopasowano`;

  try {
    const response = await callGeminiVision(apiKey, base64Data, file.type, prompt);
    const data = extractJsonFromResponse(response);
    
    return {
      success: true,
      data: data,
      rawResponse: response
    };
  } catch (error) {
    console.error('[parseDeliveryDocument] Błąd:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * Przetwarza fakturę i wyciąga dane
 * @param {File} file - Plik obrazu lub PDF
 * @param {Array} poItems - Lista pozycji z PO do dopasowania
 * @param {string} userId - ID użytkownika
 * @returns {Promise<Object>} - Wyciągnięte dane z faktury
 */
export const parseInvoice = async (file, poItems = [], userId) => {
  // Walidacja
  const validation = validateFile(file);
  if (!validation.valid) {
    throw new Error(validation.error);
  }
  
  // Pobierz klucz API
  const apiKey = await getGeminiApiKey(userId);
  if (!apiKey) {
    throw new Error('Brak klucza API Gemini. Skonfiguruj klucz w ustawieniach systemu.');
  }
  
  // Konwertuj plik na base64
  const base64Data = await fileToBase64(file);
  
  // Przygotuj kontekst pozycji PO
  const poContext = poItems.length > 0 
    ? `\nKONTEKST - Pozycje z zamówienia zakupowego do dopasowania:\n${JSON.stringify(
        poItems.map(item => ({
          id: item.id,
          name: item.name,
          orderedQuantity: item.quantity,
          unit: item.unit,
          currentUnitPrice: item.unitPrice
        })), null, 2
      )}\n`
    : '';
  
  const prompt = `Analyze this invoice/proforma invoice document and extract ALL data.
${poContext}
TASK: Extract:
1. Invoice header data (document number, dates, supplier)
2. ALL line items with prices, quantities, VAT rates
3. Summary totals

CRITICAL: You MUST extract numeric values for ALL fields. Look for:
- "Document Number" or "Invoice Number" field in the header
- "KG" or "Qty" column = quantity
- "Price" column = unit price (net)
- "VAT %" column = VAT rate (0 means 0%, not missing!)
- "Total" column = gross amount per line
- "Pack Size" may indicate packaging, not quantity

RETURN JSON in this EXACT format:
\`\`\`json
{
  "documentType": "invoice",
  "invoiceNumber": "EXACT number from document",
  "invoiceDate": "YYYY-MM-DD",
  "dueDate": "YYYY-MM-DD or null",
  "supplier": {
    "name": "supplier name",
    "taxId": "tax ID if visible",
    "address": "address"
  },
  "currency": "EUR",
  "items": [
    {
      "documentProductName": "exact product name from invoice",
      "matchedPoItemId": "ID from PO context if matched, else null",
      "matchedPoItemName": "name from PO context if matched, else null",
      "matchConfidence": 0.95,
      "quantity": 50,
      "unit": "kg",
      "unitPriceNet": 7.24,
      "vatRate": 0,
      "totalNet": 362.00,
      "totalGross": 362.00
    }
  ],
  "summary": {
    "totalNet": 362.00,
    "totalVat": 0.00,
    "totalGross": 362.00,
    "vatBreakdown": [
      { "rate": 0, "base": 362.00, "amount": 0.00 }
    ]
  },
  "paymentMethod": "transfer",
  "bankAccount": "account number or null",
  "parseConfidence": 0.9,
  "warnings": []
}
\`\`\`

IMPORTANT RULES:
- quantity MUST be a NUMBER (e.g., 50, not "50 kg")
- unit MUST be a STRING (e.g., "kg", "pcs", "szt")
- unitPriceNet MUST be a NUMBER (the price per unit)
- vatRate MUST be a NUMBER (0, 5, 8, 23 - NOT a string, NOT a percentage symbol)
- ALL numeric fields must be NUMBERS, not strings
- If VAT is 0% or document says "not a VAT invoice", set vatRate to 0
- Match products to PO items by comparing names
- Dates in YYYY-MM-DD format`;

  try {
    console.log('[parseInvoice] 📄 Wysyłam fakturę do analizy...');
    const response = await callGeminiVision(apiKey, base64Data, file.type, prompt);
    console.log('[parseInvoice] 📝 Surowa odpowiedź:', response);
    
    const data = extractJsonFromResponse(response);
    console.log('[parseInvoice] ✅ Sparsowane dane:', JSON.stringify(data, null, 2));
    
    // Walidacja wymaganych pól
    if (data.items && Array.isArray(data.items)) {
      data.items.forEach((item, idx) => {
        console.log(`[parseInvoice] 📦 Pozycja ${idx + 1}:`, {
          name: item.documentProductName,
          quantity: item.quantity,
          unit: item.unit,
          unitPriceNet: item.unitPriceNet,
          vatRate: item.vatRate,
          totalNet: item.totalNet,
          totalGross: item.totalGross
        });
      });
    }
    
    return {
      success: true,
      data: data,
      rawResponse: response
    };
  } catch (error) {
    console.error('[parseInvoice] ❌ Błąd:', error);
    console.error('[parseInvoice] Szczegóły:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * Dopasowuje wyciągnięte pozycje do pozycji PO
 * @param {Array} extractedItems - Pozycje z dokumentu
 * @param {Array} poItems - Pozycje z PO
 * @returns {Array} - Pozycje z dopasowaniami
 */
export const matchItemsToPO = (extractedItems, poItems) => {
  return extractedItems.map(item => {
    // Jeśli już dopasowano przez AI
    if (item.matchedPoItemId) {
      const poItem = poItems.find(p => p.id === item.matchedPoItemId);
      if (poItem) {
        return {
          ...item,
          poItem: poItem,
          matchType: 'ai'
        };
      }
    }
    
    // Spróbuj dopasować po nazwie
    const productName = item.documentProductName?.toLowerCase() || '';
    
    // Dokładne dopasowanie
    let match = poItems.find(p => 
      p.name?.toLowerCase() === productName
    );
    
    // Częściowe dopasowanie
    if (!match) {
      match = poItems.find(p => {
        const poName = p.name?.toLowerCase() || '';
        return poName.includes(productName) || productName.includes(poName);
      });
    }
    
    if (match) {
      return {
        ...item,
        matchedPoItemId: match.id,
        matchedPoItemName: match.name,
        poItem: match,
        matchType: 'name',
        matchConfidence: item.matchConfidence || 0.7
      };
    }
    
    return {
      ...item,
      matchType: 'none',
      matchConfidence: 0
    };
  });
};

/**
 * Przygotowuje aktualizacje dla pozycji PO na podstawie danych z WZ
 */
export const prepareDeliveryUpdates = (matchedItems, options = {}) => {
  const updates = [];
  
  for (const item of matchedItems) {
    if (!item.poItem || item.matchType === 'none') continue;
    
    const update = {
      itemId: item.poItem.id,
      itemName: item.poItem.name,
      matchConfidence: item.matchConfidence,
      changes: {}
    };
    
    // Ilość dostarczona - zapisz jako received i zaktualizuj quantity
    if (item.deliveredQuantity !== undefined) {
      const deliveredQty = parseFloat(item.deliveredQuantity);
      const currentReceived = parseFloat(item.poItem.received || 0);
      update.changes.received = currentReceived + deliveredQty;
      update.changes.receivedDelta = deliveredQty;
      // Aktualizuj też quantity (ilość zamówiona) na podstawie dostawy
      update.changes.quantity = deliveredQty;
    }
    
    // Jednostka
    if (item.unit) {
      update.changes.unit = item.unit;
    }
    
    // Numer partii
    if (item.lotNumber) {
      update.changes.lotNumber = item.lotNumber;
    }
    
    // Data ważności
    if (item.expiryDate) {
      update.changes.expiryDate = item.expiryDate;
    }
    
    updates.push(update);
  }
  
  return updates;
};

/**
 * Przygotowuje aktualizacje dla pozycji PO na podstawie danych z faktury
 */
export const prepareInvoiceUpdates = (matchedItems, invoiceData, options = {}) => {
  const updates = [];
  
  for (const item of matchedItems) {
    if (!item.poItem || item.matchType === 'none') continue;
    
    const update = {
      itemId: item.poItem.id,
      itemName: item.poItem.name,
      matchConfidence: item.matchConfidence,
      changes: {}
    };
    
    // Ilość z faktury
    if (item.quantity !== undefined) {
      update.changes.quantity = parseFloat(item.quantity);
    }
    
    // Jednostka
    if (item.unit) {
      update.changes.unit = item.unit;
    }
    
    // Cena jednostkowa netto
    if (item.unitPriceNet !== undefined) {
      update.changes.unitPrice = parseFloat(item.unitPriceNet);
    }
    
    // Stawka VAT
    if (item.vatRate !== undefined) {
      update.changes.vatRate = parseFloat(item.vatRate);
    }
    
    // Waluta z faktury (będzie przekazana przez invoiceInfo)
    
    updates.push(update);
  }
  
  // Dodaj walutę do invoiceInfo
  const invoiceInfo = {
    invoiceNumber: invoiceData.invoiceNumber,
    invoiceDate: invoiceData.invoiceDate,
    dueDate: invoiceData.dueDate,
    totalNet: invoiceData.summary?.totalNet,
    totalVat: invoiceData.summary?.totalVat,
    totalGross: invoiceData.summary?.totalGross,
    currency: invoiceData.currency, // Waluta z faktury
    paymentMethod: invoiceData.paymentMethod,
    bankAccount: invoiceData.bankAccount
  };
  
  return { updates, invoiceInfo };
};

