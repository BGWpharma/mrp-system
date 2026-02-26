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
import PermissionRoute from './components/common/PermissionRoute';

// Styles
import './styles/global.css';

// ============================================================================
// LAZY LOADED PAGES - ładowane on-demand dla lepszej wydajności
// ============================================================================

const AIChatFAB = lazy(() => import('./components/common/AIChatFAB'));

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

// Orders
const OrdersPage = lazy(() => import('./pages/Orders/OrdersPage'));
const OrdersList = lazy(() => import('./components/orders/OrdersList'));
const OrderForm = lazy(() => import('./components/orders/OrderForm'));
const OrderDetails = lazy(() => import('./components/orders/OrderDetails'));

// Purchase Orders
const PurchaseOrdersPage = lazy(() => import('./pages/PurchaseOrders/PurchaseOrdersPage'));
const PurchaseOrderFormPage = lazy(() => import('./pages/PurchaseOrders/PurchaseOrderFormPage'));
const PurchaseOrderDetailsPage = lazy(() => import('./pages/PurchaseOrders/PurchaseOrderDetailsPage'));
const SuppliersPage = lazy(() => import('./pages/Suppliers/SuppliersPage'));
const SupplierFormPage = lazy(() => import('./pages/Suppliers/SupplierFormPage'));

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
                    
                    <Route path="/" element={<PermissionRoute permission="canAccessDashboard"><PrivateLayout><Dashboard /></PrivateLayout></PermissionRoute>} />
                    
                    {/* Analytics Routes */}
                    <Route path="/analytics" element={<PermissionRoute permission="canAccessAnalytics"><PrivateLayout><AnalyticsDashboardPage /></PrivateLayout></PermissionRoute>} />
                    <Route path="/analytics/financial-report" element={<PermissionRoute permission="canAccessAnalytics"><PrivateLayout><FinancialReportPage /></PrivateLayout></PermissionRoute>} />
                    <Route path="/analytics/production-time" element={<PermissionRoute permission="canAccessAnalytics"><PrivateLayout><ProductionTimePage /></PrivateLayout></PermissionRoute>} />
                    <Route path="/analytics/mo-consumption" element={<PermissionRoute permission="canAccessAnalytics"><PrivateLayout><MOConsumptionPage /></PrivateLayout></PermissionRoute>} />
                    <Route path="/analytics/production-progress" element={<PermissionRoute permission="canAccessAnalytics"><PrivateLayout><ProductionProgressPage /></PrivateLayout></PermissionRoute>} />
                    <Route path="/analytics/production-costs" element={<PermissionRoute permission="canAccessAnalytics"><PrivateLayout><ProductionCostsPage /></PrivateLayout></PermissionRoute>} />
                    <Route path="/analytics/cashflow" element={<PermissionRoute permission="canAccessAnalytics"><PrivateLayout><CashflowPage /></PrivateLayout></PermissionRoute>} />
                    <Route path="/analytics/mixing" element={<PermissionRoute permission="canAccessAnalytics"><PrivateLayout><MixingAnalyticsPage /></PrivateLayout></PermissionRoute>} />
                    <Route path="/analytics/weekly-sprint" element={<Navigate to="/analytics/production-time" replace />} />
                    <Route path="/analytics/eco-report" element={<PermissionRoute permission="canAccessAnalytics"><PrivateLayout><EcoReportPage /></PrivateLayout></PermissionRoute>} />
                    
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
                    <Route path="/recipes" element={<PermissionRoute permission="canAccessProduction"><PrivateLayout><RecipesPage /></PrivateLayout></PermissionRoute>} />
                    <Route path="/recipes/new" element={<PermissionRoute permission="canAccessProduction"><PrivateLayout><NewRecipePage /></PrivateLayout></PermissionRoute>} />
                    <Route path="/recipes/:id" element={<PermissionRoute permission="canAccessProduction"><PrivateLayout><RecipeDetailsPage /></PrivateLayout></PermissionRoute>} />
                    <Route path="/recipes/:id/edit" element={<PermissionRoute permission="canAccessProduction"><PrivateLayout><EditRecipePage /></PrivateLayout></PermissionRoute>} />
                    
                    {/* Production Routes */}
                    <Route path="/production" element={<PermissionRoute permission="canAccessProduction"><PrivateLayout><ProductionPage /></PrivateLayout></PermissionRoute>} />
                    <Route path="/production/new-task" element={<PermissionRoute permission="canAccessProduction"><PrivateLayout><NewTaskPage /></PrivateLayout></PermissionRoute>} />
                    <Route path="/production/timeline" element={<PermissionRoute permission="canAccessProduction"><PrivateLayout><ProductionTimelinePage /></PrivateLayout></PermissionRoute>} />
                    <Route path="/production/calculator" element={<PermissionRoute permission="canAccessProduction"><PrivateLayout><CalculatorPage /></PrivateLayout></PermissionRoute>} />
                    <Route path="/production/forecast" element={<PermissionRoute permission="canAccessProduction"><PrivateLayout><ForecastPage /></PrivateLayout></PermissionRoute>} />
                    <Route path="/production/forms" element={<PermissionRoute permission="canAccessProduction"><PrivateLayout><FormsPage /></PrivateLayout></PermissionRoute>} />
                    <Route path="/production/forms/completed-mo" element={<PermissionRoute permission="canAccessProduction"><PrivateLayout><CompletedMOFormPage /></PrivateLayout></PermissionRoute>} />
                    <Route path="/production/forms/production-control" element={<PermissionRoute permission="canAccessProduction"><PrivateLayout><ProductionControlFormPage /></PrivateLayout></PermissionRoute>} />
                    <Route path="/production/forms/production-shift" element={<PermissionRoute permission="canAccessProduction"><PrivateLayout><ProductionShiftFormPage /></PrivateLayout></PermissionRoute>} />
                    <Route path="/production/forms/responses" element={<PermissionRoute permission="canAccessProduction"><PrivateLayout><FormsResponsesPage /></PrivateLayout></PermissionRoute>} />
                    <Route path="/production/tasks/:id" element={<PermissionRoute permission="canAccessProduction"><PrivateLayout><TaskDetailsPage /></PrivateLayout></PermissionRoute>} />
                    <Route path="/production/tasks/:id/edit" element={<PermissionRoute permission="canAccessProduction"><PrivateLayout><EditTaskPage /></PrivateLayout></PermissionRoute>} />
                    <Route path="/production/consumption/:taskId" element={<PermissionRoute permission="canAccessProduction"><PrivateLayout><ConsumptionPage /></PrivateLayout></PermissionRoute>} />
                    <Route path="/production/reports" element={<PermissionRoute permission="canAccessProduction"><PrivateLayout><ReportsPage /></PrivateLayout></PermissionRoute>} />
                    <Route path="/production/create-from-order" element={<PermissionRoute permission="canAccessProduction"><PrivateLayout><CreateFromOrderPage /></PrivateLayout></PermissionRoute>} />
                    <Route path="/production/workstations" element={<PermissionRoute permission="canAccessProduction"><PrivateLayout><WorkstationsPage /></PrivateLayout></PermissionRoute>} />
                    <Route path="/production/workstations/new" element={<PermissionRoute permission="canAccessProduction"><PrivateLayout><WorkstationsPage /></PrivateLayout></PermissionRoute>} />
                    
                    {/* Inventory Routes */}
                    <Route path="/inventory" element={<PermissionRoute permission="canAccessInventory"><PrivateLayout><InventoryPage /></PrivateLayout></PermissionRoute>} />
                    <Route path="/inventory/new" element={<PermissionRoute permission="canAccessInventory"><PrivateLayout><NewInventoryItemPage /></PrivateLayout></PermissionRoute>} />
                    <Route path="/inventory/:id" element={<PermissionRoute permission="canAccessInventory"><PrivateLayout><ItemDetailsPage /></PrivateLayout></PermissionRoute>} />
                    <Route path="/inventory/:id/batches" element={<PermissionRoute permission="canAccessInventory"><PrivateLayout><BatchesPage /></PrivateLayout></PermissionRoute>} />
                    <Route path="/inventory/batch/:batchId" element={<PermissionRoute permission="canAccessInventory"><PrivateLayout><BatchEditPage /></PrivateLayout></PermissionRoute>} />
                    <Route path="/inventory/:id/batches/:batchId/edit" element={<PermissionRoute permission="canAccessInventory"><PrivateLayout><BatchEditPage /></PrivateLayout></PermissionRoute>} />
                    <Route path="/inventory/:id/edit" element={<PermissionRoute permission="canAccessInventory"><PrivateLayout><EditInventoryItemPage /></PrivateLayout></PermissionRoute>} />
                    <Route path="/inventory/:id/receive" element={<PermissionRoute permission="canAccessInventory"><PrivateLayout><ReceiveInventoryPage /></PrivateLayout></PermissionRoute>} />
                    <Route path="/inventory/:id/issue" element={<PermissionRoute permission="canAccessInventory"><PrivateLayout><IssueInventoryPage /></PrivateLayout></PermissionRoute>} />
                    <Route path="/inventory/:id/history" element={<PermissionRoute permission="canAccessInventory"><PrivateLayout><InventoryHistoryPage /></PrivateLayout></PermissionRoute>} />
                    <Route path="/inventory/expiry-dates" element={<PermissionRoute permission="canAccessInventory"><PrivateLayout><ExpiryDatesPage /></PrivateLayout></PermissionRoute>} />
                    <Route path="/inventory/stocktaking" element={<PermissionRoute permission="canAccessInventory"><PrivateLayout><StocktakingPage /></PrivateLayout></PermissionRoute>} />
                    <Route path="/inventory/stocktaking/new" element={<PermissionRoute permission="canAccessInventory"><PrivateLayout><StocktakingFormPage /></PrivateLayout></PermissionRoute>} />
                    <Route path="/inventory/stocktaking/:id" element={<PermissionRoute permission="canAccessInventory"><PrivateLayout><StocktakingDetailsPage /></PrivateLayout></PermissionRoute>} />
                    <Route path="/inventory/stocktaking/:id/edit" element={<PermissionRoute permission="canAccessInventory"><PrivateLayout><StocktakingFormPage /></PrivateLayout></PermissionRoute>} />
                    <Route path="/inventory/stocktaking/:id/report" element={<PermissionRoute permission="canAccessInventory"><PrivateLayout><StocktakingReportPage /></PrivateLayout></PermissionRoute>} />
                    <Route path="/inventory/forms" element={<PermissionRoute permission="canAccessInventory"><PrivateLayout><InventoryFormsPage /></PrivateLayout></PermissionRoute>} />
                    <Route path="/inventory/forms/responses" element={<PermissionRoute permission="canAccessInventory"><PrivateLayout><InventoryFormsResponsesPage /></PrivateLayout></PermissionRoute>} />
                    <Route path="/inventory/forms/loading-report" element={<PermissionRoute permission="canAccessInventory"><PrivateLayout><LoadingReportFormPage /></PrivateLayout></PermissionRoute>} />
                    <Route path="/inventory/forms/unloading-report" element={<PermissionRoute permission="canAccessInventory"><PrivateLayout><UnloadingReportFormPage /></PrivateLayout></PermissionRoute>} />
                    
                    {/* CMR Routes */}
                    <Route path="/inventory/cmr" element={<PermissionRoute permission="canAccessInventory"><PrivateLayout><CmrListPage /></PrivateLayout></PermissionRoute>} />
                    <Route path="/inventory/cmr/new" element={<PermissionRoute permission="canAccessInventory"><PrivateLayout><CmrCreatePage /></PrivateLayout></PermissionRoute>} />
                    <Route path="/inventory/cmr/:id" element={<PermissionRoute permission="canAccessInventory"><PrivateLayout><CmrDetailsPage /></PrivateLayout></PermissionRoute>} />
                    <Route path="/inventory/cmr/:id/edit" element={<PermissionRoute permission="canAccessInventory"><PrivateLayout><CmrEditPage /></PrivateLayout></PermissionRoute>} />
                    
                    {/* Orders Routes - główna strona z zakładkami */}
                    <Route path="/orders" element={<PermissionRoute permission="canAccessSales"><PrivateLayout><OrdersPage /></PrivateLayout></PermissionRoute>} />
                    <Route path="/orders/customers" element={<PermissionRoute permission="canAccessSales"><PrivateLayout><OrdersPage /></PrivateLayout></PermissionRoute>} />
                    <Route path="/orders/price-lists" element={<PermissionRoute permission="canAccessSales"><PrivateLayout><OrdersPage /></PrivateLayout></PermissionRoute>} />
                    <Route path="/orders/new" element={<PermissionRoute permission="canAccessSales"><PrivateLayout><OrderForm /></PrivateLayout></PermissionRoute>} />
                    <Route path="/orders/edit/:orderId" element={<PermissionRoute permission="canAccessSales"><PrivateLayout><EditOrderWrapper /></PrivateLayout></PermissionRoute>} />
                    <Route path="/orders/:orderId" element={<PermissionRoute permission="canAccessSales"><PrivateLayout><OrderDetails /></PrivateLayout></PermissionRoute>} />
                    
                    {/* Price Lists Routes - teraz w ramach orders */}
                    <Route path="/orders/price-lists/new" element={<PermissionRoute permission="canAccessSales"><PrivateLayout><PriceListFormPage /></PrivateLayout></PermissionRoute>} />
                    <Route path="/orders/price-lists/:id" element={<PermissionRoute permission="canAccessSales"><PrivateLayout><PriceListDetailsPage /></PrivateLayout></PermissionRoute>} />
                    <Route path="/orders/price-lists/:id/edit" element={<PermissionRoute permission="canAccessSales"><PrivateLayout><PriceListFormPage /></PrivateLayout></PermissionRoute>} />
                    
                    {/* Legacy Price Lists Routes - redirect do kanonicznych ścieżek */}
                    <Route path="/sales/price-lists" element={<Navigate to="/orders/price-lists" replace />} />
                    <Route path="/sales/price-lists/new" element={<Navigate to="/orders/price-lists/new" replace />} />
                    <Route path="/sales/price-lists/:id" element={<PriceListRedirect />} />
                    <Route path="/sales/price-lists/:id/edit" element={<PriceListEditRedirect />} />
                    
                    
                    {/* Sales Routes - nowa struktura z zakładkami */}
                    <Route path="/sales" element={<PermissionRoute permission="canAccessSales"><PrivateLayout><SalesPage /></PrivateLayout></PermissionRoute>} />
                    <Route path="/sales/material-advances" element={<PermissionRoute permission="canAccessSales"><PrivateLayout><SalesPage /></PrivateLayout></PermissionRoute>} />
                    <Route path="/sales/factory-costs" element={<PermissionRoute permission="canAccessSales"><PrivateLayout><SalesPage /></PrivateLayout></PermissionRoute>} />
                    <Route path="/sales/quotation" element={<PermissionRoute permission="canAccessSales"><PrivateLayout><SalesPage /></PrivateLayout></PermissionRoute>} />
                    
                    {/* Invoices Routes */}
                    <Route path="/invoices" element={<PermissionRoute permission="canAccessSales"><PrivateLayout><SalesPage /></PrivateLayout></PermissionRoute>} />
                    <Route path="/invoices/new" element={<PermissionRoute permission="canAccessSales"><PrivateLayout><InvoiceFormPage /></PrivateLayout></PermissionRoute>} />
                    <Route path="/invoices/:invoiceId" element={<PermissionRoute permission="canAccessSales"><PrivateLayout><InvoiceDetailsPage /></PrivateLayout></PermissionRoute>} />
                    <Route path="/invoices/:invoiceId/edit" element={<PermissionRoute permission="canAccessSales"><PrivateLayout><InvoiceFormPage /></PrivateLayout></PermissionRoute>} />
                    <Route path="/invoices/company-settings" element={<PermissionRoute permission="canAccessSales"><PrivateLayout><CompanySettingsPage /></PrivateLayout></PermissionRoute>} />
                    
                    {/* Purchase Orders Routes */}
                    <Route path="/purchase-orders" element={<PermissionRoute permission="canAccessInventory"><PrivateLayout><PurchaseOrdersPage /></PrivateLayout></PermissionRoute>} />
                    <Route path="/purchase-orders/new" element={<PermissionRoute permission="canAccessInventory"><PrivateLayout><PurchaseOrderFormPage /></PrivateLayout></PermissionRoute>} />
                    <Route path="/purchase-orders/:id" element={<PermissionRoute permission="canAccessInventory"><PrivateLayout><PurchaseOrderDetailsPage /></PrivateLayout></PermissionRoute>} />
                    <Route path="/purchase-orders/:id/edit" element={<PermissionRoute permission="canAccessInventory"><PrivateLayout><PurchaseOrderFormPage /></PrivateLayout></PermissionRoute>} />
                    
                    {/* Suppliers Routes */}
                    <Route path="/suppliers" element={<PermissionRoute permission="canAccessInventory"><PrivateLayout><SuppliersPage /></PrivateLayout></PermissionRoute>} />
                    <Route path="/suppliers/new" element={<PermissionRoute permission="canAccessInventory"><PrivateLayout><SupplierFormPage /></PrivateLayout></PermissionRoute>} />
                    <Route path="/suppliers/:id/edit" element={<PermissionRoute permission="canAccessInventory"><PrivateLayout><SupplierFormPage /></PrivateLayout></PermissionRoute>} />
                    <Route path="/suppliers/:id/view" element={<PermissionRoute permission="canAccessInventory"><PrivateLayout><SupplierFormPage viewOnly={true} /></PrivateLayout></PermissionRoute>} />
                    <Route path="/suppliers/:id" element={<PermissionRoute permission="canAccessInventory"><PrivateLayout><SupplierFormPage viewOnly={true} /></PrivateLayout></PermissionRoute>} />
                    
                    {/* Customers Routes - teraz w ramach orders */}
                    <Route path="/orders/customers/:customerId" element={<PermissionRoute permission="canAccessSales"><PrivateLayout><CustomerDetail /></PrivateLayout></PermissionRoute>} />
                    
                    {/* Legacy Customers Routes - redirect do kanonicznych ścieżek */}
                    <Route path="/customers" element={<Navigate to="/orders/customers" replace />} />
                    <Route path="/customers/:customerId" element={<CustomerRedirect />} />
                    
                    {/* AI Assistant Routes */}
                    <Route path="/ai-assistant" element={<PermissionRoute permission="canAccessAIAssistant"><PrivateLayout><AIAssistantPage /></PrivateLayout></PermissionRoute>} />
                    
                    {/* Kiosk Routes */}
                    <Route path="/kiosk/*" element={
                      <Suspense fallback={<PageLoading />}>
                        <KioskPage />
                      </Suspense>
                    } />
                    
                    {/* Hall Data Routes */}
                    <Route path="/hall-data/conditions" element={<PermissionRoute permission="canAccessHallData"><PrivateLayout><HallDataConditionsPage /></PrivateLayout></PermissionRoute>} />
                    <Route path="/hall-data/machines" element={<PermissionRoute permission="canAccessHallData"><PrivateLayout><HallDataMachinesPage /></PrivateLayout></PermissionRoute>} />
                    <Route path="/hall-data/forms" element={<PermissionRoute permission="canAccessHallData"><PrivateLayout><HallDataFormsPage /></PrivateLayout></PermissionRoute>} />
                    <Route path="/hall-data/forms/service-report" element={<PermissionRoute permission="canAccessHallData"><PrivateLayout><ServiceReportFormPage /></PrivateLayout></PermissionRoute>} />
                    <Route path="/hall-data/forms/monthly-service-report" element={<PermissionRoute permission="canAccessHallData"><PrivateLayout><MonthlyServiceReportFormPage /></PrivateLayout></PermissionRoute>} />
                    <Route path="/hall-data/forms/defect-registry" element={<PermissionRoute permission="canAccessHallData"><PrivateLayout><DefectRegistryFormPage /></PrivateLayout></PermissionRoute>} />
                    <Route path="/hall-data/forms/service-repair-report" element={<PermissionRoute permission="canAccessHallData"><PrivateLayout><ServiceRepairReportFormPage /></PrivateLayout></PermissionRoute>} />
                    <Route path="/hall-data/forms/responses" element={<PermissionRoute permission="canAccessHallData"><PrivateLayout><HallDataFormsResponsesPage /></PrivateLayout></PermissionRoute>} />
                    
                    {/* CRM Routes */}
                    <Route path="/crm" element={<PermissionRoute permission="canAccessCRM"><PrivateLayout><CRMDashboardPage /></PrivateLayout></PermissionRoute>} />
                    <Route path="/crm/contacts" element={<PermissionRoute permission="canAccessCRM"><PrivateLayout><ContactsPage /></PrivateLayout></PermissionRoute>} />
                    <Route path="/crm/contacts/new" element={<PermissionRoute permission="canAccessCRM"><PrivateLayout><ContactFormPage /></PrivateLayout></PermissionRoute>} />
                    <Route path="/crm/contacts/:contactId" element={<PermissionRoute permission="canAccessCRM"><PrivateLayout><ContactDetailsPage /></PrivateLayout></PermissionRoute>} />
                    <Route path="/crm/contacts/:contactId/edit" element={<PermissionRoute permission="canAccessCRM"><PrivateLayout><ContactFormPage /></PrivateLayout></PermissionRoute>} />
                    <Route path="/crm/interactions" element={<PermissionRoute permission="canAccessCRM"><PrivateLayout><InteractionsPage /></PrivateLayout></PermissionRoute>} />
                    <Route path="/crm/interactions/new" element={<PermissionRoute permission="canAccessCRM"><PrivateLayout><InteractionFormPage /></PrivateLayout></PermissionRoute>} />
                    <Route path="/crm/interactions/:interactionId" element={<PermissionRoute permission="canAccessCRM"><PrivateLayout><InteractionDetailsPage /></PrivateLayout></PermissionRoute>} />
                    <Route path="/crm/interactions/:interactionId/edit" element={<PermissionRoute permission="canAccessCRM"><PrivateLayout><InteractionFormPage /></PrivateLayout></PermissionRoute>} />
                    <Route path="/crm/opportunities" element={<PermissionRoute permission="canAccessCRM"><PrivateLayout><OpportunitiesPage /></PrivateLayout></PermissionRoute>} />
                    <Route path="/crm/opportunities/new" element={<PermissionRoute permission="canAccessCRM"><PrivateLayout><OpportunityFormPage /></PrivateLayout></PermissionRoute>} />
                    <Route path="/crm/opportunities/:opportunityId" element={<PermissionRoute permission="canAccessCRM"><PrivateLayout><OpportunityDetailsPage /></PrivateLayout></PermissionRoute>} />
                    <Route path="/crm/opportunities/:opportunityId/edit" element={<PermissionRoute permission="canAccessCRM"><PrivateLayout><OpportunityFormPage /></PrivateLayout></PermissionRoute>} />
                    
                    {/* Interakcje zakupowe w sekcji Magazyn */}

                    
                    {/* Powiadomienia */}
                    <Route path="/notifications/history" element={<PrivateLayout><NotificationsHistoryPage /></PrivateLayout>} />
                    
                    {/* Taskboard Routes */}
                    <Route path="/taskboard" element={<PermissionRoute permission="canAccessDashboard"><PrivateLayout><TaskboardView /></PrivateLayout></PermissionRoute>} />
                    <Route path="/taskboard/:boardId" element={<PermissionRoute permission="canAccessDashboard"><PrivateLayout><BoardDetail /></PrivateLayout></PermissionRoute>} />
                    
                    {/* Zespół - Czas pracy i Grafik */}
                    <Route path="/work-time" element={<PermissionRoute permission="canAccessDashboard"><PrivateLayout><WorkTimePage /></PrivateLayout></PermissionRoute>} />
                    <Route path="/schedule" element={<PermissionRoute permission="canAccessDashboard"><PrivateLayout><SchedulePage /></PrivateLayout></PermissionRoute>} />
                    
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
        
        <Suspense fallback={null}>
          <AIChatFAB />
        </Suspense>
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
