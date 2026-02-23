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
import DownloadIcon from '@mui/icons-material/Download';
import UploadIcon from '@mui/icons-material/Upload';
import { format } from 'date-fns';

import { getPriceListById, deletePriceList, exportPriceListToCSV } from '../../../services/priceListService';
import { useNotification } from '../../../hooks/useNotification';
import { useTranslation } from '../../../hooks/useTranslation';
import ConfirmDialog from '../../../components/common/ConfirmDialog';
import Loader from '../../../components/common/Loader';
import BackButton from '../../../components/common/BackButton';
import ROUTES from '../../../constants/routes';
import PriceListItemsTable from '../../../components/sales/priceLists/PriceListItemsTable';
import ImportPriceListDialog from '../../../components/sales/priceLists/ImportPriceListDialog';

const PriceListDetailsPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  
  const [priceList, setPriceList] = useState(null);
  const [loading, setLoading] = useState(true);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [exportingCSV, setExportingCSV] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  
  const { showNotification } = useNotification();
  const { t } = useTranslation('priceLists');
  
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const data = await getPriceListById(id);
        if (cancelled) return;
        setPriceList(data);
      } catch (error) {
        if (cancelled) return;
        console.error('Błąd podczas pobierania listy cenowej:', error);
        showNotification(t('priceLists.messages.errors.fetchDetailsFailed'), 'error');
        navigate('/orders/price-lists');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id]);
  
  const fetchPriceList = async () => {
    try {
      setLoading(true);
      const data = await getPriceListById(id);
      setPriceList(data);
    } catch (error) {
      console.error('Błąd podczas pobierania listy cenowej:', error);
      showNotification(t('priceLists.messages.errors.fetchDetailsFailed'), 'error');
      navigate('/orders/price-lists');
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
      navigate('/orders/price-lists');
    } catch (error) {
      console.error('Błąd podczas usuwania listy cenowej:', error);
      showNotification(t('priceLists.messages.errors.deleteFailed'), 'error');
    } finally {
      setConfirmDialogOpen(false);
    }
  };
  
  const handleExportCSV = async () => {
    try {
      setExportingCSV(true);
      await exportPriceListToCSV(id);
      showNotification(t('priceLists.messages.success.exported') || 'Lista cenowa została wyeksportowana', 'success');
    } catch (error) {
      console.error('Błąd podczas eksportowania listy cenowej:', error);
      showNotification(error.message || t('priceLists.messages.errors.exportFailed') || 'Błąd podczas eksportowania', 'error');
    } finally {
      setExportingCSV(false);
    }
  };
  
  const handleOpenImportDialog = () => {
    setImportDialogOpen(true);
  };
  
  const handleCloseImportDialog = () => {
    setImportDialogOpen(false);
  };
  
  const handleImportComplete = () => {
    // Odśwież tabelę po pomyślnym imporcie
    setRefreshKey(prev => prev + 1);
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
        <BackButton to={ROUTES.ORDERS_PRICE_LISTS} label={t('priceLists.details.backToLists')} />
      </Container>
    );
  }
  
  return (
    <Container maxWidth="lg">
      <Box sx={{ mt: 3, mb: 4 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
          <BackButton to={ROUTES.ORDERS_PRICE_LISTS} iconOnly sx={{ mr: 2 }} />
          <Typography variant="h4" component="h1">
            {priceList.name}
          </Typography>
        </Box>
        
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 3, gap: 1 }}>
          <Button
            variant="contained"
            color="primary"
            startIcon={<UploadIcon />}
            onClick={handleOpenImportDialog}
          >
            {t('priceLists.details.importCSV') || 'Importuj CSV'}
          </Button>
          <Button
            variant="contained"
            color="success"
            startIcon={<DownloadIcon />}
            onClick={handleExportCSV}
            disabled={exportingCSV}
          >
            {exportingCSV ? t('priceLists.details.exporting') || 'Eksportowanie...' : t('priceLists.details.exportCSV') || 'Eksportuj CSV'}
          </Button>
          <Button
            component={Link}
            to={`/orders/price-lists/${id}/edit`}
            variant="outlined"
            color="primary"
            startIcon={<EditIcon />}
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
          <PriceListItemsTable priceListId={id} readOnly={true} key={refreshKey} />
        </Box>
      </Box>
      
      <ConfirmDialog
        open={confirmDialogOpen}
        title={t('priceLists.confirmations.deleteTitle')}
        message={t('priceLists.confirmations.deleteMessage', { name: priceList.name })}
        onConfirm={handleConfirmDelete}
        onCancel={() => setConfirmDialogOpen(false)}
      />
      
      <ImportPriceListDialog
        open={importDialogOpen}
        onClose={handleCloseImportDialog}
        priceListId={id}
        priceList={priceList}
        onImportComplete={handleImportComplete}
      />
    </Container>
  );
};

export default PriceListDetailsPage; 