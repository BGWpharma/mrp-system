import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './firebase';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import CustomerPortalPage from './components/portal/CustomerPortalPage';
import './App.css';

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-800">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-300">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <Router>
      <div className="App">
        <Routes>
          {/* Customer Portal Routes - No authentication required */}
          <Route path="/portal/:slug" element={<CustomerPortalPage />} />
          
          {/* Admin Routes - Authentication required */}
          <Route path="/admin" element={
            user ? <Dashboard user={user} /> : <Navigate to="/login" replace />
          } />
          
          <Route path="/login" element={
            user ? <Navigate to="/admin" replace /> : <Login />
          } />
          
          {/* Default route */}
          <Route path="/" element={
            user ? <Navigate to="/admin" replace /> : <Navigate to="/login" replace />
          } />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
