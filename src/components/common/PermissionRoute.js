import React from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Box, Typography, Button } from '@mui/material';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import { useAuth } from '../../hooks/useAuth';
import { usePermissions } from '../../hooks/usePermissions';
import LoadingScreen from './LoadingScreen';

/**
 * Komponent ochrony tras na podstawie uprawnień użytkownika.
 * Administratorzy mają automatycznie wszystkie uprawnienia.
 * Pracownicy bez wymaganego uprawnienia widzą stronę z informacją o braku dostępu.
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
    return <AccessDenied />;
  }

  return children;
};

const AccessDenied = () => {
  const navigate = useNavigate();

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', gap: 2, p: 3 }}>
      <LockOutlinedIcon sx={{ fontSize: 64, color: 'text.disabled' }} />
      <Typography variant="h5" color="text.secondary" fontWeight={600}>
        Brak dostępu
      </Typography>
      <Typography variant="body1" color="text.disabled" textAlign="center" maxWidth={400}>
        Nie masz uprawnień do tej sekcji. Skontaktuj się z administratorem, aby uzyskać dostęp.
      </Typography>
      <Button variant="outlined" onClick={() => navigate(-1)} sx={{ mt: 1 }}>
        Wróć
      </Button>
    </Box>
  );
};

export default PermissionRoute;
