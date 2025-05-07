import React from 'react';
import { Container, Typography, Box, Paper, Alert, Button, Link, Grid, Card, CardContent, CardActions } from '@mui/material';
import { 
  Launch as LaunchIcon,
  Assignment as AssignmentIcon,
  Add as AddIcon
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
            <CardActions>
              <Button 
                startIcon={<AddIcon />} 
                component={RouterLink} 
                to="/production/forms/completed-mo"
                color="primary" 
                variant="contained"
                fullWidth
              >
                Wypełnij formularz
              </Button>
            </CardActions>
          </Card>
        </Grid>
      </Grid>
      
      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" gutterBottom>
          Portal Brygadzistów BGW Pharma
        </Typography>
        
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Portal zawiera wszystkie niezbędne dokumenty i formularze produkcyjne.
        </Typography>
        
        <Button 
          variant="contained" 
          color="primary"
          endIcon={<LaunchIcon />}
          component="a"
          href={googleSiteUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          Otwórz portal formularzy
        </Button>
      </Paper>
      
      <Alert severity="info" sx={{ mt: 3 }}>
        Z powodów bezpieczeństwa, strona Google Sites nie może być wyświetlona bezpośrednio w aplikacji.
      </Alert>
    </Container>
  );
};

export default FormsPage; 