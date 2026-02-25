import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { usePermissions } from '../../hooks/usePermissions';
import LoadingScreen from './LoadingScreen';

/**
 * Komponent ochrony tras na podstawie uprawnień użytkownika.
 * Administratorzy mają automatycznie wszystkie uprawnienia.
 * Pracownicy bez wymaganego uprawnienia są przekierowywani na stronę główną.
 */
const PermissionRoute = ({ permission, children }) => {
  const { currentUser, loading: authLoading } = useAuth();
  const { hasPermission, loading: permLoading } = usePermissions();

  if (authLoading || permLoading) {
    return <LoadingScreen message="Sprawdzanie uprawnień..." fullScreen={true} />;
  }

  if (!currentUser) {
    return <Navigate to="/login" />;
  }

  if (!hasPermission(permission)) {
    return <Navigate to="/" />;
  }

  return children;
};

export default PermissionRoute;
