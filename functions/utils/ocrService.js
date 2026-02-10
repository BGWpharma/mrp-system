/**
 * OCR Service using Gemini Vision API
 * Extracts invoice data from images/PDFs
 *
 * @module utils/ocrService
 */

const logger = require("firebase-functions/logger");

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

const VISION_MODELS = [
  "gemini-2.5-flash",
  "gemini-2.5-pro",
  "gemini-2.0-flash",
];

const SUPPORTED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
];

const INVOICE_OCR_PROMPT = `Analyze this invoice/purchase document and extract ALL data accurately.

TASK: Extract complete invoice information including:
1. Document header (number, dates, supplier info)
2. ALL line items with quantities, prices, VAT
3. Summary totals

IMPORTANT: Identify document type carefully:
- "invoice" = standard invoice / faktura VAT
- "proforma" = pro forma invoice / faktura pro forma / advance invoice
- "credit_note" = nota kredytowa
- "debit_note" = nota obciążeniowa

RETURN JSON in this EXACT format:
\`\`\`json
{
  "documentType": "invoice" or "proforma" or "credit_note" or "debit_note",
  "invoiceNumber": "EXACT number from document",
  "invoiceDate": "YYYY-MM-DD",
  "dueDate": "YYYY-MM-DD or null",
  "supplier": {
    "name": "supplier company name",
    "taxId": "NIP/VAT ID number if visible (Polish NIP or foreign tax ID)",
    "vatEu": "VAT EU number if visible and different from taxId (e.g. PL1234567890), else null",
    "address": {
      "street": "street and building number",
      "city": "city name",
      "postalCode": "postal/zip code",
      "country": "country name or null if not visible"
    },
    "email": "supplier email if visible on document, else null",
    "phone": "supplier phone number if visible on document, else null",
    "bankName": "bank name if visible on document, else null"
  },
  "currency": "EUR or PLN",
  "items": [
    {
      "name": "exact product name from invoice",
      "quantity": 50,
      "unit": "kg",
      "unitPriceNet": 10.50,
      "vatRate": 23,
      "totalNet": 525.00,
      "totalGross": 645.75
    }
  ],
  "summary": {
    "totalNet": 525.00,
    "totalVat": 120.75,
    "totalGross": 645.75,
    "vatBreakdown": [
      { "rate": 23, "base": 525.00, "amount": 120.75 }
    ]
  },
  "paymentMethod": "transfer or cash or card",
  "bankAccount": "account number or IBAN if visible, else null",
  "parseConfidence": 0.95,
  "warnings": ["any issues or uncertainties"]
}
\`\`\`

ADDITIONAL EXTRACTION (for VAT invoices that reference a proforma/advance):
- "referencedProformaNumber": If this VAT invoice references a proforma or advance invoice number anywhere on the document (e.g. "Dotyczy proformy PF/2026/001", "Ref: Proforma XXX", "Zaliczka wg proformy nr...", "Based on proforma invoice no...", "Advance payment ref:", "Na podstawie faktury pro forma nr"), extract that proforma number exactly as written. Otherwise null.
- "advancePaymentAmount": If the invoice shows a settled advance/proforma amount (e.g. "Zaliczka: 5000 EUR", "Advance payment settled: 5000", "Rozliczenie zaliczki: 5000"), extract the amount as a number. Otherwise null.

CRITICAL RULES:
- Set documentType to "proforma" if document contains ANY of these markers:
  * "Pro Forma", "Proforma", "PRO-FORMA" (any case)
  * "Faktura Pro Forma", "Invoice Proforma"
  * "Advance Invoice", "Faktura Zaliczkowa"
  * Document number contains "PRO", "PROF", "PF"
- ALL numeric values MUST be numbers (not strings)
- Dates in YYYY-MM-DD format
- quantity, unitPriceNet, vatRate, totalNet, totalGross - all NUMBERS
- vatRate: use the actual percentage (0, 5, 8, 23 for Poland)
- If data is unclear, set parseConfidence < 0.7
- Include warnings array for any ambiguous data`;

/**
 * Extract JSON from Gemini response
 * @param {string} response - Raw response from Gemini
 * @return {Object} Parsed JSON data
 */
const extractJsonFromResponse = (response) => {
  // Try markdown code block first
  const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/);
  if (jsonMatch) {
    return JSON.parse(jsonMatch[1]);
  }

  // Try direct JSON
  const directMatch = response.match(/\{[\s\S]*\}/);
  if (directMatch) {
    return JSON.parse(directMatch[0]);
  }

  throw new Error("Could not extract JSON from Gemini response");
};

/**
 * Call Gemini Vision API with retry across models
 * @param {string} apiKey - Gemini API key
 * @param {string} base64Data - Base64 encoded file data
 * @param {string} mimeType - File MIME type
 * @return {Promise<Object>} Parsed invoice data
 */
const callGeminiVision = async (apiKey, base64Data, mimeType) => {
  if (!apiKey) {
    throw new Error("Gemini API key is required");
  }

  if (!SUPPORTED_MIME_TYPES.includes(mimeType)) {
    throw new Error(`Unsupported MIME type: ${mimeType}`);
  }

  const requestBody = {
    contents: [
      {
        parts: [
          {
            inline_data: {
              mime_type: mimeType,
              data: base64Data,
            },
          },
          {
            text: INVOICE_OCR_PROMPT,
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.1,
      topK: 32,
      topP: 1,
      maxOutputTokens: 8192,
    },
  };

  let lastError = null;

  for (const model of VISION_MODELS) {
    try {
      logger.info(`[OCR] Trying model: ${model}`);

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
        logger.warn(`[OCR] Model ${model} failed: ${errorMsg}`);
        lastError = new Error(errorMsg);
        continue;
      }

      const result = await response.json();
      const textResponse = result.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!textResponse) {
        logger.warn(`[OCR] Model ${model} returned empty response`);
        lastError = new Error("Empty response from Gemini");
        continue;
      }

      logger.info(`[OCR] ✅ Success with model: ${model}`);
      return extractJsonFromResponse(textResponse);
    } catch (error) {
      logger.warn(`[OCR] Model ${model} error: ${error.message}`);
      lastError = error;
    }
  }

  throw new Error(`All Gemini models failed: ${lastError?.message}`);
};

/**
 * Check if OCR data indicates a proforma invoice
 * @param {Object} ocrData - Normalized OCR data
 * @return {boolean} True if document appears to be proforma
 */
const checkIfProforma = (ocrData) => {
  const proformaKeywords = [
    "proforma", "pro forma", "pro-forma",
    "advance invoice", "faktura zaliczkowa",
    "faktura pro forma", "invoice proforma",
    "proforma invoice", "profaktura",
  ];

  // Check document type from OCR
  if (ocrData.documentType) {
    const docType = ocrData.documentType.toLowerCase().trim();
    if (docType === "proforma") {
      return true;
    }
    if (proformaKeywords.some((kw) => docType.includes(kw))) {
      return true;
    }
  }

  // Check invoice number for proforma markers
  if (ocrData.invoiceNumber) {
    const invoiceNum = ocrData.invoiceNumber.toLowerCase();
    if (proformaKeywords.some((kw) => invoiceNum.includes(kw))) {
      return true;
    }
    // Check for common proforma number patterns: PRO/2024/001, PF-123, etc.
    if (/\b(pro|pf|prof)\b/i.test(invoiceNum)) {
      return true;
    }
  }

  // Check warnings array for proforma indicators
  if (ocrData.warnings && Array.isArray(ocrData.warnings)) {
    const warningsText = ocrData.warnings.join(" ").toLowerCase();
    if (proformaKeywords.some((kw) => warningsText.includes(kw))) {
      return true;
    }
  }

  return false;
};

/**
 * Validate and normalize OCR result
 * @param {Object} ocrData - Raw OCR data
 * @return {Object} Normalized data
 */
const normalizeOcrResult = (ocrData) => {
  // Handle supplier address - can be string (old format) or object (new format)
  const rawAddress = ocrData.supplier?.address;
  let normalizedAddress = null;
  if (rawAddress && typeof rawAddress === "object") {
    normalizedAddress = {
      street: rawAddress.street || null,
      city: rawAddress.city || null,
      postalCode: rawAddress.postalCode || null,
      country: rawAddress.country || null,
    };
  } else if (rawAddress && typeof rawAddress === "string") {
    // Legacy format: full address as string - store as street
    normalizedAddress = {
      street: rawAddress,
      city: null,
      postalCode: null,
      country: null,
    };
  }

  const normalized = {
    documentType: ocrData.documentType || "invoice",
    invoiceNumber: ocrData.invoiceNumber || "UNKNOWN",
    invoiceDate: ocrData.invoiceDate || null,
    dueDate: ocrData.dueDate || null,
    supplier: {
      name: ocrData.supplier?.name || "Unknown Supplier",
      taxId: ocrData.supplier?.taxId || null,
      vatEu: ocrData.supplier?.vatEu || null,
      address: normalizedAddress,
      email: ocrData.supplier?.email || null,
      phone: ocrData.supplier?.phone || null,
      bankName: ocrData.supplier?.bankName || null,
    },
    currency: ocrData.currency || "EUR",
    items: (ocrData.items || []).map((item, idx) => ({
      id: `item_${idx}`,
      name: item.name || item.documentProductName || "Unknown Item",
      quantity: parseFloat(item.quantity) || 0,
      unit: item.unit || "szt",
      unitPriceNet: parseFloat(item.unitPriceNet) || 0,
      vatRate: parseFloat(item.vatRate) || 0,
      totalNet: parseFloat(item.totalNet) || 0,
      totalGross: parseFloat(item.totalGross) || 0,
    })),
    summary: {
      totalNet: parseFloat(ocrData.summary?.totalNet) || 0,
      totalVat: parseFloat(ocrData.summary?.totalVat) || 0,
      totalGross: parseFloat(ocrData.summary?.totalGross) || 0,
      vatBreakdown: ocrData.summary?.vatBreakdown || [],
    },
    paymentMethod: ocrData.paymentMethod || "transfer",
    bankAccount: ocrData.bankAccount || null,
    parseConfidence: parseFloat(ocrData.parseConfidence) || 0.5,
    warnings: ocrData.warnings || [],

    // Proforma reference extraction (for VAT invoices referencing a proforma)
    referencedProformaNumber: ocrData.referencedProformaNumber || null,
    advancePaymentAmount: ocrData.advancePaymentAmount ?
      parseFloat(ocrData.advancePaymentAmount) : null,
  };

  // Check if this is a proforma and add warning
  const isProforma = checkIfProforma(normalized);
  if (isProforma && !normalized.warnings.includes("⚠️ UWAGA: Dokument rozpoznany jako FAKTURA PRO FORMA")) {
    normalized.warnings.push("⚠️ UWAGA: Dokument rozpoznany jako FAKTURA PRO FORMA");
  }

  return normalized;
};

module.exports = {
  callGeminiVision,
  normalizeOcrResult,
  checkIfProforma,
  SUPPORTED_MIME_TYPES,
};
