// src/App.js
import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useParams } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { NotificationProvider } from './contexts/NotificationContext';
import { useTheme } from './contexts/ThemeContext';

// Pages
import Login from './pages/Auth/Login';
import Register from './pages/Auth/Register';
import Dashboard from './pages/Dashboard/Dashboard';

// Recipes
import RecipesPage from './pages/Recipes/RecipesPage';
import RecipeDetailsPage from './pages/Recipes/RecipeDetailsPage';
import NewRecipePage from './pages/Recipes/NewRecipePage';
import EditRecipePage from './pages/Recipes/EditRecipePage';

// Production
import ProductionPage from './pages/Production/ProductionPage';
import NewTaskPage from './pages/Production/NewTaskPage';
import ProductionCalendarPage from './pages/Production/ProductionCalendarPage';
import TaskDetailsPage from './pages/Production/TaskDetailsPage';
import EditTaskPage from './pages/Production/EditTaskPage';
import ConsumptionPage from './pages/Production/ConsumptionPage';
import ForecastPage from './pages/Production/ForecastPage';
import ReportsPage from './pages/Production/ReportsPage';
import CreateFromOrderPage from './pages/Production/CreateFromOrderPage';

// Inventory
import InventoryPage from './pages/Inventory/InventoryPage';
import ItemDetailsPage from './pages/Inventory/ItemDetailsPage';
import NewInventoryItemPage from './pages/Inventory/NewInventoryItemPage';
import EditInventoryItemPage from './pages/Inventory/EditInventoryItemPage';
import ReceiveInventoryPage from './pages/Inventory/ReceiveInventoryPage';
import IssueInventoryPage from './pages/Inventory/IssueInventoryPage';
import InventoryHistoryPage from './pages/Inventory/InventoryHistoryPage';
import ExpiryDatesPage from './pages/Inventory/ExpiryDatesPage';
import BatchesPage from './pages/Inventory/BatchesPage';
import BatchEditPage from './pages/Inventory/BatchEditPage';
import StocktakingPage from './pages/Inventory/StocktakingPage';
import StocktakingFormPage from './pages/Inventory/StocktakingFormPage';
import StocktakingDetailsPage from './pages/Inventory/StocktakingDetailsPage';
import StocktakingReportPage from './pages/Inventory/StocktakingReportPage';

// Quality
import QualityPage from './pages/Quality/QualityPage';
import NewTestPage from './pages/Quality/NewTestPage';
import QualityReportsPage from './pages/Quality/QualityReportsPage';

// Orders
import OrdersList from './components/orders/OrdersList';
import OrderForm from './components/orders/OrderForm';
import OrderDetails from './components/orders/OrderDetails';

// Purchase Orders
import PurchaseOrdersPage from './pages/PurchaseOrdersPage';
import PurchaseOrderFormPage from './pages/PurchaseOrderFormPage';
import PurchaseOrderDetailsPage from './pages/PurchaseOrderDetailsPage';
import SuppliersPage from './pages/SuppliersPage';
import SupplierFormPage from './pages/SupplierFormPage';

// Customers
import CustomersList from './components/customers/CustomersList';
import CustomerDetail from './components/customers/CustomerDetail';

// Logistics - nowy moduł
import WaybillListPage from './pages/Logistics/Waybill/WaybillListPage';
import WaybillDetailsPage from './pages/Logistics/Waybill/WaybillDetailsPage';
import WaybillCreatePage from './pages/Logistics/Waybill/WaybillCreatePage';
import WaybillEditPage from './pages/Logistics/Waybill/WaybillEditPage';

// Analytics
import AnalyticsDashboard from './pages/Analytics/Dashboard';

// Common Components
import Navbar from './components/common/Navbar';
import Sidebar from './components/common/Sidebar';
import PrivateRoute from './components/common/PrivateRoute';

// Styles
import './assets/styles/global.css';

// Import komponentu WarehousesList
import WarehousesList from './components/inventory/WarehousesList';

// Invoices
import InvoicesPage from './pages/Invoices/InvoicesPage';
import InvoicesListPage from './pages/Invoices/InvoicesListPage';
import InvoiceFormPage from './pages/Invoices/InvoiceFormPage';
import InvoiceDetailsPage from './pages/Invoices/InvoiceDetailsPage';
import CompanySettingsPage from './pages/Invoices/CompanySettingsPage';

// CMR
import CmrListPage from './pages/Inventory/Cmr/CmrListPage';
import CmrCreatePage from './pages/Inventory/Cmr/CmrCreatePage';
import CmrDetailsPage from './pages/Inventory/Cmr/CmrDetailsPage';
import CmrEditPage from './pages/Inventory/Cmr/CmrEditPage';

// CRM
import CRMDashboardPage from './pages/CRM/CRMDashboardPage';
import ContactsPage from './pages/CRM/ContactsPage';
import ContactFormPage from './pages/CRM/ContactFormPage';
import ContactDetailsPage from './pages/CRM/ContactDetailsPage';
import InteractionsPage from './pages/CRM/InteractionsPage';
import InteractionFormPage from './pages/CRM/InteractionFormPage';
import InteractionDetailsPage from './pages/CRM/InteractionDetailsPage';
import OpportunitiesPage from './pages/CRM/OpportunitiesPage';
import OpportunityFormPage from './pages/CRM/OpportunityFormPage';
import OpportunityDetailsPage from './pages/CRM/OpportunityDetailsPage';

function App() {
  return (
    <Router>
      <AuthProvider>
        <NotificationProvider>
          <div className="app-container">
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              
              <Route path="/" element={<PrivateLayout><Dashboard /></PrivateLayout>} />
              
              {/* Recipes Routes */}
              <Route path="/recipes" element={<PrivateLayout><RecipesPage /></PrivateLayout>} />
              <Route path="/recipes/new" element={<PrivateLayout><NewRecipePage /></PrivateLayout>} />
              <Route path="/recipes/:id" element={<PrivateLayout><RecipeDetailsPage /></PrivateLayout>} />
              <Route path="/recipes/:id/edit" element={<PrivateLayout><EditRecipePage /></PrivateLayout>} />
              
              {/* Production Routes */}
              <Route path="/production" element={<PrivateLayout><ProductionPage /></PrivateLayout>} />
              <Route path="/production/new-task" element={<PrivateLayout><NewTaskPage /></PrivateLayout>} />
              <Route path="/production/calendar" element={<PrivateLayout><ProductionCalendarPage /></PrivateLayout>} />
              <Route path="/production/tasks/:id" element={<PrivateLayout><TaskDetailsPage /></PrivateLayout>} />
              <Route path="/production/tasks/:id/edit" element={<PrivateLayout><EditTaskPage /></PrivateLayout>} />
              <Route path="/production/consumption/:taskId" element={<PrivateLayout><ConsumptionPage /></PrivateLayout>} />
              <Route path="/production/forecast" element={<PrivateLayout><ForecastPage /></PrivateLayout>} />
              <Route path="/production/reports" element={<PrivateLayout><ReportsPage /></PrivateLayout>} />
              <Route path="/production/create-from-order" element={<PrivateLayout><CreateFromOrderPage /></PrivateLayout>} />
              
              {/* Inventory Routes */}
              <Route path="/inventory" element={<PrivateLayout><InventoryPage /></PrivateLayout>} />
              <Route path="/inventory/new" element={<PrivateLayout><NewInventoryItemPage /></PrivateLayout>} />
              <Route path="/inventory/:id" element={<PrivateLayout><ItemDetailsPage /></PrivateLayout>} />
              <Route path="/inventory/:id/batches" element={<PrivateLayout><BatchesPage /></PrivateLayout>} />
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
              
              {/* CMR Routes */}
              <Route path="/inventory/cmr" element={<PrivateLayout><CmrListPage /></PrivateLayout>} />
              <Route path="/inventory/cmr/new" element={<PrivateLayout><CmrCreatePage /></PrivateLayout>} />
              <Route path="/inventory/cmr/:id" element={<PrivateLayout><CmrDetailsPage /></PrivateLayout>} />
              <Route path="/inventory/cmr/:id/edit" element={<PrivateLayout><CmrEditPage /></PrivateLayout>} />
              
              {/* Quality Routes */}
              <Route path="/quality" element={<PrivateLayout><QualityPage /></PrivateLayout>} />
              <Route path="/quality/new-test" element={<PrivateLayout><NewTestPage /></PrivateLayout>} />
              <Route path="/quality/reports" element={<PrivateLayout><QualityReportsPage /></PrivateLayout>} />
              
              {/* Orders Routes */}
              <Route path="/orders" element={<PrivateLayout><OrdersList /></PrivateLayout>} />
              <Route path="/orders/new" element={<PrivateLayout><OrderForm /></PrivateLayout>} />
              <Route path="/orders/edit/:orderId" element={<PrivateLayout><EditOrderWrapper /></PrivateLayout>} />
              <Route path="/orders/:orderId" element={<PrivateLayout><OrderDetails /></PrivateLayout>} />
              
              {/* Invoices Routes */}
              <Route path="/invoices" element={<PrivateLayout><InvoicesListPage /></PrivateLayout>} />
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
              
              {/* Logistics Routes */}
              <Route path="/logistics/waybill" element={<PrivateLayout><WaybillListPage /></PrivateLayout>} />
              <Route path="/logistics/waybill/create" element={<PrivateLayout><WaybillCreatePage /></PrivateLayout>} />
              <Route path="/logistics/waybill/:id" element={<PrivateLayout><WaybillDetailsPage /></PrivateLayout>} />
              <Route path="/logistics/waybill/:id/edit" element={<PrivateLayout><WaybillEditPage /></PrivateLayout>} />
              
              {/* Customers Routes */}
              <Route path="/customers" element={<PrivateLayout><CustomersList /></PrivateLayout>} />
              <Route path="/customers/:customerId" element={<PrivateLayout><CustomerDetail /></PrivateLayout>} />
              
              {/* Analytics Routes */}
              <Route path="/analytics" element={<PrivateLayout><AnalyticsDashboard /></PrivateLayout>} />
              
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
              <Route path="/inventory/interactions" element={<PrivateLayout><InteractionsPage /></PrivateLayout>} />
              <Route path="/inventory/interactions/new" element={<PrivateLayout><InteractionFormPage /></PrivateLayout>} />
              <Route path="/inventory/interactions/:interactionId" element={<PrivateLayout><InteractionDetailsPage /></PrivateLayout>} />
              <Route path="/inventory/interactions/:interactionId/edit" element={<PrivateLayout><InteractionFormPage /></PrivateLayout>} />
              
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </div>
        </NotificationProvider>
      </AuthProvider>
    </Router>
  );
}

// PrivateLayout component to wrap authenticated routes
function PrivateLayout({ children }) {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const { mode } = useTheme();

  const handleSidebarToggle = (collapsed) => {
    setIsSidebarCollapsed(collapsed);
  };

  return (
    <PrivateRoute>
      <div className="layout" style={{ 
        backgroundColor: mode === 'dark' ? '#111827' : '#f5f5f5', 
        color: mode === 'dark' ? 'white' : 'rgba(0, 0, 0, 0.87)'
      }}>
        <Navbar />
        <div className="content-container">
          <Sidebar onToggle={handleSidebarToggle} />
          <main className={`main-content ${isSidebarCollapsed ? 'sidebar-collapsed' : 'sidebar-expanded'}`}>
            {children}
          </main>
        </div>
      </div>
    </PrivateRoute>
  );
}

// Komponent pomocniczy do obsługi edycji zamówienia
function EditOrderWrapper() {
  const { orderId } = useParams();
  return <OrderForm orderId={orderId} />;
}

export default App;