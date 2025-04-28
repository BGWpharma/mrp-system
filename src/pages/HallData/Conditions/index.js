import React from 'react';
import { Typography, Paper, Box, Container, Grid } from '@mui/material';

const HallDataConditionsPage = () => {
  return (
    <Container maxWidth="lg" sx={{ mt: 4 }}>
      <Typography variant="h4" gutterBottom>
        Warunki
      </Typography>
      
      <Paper elevation={3} sx={{ p: 3, mb: 4 }}>
        <Typography variant="h6" gutterBottom>
          Aktualne warunki na hali
        </Typography>
        
        <Grid container spacing={3} sx={{ mt: 2 }}>
          <Grid item xs={12} md={4}>
            <Paper elevation={2} sx={{ p: 2, textAlign: 'center' }}>
              <Typography variant="subtitle1" color="text.secondary">Temperatura</Typography>
              <Typography variant="h4">22.5°C</Typography>
            </Paper>
          </Grid>
          
          <Grid item xs={12} md={4}>
            <Paper elevation={2} sx={{ p: 2, textAlign: 'center' }}>
              <Typography variant="subtitle1" color="text.secondary">Wilgotność</Typography>
              <Typography variant="h4">48%</Typography>
            </Paper>
          </Grid>
          
          <Grid item xs={12} md={4}>
            <Paper elevation={2} sx={{ p: 2, textAlign: 'center' }}>
              <Typography variant="subtitle1" color="text.secondary">Ciśnienie</Typography>
              <Typography variant="h4">1013 hPa</Typography>
            </Paper>
          </Grid>
        </Grid>
      </Paper>
      
      <Paper elevation={3} sx={{ p: 3 }}>
        <Typography variant="h6" gutterBottom>
          Historia warunków
        </Typography>
        
        <Box sx={{ height: '300px', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: '#f5f5f5', borderRadius: 1 }}>
          <Typography variant="body1" color="text.secondary">
            Tutaj będą wykresy historycznych warunków
          </Typography>
        </Box>
      </Paper>
    </Container>
  );
};

export default HallDataConditionsPage; 