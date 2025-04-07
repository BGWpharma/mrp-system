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
    const quantity = queryParams.get('quantity');
    const unitPrice = queryParams.get('unitPrice');
    const reason = queryParams.get('reason');
    const lotNumber = queryParams.get('lotNumber');
    const source = queryParams.get('source');
    const sourceId = queryParams.get('sourceId');
    const notes = queryParams.get('notes');
    
    // Pobierz dodatkowe parametry dotyczące MO i CO
    const moNumber = queryParams.get('moNumber');
    const orderNumber = queryParams.get('orderNumber');
    const orderId = queryParams.get('orderId');
    
    if (poNumber || quantity || unitPrice) {
      // Przygotuj obiekt z danymi początkowymi
      const data = {
        reference: poNumber || '',
        quantity: quantity ? String(quantity) : '',
        unitPrice: unitPrice ? Number(unitPrice) : '',
        reason: reason || 'purchase', // Używamy reason z URL lub domyślnie 'purchase'
        lotNumber: lotNumber || '',
        source: source || '',
        sourceId: sourceId || ''
      };
      
      // Dodaj informacje o MO i CO, jeśli są dostępne
      if (moNumber) {
        data.moNumber = moNumber;
      }
      
      if (orderNumber) {
        data.orderNumber = orderNumber;
      }
      
      if (orderId) {
        data.orderId = orderId;
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