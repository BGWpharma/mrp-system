import React from 'react';
import { useParams } from 'react-router-dom';
import { Container, Typography, Box } from '@mui/material';
import { useTranslation } from '../../hooks/useTranslation';
import SupplierForm from '../../components/purchaseOrders/SupplierForm';

const SupplierFormPage = ({ viewOnly = false }) => {
  const { t } = useTranslation('suppliers');
  const { id } = useParams();
  const isEditMode = Boolean(id) && !viewOnly;

  return (
    <Container>
      <Box sx={{ my: 4 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          {viewOnly ? t('suppliers.supplierDetails') : (isEditMode ? t('suppliers.editSupplier') : t('suppliers.newSupplier'))}
        </Typography>
        <SupplierForm supplierId={id} viewOnly={viewOnly} />
      </Box>
    </Container>
  );
};

export default SupplierFormPage;
