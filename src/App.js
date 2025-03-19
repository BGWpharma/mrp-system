// src/App.js
import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useParams } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { NotificationProvider } from './contexts/NotificationContext';

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
              <Route path="/invoices" element={<PrivateLayout><InvoicesPage /></PrivateLayout>} />
              
              {/* Purchase Orders Routes */}
              <Route path="/purchase-orders" element={<PrivateLayout><PurchaseOrdersPage /></PrivateLayout>} />
              <Route path="/purchase-orders/new" element={<PrivateLayout><PurchaseOrderFormPage /></PrivateLayout>} />
              <Route path="/purchase-orders/:id" element={<PrivateLayout><PurchaseOrderDetailsPage /></PrivateLayout>} />
              <Route path="/purchase-orders/:id/edit" element={<PrivateLayout><PurchaseOrderFormPage /></PrivateLayout>} />
              
              {/* Suppliers Routes */}
              <Route path="/suppliers" element={<PrivateLayout><SuppliersPage /></PrivateLayout>} />
              <Route path="/suppliers/new" element={<PrivateLayout><SupplierFormPage /></PrivateLayout>} />
              <Route path="/suppliers/:id/edit" element={<PrivateLayout><SupplierFormPage /></PrivateLayout>} />
              
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
  return (
    <PrivateRoute>
      <div className="layout">
        <Navbar />
        <div className="content-container">
          <Sidebar />
          <main className="main-content">
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