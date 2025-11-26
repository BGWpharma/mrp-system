import React, { useState, useEffect } from 'react';
import { Container } from '@mui/material';
import { useParams, useLocation } from 'react-router-dom';
import InventoryTransactionForm from '../../components/inventory/InventoryTransactionForm';

const ReceiveInventoryPage = () => {
  const { id } = useParams();
  const location = useLocation();
  const [initialData, setInitialData] = useState(null);
  
  useEffect(() => {
    // Pobierz parametry z URL
    const queryParams = new URLSearchParams(location.search);
    const poNumber = queryParams.get('poNumber');
    const orderId = queryParams.get('orderId');
    const quantity = queryParams.get('quantity');
    const unitPrice = queryParams.get('unitPrice');
    const reason = queryParams.get('reason');
    const lotNumber = queryParams.get('lotNumber');
    const source = queryParams.get('source');
    const sourceId = queryParams.get('sourceId');
    const notes = queryParams.get('notes');
    const itemPOId = queryParams.get('itemPOId');
    const returnTo = queryParams.get('returnTo');
    
    // Pobierz dodatkowe parametry dotyczące MO i CO
    const moNumber = queryParams.get('moNumber');
    const orderNumber = queryParams.get('orderNumber');
    
    // Pobierz informacje o dacie ważności
    const expiryDate = queryParams.get('expiryDate');
    const noExpiryDate = queryParams.get('noExpiryDate');
    
    // Pobierz partie z URL (nowy format - wszystkie partie z raportu rozładunku)
    const batchesParam = queryParams.get('batches');
    
    if (poNumber || quantity || unitPrice || orderId) {
      // Przygotuj obiekt z danymi początkowymi
      const data = {
        reference: poNumber || '',
        orderNumber: poNumber || '',
        quantity: quantity ? String(quantity) : '',
        unitPrice: unitPrice ? Number(unitPrice) : '',
        reason: reason || 'purchase', // Używamy reason z URL lub domyślnie 'purchase'
        lotNumber: lotNumber || '',
        source: source || 'purchase',
        sourceId: sourceId || '',
        orderId: orderId || '',
        itemPOId: itemPOId || '',
        returnTo: returnTo || ''
      };
      
      // Dodaj informacje o MO i CO, jeśli są dostępne
      if (moNumber) {
        data.moNumber = moNumber;
      }
      
      if (orderNumber) {
        data.orderNumber = orderNumber;
      }
      
      // Obsłuż partie z raportu rozładunku (nowy format z wieloma partiami)
      if (batchesParam) {
        try {
          const batches = JSON.parse(batchesParam);
          data.batches = batches.map(batch => ({
            batchNumber: batch.batchNumber || '',
            quantity: batch.quantity || '',
            expiryDate: batch.expiryDate ? new Date(batch.expiryDate) : null,
            noExpiryDate: batch.noExpiryDate || false
          }));
          console.log('📦 Załadowano partie z URL:', data.batches);
        } catch (e) {
          console.error('Błąd parsowania partii z URL:', e);
        }
      } else {
        // Stary format - obsłuż pojedyncze informacje o dacie ważności (kompatybilność wsteczna)
        if (noExpiryDate === 'true') {
          // Jeśli w formularzu rozładunku zaznaczono "nie dotyczy"
          data.noExpiryDate = true;
          data.expiryDate = null;
          console.log('Ustawiono "brak terminu ważności" z parametru URL');
        } else if (expiryDate) {
          // Jeśli jest określona data ważności
          try {
            data.expiryDate = new Date(expiryDate);
            data.noExpiryDate = false;
            console.log('Ustawiono datę ważności z parametru URL:', data.expiryDate);
          } catch (e) {
            console.error('Błąd podczas parsowania daty ważności:', e);
          }
        }
      }
      
      // Dodaj notatki, jeśli są dostępne
      if (notes) {
        data.notes = notes;
      }
      
      setInitialData(data);
    }
  }, [location.search]);
  
  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <InventoryTransactionForm
        itemId={id}
        transactionType="receive"
        initialData={initialData}
      />
    </Container>
  );
};

export default ReceiveInventoryPage; 