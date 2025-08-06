// src/components/common/LoadingExamples.js
// Ten plik zawiera przykłady użycia różnych typów ekranów ładowania

import React, { useState, useEffect } from 'react';
import { 
  Container, 
  Typography, 
  Button, 
  Box, 
  Paper,
  Grid,
  Card,
  CardContent
} from '@mui/material';
import LoadingScreen from './LoadingScreen';
import Loader from './Loader';

const LoadingExamples = () => {
  const [showFullScreen, setShowFullScreen] = useState(false);
  const [showCard, setShowCard] = useState(false);
  const [loading, setLoading] = useState(false);

  // Symulacja ładowania danych
  const simulateLoading = (type, duration = 3000) => {
    if (type === 'fullscreen') {
      setShowFullScreen(true);
      setTimeout(() => setShowFullScreen(false), duration);
    } else if (type === 'card') {
      setShowCard(true);
      setTimeout(() => setShowCard(false), duration);
    } else if (type === 'simple') {
      setLoading(true);
      setTimeout(() => setLoading(false), duration);
    }
  };

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Typography variant="h4" gutterBottom>
        Przykłady ekranów ładowania
      </Typography>
      
      <Grid container spacing={3}>
        {/* Pełnoekranowy LoadingScreen */}
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Pełnoekranowy LoadingScreen
              </Typography>
              <Typography variant="body2" color="text.secondary" paragraph>
                Profesjonalny ekran ładowania z animowanym logo, używany podczas inicjalizacji aplikacji.
              </Typography>
              <Button 
                variant="contained" 
                onClick={() => simulateLoading('fullscreen')}
              >
                Pokaż ekran ładowania
              </Button>
            </CardContent>
          </Card>
        </Grid>

        {/* Kompaktowy LoadingScreen */}
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Kompaktowy LoadingScreen
              </Typography>
              <Typography variant="body2" color="text.secondary" paragraph>
                Mniejsza wersja ekranu ładowania do użycia w kontenerach i kartach.
              </Typography>
              <Button 
                variant="contained" 
                onClick={() => simulateLoading('card')}
              >
                Pokaż w karcie
              </Button>
              
              {showCard && (
                <Box sx={{ mt: 2 }}>
                  <Paper sx={{ p: 2, minHeight: 200 }}>
                    <LoadingScreen 
                      message="Ładowanie danych..." 
                      fullScreen={false}
                      size={60}
                    />
                  </Paper>
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Prosty Loader */}
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Różne typy Loader
              </Typography>
              <Typography variant="body2" color="text.secondary" paragraph>
                Prosty loader z Material-UI lub zaawansowany z logo.
              </Typography>
              
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Button 
                  variant="outlined" 
                  onClick={() => simulateLoading('simple')}
                >
                  Test prostego loadera
                </Button>

                {loading && (
                  <Paper sx={{ p: 2 }}>
                    <Typography variant="subtitle2" gutterBottom>
                      Prosty loader:
                    </Typography>
                    <Loader type="simple" />
                    
                    <Typography variant="subtitle2" gutterBottom sx={{ mt: 2 }}>
                      Zaawansowany loader:
                    </Typography>
                    <Loader 
                      type="advanced" 
                      message="Przetwarzanie..."
                      size={50}
                    />
                    
                    <Typography variant="subtitle2" gutterBottom sx={{ mt: 2 }}>
                      Inline loader:
                    </Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography>Ładowanie</Typography>
                      <Loader type="inline" />
                    </Box>
                  </Paper>
                )}
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Przykłady użycia w kodzie */}
        <Grid item xs={12}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              Przykłady użycia w kodzie
            </Typography>
            
            <Box sx={{ mt: 2 }}>
              <Typography variant="subtitle2" gutterBottom>
                1. Pełnoekranowy LoadingScreen:
              </Typography>
              <Box component="pre" sx={{ 
                backgroundColor: 'grey.100', 
                p: 2, 
                borderRadius: 1,
                fontSize: '0.875rem',
                overflow: 'auto'
              }}>
{`<LoadingScreen 
  message="Inicjalizacja aplikacji..." 
  fullScreen={true}
/>`}
              </Box>
            </Box>

            <Box sx={{ mt: 2 }}>
              <Typography variant="subtitle2" gutterBottom>
                2. Kompaktowy LoadingScreen w kontenerze:
              </Typography>
              <Box component="pre" sx={{ 
                backgroundColor: 'grey.100', 
                p: 2, 
                borderRadius: 1,
                fontSize: '0.875rem',
                overflow: 'auto'
              }}>
{`<LoadingScreen 
  message="Ładowanie danych..." 
  fullScreen={false}
  size={80}
/>`}
              </Box>
            </Box>

            <Box sx={{ mt: 2 }}>
              <Typography variant="subtitle2" gutterBottom>
                3. Różne typy Loader:
              </Typography>
              <Box component="pre" sx={{ 
                backgroundColor: 'grey.100', 
                p: 2, 
                borderRadius: 1,
                fontSize: '0.875rem',
                overflow: 'auto'
              }}>
{`// Prosty loader
<Loader type="simple" />

// Zaawansowany z logo
<Loader type="advanced" message="Przetwarzanie..." size={60} />

// Kompaktowy inline
<Loader type="inline" />`}
              </Box>
            </Box>
          </Paper>
        </Grid>
      </Grid>

      {/* Pełnoekranowy overlay */}
      {showFullScreen && (
        <LoadingScreen 
          message="To jest przykład pełnoekranowego ekranu ładowania!" 
          fullScreen={true}
        />
      )}
    </Container>
  );
};

export default LoadingExamples;