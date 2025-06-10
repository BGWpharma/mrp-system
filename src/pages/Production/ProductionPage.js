// src/pages/Production/ProductionPage.js
import React, { useState } from 'react';
import { Container, Typography, Box, Tabs, Tab, Button, Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions, CircularProgress, useMediaQuery, useTheme, IconButton, Menu, MenuItem, SwipeableDrawer, List, ListItem, ListItemIcon, ListItemText, Divider } from '@mui/material';
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
  AdminPanelSettings as AdminIcon,
  Menu as MenuIcon
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
  
  // Dodajemy stan dla menu mobilnego
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  
  const handleTabChange = (event, newValue) => {
    setActiveTab(newValue);
    if (isMobile) {
      setMobileMenuOpen(false);
    }
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
  
  const tabData = [
    { icon: <ListIcon />, label: "Lista zadań produkcyjnych", value: 0 },
    { icon: <CalendarIcon />, label: "Kalendarz", value: 1 },
    { icon: <ReportIcon />, label: "Raport MO", value: 2 },
    { icon: <FormsIcon />, label: "Formularze", value: 3 },
    { icon: <ForecastIcon />, label: "Prognoza zapotrzebowania", value: 4 },
    { icon: <CalculateIcon />, label: "Kalkulator", value: 5 },
    { icon: <BusinessIcon />, label: "Stanowiska produkcyjne", value: 6 }
  ];
  
  // Funkcja renderująca zawartość aktualnie wybranej zakładki
  const renderTabContent = () => {
    switch (activeTab) {
      case 0: return <TaskList />;
      case 1: return <ProductionCalendar />;
      case 2: return <ProductionReportPage />;
      case 3: return <FormsPage />;
      case 4: return <ForecastPage />;
      case 5: return <CalculatorPage />;
      case 6: return <WorkstationsPage />;
      default: return <TaskList />;
    }
  };
  
  return (
    <Container maxWidth="lg" sx={{ mt: isMobile ? 2 : 0, mb: 4, px: isMobile ? 1 : 2 }}>
      <Box sx={{ mb: 3, display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, justifyContent: 'space-between', alignItems: 'center' }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
          <Typography variant="h5" gutterBottom sx={{ fontSize: isMobile ? '1.25rem' : '1.5rem', mb: 0 }}>
            Produkcja
          </Typography>
          
          {isMobile && (
            <IconButton 
              color="primary" 
              onClick={() => setMobileMenuOpen(true)}
              size="large"
            >
              <MenuIcon />
            </IconButton>
          )}
        </Box>
        
        {isAdmin && !isMobile && (
          <Button 
            variant="outlined" 
            color="secondary" 
            startIcon={<AdminIcon />}
            onClick={() => setAdminDialogOpen(true)}
            sx={{ ml: { xs: 0, sm: 2 }, mt: { xs: 1, sm: 0 } }}
            size={isMobile ? "small" : "medium"}
          >
            Funkcje administracyjne
          </Button>
        )}
      </Box>
      
      {isMobile ? (
        // Zakładki na ekranie mobilnym - pokazujemy tylko aktualną zakładkę i menu z pełną listą
        <Box sx={{ width: '100%', mb: 2 }}>
          <Tabs 
            value={activeTab} 
            onChange={handleTabChange} 
            variant="fullWidth"
            sx={{ 
              borderBottom: 1, 
              borderColor: 'divider',
              '& .MuiTab-root': {
                minHeight: '48px',
                py: 1,
                fontSize: '0.775rem'
              }
            }}
          >
            <Tab 
              icon={tabData[activeTab].icon} 
              label={tabData[activeTab].label}
              sx={{ 
                '& .MuiSvgIcon-root': {
                  fontSize: '1.2rem',
                  mr: 1
                }
              }}
            />
          </Tabs>
          
          {/* Menu boczne z wszystkimi zakładkami */}
          <SwipeableDrawer
            anchor="left"
            open={mobileMenuOpen}
            onClose={() => setMobileMenuOpen(false)}
            onOpen={() => setMobileMenuOpen(true)}
          >
            <Box sx={{ width: 250 }}>
              <List>
                <ListItem sx={{ py: 2 }}>
                  <Typography variant="h6">Menu produkcji</Typography>
                </ListItem>
                <Divider />
                {tabData.map((tab, index) => (
                  <ListItem 
                    button 
                    key={index} 
                    onClick={() => handleTabChange(null, tab.value)}
                    selected={activeTab === tab.value}
                  >
                    <ListItemIcon>
                      {tab.icon}
                    </ListItemIcon>
                    <ListItemText primary={tab.label.split(' ')[0]} secondary={tab.label.split(' ').slice(1).join(' ')} />
                  </ListItem>
                ))}
                
                {isAdmin && (
                  <>
                    <Divider sx={{ my: 1 }} />
                    <ListItem button onClick={() => {
                      setMobileMenuOpen(false);
                      setAdminDialogOpen(true);
                    }}>
                      <ListItemIcon>
                        <AdminIcon />
                      </ListItemIcon>
                      <ListItemText primary="Funkcje administracyjne" />
                    </ListItem>
                  </>
                )}
              </List>
            </Box>
          </SwipeableDrawer>
        </Box>
      ) : (
        // Zakładki na ekranie desktopowym - standardowe wyświetlanie
        <Tabs 
          value={activeTab} 
          onChange={handleTabChange} 
          variant="scrollable"
          scrollButtons="auto"
          sx={{ borderBottom: 1, borderColor: 'divider', mb: 1 }}
        >
          {tabData.map((tab, index) => (
            <Tab key={index} icon={tab.icon} label={tab.label} iconPosition="start" />
          ))}
        </Tabs>
      )}
      
      {/* Wyświetlamy zawartość aktualnie wybranej zakładki */}
      {renderTabContent()}
      
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