// src/pages/Production/ProductionPage.js
import React, { useState } from 'react';
import { Container, Typography, Box, Tabs, Tab, Button, Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions, CircularProgress } from '@mui/material';
import {
  FormatListBulleted as ListIcon,
  CalendarMonth as CalendarIcon,
  Assessment as ReportIcon,
  TrendingUp as ForecastIcon,
  ViewModule as GridIcon,
  ViewList as ViewListIcon,
  Description as FormsIcon,
  Business as BusinessIcon,
  Calculate as CalculateIcon,
  AdminPanelSettings as AdminIcon
} from '@mui/icons-material';
import TaskList from '../../components/production/TaskList';
import ProductionCalendar from '../../components/production/ProductionCalendar';
import ProductionReportPage from './ProductionReportPage';
import ForecastPage from './ForecastPage';
import FormsPage from './FormsPage';
import WorkstationsPage from './WorkstationsPage';
import CalculatorPage from './CalculatorPage';
import { initializeMissingCostFields } from '../../services/productionService';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';

const ProductionPage = () => {
  const [activeTab, setActiveTab] = useState(0);
  const [viewMode, setViewMode] = useState('list');
  const [adminDialogOpen, setAdminDialogOpen] = useState(false);
  const [initializing, setInitializing] = useState(false);
  const [initializationResult, setInitializationResult] = useState(null);
  const { currentUser } = useAuth();
  const { showSuccess, showError, showInfo } = useNotification();
  
  const handleTabChange = (event, newValue) => {
    setActiveTab(newValue);
  };
  
  const handleViewModeChange = () => {
    setViewMode(viewMode === 'list' ? 'calendar' : 'list');
  };

  const handleInitializeCostFields = async () => {
    try {
      setInitializing(true);
      setInitializationResult(null);
      
      const result = await initializeMissingCostFields(currentUser.uid);
      
      setInitializationResult(result);
      
      if (result.success) {
        showSuccess(result.message);
      } else {
        showError(result.message);
      }
    } catch (error) {
      console.error('Błąd podczas inicjalizacji pól kosztów:', error);
      showError('Wystąpił błąd podczas inicjalizacji pól kosztów: ' + error.message);
      setInitializationResult({
        success: false,
        message: error.message,
        error: error.toString()
      });
    } finally {
      setInitializing(false);
    }
  };
  
  const isAdmin = currentUser && (currentUser.role === 'admin' || currentUser.isAdmin);
  
  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Box sx={{ mb: 3, display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h5" gutterBottom>
          Produkcja
        </Typography>
        
        {isAdmin && (
          <Button 
            variant="outlined" 
            color="secondary" 
            startIcon={<AdminIcon />}
            onClick={() => setAdminDialogOpen(true)}
            sx={{ ml: 2 }}
          >
            Funkcje administracyjne
          </Button>
        )}
      </Box>
      
      <Tabs 
        value={activeTab} 
        onChange={handleTabChange} 
        variant="scrollable"
        scrollButtons="auto"
        sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}
      >
        <Tab icon={<ListIcon />} label="Lista zadań produkcyjnych" iconPosition="start" />
        <Tab icon={<CalendarIcon />} label="Kalendarz" iconPosition="start" />
        <Tab icon={<ReportIcon />} label="Raporty" iconPosition="start" />
        <Tab icon={<FormsIcon />} label="Formularze" iconPosition="start" />
        <Tab icon={<BusinessIcon />} label="Stanowiska produkcyjne" iconPosition="start" />
        <Tab icon={<ForecastIcon />} label="Prognoza zapotrzebowania" iconPosition="start" />
        <Tab icon={<CalculateIcon />} label="Kalkulator" iconPosition="start" />
      </Tabs>
      
      {activeTab === 0 && <TaskList />}
      {activeTab === 1 && <ProductionCalendar />}
      {activeTab === 2 && <ProductionReportPage />}
      {activeTab === 3 && <FormsPage />}
      {activeTab === 4 && <WorkstationsPage />}
      {activeTab === 5 && <ForecastPage />}
      {activeTab === 6 && <CalculatorPage />}
      
      {/* Dialog funkcji administracyjnych */}
      <Dialog open={adminDialogOpen} onClose={() => setAdminDialogOpen(false)}>
        <DialogTitle>Funkcje administracyjne</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Te funkcje przeznaczone są wyłącznie dla administratorów systemu. Wykonaj operacje ostrożnie, ponieważ mogą one wpłynąć na dane w całym systemie.
          </DialogContentText>
          
          <Box sx={{ mt: 3 }}>
            <Button 
              variant="contained" 
              color="primary" 
              onClick={handleInitializeCostFields}
              disabled={initializing}
              fullWidth
            >
              {initializing ? <CircularProgress size={24} color="inherit" /> : 'Inicjalizuj pola kosztów w zadaniach produkcyjnych'}
            </Button>
            
            {initializationResult && (
              <Box sx={{ mt: 2, p: 2, bgcolor: initializationResult.success ? 'success.light' : 'error.light', borderRadius: 1 }}>
                <Typography variant="body2" color="textPrimary">
                  {initializationResult.message}
                </Typography>
                {initializationResult.updatedTasks && (
                  <Typography variant="body2" color="textPrimary">
                    Zaktualizowano zadania: {initializationResult.updatedTasks.length}
                  </Typography>
                )}
                {initializationResult.failedTasks && initializationResult.failedTasks.length > 0 && (
                  <Typography variant="body2" color="error">
                    Nie udało się zaktualizować zadań: {initializationResult.failedTasks.length}
                  </Typography>
                )}
              </Box>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAdminDialogOpen(false)} color="primary">
            Zamknij
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default ProductionPage;