import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';

const AdminRoute = ({ children }) => {
  const { currentUser, loading } = useAuth();
  
  // Pokazujemy wskaźnik ładowania podczas sprawdzania stanu autoryzacji
  if (loading) {
    return <div>Ładowanie...</div>;
  }
  
  // Przekierowanie na stronę logowania, jeśli użytkownik nie jest zalogowany
  if (!currentUser) {
    return <Navigate to="/login" />;
  }
  
  // Sprawdź czy użytkownik ma rolę administratora
  const isAdmin = currentUser.role === 'administrator';
  
  // Przekierowanie na stronę główną, jeśli użytkownik nie jest administratorem
  if (!isAdmin) {
    return <Navigate to="/" />;
  }
  
  // Jeśli użytkownik jest administratorem, renderujemy potomne komponenty
  return children;
};

export default AdminRoute; 