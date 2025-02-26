// src/components/common/PrivateRoute.js
import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';

const PrivateRoute = ({ children }) => {
  const { currentUser, loading } = useAuth();
  
  // Pokazujemy wskaźnik ładowania podczas sprawdzania stanu autoryzacji
  if (loading) {
    return <div>Ładowanie...</div>;
  }
  
  // Przekierowanie na stronę logowania, jeśli użytkownik nie jest zalogowany
  if (!currentUser) {
    return <Navigate to="/login" />;
  }
  
  // Jeśli użytkownik jest zalogowany, renderujemy potomne komponenty
  return children;
};

export default PrivateRoute;