import React from 'react';
import { Container, Typography, Box, Paper, Alert, Button, Grid, Card, CardContent, CardActions } from '@mui/material';
import { 
  Add as AddIcon,
  List as ListIcon,
  Storage as StorageIcon
} from '@mui/icons-material';
import { Link as RouterLink } from 'react-router-dom';
import { useTranslation } from '../../hooks/useTranslation';

const InventoryFormsPage = () => {
  const { t } = useTranslation();
  
  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h5" gutterBottom>
          {t('inventoryForms.title')}
        </Typography>
        <Typography variant="body2" color="text.secondary" gutterBottom>
          {t('inventoryForms.description')}
        </Typography>
      </Box>
      
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} sm={6} md={6}>
          <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <CardContent sx={{ flexGrow: 1 }}>
              <Typography variant="h6" gutterBottom component="div" sx={{ display: 'flex', alignItems: 'center' }}>
                <StorageIcon sx={{ mr: 1 }} />
                {t('inventoryForms.loadingReport.title')}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {t('inventoryForms.loadingReport.description')}
              </Typography>
            </CardContent>
            <CardActions sx={{ display: 'flex', flexDirection: 'column' }}>
              <Button 
                startIcon={<AddIcon />} 
                component={RouterLink} 
                to="/inventory/forms/loading-report"
                color="primary" 
                variant="contained"
                fullWidth
                sx={{ mb: 1 }}
              >
                {t('inventoryForms.fillForm')}
              </Button>
              <Button 
                startIcon={<ListIcon />} 
                component={RouterLink} 
                to="/inventory/forms/responses"
                color="secondary" 
                variant="outlined"
                fullWidth
              >
                {t('inventoryForms.viewResponses')}
              </Button>
            </CardActions>
          </Card>
        </Grid>
        
        <Grid item xs={12} sm={6} md={6}>
          <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <CardContent sx={{ flexGrow: 1 }}>
              <Typography variant="h6" gutterBottom component="div" sx={{ display: 'flex', alignItems: 'center' }}>
                <StorageIcon sx={{ mr: 1, transform: 'scaleX(-1)' }} />
                {t('inventoryForms.unloadingReport.title')}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {t('inventoryForms.unloadingReport.description')}
              </Typography>
            </CardContent>
            <CardActions sx={{ display: 'flex', flexDirection: 'column' }}>
              <Button 
                startIcon={<AddIcon />} 
                component={RouterLink} 
                to="/inventory/forms/unloading-report"
                color="primary" 
                variant="contained"
                fullWidth
                sx={{ mb: 1 }}
              >
                {t('inventoryForms.fillForm')}
              </Button>
              <Button 
                startIcon={<ListIcon />} 
                component={RouterLink} 
                to="/inventory/forms/responses"
                color="secondary" 
                variant="outlined"
                fullWidth
              >
                {t('inventoryForms.viewResponses')}
              </Button>
            </CardActions>
          </Card>
        </Grid>
      </Grid>
      
    </Container>
  );
};

export default InventoryFormsPage; 