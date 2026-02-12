// src/services/orderItemsImportService.js
import { getAllRecipes } from './recipeService';
import { getInventoryItemsByCategory } from './inventory';
import { getPriceListItemForCustomerProduct } from './priceListService';
import { getRecipeById } from './recipeService';
import { getInventoryItemById } from './inventory';
import { calculateProductionCost } from '../utils/costCalculator';
import { getLastRecipeUsageInfo } from './orderService';

// Mapowanie nagłówków CSV dla importu pozycji zamówienia
const ORDER_ITEMS_CSV_HEADER_MAP = {
  'SKU': 'sku',
  'NAZWA': 'sku',
  'RECEPTURA': 'sku',
  'PRODUCT': 'sku',
  'QUANTITY': 'quantity',
  'QUANTYTY': 'quantity',
  'ILOSC': 'quantity',
  'QTY': 'quantity'
};

/**
 * Parsuje linię CSV z obsługą cudzysłowów
 */
const parseCSVLine = (line, separator = ',') => {
  const values = [];
  let currentValue = '';
  let insideQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (insideQuotes && nextChar === '"') {
        currentValue += '"';
        i++;
      } else {
        insideQuotes = !insideQuotes;
      }
    } else if (char === separator && !insideQuotes) {
      values.push(currentValue.trim());
      currentValue = '';
    } else {
      currentValue += char;
    }
  }
  values.push(currentValue.trim());

  return values;
};

/**
 * Parsuje plik CSV z pozycjami zamówienia (receptury)
 * Pomija wiersze gdzie QUANTITY jest puste lub 0
 *
 * @param {string} csvText - Zawartość pliku CSV
 * @returns {Object} - { items: [{sku, quantity, lineNumber}], skippedCount, errors }
 */
export const parseOrderItemsCSV = (csvText) => {
  const cleanText = csvText.replace(/^\uFEFF/, '');
  const lines = cleanText.split(/\r?\n/).filter((line) => line.trim());

  if (lines.length < 2) {
    throw new Error('Plik CSV jest pusty lub zawiera tylko nagłówki');
  }

  const firstLine = lines[0];
  const commaCount = (firstLine.match(/,/g) || []).length;
  const semicolonCount = (firstLine.match(/;/g) || []).length;
  const separator = semicolonCount > commaCount ? ';' : ',';

  const rawHeaders = parseCSVLine(lines[0], separator);
  const columnIndices = {};

  rawHeaders.forEach((header, index) => {
    const normalized = header.trim().toUpperCase();
    const fieldName = ORDER_ITEMS_CSV_HEADER_MAP[normalized];
    if (fieldName) {
      columnIndices[fieldName] = index;
    }
  });

  if (columnIndices.sku === undefined) {
    throw new Error('Brak wymaganej kolumny SKU (nazwa receptury)');
  }

  const skuIndex = columnIndices.sku;
  const quantityIndex = columnIndices.quantity !== undefined ? columnIndices.quantity : null;

  const items = [];
  let skippedCount = 0;
  const errors = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i], separator);
    const sku = values[skuIndex]?.trim() || '';
    const quantityRaw = quantityIndex !== null ? values[quantityIndex] : '1';

    if (!sku) {
      errors.push({ lineNumber: i + 1, message: 'Brak SKU (nazwy receptury)' });
      continue;
    }

    // Usuń spacje (separator tysięcy) i zamień przecinek na kropkę
    const quantityStr = String(quantityRaw).replace(/\s/g, '').replace(',', '.');
    const quantity = parseFloat(quantityStr) || 0;

    // Pomijaj wiersze z ilością pustą lub 0
    if (quantity <= 0) {
      skippedCount++;
      continue;
    }

    items.push({
      sku,
      quantity,
      lineNumber: i + 1
    });
  }

  return {
    items,
    skippedCount,
    errors
  };
};

/**
 * Dopasowuje SKU z CSV do receptur i usług w bazie danych
 *
 * @param {Array} items - Pozycje z parseOrderItemsCSV
 * @returns {Promise<Object>} - { matched: [...], notFound: [...] }
 */
export const matchRecipesFromCSV = async (items) => {
  const recipes = await getAllRecipes();
  let services = [];
  try {
    const servicesData = await getInventoryItemsByCategory('Inne');
    services = servicesData?.items || servicesData || [];
  } catch (error) {
    console.warn('Nie udało się pobrać usług:', error);
  }

  const productMap = new Map();

  recipes.forEach((recipe) => {
    const key = recipe.name.toLowerCase().trim();
    productMap.set(key, {
      id: recipe.id,
      name: recipe.name,
      type: 'recipe',
      isRecipe: true,
      unit: recipe.yield?.unit || 'szt.'
    });
  });

  services.forEach((service) => {
    const key = service.name.toLowerCase().trim();
    productMap.set(key, {
      id: service.id,
      name: service.name,
      type: 'service',
      isRecipe: false,
      unit: service.unit || 'szt.'
    });
  });

  const matched = [];
  const notFound = [];

  items.forEach((item) => {
    const key = item.sku.toLowerCase().trim();
    const product = productMap.get(key);

    if (product) {
      matched.push({
        ...item,
        productId: product.id,
        productName: product.name,
        isRecipe: product.isRecipe,
        matchedType: product.type,
        unit: product.unit
      });
    } else {
      notFound.push(item);
    }
  });

  return { matched, notFound };
};

const DEFAULT_MARGIN = 20;

/**
 * Generuje unikalne ID pozycji
 */
const generateItemId = () => {
  return `item_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Przygotowuje pozycje zamówienia z dopasowanych danych CSV
 * Pobiera ceny z listy cenowej klienta lub oblicza koszt produkcji
 *
 * @param {Array} matched - Wynik matchRecipesFromCSV
 * @param {string|null} customerId - ID klienta (opcjonalnie)
 * @returns {Promise<Array>} - Tablica pozycji gotowych do dodania do zamówienia
 */
export const prepareOrderItemsFromCSV = async (matched, customerId = null) => {
  const orderItems = [];

  for (const item of matched) {
    const {
      productId,
      productName,
      isRecipe,
      unit,
      quantity
    } = item;

    let price = 0;
    let basePrice = 0;
    let fromPriceList = false;
    let lastUsageInfo = null;
    let priceListNotes = '';

    if (customerId) {
      try {
        const priceListItem = await getPriceListItemForCustomerProduct(
          customerId,
          productId,
          isRecipe
        );

        if (priceListItem) {
          price = priceListItem.price;
          fromPriceList = true;
          if (!isRecipe && priceListItem.notes) {
            priceListNotes = priceListItem.notes;
          }
        }
      } catch (error) {
        console.error('Błąd pobierania ceny z listy cenowej:', error);
      }
    }

    if (!fromPriceList) {
      if (isRecipe) {
        try {
          const recipe = await getRecipeById(productId);

          if (recipe) {
            const cost = await calculateProductionCost(recipe);
            basePrice = cost.totalCost;
            price = basePrice * (1 + DEFAULT_MARGIN / 100);
            price = parseFloat(price.toFixed(2));

            try {
              lastUsageInfo = await getLastRecipeUsageInfo(recipe.id);
              if (
                (!lastUsageInfo || !lastUsageInfo.cost || lastUsageInfo.cost === 0) &&
                recipe
              ) {
                const { calculateEstimatedMaterialsCost } = await import(
                  '../utils/costCalculator'
                );
                const estimatedCost = await calculateEstimatedMaterialsCost(recipe);
                if (estimatedCost.totalCost > 0) {
                  lastUsageInfo = lastUsageInfo || {};
                  lastUsageInfo.cost = estimatedCost.totalCost;
                  lastUsageInfo.estimatedCost = true;
                  lastUsageInfo.costDetails = estimatedCost.details;
                  lastUsageInfo.orderId = null;
                  lastUsageInfo.orderNumber = 'Szacowany';
                  lastUsageInfo.orderDate = new Date();
                  lastUsageInfo.customerName = 'Kalkulacja kosztów';
                  lastUsageInfo.quantity = 1;
                  lastUsageInfo.price = estimatedCost.totalCost;
                  lastUsageInfo.unit = recipe.yield?.unit || 'szt.';
                  lastUsageInfo.totalValue = estimatedCost.totalCost;
                }
              }
            } catch (err) {
              console.error('Błąd pobierania lastUsageInfo:', err);
            }
          }
        } catch (error) {
          console.error('Błąd obliczania kosztu receptury:', error);
        }
      } else {
        try {
          const productDetails = await getInventoryItemById(productId);
          if (productDetails) {
            basePrice = productDetails.standardPrice || 0;
            price = basePrice * (1 + DEFAULT_MARGIN / 100);
            price = parseFloat(price.toFixed(2));
          }
        } catch (error) {
          console.error('Błąd pobierania produktu/usługi:', error);
        }
      }
    }

    orderItems.push({
      id: generateItemId(),
      name: productName,
      description: priceListNotes || '',
      quantity,
      unit: unit || 'szt.',
      price,
      margin: DEFAULT_MARGIN,
      basePrice,
      fromPriceList,
      isRecipe,
      recipeId: isRecipe ? productId : null,
      serviceId: !isRecipe && item.matchedType === 'service' ? productId : null,
      productId: !isRecipe && item.matchedType !== 'service' ? productId : null,
      itemType: item.matchedType === 'recipe' ? 'recipe' : item.matchedType === 'service' ? 'service' : 'product',
      minOrderQuantity: 0,
      originalUnit: unit || 'szt.',
      lastUsageInfo
    });
  }

  return orderItems;
};

/**
 * Generuje szablon CSV do pobrania
 */
export const generateOrderItemsTemplate = () => {
  const headers = ['SKU', 'QUANTITY'];
  const exampleRows = [
    ['GRN-COLLAGEN-CHOCOLATE', '100'],
    ['GRN-CREA-UNFLAVORED', '50'],
    ['GRN-OMEGA3-CAPS', '200']
  ];
  const csv = [headers.join(','), ...exampleRows.map((row) => row.join(','))].join('\n');
  return csv;
};
