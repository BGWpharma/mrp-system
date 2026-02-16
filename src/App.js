// src/App.js
import React, { useState, Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useParams } from 'react-router-dom';
import * as Sentry from "@sentry/react";
import { AuthProvider } from './contexts/AuthContext';
import { NotificationProvider } from './contexts/NotificationContext';
import { useTheme } from './contexts/ThemeContext';
import { ColumnPreferencesProvider } from './contexts/ColumnPreferencesContext';
import { InventoryListStateProvider } from './contexts/InventoryListStateContext';
import { TaskListStateProvider } from './contexts/TaskListStateContext';
import { CmrListStateProvider } from './contexts/CmrListStateContext';
import { RecipeListStateProvider } from './contexts/RecipeListStateContext';
import { InvoiceListStateProvider } from './contexts/InvoiceListStateContext';
import { OrderListStateProvider } from './contexts/OrderListStateContext';
import { SidebarProvider, useSidebar } from './contexts/SidebarContext';
import Notifications from './components/common/Notifications';
import { rtdb } from './services/firebase/config';
import { ref, onValue } from 'firebase/database';
import { Box, CircularProgress, Typography, Button } from '@mui/material';
import { useTranslation } from 'react-i18next';

// Inicjujemy przechwytywanie logów konsoli
import './services/logsCaptureService';

// Inicjalizacja i18next
import './i18n';

// Localization wrapper
import LocalizationWrapper from './components/common/LocalizationWrapper';

// Auth - ładowane natychmiast bo są potrzebne przy starcie
import Login from './pages/Auth/Login';
import Register from './pages/Auth/Register';

// Common Components - ładowane statycznie bo są potrzebne w każdym widoku
import BackgroundEffects from './components/common/BackgroundEffects';
import Navbar from './components/common/Navbar';
import Sidebar from './components/common/Sidebar';
import PrivateRoute from './components/common/PrivateRoute';
import AdminRoute from './components/common/AdminRoute';
import AIChatFAB from './components/common/AIChatFAB';

// Styles
import './assets/styles/global.css';

// ============================================================================
// LAZY LOADED PAGES - ładowane on-demand dla lepszej wydajności
// ============================================================================

// Dashboard - ładowany lazy bo może być duży
const Dashboard = lazy(() => import('./pages/Dashboard/Dashboard'));

// Analytics
const AnalyticsDashboardPage = lazy(() => import('./pages/Analytics/AnalyticsDashboardPage'));
const FinancialReportPage = lazy(() => import('./pages/Analytics/FinancialReportPage'));
const ProductionTimePage = lazy(() => import('./pages/Analytics/ProductionTimePage'));
const MOConsumptionPage = lazy(() => import('./pages/Analytics/MOConsumptionPage'));
const ProductionProgressPage = lazy(() => import('./pages/Analytics/ProductionProgressPage'));
const ProductionCostsPage = lazy(() => import('./pages/Analytics/ProductionCostsPage'));
const CashflowPage = lazy(() => import('./pages/Analytics/CashflowPage'));
const MixingAnalyticsPage = lazy(() => import('./pages/Analytics/MixingAnalyticsPage'));
// WeeklySprintPage przeniesiony jako zakładka do ProductionTimePage

// Recipes
const RecipesPage = lazy(() => import('./pages/Recipes/RecipesPage'));
const RecipeDetailsPage = lazy(() => import('./pages/Recipes/RecipeDetailsPage'));
const NewRecipePage = lazy(() => import('./pages/Recipes/NewRecipePage'));
const EditRecipePage = lazy(() => import('./pages/Recipes/EditRecipePage'));

// Production
const ProductionPage = lazy(() => import('./pages/Production/ProductionPage'));
const NewTaskPage = lazy(() => import('./pages/Production/NewTaskPage'));
const ProductionTimelinePage = lazy(() => import('./pages/Production/ProductionTimelinePage'));
const TaskDetailsPage = lazy(() => import('./pages/Production/TaskDetailsPage'));
const EditTaskPage = lazy(() => import('./pages/Production/EditTaskPage'));
const ConsumptionPage = lazy(() => import('./pages/Production/ConsumptionPage'));
const ForecastPage = lazy(() => import('./pages/Production/ForecastPage'));
const EcoReportPage = lazy(() => import('./pages/Reports/EcoReportPage'));
const ReportsPage = lazy(() => import('./pages/Production/ReportsPage'));
const CreateFromOrderPage = lazy(() => import('./pages/Production/CreateFromOrderPage'));
const WorkstationsPage = lazy(() => import('./pages/Production/WorkstationsPage'));
const CalculatorPage = lazy(() => import('./pages/Production/CalculatorPage'));
const FormsPage = lazy(() => import('./pages/Production/FormsPage'));
const CompletedMOFormPage = lazy(() => import('./pages/Production/CompletedMOFormPage'));
const ProductionControlFormPage = lazy(() => import('./pages/Production/ProductionControlFormPage'));
const ProductionShiftFormPage = lazy(() => import('./pages/Production/ProductionShiftFormPage'));
const FormsResponsesPage = lazy(() => import('./pages/Production/FormsResponsesPage'));

// Inventory
const InventoryPage = lazy(() => import('./pages/Inventory/InventoryPage'));
const ItemDetailsPage = lazy(() => import('./pages/Inventory/ItemDetailsPage'));
const NewInventoryItemPage = lazy(() => import('./pages/Inventory/NewInventoryItemPage'));
const EditInventoryItemPage = lazy(() => import('./pages/Inventory/EditInventoryItemPage'));
const ReceiveInventoryPage = lazy(() => import('./pages/Inventory/ReceiveInventoryPage'));
const IssueInventoryPage = lazy(() => import('./pages/Inventory/IssueInventoryPage'));
const InventoryHistoryPage = lazy(() => import('./pages/Inventory/InventoryHistoryPage'));
const ExpiryDatesPage = lazy(() => import('./pages/Inventory/ExpiryDatesPage'));
const BatchesPage = lazy(() => import('./pages/Inventory/BatchesPage'));
const BatchEditPage = lazy(() => import('./pages/Inventory/BatchEditPage'));
const StocktakingPage = lazy(() => import('./pages/Inventory/StocktakingPage'));
const StocktakingFormPage = lazy(() => import('./pages/Inventory/StocktakingFormPage'));
const StocktakingDetailsPage = lazy(() => import('./pages/Inventory/StocktakingDetailsPage'));
const StocktakingReportPage = lazy(() => import('./pages/Inventory/StocktakingReportPage'));
const InventoryFormsPage = lazy(() => import('./pages/Inventory/InventoryFormsPage'));
const InventoryFormsResponsesPage = lazy(() => import('./pages/Inventory/InventoryFormsResponsesPage'));
const LoadingReportFormPage = lazy(() => import('./pages/Inventory/LoadingReportFormPage'));
const UnloadingReportFormPage = lazy(() => import('./pages/Inventory/UnloadingReportFormPage'));

// Quality
const QualityPage = lazy(() => import('./pages/Quality/QualityPage'));
const NewTestPage = lazy(() => import('./pages/Quality/NewTestPage'));
const QualityReportsPage = lazy(() => import('./pages/Quality/QualityReportsPage'));

// Orders
const OrdersPage = lazy(() => import('./pages/Orders/OrdersPage'));
const OrdersList = lazy(() => import('./components/orders/OrdersList'));
const OrderForm = lazy(() => import('./components/orders/OrderForm'));
const OrderDetails = lazy(() => import('./components/orders/OrderDetails'));

// Purchase Orders
const PurchaseOrdersPage = lazy(() => import('./pages/PurchaseOrdersPage'));
const PurchaseOrderFormPage = lazy(() => import('./pages/PurchaseOrderFormPage'));
const PurchaseOrderDetailsPage = lazy(() => import('./pages/PurchaseOrderDetailsPage'));
const SuppliersPage = lazy(() => import('./pages/SuppliersPage'));
const SupplierFormPage = lazy(() => import('./pages/SupplierFormPage'));

// Customers
const CustomersList = lazy(() => import('./components/customers/CustomersList'));
const CustomerDetail = lazy(() => import('./components/customers/CustomerDetail'));

// AI Assistant
const AIAssistantPage = lazy(() => import('./pages/AIAssistant/AIAssistantPage'));

// Kiosk
const KioskPage = lazy(() => import('./pages/Kiosk/KioskPage'));

// Warehouses
const WarehousesList = lazy(() => import('./components/inventory/WarehousesList'));

// Invoices
const InvoicesPage = lazy(() => import('./pages/Invoices/InvoicesPage'));
const InvoicesListPage = lazy(() => import('./pages/Invoices/InvoicesListPage'));
const InvoiceFormPage = lazy(() => import('./pages/Invoices/InvoiceFormPage'));
const InvoiceDetailsPage = lazy(() => import('./pages/Invoices/InvoiceDetailsPage'));
const CompanySettingsPage = lazy(() => import('./pages/Invoices/CompanySettingsPage'));

// Sales (nowa struktura z zakładkami)
const SalesPage = lazy(() => import('./pages/Sales/SalesPage'));

// CMR
const CmrListPage = lazy(() => import('./pages/Inventory/Cmr/CmrListPage'));
const CmrCreatePage = lazy(() => import('./pages/Inventory/Cmr/CmrCreatePage'));
const CmrDetailsPage = lazy(() => import('./pages/Inventory/Cmr/CmrDetailsPage'));
const CmrEditPage = lazy(() => import('./pages/Inventory/Cmr/CmrEditPage'));

// CRM
const CRMDashboardPage = lazy(() => import('./pages/CRM/CRMDashboardPage'));
const ContactsPage = lazy(() => import('./pages/CRM/ContactsPage'));
const ContactFormPage = lazy(() => import('./pages/CRM/ContactFormPage'));
const ContactDetailsPage = lazy(() => import('./pages/CRM/ContactDetailsPage'));
const InteractionsPage = lazy(() => import('./pages/CRM/InteractionsPage'));
const InteractionFormPage = lazy(() => import('./pages/CRM/InteractionFormPage'));
const InteractionDetailsPage = lazy(() => import('./pages/CRM/InteractionDetailsPage'));
const OpportunitiesPage = lazy(() => import('./pages/CRM/OpportunitiesPage'));
const OpportunityFormPage = lazy(() => import('./pages/CRM/OpportunityFormPage'));
const OpportunityDetailsPage = lazy(() => import('./pages/CRM/OpportunityDetailsPage'));

// Price Lists - nowy moduł listy cenowej
const PriceListsPage = lazy(() => import('./pages/Sales/PriceLists/PriceListsPage'));
const PriceListFormPage = lazy(() => import('./pages/Sales/PriceLists/PriceListFormPage'));
const PriceListDetailsPage = lazy(() => import('./pages/Sales/PriceLists/PriceListDetailsPage'));


// Admin Pages
const UsersManagementPage = lazy(() => import('./pages/Admin/UsersManagementPage'));
const SystemManagementPage = lazy(() => import('./pages/Admin/SystemManagementPage'));
const BugReportsPage = lazy(() => import('./pages/Admin/BugReportsPage'));

// Powiadomienia
const NotificationsHistoryPage = lazy(() => import('./pages/Notifications/NotificationsHistoryPage'));

// Hall Data
const HallDataConditionsPage = lazy(() => import('./pages/HallData/Conditions'));
const HallDataMachinesPage = lazy(() => import('./pages/HallData/Machines'));
const HallDataFormsPage = lazy(() => import('./pages/HallData/Forms'));
const ServiceReportFormPage = lazy(() => import('./pages/HallData/ServiceReportFormPage'));
const MonthlyServiceReportFormPage = lazy(() => import('./pages/HallData/MonthlyServiceReportFormPage'));
const DefectRegistryFormPage = lazy(() => import('./pages/HallData/DefectRegistryFormPage'));
const ServiceRepairReportFormPage = lazy(() => import('./pages/HallData/ServiceRepairReportFormPage'));
const HallDataFormsResponsesPage = lazy(() => import('./pages/HallData/HallDataFormsResponsesPage'));

// Taskboard
const TaskboardView = lazy(() => import('./pages/Taskboard/TaskboardView'));
const BoardDetail = lazy(() => import('./pages/Taskboard/BoardDetail'));

// Zespół - Czas pracy i Grafik
const WorkTimePage = lazy(() => import('./pages/WorkTime/WorkTimePage'));
const SchedulePage = lazy(() => import('./pages/Schedule/SchedulePage'));

// ============================================================================
// KOMPONENT ŁADOWANIA DLA SUSPENSE
// ============================================================================

const PageLoading = () => {
  const { t } = useTranslation('common');
  return (
    <Box sx={{ 
      display: 'flex', 
      flexDirection: 'column',
      justifyContent: 'center', 
      alignItems: 'center', 
      minHeight: '50vh',
      gap: 2
    }}>
      <CircularProgress size={40} thickness={4} />
      <Typography variant="body2" color="text.secondary">
        {t('common.loading')}
      </Typography>
    </Box>
  );
};

// ============================================================================
// ERROR BOUNDARY FALLBACK - wrapper używający useTranslation
// ============================================================================

const ErrorFallback = ({ error, componentStack, resetError, eventId }) => {
  const { t } = useTranslation('common');
  return (
    <Box sx={{ 
      display: 'flex', 
      flexDirection: 'column',
      justifyContent: 'center', 
      alignItems: 'center', 
      minHeight: '100vh',
      padding: 3,
      textAlign: 'center',
      gap: 2,
      backgroundColor: 'background.default'
    }}>
      <Typography variant="h4" color="error" gutterBottom>
        {t('errorBoundary.title')}
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 2, maxWidth: 600 }}>
        {t('errorBoundary.description')}
      </Typography>
      {process.env.NODE_ENV === 'development' && error && (
        <Box sx={{ 
          backgroundColor: (theme) => theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)',
          padding: 2, 
          borderRadius: 1,
          maxWidth: 800,
          width: '100%',
          textAlign: 'left',
          overflow: 'auto',
          mb: 2,
          border: (theme) => `1px solid ${theme.palette.divider}`
        }}>
          <Typography 
            variant="caption" 
            component="pre" 
            sx={{ 
              whiteSpace: 'pre-wrap',
              color: 'text.primary'
            }}
          >
            {error.toString()}
          </Typography>
        </Box>
      )}
      
      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', justifyContent: 'center' }}>
        <Button 
          variant="contained"
          onClick={resetError}
        >
          {t('errorBoundary.tryAgain')}
        </Button>
        
        {eventId && (
          <Button 
            variant="outlined"
            color="secondary"
            onClick={() => {
              Sentry.showReportDialog({ 
                eventId,
                title: t('errorBoundary.sentry.title'),
                subtitle: t('errorBoundary.sentry.subtitle'),
                subtitle2: t('errorBoundary.sentry.subtitle2'),
                labelName: t('errorBoundary.sentry.labelName'),
                labelEmail: t('errorBoundary.sentry.labelEmail'),
                labelComments: t('errorBoundary.sentry.labelComments'),
                labelClose: t('errorBoundary.sentry.labelClose'),
                labelSubmit: t('errorBoundary.sentry.labelSubmit'),
                errorGeneric: t('errorBoundary.sentry.errorGeneric'),
                errorFormEntry: t('errorBoundary.sentry.errorFormEntry'),
                successMessage: t('errorBoundary.sentry.successMessage'),
              });
            }}
          >
            {t('errorBoundary.reportProblem')}
          </Button>
        )}
      </Box>
    </Box>
  );
};

// ============================================================================
// INICJALIZACJA MONITOROWANIA POŁĄCZENIA
// ============================================================================

// OPTYMALIZACJA: Singleton dla monitorowania połączenia - zapobiega wielokrotnej inicjalizacji
let connectionMonitorInitialized = false;
let lastConnectionState = null;

const initializeConnectionMonitoring = () => {
  // OPTYMALIZACJA: Zapobiegaj wielokrotnej inicjalizacji
  if (connectionMonitorInitialized) {
    return;
  }
  connectionMonitorInitialized = true;
  
  try {
    const connectedRef = ref(rtdb, '.info/connected');
    onValue(connectedRef, (snap) => {
      const isConnected = snap.val() === true;
      
      // OPTYMALIZACJA: Loguj tylko przy zmianie stanu (unika spam w konsoli)
      if (lastConnectionState !== isConnected) {
        lastConnectionState = isConnected;
        if (isConnected) {
          console.log('Połączono z Realtime Database');
        } else {
          console.log('Brak połączenia z Realtime Database - działanie w trybie offline');
        }
      }
    });
  } catch (error) {
    console.error('Błąd podczas inicjalizacji monitorowania połączenia:', error);
  }
};

// Wywołanie inicjalizacji
initializeConnectionMonitoring();

// ============================================================================
// GŁÓWNY KOMPONENT APLIKACJI
// ============================================================================

function App() {
  return (
    <Sentry.ErrorBoundary 
      fallback={(props) => <ErrorFallback {...props} />}
      showDialog={false}
    >
      <Router>
        <AuthProvider>
          <NotificationProvider>
            <LocalizationWrapper>
              <ColumnPreferencesProvider>
                <InventoryListStateProvider>
                  <TaskListStateProvider>
                    <CmrListStateProvider>
                      <RecipeListStateProvider>
                        <InvoiceListStateProvider>
                          <OrderListStateProvider>
                            <SidebarProvider>
                              <div className="app-container">
                                <Notifications />
                                <Routes>
                    <Route path="/login" element={<Login />} />
                    <Route path="/register" element={<Register />} />
                    
                    <Route path="/" element={<PrivateLayout><Dashboard /></PrivateLayout>} />
                    
                    {/* Analytics Routes */}
                    <Route path="/analytics" element={<PrivateLayout><AnalyticsDashboardPage /></PrivateLayout>} />
                    <Route path="/analytics/financial-report" element={<PrivateLayout><FinancialReportPage /></PrivateLayout>} />
                    <Route path="/analytics/production-time" element={<PrivateLayout><ProductionTimePage /></PrivateLayout>} />
                    <Route path="/analytics/mo-consumption" element={<PrivateLayout><MOConsumptionPage /></PrivateLayout>} />
                    <Route path="/analytics/production-progress" element={<PrivateLayout><ProductionProgressPage /></PrivateLayout>} />
                    <Route path="/analytics/production-costs" element={<PrivateLayout><ProductionCostsPage /></PrivateLayout>} />
                    <Route path="/analytics/cashflow" element={<PrivateLayout><CashflowPage /></PrivateLayout>} />
                    <Route path="/analytics/mixing" element={<PrivateLayout><MixingAnalyticsPage /></PrivateLayout>} />
                    <Route path="/analytics/weekly-sprint" element={<Navigate to="/analytics/production-time" replace />} />
                    <Route path="/analytics/eco-report" element={<PrivateLayout><EcoReportPage /></PrivateLayout>} />
                    
                    {/* Admin Routes - dostępne tylko dla administratorów */}
                    <Route path="/admin/users" element={
                      <AdminRoute>
                        <PrivateLayout>
                          <UsersManagementPage />
                        </PrivateLayout>
                      </AdminRoute>
                    } />
                    
                    <Route path="/admin/system" element={
                      <AdminRoute>
                        <PrivateLayout>
                          <SystemManagementPage />
                        </PrivateLayout>
                      </AdminRoute>
                    } />
                    
                    <Route path="/admin/bug-reports" element={
                      <AdminRoute>
                        <PrivateLayout>
                          <BugReportsPage />
                        </PrivateLayout>
                      </AdminRoute>
                    } />
                    
                    {/* Recipes Routes */}
                    <Route path="/recipes" element={<PrivateLayout><RecipesPage /></PrivateLayout>} />
                    <Route path="/recipes/new" element={<PrivateLayout><NewRecipePage /></PrivateLayout>} />
                    <Route path="/recipes/:id" element={<PrivateLayout><RecipeDetailsPage /></PrivateLayout>} />
                    <Route path="/recipes/:id/edit" element={<PrivateLayout><EditRecipePage /></PrivateLayout>} />
                    
                    {/* Production Routes */}
                    <Route path="/production" element={<PrivateLayout><ProductionPage /></PrivateLayout>} />
                    <Route path="/production/new-task" element={<PrivateLayout><NewTaskPage /></PrivateLayout>} />
                    <Route path="/production/timeline" element={<PrivateLayout><ProductionTimelinePage /></PrivateLayout>} />
                    <Route path="/production/calculator" element={<PrivateLayout><CalculatorPage /></PrivateLayout>} />
                    <Route path="/production/forecast" element={<PrivateLayout><ForecastPage /></PrivateLayout>} />
                    <Route path="/production/forms" element={<PrivateLayout><FormsPage /></PrivateLayout>} />
                    <Route path="/production/forms/completed-mo" element={<PrivateLayout><CompletedMOFormPage /></PrivateLayout>} />
                    <Route path="/production/forms/production-control" element={<PrivateLayout><ProductionControlFormPage /></PrivateLayout>} />
                    <Route path="/production/forms/production-shift" element={<PrivateLayout><ProductionShiftFormPage /></PrivateLayout>} />
                    <Route path="/production/forms/responses" element={<PrivateLayout><FormsResponsesPage /></PrivateLayout>} />
                    <Route path="/production/tasks/:id" element={<PrivateLayout><TaskDetailsPage /></PrivateLayout>} />
                    <Route path="/production/tasks/:id/edit" element={<PrivateLayout><EditTaskPage /></PrivateLayout>} />
                    <Route path="/production/consumption/:taskId" element={<PrivateLayout><ConsumptionPage /></PrivateLayout>} />
                    <Route path="/production/reports" element={<PrivateLayout><ReportsPage /></PrivateLayout>} />
                    <Route path="/production/create-from-order" element={<PrivateLayout><CreateFromOrderPage /></PrivateLayout>} />
                    <Route path="/production/workstations" element={<PrivateLayout><WorkstationsPage /></PrivateLayout>} />
                    <Route path="/production/workstations/new" element={<PrivateLayout><WorkstationsPage /></PrivateLayout>} />
                    
                    {/* Inventory Routes */}
                    <Route path="/inventory" element={<PrivateLayout><InventoryPage /></PrivateLayout>} />
                    <Route path="/inventory/new" element={<PrivateLayout><NewInventoryItemPage /></PrivateLayout>} />
                    <Route path="/inventory/:id" element={<PrivateLayout><ItemDetailsPage /></PrivateLayout>} />
                    <Route path="/inventory/:id/batches" element={<PrivateLayout><BatchesPage /></PrivateLayout>} />
                    <Route path="/inventory/batch/:batchId" element={<PrivateLayout><BatchEditPage /></PrivateLayout>} />
                    <Route path="/inventory/:id/batches/:batchId/edit" element={<PrivateLayout><BatchEditPage /></PrivateLayout>} />
                    <Route path="/inventory/:id/edit" element={<PrivateLayout><EditInventoryItemPage /></PrivateLayout>} />
                    <Route path="/inventory/:id/receive" element={<PrivateLayout><ReceiveInventoryPage /></PrivateLayout>} />
                    <Route path="/inventory/:id/issue" element={<PrivateLayout><IssueInventoryPage /></PrivateLayout>} />
                    <Route path="/inventory/:id/history" element={<PrivateLayout><InventoryHistoryPage /></PrivateLayout>} />
                    <Route path="/inventory/expiry-dates" element={<PrivateLayout><ExpiryDatesPage /></PrivateLayout>} />
                    <Route path="/inventory/stocktaking" element={<PrivateLayout><StocktakingPage /></PrivateLayout>} />
                    <Route path="/inventory/stocktaking/new" element={<PrivateLayout><StocktakingFormPage /></PrivateLayout>} />
                    <Route path="/inventory/stocktaking/:id" element={<PrivateLayout><StocktakingDetailsPage /></PrivateLayout>} />
                    <Route path="/inventory/stocktaking/:id/edit" element={<PrivateLayout><StocktakingFormPage /></PrivateLayout>} />
                    <Route path="/inventory/stocktaking/:id/report" element={<PrivateLayout><StocktakingReportPage /></PrivateLayout>} />
                    <Route path="/inventory/forms" element={<PrivateLayout><InventoryFormsPage /></PrivateLayout>} />
                    <Route path="/inventory/forms/responses" element={<PrivateLayout><InventoryFormsResponsesPage /></PrivateLayout>} />
                    <Route path="/inventory/forms/loading-report" element={<PrivateLayout><LoadingReportFormPage /></PrivateLayout>} />
                    <Route path="/inventory/forms/unloading-report" element={<PrivateLayout><UnloadingReportFormPage /></PrivateLayout>} />
                    
                    {/* CMR Routes */}
                    <Route path="/inventory/cmr" element={<PrivateLayout><CmrListPage /></PrivateLayout>} />
                    <Route path="/inventory/cmr/new" element={<PrivateLayout><CmrCreatePage /></PrivateLayout>} />
                    <Route path="/inventory/cmr/:id" element={<PrivateLayout><CmrDetailsPage /></PrivateLayout>} />
                    <Route path="/inventory/cmr/:id/edit" element={<PrivateLayout><CmrEditPage /></PrivateLayout>} />
                    
                    {/* Quality Routes */}
                    <Route path="/quality" element={<PrivateLayout><QualityPage /></PrivateLayout>} />
                    <Route path="/quality/new-test" element={<PrivateLayout><NewTestPage /></PrivateLayout>} />
                    <Route path="/quality/reports" element={<PrivateLayout><QualityReportsPage /></PrivateLayout>} />
                    
                    {/* Orders Routes - główna strona z zakładkami */}
                    <Route path="/orders" element={<PrivateLayout><OrdersPage /></PrivateLayout>} />
                    <Route path="/orders/customers" element={<PrivateLayout><OrdersPage /></PrivateLayout>} />
                    <Route path="/orders/price-lists" element={<PrivateLayout><OrdersPage /></PrivateLayout>} />
                    <Route path="/orders/new" element={<PrivateLayout><OrderForm /></PrivateLayout>} />
                    <Route path="/orders/edit/:orderId" element={<PrivateLayout><EditOrderWrapper /></PrivateLayout>} />
                    <Route path="/orders/:orderId" element={<PrivateLayout><OrderDetails /></PrivateLayout>} />
                    
                    {/* Price Lists Routes - teraz w ramach orders */}
                    <Route path="/orders/price-lists/new" element={<PrivateLayout><PriceListFormPage /></PrivateLayout>} />
                    <Route path="/orders/price-lists/:id" element={<PrivateLayout><PriceListDetailsPage /></PrivateLayout>} />
                    <Route path="/orders/price-lists/:id/edit" element={<PrivateLayout><PriceListFormPage /></PrivateLayout>} />
                    
                    {/* Legacy Price Lists Routes - redirect do kanonicznych ścieżek */}
                    <Route path="/sales/price-lists" element={<Navigate to="/orders/price-lists" replace />} />
                    <Route path="/sales/price-lists/new" element={<Navigate to="/orders/price-lists/new" replace />} />
                    <Route path="/sales/price-lists/:id" element={<PriceListRedirect />} />
                    <Route path="/sales/price-lists/:id/edit" element={<PriceListEditRedirect />} />
                    
                    
                    {/* Sales Routes - nowa struktura z zakładkami */}
                    <Route path="/sales" element={<PrivateLayout><SalesPage /></PrivateLayout>} />
                    <Route path="/sales/material-advances" element={<PrivateLayout><SalesPage /></PrivateLayout>} />
                    <Route path="/sales/factory-costs" element={<PrivateLayout><SalesPage /></PrivateLayout>} />
                    <Route path="/sales/quotation" element={<PrivateLayout><SalesPage /></PrivateLayout>} />
                    
                    {/* Invoices Routes */}
                    <Route path="/invoices" element={<PrivateLayout><SalesPage /></PrivateLayout>} /> {/* Legacy route - przekierowanie do /sales */}
                    <Route path="/invoices/new" element={<PrivateLayout><InvoiceFormPage /></PrivateLayout>} />
                    <Route path="/invoices/:invoiceId" element={<PrivateLayout><InvoiceDetailsPage /></PrivateLayout>} />
                    <Route path="/invoices/:invoiceId/edit" element={<PrivateLayout><InvoiceFormPage /></PrivateLayout>} />
                    <Route path="/invoices/company-settings" element={<PrivateLayout><CompanySettingsPage /></PrivateLayout>} />
                    
                    {/* Purchase Orders Routes */}
                    <Route path="/purchase-orders" element={<PrivateLayout><PurchaseOrdersPage /></PrivateLayout>} />
                    <Route path="/purchase-orders/new" element={<PrivateLayout><PurchaseOrderFormPage /></PrivateLayout>} />
                    <Route path="/purchase-orders/:id" element={<PrivateLayout><PurchaseOrderDetailsPage /></PrivateLayout>} />
                    <Route path="/purchase-orders/:id/edit" element={<PrivateLayout><PurchaseOrderFormPage /></PrivateLayout>} />
                    
                    {/* Suppliers Routes */}
                    <Route path="/suppliers" element={<PrivateLayout><SuppliersPage /></PrivateLayout>} />
                    <Route path="/suppliers/new" element={<PrivateLayout><SupplierFormPage /></PrivateLayout>} />
                    <Route path="/suppliers/:id/edit" element={<PrivateLayout><SupplierFormPage /></PrivateLayout>} />
                    <Route path="/suppliers/:id/view" element={<PrivateLayout><SupplierFormPage viewOnly={true} /></PrivateLayout>} />
                    <Route path="/suppliers/:id" element={<PrivateLayout><SupplierFormPage viewOnly={true} /></PrivateLayout>} />
                    
                    {/* Customers Routes - teraz w ramach orders */}
                    <Route path="/orders/customers/:customerId" element={<PrivateLayout><CustomerDetail /></PrivateLayout>} />
                    
                    {/* Legacy Customers Routes - redirect do kanonicznych ścieżek */}
                    <Route path="/customers" element={<Navigate to="/orders/customers" replace />} />
                    <Route path="/customers/:customerId" element={<CustomerRedirect />} />
                    
                    {/* AI Assistant Routes */}
                    <Route path="/ai-assistant" element={<PrivateLayout><AIAssistantPage /></PrivateLayout>} />
                    
                    {/* Kiosk Routes */}
                    <Route path="/kiosk" element={
                      <Suspense fallback={<PageLoading />}>
                        <KioskPage />
                      </Suspense>
                    } />
                    
                    {/* Hall Data Routes */}
                    <Route path="/hall-data/conditions" element={<PrivateLayout><HallDataConditionsPage /></PrivateLayout>} />
                    <Route path="/hall-data/machines" element={<PrivateLayout><HallDataMachinesPage /></PrivateLayout>} />
                    <Route path="/hall-data/forms" element={<PrivateLayout><HallDataFormsPage /></PrivateLayout>} />
                    <Route path="/hall-data/forms/service-report" element={<PrivateLayout><ServiceReportFormPage /></PrivateLayout>} />
                    <Route path="/hall-data/forms/monthly-service-report" element={<PrivateLayout><MonthlyServiceReportFormPage /></PrivateLayout>} />
                    <Route path="/hall-data/forms/defect-registry" element={<PrivateLayout><DefectRegistryFormPage /></PrivateLayout>} />
                    <Route path="/hall-data/forms/service-repair-report" element={<PrivateLayout><ServiceRepairReportFormPage /></PrivateLayout>} />
                    <Route path="/hall-data/forms/responses" element={<PrivateLayout><HallDataFormsResponsesPage /></PrivateLayout>} />
                    
                    {/* CRM Routes */}
                    <Route path="/crm" element={<PrivateLayout><CRMDashboardPage /></PrivateLayout>} />
                    <Route path="/crm/contacts" element={<PrivateLayout><ContactsPage /></PrivateLayout>} />
                    <Route path="/crm/contacts/new" element={<PrivateLayout><ContactFormPage /></PrivateLayout>} />
                    <Route path="/crm/contacts/:contactId" element={<PrivateLayout><ContactDetailsPage /></PrivateLayout>} />
                    <Route path="/crm/contacts/:contactId/edit" element={<PrivateLayout><ContactFormPage /></PrivateLayout>} />
                    <Route path="/crm/interactions" element={<PrivateLayout><InteractionsPage /></PrivateLayout>} />
                    <Route path="/crm/interactions/new" element={<PrivateLayout><InteractionFormPage /></PrivateLayout>} />
                    <Route path="/crm/interactions/:interactionId" element={<PrivateLayout><InteractionDetailsPage /></PrivateLayout>} />
                    <Route path="/crm/interactions/:interactionId/edit" element={<PrivateLayout><InteractionFormPage /></PrivateLayout>} />
                    <Route path="/crm/opportunities" element={<PrivateLayout><OpportunitiesPage /></PrivateLayout>} />
                    <Route path="/crm/opportunities/new" element={<PrivateLayout><OpportunityFormPage /></PrivateLayout>} />
                    <Route path="/crm/opportunities/:opportunityId" element={<PrivateLayout><OpportunityDetailsPage /></PrivateLayout>} />
                    <Route path="/crm/opportunities/:opportunityId/edit" element={<PrivateLayout><OpportunityFormPage /></PrivateLayout>} />
                    
                    {/* Interakcje zakupowe w sekcji Magazyn */}

                    
                    {/* Powiadomienia */}
                    <Route path="/notifications/history" element={<PrivateLayout><NotificationsHistoryPage /></PrivateLayout>} />
                    
                    {/* Taskboard Routes */}
                    <Route path="/taskboard" element={<PrivateLayout><TaskboardView /></PrivateLayout>} />
                    <Route path="/taskboard/:boardId" element={<PrivateLayout><BoardDetail /></PrivateLayout>} />
                    
                    {/* Zespół - Czas pracy i Grafik */}
                    <Route path="/work-time" element={<PrivateLayout><WorkTimePage /></PrivateLayout>} />
                    <Route path="/schedule" element={<PrivateLayout><SchedulePage /></PrivateLayout>} />
                    
                    <Route path="*" element={<Navigate to="/" replace />} />
                          </Routes>
                        </div>
                        </SidebarProvider>
                      </OrderListStateProvider>
                    </InvoiceListStateProvider>
                  </RecipeListStateProvider>
                </CmrListStateProvider>
              </TaskListStateProvider>
            </InventoryListStateProvider>
          </ColumnPreferencesProvider>
          </LocalizationWrapper>
        </NotificationProvider>
      </AuthProvider>
    </Router>
    </Sentry.ErrorBoundary>
  );
}

// ============================================================================
// PRIVATE LAYOUT - wrapper dla stron wymagających autoryzacji
// ============================================================================

function PrivateLayout({ children }) {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const { mode } = useTheme();
  const { isOpen, isMobile } = useSidebar();

  const handleSidebarToggle = (collapsed) => {
    setIsSidebarCollapsed(collapsed);
  };

  return (
    <PrivateRoute>
      <div className={`layout ${isOpen && isMobile ? 'sidebar-open' : ''}`} style={{ 
        backgroundColor: 'transparent', 
        color: mode === 'dark' ? 'white' : 'rgba(0, 0, 0, 0.87)',
        position: 'relative',
        minHeight: '100vh'
      }}>
        <BackgroundEffects />
        <Navbar />
        <div className="content-container">
          <Sidebar onToggle={handleSidebarToggle} />
          <main className={`main-content ${isSidebarCollapsed || !isOpen ? 'sidebar-collapsed' : 'sidebar-expanded'}`}>
            {/* ✅ Suspense wrapper dla lazy-loaded komponentów */}
            <Suspense fallback={<PageLoading />}>
              {children}
            </Suspense>
          </main>
        </div>
        
        {/* 🤖 AI Chat FAB - przycisk asystenta AI */}
        <AIChatFAB />
      </div>
    </PrivateRoute>
  );
}

// ============================================================================
// KOMPONENT POMOCNICZY - edycja zamówienia
// ============================================================================

function EditOrderWrapper() {
  const { orderId } = useParams();
  // OrderForm jest lazy-loaded, więc już jest obsługiwany przez Suspense w PrivateLayout
  return <OrderForm orderId={orderId} />;
}

// ============================================================================
// KOMPONENTY POMOCNICZE - redirect legacy ścieżek do kanonicznych
// ============================================================================

function CustomerRedirect() {
  const { customerId } = useParams();
  return <Navigate to={`/orders/customers/${customerId}`} replace />;
}

function PriceListRedirect() {
  const { id } = useParams();
  return <Navigate to={`/orders/price-lists/${id}`} replace />;
}

function PriceListEditRedirect() {
  const { id } = useParams();
  return <Navigate to={`/orders/price-lists/${id}/edit`} replace />;
}

export default App;
