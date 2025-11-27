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
import { useTranslation } from '../../hooks/useTranslation';

const FormsPage = () => {
  const { t } = useTranslation();
  // URL do strony Google Sites
  const googleSiteUrl = 'https://sites.google.com/bgwpharma.com/brygadzisci/g%C5%82%C3%B3wna';
  
  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h5" gutterBottom>
          {t('productionForms.title')}
        </Typography>
        <Typography variant="body2" color="text.secondary" gutterBottom>
          {t('productionForms.description')}
        </Typography>
      </Box>
      
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} sm={6} md={4}>
          <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <CardContent sx={{ flexGrow: 1 }}>
              <Typography variant="h6" gutterBottom component="div" sx={{ display: 'flex', alignItems: 'center' }}>
                <AssignmentIcon sx={{ mr: 1 }} />
                {t('productionForms.completedMO.title')}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {t('productionForms.completedMO.description')}
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
                {t('productionForms.fillForm')}
              </Button>
              <Button 
                startIcon={<ListIcon />} 
                component={RouterLink} 
                to="/production/forms/responses?tab=completedMO"
                color="secondary" 
                variant="outlined"
                fullWidth
              >
                {t('productionForms.viewResponses')}
              </Button>
            </CardActions>
          </Card>
        </Grid>
        
        <Grid item xs={12} sm={6} md={4}>
          <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <CardContent sx={{ flexGrow: 1 }}>
              <Typography variant="h6" gutterBottom component="div" sx={{ display: 'flex', alignItems: 'center' }}>
                <FactCheckIcon sx={{ mr: 1 }} />
                {t('productionForms.productionControl.title')}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {t('productionForms.productionControl.description')}
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
                {t('productionForms.fillForm')}
              </Button>
              <Button 
                startIcon={<ListIcon />} 
                component={RouterLink} 
                to="/production/forms/responses?tab=productionControl"
                color="secondary" 
                variant="outlined"
                fullWidth
              >
                {t('productionForms.viewResponses')}
              </Button>
            </CardActions>
          </Card>
        </Grid>
        
        <Grid item xs={12} sm={6} md={4}>
          <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <CardContent sx={{ flexGrow: 1 }}>
              <Typography variant="h6" gutterBottom component="div" sx={{ display: 'flex', alignItems: 'center' }}>
                <SwapVertIcon sx={{ mr: 1 }} />
                {t('productionForms.productionShift.title')}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {t('productionForms.productionShift.description')}
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
                {t('productionForms.fillForm')}
              </Button>
              <Button 
                startIcon={<ListIcon />} 
                component={RouterLink} 
                to="/production/forms/responses?tab=productionShift"
                color="secondary" 
                variant="outlined"
                fullWidth
              >
                {t('productionForms.viewResponses')}
              </Button>
            </CardActions>
          </Card>
        </Grid>
      </Grid>
      
    </Container>
  );
};

export default FormsPage; 