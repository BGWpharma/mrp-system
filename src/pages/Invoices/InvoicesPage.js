import React from 'react';
import { useNavigate, Link as RouterLink } from 'react-router-dom';
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
  ListItemText 
} from '@mui/material';
import { 
  ArrowBack as ArrowBackIcon,
  ReceiptOutlined as ReceiptIcon,
  AddCircleOutline as AddIcon,
  Download as DownloadIcon,
  Settings as SettingsIcon
} from '@mui/icons-material';

const InvoicesPage = () => {
  const navigate = useNavigate();

  const handleBack = () => {
    navigate('/customers');
  };

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Button
          variant="outlined"
          startIcon={<ArrowBackIcon />}
          onClick={handleBack}
        >
          Powrót do klientów
        </Button>
        <Typography variant="h5">Faktury</Typography>
        <Button
          variant="contained"
          color="primary"
          startIcon={<AddIcon />}
          disabled={true}
        >
          Nowa faktura
        </Button>
      </Box>

      <Paper sx={{ p: 4, mb: 3 }}>
        <Alert severity="info" sx={{ mb: 3 }}>
          Moduł faktur jest w trakcie implementacji. Wkrótce będziesz mógł tworzyć, przeglądać i zarządzać fakturami dla klientów.
        </Alert>

        <Typography variant="h6" gutterBottom>
          Planowane funkcjonalności modułu faktur:
        </Typography>
        
        <Divider sx={{ my: 2 }} />
        
        <Grid container spacing={3}>
          <Grid item xs={12} md={6}>
            <Paper elevation={0} sx={{ p: 2, bgcolor: 'background.default' }}>
              <Typography variant="subtitle1" gutterBottom fontWeight="bold">
                Podstawowe funkcje
              </Typography>
              <List dense>
                <ListItem>
                  <ListItemIcon><ReceiptIcon color="primary" /></ListItemIcon>
                  <ListItemText primary="Wystawianie faktur na podstawie zamówień" />
                </ListItem>
                <ListItem>
                  <ListItemIcon><ReceiptIcon color="primary" /></ListItemIcon>
                  <ListItemText primary="Automatyczne numerowanie faktur" />
                </ListItem>
                <ListItem>
                  <ListItemIcon><ReceiptIcon color="primary" /></ListItemIcon>
                  <ListItemText primary="Generowanie faktur proforma i zaliczkowych" />
                </ListItem>
                <ListItem>
                  <ListItemIcon><ReceiptIcon color="primary" /></ListItemIcon>
                  <ListItemText primary="Zarządzanie terminami płatności" />
                </ListItem>
              </List>
            </Paper>
          </Grid>
          
          <Grid item xs={12} md={6}>
            <Paper elevation={0} sx={{ p: 2, bgcolor: 'background.default' }}>
              <Typography variant="subtitle1" gutterBottom fontWeight="bold">
                Zaawansowane opcje
              </Typography>
              <List dense>
                <ListItem>
                  <ListItemIcon><DownloadIcon color="primary" /></ListItemIcon>
                  <ListItemText primary="Eksport faktur do PDF, XLS i innych formatów" />
                </ListItem>
                <ListItem>
                  <ListItemIcon><SettingsIcon color="primary" /></ListItemIcon>
                  <ListItemText primary="Dostosowanie szablonów faktur" />
                </ListItem>
                <ListItem button component={RouterLink} to="/invoices/company-settings">
                  <ListItemIcon><SettingsIcon color="primary" /></ListItemIcon>
                  <ListItemText primary="Dane firmy na fakturach" />
                </ListItem>
                <ListItem>
                  <ListItemIcon><SettingsIcon color="primary" /></ListItemIcon>
                  <ListItemText primary="Integracja z systemami księgowymi" />
                </ListItem>
                <ListItem>
                  <ListItemIcon><DownloadIcon color="primary" /></ListItemIcon>
                  <ListItemText primary="Zbiorcze raporty i zestawienia" />
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