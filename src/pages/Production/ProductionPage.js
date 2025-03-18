// src/pages/Production/ProductionPage.js
import React, { useState, useEffect } from 'react';
import { Container, Box, ToggleButtonGroup, ToggleButton, Tooltip, Tabs, Tab, Typography, Button } from '@mui/material';
import { ViewList as ListIcon, CalendarMonth as CalendarIcon, ListAlt as ListAltIcon, BarChart as ReportIcon, ShoppingBasket as ForecastIcon, Add as AddIcon } from '@mui/icons-material';
import TaskList from '../../components/production/TaskList';
import ProductionCalendar from '../../components/production/ProductionCalendar';
import { Link, useNavigate } from 'react-router-dom';

const ProductionPage = () => {
  const [viewMode, setViewMode] = useState('list');
  const [activeTab, setActiveTab] = useState(0);
  const navigate = useNavigate();
  
  const handleTabChange = (event, newValue) => {
    setActiveTab(newValue);
    
    switch (newValue) {
      case 0: // Lista zadań
        setViewMode('list');
        break;
      case 1: // Kalendarz
        setViewMode('calendar');
        break;
      case 2: // Raporty
        navigate('/production/reports');
        break;
      case 3: // Prognoza zapotrzebowania
        navigate('/production/forecast');
        break;
      default:
        setViewMode('list');
    }
  };
  
  // Po nawigacji na stronę resetujemy zakładkę do listy lub kalendarza
  useEffect(() => {
    setActiveTab(viewMode === 'list' ? 0 : 1);
  }, [viewMode]);
  
  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Box sx={{ mb: 3, display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h5" gutterBottom>
          Produkcja
        </Typography>
      </Box>
      
      <Tabs 
        value={activeTab} 
        onChange={handleTabChange} 
        variant="scrollable"
        scrollButtons="auto"
        sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}
      >
        <Tab icon={<ListIcon />} label="Lista zadań" iconPosition="start" />
        <Tab icon={<CalendarIcon />} label="Kalendarz" iconPosition="start" />
        <Tab icon={<ReportIcon />} label="Raporty" iconPosition="start" />
        <Tab icon={<ForecastIcon />} label="Prognoza zapotrzebowania" iconPosition="start" />
      </Tabs>
      
      {(activeTab === 0 || activeTab === 1) && (
        <>
          {viewMode === 'list' ? (
            <TaskList />
          ) : (
            <ProductionCalendar />
          )}
        </>
      )}
    </Container>
  );
};

export default ProductionPage;