import { useState } from 'react';
import { getAllInventoryItems, getAllWarehouses } from '../../services/inventory';
import { useAuth } from '../useAuth';
import { useNotification } from '../useNotification';
import { useTranslation } from '../useTranslation';

const areNumericValuesEqual = (value1, value2) => {
  if (!value1 && !value2) return true;
  if (!value1 || !value2) return false;
  const num1 = parseFloat(value1);
  const num2 = parseFloat(value2);
  if (isNaN(num1) || isNaN(num2)) return value1.toString().trim() === value2.toString().trim();
  return Math.abs(num1 - num2) < 0.0001;
};

const parseCSV = (csvText) => {
  const lines = csvText.split('\n').filter(line => line.trim() !== '');
  if (lines.length < 2) throw new Error('Plik CSV jest pusty lub zawiera tylko nagłówki');
  const firstLine = lines[0];
  const commaCount = (firstLine.match(/,/g) || []).length;
  const semicolonCount = (firstLine.match(/;/g) || []).length;
  const separator = semicolonCount > commaCount ? ';' : ',';

  const rawHeaders = lines[0].split(separator).map(header => header.replace(/^"|"$/g, '').trim());
  const data = [];
  for (let i = 1; i < lines.length; i++) {
    const values = [];
    let currentValue = '';
    let insideQuotes = false;
    for (let j = 0; j < lines[i].length; j++) {
      const char = lines[i][j];
      const nextChar = lines[i][j + 1];
      if (char === '"') {
        if (insideQuotes && nextChar === '"') { currentValue += '"'; j++; }
        else { insideQuotes = !insideQuotes; }
      } else if (char === separator && !insideQuotes) {
        values.push(currentValue.trim()); currentValue = '';
      } else { currentValue += char; }
    }
    values.push(currentValue.trim());
    const row = {};
    rawHeaders.forEach((header, index) => { row[header] = values[index] || ''; });
    data.push(row);
  }
  return data;
};

export function useInventoryImport({ fetchInventoryItems, tableSort }) {
  const { currentUser } = useAuth();
  const { showSuccess, showError } = useNotification();
  const { t } = useTranslation('inventory');

  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importPreview, setImportPreview] = useState([]);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState(null);
  const [importWarnings, setImportWarnings] = useState([]);

  const handleOpenImportDialog = () => {
    setImportDialogOpen(true); setImportFile(null); setImportPreview([]);
    setImportError(null); setImportWarnings([]);
  };

  const handleCloseImportDialog = () => {
    setImportDialogOpen(false); setImportFile(null); setImportPreview([]);
    setImportError(null); setImportWarnings([]);
  };

  const handleFileSelect = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    setImportFile(file); setImportError(null); setImportPreview([]); setImportWarnings([]);

    try {
      const text = await file.text();
      const csvData = parseCSV(text);
      const allItemsData = await getAllInventoryItems();
      const allItems = Array.isArray(allItemsData.items) ? allItemsData.items : allItemsData;
      const warehousesList = await getAllWarehouses();

      const preview = [];
      const warnings = [];
      const csvHeaders = csvData.length > 0 ? Object.keys(csvData[0]) : [];
      const hasDescriptionColumn = csvHeaders.some(h => h.trim().toLowerCase() === 'description');

      const skuCounts = {};
      csvData.forEach(row => { const sku = row['SKU']; if (sku) skuCounts[sku] = (skuCounts[sku] || 0) + 1; });
      const duplicates = Object.entries(skuCounts).filter(([, count]) => count > 1);
      duplicates.forEach(([sku, count]) => {
        warnings.push({ sku, type: 'warning', message: `SKU "${sku}" występuje ${count} razy w pliku CSV. Zostanie użyty tylko ostatni wiersz.` });
      });

      for (const row of csvData) {
        const sku = row['SKU'];
        if (!sku) {
          warnings.push({ sku: '(pusty)', type: 'warning', message: 'Wiersz bez SKU został pominięty.' });
          continue;
        }

        const existingItem = allItems.find(i => i.name.trim().toLowerCase() === sku.trim().toLowerCase());
        if (!existingItem) {
          warnings.push({ sku, type: 'warning', message: `Pozycja o SKU "${sku}" nie istnieje w bazie danych. Import modyfikuje tylko istniejące pozycje.` });
          preview.push({ sku, status: 'new', message: 'Nowa pozycja (zostanie pominięta - tylko aktualizacje są obsługiwane)', changes: [] });
          continue;
        }

        const changes = [];
        const updateData = { name: existingItem.name };

        const fieldChecks = [
          { csv: 'Category', db: 'category', label: 'Kategoria' },
          { csv: 'CAS Number', db: 'casNumber', label: 'Numer CAS' },
          { csv: 'Barcode', db: 'barcode', label: 'Kod kreskowy' },
          { csv: 'Unit', db: 'unit', label: 'Jednostka' },
        ];

        fieldChecks.forEach(({ csv, db, label }) => {
          const csvVal = (row[csv] || '').trim();
          const dbVal = (existingItem[db] || '').trim();
          if (csvVal && csvVal !== dbVal) {
            changes.push({ field: label, oldValue: dbVal, newValue: csvVal });
            updateData[db] = csvVal;
          }
        });

        const csvLocation = (row['Location'] || '').trim();
        const dbLocationName = (existingItem.warehouseName || '').trim();
        if (csvLocation !== dbLocationName) {
          const newWarehouse = warehousesList.find(w => w.name.trim().toLowerCase() === csvLocation.toLowerCase());
          if (newWarehouse) {
            changes.push({ field: 'Lokalizacja', oldValue: dbLocationName, newValue: csvLocation });
            updateData.warehouseName = csvLocation;
          } else if (csvLocation) {
            warnings.push({ sku, type: 'warning', message: `Nieznany magazyn: "${csvLocation}". Lokalizacja nie zostanie zaktualizowana.` });
          }
        }

        const numericChecks = [
          { csv: 'Min Stock Level', db: 'minStockLevel', label: 'Min. stan magazynowy' },
          { csv: 'Max Stock Level', db: 'maxStockLevel', label: 'Max. stan magazynowy' },
          { csv: 'Cardboard Per Pallet', db: 'boxesPerPallet', label: 'Kartony na palecie' },
          { csv: 'Pcs Per Cardboard', db: 'itemsPerBox', label: 'Sztuki na karton' },
          { csv: 'Gross Weight (kg)', db: 'weight', label: 'Waga brutto (kg)' },
        ];

        numericChecks.forEach(({ csv, db, label }) => {
          const csvVal = (row[csv] || '').trim();
          const dbVal = (existingItem[db] || '').toString().trim();
          if (csvVal && !areNumericValuesEqual(csvVal, dbVal)) {
            changes.push({ field: label, oldValue: dbVal, newValue: csvVal });
            updateData[db] = csvVal;
          }
        });

        if (hasDescriptionColumn) {
          const descKey = csvHeaders.find(h => h.trim().toLowerCase() === 'description');
          const csvDesc = (row[descKey] || '').trim();
          const dbDesc = (existingItem.description || '').trim();
          if (csvDesc && csvDesc !== dbDesc) {
            changes.push({ field: 'Opis', oldValue: dbDesc, newValue: csvDesc });
            updateData.description = csvDesc;
          }
        }

        if (changes.length > 0) {
          preview.push({ sku, itemId: existingItem.id, status: 'update', message: `${changes.length} zmian(a) wykryta(ych)`, changes, updateData });
        } else {
          preview.push({ sku, status: 'no-change', message: 'Brak zmian', changes: [] });
        }
      }

      setImportPreview(preview);
      setImportWarnings(warnings);
      if (preview.filter(p => p.status === 'update').length === 0) setImportError(t('inventory:noChangesToImport'));
    } catch (error) {
      console.error('Błąd podczas parsowania pliku:', error);
      setImportError(error.message);
    }
  };

  const handleConfirmImport = async () => {
    setImporting(true);
    try {
      const { updateInventoryItem, getInventoryItemById } = await import('../../services/inventory/inventoryItemsService');
      const itemsToUpdate = importPreview.filter(p => p.status === 'update');
      let updatedCount = 0;
      let errorCount = 0;

      for (const item of itemsToUpdate) {
        try {
          await updateInventoryItem(item.itemId, item.updateData, currentUser.uid);
          updatedCount++;
        } catch (error) {
          console.error(`Błąd podczas aktualizacji pozycji ${item.sku}:`, error);
          errorCount++;
        }
      }

      if (updatedCount > 0) {
        const { recalculateItemQuantity } = await import('../../services/inventory/inventoryOperationsService');
        for (const item of itemsToUpdate) {
          if (item.status === 'update' && item.itemId) {
            try { await recalculateItemQuantity(item.itemId); } catch (error) { /* ignore */ }
          }
        }
      }

      showSuccess(`Import zakończony! Zaktualizowano ${updatedCount} pozycji. Błędy: ${errorCount}`);
      handleCloseImportDialog();
      await fetchInventoryItems(tableSort.field, tableSort.order);
    } catch (error) {
      console.error('Błąd podczas importu:', error);
      showError('Wystąpił błąd podczas importu: ' + error.message);
    } finally {
      setImporting(false);
    }
  };

  return {
    importDialogOpen, importFile, importPreview, importing, importError, importWarnings,
    handleOpenImportDialog, handleCloseImportDialog, handleFileSelect, handleConfirmImport
  };
}
