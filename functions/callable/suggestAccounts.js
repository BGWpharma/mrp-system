/**
 * Suggest Accounts - Callable Cloud Function
 * AI-based account suggestion for invoice posting in BGW-Accounting.
 *
 * Called from the InvoicePostingDialog to get AI-generated journal line suggestions.
 *
 * DEPLOYMENT:
 * firebase deploy --only functions:bgw-mrp:suggestAccountsForPosting
 *
 * @module callable/suggestAccounts
 */

const {onCall, HttpsError} = require("firebase-functions/v2/https");
const {defineSecret} = require("firebase-functions/params");
const logger = require("firebase-functions/logger");
const {suggestAccountsForInvoice} = require("../utils/accountSuggestionService");

// Gemini API Key from Firebase Secrets
const geminiApiKey = defineSecret("GEMINI_API_KEY");

/**
 * Callable function: suggestAccountsForPosting
 *
 * Input (request.data):
 * - invoiceNumber: string
 * - supplierName: string
 * - supplierTaxId?: string
 * - currency: string (e.g. "PLN", "EUR")
 * - totalNet: number
 * - totalVat: number
 * - totalGross: number
 * - exchangeRate?: number
 * - invoiceType: "purchase" | "expense" | "sales"
 * - items: string[] (item names/descriptions)
 * - category?: string
 *
 * Output:
 * - lines: Array<{accountNumber, accountId, accountName,
 *     debitAmount, creditAmount, description, isValid}>
 * - reasoning: string
 * - isBalanced: boolean
 * - totalDebit: number
 * - totalCredit: number
 * - accountsConsidered: number
 * - historyUsed: number
 */
const suggestAccountsForPosting = onCall(
    {
      region: "europe-central2",
      memory: "512MiB",
      timeoutSeconds: 60,
      secrets: [geminiApiKey],
    },
    async (request) => {
      try {
        // Verify authentication
        if (!request.auth) {
          throw new HttpsError(
              "unauthenticated",
              "Wymagane zalogowanie",
          );
        }

        const data = request.data;

        // Validate required fields
        if (!data.supplierName) {
          throw new HttpsError(
              "invalid-argument",
              "Nazwa dostawcy/klienta jest wymagana",
          );
        }

        if (typeof data.totalNet !== "number" || typeof data.totalGross !== "number") {
          throw new HttpsError(
              "invalid-argument",
              "Kwoty netto i brutto są wymagane (typ number)",
          );
        }

        logger.info("[suggestAccountsForPosting] Request received", {
          supplier: data.supplierName,
          currency: data.currency,
          totalGross: data.totalGross,
          invoiceType: data.invoiceType,
          uid: request.auth.uid,
        });

        const invoiceData = {
          invoiceNumber: data.invoiceNumber || "",
          supplierName: data.supplierName,
          supplierTaxId: data.supplierTaxId || "",
          currency: data.currency || "PLN",
          totalNet: data.totalNet,
          totalVat: data.totalVat || 0,
          totalGross: data.totalGross,
          exchangeRate: data.exchangeRate || 1,
          invoiceType: data.invoiceType || "expense",
          items: data.items || [],
          category: data.category || null,
          budgetItems: data.budgetItems || [],
        };

        const apiKey = geminiApiKey.value();
        const result = await suggestAccountsForInvoice(apiKey, invoiceData);

        logger.info("[suggestAccountsForPosting] Suggestion generated", {
          linesCount: result.lines.length,
          isBalanced: result.isBalanced,
          accountsConsidered: result.accountsConsidered,
        });

        return result;
      } catch (error) {
        if (error instanceof HttpsError) {
          throw error;
        }
        logger.error("[suggestAccountsForPosting] Error:", error);
        throw new HttpsError(
            "internal",
            `Błąd generowania sugestii: ${error.message}`,
        );
      }
    },
);

module.exports = {suggestAccountsForPosting};
