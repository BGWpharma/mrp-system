import React from 'react';
import { Container, Typography, Box, Paper, Alert, Button, Grid, Card, CardContent, CardActions } from '@mui/material';
import { 
  Add as AddIcon,
  List as ListIcon,
  Thermostat as ThermostatIcon,
  PrecisionManufacturing as PrecisionManufacturingIcon,
  Build as BuildIcon,
  BugReport as BugReportIcon
} from '@mui/icons-material';
import { Link as RouterLink } from 'react-router-dom';
import { useTranslation } from '../../../hooks/useTranslation';

const HallDataFormsPage = () => {
  const { t } = useTranslation();
  
  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h5" gutterBottom>
          {t('hallDataForms.title')}
        </Typography>
        <Typography variant="body2" color="text.secondary" gutterBottom>
          {t('hallDataForms.description')}
        </Typography>
      </Box>
      
      <Grid container spacing={3} sx={{ mb: 4 }}>
        {/* Raport warunków środowiskowych */}
        <Grid item xs={12} sm={6} md={4}>
          <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <CardContent sx={{ flexGrow: 1 }}>
              <Typography variant="h6" gutterBottom component="div" sx={{ display: 'flex', alignItems: 'center' }}>
                <ThermostatIcon sx={{ mr: 1 }} />
                {t('hallDataForms.environmentalReport.title')}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {t('hallDataForms.environmentalReport.description')}
              </Typography>
            </CardContent>
            <CardActions sx={{ display: 'flex', flexDirection: 'column' }}>
              <Button 
                startIcon={<AddIcon />} 
                component={RouterLink} 
                to="/hall-data/forms/environmental-report"
                color="primary" 
                variant="contained"
                fullWidth
                sx={{ mb: 1 }}
              >
                {t('hallDataForms.fillForm')}
              </Button>
              <Button 
                startIcon={<ListIcon />} 
                component={RouterLink} 
                to="/hall-data/forms/responses?type=environmental"
                color="secondary" 
                variant="outlined"
                fullWidth
              >
                {t('hallDataForms.viewResponses')}
              </Button>
            </CardActions>
          </Card>
        </Grid>
        
        {/* Raport stanu maszyn */}
        <Grid item xs={12} sm={6} md={4}>
          <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <CardContent sx={{ flexGrow: 1 }}>
              <Typography variant="h6" gutterBottom component="div" sx={{ display: 'flex', alignItems: 'center' }}>
                <PrecisionManufacturingIcon sx={{ mr: 1 }} />
                {t('hallDataForms.machineReport.title')}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {t('hallDataForms.machineReport.description')}
              </Typography>
            </CardContent>
            <CardActions sx={{ display: 'flex', flexDirection: 'column' }}>
              <Button 
                startIcon={<AddIcon />} 
                component={RouterLink} 
                to="/hall-data/forms/machine-report"
                color="primary" 
                variant="contained"
                fullWidth
                sx={{ mb: 1 }}
              >
                {t('hallDataForms.fillForm')}
              </Button>
              <Button 
                startIcon={<ListIcon />} 
                component={RouterLink} 
                to="/hall-data/forms/responses?type=machine"
                color="secondary" 
                variant="outlined"
                fullWidth
              >
                {t('hallDataForms.viewResponses')}
              </Button>
            </CardActions>
          </Card>
        </Grid>

        {/* Raport serwisowy - tygodniowy */}
        <Grid item xs={12} sm={6} md={4}>
          <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <CardContent sx={{ flexGrow: 1 }}>
              <Typography variant="h6" gutterBottom component="div" sx={{ display: 'flex', alignItems: 'center' }}>
                <BuildIcon sx={{ mr: 1 }} />
                Raport - Tygodniowy Serwis
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Formularz tygodniowego przeglądu serwisowego. Zawiera 9 podstawowych zadań kontrolnych do wykonania co tydzień.
              </Typography>
            </CardContent>
            <CardActions sx={{ display: 'flex', flexDirection: 'column' }}>
              <Button 
                startIcon={<AddIcon />} 
                component={RouterLink} 
                to="/hall-data/forms/service-report"
                color="primary" 
                variant="contained"
                fullWidth
                sx={{ mb: 1 }}
              >
                {t('hallDataForms.fillForm')}
              </Button>
              <Button 
                startIcon={<ListIcon />} 
                component={RouterLink} 
                to="/hall-data/forms/responses?type=service"
                color="secondary" 
                variant="outlined"
                fullWidth
              >
                {t('hallDataForms.viewResponses')}
              </Button>
            </CardActions>
          </Card>
        </Grid>

        {/* Raport serwisowy - miesięczny */}
        <Grid item xs={12} sm={6} md={4}>
          <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <CardContent sx={{ flexGrow: 1 }}>
              <Typography variant="h6" gutterBottom component="div" sx={{ display: 'flex', alignItems: 'center' }}>
                <BuildIcon sx={{ mr: 1 }} />
                Raport - Miesięczny Serwis
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Formularz miesięcznego przeglądu serwisowego. Zawiera rozszerzoną listę 12 zadań kontrolnych do wykonania co miesiąc.
              </Typography>
            </CardContent>
            <CardActions sx={{ display: 'flex', flexDirection: 'column' }}>
              <Button 
                startIcon={<AddIcon />} 
                component={RouterLink} 
                to="/hall-data/forms/monthly-service-report"
                color="primary" 
                variant="contained"
                fullWidth
                sx={{ mb: 1 }}
              >
                {t('hallDataForms.fillForm')}
              </Button>
              <Button 
                startIcon={<ListIcon />} 
                component={RouterLink} 
                to="/hall-data/forms/responses?type=monthly"
                color="secondary" 
                variant="outlined"
                fullWidth
              >
                {t('hallDataForms.viewResponses')}
              </Button>
            </CardActions>
          </Card>
        </Grid>

        {/* Rejestr usterek */}
        <Grid item xs={12} sm={6} md={4}>
          <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <CardContent sx={{ flexGrow: 1 }}>
              <Typography variant="h6" gutterBottom component="div" sx={{ display: 'flex', alignItems: 'center' }}>
                <BugReportIcon sx={{ mr: 1 }} />
                Rejestr Usterek
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Formularz zgłaszania i śledzenia usterek. Zawiera szczegółowy opis problemu, diagnozę i status naprawy.
              </Typography>
            </CardContent>
            <CardActions sx={{ display: 'flex', flexDirection: 'column' }}>
              <Button 
                startIcon={<AddIcon />} 
                component={RouterLink} 
                to="/hall-data/forms/defect-registry"
                color="primary" 
                variant="contained"
                fullWidth
                sx={{ mb: 1 }}
              >
                {t('hallDataForms.fillForm')}
              </Button>
              <Button 
                startIcon={<ListIcon />} 
                component={RouterLink} 
                to="/hall-data/forms/responses?type=defect"
                color="secondary" 
                variant="outlined"
                fullWidth
              >
                {t('hallDataForms.viewResponses')}
              </Button>
            </CardActions>
          </Card>
        </Grid>
      </Grid>
      
    </Container>
  );
};

export default HallDataFormsPage;

