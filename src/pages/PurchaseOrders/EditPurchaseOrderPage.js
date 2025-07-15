import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Typography, Paper, Box, Button, CircularProgress,
  Grid, Divider, Alert, TextField, IconButton, Tooltip,
  Dialog, DialogTitle, DialogContent, DialogActions
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import { ArrowBack, Save, Delete, Add, ProductionQuantityLimits } from '@mui/icons-material';
import { useAuth } from '../../contexts/AuthContext';
import { 
  getPurchaseOrderById, 
  updatePurchaseOrder,
  deletePurchaseOrder,
  updateBatchesForPurchaseOrder
} from '../../services/purchaseOrderService';
import { getSuppliers } from '../../services/supplierService';
import { getWarehouseLocations } from '../../services/warehouseService';
import { searchItems } from '../../services/inventoryService';
import PurchaseOrderItemsTable from '../../components/purchaseOrders/PurchaseOrderItemsTable';
import PurchaseOrderForm from '../../components/purchaseOrders/PurchaseOrderForm';
import ConfirmationDialog from '../../components/common/ConfirmationDialog';
import useNotification from '../../hooks/useNotification';
import { formatCurrency } from '../../utils/formatters';
import AdditionalCostsForm from '../../components/purchaseOrders/AdditionalCostsForm';
import ReceiveItemsDialog from '../../components/purchaseOrders/ReceiveItemsDialog';
import { getSupplierProducts } from '../../services/supplierProductService';
import LoadingScreen from '../../components/common/LoadingScreen';

const EditPurchaseOrderPage = () => {
  const { t } = useTranslation();
  const { id } = useParams();
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { showNotification } = useNotification();
  
  const [purchaseOrder, setPurchaseOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [suppliers, setSuppliers] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [supplierProducts, setSupplierProducts] = useState([]);
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);
  const [receiveDialogOpen, setReceiveDialogOpen] = useState(false);
  const [selectedItems, setSelectedItems] = useState([]);
  const [isReceiving, setIsReceiving] = useState(false);

  // Pobieranie danych zamówienia, dostawców i lokalizacji magazynowych
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const [poData, suppliersData, warehousesData] = await Promise.all([
          getPurchaseOrderById(id),
          getSuppliers(),
          getWarehouseLocations()
        ]);
        setPurchaseOrder(poData);
        setSuppliers(suppliersData);
        setWarehouses(warehousesData);
        
        if (poData && poData.supplierId) {
          const products = await getSupplierProducts(poData.supplierId);
          setSupplierProducts(products);
        }
      } catch (error) {
        console.error('Błąd podczas ładowania danych:', error);
        setError('Nie udało się załadować danych zamówienia. Spróbuj ponownie.');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [id]);

  // Funkcja do aktualizacji zamówienia
  const handleSave = async (formData) => {
    try {
      setSaving(true);
      
      // Upewnij się, że zachowujemy pola additionalCostsItems z formularza
      // Te dane są potrzebne do prawidłowego obliczenia cen LOT-ów
      const dataToUpdate = {
        ...formData,
        additionalCostsItems: formData.additionalCostsItems || purchaseOrder.additionalCostsItems,
        additionalCosts: formData.additionalCosts !== undefined ? formData.additionalCosts : purchaseOrder.additionalCosts
      };
      
      // Wywołaj serwis aktualizacji zamówienia, który zaktualizuje również ceny LOT-ów
      const updatedPO = await updatePurchaseOrder(id, dataToUpdate, currentUser?.uid);
      
      // Dodatkowo aktualizuj ceny partii powiązanych z zamówieniem
      await updateBatchesForPurchaseOrder(id, currentUser?.uid);
      
      setPurchaseOrder(updatedPO);
      showNotification('Zamówienie zostało zaktualizowane pomyślnie', 'success');
      
      // Dodaj komunikat o aktualizacji cen LOT-ów
      if (dataToUpdate.additionalCostsItems?.length > 0 || dataToUpdate.additionalCosts > 0) {
        showNotification('Zaktualizowano również ceny powiązanych partii magazynowych', 'info');
      }
    } catch (error) {
      console.error('Błąd podczas zapisywania zmian:', error);
      setError(error.message || 'Wystąpił błąd podczas zapisywania zamówienia');
      showNotification('Błąd podczas aktualizacji zamówienia', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Funkcja do usuwania zamówienia
  const handleDelete = async () => {
    try {
      setLoading(true);
      await deletePurchaseOrder(id);
      showNotification('Zamówienie zostało usunięte', 'success');
      navigate('/purchase-orders');
    } catch (error) {
      console.error('Błąd podczas usuwania zamówienia:', error);
      setError('Nie udało się usunąć zamówienia');
      showNotification('Błąd podczas usuwania zamówienia', 'error');
    } finally {
      setLoading(false);
      setShowDeleteConfirmation(false);
    }
  };

  // Handler do aktualizacji pola w zamówieniu
  const handleUpdateField = async (field, value) => {
    try {
      setSaving(true);
      const dataToUpdate = { [field]: value };
      const updatedPO = await updatePurchaseOrder(id, dataToUpdate, currentUser?.uid);
      
      // Aktualizuj ceny partii po każdej zmianie w zamówieniu
      await updateBatchesForPurchaseOrder(id, currentUser?.uid);
      
      setPurchaseOrder(updatedPO);
      showNotification('Zamówienie zaktualizowane', 'success');
    } catch (error) {
      console.error(`Błąd podczas aktualizacji pola ${field}:`, error);
      showNotification('Błąd podczas aktualizacji zamówienia', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Handler do aktualizacji przedmiotów w zamówieniu
  const handleItemsUpdate = async (updatedItems) => {
    try {
      setSaving(true);
      const dataToUpdate = { items: updatedItems };
      const updatedPO = await updatePurchaseOrder(id, dataToUpdate, currentUser?.uid);
      
      // Aktualizuj ceny partii po aktualizacji przedmiotów
      await updateBatchesForPurchaseOrder(id, currentUser?.uid);
      
      setPurchaseOrder(updatedPO);
      showNotification('Przedmioty w zamówieniu zaktualizowane', 'success');
    } catch (error) {
      console.error('Błąd podczas aktualizacji przedmiotów:', error);
      showNotification('Błąd podczas aktualizacji przedmiotów', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Handler do aktualizacji dodatkowych kosztów
  const handleAdditionalCostsUpdate = async (additionalCostsItems, totalAdditionalCosts) => {
    try {
      setSaving(true);
      const dataToUpdate = { 
        additionalCostsItems, 
        additionalCosts: totalAdditionalCosts
      };
      const updatedPO = await updatePurchaseOrder(id, dataToUpdate, currentUser?.uid);
      
      // Aktualizuj ceny partii po aktualizacji dodatkowych kosztów
      await updateBatchesForPurchaseOrder(id, currentUser?.uid);
      
      setPurchaseOrder(updatedPO);
      showNotification('Dodatkowe koszty zaktualizowane pomyślnie', 'success');
      showNotification('Ceny partii magazynowych zostały zaktualizowane', 'info');
    } catch (error) {
      console.error('Błąd podczas aktualizacji dodatkowych kosztów:', error);
      showNotification('Błąd podczas aktualizacji dodatkowych kosztów', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Obsługa przyjmowania towarów z zamówienia
  const handleReceiveItems = (items) => {
    setSelectedItems(items);
    setReceiveDialogOpen(true);
  };

  // Zakończenie przyjmowania towarów
  const handleReceiveComplete = async (receivedData) => {
    try {
      setIsReceiving(true);
      
      // Aktualizuj items w zamówieniu, aby odzwierciedlić otrzymane ilości
      const updatedItems = [...purchaseOrder.items];
      
      receivedData.forEach((receivedItem) => {
        const itemIndex = updatedItems.findIndex(item => item.id === receivedItem.itemId);
        
        if (itemIndex !== -1) {
          // Aktualizuj lub dodaj pole 'received'
          const currentReceived = parseFloat(updatedItems[itemIndex].received || 0);
          updatedItems[itemIndex].received = currentReceived + parseFloat(receivedItem.quantity);
        }
      });
      
      await updatePurchaseOrder(id, { items: updatedItems }, currentUser?.uid);
      
      // Aktualizuj ceny partii po przyjęciu towarów
      await updateBatchesForPurchaseOrder(id, currentUser?.uid);
      
      // Pobierz zaktualizowane zamówienie
      const updatedPO = await getPurchaseOrderById(id);
      setPurchaseOrder(updatedPO);
      
      showNotification('Towary zostały przyjęte pomyślnie', 'success');
      
      // Dodaj komunikat o aktualizacji cen LOT-ów, jeśli są dodatkowe koszty
      if (updatedPO.additionalCostsItems?.length > 0 || updatedPO.additionalCosts > 0) {
        showNotification('Zaktualizowano również ceny powiązanych partii magazynowych', 'info');
      }
      
      setReceiveDialogOpen(false);
    } catch (error) {
      console.error('Błąd podczas przyjmowania towarów:', error);
      showNotification('Błąd podczas przyjmowania towarów', 'error');
    } finally {
      setIsReceiving(false);
    }
  };

  if (loading) {
    return <LoadingScreen message="Ładowanie danych zamówienia..." />;
  }

  if (!purchaseOrder) {
    return (
      <Box p={3}>
        <Alert severity="error">
          Nie znaleziono zamówienia o ID: {id}
        </Alert>
        <Button 
          variant="contained" 
          startIcon={<ArrowBack />} 
          onClick={() => navigate('/purchase-orders')}
          sx={{ mt: 2 }}
        >
          Wróć do listy zamówień
        </Button>
      </Box>
    );
  }

  return (
    <Box p={2}>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4">Edycja zamówienia #{purchaseOrder.orderNumber}</Typography>
        <Box>
          <Button 
            variant="outlined" 
            startIcon={<ArrowBack />} 
            onClick={() => navigate('/purchase-orders')}
            sx={{ mr: 1 }}
          >
            Powrót
          </Button>
          <Button 
            variant="contained" 
            color="primary" 
            startIcon={<Save />} 
            onClick={() => handleSave(purchaseOrder)}
            disabled={saving}
          >
            {saving ? 'Zapisywanie...' : 'Zapisz'}
          </Button>
          <Button 
            variant="contained" 
            color="error" 
            startIcon={<Delete />} 
            onClick={() => setShowDeleteConfirmation(true)}
            sx={{ ml: 1 }}
            disabled={saving}
          >
            Usuń
          </Button>
        </Box>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3, mb: 3 }}>
            <Typography variant="h6" gutterBottom>{t('purchaseOrders.editPage.orderData')}</Typography>
            <PurchaseOrderForm 
              purchaseOrder={purchaseOrder} 
              setPurchaseOrder={setPurchaseOrder}
              suppliers={suppliers}
              warehouses={warehouses}
              disabled={saving}
            />
          </Paper>
        </Grid>

        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3, mb: 3 }}>
            <Typography variant="h6" gutterBottom>{t('purchaseOrders.editPage.additionalCosts')}</Typography>
            <AdditionalCostsForm 
              additionalCostsItems={purchaseOrder.additionalCostsItems || []}
              additionalCosts={purchaseOrder.additionalCosts || 0}
              onUpdate={handleAdditionalCostsUpdate}
              disabled={saving}
            />
          </Paper>
        </Grid>

        <Grid item xs={12}>
          <Paper sx={{ p: 3 }}>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
              <Typography variant="h6">{t('purchaseOrders.itemsInOrder')}</Typography>
              <Button 
                variant="outlined" 
                color="primary" 
                startIcon={<ProductionQuantityLimits />}
                onClick={() => handleReceiveItems(purchaseOrder.items)}
                disabled={saving || !purchaseOrder.items || purchaseOrder.items.length === 0}
              >
                {t('purchaseOrders.receiveGoods')}
              </Button>
            </Box>
            <PurchaseOrderItemsTable 
              items={purchaseOrder.items || []}
              onItemsChange={(updatedItems) => handleItemsUpdate(updatedItems)}
              supplierProducts={supplierProducts}
              disabled={saving}
              currency={purchaseOrder.currency}
            />
          </Paper>
        </Grid>
      </Grid>

      {/* Okno dialogowe potwierdzenia usunięcia */}
      <ConfirmationDialog
        open={showDeleteConfirmation}
        title="Potwierdzenie usunięcia"
        message="Czy na pewno chcesz usunąć to zamówienie? Ta operacja jest nieodwracalna."
        onConfirm={handleDelete}
        onCancel={() => setShowDeleteConfirmation(false)}
      />

      {/* Dialog do przyjmowania towarów */}
      <ReceiveItemsDialog
        open={receiveDialogOpen}
        onClose={() => setReceiveDialogOpen(false)}
        items={selectedItems}
        purchaseOrderId={id}
        onReceiveComplete={handleReceiveComplete}
        loading={isReceiving}
        currency={purchaseOrder.currency}
        warehouseId={purchaseOrder.warehouseId}
        supplierId={purchaseOrder.supplierId}
      />
    </Box>
  );
};

export default EditPurchaseOrderPage; 