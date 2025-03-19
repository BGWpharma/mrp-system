import React from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Container, 
  Typography, 
  Box, 
  Paper, 
  Button, 
  Grid, 
  Alert,
  Divider 
} from '@mui/material';
import { ArrowBack as ArrowBackIcon } from '@mui/icons-material';

const CreateFromOrderPage = () => {
  const navigate = useNavigate();

  const handleBack = () => {
    navigate('/orders');
  };

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Button
          variant="outlined"
          startIcon={<ArrowBackIcon />}
          onClick={handleBack}
        >
          Powrót do zamówień
        </Button>
        <Typography variant="h5">Tworzenie zadania produkcyjnego z zamówienia</Typography>
        <Box width={100} /> {/* Pusty element dla wyrównania */}
      </Box>

      <Paper sx={{ p: 4, mb: 3 }}>
        <Alert severity="info" sx={{ mb: 3 }}>
          Ta funkcjonalność jest w trakcie implementacji. Wkrótce będziesz mógł tworzyć zadania produkcyjne bezpośrednio z zamówień klientów.
        </Alert>

        <Typography variant="h6" gutterBottom>
          Korzyści z funkcji tworzenia zadań z zamówień:
        </Typography>
        
        <Divider sx={{ my: 2 }} />
        
        <Grid container spacing={3}>
          <Grid item xs={12} md={4}>
            <Typography variant="subtitle1" gutterBottom fontWeight="bold">
              Automatyzacja przepływu pracy
            </Typography>
            <Typography variant="body2">
              Bezpośrednia konwersja zamówień klientów na zadania produkcyjne, eliminująca ręczne wprowadzanie danych i minimalizująca ryzyko błędów.
            </Typography>
          </Grid>
          
          <Grid item xs={12} md={4}>
            <Typography variant="subtitle1" gutterBottom fontWeight="bold">
              Monitorowanie powiązań
            </Typography>
            <Typography variant="body2">
              Pełne śledzenie relacji między zamówieniami klientów a zadaniami produkcyjnymi, umożliwiające lepszą kontrolę nad całym procesem.
            </Typography>
          </Grid>
          
          <Grid item xs={12} md={4}>
            <Typography variant="subtitle1" gutterBottom fontWeight="bold">
              Przyspieszenie realizacji
            </Typography>
            <Typography variant="body2">
              Szybsze rozpoczęcie procesu produkcji, skrócenie czasu realizacji i poprawa terminowości dostaw do klientów.
            </Typography>
          </Grid>
        </Grid>
      </Paper>
    </Container>
  );
};

export default CreateFromOrderPage; 