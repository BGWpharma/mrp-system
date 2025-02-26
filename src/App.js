// src/App.js
import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
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

// Production
import ProductionPage from './pages/Production/ProductionPage';
import NewTaskPage from './pages/Production/NewTaskPage';

// Inventory
import InventoryPage from './pages/Inventory/InventoryPage';
import ItemDetailsPage from './pages/Inventory/ItemDetailsPage';

// Quality
import QualityPage from './pages/Quality/QualityPage';
import NewTestPage from './pages/Quality/NewTestPage';

// Common Components
import Navbar from './components/common/Navbar';
import Sidebar from './components/common/Sidebar';
import PrivateRoute from './components/common/PrivateRoute';

// Styles
import './assets/styles/global.css';

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
              
              {/* Production Routes */}
              <Route path="/production" element={<PrivateLayout><ProductionPage /></PrivateLayout>} />
              <Route path="/production/new-task" element={<PrivateLayout><NewTaskPage /></PrivateLayout>} />
              
              {/* Inventory Routes */}
              <Route path="/inventory" element={<PrivateLayout><InventoryPage /></PrivateLayout>} />
              <Route path="/inventory/:id" element={<PrivateLayout><ItemDetailsPage /></PrivateLayout>} />
              
              {/* Quality Routes */}
              <Route path="/quality" element={<PrivateLayout><QualityPage /></PrivateLayout>} />
              <Route path="/quality/new-test" element={<PrivateLayout><NewTestPage /></PrivateLayout>} />
              
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

export default App;