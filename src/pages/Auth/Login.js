// src/pages/Auth/Login.js
import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Container,
  Box,
  Typography,
  Button,
  Paper,
  Alert
} from '@mui/material';
import {
  Google as GoogleIcon
} from '@mui/icons-material';
import { useAuth } from '../../hooks/useAuth';

const Login = () => {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  
  const { loginWithGoogle } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  
  // Sprawdź, czy jest przekierowanie
  const from = location.state?.from?.pathname || '/';

  const handleGoogleLogin = async () => {
    try {
      setLoading(true);
      await loginWithGoogle();
      navigate(from);
    } catch (err) {
      setError('Wystąpił błąd podczas logowania przez Google');
      console.error('Error during Google login:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container component="main" maxWidth="xs">
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          py: 4
        }}
      >
        <Paper elevation={3} sx={{ p: 4, width: '100%' }}>
          <Box sx={{ mb: 3, textAlign: 'center' }}>
            <Box sx={{ mb: 2, display: 'flex', justifyContent: 'center' }}>
              <img 
                src="/rotating_svg_logo.svg" 
                alt="BGW Logo" 
                style={{ height: '280px', width: 'auto' }}
              />
            </Box>
            <Typography component="h1" variant="h5">
              System BGW-MRP
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Aplikacja dostępna wyłącznie dla pracowników firmy BGW Pharma
            </Typography>
          </Box>

          {error && (
            <Alert severity="error" sx={{ mb: 3 }}>
              {error}
            </Alert>
          )}

          <Button
            fullWidth
            variant="contained"
            startIcon={<GoogleIcon />}
            onClick={handleGoogleLogin}
            disabled={loading}
            sx={{ py: 1.5 }}
          >
            {loading ? 'Logowanie...' : 'Zaloguj się przez Google'}
          </Button>
        </Paper>
      </Box>
    </Container>
  );
};

export default Login;