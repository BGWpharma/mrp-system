import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { format, parseISO, isValid } from 'date-fns';
import { pl } from 'date-fns/locale';
import {
  getPurchaseOrderById,
  updateBatchesForPurchaseOrder,
  updateBatchBasePricesForPurchaseOrder,
  PURCHASE_ORDER_STATUSES,
  getPOReservationsForItem
} from '../../services/purchaseOrders';
import { getBatchesByPurchaseOrderId, getInventoryBatch, getWarehouseById } from '../../services/inventory';
import { getInvoicesByOrderId, getReinvoicedAmountsByPOItems } from '../../services/finance';
import { useAuth } from '../../contexts/AuthContext';
import { useNotification } from '../useNotification';
import { useTranslation } from '../useTranslation';
import { getUsersDisplayNames } from '../../services/userService';
import { db } from '../../services/firebase/config';
import { collection, query, where, getDocs } from 'firebase/firestore';

export function usePOData(orderId) {
  const { t } = useTranslation('purchaseOrders');
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { showSuccess, showError } = useNotification();

  const [loading, setLoading] = useState(true);
  const [purchaseOrder, setPurchaseOrder] = useState(null);
  const [relatedBatches, setRelatedBatches] = useState([]);
  const [loadingBatches, setLoadingBatches] = useState(false);
  const [relatedRefInvoices, setRelatedRefInvoices] = useState([]);
  const [loadingRefInvoices, setLoadingRefInvoices] = useState(false);
  const [userNames, setUserNames] = useState({});
  const [warehouseNames, setWarehouseNames] = useState({});
  const [poReservationsByItem, setPOReservationsByItem] = useState({});
  const [loadingReservations, setLoadingReservations] = useState(false);
  const [reinvoicedAmounts, setReinvoicedAmounts] = useState({ items: {}, additionalCosts: {} });
  const [unloadingFormResponses, setUnloadingFormResponses] = useState([]);
  const [unloadingFormResponsesLoading, setUnloadingFormResponsesLoading] = useState(false);
  const [expandedItems, setExpandedItems] = useState({});
  const [coaMigrationDialogOpen, setCoaMigrationDialogOpen] = useState(false);
  const [menuAnchorRef, setMenuAnchorRef] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [pdfMenuAnchorEl, setPdfMenuAnchorEl] = useState(null);
  const [pdfMenuOpen, setPdfMenuOpen] = useState(false);

  // --- Fetch helpers ---

  const fetchRelatedBatches = async (poId) => {
    try {
      setLoadingBatches(true);
      const batches = await getBatchesByPurchaseOrderId(poId);
      const warehouseIds = [...new Set(batches.filter(b => b.warehouseId).map(b => b.warehouseId))];
      const warehouseData = {};
      for (const whId of warehouseIds) {
        try {
          const warehouse = await getWarehouseById(whId);
          if (warehouse) warehouseData[whId] = warehouse.name || whId;
        } catch { warehouseData[whId] = whId; }
      }
      setWarehouseNames(warehouseData);
      setRelatedBatches(batches.map(batch =>
        batch.warehouseId && warehouseData[batch.warehouseId]
          ? { ...batch, warehouseName: warehouseData[batch.warehouseId] }
          : batch
      ));
    } catch (error) {
      console.error('Błąd podczas pobierania powiązanych partii:', error);
    } finally {
      setLoadingBatches(false);
    }
  };

  const loadPOReservations = async (poId, items) => {
    try {
      setLoadingReservations(true);
      const reservationsByItem = {};
      for (const item of items) {
        if (item.id) {
          const reservations = await getPOReservationsForItem(poId, item.id);
          if (reservations.length > 0) reservationsByItem[item.id] = reservations;
        }
      }
      setPOReservationsByItem(reservationsByItem);
    } catch (error) {
      console.error('Błąd podczas ładowania rezerwacji PO:', error);
    } finally {
      setLoadingReservations(false);
    }
  };

  const fetchRefInvoices = async (poId, poData = null) => {
    try {
      setLoadingRefInvoices(true);
      const invoices = await getInvoicesByOrderId(poId);
      const refInvoices = invoices.filter(inv => inv.isRefInvoice === true);
      setRelatedRefInvoices(refInvoices);
      const reinvoiced = await getReinvoicedAmountsByPOItems(poId, invoices, poData);
      setReinvoicedAmounts(reinvoiced);
    } catch (error) {
      console.error('Błąd podczas pobierania refaktur:', error);
    } finally {
      setLoadingRefInvoices(false);
    }
  };

  const fetchUnloadingFormResponses = async (poNumber) => {
    if (!poNumber) return;
    setUnloadingFormResponsesLoading(true);
    try {
      const poVariants = [
        poNumber,
        poNumber.replace('PO-', ''),
        `PO-${poNumber}`,
      ].filter((v, i, a) => a.indexOf(v) === i);

      const unloadingQuery = query(
        collection(db, 'Forms/RozladunekTowaru/Odpowiedzi'),
        where('poNumber', 'in', poVariants)
      );
      const unloadingSnapshot = await getDocs(unloadingQuery);

      const convertDate = (dateValue) => {
        if (!dateValue) return null;
        try {
          if (dateValue.toDate && typeof dateValue.toDate === 'function') return dateValue.toDate();
          if (typeof dateValue === 'string') { const p = new Date(dateValue); return isNaN(p.getTime()) ? null : p; }
          if (dateValue instanceof Date) return dateValue;
        } catch { /* ignore */ }
        return null;
      };

      let unloadingData = unloadingSnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id, ...data,
          fillDate: data.fillDate?.toDate(),
          unloadingDate: data.unloadingDate?.toDate(),
          formType: 'unloading',
          selectedItems: data.selectedItems?.map(item => ({
            ...item,
            batches: item.batches?.map(batch => ({ ...batch, expiryDate: convertDate(batch.expiryDate) })) || [],
            expiryDate: convertDate(item.expiryDate)
          })) || []
        };
      });

      const sortByFillDate = (a, b) => (b.fillDate || new Date(0)) - (a.fillDate || new Date(0));
      setUnloadingFormResponses(unloadingData.sort(sortByFillDate));
    } catch (error) {
      console.error('Błąd podczas pobierania odpowiedzi formularzy rozładunku:', error);
      setUnloadingFormResponses([]);
    } finally {
      setUnloadingFormResponsesLoading(false);
    }
  };

  // --- Main fetch ---

  const fetchPurchaseOrder = useCallback(async () => {
    try {
      const data = await getPurchaseOrderById(orderId);
      setPurchaseOrder(data);
      if (data.statusHistory && data.statusHistory.length > 0) {
        const uniqueUserIds = [...new Set(data.statusHistory.map(c => c.changedBy).filter(Boolean))];
        const names = await getUsersDisplayNames(uniqueUserIds);
        setUserNames(names);
      }
      await fetchRelatedBatches(orderId);
      if (data.items && data.items.length > 0) await loadPOReservations(orderId, data.items);
      await fetchRefInvoices(orderId, data);
      if (data && data.number) fetchUnloadingFormResponses(data.number);
    } catch (error) {
      showError('Błąd podczas pobierania danych zamówienia: ' + error.message);
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  const refreshPurchaseOrderData = useCallback(async () => {
    if (!orderId) return;
    try {
      const data = await getPurchaseOrderById(orderId);
      setPurchaseOrder(data);
      await fetchRefInvoices(orderId, data);
      await fetchRelatedBatches(orderId);
    } catch (error) {
      console.error('Błąd podczas odświeżania danych zamówienia:', error);
    }
  }, [orderId]);

  useEffect(() => {
    let cancelled = false;
    if (orderId) fetchPurchaseOrder().then(() => { if (cancelled) return; });
    const refreshId = localStorage.getItem('refreshPurchaseOrder');
    if (refreshId === orderId) {
      localStorage.removeItem('refreshPurchaseOrder');
      setTimeout(() => {
        if (cancelled) return;
        fetchPurchaseOrder();
        showSuccess('Dane zamówienia zostały zaktualizowane po przyjęciu towaru');
      }, 500);
    }
    return () => { cancelled = true; };
  }, [orderId, showError]);

  useEffect(() => {
    const handleVisibilityChange = () => { if (document.visibilityState === 'visible' && orderId) refreshPurchaseOrderData(); };
    const handleWindowFocus = () => { if (orderId) refreshPurchaseOrderData(); };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleWindowFocus);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleWindowFocus);
    };
  }, [orderId, refreshPurchaseOrderData]);

  // --- Helpers ---

  const getBatchesByItemId = (itemId) => {
    if (!relatedBatches || relatedBatches.length === 0) return [];
    return relatedBatches.filter(batch =>
      (batch.purchaseOrderDetails && batch.purchaseOrderDetails.itemPoId === itemId) ||
      (batch.sourceDetails && batch.sourceDetails.itemPoId === itemId) ||
      (itemId === undefined)
    );
  };

  const getReservationsByItemId = (itemId) => poReservationsByItem[itemId] || [];

  const toggleItemExpansion = (itemId) => {
    setExpandedItems(prev => ({ ...prev, [itemId]: !prev[itemId] }));
  };

  const getUserName = (userId) => userNames[userId] || userId || 'System';

  const safeFormatDate = (date, formatString = 'dd.MM.yyyy') => {
    if (!date) return 'Brak daty';
    try {
      let dateObj;
      if (date instanceof Date) dateObj = date;
      else if (typeof date === 'string') dateObj = parseISO(date);
      else if (date && typeof date === 'object' && date.toDate) dateObj = date.toDate();
      else if (date && typeof date === 'object' && date.seconds) dateObj = new Date(date.seconds * 1000);
      else dateObj = new Date(date);
      if (!isValid(dateObj)) return 'Nieprawidłowa data';
      return format(dateObj, formatString, { locale: pl });
    } catch { return 'Błąd daty'; }
  };

  const formatDateLocal = (dateIsoString) => {
    if (!dateIsoString) return 'Nie określono';
    try {
      let date;
      if (dateIsoString && typeof dateIsoString.toDate === 'function') date = dateIsoString.toDate();
      else date = new Date(dateIsoString);
      if (isNaN(date.getTime())) return 'Nie określono';
      return format(date, 'dd MMMM yyyy', { locale: pl });
    } catch { return 'Błąd odczytu daty'; }
  };

  // --- Unloading form matching ---

  const getItemMatchingDiagnostics = (item) => {
    if (!unloadingFormResponses || unloadingFormResponses.length === 0)
      return { matchType: 'none', details: 'Brak formularzy rozładunku' };
    let matchByItemId = false, matchByName = false, conflictingItems = [];
    for (const response of unloadingFormResponses) {
      if (!response.selectedItems?.length) continue;
      if (response.selectedItems.find(si => si.poItemId && item.id && si.poItemId === item.id)) matchByItemId = true;
      const foundByName = response.selectedItems.filter(si => {
        const a = (item.name || '').toLowerCase().trim();
        const b = (si.productName || '').toLowerCase().trim();
        return a && b && a === b;
      });
      if (foundByName.length > 0) { matchByName = true; conflictingItems.push(...foundByName); }
    }
    if (matchByItemId && matchByName) return { matchType: 'both', details: 'Pozycja dopasowana zarówno po ID jak i nazwie', conflictCount: conflictingItems.length };
    if (matchByItemId) return { matchType: 'id', details: `Pozycja dopasowana dokładnie po ID: ${item.id}` };
    if (matchByName) return { matchType: 'name_only', details: `Pozycja dopasowana tylko po nazwie. Znaleziono ${conflictingItems.length} pozycji o tej nazwie`, conflictCount: conflictingItems.length };
    return { matchType: 'none', details: 'Pozycja nie znaleziona w formularzach rozładunku' };
  };

  const isItemInUnloadingForms = (item) => {
    if (!unloadingFormResponses || unloadingFormResponses.length === 0) return false;
    for (const response of unloadingFormResponses) {
      if (!response.selectedItems?.length) continue;
      if (response.selectedItems.find(si => si.poItemId && item.id && si.poItemId === item.id)) return true;
    }
    return false;
  };

  const getExpiryInfoFromUnloadingForms = (item) => {
    if (!unloadingFormResponses || unloadingFormResponses.length === 0)
      return { expiryDate: null, noExpiryDate: false, batches: [], reportsCount: 0 };

    const alreadyReceivedBatches = getBatchesByItemId(item.id);
    const receivedBatchNumbers = new Set(
      alreadyReceivedBatches.map(b => (b.lotNumber || b.batchNumber || '').toLowerCase().trim()).filter(Boolean)
    );

    const validateDate = (dateValue) => {
      if (!dateValue) return null;
      try {
        if (dateValue instanceof Date && !isNaN(dateValue.getTime())) return dateValue;
        if (typeof dateValue === 'string') { const p = new Date(dateValue); return !isNaN(p.getTime()) ? p : null; }
        if (dateValue.toDate && typeof dateValue.toDate === 'function') { const c = dateValue.toDate(); return !isNaN(c.getTime()) ? c : null; }
      } catch { /* ignore */ }
      return null;
    };

    const allBatches = [];
    let hasNoExpiryDate = false, firstExpiryDate = null;
    const matchedReportIds = new Set();

    for (const response of unloadingFormResponses) {
      if (!response.selectedItems?.length) continue;
      const foundItem = response.selectedItems.find(si => si.poItemId && item.id && si.poItemId === item.id);
      if (!foundItem) continue;

      matchedReportIds.add(response.id);

      if (foundItem.batches && Array.isArray(foundItem.batches) && foundItem.batches.length > 0) {
        const validBatches = foundItem.batches
          .map(batch => ({
            batchNumber: batch.batchNumber || '',
            unloadedQuantity: batch.unloadedQuantity || '',
            expiryDate: validateDate(batch.expiryDate),
            noExpiryDate: batch.noExpiryDate || false,
            sourceReportId: response.id,
            sourceReportDate: response.fillDate || response.createdAt
          }))
          .filter(batch => {
            const batchNumLower = (batch.batchNumber || '').toLowerCase().trim();
            if (!batchNumLower) return true;
            return !receivedBatchNumbers.has(batchNumLower);
          });
        allBatches.push(...validBatches);
        const batchWithDate = validBatches.find(b => b.expiryDate);
        if (batchWithDate && !firstExpiryDate) firstExpiryDate = batchWithDate.expiryDate;
        if (validBatches.find(b => b.noExpiryDate)) hasNoExpiryDate = true;
      } else if (foundItem.noExpiryDate === true) {
        hasNoExpiryDate = true;
        allBatches.push({ batchNumber: '', unloadedQuantity: foundItem.unloadedQuantity || '', expiryDate: null, noExpiryDate: true, sourceReportId: response.id, sourceReportDate: response.fillDate || response.createdAt });
      } else {
        const validDate = validateDate(foundItem.expiryDate);
        if (validDate) {
          if (!firstExpiryDate) firstExpiryDate = validDate;
          allBatches.push({ batchNumber: '', unloadedQuantity: foundItem.unloadedQuantity || '', expiryDate: validDate, noExpiryDate: false, sourceReportId: response.id, sourceReportDate: response.fillDate || response.createdAt });
        } else if (foundItem.unloadedQuantity) {
          allBatches.push({ batchNumber: '', unloadedQuantity: foundItem.unloadedQuantity || '', expiryDate: null, noExpiryDate: false, sourceReportId: response.id, sourceReportDate: response.fillDate || response.createdAt });
        }
      }
    }

    if (allBatches.length > 0)
      return { expiryDate: firstExpiryDate, noExpiryDate: !firstExpiryDate && hasNoExpiryDate, batches: allBatches, reportsCount: matchedReportIds.size };
    return { expiryDate: null, noExpiryDate: false, batches: [], reportsCount: 0 };
  };

  // --- Action handlers ---

  const handleBatchClick = async (batchId, itemId) => {
    if (!batchId) return;
    if (batchId.toString().startsWith('temp-')) {
      showError('Nie można wyświetlić szczegółów dla tymczasowej partii, która nie została jeszcze zapisana w bazie danych.');
      return;
    }
    if (itemId) { navigate(`/inventory/${itemId}/batches?batchId=${batchId}`); return; }
    try {
      setLoadingBatches(true);
      const batch = await getInventoryBatch(batchId);
      setLoadingBatches(false);
      if (batch && batch.itemId) navigate(`/inventory/${batch.itemId}/batches?batchId=${batchId}`);
      else navigate(`/inventory/batch/${batchId}`);
    } catch (error) {
      setLoadingBatches(false);
      if (error.message?.includes('nie istnieje')) showError(t('purchaseOrders.batchNotFoundInDb'));
      else navigate(`/inventory/batch/${batchId}`);
    }
  };

  const refreshBatches = async () => {
    try {
      setLoadingBatches(true);
      const batches = await getBatchesByPurchaseOrderId(orderId);
      setRelatedBatches(batches);
      showSuccess('Lista partii została odświeżona');
    } catch (error) {
      showError('Nie udało się odświeżyć listy partii: ' + error.message);
    } finally {
      setLoadingBatches(false);
    }
  };

  const handleEditUnloadingReport = (report) => {
    sessionStorage.setItem('editFormData', JSON.stringify(report));
    navigate('/inventory/forms/unloading-report?edit=true');
  };

  const handleEditClick = () => navigate(`/purchase-orders/${orderId}/edit`);

  const handleMenuOpen = (event) => { setMenuAnchorRef(event.currentTarget); setMenuOpen(true); };
  const handleMenuClose = () => { setMenuOpen(false); setMenuAnchorRef(null); };

  const handlePdfMenuOpen = (event) => { setPdfMenuAnchorEl(event.currentTarget); setPdfMenuOpen(true); };
  const handlePdfMenuClose = () => { setPdfMenuOpen(false); setPdfMenuAnchorEl(null); };

  const handleDownloadPDF = async (hidePricing = false) => {
    if (!purchaseOrder) { showError(t('purchaseOrders.details.noPdfData')); return; }
    try {
      const pdfType = hidePricing ? 'bez cen' : 'standardowy';
      showSuccess(`Generowanie PDF ${pdfType} w toku...`);
      const { createPurchaseOrderPdfGenerator } = await import('../../components/purchaseOrders/PurchaseOrderPdfGenerator');
      const pdfGenerator = createPurchaseOrderPdfGenerator(purchaseOrder, {
        useTemplate: true, templatePath: '/templates/PO-template.png', language: 'en',
        hidePricing, useOriginalCurrency: true, imageQuality: 0.95,
        enableCompression: true, precision: 2, dpi: 150
      });
      await pdfGenerator.downloadPdf();
      showSuccess(`PDF ${pdfType} został pobrany pomyślnie`);
    } catch (error) {
      showError('Wystąpił błąd podczas generowania PDF: ' + error.message);
    }
  };

  const handlePdfDownload = (hidePricing) => { handlePdfMenuClose(); handleDownloadPDF(hidePricing); };

  const handleUpdateBatchPricesFromMenu = async () => {
    try {
      await updateBatchesForPurchaseOrder(orderId);
      showSuccess('Ceny partii zostały zaktualizowane');
      await fetchRelatedBatches(orderId);
      setMenuOpen(false);
    } catch (error) { showError('Błąd podczas aktualizacji cen partii: ' + error.message); }
  };

  const handleUpdateBasePrices = async () => {
    try {
      const result = await updateBatchBasePricesForPurchaseOrder(orderId, currentUser?.uid);
      showSuccess(`Ceny bazowe partii zostały zaktualizowane na podstawie aktualnych cen pozycji w zamówieniu (zaktualizowano ${result.updated} partii)`);
      await fetchRelatedBatches(orderId);
      setMenuOpen(false);
    } catch (error) { showError('Nie udało się zaktualizować cen bazowych partii: ' + error.message); }
  };

  const handleUpdateSupplierPrices = async () => {
    try {
      const { updateSupplierPricesFromCompletedPO } = await import('../../services/inventory');
      const result = await updateSupplierPricesFromCompletedPO(orderId, currentUser.uid);
      if (result.success) {
        if (result.updated > 0) showSuccess(`Zaktualizowano ${result.updated} cen dostawców na podstawie tego zamówienia i ustawiono jako domyślne`);
        else showSuccess(t('purchaseOrders.noPricesToUpdate'));
      } else showError(result.message || 'Nie udało się zaktualizować cen dostawców');
      setMenuOpen(false);
    } catch (error) { showError('Błąd podczas aktualizacji cen dostawców: ' + error.message); }
  };

  const handleCoAMigration = () => setCoaMigrationDialogOpen(true);
  const handleCoAMigrationClose = () => setCoaMigrationDialogOpen(false);
  const handleCoAMigrationComplete = () => {
    fetchRelatedBatches(orderId);
    showSuccess('Migracja załączników CoA została zakończona');
  };

  // --- Computed ---

  const poStatus = purchaseOrder?.status;
  const canReceiveItems = [
    PURCHASE_ORDER_STATUSES.ORDERED, 'ordered',
    'partial', PURCHASE_ORDER_STATUSES.PARTIAL,
    PURCHASE_ORDER_STATUSES.CONFIRMED, 'confirmed',
    PURCHASE_ORDER_STATUSES.SHIPPED, 'shipped',
    PURCHASE_ORDER_STATUSES.DELIVERED, 'delivered'
  ].includes(poStatus);

  const hasDynamicFields = purchaseOrder?.additionalCostsItems?.length > 0 ||
    (purchaseOrder?.additionalCosts && parseFloat(purchaseOrder.additionalCosts) > 0);

  const formatAddress = (address) => {
    if (!address) return 'Brak adresu';
    return `${address.street || ''}, ${address.postalCode || ''} ${address.city || ''}, ${address.country || ''}`;
  };

  const getSupplierMainAddress = (supplier) => {
    if (!supplier?.addresses?.length) return null;
    return supplier.addresses.find(a => a.isMain) || supplier.addresses[0];
  };

  const calculateVATValues = (items = [], additionalCostsItems = [], globalDiscount = 0) => {
    let itemsNetTotal = 0, itemsVatTotal = 0;
    items.forEach(item => {
      const itemNet = parseFloat(item.totalPrice) || 0;
      itemsNetTotal += itemNet;
      const vatRate = typeof item.vatRate === 'number' ? item.vatRate : 0;
      itemsVatTotal += (itemNet * vatRate) / 100;
    });
    let additionalCostsNetTotal = 0, additionalCostsVatTotal = 0;
    additionalCostsItems.forEach(cost => {
      const costNet = parseFloat(cost.value) || 0;
      additionalCostsNetTotal += costNet;
      const vatRate = typeof cost.vatRate === 'number' ? cost.vatRate : 0;
      additionalCostsVatTotal += (costNet * vatRate) / 100;
    });
    const totalNetBeforeDiscount = itemsNetTotal + additionalCostsNetTotal;
    const totalVatBeforeDiscount = itemsVatTotal + additionalCostsVatTotal;
    const totalGrossBeforeDiscount = totalNetBeforeDiscount + totalVatBeforeDiscount;
    const globalDiscountMultiplier = (100 - parseFloat(globalDiscount || 0)) / 100;
    const discountAmount = totalGrossBeforeDiscount * (parseFloat(globalDiscount || 0) / 100);
    return {
      itemsNetTotal, itemsVatTotal, additionalCostsNetTotal, additionalCostsVatTotal,
      totalNetBeforeDiscount, totalVatBeforeDiscount, totalGrossBeforeDiscount, discountAmount,
      totalNet: totalNetBeforeDiscount * globalDiscountMultiplier,
      totalVat: totalVatBeforeDiscount * globalDiscountMultiplier,
      totalGross: totalGrossBeforeDiscount * globalDiscountMultiplier,
    };
  };

  return {
    loading, purchaseOrder, setPurchaseOrder,
    relatedBatches, loadingBatches,
    relatedRefInvoices, loadingRefInvoices,
    userNames, warehouseNames,
    poReservationsByItem, loadingReservations,
    reinvoicedAmounts,
    unloadingFormResponses, unloadingFormResponsesLoading,
    expandedItems,
    coaMigrationDialogOpen, setCoaMigrationDialogOpen,
    menuAnchorRef, menuOpen,
    pdfMenuAnchorEl, pdfMenuOpen,
    fetchPurchaseOrder, refreshPurchaseOrderData,
    fetchRelatedBatches, refreshBatches,
    getBatchesByItemId, getReservationsByItemId,
    handleBatchClick, toggleItemExpansion,
    getUserName, safeFormatDate, formatDate: formatDateLocal,
    getItemMatchingDiagnostics, isItemInUnloadingForms, getExpiryInfoFromUnloadingForms,
    handleEditUnloadingReport, handleEditClick,
    handleMenuOpen, handleMenuClose,
    handlePdfMenuOpen, handlePdfMenuClose,
    handleDownloadPDF, handlePdfDownload,
    handleUpdateBatchPricesFromMenu, handleUpdateBasePrices, handleUpdateSupplierPrices,
    handleCoAMigration, handleCoAMigrationClose, handleCoAMigrationComplete,
    canReceiveItems, hasDynamicFields,
    formatAddress, getSupplierMainAddress, calculateVATValues,
    navigate, currentUser, showSuccess, showError, t,
  };
}
