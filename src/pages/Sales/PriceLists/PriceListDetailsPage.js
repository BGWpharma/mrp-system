import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { 
  Container, 
  Typography, 
  Paper, 
  Box, 
  Grid, 
  Button, 
  Chip,
  Divider
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import { format } from 'date-fns';

import { getPriceListById, deletePriceList } from '../../../services/priceListService';
import { useNotification } from '../../../hooks/useNotification';
import { useTranslation } from '../../../hooks/useTranslation';
import ConfirmDialog from '../../../components/common/ConfirmDialog';
import Loader from '../../../components/common/Loader';
import GoBackButton from '../../../components/common/GoBackButton';
import PriceListItemsTable from '../../../components/sales/priceLists/PriceListItemsTable';

const PriceListDetailsPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  
  const [priceList, setPriceList] = useState(null);
  const [loading, setLoading] = useState(true);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  
  const { showNotification } = useNotification();
  const { t } = useTranslation();
  
  useEffect(() => {
    fetchPriceList();
  }, [id]);
  
  const fetchPriceList = async () => {
    try {
      setLoading(true);
      const data = await getPriceListById(id);
      setPriceList(data);
    } catch (error) {
      console.error('Błąd podczas pobierania listy cenowej:', error);
      showNotification(t('priceLists.messages.errors.fetchDetailsFailed'), 'error');
      navigate('/sales/price-lists');
    } finally {
      setLoading(false);
    }
  };
  
  const handleDeleteClick = () => {
    setConfirmDialogOpen(true);
  };
  
  const handleConfirmDelete = async () => {
    try {
      await deletePriceList(id);
      showNotification(t('priceLists.messages.success.deleted'), 'success');
      navigate('/sales/price-lists');
    } catch (error) {
      console.error('Błąd podczas usuwania listy cenowej:', error);
      showNotification(t('priceLists.messages.errors.deleteFailed'), 'error');
    } finally {
      setConfirmDialogOpen(false);
    }
  };
  
  if (loading) {
    return <Loader />;
  }
  
  if (!priceList) {
    return (
      <Container>
        <Typography variant="h5">
          {t('priceLists.details.notFound')}
        </Typography>
        <Button component={Link} to="/sales/price-lists">
          {t('priceLists.details.backToLists')}
        </Button>
      </Container>
    );
  }
  
  return (
    <Container maxWidth="lg">
      <Box sx={{ mt: 3, mb: 4 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
          <GoBackButton />
          <Typography variant="h4" component="h1">
            {priceList.name}
          </Typography>
        </Box>
        
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 3 }}>
          <Button
            component={Link}
            to={`/sales/price-lists/${id}/edit`}
            variant="outlined"
            color="primary"
            startIcon={<EditIcon />}
            sx={{ mr: 2 }}
          >
            {t('priceLists.details.edit')}
          </Button>
          <Button
            variant="outlined"
            color="error"
            startIcon={<DeleteIcon />}
            onClick={handleDeleteClick}
          >
            {t('priceLists.details.delete')}
          </Button>
        </Box>
        
        <Paper elevation={3} sx={{ p: 3, mb: 4 }}>
          <Grid container spacing={3}>
            <Grid item xs={12} md={6}>
              <Typography variant="subtitle1" color="textSecondary">
                {t('priceLists.details.customer')}
              </Typography>
              <Typography variant="body1" gutterBottom>
                {priceList.customerName}
              </Typography>
            </Grid>
            
            <Grid item xs={12} md={6}>
              <Typography variant="subtitle1" color="textSecondary">
                {t('priceLists.details.status')}
              </Typography>
              <Chip 
                label={priceList.isActive ? t('priceLists.status.active') : t('priceLists.status.inactive')} 
                color={priceList.isActive ? "success" : "default"}
                size="small"
              />
            </Grid>
            
            <Grid item xs={12} md={6}>
              <Typography variant="subtitle1" color="textSecondary">
                {t('priceLists.details.currency')}
              </Typography>
              <Typography variant="body1" gutterBottom>
                {priceList.currency}
              </Typography>
            </Grid>
            
            <Grid item xs={12} md={6}>
              <Typography variant="subtitle1" color="textSecondary">
                {t('priceLists.details.createdAt')}
              </Typography>
              <Typography variant="body1" gutterBottom>
                {priceList.createdAt ? format(priceList.createdAt.toDate(), 'dd.MM.yyyy HH:mm') : '-'}
              </Typography>
            </Grid>
            
            <Grid item xs={12} md={6}>
              <Typography variant="subtitle1" color="textSecondary">
                {t('priceLists.details.validFrom')}
              </Typography>
              <Typography variant="body1" gutterBottom>
                {priceList.validFrom ? format(priceList.validFrom.toDate(), 'dd.MM.yyyy') : '-'}
              </Typography>
            </Grid>
            
            <Grid item xs={12} md={6}>
              <Typography variant="subtitle1" color="textSecondary">
                {t('priceLists.details.validTo')}
              </Typography>
              <Typography variant="body1" gutterBottom>
                {priceList.validTo ? format(priceList.validTo.toDate(), 'dd.MM.yyyy') : '-'}
              </Typography>
            </Grid>
            
            {priceList.description && (
              <Grid item xs={12}>
                <Typography variant="subtitle1" color="textSecondary">
                  {t('priceLists.details.description')}
                </Typography>
                <Typography variant="body1" gutterBottom>
                  {priceList.description}
                </Typography>
              </Grid>
            )}
          </Grid>
        </Paper>
        
        <Box sx={{ mt: 4 }}>
          <Typography variant="h5" gutterBottom>
            {t('priceLists.details.items')}
          </Typography>
          <Divider sx={{ mb: 2 }} />
          <PriceListItemsTable priceListId={id} readOnly={true} />
        </Box>
      </Box>
      
      <ConfirmDialog
        open={confirmDialogOpen}
        title={t('priceLists.confirmations.deleteTitle')}
        message={t('priceLists.confirmations.deleteMessage', { name: priceList.name })}
        onConfirm={handleConfirmDelete}
        onCancel={() => setConfirmDialogOpen(false)}
      />
    </Container>
  );
};

export default PriceListDetailsPage; 