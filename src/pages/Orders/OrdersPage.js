// src/pages/Orders/OrdersPage.js
import React, { useState, useEffect } from 'react';
import { Container, Typography, Box, Tabs, Tab, useMediaQuery, useTheme } from '@mui/material';
import {
  ShoppingCart as OrdersIcon,
  People as CustomersIcon,
  ListAlt as PriceListIcon
} from '@mui/icons-material';
import { useLocation, useNavigate } from 'react-router-dom';
import OrdersList from '../../components/orders/OrdersList';
import CustomersList from '../../components/customers/CustomersList';
import PriceListsPage from '../Sales/PriceLists/PriceListsPage';
import { useTranslation } from '../../hooks/useTranslation';

const OrdersPage = () => {
  const { t } = useTranslation('orders');
  const [activeTab, setActiveTab] = useState(0);
  
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const location = useLocation();
  const navigate = useNavigate();
  
  // Auto-przełączanie zakładek na podstawie URL
  useEffect(() => {
    if (location.pathname.includes('/orders/customers')) {
      setActiveTab(1);
    } else if (location.pathname.includes('/orders/price-lists')) {
      setActiveTab(2);
    } else if (location.pathname === '/orders') {
      setActiveTab(0);
    }
  }, [location.pathname]);
  
  // Zmiana URL przy zmianie zakładki
  const handleTabChange = (event, newValue) => {
    setActiveTab(newValue);
    switch (newValue) {
      case 0:
        navigate('/orders');
        break;
      case 1:
        navigate('/orders/customers');
        break;
      case 2:
        navigate('/orders/price-lists');
        break;
      default:
        navigate('/orders');
    }
  };
  
  const tabData = [
    { icon: <OrdersIcon />, label: t('orders.tabs.orders'), value: 0 },
    { icon: <CustomersIcon />, label: t('orders.tabs.customers'), value: 1 },
    { icon: <PriceListIcon />, label: t('orders.tabs.priceLists'), value: 2 }
  ];
  
  // Funkcja renderująca zawartość aktualnie wybranej zakładki
  const renderTabContent = () => {
    switch (activeTab) {
      case 0: return <OrdersList />;
      case 1: return <CustomersList />;
      case 2: return <PriceListsPage />;
      default: return <OrdersList />;
    }
  };
  
  return (
    <Container maxWidth="xl" sx={{ mt: isMobile ? 2 : 0, mb: 4, px: isMobile ? 1 : 2 }}>
      <Box sx={{ mb: 3, display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h5" gutterBottom sx={{ fontSize: isMobile ? '1.25rem' : '1.5rem', mb: 0 }}>
          {t('orders.pageTitle')}
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

export default OrdersPage;

