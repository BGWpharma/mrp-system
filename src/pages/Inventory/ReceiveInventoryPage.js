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
    
    if (poNumber || quantity || unitPrice) {
      // Konwertujemy wartości liczbowe na poprawne typy danych
      setInitialData({
        reference: poNumber || '',
        quantity: quantity ? String(quantity) : '',
        unitPrice: unitPrice ? Number(unitPrice) : '',
        reason: reason || 'purchase' // Używamy reason z URL lub domyślnie 'purchase'
      });
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