import React, { useState } from 'react';
import { Container, Typography, Box, Tabs, Tab } from '@mui/material';
import PurchaseOrderList from '../../components/purchaseOrders/PurchaseOrderList';
import ProcurementForecastsPage from '../Inventory/ProcurementForecastsPage';
import { PurchaseOrderListStateProvider } from '../../contexts/PurchaseOrderListStateContext';
import { useTranslation } from '../../hooks/useTranslation';

const PurchaseOrdersPage = () => {
  const { t } = useTranslation('purchaseOrders');
  const [currentTab, setCurrentTab] = useState(0);

  return (
    <PurchaseOrderListStateProvider>
      <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
        <Box sx={{ mb: 3 }}>
          <Typography variant="h5">
            {t('purchaseOrders.title')}
          </Typography>
        </Box>

        <Tabs
          value={currentTab}
          onChange={(e, v) => setCurrentTab(v)}
          sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}
        >
          <Tab label={t('purchaseOrders.tabs.orders', 'Zamówienia')} />
          <Tab label={t('purchaseOrders.tabs.forecasts', 'Prognozy zakupowe')} />
        </Tabs>

        {currentTab === 0 && <PurchaseOrderList />}
        {currentTab === 1 && <ProcurementForecastsPage embedded={true} />}
      </Container>
    </PurchaseOrderListStateProvider>
  );
};

export default PurchaseOrdersPage;
