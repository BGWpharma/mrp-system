// src/services/priceListImportService.js
import { 
  collection, 
  doc,
  serverTimestamp,
  writeBatch 
} from 'firebase/firestore';
import { db } from './firebase/config';
import { getAllRecipes } from './recipeService';
import { getInventoryItemsByCategory } from './inventory';
import { getPriceListItems } from './priceListService';

const PRICE_LIST_ITEMS_COLLECTION = 'priceListItems';

// Mapowanie nagłówków CSV
const CSV_HEADER_MAP = {
  'SKU': 'sku',
  'PRICE': 'price',
  'CURRENCY': 'currency',
  'UNIT': 'unit',
  'MOQ': 'minQuantity',
  'COMMENTS': 'notes'
};

/**
 * Parsuje linię CSV z obsługą cudzysłowów
 * @param {string} line - Linia CSV
 * @param {string} separator - Separator (przecinek lub średnik)
 * @returns {Array<string>} - Tablica wartości
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
        // Escaped quote
        currentValue += '"';
        i++;
      } else {
        // Toggle quote state
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
 * Parsuje plik CSV listy cenowej
 * @param {string} csvText - Zawartość pliku CSV
 * @returns {Object} - Obiekt z items i duplikatami
 * @throws {Error} - Gdy plik jest niepoprawny
 */
export const parsePriceListCSV = (csvText) => {
  // Usuń BOM jeśli istnieje
  const cleanText = csvText.replace(/^\uFEFF/, '');
  
  // Podziel na linie
  const lines = cleanText.split(/\r?\n/).filter(line => line.trim());
  
  if (lines.length < 2) {
    throw new Error('Plik CSV jest pusty lub zawiera tylko nagłówki');
  }
  
  // Automatyczne wykrycie separatora
  const firstLine = lines[0];
  const commaCount = (firstLine.match(/,/g) || []).length;
  const semicolonCount = (firstLine.match(/;/g) || []).length;
  const separator = semicolonCount > commaCount ? ';' : ',';
  
  console.log(`🔍 Wykryto separator: "${separator}" (przecinki: ${commaCount}, średniki: ${semicolonCount})`);
  
  // Parsuj nagłówki
  const rawHeaders = parseCSVLine(lines[0], separator);
  const columnIndices = {};
  
  rawHeaders.forEach((header, index) => {
    const normalized = header.trim().toUpperCase();
    const fieldName = CSV_HEADER_MAP[normalized];
    if (fieldName) {
      columnIndices[fieldName] = index;
    }
  });
  
  console.log('📋 Mapowanie kolumn:', columnIndices);
  
  // Sprawdź wymagane kolumny
  if (columnIndices.sku === undefined || columnIndices.price === undefined) {
    throw new Error('Brak wymaganych kolumn: SKU i PRICE');
  }
  
  // Parsuj dane
  const items = [];
  const skuCounts = {};
  
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i], separator);
    const item = {};
    
    Object.entries(columnIndices).forEach(([fieldName, colIndex]) => {
      if (values[colIndex] !== undefined) {
        item[fieldName] = values[colIndex];
      }
    });
    
    // Walidacja podstawowa - SKU musi istnieć
    if (item.sku && item.sku.trim()) {
      // Śledź duplikaty SKU
      const skuKey = item.sku.trim().toLowerCase();
      skuCounts[skuKey] = (skuCounts[skuKey] || 0) + 1;
      
      items.push({
        sku: item.sku.trim(),
        // Obsługa zarówno kropki jak i przecinka jako separatora dziesiętnego
        price: parseFloat(String(item.price).replace(',', '.')) || 0,
        currency: item.currency?.trim() || '',
        unit: item.unit?.trim() || 'szt.',
        minQuantity: parseInt(item.minQuantity) || 1,
        notes: item.notes?.trim() || '',
        lineNumber: i + 1
      });
    }
  }
  
  console.log(`✅ Sparsowano ${items.length} pozycji`);
  
  // Informacja które kolumny opcjonalne były w pliku (do warunkowej aktualizacji)
  const columnsInFile = Object.keys(columnIndices);
  
  return {
    items,
    duplicates: Object.entries(skuCounts)
      .filter(([sku, count]) => count > 1)
      .map(([sku, count]) => ({ sku, count })),
    columnsInFile
  };
};

/**
 * Waliduje dane z CSV
 * @param {Array} items - Pozycje do walidacji
 * @returns {Object} - Obiekt z valid i errors
 */
export const validatePriceListItems = (items) => {
  const valid = [];
  const errors = [];
  
  items.forEach(item => {
    const itemErrors = [];
    
    if (!item.sku || !item.sku.trim()) {
      itemErrors.push('Brak SKU');
    }
    
    if (typeof item.price !== 'number' || isNaN(item.price) || item.price < 0) {
      itemErrors.push('Niepoprawna cena (musi być liczbą nieujemną)');
    }
    
    if (!item.unit || !item.unit.trim()) {
      itemErrors.push('Brak jednostki');
    }
    
    if (typeof item.minQuantity !== 'number' || isNaN(item.minQuantity) || item.minQuantity <= 0) {
      itemErrors.push('Niepoprawne MOQ (musi być liczbą dodatnią)');
    }
    
    if (itemErrors.length > 0) {
      errors.push({
        lineNumber: item.lineNumber,
        sku: item.sku,
        errors: itemErrors
      });
    } else {
      valid.push(item);
    }
  });
  
  console.log(`✅ Walidacja: ${valid.length} poprawnych, ${errors.length} błędów`);
  
  return { valid, errors };
};

/**
 * Dopasowuje SKU do produktów/receptur w bazie danych
 * @param {Array} items - Pozycje do dopasowania
 * @returns {Promise<Object>} - Obiekt z matched i notFound
 */
export const matchProductsWithDatabase = async (items) => {
  try {
    console.log('🔄 Rozpoczynam dopasowywanie produktów...');
    
    // Pobierz wszystkie receptury
    const recipes = await getAllRecipes();
    console.log(`📦 Pobrano ${recipes.length} receptur`);
    
    // Pobierz usługi (kategoria "Inne")
    let services = [];
    try {
      const servicesData = await getInventoryItemsByCategory('Inne');
      services = servicesData?.items || servicesData || [];
      console.log(`🛠️ Pobrano ${services.length} usług`);
    } catch (error) {
      console.warn('⚠️ Nie udało się pobrać usług:', error);
    }
    
    // Utwórz mapę nazw do produktów (case-insensitive)
    const productMap = new Map();
    
    recipes.forEach(recipe => {
      const key = recipe.name.toLowerCase().trim();
      productMap.set(key, {
        id: recipe.id,
        name: recipe.name,
        type: 'recipe',
        isRecipe: true,
        unit: recipe.yield?.unit || 'szt.'
      });
    });
    
    services.forEach(service => {
      const key = service.name.toLowerCase().trim();
      productMap.set(key, {
        id: service.id,
        name: service.name,
        type: 'service',
        isRecipe: false,
        unit: service.unit || 'szt.'
      });
    });
    
    console.log(`📊 Mapa produktów: ${productMap.size} unikalnych produktów`);
    
    // Dopasuj pozycje z CSV do produktów w bazie
    const matched = [];
    const notFound = [];
    
    items.forEach(item => {
      const key = item.sku.toLowerCase().trim();
      const product = productMap.get(key);
      
      if (product) {
        matched.push({
          ...item,
          productId: product.id,
          productName: product.name,
          isRecipe: product.isRecipe,
          matchedType: product.type
        });
      } else {
        notFound.push(item);
      }
    });
    
    console.log(`✅ Dopasowano: ${matched.length}, nie znaleziono: ${notFound.length}`);
    
    return { matched, notFound };
  } catch (error) {
    console.error('❌ Błąd podczas dopasowywania produktów:', error);
    throw new Error(`Błąd dopasowywania produktów: ${error.message}`);
  }
};

/**
 * Generuje podgląd importu przed wykonaniem
 * @param {string} csvText - Zawartość pliku CSV
 * @param {string} priceListId - ID listy cenowej
 * @returns {Promise<Object>} - Podgląd zmian
 */
export const previewPriceListImport = async (csvText, priceListId) => {
  try {
    console.log('🔍 Rozpoczynam analizę pliku CSV...');
    
    // 1. Parsuj CSV
    const { items: parsedItems, duplicates, columnsInFile } = parsePriceListCSV(csvText);
    
    // 2. Waliduj dane
    const { valid, errors } = validatePriceListItems(parsedItems);
    
    // 3. Dopasuj produkty do bazy danych
    const { matched, notFound } = await matchProductsWithDatabase(valid);
    
    // 4. Pobierz istniejące pozycje listy cenowej
    const existingItems = await getPriceListItems(priceListId);
    const existingMap = new Map(
      existingItems.map(item => [item.productId, item])
    );
    
    console.log(`📋 Istniejące pozycje w liście cenowej: ${existingItems.length}`);
    
    // 5. Określ operacje: create vs update
    const toCreate = [];
    const toUpdate = [];
    
    matched.forEach(item => {
      const existing = existingMap.get(item.productId);
      
      if (existing) {
        // Produkt już istnieje - sprawdź różnice (tylko dla kolumn obecnych w CSV)
        const changes = [];
        
        if (existing.price !== item.price) {
          changes.push({ 
            field: 'Cena', 
            oldValue: existing.price.toFixed(2), 
            newValue: item.price.toFixed(2) 
          });
        }
        
        if (columnsInFile.includes('minQuantity') && existing.minQuantity !== item.minQuantity) {
          changes.push({ 
            field: 'MOQ', 
            oldValue: existing.minQuantity, 
            newValue: item.minQuantity 
          });
        }
        
        if (columnsInFile.includes('unit') && existing.unit !== item.unit) {
          changes.push({ 
            field: 'Jednostka', 
            oldValue: existing.unit, 
            newValue: item.unit 
          });
        }
        
        if (columnsInFile.includes('currency') && (existing.currency || 'EUR') !== (item.currency || 'EUR')) {
          changes.push({ 
            field: 'Waluta', 
            oldValue: existing.currency || 'EUR', 
            newValue: item.currency || 'EUR' 
          });
        }
        
        if (columnsInFile.includes('notes') && (existing.notes || '') !== item.notes) {
          changes.push({ 
            field: 'Komentarz', 
            oldValue: existing.notes || '-', 
            newValue: item.notes || '-' 
          });
        }
        
        if (changes.length > 0) {
          toUpdate.push({
            ...item,
            existingId: existing.id,
            changes
          });
        }
      } else {
        // Nowa pozycja
        toCreate.push(item);
      }
    });
    
    // 6. Przygotuj ostrzeżenia
    const warnings = [];
    
    if (duplicates.length > 0) {
      duplicates.forEach(dup => {
        warnings.push({
          type: 'warning',
          message: `SKU "${dup.sku}" występuje ${dup.count} razy w pliku. Zostanie użyta ostatnia wartość.`
        });
      });
    }
    
    console.log('📊 Podsumowanie podglądu:');
    console.log(`  - Do dodania: ${toCreate.length}`);
    console.log(`  - Do aktualizacji: ${toUpdate.length}`);
    console.log(`  - Nie znaleziono: ${notFound.length}`);
    console.log(`  - Błędy: ${errors.length}`);
    console.log(`  - Ostrzeżenia: ${warnings.length}`);
    
    return {
      toCreate,
      toUpdate,
      notFound,
      errors,
      warnings,
      columnsInFile,
      summary: {
        total: parsedItems.length,
        valid: valid.length,
        toCreate: toCreate.length,
        toUpdate: toUpdate.length,
        notFound: notFound.length,
        errors: errors.length,
        warnings: warnings.length
      }
    };
  } catch (error) {
    console.error('❌ Błąd podczas analizy pliku:', error);
    throw new Error(`Błąd podczas analizy pliku: ${error.message}`);
  }
};

/**
 * Wykonuje import danych do listy cenowej
 * @param {Object} preview - Podgląd z previewPriceListImport
 * @param {string} priceListId - ID listy cenowej
 * @param {string} userId - ID użytkownika wykonującego import
 * @param {Object} options - Opcje importu
 * @returns {Promise<Object>} - Wyniki importu
 */
export const executePriceListImport = async (
  preview,
  priceListId,
  userId,
  options = {}
) => {
  const {
    updateExisting = true,
    skipNotFound = true
  } = options;
  
  const results = {
    created: 0,
    updated: 0,
    skipped: 0,
    errors: []
  };
  
  try {
    console.log('🚀 Rozpoczynam import...');
    console.log('Opcje:', { updateExisting, skipNotFound });
    
    const batch = writeBatch(db);
    const itemsCollection = collection(db, PRICE_LIST_ITEMS_COLLECTION);
    let batchCount = 0;
    const MAX_BATCH_SIZE = 500; // Limit Firestore
    
    // Dodaj nowe pozycje
    for (const item of preview.toCreate) {
      const docRef = doc(itemsCollection);
      batch.set(docRef, {
        priceListId,
        productId: item.productId,
        productName: item.productName,
        price: item.price,
        currency: item.currency || 'EUR',
        unit: item.unit,
        minQuantity: item.minQuantity,
        notes: item.notes,
        isRecipe: item.isRecipe,
        itemType: item.matchedType,
        createdBy: userId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      results.created++;
      batchCount++;
      
      // Commit jeśli osiągnięto limit
      if (batchCount >= MAX_BATCH_SIZE) {
        await batch.commit();
        console.log(`📦 Zapisano batch ${Math.ceil(results.created / MAX_BATCH_SIZE)}`);
        batchCount = 0;
      }
    }
    
    // Aktualizuj istniejące pozycje (tylko pola obecne w CSV - unikamy nadpisywania pustymi wartościami)
    const columnsInFile = preview.columnsInFile || [];
    if (updateExisting) {
      for (const item of preview.toUpdate) {
        const docRef = doc(db, PRICE_LIST_ITEMS_COLLECTION, item.existingId);
        const updatePayload = {
          price: item.price,
          updatedBy: userId,
          updatedAt: serverTimestamp()
        };
        if (columnsInFile.includes('currency')) {
          updatePayload.currency = item.currency || 'EUR';
        }
        if (columnsInFile.includes('unit')) {
          updatePayload.unit = item.unit;
        }
        if (columnsInFile.includes('minQuantity')) {
          updatePayload.minQuantity = item.minQuantity;
        }
        if (columnsInFile.includes('notes')) {
          updatePayload.notes = item.notes ?? '';
        }
        batch.update(docRef, updatePayload);
        results.updated++;
        batchCount++;
        
        // Commit jeśli osiągnięto limit
        if (batchCount >= MAX_BATCH_SIZE) {
          await batch.commit();
          console.log(`📦 Zapisano batch ${Math.ceil((results.created + results.updated) / MAX_BATCH_SIZE)}`);
          batchCount = 0;
        }
      }
    } else {
      results.skipped += preview.toUpdate.length;
    }
    
    // Commit pozostałych operacji
    if (batchCount > 0) {
      await batch.commit();
      console.log('📦 Zapisano ostatni batch');
    }
    
    console.log('✅ Import zakończony pomyślnie:');
    console.log(`  - Utworzono: ${results.created}`);
    console.log(`  - Zaktualizowano: ${results.updated}`);
    console.log(`  - Pominięto: ${results.skipped}`);
    
    return results;
  } catch (error) {
    console.error('❌ Błąd podczas importu:', error);
    throw new Error(`Import nie powiódł się: ${error.message}`);
  }
};

/**
 * Generuje szablon CSV do pobrania
 * @returns {string} - Zawartość szablonu CSV
 */
export const generatePriceListTemplate = () => {
  const headers = ['SKU', 'PRICE', 'CURRENCY', 'UNIT', 'MOQ', 'COMMENTS'];
  const exampleRows = [
    ['Nazwa produktu lub receptury 1', '100.00', 'EUR', 'kg', '10', 'Pakowanie 25kg'],
    ['Nazwa produktu lub receptury 2', '75.50', 'EUR', 'szt', '5', 'Minimum order 5 units'],
    ['Nazwa produktu lub receptury 3', '250.00', 'PLN', 'l', '1', '']
  ];
  
  const csvLines = [
    headers.join(','),
    ...exampleRows.map(row => row.map(val => `"${val}"`).join(','))
  ];
  
  return csvLines.join('\n');
};
