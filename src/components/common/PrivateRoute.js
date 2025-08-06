// src/components/common/PrivateRoute.js
import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import LoadingScreen from './LoadingScreen';

const PrivateRoute = ({ children }) => {
  const { currentUser, loading } = useAuth();
  
  // Pokazujemy wskaźnik ładowania podczas sprawdzania stanu autoryzacji
  if (loading) {
    return (
      <LoadingScreen 
        message="Sprawdzanie autoryzacji..." 
        fullScreen={true}
      />
    );
  }
  
  // Przekierowanie na stronę logowania, jeśli użytkownik nie jest zalogowany
  if (!currentUser) {
    return <Navigate to="/login" />;
  }
  
  // Jeśli użytkownik jest zalogowany, renderujemy potomne komponenty
  return children;
};

export default PrivateRoute;