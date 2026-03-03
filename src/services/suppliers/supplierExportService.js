/**
 * Supplier Export/Import Service
 * Serwis do eksportu i importu dostawców w formacie CSV
 */

import { getAllSuppliers, createSupplier, updateSupplier } from './supplierService';

// Mapowanie nagłówków CSV na pola dostawcy
const CSV_HEADER_MAP = {
  'COMPANY NAME': 'name',
  'CONTACT PERSON': 'contactPerson',
  'EMAIL': 'email',
  'PHONE': 'phone',
  'VAT EU': 'vatEu',
  'NOTES': 'notes'
};

// Odwrotne mapowanie - pola na nagłówki
const FIELD_TO_HEADER = {
  name: 'COMPANY NAME',
  contactPerson: 'CONTACT PERSON',
  email: 'EMAIL',
  phone: 'PHONE',
  vatEu: 'VAT EU',
  notes: 'NOTES'
};

// Kolejność kolumn w eksporcie
const EXPORT_COLUMNS = ['name', 'contactPerson', 'email', 'phone', 'vatEu', 'notes'];

/**
 * Pomocnicza funkcja do escape'owania pól CSV
 * @param {string} field - Wartość pola
 * @returns {string} - Escaped wartość
 */
const escapeCSVField = (field) => {
  const str = String(field || '');
  // Jeśli pole zawiera średnik, cudzysłów lub nową linię - otocz cudzysłowami
  if (str.includes(';') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
};

/**
 * Parsuje pojedynczą linię CSV z obsługą cudzysłowów i multiline
 * @param {string} line - Linia CSV
 * @param {string} separator - Separator (domyślnie ;)
 * @returns {Array} - Tablica wartości
 */
const parseCSVLine = (line, separator = ';') => {
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
      values.push(currentValue);
      currentValue = '';
    } else {
      currentValue += char;
    }
  }
  values.push(currentValue);
  
  return values;
};

/**
 * Eksportuje dostawców do formatu CSV
 * @param {Array} suppliers - Lista dostawców do eksportu
 * @returns {string} - Zawartość CSV
 */
export const exportSuppliersToCSV = (suppliers) => {
  const BOM = '\uFEFF'; // BOM dla UTF-8
  const separator = ';';
  
  // Nagłówki
  const headers = EXPORT_COLUMNS.map(field => FIELD_TO_HEADER[field]);
  const csvRows = [headers.join(separator)];
  
  // Dane
  suppliers.forEach(supplier => {
    const row = EXPORT_COLUMNS.map(field => escapeCSVField(supplier[field] || ''));
    csvRows.push(row.join(separator));
  });
  
  return BOM + csvRows.join('\n');
};

/**
 * Pobiera wszystkich dostawców i eksportuje do CSV
 * @returns {Promise<string>} - Zawartość CSV
 */
export const exportAllSuppliersToCSV = async () => {
  const suppliers = await getAllSuppliers();
  return exportSuppliersToCSV(suppliers);
};

/**
 * Pobiera i pobiera plik CSV z dostawcami
 * @param {string} filename - Nazwa pliku (bez rozszerzenia)
 */
export const downloadSuppliersCSV = async (filename = 'suppliers') => {
  try {
    const csvContent = await exportAllSuppliersToCSV();
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${filename}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    return true;
  } catch (error) {
    console.error('Błąd podczas eksportu dostawców do CSV:', error);
    throw error;
  }
};

/**
 * Parsuje tekst CSV na listę obiektów dostawców
 * @param {string} csvText - Zawartość pliku CSV
 * @returns {Array} - Lista obiektów dostawców
 */
export const parseSuppliersCSV = (csvText) => {
  // Usuń BOM jeśli istnieje
  const cleanText = csvText.replace(/^\uFEFF/, '');
  
  // Podziel na linie, obsługując różne formaty końca linii
  // Ale zachowaj linie wewnątrz cudzysłowów
  const lines = [];
  let currentLine = '';
  let insideQuotes = false;
  
  for (let i = 0; i < cleanText.length; i++) {
    const char = cleanText[i];
    const nextChar = cleanText[i + 1];
    
    if (char === '"') {
      if (insideQuotes && nextChar === '"') {
        currentLine += '""';
        i++;
      } else {
        insideQuotes = !insideQuotes;
        currentLine += char;
      }
    } else if ((char === '\n' || (char === '\r' && nextChar === '\n')) && !insideQuotes) {
      if (currentLine.trim()) {
        lines.push(currentLine);
      }
      currentLine = '';
      if (char === '\r') i++; // Skip \n after \r
    } else if (char === '\r' && !insideQuotes) {
      if (currentLine.trim()) {
        lines.push(currentLine);
      }
      currentLine = '';
    } else {
      currentLine += char;
    }
  }
  if (currentLine.trim()) {
    lines.push(currentLine);
  }
  
  if (lines.length < 1) {
    throw new Error('Plik CSV jest pusty');
  }
  
  // Automatyczne wykrywanie separatora
  const firstLine = lines[0];
  const commaCount = (firstLine.match(/,/g) || []).length;
  const semicolonCount = (firstLine.match(/;/g) || []).length;
  const separator = semicolonCount >= commaCount ? ';' : ',';
  
  console.log(`🔍 Wykryto separator: "${separator}" (przecinki: ${commaCount}, średniki: ${semicolonCount})`);
  
  // Parsuj nagłówki
  const rawHeaders = parseCSVLine(lines[0], separator);
  console.log('📋 Nagłówki CSV:', rawHeaders);
  
  // Znajdź indeksy kolumn na podstawie nagłówków
  const columnIndices = {};
  rawHeaders.forEach((header, index) => {
    const normalizedHeader = header.trim().toUpperCase();
    const fieldName = CSV_HEADER_MAP[normalizedHeader];
    if (fieldName) {
      columnIndices[fieldName] = index;
    }
  });
  
  console.log('📊 Mapowanie kolumn:', columnIndices);
  
  // Parsuj dane
  const suppliers = [];
  
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i], separator);
    const supplier = {};
    
    Object.entries(columnIndices).forEach(([fieldName, colIndex]) => {
      if (values[colIndex] !== undefined) {
        supplier[fieldName] = values[colIndex].trim();
      }
    });
    
    // Walidacja - wymagana nazwa firmy
    if (supplier.name && supplier.name.trim()) {
      suppliers.push(supplier);
    }
  }
  
  console.log(`✅ Sparsowano ${suppliers.length} dostawców`);
  
  return suppliers;
};

/**
 * Analizuje plik CSV i zwraca podgląd zmian
 * @param {string} csvText - Zawartość pliku CSV
 * @returns {Promise<Object>} - Obiekt z podglądem zmian
 */
export const previewSuppliersImport = async (csvText) => {
  const parsedSuppliers = parseSuppliersCSV(csvText);
  const existingSuppliers = await getAllSuppliers();
  
  // Mapa istniejących dostawców po nazwie (case-insensitive)
  const existingMap = new Map(
    existingSuppliers.map(s => [s.name.toLowerCase().trim(), s])
  );
  
  const preview = {
    toCreate: [],
    toUpdate: [],
    unchanged: [],
    errors: []
  };
  
  parsedSuppliers.forEach(supplier => {
    const key = supplier.name.toLowerCase().trim();
    const existing = existingMap.get(key);
    
    if (existing) {
      // Sprawdź czy są zmiany
      const changes = [];
      
      EXPORT_COLUMNS.forEach(field => {
        if (field === 'name') return; // Pomijamy nazwę - to klucz
        
        const oldValue = (existing[field] || '').trim();
        const newValue = (supplier[field] || '').trim();
        
        if (oldValue !== newValue) {
          changes.push({
            field: FIELD_TO_HEADER[field],
            oldValue,
            newValue
          });
        }
      });
      
      if (changes.length > 0) {
        preview.toUpdate.push({
          id: existing.id,
          name: supplier.name,
          changes,
          newData: supplier
        });
      } else {
        preview.unchanged.push({
          id: existing.id,
          name: supplier.name
        });
      }
    } else {
      preview.toCreate.push(supplier);
    }
  });
  
  return preview;
};

/**
 * Importuje dostawców z parsowanych danych CSV
 * @param {Array} suppliersData - Lista obiektów dostawców
 * @param {string} userId - ID użytkownika wykonującego import
 * @param {Object} options - Opcje importu
 * @returns {Promise<Object>} - Wynik importu
 */
export const importSuppliersFromCSV = async (suppliersData, userId, options = {}) => {
  const { updateExisting = true, onlyNew = false } = options;
  
  const results = {
    created: 0,
    updated: 0,
    skipped: 0,
    errors: []
  };
  
  // Pobierz istniejących dostawców
  const existingSuppliers = await getAllSuppliers();
  const existingMap = new Map(
    existingSuppliers.map(s => [s.name.toLowerCase().trim(), s])
  );
  
  for (const supplierData of suppliersData) {
    try {
      const key = supplierData.name.toLowerCase().trim();
      const existingSupplier = existingMap.get(key);
      
      if (existingSupplier) {
        if (updateExisting && !onlyNew) {
          // Zachowaj istniejące pola, które nie są w imporcie
          const mergedData = {
            ...existingSupplier,
            ...supplierData,
            // Zachowaj adresy jeśli istnieją
            addresses: existingSupplier.addresses || []
          };
          
          await updateSupplier(existingSupplier.id, mergedData, userId);
          results.updated++;
        } else {
          results.skipped++;
        }
      } else {
        // Nowy dostawca
        await createSupplier({
          ...supplierData,
          addresses: []
        }, userId);
        results.created++;
      }
    } catch (error) {
      console.error(`Błąd importu dostawcy ${supplierData.name}:`, error);
      results.errors.push({
        supplier: supplierData.name,
        error: error.message
      });
    }
  }
  
  return results;
};

/**
 * Generuje szablon CSV do importu dostawców
 * @returns {string} - Zawartość szablonu CSV
 */
export const generateSupplierCSVTemplate = () => {
  const BOM = '\uFEFF';
  const separator = ';';
  
  const headers = EXPORT_COLUMNS.map(field => FIELD_TO_HEADER[field]);
  
  // Przykładowy wiersz
  const exampleRow = [
    'Example Company Ltd.',
    'John Doe',
    'john@example.com',
    '+48 123 456 789',
    'PL1234567890',
    'Example notes'
  ];
  
  return BOM + headers.join(separator) + '\n' + exampleRow.join(separator);
};

/**
 * Pobiera szablon CSV
 * @param {string} filename - Nazwa pliku
 */
export const downloadSupplierCSVTemplate = (filename = 'suppliers_template') => {
  const csvContent = generateSupplierCSVTemplate();
  
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', `${filename}.csv`);
  document.body.appendChild(link);
  link.click();
  
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};




