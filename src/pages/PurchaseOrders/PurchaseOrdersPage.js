import React, { useState } from 'react';
import { Container, Typography, Box, Tabs, Tab, ToggleButtonGroup, ToggleButton } from '@mui/material';
import { useLocation } from 'react-router-dom';
import ViewListIcon from '@mui/icons-material/ViewList';
import ViewKanbanIcon from '@mui/icons-material/ViewKanban';
import PurchaseOrderList from '../../components/purchaseOrders/PurchaseOrderList';
import POKanbanBoard from '../../components/purchaseOrders/kanban/POKanbanBoard';
import ProcurementForecastsPage from '../Inventory/ProcurementForecastsPage';
import { PurchaseOrderListStateProvider } from '../../contexts/PurchaseOrderListStateContext';
import { useTranslation } from '../../hooks/useTranslation';

const VIEW_MODE_KEY = 'po-view-mode';

const PurchaseOrdersPage = () => {
  const { t } = useTranslation('purchaseOrders');
  const location = useLocation();
  const initialOpenPOId = location.state?.openPOId || null;
  const [currentTab, setCurrentTab] = useState(0);
  const [viewMode, setViewMode] = useState(() => {
    if (initialOpenPOId) return 'kanban';
    return localStorage.getItem(VIEW_MODE_KEY) || 'kanban';
  });

  const handleViewModeChange = (_, newMode) => {
    if (newMode) {
      setViewMode(newMode);
      localStorage.setItem(VIEW_MODE_KEY, newMode);
    }
  };

  return (
    <PurchaseOrderListStateProvider>
      <Container maxWidth={viewMode === 'kanban' && currentTab === 0 ? false : 'lg'} sx={{ mt: 4, mb: 4, ...(viewMode === 'kanban' && currentTab === 0 ? { px: { xs: 1, sm: 2, md: 3 } } : {}) }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
          <Typography variant="h5">
            {t('purchaseOrders.title')}
          </Typography>
          {currentTab === 0 && (
            <ToggleButtonGroup
              value={viewMode}
              exclusive
              onChange={handleViewModeChange}
              size="small"
            >
              <ToggleButton value="list" aria-label="lista">
                <ViewListIcon fontSize="small" sx={{ mr: 0.5 }} />
                {t('purchaseOrders.kanban.viewList', 'Lista')}
              </ToggleButton>
              <ToggleButton value="kanban" aria-label="kanban">
                <ViewKanbanIcon fontSize="small" sx={{ mr: 0.5 }} />
                {t('purchaseOrders.kanban.viewKanban', 'Kanban')}
              </ToggleButton>
            </ToggleButtonGroup>
          )}
        </Box>

        <Tabs
          value={currentTab}
          onChange={(e, v) => setCurrentTab(v)}
          variant="scrollable"
          scrollButtons="auto"
          allowScrollButtonsMobile
          sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}
        >
          <Tab label={t('purchaseOrders.tabs.orders', 'Zamówienia')} />
          <Tab label={t('purchaseOrders.tabs.forecasts', 'Prognozy zakupowe')} />
        </Tabs>

        {currentTab === 0 && viewMode === 'list' && <PurchaseOrderList />}
        {currentTab === 0 && viewMode === 'kanban' && <POKanbanBoard initialOpenPOId={initialOpenPOId} />}
        {currentTab === 1 && <ProcurementForecastsPage embedded={true} />}
      </Container>
    </PurchaseOrderListStateProvider>
  );
};

export default PurchaseOrdersPage;
