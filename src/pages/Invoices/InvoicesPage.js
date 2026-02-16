import React from 'react';
import { useNavigate, Link as RouterLink } from 'react-router-dom';
import { useTranslation } from '../../hooks/useTranslation';
import { 
  Container, 
  Typography, 
  Box, 
  Paper, 
  Button, 
  Grid, 
  Alert,
  Divider,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Card,
  CardContent,
  CardActions
} from '@mui/material';
import { 
  ReceiptOutlined as ReceiptIcon,
  AddCircleOutline as AddIcon,
  Download as DownloadIcon,
  Settings as SettingsIcon,
  Receipt as InvoiceIcon,
  LocalShipping as DeliveryIcon,
  Storefront as CustomerIcon,
  AssignmentTurnedIn as OrderIcon,
  Business as SupplierIcon,
  ShoppingCart as PurchaseIcon
} from '@mui/icons-material';
import BackButton from '../../components/common/BackButton';
import ROUTES from '../../constants/routes';

const InvoicesPage = () => {
  const navigate = useNavigate();
  const { t } = useTranslation('invoices');

  const navigateTo = (path) => {
    navigate(path);
  };

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <BackButton to={ROUTES.HOME} label={t('common:common.backToDashboard')} />
        <Typography variant="h5">System fakturowania</Typography>
        <Button
          variant="contained"
          color="primary"
          startIcon={<AddIcon />}
          onClick={() => navigate('/invoices/new')}
        >
          Nowa faktura
        </Button>
      </Box>

      <Paper sx={{ p: 4, mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          Dostępne funkcje modułu faktur
        </Typography>
        
        <Alert severity="info" sx={{ mb: 3 }}>
          Moduł faktur został zaktualizowany i jest teraz zintegrowany z systemem zamówień klientów oraz zamówień zakupowych.
        </Alert>
        
        <Divider sx={{ my: 2 }} />
        
        <Grid container spacing={3}>
          {/* Karty z funkcjonalnościami */}
          <Grid item xs={12} md={4}>
            <Card sx={{ height: '100%' }}>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                  <InvoiceIcon color="primary" sx={{ mr: 1 }} />
                  <Typography variant="h6">Faktury</Typography>
                </Box>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  Zarządzaj fakturami, przeglądaj historię i generuj raporty.
                </Typography>
                <List dense>
                  <ListItem>
                    <ListItemIcon><ReceiptIcon color="primary" fontSize="small" /></ListItemIcon>
                    <ListItemText primary="Faktury z zamówień klientów" />
                  </ListItem>
                  <ListItem>
                    <ListItemIcon><ReceiptIcon color="primary" fontSize="small" /></ListItemIcon>
                    <ListItemText primary="Faktury z zamówień zakupowych" />
                  </ListItem>
                  <ListItem>
                    <ListItemIcon><DownloadIcon color="primary" fontSize="small" /></ListItemIcon>
                    <ListItemText primary="Eksport do PDF" />
                  </ListItem>
                </List>
              </CardContent>
              <CardActions>
                <Button size="small" onClick={() => navigateTo('/sales')}>
                  Przeglądaj faktury
                </Button>
                <Button size="small" onClick={() => navigateTo('/invoices/new')}>
                  Utwórz fakturę
                </Button>
              </CardActions>
            </Card>
          </Grid>
          
          <Grid item xs={12} md={4}>
            <Card sx={{ height: '100%' }}>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                  <OrderIcon color="primary" sx={{ mr: 1 }} />
                  <Typography variant="h6">Zamówienia</Typography>
                </Box>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  Zarządzaj zamówieniami klientów i twórz faktury bezpośrednio z zamówień.
                </Typography>
                <List dense>
                  <ListItem>
                    <ListItemIcon><CustomerIcon color="primary" fontSize="small" /></ListItemIcon>
                    <ListItemText primary="Zamówienia klientów" />
                  </ListItem>
                  <ListItem>
                    <ListItemIcon><DeliveryIcon color="primary" fontSize="small" /></ListItemIcon>
                    <ListItemText primary="Śledzenie statusów" />
                  </ListItem>
                  <ListItem>
                    <ListItemIcon><ReceiptIcon color="primary" fontSize="small" /></ListItemIcon>
                    <ListItemText primary="Automatyczne fakturowanie" />
                  </ListItem>
                </List>
              </CardContent>
              <CardActions>
                <Button size="small" onClick={() => navigateTo('/orders')}>
                  Lista zamówień
                </Button>
              </CardActions>
            </Card>
          </Grid>
          
          <Grid item xs={12} md={4}>
            <Card sx={{ height: '100%' }}>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                  <PurchaseIcon color="primary" sx={{ mr: 1 }} />
                  <Typography variant="h6">Zamówienia zakupowe</Typography>
                </Box>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  Zarządzaj zamówieniami komponentów i materiałów od dostawców.
                </Typography>
                <List dense>
                  <ListItem>
                    <ListItemIcon><SupplierIcon color="primary" fontSize="small" /></ListItemIcon>
                    <ListItemText primary="Zarządzanie dostawcami" />
                  </ListItem>
                  <ListItem>
                    <ListItemIcon><PurchaseIcon color="primary" fontSize="small" /></ListItemIcon>
                    <ListItemText primary="Zamówienia zakupowe (PO)" />
                  </ListItem>
                  <ListItem>
                    <ListItemIcon><ReceiptIcon color="primary" fontSize="small" /></ListItemIcon>
                    <ListItemText primary="Faktury zakupowe" />
                  </ListItem>
                </List>
              </CardContent>
              <CardActions>
                <Button size="small" onClick={() => navigateTo('/purchase-orders')}>
                  Zamówienia zakupowe
                </Button>
                <Button size="small" onClick={() => navigateTo('/suppliers')}>
                  Dostawcy
                </Button>
              </CardActions>
            </Card>
          </Grid>
        </Grid>
      </Paper>
      
      <Paper sx={{ p: 4 }}>
        <Typography variant="h6" gutterBottom>
          {t('settings.title')}
        </Typography>
        
        <Divider sx={{ my: 2 }} />
        
        <Grid container spacing={3}>
          <Grid item xs={12} md={6}>
            <Paper elevation={0} sx={{ p: 2, bgcolor: 'background.default' }}>
              <List dense>
                <ListItem button component={RouterLink} to="/invoices/company-settings">
                  <ListItemIcon><SettingsIcon color="primary" /></ListItemIcon>
                  <ListItemText primary="Dane firmy na fakturach" secondary="Ustaw dane swojej firmy, które będą używane na fakturach" />
                </ListItem>
                <ListItem button component={RouterLink} to="/customers">
                  <ListItemIcon><CustomerIcon color="primary" /></ListItemIcon>
                  <ListItemText primary="Zarządzanie klientami" secondary="Przeglądaj i edytuj bazę klientów" />
                </ListItem>
              </List>
            </Paper>
          </Grid>
          
          <Grid item xs={12} md={6}>
            <Paper elevation={0} sx={{ p: 2, bgcolor: 'background.default' }}>
              <List dense>
                <ListItem button component={RouterLink} to="/invoices/company-settings">
                  <ListItemIcon><SettingsIcon color="primary" /></ListItemIcon>
                  <ListItemText primary={t('settings.companySettings')} secondary={t('settings.companySettingsDescription')} />
                </ListItem>
              </List>
            </Paper>
          </Grid>
        </Grid>
      </Paper>
    </Container>
  );
};

export default InvoicesPage; 