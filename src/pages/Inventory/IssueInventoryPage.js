import React from 'react';
import { Container } from '@mui/material';
import { useParams } from 'react-router-dom';
import InventoryTransactionForm from '../../components/inventory/InventoryTransactionForm';

const IssueInventoryPage = () => {
  const { id } = useParams();
  
  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <InventoryTransactionForm itemId={id} transactionType="issue" />
    </Container>
  );
};

export default IssueInventoryPage; 