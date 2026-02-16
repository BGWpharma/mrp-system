/**
 * Account Suggestion Service using Gemini AI
 * Suggests appropriate chart-of-accounts entries for invoice posting.
 *
 * Strategy:
 * 1. Filter accounts down to the most relevant ones for the invoice
 * 2. Build a concise prompt with invoice data + filtered accounts
 * 3. Call Gemini for structured JSON response
 * 4. Return suggested journal lines
 *
 * @module utils/accountSuggestionService
 */

const logger = require("firebase-functions/logger");
const {admin} = require("../config");

const GEMINI_API_BASE =
  "https://generativelanguage.googleapis.com/v1beta/models";

const GEMINI_MODELS = [
  "gemini-2.5-flash",
  "gemini-2.5-pro",
  "gemini-2.0-flash",
];

// ============================================================================
// ACCOUNT FILTERING - Select the most relevant accounts for the invoice
// ============================================================================

/**
 * Simple fuzzy matching: check if query words appear in target string.
 * @param {string} target - String to search in
 * @param {string} query - Search query
 * @return {number} Match score (0 = no match, higher = better)
 */
const fuzzyScore = (target, query) => {
  if (!target || !query) return 0;
  const t = target.toLowerCase().replace(/[^a-ząćęłńóśźż0-9\s]/g, " ");
  const q = query.toLowerCase().replace(/[^a-ząćęłńóśźż0-9\s]/g, " ");

  // Exact substring match
  if (t.includes(q)) return 100;

  // Word-level matching
  const queryWords = q.split(/\s+/).filter((w) => w.length > 2);
  if (queryWords.length === 0) return 0;

  let matchedWords = 0;
  for (const word of queryWords) {
    if (t.includes(word)) matchedWords++;
  }

  return (matchedWords / queryWords.length) * 80;
};

/**
 * Filter accounts relevant to an invoice.
 * Selects the most relevant accounts from the chart of accounts.
 *
 * @param {Array} allAccounts - All accounts from Firestore
 * @param {Object} invoiceData - Invoice data
 * @param {string} invoiceData.supplierName - Supplier/customer name
 * @param {string} invoiceData.currency - Invoice currency
 * @param {string} invoiceData.invoiceType - "purchase", "expense", or "sales"
 * @param {Array<string>} invoiceData.items - Item names/descriptions
 * @return {Array} Filtered accounts
 */
const filterRelevantAccounts = (allAccounts, invoiceData) => {
  const {supplierName, currency, invoiceType, items = []} = invoiceData;
  const selected = new Map(); // accountNumber -> account (dedup)

  const add = (account) => {
    if (!selected.has(account.accountNumber)) {
      selected.set(account.accountNumber, account);
    }
  };

  // ---- 1. Supplier accounts: 202-2-1-* (match by name) ----
  const supplierAccounts = allAccounts
      .filter((a) => a.accountNumber.startsWith("202-2-1-"))
      .map((a) => ({...a, _score: fuzzyScore(a.accountName, supplierName)}))
      .sort((a, b) => b._score - a._score);

  // Best matches (score > 30) or top 15
  const supplierMatches = supplierAccounts.filter((a) => a._score > 30);
  if (supplierMatches.length > 0) {
    supplierMatches.slice(0, 10).forEach(add);
  } else {
    supplierAccounts.slice(0, 15).forEach(add);
  }

  // Also include parent accounts 202, 202-2, 202-2-1
  allAccounts
      .filter((a) =>
        a.accountNumber === "202" ||
      a.accountNumber === "202-1" ||
      a.accountNumber === "202-2" ||
      a.accountNumber === "202-2-1",
      )
      .forEach(add);

  // ---- 2. Receivable accounts 201-* (for sales / refaktury / credit notes) ----
  allAccounts
      .filter((a) => a.accountNumber.startsWith("201"))
      .forEach(add);

  // ---- 3. Cost accounts: 4xx ----
  allAccounts
      .filter((a) => /^4\d{2}/.test(a.accountNumber))
      .forEach(add);

  // ---- 4. VAT accounts: 221-*, 222, 224 ----
  allAccounts
      .filter((a) =>
        a.accountNumber.startsWith("221") ||
      a.accountNumber.startsWith("222") ||
      a.accountNumber.startsWith("224") ||
      a.accountNumber === "220" ||
      a.accountNumber.startsWith("220-"),
      )
      .forEach(add);

  // ---- 5. Currency-specific accounts (if not PLN) ----
  if (currency && currency !== "PLN") {
    allAccounts
        .filter((a) => a.currency === currency)
        .slice(0, 20)
        .forEach(add);
  }

  // ---- 6. Settlement accounts: 301-*, 302-*, 303-* (purchase settlements) ----
  if (invoiceType === "purchase") {
    allAccounts
        .filter((a) =>
          a.accountNumber === "301" ||
        a.accountNumber.startsWith("301-") ||
        a.accountNumber === "302" ||
        a.accountNumber.startsWith("302-") ||
        a.accountNumber === "303" ||
        a.accountNumber.startsWith("303-"),
        )
        .forEach(add);

    // Inventory: 330-*
    allAccounts
        .filter((a) =>
          a.accountNumber === "330" ||
        a.accountNumber.startsWith("330-"),
        )
        .forEach(add);
  }

  // ---- 7. Production cost accounts: 5xx ----
  allAccounts
      .filter((a) =>
        a.accountNumber.startsWith("501") ||
      a.accountNumber.startsWith("502") ||
      a.accountNumber.startsWith("507") ||
      a.accountNumber === "550",
      )
      .forEach(add);

  // ---- 8. Revenue accounts: 7xx (for sales / credit notes / refaktury) ----
  allAccounts
      .filter((a) =>
        a.accountNumber.startsWith("70") ||
      a.accountNumber.startsWith("731") ||
      a.accountNumber.startsWith("741"),
      )
      .forEach(add);

  // ---- 9. Financial accounts: 751-*, 752-* (exchange rate diffs, interest) ----
  allAccounts
      .filter((a) =>
        a.accountNumber.startsWith("751") ||
      a.accountNumber.startsWith("752") ||
      a.accountNumber.startsWith("761") ||
      a.accountNumber.startsWith("762"),
      )
      .forEach(add);

  // ---- 10. Bank accounts: 131-* (if needed for payment context) ----
  allAccounts
      .filter((a) => a.accountNumber.startsWith("131"))
      .forEach(add);

  // ---- 11. Settlement/other accounts: 230, 249 ----
  allAccounts
      .filter((a) =>
        a.accountNumber === "230" ||
      a.accountNumber.startsWith("230-") ||
      a.accountNumber === "280",
      )
      .forEach(add);

  // ---- 12. Sales-specific accounts ----
  if (invoiceType === "sales") {
    // Customer/receivable sub-accounts 201-*
    const customerAccounts = allAccounts
        .filter((a) => a.accountNumber.startsWith("201-"))
        .map((a) => ({...a, _score: fuzzyScore(a.accountName, supplierName)}))
        .sort((a, b) => b._score - a._score);

    const customerMatches = customerAccounts.filter((a) => a._score > 30);
    if (customerMatches.length > 0) {
      customerMatches.slice(0, 10).forEach(add);
    } else {
      customerAccounts.slice(0, 15).forEach(add);
    }

    // Output VAT: 221-2-* (VAT należny)
    allAccounts
        .filter((a) =>
          a.accountNumber.startsWith("221-2") ||
        a.accountNumber === "221",
        )
        .forEach(add);

    // Advance payments received: 840-*, 845-*
    allAccounts
        .filter((a) =>
          a.accountNumber.startsWith("840") ||
        a.accountNumber.startsWith("845"),
        )
        .forEach(add);
  }

  // ---- 13. Fixed asset accounts: 011-*, 083-* (for asset purchases) ----
  const itemsText = items.join(" ").toLowerCase();
  const isAssetRelated = [
    "maszyn", "urządzen", "kompresor", "wózek", "samochod",
    "budow", "hala", "komputer", "serwer", "system",
  ].some((kw) => itemsText.includes(kw));

  if (isAssetRelated) {
    allAccounts
        .filter((a) =>
          a.accountNumber.startsWith("011") ||
        a.accountNumber.startsWith("083") ||
        a.accountNumber.startsWith("304"),
        )
        .forEach(add);
  }

  const result = Array.from(selected.values());
  logger.info(`[AccountSuggestion] Filtered ${allAccounts.length} → ${result.length} accounts`);
  return result;
};

// ============================================================================
// POSTING HISTORY
// ============================================================================

/**
 * Find historical postings for a given supplier.
 * Looks at journal entries whose description mentions the supplier name.
 *
 * @param {Object} db - Firestore instance
 * @param {string} supplierName - Supplier name to search for
 * @param {number} limit - Max number of examples
 * @return {Promise<Array>} Historical posting examples
 */
const getPostingHistory = async (db, supplierName, limit = 3) => {
  try {
    // Search journalEntries for entries referencing this supplier
    const snapshot = await db
        .collection("journalEntries")
        .where("status", "==", "posted")
        .orderBy("entryDate", "desc")
        .limit(50) // fetch more, then filter client-side
        .get();

    if (snapshot.empty) return [];

    const supplierLower = supplierName.toLowerCase();
    const matches = [];

    for (const doc of snapshot.docs) {
      const entry = doc.data();
      const desc = (entry.description || "").toLowerCase();

      if (desc.includes(supplierLower) ||
          desc.includes(supplierLower.substring(0, 10))) {
        // Fetch journal lines for this entry
        const linesSnapshot = await db
            .collection("journalLines")
            .where("journalEntryId", "==", doc.id)
            .orderBy("lineNumber", "asc")
            .get();

        const lines = linesSnapshot.docs.map((ld) => {
          const l = ld.data();
          return {
            accountNumber: l.accountNumber || "?",
            debit: l.debitAmount || 0,
            credit: l.creditAmount || 0,
            description: l.description || "",
          };
        });

        if (lines.length > 0) {
          matches.push({
            date: entry.entryDate?.toDate?.()?.toISOString?.()?.split("T")[0] || "?",
            description: entry.description || "",
            lines,
          });
        }

        if (matches.length >= limit) break;
      }
    }

    return matches;
  } catch (error) {
    logger.warn(`[AccountSuggestion] History lookup failed: ${error.message}`);
    return [];
  }
};

// ============================================================================
// PROMPT BUILDING
// ============================================================================

const SYSTEM_PROMPT = `Jesteś asystentem księgowym firmy BGW Pharma.
Na podstawie faktury i planu kont zaproponuj dekretację.

ZASADY KSIĘGOWANIA:
1. Każdy wpis MUSI się bilansować: suma strony WN (debet) = suma strony MA (credit)
2. Faktura zakupowa (materiały/towary):
   - WN: konto kosztowe 4xx (np. 402 zużycie materiałów, 428 transport, 419 energia)
   - WN: konto VAT naliczony (221-1 lub 221-4 przy WNT/import)
   - MA: konto dostawcy 202-2-1-XXX (dopasuj po nazwie dostawcy)
3. Faktura kosztowa (usługi/koszty):
   - WN: odpowiednie konto kosztowe 4xx
   - WN: konto VAT naliczony 221-1
   - MA: konto dostawcy 202-2-1-XXX
4. Faktura sprzedażowa (przychody ze sprzedaży):
   - WN: konto odbiorcy 201-XXX (dopasuj po nazwie klienta; jeśli faktura walutowa np. EUR, szukaj 201-XXX z walutą EUR)
   - MA: konto przychodów 701 (Przychody ze sprzedaży) lub odpowiednie 70x
   - MA: konto VAT należny 221-2-XXX (jeśli jest VAT; dla eksportu/WDT/0% pomijaj linię VAT)
   - Kwota WN na koncie odbiorcy = brutto PLN
   - Suma MA (przychody netto + VAT) = brutto PLN
5. Jeśli faktura walutowa (EUR/USD) - wybierz konto odbiorcy/dostawcy z odpowiednią walutą jeśli istnieje (np. 201-EUR, 202-EUR)
6. Kwoty podawaj w PLN (po przeliczeniu kursem jeśli podany)
7. Używaj WYŁĄCZNIE kont z podanej listy - nigdy nie wymyślaj numerów kont

DOPASOWANIE KONTA KOSZTOWEGO do treści faktury (dotyczy zakupów/kosztów):
- Transport, spedycja, fracht → 428 (TRANSPORT) lub 424/425/426
- Energia, prąd, gaz → 419 (Energia)
- Czynsz, najem, media → 422 (Czynsz+media)
- Telekomunikacja, internet, telefon → 420 (Usługi telekomunikacyjne)
- Materiały biurowe → 406 (Materiały biurowe)
- Paliwo, tankowanie → 412 (Koszty eksploatacji samochodów)
- Usługi serwisowe, kontrola → 423 (Usługi kontrolne/serwisowe)
- Remonty, naprawy → 427 (Usługi remontowe)
- Surowce, materiały do produkcji → 402 (Zużycie materiałów do produkcji)
- Opakowania → 402 (z odpowiednim subkontem CO jeśli dostępne)
- Ubezpieczenie → 433 (Polisy)
- Usługi pracowników tymczasowych → 430 (Usługi pracowników agencji pracy)
- Pozostałe usługi → 429 (Inne usługi obce)
- Opłaty bankowe → 461-3 (Opłaty bankowe)
- Maszyny/urządzenia (środek trwały) → 304-3 lub 083 (ŚT w budowie)

DOPASOWANIE DO BUDŻETU:
Jeśli otrzymasz listę pozycji budżetowych, dopasuj fakturę do JEDNEJ najbardziej pasującej pozycji.
Dopasowuj na podstawie:
- Nazwy pozycji faktury vs nazwa pozycji budżetowej (np. "Energia elektryczna" → "Prąd z klim./ogrzew.")
- Nazwy dostawcy (np. dostawca energii → pozycja "Prąd", dostawca olejów → "Oleje, materiały techniczne")
- Kategorii wydatku (np. IT → "IT i oprogramowanie", marketing → "Marketing i reprezentacja")
Jeśli nie możesz dopasować, ustaw suggestedBudgetItemId na null.

Zwróć TYLKO prawidłowy JSON w podanym formacie.`;

/**
 * Build the user prompt with invoice data and filtered accounts.
 *
 * @param {Object} invoiceData - Invoice information
 * @param {Array} filteredAccounts - Filtered chart of accounts
 * @param {Array} history - Historical posting examples
 * @return {string} User prompt
 */
const buildUserPrompt = (invoiceData, filteredAccounts, history) => {
  const {
    invoiceNumber,
    supplierName,
    supplierTaxId,
    currency,
    totalNet,
    totalVat,
    totalGross,
    exchangeRate,
    items,
    invoiceType,
    category,
    budgetItems = [],
  } = invoiceData;

  const typLabel = invoiceType === "purchase" ?
    "Faktura zakupowa (materiały/towary)" :
    invoiceType === "sales" ?
      "Faktura sprzedażowa (przychody ze sprzedaży)" :
      "Faktura kosztowa (usługi/koszty)";
  const taxIdPart = supplierTaxId ?
    ` (NIP: ${supplierTaxId})` : "";
  const ratePart = exchangeRate && exchangeRate !== 1 ?
    `, kurs: ${exchangeRate}` : "";
  const entityLabel = invoiceType === "sales" ? "Klient" : "Dostawca";

  let prompt = `FAKTURA DO ZAKSIĘGOWANIA:
- Typ: ${typLabel}
- Numer: ${invoiceNumber || "brak"}
- ${entityLabel}: ${supplierName}${taxIdPart}
- Waluta: ${currency || "PLN"}${ratePart}
- Netto: ${totalNet.toFixed(2)} PLN
- VAT: ${totalVat.toFixed(2)} PLN
- Brutto: ${totalGross.toFixed(2)} PLN`;

  if (category) {
    prompt += `\n- Kategoria: ${category}`;
  }

  if (items && items.length > 0) {
    prompt += `\n- Pozycje: ${items.slice(0, 15).join("; ")}`;
  }

  // Add filtered accounts
  prompt += `\n\nDOSTĘPNE KONTA (wybieraj TYLKO z tej listy):
${filteredAccounts.map((a) => {
    let line = `${a.accountNumber} | ${a.accountName}`;
    if (a.currency) line += ` [${a.currency}]`;
    return line;
  }).join("\n")}`;

  // Add historical postings as examples
  if (history && history.length > 0) {
    prompt += `\n\nPRZYKŁADY HISTORYCZNYCH KSIĘGOWAŃ TEGO DOSTAWCY:`;
    for (const h of history) {
      prompt += `\n--- ${h.date}: ${h.description}`;
      for (const l of h.lines) {
        const side = l.debit > 0 ? `WN ${l.debit.toFixed(2)}` : `MA ${l.credit.toFixed(2)}`;
        prompt += `\n    ${l.accountNumber} ${side} ${l.description}`;
      }
    }
  }

  // Add budget items if available
  if (budgetItems && budgetItems.length > 0) {
    prompt += `\n\nPOZYCJE BUDŻETOWE (dopasuj fakturę do JEDNEJ pozycji):`;
    for (const bi of budgetItems) {
      prompt += `\n- ${bi.id} | ${bi.sectionName} > ${bi.name}`;
    }
  }

  prompt += `\n\nZwróć JSON:
\`\`\`json
{
  "lines": [
    {
      "accountNumber": "numer konta z listy powyżej",
      "debitAmount": 0.00,
      "creditAmount": 0.00,
      "description": "opis linii"
    }
  ],
  "reasoning": "krótkie wyjaśnienie dlaczego te konta"${budgetItems && budgetItems.length > 0 ? `,
  "suggestedBudgetItemId": "id pozycji budżetowej lub null",
  "budgetReasoning": "dlaczego ta pozycja budżetowa"` : ""}
}
\`\`\``;

  return prompt;
};

// ============================================================================
// GEMINI API CALL
// ============================================================================

/**
 * Extract JSON from Gemini text response.
 * @param {string} response - Raw text from Gemini
 * @return {Object} Parsed JSON
 */
const extractJsonFromResponse = (response) => {
  // Try markdown code block first
  const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/);
  if (jsonMatch) {
    return JSON.parse(jsonMatch[1]);
  }

  // Try plain code block
  const codeMatch = response.match(/```\s*([\s\S]*?)\s*```/);
  if (codeMatch) {
    return JSON.parse(codeMatch[1]);
  }

  // Try direct JSON object
  const directMatch = response.match(/\{[\s\S]*\}/);
  if (directMatch) {
    return JSON.parse(directMatch[0]);
  }

  throw new Error("Could not extract JSON from Gemini response");
};

/**
 * Call Gemini API for account suggestion.
 *
 * @param {string} apiKey - Gemini API key
 * @param {string} systemPrompt - System prompt
 * @param {string} userPrompt - User prompt with invoice + accounts
 * @return {Promise<Object>} Parsed suggestion
 */
const callGeminiForSuggestion = async (apiKey, systemPrompt, userPrompt) => {
  if (!apiKey) {
    throw new Error("Gemini API key is required");
  }

  const requestBody = {
    contents: [
      {
        role: "user",
        parts: [
          {text: `${systemPrompt}\n\n${userPrompt}`},
        ],
      },
    ],
    generationConfig: {
      temperature: 0.1,
      topK: 32,
      topP: 1,
      maxOutputTokens: 2048,
      responseMimeType: "application/json",
    },
  };

  let lastError = null;

  for (const model of GEMINI_MODELS) {
    try {
      logger.info(`[AccountSuggestion] Trying model: ${model}`);

      const response = await fetch(
          `${GEMINI_API_BASE}/${model}:generateContent?key=${apiKey}`,
          {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify(requestBody),
          },
      );

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        const errorMsg = error.error?.message || `Status: ${response.status}`;
        logger.warn(`[AccountSuggestion] Model ${model} failed: ${errorMsg}`);
        lastError = new Error(errorMsg);
        continue;
      }

      const result = await response.json();
      const textResponse = result.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!textResponse) {
        logger.warn(`[AccountSuggestion] Model ${model}: empty response`);
        lastError = new Error("Empty response from Gemini");
        continue;
      }

      logger.info(`[AccountSuggestion] Success with model: ${model}`);
      return extractJsonFromResponse(textResponse);
    } catch (error) {
      logger.warn(`[AccountSuggestion] Model ${model} error: ${error.message}`);
      lastError = error;
    }
  }

  throw new Error(`All Gemini models failed: ${lastError?.message}`);
};

// ============================================================================
// MAIN FUNCTION
// ============================================================================

/**
 * Suggest account postings for an invoice.
 *
 * @param {string} apiKey - Gemini API key
 * @param {Object} invoiceData - Invoice data from the client
 * @param {string} invoiceData.invoiceNumber - Invoice number
 * @param {string} invoiceData.supplierName - Supplier name
 * @param {string} invoiceData.supplierTaxId - Supplier tax ID
 * @param {string} invoiceData.currency - Currency code
 * @param {number} invoiceData.totalNet - Net total in PLN
 * @param {number} invoiceData.totalVat - VAT total in PLN
 * @param {number} invoiceData.totalGross - Gross total in PLN
 * @param {number} [invoiceData.exchangeRate] - Exchange rate
 * @param {string} invoiceData.invoiceType - "purchase" or "expense"
 * @param {Array<string>} invoiceData.items - Item names
 * @param {string} [invoiceData.category] - Expense category
 * @return {Promise<Object>} Suggestion result with lines and reasoning
 */
const suggestAccountsForInvoice = async (apiKey, invoiceData) => {
  const db = admin.firestore();

  // 1. Fetch all accounts from Firestore
  logger.info("[AccountSuggestion] Fetching accounts from Firestore...");
  const accountsSnapshot = await db
      .collection("BookkeepingAccounts")
      .where("isActive", "==", true)
      .orderBy("accountNumber", "asc")
      .get();

  const allAccounts = accountsSnapshot.docs.map((doc) => ({
    id: doc.id,
    accountNumber: doc.data().accountNumber,
    accountName: doc.data().accountName,
    accountType: doc.data().accountType,
    currency: doc.data().currency || null,
  }));

  logger.info(`[AccountSuggestion] Total accounts: ${allAccounts.length}`);

  if (allAccounts.length === 0) {
    throw new Error("Plan kont jest pusty - najpierw zaimportuj konta");
  }

  // 2. Filter relevant accounts (or use all if chart is small)
  const SMALL_CHART_THRESHOLD = 200;
  const accountsForPrompt = allAccounts.length <= SMALL_CHART_THRESHOLD ?
    allAccounts :
    filterRelevantAccounts(allAccounts, invoiceData);
  logger.info(`[AccountSuggestion] Using ${accountsForPrompt.length}/${allAccounts.length} accounts (threshold: ${SMALL_CHART_THRESHOLD})`);

  // 3. Get posting history for this supplier/customer
  const history = await getPostingHistory(db, invoiceData.supplierName, 3);
  logger.info(`[AccountSuggestion] Found ${history.length} historical postings`);

  // 4. Build prompt
  const userPrompt = buildUserPrompt(invoiceData, accountsForPrompt, history);
  logger.info(`[AccountSuggestion] Prompt length: ~${userPrompt.length} chars`);

  // 5. Call Gemini
  const suggestion = await callGeminiForSuggestion(apiKey, SYSTEM_PROMPT, userPrompt);

  // 6. Validate response
  if (!suggestion.lines || !Array.isArray(suggestion.lines)) {
    throw new Error("AI zwróciło nieprawidłowy format - brak tablicy lines");
  }

  // Validate that suggested accounts exist in our chart
  const accountMap = new Map(allAccounts.map((a) => [a.accountNumber, a]));
  const validatedLines = suggestion.lines.map((line) => {
    const account = accountMap.get(line.accountNumber);
    return {
      accountNumber: line.accountNumber,
      accountId: account?.id || null,
      accountName: account?.accountName || "Nieznane konto",
      debitAmount: parseFloat(line.debitAmount) || 0,
      creditAmount: parseFloat(line.creditAmount) || 0,
      description: line.description || "",
      isValid: !!account,
    };
  });

  // Check balance
  const totalDebit = validatedLines.reduce((s, l) => s + l.debitAmount, 0);
  const totalCredit = validatedLines.reduce((s, l) => s + l.creditAmount, 0);
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01;

  // Validate budget suggestion if present
  let suggestedBudgetItemId = suggestion.suggestedBudgetItemId || null;
  if (suggestedBudgetItemId && invoiceData.budgetItems) {
    const validBudgetItem = invoiceData.budgetItems.find(
        (bi) => bi.id === suggestedBudgetItemId,
    );
    if (!validBudgetItem) {
      logger.warn(`[AccountSuggestion] AI suggested invalid budget item: ${suggestedBudgetItemId}`);
      suggestedBudgetItemId = null;
    }
  }

  return {
    lines: validatedLines,
    reasoning: suggestion.reasoning || "",
    isBalanced,
    totalDebit,
    totalCredit,
    accountsConsidered: accountsForPrompt.length,
    historyUsed: history.length,
    suggestedBudgetItemId,
    budgetReasoning: suggestion.budgetReasoning || null,
  };
};

module.exports = {
  suggestAccountsForInvoice,
  filterRelevantAccounts,
  getPostingHistory,
};
