import React from 'react';
import { Container, Typography, Box, Paper, Alert, Button, Link, Grid, Card, CardContent, CardActions } from '@mui/material';
import { 
  Launch as LaunchIcon,
  Assignment as AssignmentIcon,
  Add as AddIcon,
  FactCheck as FactCheckIcon,
  SwapVert as SwapVertIcon,
  List as ListIcon
} from '@mui/icons-material';
import { Link as RouterLink } from 'react-router-dom';

const FormsPage = () => {
  // URL do strony Google Sites
  const googleSiteUrl = 'https://sites.google.com/bgwpharma.com/brygadzisci/g%C5%82%C3%B3wna';
  
  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h5" gutterBottom>
          Formularze produkcyjne
        </Typography>
        <Typography variant="body2" color="text.secondary" gutterBottom>
          Formularze, dokumenty i narzędzia dostępne dla brygadzistów i operatorów produkcji
        </Typography>
      </Box>
      
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} sm={6} md={4}>
          <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <CardContent sx={{ flexGrow: 1 }}>
              <Typography variant="h6" gutterBottom component="div" sx={{ display: 'flex', alignItems: 'center' }}>
                <AssignmentIcon sx={{ mr: 1 }} />
                Raport - Skończone MO
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Formularz do raportowania zakończonych zadań produkcyjnych (MO). Wypełnij po zakończeniu zlecenia produkcyjnego.
              </Typography>
            </CardContent>
            <CardActions sx={{ display: 'flex', flexDirection: 'column' }}>
              <Button 
                startIcon={<AddIcon />} 
                component={RouterLink} 
                to="/production/forms/completed-mo"
                color="primary" 
                variant="contained"
                fullWidth
                sx={{ mb: 1 }}
              >
                Wypełnij formularz
              </Button>
              <Button 
                startIcon={<ListIcon />} 
                component={RouterLink} 
                to="/production/forms/responses"
                color="secondary" 
                variant="outlined"
                fullWidth
              >
                Wyświetl odpowiedzi
              </Button>
            </CardActions>
          </Card>
        </Grid>
        
        <Grid item xs={12} sm={6} md={4}>
          <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <CardContent sx={{ flexGrow: 1 }}>
              <Typography variant="h6" gutterBottom component="div" sx={{ display: 'flex', alignItems: 'center' }}>
                <FactCheckIcon sx={{ mr: 1 }} />
                Raport - Kontrola Produkcji
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Formularz do raportowania kontroli jakości produkcji. Zawiera szczegółowe informacje o przebiegu procesu produkcyjnego i warunkach atmosferycznych.
              </Typography>
            </CardContent>
            <CardActions sx={{ display: 'flex', flexDirection: 'column' }}>
              <Button 
                startIcon={<AddIcon />} 
                component={RouterLink} 
                to="/production/forms/production-control"
                color="primary" 
                variant="contained"
                fullWidth
                sx={{ mb: 1 }}
              >
                Wypełnij formularz
              </Button>
              <Button 
                startIcon={<ListIcon />} 
                component={RouterLink} 
                to="/production/forms/responses"
                color="secondary" 
                variant="outlined"
                fullWidth
              >
                Wyświetl odpowiedzi
              </Button>
            </CardActions>
          </Card>
        </Grid>
        
        <Grid item xs={12} sm={6} md={4}>
          <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <CardContent sx={{ flexGrow: 1 }}>
              <Typography variant="h6" gutterBottom component="div" sx={{ display: 'flex', alignItems: 'center' }}>
                <SwapVertIcon sx={{ mr: 1 }} />
                Raport - Zmiana Produkcji
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Formularz do raportowania pracy na zmianie produkcyjnej. Zawiera informacje o pracownikach, wykonanych produktach i innych czynnościach.
              </Typography>
            </CardContent>
            <CardActions sx={{ display: 'flex', flexDirection: 'column' }}>
              <Button 
                startIcon={<AddIcon />} 
                component={RouterLink} 
                to="/production/forms/production-shift"
                color="primary" 
                variant="contained"
                fullWidth
                sx={{ mb: 1 }}
              >
                Wypełnij formularz
              </Button>
              <Button 
                startIcon={<ListIcon />} 
                component={RouterLink} 
                to="/production/forms/responses"
                color="secondary" 
                variant="outlined"
                fullWidth
              >
                Wyświetl odpowiedzi
              </Button>
            </CardActions>
          </Card>
        </Grid>
      </Grid>
      
    </Container>
  );
};

export default FormsPage; 