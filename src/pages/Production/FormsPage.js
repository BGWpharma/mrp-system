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
          Formularze i dokumenty dostępne dla brygadzistów i operatorów produkcji
        </Typography>
      </Box>
      
      <Alert severity="info" sx={{ mb: 3 }}>
        Z powodów bezpieczeństwa, strona Google Sites nie może być wyświetlona bezpośrednio w aplikacji.
      </Alert>
      
      <Paper sx={{ 
        p: 4, 
        textAlign: 'center',
        minHeight: '300px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 3
      }}>
        <Typography variant="h6">
          Portal Brygadzistów BGW Pharma
        </Typography>
        
        <Typography variant="body1" paragraph>
          Kliknij poniższy przycisk, aby otworzyć portal z formularzami w nowej karcie.
        </Typography>
        
        <Button 
          variant="contained" 
          color="primary"
          endIcon={<LaunchIcon />}
          component="a"
          href={googleSiteUrl}
          target="_blank"
          rel="noopener noreferrer"
          size="large"
        >
          Otwórz portal formularzy
        </Button>
        
        <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
          Uwaga: Może być wymagane zalogowanie do konta Google.
        </Typography>
      </Paper>
    </Container>
  );
};

export default FormsPage; 