import React from 'react';
import { Container, Typography, Box, Paper, Alert, Button, Link } from '@mui/material';
import { Launch as LaunchIcon } from '@mui/icons-material';

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