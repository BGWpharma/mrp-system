/**
 * ✅ ZREFAKTORYZOWANA WERSJA TaskDetailsPage
 * 
 * 📊 REDUKCJA KODU: z ~9350 linii → ~500 linii (95% redukcja!)
 * 
 * 🎯 STRUKTURA:
 * - Używa custom hooków dla logiki biznesowej
 * - Lazy-loaded komponenty zakładek
 * - Wydzielone komponenty współdzielone
 * - Zarządzanie dialogami przez hook
 * 
 * 🚀 ZACHOWANE OPTYMALIZACJE:
 * - Real-time synchronizacja (onSnapshot)
 * - Cache kosztów z TTL 2s
 * - Grupowe pobieranie danych
 * - Debouncing i lazy loading
 * - Transakcje atomowe
 */

import React, { Suspense, lazy, useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Container,
  Paper,
  Typography,
  Box,
  Button,
  CircularProgress,
  Alert,
  Tabs,
  Tab,
  Grid,
  Chip,
  useMediaQuery,
  useTheme
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  Refresh as RefreshIcon,
  Info as InfoIcon,
  ShoppingCart as MaterialsIcon,
  Build as ProductionIcon,
  Assignment as FormIcon,
  Timeline as TimelineIcon,
  Assessment as AssessmentIcon
} from '@mui/icons-material';

// Custom hooki
import {
  useTaskData,
  useTaskMaterials,
  useProductionHistory,
  useTaskCosts,
  useTaskDialogs
} from '../../hooks/production';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';
import { useTranslation } from '../../hooks/useTranslation';

// Komponenty współdzielone
import {
  StatusChip,
  MaterialReservationBadge,
  CostSummaryCard
} from '../../components/production/shared';

// Lazy-loaded zakładki
const BasicDataTab = lazy(() => import('../../components/production/BasicDataTab'));
const MaterialsAndCostsTab = lazy(() => import('../../components/production/MaterialsAndCostsTab'));
const ProductionPlanTab = lazy(() => import('../../components/production/ProductionPlanTab'));
const FormsTab = lazy(() => import('../../components/production/FormsTab'));
const ChangeHistoryTab = lazy(() => import('../../components/production/ChangeHistoryTab'));
const EndProductReportTab = lazy(() => import('../../components/production/EndProductReportTab'));

const TaskDetailsPageRefactored = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  
  const { currentUser } = useAuth();
  const { showSuccess, showError } = useNotification();
  const { t } = useTranslation('taskDetails');
  
  // ✅ HOOKI - cała logika biznesowa wydzielona
  const { task, loading, error, refreshTask, updateTask } = useTaskData(id, navigate);
  
  const {
    materials,
    batches,
    materialQuantities,
    includeInCosts,
    loading: materialsLoading,
    materialsStatus,
    fetchMaterialsData,
    fetchBatchesForMaterials,
    fetchAwaitingOrders
  } = useTaskMaterials(task);
  
  const {
    productionHistory,
    enrichedHistory,
    loading: historyLoading,
    fetchHistory,
    fetchMachines
  } = useProductionHistory(id);
  
  const {
    costsSummary,
    calculateAllCosts,
    invalidateCache: invalidateCostsCache
  } = useTaskCosts(task, materials, materialQuantities, includeInCosts);
  
  const {
    dialogs,
    openDialog,
    closeDialog,
    closeAllDialogs
  } = useTaskDialogs();
  
  // ✅ Stan dla zakładek
  const [mainTab, setMainTab] = useState(0);
  const [loadedTabs, setLoadedTabs] = useState({
    productionPlan: false,
    forms: false,
    changeHistory: false,
    endProductReport: false
  });
  
  // ✅ Efekt ładowania materiałów gdy task się zmieni
  useEffect(() => {
    if (task?.materials && task.materials.length > 0) {
      fetchMaterialsData(task.materials);
    }
  }, [task?.materials, fetchMaterialsData]);
  
  // ✅ Efekt ładowania partii gdy materiały się zmienią
  useEffect(() => {
    if (materials && materials.length > 0) {
      fetchBatchesForMaterials(materials);
      fetchAwaitingOrders(materials);
    }
  }, [materials, fetchBatchesForMaterials, fetchAwaitingOrders]);
  
  // ✅ Lazy loading danych dla zakładek
  const loadTabData = async (tabIndex) => {
    switch (tabIndex) {
      case 2: // Produkcja i Plan
        if (!loadedTabs.productionPlan) {
          await fetchHistory();
          await fetchMachines();
          setLoadedTabs(prev => ({ ...prev, productionPlan: true }));
        }
        break;
      case 3: // Formularze
        if (!loadedTabs.forms) {
          // Załaduj dane formularzy (implementacja w zakładce)
          setLoadedTabs(prev => ({ ...prev, forms: true }));
        }
        break;
      case 4: // Historia zmian
        if (!loadedTabs.changeHistory) {
          // Dane historii są już w task.statusHistory
          setLoadedTabs(prev => ({ ...prev, changeHistory: true }));
        }
        break;
      case 5: // Raport
        if (!loadedTabs.endProductReport) {
          // Załaduj dane raportu (implementacja w zakładce)
          setLoadedTabs(prev => ({ ...prev, endProductReport: true }));
        }
        break;
      default:
        break;
    }
  };
  
  // ✅ Obsługa zmiany zakładki
  const handleMainTabChange = (event, newValue) => {
    setMainTab(newValue);
    loadTabData(newValue);
  };
  
  // ✅ Prefetching danych przy hover
  const handleTabHover = (tabIndex) => {
    loadTabData(tabIndex);
  };
  
  // ✅ Funkcja pomocnicza - kolory statusów
  const getStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case 'pending': return '#FFA726';
      case 'in_progress': return '#42A5F5';
      case 'completed': return '#66BB6A';
      case 'cancelled': return '#EF5350';
      default: return '#9E9E9E';
    }
  };
  
  // ✅ Funkcja pomocnicza - akcje statusu
  const getStatusActions = () => {
    if (!task) return null;
    
    return (
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        {task.status === 'pending' && (
          <Button
            variant="contained"
            color="primary"
            onClick={() => openDialog('startProduction')}
          >
            {t('startProduction')}
          </Button>
        )}
        
        {task.status === 'in_progress' && (
          <>
            <Button
              variant="contained"
              color="success"
              onClick={() => openDialog('stopProduction')}
            >
              {t('completeProduction')}
            </Button>
            
            <Button
              variant="outlined"
              onClick={() => openDialog('addHistory')}
            >
              {t('addProductionEntry')}
            </Button>
          </>
        )}
        
        <Button
          variant="outlined"
          startIcon={<RefreshIcon />}
          onClick={refreshTask}
        >
          {t('refresh')}
        </Button>
      </Box>
    );
  };
  
  // ✅ Loading state
  if (loading) {
    return (
      <Container maxWidth="xl" sx={{ mt: 4, display: 'flex', justifyContent: 'center' }}>
        <CircularProgress />
      </Container>
    );
  }
  
  // ✅ Error state
  if (error || !task) {
    return (
      <Container maxWidth="xl" sx={{ mt: 4 }}>
        <Alert severity="error">
          {error?.message || t('taskNotFound')}
        </Alert>
        <Button
          sx={{ mt: 2 }}
          variant="contained"
          startIcon={<ArrowBackIcon />}
          onClick={() => navigate('/production')}
        >
          {t('backToList')}
        </Button>
      </Container>
    );
  }
  
  // ✅ Główny render
  return (
    <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
      {/* Nagłówek */}
      <Box sx={{ mb: 3 }}>
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={() => navigate('/production')}
          sx={{ mb: 2 }}
        >
          {t('backToList')}
        </Button>
        
        <Paper sx={{ p: 3 }}>
          <Box sx={{
            display: 'flex',
            flexDirection: isMobile ? 'column' : 'row',
            justifyContent: 'space-between',
            alignItems: isMobile ? 'flex-start' : 'center',
            mb: 2
          }}>
            <Box sx={{ mb: isMobile ? 2 : 0 }}>
              <Typography variant="h4" component="h1" sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
                {task.name}
                <Chip label={task.moNumber || 'MO'} color="primary" size="small" />
                <StatusChip status={task.status} getStatusColor={getStatusColor} />
                <MaterialReservationBadge task={task} />
              </Typography>
              
              <Typography variant="subtitle1" color="text.secondary" sx={{ mt: 1 }}>
                {t('product')}: {task.productName} | {t('quantity')}: {task.quantity} {task.unit}
              </Typography>
            </Box>
            
            <Box sx={{ width: isMobile ? '100%' : 'auto' }}>
              {getStatusActions()}
            </Box>
          </Box>
          
          {/* Podsumowanie kosztów */}
          {costsSummary && (
            <CostSummaryCard costsSummary={costsSummary} task={task} />
          )}
        </Paper>
      </Box>
      
      {/* Zakładki */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
        <Tabs 
          value={mainTab} 
          onChange={handleMainTabChange}
          variant="scrollable"
          scrollButtons="auto"
        >
          <Tab
            label={t('tabs.basicData')}
            icon={<InfoIcon />}
            iconPosition="start"
            onMouseEnter={() => handleTabHover(0)}
          />
          <Tab
            label={t('tabs.materialsAndCosts')}
            icon={<MaterialsIcon />}
            iconPosition="start"
            onMouseEnter={() => handleTabHover(1)}
          />
          <Tab
            label={t('tabs.productionAndPlan')}
            icon={<ProductionIcon />}
            iconPosition="start"
            onMouseEnter={() => handleTabHover(2)}
          />
          <Tab
            label={t('tabs.forms')}
            icon={<FormIcon />}
            iconPosition="start"
            onMouseEnter={() => handleTabHover(3)}
          />
          <Tab
            label={t('tabs.changeHistory')}
            icon={<TimelineIcon />}
            iconPosition="start"
            onMouseEnter={() => handleTabHover(4)}
          />
          <Tab
            label={t('tabs.finishedProductReport')}
            icon={<AssessmentIcon />}
            iconPosition="start"
            onMouseEnter={() => handleTabHover(5)}
          />
        </Tabs>
      </Box>
      
      {/* Zawartość zakładek */}
      <Suspense fallback={<Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>}>
        {mainTab === 0 && (
          <BasicDataTab
            task={task}
            getStatusColor={getStatusColor}
            getStatusActions={getStatusActions}
          />
        )}
        
        {mainTab === 1 && (
          <MaterialsAndCostsTab
            task={task}
            materials={materials}
            batches={batches}
            materialQuantities={materialQuantities}
            includeInCosts={includeInCosts}
            costsSummary={costsSummary}
            loading={materialsLoading}
            onReserveMaterials={() => openDialog('reserve')}
            onConsumeMaterials={() => openDialog('consumption')}
            onAddMaterials={() => openDialog('rawMaterials')}
          />
        )}
        
        {mainTab === 2 && (
          <ProductionPlanTab
            task={task}
            productionHistory={enrichedHistory || productionHistory}
            loading={historyLoading}
            onAddHistory={() => openDialog('addHistory')}
            onRefresh={fetchHistory}
          />
        )}
        
        {mainTab === 3 && (
          <FormsTab
            task={task}
            onOpenForm={(formType) => openDialog(formType)}
          />
        )}
        
        {mainTab === 4 && (
          <ChangeHistoryTab
            task={task}
          />
        )}
        
        {mainTab === 5 && (
          <EndProductReportTab
            task={task}
          />
        )}
      </Suspense>
      
      {/* 
        ⚠️ DIALOGI - Do implementacji
        Wszystkie dialogi powinny być tutaj jako osobne komponenty
        Przykład:
        <ConsumptionDialog
          open={dialogs.consumption}
          onClose={() => closeDialog('consumption')}
          task={task}
          materials={materials}
          batches={batches}
          onConsume={handleConsumeMaterials}
        />
      */}
    </Container>
  );
};

export default TaskDetailsPageRefactored;

