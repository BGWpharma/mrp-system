import { useState } from 'react';
import { getAllInventoryItems } from '../../services/inventory';
import { getBatchesWithFilters } from '../../services/inventory/batchService';
import { convertTimestampToDate, isDefaultDate } from '../../services/inventory/utils/formatters';
import { exportToExcel, exportToCSV } from '../../utils/exportUtils';
import { formatDate } from '../../utils/formatting';
import { INVENTORY_CATEGORIES } from '../../utils/constants';
import { useNotification } from '../useNotification';

export function useInventoryExport({ selectedWarehouse, tableSort, debouncedSearchTerm, debouncedSearchCategory, setMainTableLoading, warehouses }) {
  const { showSuccess, showError } = useNotification();

  const [exportCategoryDialogOpen, setExportCategoryDialogOpen] = useState(false);
  const [selectedExportCategories, setSelectedExportCategories] = useState([]);

  const openExportCategoryDialog = () => {
    setSelectedExportCategories([...Object.values(INVENTORY_CATEGORIES)]);
    setExportCategoryDialogOpen(true);
  };

  const handleExportCategoryToggle = (category) => {
    setSelectedExportCategories(prev =>
      prev.includes(category) ? prev.filter(c => c !== category) : [...prev, category]
    );
  };

  const handleSelectAllCategories = () => {
    if (selectedExportCategories.length === Object.values(INVENTORY_CATEGORIES).length) {
      setSelectedExportCategories([]);
    } else {
      setSelectedExportCategories([...Object.values(INVENTORY_CATEGORIES)]);
    }
  };

  const generateCsvReport = async () => {
    try {
      setExportCategoryDialogOpen(false);
      setMainTableLoading(true);
      showSuccess('Generowanie raportu CSV...');

      const allItems = await getAllInventoryItems(
        selectedWarehouse || null, null, null,
        debouncedSearchTerm?.trim() !== '' ? debouncedSearchTerm : null,
        debouncedSearchCategory?.trim() !== '' ? debouncedSearchCategory : null,
        tableSort.field, tableSort.order
      );

      let itemsToExport = Array.isArray(allItems.items) ? allItems.items : allItems;

      if (selectedExportCategories.length > 0 && selectedExportCategories.length < Object.values(INVENTORY_CATEGORIES).length) {
        itemsToExport = itemsToExport.filter(item => selectedExportCategories.includes(item.category));
      }

      if (itemsToExport.length === 0) {
        showError('Brak pozycji do wyeksportowania dla wybranych kategorii');
        setMainTableLoading(false);
        return;
      }

      const filterParams = selectedWarehouse ? { warehouseId: selectedWarehouse } : {};
      const allBatches = await getBatchesWithFilters(filterParams);

      const avgPriceByItemId = {};
      if (allBatches && allBatches.length > 0) {
        allBatches.forEach(batch => {
          const itemId = batch.itemId;
          const batchQuantity = batch.quantity || 0;
          const batchPrice = batch.unitPrice || 0;
          if (batchQuantity > 0) {
            if (!avgPriceByItemId[itemId]) avgPriceByItemId[itemId] = { totalValue: 0, totalQuantity: 0 };
            avgPriceByItemId[itemId].totalValue += batchQuantity * batchPrice;
            avgPriceByItemId[itemId].totalQuantity += batchQuantity;
          }
        });
      }

      const data = itemsToExport.map(item => {
        const bookedQuantity = Number(item.bookedQuantity) || 0;
        const availableQuantity = Number(item.quantity) - bookedQuantity;
        const priceData = avgPriceByItemId[item.id];
        const avgPriceFromActiveBatches = priceData && priceData.totalQuantity > 0 ? (priceData.totalValue / priceData.totalQuantity).toFixed(4) : '-';
        return {
          category: item.category || '', sku: item.name || '', casNumber: item.casNumber || '',
          barcode: item.barcode || '', totalQuantity: (Number(item.quantity) || 0).toFixed(2),
          unit: item.unit || 'pcs.', reservedQuantity: bookedQuantity.toFixed(2),
          availableQuantity: availableQuantity.toFixed(2), avgPriceFromActiveBatches,
          location: item.warehouseName || '', minStockLevel: item.minStockLevel || '',
          maxStockLevel: item.maxStockLevel || '', cardboardPerPallet: item.boxesPerPallet || '',
          pcsPerCardboard: item.itemsPerBox || '', grossWeight: item.weight || '',
          description: item.description || ''
        };
      });

      const headers = [
        { label: 'Category', key: 'category' }, { label: 'SKU', key: 'sku' },
        { label: 'CAS Number', key: 'casNumber' }, { label: 'Barcode', key: 'barcode' },
        { label: 'Total Quantity', key: 'totalQuantity' }, { label: 'Unit', key: 'unit' },
        { label: 'Reserved Quantity', key: 'reservedQuantity' }, { label: 'Available Quantity', key: 'availableQuantity' },
        { label: 'Avg Price from Active Batches (EUR)', key: 'avgPriceFromActiveBatches' },
        { label: 'Location', key: 'location' }, { label: 'Min Stock Level', key: 'minStockLevel' },
        { label: 'Max Stock Level', key: 'maxStockLevel' }, { label: 'Cardboard Per Pallet', key: 'cardboardPerPallet' },
        { label: 'Pcs Per Cardboard', key: 'pcsPerCardboard' }, { label: 'Gross Weight (kg)', key: 'grossWeight' },
        { label: 'Description', key: 'description' }
      ];

      const success = exportToCSV(data, headers, `Inventory_Stock_Report_${new Date().toISOString().slice(0, 10)}`);
      if (success) showSuccess(`Raport CSV został wygenerowany (${data.length} pozycji)`);
      else showError('Błąd podczas generowania raportu CSV');
    } catch (error) {
      console.error('Błąd podczas generowania raportu CSV:', error);
      showError('Błąd podczas generowania raportu CSV: ' + error.message);
    } finally {
      setMainTableLoading(false);
    }
  };

  const generateBatchesExportCSV = async () => {
    try {
      setMainTableLoading(true);
      showSuccess('Generowanie eksportu partii...');

      const filterParams = selectedWarehouse ? { warehouseId: selectedWarehouse } : {};
      const allBatches = await getBatchesWithFilters(filterParams);

      if (!allBatches || allBatches.length === 0) {
        showError('Brak partii do wyeksportowania');
        setMainTableLoading(false);
        return;
      }

      const allItems = await getAllInventoryItems(selectedWarehouse || null, null, null, null, null, 'name', 'asc');
      const itemsArray = Array.isArray(allItems.items) ? allItems.items : allItems;
      const itemsMap = {};
      itemsArray.forEach(item => { itemsMap[item.id] = item; });

      const batchesData = allBatches.map(batch => {
        const item = itemsMap[batch.itemId];
        const batchValue = (batch.quantity || 0) * (batch.unitPrice || 0);
        return {
          itemName: item?.name || 'Unknown item', itemCategory: item?.category || '',
          batchNumber: batch.batchNumber || batch.lotNumber || '-',
          warehouseName: batch.warehouseName || warehouses.find(w => w.id === batch.warehouseId)?.name || '',
          quantity: (batch.quantity || 0).toFixed(4), unit: item?.unit || batch.unit || 'pcs',
          availableQuantity: Math.max(0, (batch.quantity || 0) - (batch.bookedQuantity || 0)).toFixed(4),
          unitPrice: batch.unitPrice ? (batch.unitPrice).toFixed(4) : '-',
          batchValue: batchValue.toFixed(2),
          baseUnitPrice: batch.baseUnitPrice ? (batch.baseUnitPrice).toFixed(4) : '-',
          additionalCostPerUnit: batch.additionalCostPerUnit ? (batch.additionalCostPerUnit).toFixed(4) : '-',
          expiryDate: batch.expiryDate && !isDefaultDate(convertTimestampToDate(batch.expiryDate))
            ? convertTimestampToDate(batch.expiryDate)?.toLocaleDateString('en-GB') : '-',
          notes: batch.notes || '',
          _quantityNum: batch.quantity || 0, _batchValueNum: batchValue
        };
      }).sort((a, b) => {
        const nameCompare = a.itemName.localeCompare(b.itemName);
        return nameCompare !== 0 ? nameCompare : a.batchNumber.localeCompare(b.batchNumber);
      });

      const totalQuantity = batchesData.reduce((sum, b) => sum + b._quantityNum, 0);
      const totalValue = batchesData.reduce((sum, b) => sum + b._batchValueNum, 0);
      batchesData.push({
        itemName: '--- TOTAL ---', itemCategory: '', batchNumber: '', warehouseName: '',
        quantity: totalQuantity.toFixed(4), unit: '', availableQuantity: '',
        unitPrice: '', batchValue: totalValue.toFixed(2), baseUnitPrice: '',
        additionalCostPerUnit: '', expiryDate: '', notes: ''
      });

      const batchesHeaders = [
        { label: 'Item Name', key: 'itemName' }, { label: 'Category', key: 'itemCategory' },
        { label: 'Batch/LOT Number', key: 'batchNumber' }, { label: 'Warehouse', key: 'warehouseName' },
        { label: 'Quantity', key: 'quantity' }, { label: 'Unit', key: 'unit' },
        { label: 'Available Quantity', key: 'availableQuantity' }, { label: 'Unit Price (EUR)', key: 'unitPrice' },
        { label: 'Total Value (qty × price) (EUR)', key: 'batchValue' },
        { label: 'Base Price (EUR)', key: 'baseUnitPrice' },
        { label: 'Additional Cost/unit (EUR)', key: 'additionalCostPerUnit' },
        { label: 'Expiry Date', key: 'expiryDate' }, { label: 'Notes', key: 'notes' }
      ];

      const itemValuesMap = {};
      allBatches.forEach(batch => {
        const itemId = batch.itemId;
        const batchQuantity = batch.quantity || 0;
        const batchValueCalc = batchQuantity * (batch.unitPrice || 0);
        if (!itemValuesMap[itemId]) {
          const item = itemsMap[itemId];
          itemValuesMap[itemId] = {
            itemName: item?.name || 'Unknown item', itemCategory: item?.category || '',
            warehouseName: item?.warehouseName || '', totalQuantity: 0,
            totalReservedQuantity: 0, totalAvailableQuantity: 0, batchesCount: 0,
            totalValue: 0, unit: item?.unit || 'pcs', activeQuantity: 0, activeValue: 0
          };
        }
        itemValuesMap[itemId].totalQuantity += batchQuantity;
        itemValuesMap[itemId].totalReservedQuantity += (batch.bookedQuantity || 0);
        itemValuesMap[itemId].totalValue += batchValueCalc;
        itemValuesMap[itemId].batchesCount += 1;
        if (batchQuantity > 0) {
          itemValuesMap[itemId].activeQuantity += batchQuantity;
          itemValuesMap[itemId].activeValue += batchValueCalc;
        }
      });

      const itemValuesData = Object.values(itemValuesMap).map(item => {
        item.totalAvailableQuantity = Math.max(0, item.totalQuantity - item.totalReservedQuantity);
        const avgPriceFromActive = item.activeQuantity > 0 ? (item.activeValue / item.activeQuantity) : 0;
        return {
          ...item, totalQuantity: item.totalQuantity.toFixed(4),
          totalAvailableQuantity: item.totalAvailableQuantity.toFixed(4),
          totalValue: item.totalValue.toFixed(2),
          averageUnitPrice: item.totalQuantity > 0 ? (item.totalValue / item.totalQuantity).toFixed(4) : '0.0000',
          avgPriceFromActiveBatches: avgPriceFromActive > 0 ? avgPriceFromActive.toFixed(4) : '-',
          _totalQuantityNum: item.totalQuantity,
          _totalAvailableQuantityNum: item.totalAvailableQuantity,
          _totalValueNum: item.totalValue
        };
      }).sort((a, b) => a.itemName.localeCompare(b.itemName));

      const sumTotalQuantity = itemValuesData.reduce((sum, i) => sum + i._totalQuantityNum, 0);
      const sumTotalAvailable = itemValuesData.reduce((sum, i) => sum + i._totalAvailableQuantityNum, 0);
      const sumTotalValue = itemValuesData.reduce((sum, i) => sum + i._totalValueNum, 0);
      itemValuesData.push({
        itemName: '--- TOTAL ---', itemCategory: '', totalQuantity: sumTotalQuantity.toFixed(4),
        unit: '', totalAvailableQuantity: sumTotalAvailable.toFixed(4), batchesCount: '',
        totalValue: sumTotalValue.toFixed(2), averageUnitPrice: '', avgPriceFromActiveBatches: ''
      });

      const itemValuesHeaders = [
        { label: 'Item Name', key: 'itemName' }, { label: 'Category', key: 'itemCategory' },
        { label: 'Total Quantity', key: 'totalQuantity' }, { label: 'Unit', key: 'unit' },
        { label: 'Total Available', key: 'totalAvailableQuantity' }, { label: 'Batches Count', key: 'batchesCount' },
        { label: 'Total Batches Value (EUR)', key: 'totalValue' },
        { label: 'Average Unit Price (EUR)', key: 'averageUnitPrice' },
        { label: 'Avg Price from Active Batches (EUR)', key: 'avgPriceFromActiveBatches' }
      ];

      const worksheets = [
        { name: 'Inventory Batches', data: batchesData, headers: batchesHeaders },
        { name: 'Item Values', data: itemValuesData, headers: itemValuesHeaders }
      ];

      const success = await exportToExcel(worksheets, `Batches_Export_${new Date().toISOString().slice(0, 10)}`);
      if (success) showSuccess(`Wyeksportowano ${batchesData.length} partii i ${itemValuesData.length} pozycji`);
      else showError('Błąd podczas generowania eksportu partii');
    } catch (error) {
      console.error('Błąd podczas generowania eksportu partii:', error);
      showError('Błąd podczas generowania eksportu partii: ' + error.message);
    } finally {
      setMainTableLoading(false);
    }
  };

  const handleExportReservations = (filteredReservations, selectedItem) => {
    try {
      const dataToExport = filteredReservations.map(reservation => ({
        'Data': formatDate(reservation.createdAt), 'Typ': reservation.type === 'booking' ? 'Rezerwacja' : 'Anulowanie',
        'Ilość': reservation.quantity, 'Jednostka': selectedItem?.unit || '',
        'Zadanie': reservation.taskName || reservation.taskId || '', 'Klient': reservation.clientName || '',
        'Status': reservation.fulfilled ? 'Zrealizowana' : 'Aktywna', 'Notatki': reservation.notes || ''
      }));
      const fileName = `rezerwacje_${selectedItem?.name.replace(/\s+/g, '_')}_${formatDate(new Date())}.csv`;
      exportToCSV(dataToExport, fileName);
      showSuccess('Eksport rezerwacji zakończony sukcesem');
    } catch (error) {
      console.error('Error exporting reservations:', error);
      showError('Błąd podczas eksportu rezerwacji');
    }
  };

  return {
    exportCategoryDialogOpen, setExportCategoryDialogOpen,
    selectedExportCategories,
    openExportCategoryDialog, handleExportCategoryToggle, handleSelectAllCategories,
    generateCsvReport, generateBatchesExportCSV, handleExportReservations
  };
}
