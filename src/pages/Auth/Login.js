// src/pages/Auth/Login.js
import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import {
  Container,
  Box,
  Typography,
  TextField,
  Button,
  Paper,
  Divider,
  Alert,
  IconButton,
  InputAdornment
} from '@mui/material';
import {
  Google as GoogleIcon,
  Visibility,
  VisibilityOff
} from '@mui/icons-material';
import { useAuth } from '../../hooks/useAuth';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  
  const { login, loginWithGoogle } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  
  // Sprawdź, czy jest przekierowanie
  const from = location.state?.from?.pathname || '/';

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    
    if (!email || !password) {
      setError('Wprowadź email i hasło');
      return;
    }
    
    try {
      setLoading(true);
      await login(email, password);
      navigate(from);
    } catch (err) {
      setError(
        err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password'
          ? 'Nieprawidłowy email lub hasło'
          : err.code === 'auth/too-many-requests'
          ? 'Zbyt wiele nieudanych prób logowania. Spróbuj ponownie później'
          : 'Wystąpił błąd podczas logowania. Spróbuj ponownie'
      );
      console.error('Error during login:', err);
    } finally {
      setLoading(false);
    }
  };

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
            <Typography component="h1" variant="h5">
              System MRP
            </Typography>
            <Typography variant="subtitle1" color="text.secondary">
              Zaloguj się, aby kontynuować
            </Typography>
          </Box>

          {error && (
            <Alert severity="error" sx={{ mb: 3 }}>
              {error}
            </Alert>
          )}

          <Box component="form" onSubmit={handleLogin} noValidate>
            <TextField
              margin="normal"
              required
              fullWidth
              id="email"
              label="Adres email"
              name="email"
              autoComplete="email"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
            />
            <TextField
              margin="normal"
              required
              fullWidth
              name="password"
              label="Hasło"
              type={showPassword ? 'text' : 'password'}
              id="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      aria-label="toggle password visibility"
                      onClick={() => setShowPassword(!showPassword)}
                      edge="end"
                    >
                      {showPassword ? <VisibilityOff /> : <Visibility />}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />
            <Button
              type="submit"
              fullWidth
              variant="contained"
              sx={{ mt: 3, mb: 2 }}
              disabled={loading}
            >
              {loading ? 'Logowanie...' : 'Zaloguj się'}
            </Button>
          </Box>

          <Divider sx={{ my: 2 }}>lub</Divider>

          <Button
            fullWidth
            variant="outlined"
            startIcon={<GoogleIcon />}
            onClick={handleGoogleLogin}
            disabled={loading}
          >
            Zaloguj się przez Google
          </Button>

          <Box sx={{ mt: 3, textAlign: 'center' }}>
            <Typography variant="body2">
              Nie masz konta?{' '}
              <Link to="/register" style={{ textDecoration: 'none' }}>
                Zarejestruj się
              </Link>
            </Typography>
          </Box>
        </Paper>
      </Box>
    </Container>
  );
};

export default Login;