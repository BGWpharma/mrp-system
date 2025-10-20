// src/index.js
import React from 'react';
import { createRoot } from 'react-dom/client';
import CssBaseline from '@mui/material/CssBaseline';
import { ThemeProvider } from './contexts/ThemeContext';
import { AuthProvider } from './contexts/AuthContext';
import App from './App';
import './assets/styles/global.css';
import './styles/enhancements.css';

const root = createRoot(document.getElementById('root'));

root.render(
  <React.StrictMode>
    <ThemeProvider>
      <AuthProvider>
        <CssBaseline />
        <App />
      </AuthProvider>
    </ThemeProvider>
  </React.StrictMode>
);