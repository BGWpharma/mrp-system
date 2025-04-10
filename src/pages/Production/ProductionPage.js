// src/pages/Production/ProductionPage.js
import React, { useState } from 'react';
import { Container, Typography, Box, Tabs, Tab } from '@mui/material';
import {
  FormatListBulleted as ListIcon,
  CalendarMonth as CalendarIcon,
  Assessment as ReportIcon,
  TrendingUp as ForecastIcon,
  ViewModule as GridIcon,
  ViewList as ViewListIcon,
  Description as FormsIcon,
  Business as BusinessIcon,
  Calculate as CalculateIcon
} from '@mui/icons-material';
import TaskList from '../../components/production/TaskList';
import ProductionCalendar from '../../components/production/ProductionCalendar';
import ProductionReportPage from './ProductionReportPage';
import ForecastPage from './ForecastPage';
import FormsPage from './FormsPage';
import WorkstationsPage from './WorkstationsPage';
import CalculatorPage from './CalculatorPage';

const ProductionPage = () => {
  const [activeTab, setActiveTab] = useState(0);
  const [viewMode, setViewMode] = useState('list');
  
  const handleTabChange = (event, newValue) => {
    setActiveTab(newValue);
  };
  
  const handleViewModeChange = () => {
    setViewMode(viewMode === 'list' ? 'calendar' : 'list');
  };
  
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
    </Container>
  );
};

export default ProductionPage;