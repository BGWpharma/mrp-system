// src/pages/Auth/Login.js
import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Container,
  Box,
  Typography,
  Button,
  Paper,
  Alert,
  Fade,
  Zoom
} from '@mui/material';
import {
  Google as GoogleIcon
} from '@mui/icons-material';
import { useAuth } from '../../hooks/useAuth';
import { useTheme } from '../../contexts/ThemeContext';

const Login = () => {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showContent, setShowContent] = useState(false);
  
  const { loginWithGoogle } = useAuth();
  const { mode } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  
  const from = location.state?.from?.pathname || '/';

  // Entry animation
  React.useEffect(() => {
    const timer = setTimeout(() => setShowContent(true), 100);
    return () => clearTimeout(timer);
  }, []);

  const handleGoogleLogin = async () => {
    try {
      setLoading(true);
      await loginWithGoogle();
      navigate(from);
    } catch (err) {
      setError('An error occurred while signing in with Google');
      console.error('Error during Google login:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        background: mode === 'dark' 
          ? 'linear-gradient(135deg, rgba(15, 23, 42, 0.95) 0%, rgba(30, 41, 59, 0.9) 25%, rgba(51, 65, 85, 0.85) 50%, rgba(71, 85, 105, 0.8) 75%, rgba(30, 58, 138, 0.95) 100%)'
          : 'linear-gradient(135deg, rgba(236, 254, 255, 0.9) 0%, rgba(219, 234, 254, 0.8) 25%, rgba(165, 180, 252, 0.7) 50%, rgba(129, 140, 248, 0.8) 75%, rgba(99, 102, 241, 0.9) 100%)',
        '&::before': {
          content: '""',
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: mode === 'dark'
            ? `radial-gradient(circle at 20% 30%, rgba(59, 130, 246, 0.2) 0%, transparent 50%), 
               radial-gradient(circle at 80% 70%, rgba(139, 92, 246, 0.15) 0%, transparent 50%), 
               radial-gradient(circle at 40% 80%, rgba(6, 182, 212, 0.1) 0%, transparent 50%)`
            : `radial-gradient(circle at 20% 30%, rgba(59, 130, 246, 0.15) 0%, transparent 50%), 
               radial-gradient(circle at 80% 70%, rgba(139, 92, 246, 0.1) 0%, transparent 50%), 
               radial-gradient(circle at 40% 80%, rgba(6, 182, 212, 0.08) 0%, transparent 50%)`,
          animation: 'float 6s ease-in-out infinite',
          '@keyframes float': {
            '0%, 100%': { transform: 'translateY(0px)' },
            '50%': { transform: 'translateY(-20px)' }
          }
        },
        '&::after': {
          content: '""',
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: mode === 'dark'
            ? `radial-gradient(circle at 60% 20%, rgba(139, 92, 246, 0.1) 0%, transparent 50%), 
               radial-gradient(circle at 30% 90%, rgba(59, 130, 246, 0.08) 0%, transparent 50%)`
            : `radial-gradient(circle at 60% 20%, rgba(139, 92, 246, 0.08) 0%, transparent 50%), 
               radial-gradient(circle at 30% 90%, rgba(59, 130, 246, 0.06) 0%, transparent 50%)`,
          animation: 'float 8s ease-in-out infinite reverse',
        }
      }}
    >
      <Container component="main" maxWidth="sm" sx={{ position: 'relative', zIndex: 1 }}>
        <Fade in={showContent} timeout={800}>
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              py: 4
            }}
          >
            <Zoom in={showContent} timeout={1000} style={{ transitionDelay: '200ms' }}>
              <Paper 
                elevation={0}
                sx={{ 
                  p: { xs: 3, sm: 5 },
                  width: '100%',
                  maxWidth: 480,
                  background: mode === 'dark'
                    ? 'rgba(30, 41, 59, 0.85)'
                    : 'rgba(255, 255, 255, 0.85)',
                  backdropFilter: 'blur(20px) saturate(180%)',
                  border: mode === 'dark' 
                    ? '1px solid rgba(59, 130, 246, 0.2)'
                    : '1px solid rgba(255, 255, 255, 0.3)',
                  borderRadius: 4,
                  boxShadow: mode === 'dark'
                    ? '0 20px 40px rgba(0, 0, 0, 0.4), 0 1px 0px rgba(255, 255, 255, 0.1) inset'
                    : '0 20px 40px rgba(59, 130, 246, 0.15), 0 1px 0px rgba(255, 255, 255, 0.8) inset',
                  position: 'relative',
                  overflow: 'hidden',
                  '&::before': {
                    content: '""',
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: mode === 'dark'
                      ? 'linear-gradient(135deg, rgba(255, 255, 255, 0.05) 0%, transparent 50%, rgba(255, 255, 255, 0.02) 100%)'
                      : 'linear-gradient(135deg, rgba(255, 255, 255, 0.8) 0%, transparent 50%, rgba(255, 255, 255, 0.4) 100%)',
                    pointerEvents: 'none',
                  }
                }}
              >
                <Box sx={{ mb: 4, textAlign: 'center', position: 'relative', zIndex: 1 }}>
                  <Zoom in={showContent} timeout={1200} style={{ transitionDelay: '400ms' }}>
                    <Box 
                      sx={{ 
                        mb: 3, 
                        display: 'flex', 
                        justifyContent: 'center',
                        '& img': {
                          height: { xs: '200px', sm: '280px' },
                          width: 'auto',
                          filter: 'drop-shadow(0 10px 20px rgba(59, 130, 246, 0.2))',
                          animation: 'logoFloat 4s ease-in-out infinite',
                          '@keyframes logoFloat': {
                            '0%, 100%': { transform: 'translateY(0px) rotate(0deg)' },
                            '50%': { transform: 'translateY(-10px) rotate(2deg)' }
                          }
                        }
                      }}
                    >
                      <img 
                        src="/rotating_svg_logo.svg" 
                        alt="BGW Logo" 
                      />
                    </Box>
                  </Zoom>
                  <Fade in={showContent} timeout={1000} style={{ transitionDelay: '600ms' }}>
                    <Typography 
                      component="h1" 
                      variant="h4"
                      sx={{
                        fontWeight: 700,
                        background: mode === 'dark'
                          ? 'linear-gradient(135deg, #3b82f6, #8b5cf6)'
                          : 'linear-gradient(135deg, #1976d2, #7c3aed)',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                        backgroundClip: 'text',
                        mb: 2,
                        textShadow: mode === 'dark' 
                          ? '0 0 30px rgba(59, 130, 246, 0.3)'
                          : '0 0 20px rgba(25, 118, 210, 0.2)',
                      }}
                    >
                      System BGW-MRP
                    </Typography>
                  </Fade>
                  <Fade in={showContent} timeout={1000} style={{ transitionDelay: '800ms' }}>
                    <Typography 
                      variant="body1" 
                      color="text.secondary" 
                      sx={{ 
                        mt: 1,
                        fontSize: '1.1rem',
                        fontWeight: 500,
                        opacity: 0.8
                      }}
                    >
                      Application available exclusively for BGW Pharma employees
                    </Typography>
                  </Fade>
                </Box>

                <Fade in={showContent} timeout={1000} style={{ transitionDelay: '1000ms' }}>
                  <Box sx={{ position: 'relative', zIndex: 1 }}>
                    {error && (
                      <Zoom in={!!error} timeout={500}>
                        <Alert 
                          severity="error" 
                          sx={{ 
                            mb: 3,
                            backdropFilter: 'blur(10px)',
                            background: mode === 'dark' 
                              ? 'rgba(239, 68, 68, 0.1)'
                              : 'rgba(239, 68, 68, 0.08)',
                            border: '1px solid rgba(239, 68, 68, 0.2)',
                            borderRadius: 2
                          }}
                        >
                          {error}
                        </Alert>
                      </Zoom>
                    )}

                    <Button
                      fullWidth
                      variant="contained"
                      size="large"
                      startIcon={<GoogleIcon />}
                      onClick={handleGoogleLogin}
                      disabled={loading}
                      sx={{ 
                        py: 1.8,
                        px: 3,
                        fontSize: '1.1rem',
                        fontWeight: 600,
                        borderRadius: 3,
                        background: 'linear-gradient(135deg, #2196f3 0%, #1976d2 100%)',
                        boxShadow: '0 8px 24px rgba(33, 150, 243, 0.4)',
                        backdropFilter: 'blur(10px)',
                        border: 'none',
                        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                        '&:hover': {
                          background: 'linear-gradient(135deg, #1976d2 0%, #1565c0 100%)',
                          boxShadow: '0 12px 32px rgba(33, 150, 243, 0.6)',
                          transform: 'translateY(-3px)',
                        },
                        '&:active': {
                          transform: 'translateY(-1px)',
                        },
                        '&:disabled': {
                          background: mode === 'dark' 
                            ? 'rgba(255, 255, 255, 0.1)'
                            : 'rgba(0, 0, 0, 0.1)',
                          boxShadow: 'none',
                          transform: 'none',
                        }
                      }}
                    >
                      {loading ? 'Signing in...' : 'Sign in with Google'}
                    </Button>
                  </Box>
                </Fade>
              </Paper>
            </Zoom>
          </Box>
        </Fade>
      </Container>
    </Box>
  );
};

export default Login;