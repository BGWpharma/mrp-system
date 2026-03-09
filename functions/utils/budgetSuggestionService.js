/**
 * Budget Suggestion Service
 * Suggests a budget item for expense invoices during OCR processing.
 *
 * Uses Gemini to match invoice data (supplier, items, category) against
 * the budget matrix stored in Firestore.
 *
 * @module utils/budgetSuggestionService
 */

const logger = require("firebase-functions/logger");
const {admin} = require("../config");

const GEMINI_API_BASE =
  "https://generativelanguage.googleapis.com/v1beta/models";

const GEMINI_MODELS = [
  "gemini-2.5-flash",
  "gemini-2.0-flash",
];

const BUDGET_COLLECTION = "budgets";

const BUDGET_SUGGESTION_PROMPT = `Jesteś asystentem księgowym BGW Pharma.
Na podstawie danych z faktury kosztowej dopasuj ją do JEDNEJ pozycji budżetowej.

ZASADY DOPASOWANIA:
1. Porównaj nazwy pozycji faktury z nazwami pozycji budżetowych
2. Porównaj nazwę dostawcy z typem wydatku budżetowego
3. Uwzględnij kategorię wydatku jeśli podana

PRZYKŁADY DOPASOWAŃ:
- Energia elektryczna, prąd → "Electricity with AC/heating" lub "Electricity with heating"
- Czynsz, najem → "Rent"
- Woda, ścieki, kanalizacja → "Water & sewage"
- Paliwo, tankowanie → "Maintenance" (vehicles)
- Leasing, wynajem samochodu → "Long-term rental 2 cars"
- Serwis samochodowy → "Maintenance" (vehicles)
- Materiały biurowe → "Office supplies"
- Telefon, internet → "Phones & internet"
- Ubezpieczenie → "Property + D&O + Liability"
- IT, oprogramowanie, licencje → "IT & software"
- Marketing, reklama → "Marketing & representation"
- Prawnik, doradztwo → "Legal & advisory services"
- BHP, ochrona pracy → "OSH and fire department audit"
- Odpady, utylizacja → "Waste & disposal"
- Środki czystości, kawa, herbata → "Hygiene supplies, coffee, tea"
- Oleje, materiały techniczne → "Oils, technical materials"
- Odzież robocza, pranie → "Protective clothing / laundry"
- Serwis linii produkcyjnej → "Production line maintenance"
- Certyfikaty, audyty, GMP, ISO → "Certificates and audits (GMP, ISO)"
- Podatek od nieruchomości → "Property tax"

Jeśli nie możesz jednoznacznie dopasować, zwróć null.

Zwróć TYLKO JSON:
\`\`\`json
{
  "suggestedBudgetItemId": "id pozycji budżetowej lub null",
  "reasoning": "krótkie uzasadnienie po polsku"
}
\`\`\``;

/**
 * Fetch budget items from Firestore for a given year.
 * Returns a flat list with section names for prompt building.
 *
 * @param {Object} db - Firestore instance
 * @param {number} year - Budget year
 * @return {Promise<Array>} Budget items with section info
 */
const fetchBudgetItems = async (db, year) => {
  const docRef = db.collection(BUDGET_COLLECTION).doc(String(year));
  const snap = await docRef.get();

  if (!snap.exists) {
    logger.info(`[BudgetSuggestion] No budget found for year ${year}`);
    return [];
  }

  const data = snap.data();
  const sections = data.sections || [];
  const items = data.items || [];
  const sectionMap = new Map(sections.map((s) => [s.id, s]));

  return items.map((item) => ({
    id: item.id,
    sectionId: item.sectionId,
    sectionName: sectionMap.get(item.sectionId)?.name || item.sectionId,
    name: item.name,
    nameEn: item.nameEn || item.name,
  }));
};

/**
 * Build a prompt for budget suggestion.
 *
 * @param {Object} ocrData - OCR result data
 * @param {Array} budgetItems - Budget items list
 * @return {string} User prompt
 */
const buildBudgetPrompt = (ocrData, budgetItems) => {
  const supplierName = ocrData.supplier?.name || "nieznany";
  const itemNames = (ocrData.items || [])
      .slice(0, 10)
      .map((i) => i.name)
      .filter(Boolean);

  let prompt = `FAKTURA KOSZTOWA:
- Dostawca: ${supplierName}`;

  if (ocrData.supplier?.taxId) {
    prompt += ` (NIP: ${ocrData.supplier.taxId})`;
  }

  if (itemNames.length > 0) {
    prompt += `\n- Pozycje: ${itemNames.join("; ")}`;
  }

  if (ocrData.summary) {
    prompt += `\n- Kwota netto: ${ocrData.summary.totalNet || 0} ${ocrData.currency || "PLN"}`;
  }

  prompt += `\n\nPOZYCJE BUDŻETOWE:`;
  for (const bi of budgetItems) {
    prompt += `\n- ${bi.id} | ${bi.sectionName} > ${bi.name}`;
  }

  return prompt;
};

/**
 * Call Gemini for budget suggestion.
 *
 * @param {string} apiKey - Gemini API key
 * @param {string} userPrompt - User prompt
 * @return {Promise<Object>} Parsed suggestion
 */
const callGeminiForBudget = async (apiKey, userPrompt) => {
  const requestBody = {
    contents: [
      {
        role: "user",
        parts: [{text: `${BUDGET_SUGGESTION_PROMPT}\n\n${userPrompt}`}],
      },
    ],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 512,
      responseMimeType: "application/json",
    },
  };

  let lastError = null;

  for (const model of GEMINI_MODELS) {
    try {
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
        logger.warn(`[BudgetSuggestion] Model ${model} failed: ${error.error?.message || response.status}`);
        lastError = new Error(error.error?.message || `Status: ${response.status}`);
        continue;
      }

      const result = await response.json();
      const text = result.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!text) {
        lastError = new Error("Empty response");
        continue;
      }

      const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
      const rawJson = jsonMatch ?
        jsonMatch[1] : (text.match(/\{[\s\S]*\}/)?.[0] || text);
      const parsed = JSON.parse(rawJson);

      logger.info(`[BudgetSuggestion] Success with model: ${model}`);
      return parsed;
    } catch (error) {
      logger.warn(`[BudgetSuggestion] Model ${model} error: ${error.message}`);
      lastError = error;
    }
  }

  throw new Error(`All models failed: ${lastError?.message}`);
};

/**
 * Suggest a budget item for an expense invoice based on OCR data.
 * Called during OCR processing to provide an early suggestion.
 *
 * @param {string} apiKey - Gemini API key
 * @param {Object} ocrData - Normalized OCR result
 * @return {Promise<Object|null>} Suggestion or null
 */
const suggestBudgetForExpenseInvoice = async (apiKey, ocrData) => {
  const db = admin.firestore();

  const invoiceDate = ocrData.invoiceDate ?
    new Date(ocrData.invoiceDate) : new Date();
  const year = invoiceDate.getFullYear();

  const budgetItems = await fetchBudgetItems(db, year);
  if (budgetItems.length === 0) {
    logger.info("[BudgetSuggestion] No budget items found, skipping");
    return null;
  }

  const userPrompt = buildBudgetPrompt(ocrData, budgetItems);
  logger.info(`[BudgetSuggestion] Prompt length: ~${userPrompt.length} chars, ` +
    `${budgetItems.length} budget items`);

  const suggestion = await callGeminiForBudget(apiKey, userPrompt);

  if (!suggestion.suggestedBudgetItemId) {
    logger.info("[BudgetSuggestion] AI could not match a budget item");
    return null;
  }

  const matchedItem = budgetItems.find(
      (bi) => bi.id === suggestion.suggestedBudgetItemId,
  );

  if (!matchedItem) {
    logger.warn(`[BudgetSuggestion] AI suggested invalid item: ${suggestion.suggestedBudgetItemId}`);
    return null;
  }

  logger.info("[BudgetSuggestion] Matched budget item", {
    itemId: matchedItem.id,
    itemName: matchedItem.name,
    section: matchedItem.sectionName,
  });

  return {
    suggestedBudgetItemId: matchedItem.id,
    suggestedBudgetItemName: matchedItem.name,
    suggestedBudgetSectionName: matchedItem.sectionName,
    budgetSuggestionReasoning: suggestion.reasoning || null,
  };
};

module.exports = {
  suggestBudgetForExpenseInvoice,
  fetchBudgetItems,
};
