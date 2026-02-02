// src/pages/Sales/SalesPage.js
import React, { useState, useEffect } from 'react';
import { Container, Typography, Box, Tabs, Tab, useMediaQuery, useTheme } from '@mui/material';
import {
  Receipt as InvoicesIcon,
  AccountBalance as ReinvoiceIcon,
  Factory as FactoryIcon,
  Calculate as QuotationIcon
} from '@mui/icons-material';
import { useLocation, useNavigate } from 'react-router-dom';
import InvoicesList from '../../components/invoices/InvoicesList';
import ReinvoicesList from '../../components/invoices/ReinvoicesList';
import FactoryCostsTab from '../../components/sales/FactoryCostsTab';
import QuotationTool from '../../components/sales/quotation/QuotationTool';
import { useTranslation } from '../../hooks/useTranslation';

const SalesPage = () => {
  const { t } = useTranslation('invoices');
  const [activeTab, setActiveTab] = useState(0);
  
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const location = useLocation();
  const navigate = useNavigate();
  
  // Auto-przełączanie zakładek na podstawie URL
  useEffect(() => {
    if (location.pathname.includes('/sales/material-advances')) {
      setActiveTab(1);
    } else if (location.pathname.includes('/sales/factory-costs')) {
      setActiveTab(2);
    } else if (location.pathname.includes('/sales/quotation')) {
      setActiveTab(3);
    } else if (location.pathname === '/sales' || location.pathname === '/invoices') {
      setActiveTab(0);
    }
  }, [location.pathname]);
  
  // Zmiana URL przy zmianie zakładki
  const handleTabChange = (event, newValue) => {
    setActiveTab(newValue);
    switch (newValue) {
      case 0:
        navigate('/sales');
        break;
      case 1:
        navigate('/sales/material-advances');
        break;
      case 2:
        navigate('/sales/factory-costs');
        break;
      case 3:
        navigate('/sales/quotation');
        break;
      default:
        navigate('/sales');
    }
  };
  
  const tabData = [
    { icon: <InvoicesIcon />, label: t('tabs.invoices'), value: 0 },
    { icon: <ReinvoiceIcon />, label: t('tabs.materialAdvances'), value: 1 },
    { icon: <FactoryIcon />, label: t('tabs.factoryCosts'), value: 2 },
    { icon: <QuotationIcon />, label: t('tabs.quotation'), value: 3 }
  ];
  
  // Funkcja renderująca zawartość aktualnie wybranej zakładki
  const renderTabContent = () => {
    switch (activeTab) {
      case 0: return <InvoicesList />;
      case 1: return <ReinvoicesList />;
      case 2: return <FactoryCostsTab />;
      case 3: return <QuotationTool />;
      default: return <InvoicesList />;
    }
  };
  
  return (
    <Container maxWidth="xl" sx={{ mt: isMobile ? 2 : 0, mb: 4, px: isMobile ? 1 : 2 }}>
      <Box sx={{ mb: 3, display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h5" gutterBottom sx={{ fontSize: isMobile ? '1.25rem' : '1.5rem', mb: 0 }}>
          {t('pageTitle')}
        </Typography>
      </Box>
      
      {/* Zakładki */}
      <Tabs 
        value={activeTab} 
        onChange={handleTabChange} 
        variant="scrollable"
        scrollButtons="auto"
        allowScrollButtonsMobile
        sx={{ 
          borderBottom: 1, 
          borderColor: 'divider', 
          mb: 3,
          '& .MuiTab-root': {
            minHeight: isMobile ? '48px' : '56px',
            py: 1,
            fontSize: isMobile ? '0.775rem' : '0.875rem',
            minWidth: isMobile ? '120px' : '160px'
          },
        }}
      >
        {tabData.map((tab) => (
          <Tab 
            key={tab.value}
            icon={tab.icon} 
            label={tab.label} 
            iconPosition="start"
            sx={{ textTransform: 'none' }}
          />
        ))}
      </Tabs>
      
      {/* Zawartość aktualnie wybranej zakładki */}
      <Box>
        {renderTabContent()}
      </Box>
    </Container>
  );
};

export default SalesPage;

