import React, { createContext, useContext, useEffect, useState, useMemo, useCallback } from 'react';
import { createTheme, ThemeProvider as MuiThemeProvider, alpha } from '@mui/material/styles';
import { doc, updateDoc, getDoc } from 'firebase/firestore';
import { db } from '../services/firebase/config';
import { useAuth } from '../hooks/useAuth';

// Tworzenie kontekstu
export const ThemeContext = createContext();

/**
 * Common Values - Synchronizowane z design-tokens.css
 * Wartości są spójne między CSS a Material-UI Theme
 */
const commonValues = {
  // Breakpoints - zgodne z design-tokens.css
  breakpoints: {
    values: {
      xs: 0,      // --breakpoint-xs
      sm: 600,    // --breakpoint-sm
      md: 1100,   // --breakpoint-md
      lg: 1400,   // --breakpoint-lg
      xl: 1800,   // --breakpoint-xl
    },
  },
  
  // Spacing - 1 unit = 4px (zgodnie z --space-1 = 0.25rem = 4px)
  spacing: 4,
  
  // Typography - Clean Design z fontem Inter
  typography: {
    fontFamily: [
      '"Inter"',
      'Roboto',
      '-apple-system',
      'BlinkMacSystemFont',
      '"Segoe UI"',
      'sans-serif',
    ].join(','),
    fontSize: 14, // base font size (zmniejszony z 16px)
    fontWeightLight: 300,     // --font-weight-light
    fontWeightRegular: 400,   // --font-weight-normal
    fontWeightMedium: 500,    // --font-weight-medium
    fontWeightBold: 700,      // --font-weight-bold
    
    // Headings - zmniejszone rozmiary
    h1: {
      fontWeight: 700,
      fontSize: '2rem',        // 32px (było 48px)
      lineHeight: 1.25,
    },
    h2: {
      fontWeight: 600,
      fontSize: '1.75rem',     // 28px (było 36px)
      lineHeight: 1.3,
    },
    h3: {
      fontWeight: 600,
      fontSize: '1.5rem',      // 24px (było 30px)
      lineHeight: 1.35,
    },
    h4: {
      fontWeight: 600,
      fontSize: '1.25rem',     // 20px (było 24px)
      lineHeight: 1.4,
    },
    h5: {
      fontWeight: 600,
      fontSize: '1.125rem',    // 18px (było 20px)
      lineHeight: 1.4,
    },
    h6: {
      fontWeight: 600,
      fontSize: '1rem',        // 16px (było 18px)
      lineHeight: 1.4,
    },
    subtitle1: {
      fontSize: '0.9375rem',   // 15px (było 16px)
      fontWeight: 500,
      lineHeight: 1.6,
    },
    subtitle2: {
      fontSize: '0.8125rem',   // 13px (było 14px)
      fontWeight: 500,
      lineHeight: 1.6,
    },
    body1: {
      fontSize: '0.875rem',    // 14px (było 16px) - główny tekst
      lineHeight: 1.5,
    },
    body2: {
      fontSize: '0.8125rem',   // 13px (było 14px)
      lineHeight: 1.5,
    },
    caption: {
      fontSize: '0.6875rem',   // 11px (było 12px)
      lineHeight: 1.5,
    },
    button: {
      textTransform: 'none',
      fontWeight: 500,
      fontSize: '0.875rem',    // 14px (było 16px)
    },
  },
  
  // Shape - Clean Design (mniejsze zaokrąglenia)
  shape: {
    borderRadius: 8,          // Subtelniejsze zaokrąglenia
  },
  
  // Transitions - zgodne z design-tokens
  transitions: {
    easing: {
      easeInOut: 'cubic-bezier(0.4, 0, 0.2, 1)',    // --ease-in-out
      easeOut: 'cubic-bezier(0.0, 0, 0.2, 1)',       // --ease-out
      easeIn: 'cubic-bezier(0.4, 0, 1, 1)',          // --ease-in
      sharp: 'cubic-bezier(0.4, 0, 0.6, 1)',
    },
    duration: {
      shortest: 150,    // --transition-fast
      shorter: 200,
      short: 250,
      standard: 300,    // --transition-base
      complex: 375,
      slow: 500,        // --transition-slow
      enteringScreen: 225,
      leavingScreen: 195,
    },
  },
  
  // Z-Index Scale - zgodny z design-tokens
  zIndex: {
    mobileStepper: 1000,
    speedDial: 1050,
    appBar: 1100,
    drawer: 1200,
    modal: 1300,       // --z-modal
    snackbar: 1400,
    tooltip: 1500,     // --z-tooltip
  },
};

// Wspólne style komponentów dla obu motywów
const getCommonComponents = (theme) => ({
  // ✅ OPTYMALIZACJA: Warianty Box dla często używanych layoutów
  MuiBox: {
    variants: [
      {
        props: { 'data-variant': 'flex-center' },
        style: {
          display: 'flex',
          alignItems: 'center',
        },
      },
      {
        props: { 'data-variant': 'flex-between' },
        style: {
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        },
      },
      {
        props: { 'data-variant': 'flex-end' },
        style: {
          display: 'flex',
          justifyContent: 'flex-end',
          alignItems: 'center',
        },
      },
      {
        props: { 'data-variant': 'flex-column' },
        style: {
          display: 'flex',
          flexDirection: 'column',
        },
      },
      {
        props: { 'data-variant': 'loading' },
        style: {
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          padding: theme.spacing(3),
        },
      },
      {
        props: { 'data-variant': 'section-header' },
        style: {
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: theme.spacing(2),
        },
      },
      {
        props: { 'data-variant': 'action-buttons' },
        style: {
          display: 'flex',
          gap: theme.spacing(1),
          alignItems: 'center',
        },
      },
    ],
  },
  // ✅ OPTYMALIZACJA: Warianty Stack dla często używanych layoutów
  MuiStack: {
    defaultProps: {
      useFlexGap: true,
    },
  },
  // ✅ OPTYMALIZACJA: Warianty Typography dla często używanych stylów tekstu
  MuiTypography: {
    variants: [
      {
        props: { 'data-variant': 'section-title' },
        style: {
          marginBottom: theme.spacing(2),
          fontWeight: 500,
          color: theme.palette.primary.main,
        },
      },
      {
        props: { 'data-variant': 'form-label' },
        style: {
          marginBottom: theme.spacing(1),
          fontWeight: 600,
          fontSize: '0.875rem',
        },
      },
      {
        props: { 'data-variant': 'caption-bold' },
        style: {
          fontWeight: 600,
          fontSize: '0.75rem',
        },
      },
      {
        props: { 'data-variant': 'value-display' },
        style: {
          fontWeight: 700,
          fontSize: '1rem',
        },
      },
    ],
  },
  // ✅ OPTYMALIZACJA: Warianty Chip dla często używanych stylów
  MuiChip: {
    variants: [
      {
        props: { 'data-variant': 'status' },
        style: {
          fontWeight: 600,
          fontSize: '0.75rem',
          height: 28,
          borderRadius: 8,
        },
      },
      {
        props: { 'data-variant': 'tag' },
        style: {
          fontWeight: 500,
          fontSize: '0.7rem',
          height: 24,
          borderRadius: 6,
        },
      },
      {
        props: { 'data-variant': 'info' },
        style: {
          fontWeight: 500,
          fontSize: '0.75rem',
          backgroundColor: theme.palette.mode === 'dark' 
            ? 'rgba(33, 150, 243, 0.15)' 
            : 'rgba(33, 150, 243, 0.1)',
          color: theme.palette.info.main,
          border: `1px solid ${theme.palette.info.main}20`,
        },
      },
    ],
  },
  // ✅ OPTYMALIZACJA: Warianty Alert dla spójnego stylowania
  MuiAlert: {
    variants: [
      {
        props: { 'data-variant': 'compact' },
        style: {
          padding: theme.spacing(1, 2),
          '& .MuiAlert-icon': {
            padding: theme.spacing(0.5, 0),
          },
          '& .MuiAlert-message': {
            padding: theme.spacing(0.5, 0),
          },
        },
      },
    ],
  },
  // ✅ OPTYMALIZACJA: Warianty Paper dla spójnego stylowania
  MuiPaper: {
    variants: [
      {
        props: { 'data-variant': 'section' },
        style: {
          padding: theme.spacing(2),
          marginBottom: theme.spacing(3),
        },
      },
      {
        props: { 'data-variant': 'form-section' },
        style: {
          padding: theme.spacing(2),
          marginBottom: theme.spacing(2),
          backgroundColor: theme.palette.background.default,
        },
      },
    ],
  },
  MuiCssBaseline: {
    styleOverrides: {
      body: {
        scrollbarWidth: 'thin',
        position: 'relative',
        backgroundColor: theme.palette.mode === 'dark' ? '#0f172a' : '#f8fafc',
        // Animowane tło - subtelne gradienty
        '&::before': {
          content: '""',
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: -2,
          pointerEvents: 'none',
          background: theme.palette.mode === 'dark' 
            ? 'linear-gradient(135deg, rgba(15, 23, 42, 0.95) 0%, rgba(30, 41, 59, 0.9) 25%, rgba(51, 65, 85, 0.85) 50%, rgba(71, 85, 105, 0.8) 75%, rgba(30, 58, 138, 0.2) 100%)'
            : 'linear-gradient(135deg, rgba(248, 250, 252, 1) 0%, rgba(241, 245, 249, 0.95) 50%, rgba(226, 232, 240, 0.9) 100%)'
        },
        '&::after': {
          content: '""',
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: -1,
          pointerEvents: 'none',
          background: theme.palette.mode === 'dark'
            ? `radial-gradient(circle at 15% 25%, ${alpha('#3b82f6', 0.08)} 0%, transparent 50%), radial-gradient(circle at 85% 75%, ${alpha('#8b5cf6', 0.06)} 0%, transparent 50%), radial-gradient(circle at 50% 60%, ${alpha('#06b6d4', 0.05)} 0%, transparent 50%)`
            : `radial-gradient(circle at 15% 25%, ${alpha('#3b82f6', 0.04)} 0%, transparent 50%), radial-gradient(circle at 85% 75%, ${alpha('#8b5cf6', 0.03)} 0%, transparent 50%), radial-gradient(circle at 50% 60%, ${alpha('#06b6d4', 0.02)} 0%, transparent 50%)`
        },
        '&::-webkit-scrollbar': {
          width: '8px',
          height: '8px',
        },
        '&::-webkit-scrollbar-track': {
          background: theme.palette.mode === 'dark' 
            ? 'rgba(255, 255, 255, 0.03)'
            : 'rgba(0, 0, 0, 0.03)',
          borderRadius: '4px',
        },
        '&::-webkit-scrollbar-thumb': {
          backgroundColor: theme.palette.mode === 'dark' 
            ? 'rgba(255, 255, 255, 0.15)'
            : 'rgba(0, 0, 0, 0.15)',
          borderRadius: '4px',
          '&:hover': {
            backgroundColor: theme.palette.mode === 'dark' 
              ? 'rgba(255, 255, 255, 0.25)'
              : 'rgba(0, 0, 0, 0.25)',
          },
        },
      },
    },
  },
    MuiButton: {
    defaultProps: {
      disableElevation: true,
    },
      styleOverrides: {
        root: {
          textTransform: 'none',
          borderRadius: 8,
          padding: '8px 16px',
        fontWeight: 500,
        },
        contained: {
          boxShadow: 'none',
          '&:hover': {
          boxShadow: `0px 3px 6px ${
            theme.palette.mode === 'dark' 
              ? 'rgba(0, 0, 0, 0.2)' 
              : 'rgba(0, 0, 0, 0.1)'
          }`,
        },
      },
      outlined: {
        borderWidth: '1px',
        '&:hover': {
          borderWidth: '1px',
        },
      },
      text: {
        '&:hover': {
          backgroundColor: theme.palette.mode === 'dark' 
            ? alpha(theme.palette.primary.main, 0.1)
            : alpha(theme.palette.primary.main, 0.05),
        },
      },
      sizeSmall: {
        padding: '6px 12px',
        fontSize: '0.8125rem',
      },
      sizeLarge: {
        padding: '10px 20px',
        fontSize: '1rem',
      },
    },
  },
  MuiIconButton: {
    styleOverrides: {
      root: {
        borderRadius: 8,
        padding: 8,
        '&:hover': {
          backgroundColor: theme.palette.mode === 'dark' 
            ? alpha(theme.palette.common.white, 0.1)
            : alpha(theme.palette.common.black, 0.05),
        },
      },
      sizeSmall: {
        padding: 4,
        },
      },
    },
    MuiPaper: {
    defaultProps: {
      elevation: 0,
    },
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          borderRadius: 12,
        transition: theme.transitions.create(['box-shadow']),
        },
        elevation1: {
        boxShadow: theme.palette.mode === 'dark' 
          ? '0px 2px 8px rgba(0, 0, 0, 0.25)'
          : '0px 2px 8px rgba(0, 0, 0, 0.1)',
      },
      elevation2: {
        boxShadow: theme.palette.mode === 'dark' 
          ? '0px 3px 12px rgba(0, 0, 0, 0.3)'
          : '0px 3px 12px rgba(0, 0, 0, 0.12)',
      },
      elevation3: {
        boxShadow: theme.palette.mode === 'dark' 
          ? '0px 5px 16px rgba(0, 0, 0, 0.35)'
          : '0px 5px 16px rgba(0, 0, 0, 0.15)',
      },
      elevation4: {
        boxShadow: theme.palette.mode === 'dark' 
          ? '0px 7px 20px rgba(0, 0, 0, 0.4)'
          : '0px 7px 20px rgba(0, 0, 0, 0.18)',
      },
    },
  },
});

// Definicje motywów
const createDarkTheme = () => {
  const theme = createTheme({
    palette: {
      mode: 'dark',
      primary: {
        main: '#2196f3',
        light: '#64b5f6',
        dark: '#1976d2',
        contrastText: '#ffffff',
      },
      secondary: {
        main: '#f50057',
        light: '#ff4081',
        dark: '#c51162',
        contrastText: '#ffffff',
      },
      success: {
        main: '#4caf50',
        light: '#81c784',
        dark: '#388e3c',
        contrastText: '#ffffff',
      },
      error: {
        main: '#f44336',
        light: '#e57373',
        dark: '#d32f2f',
        contrastText: '#ffffff',
      },
      warning: {
        main: '#ff9800',
        light: '#ffb74d',
        dark: '#f57c00',
        contrastText: 'rgba(0, 0, 0, 0.87)',
      },
      info: {
        main: '#29b6f6',
        light: '#4fc3f7',
        dark: '#0288d1',
        contrastText: '#ffffff',
      },
      background: {
        default: '#0f172a',           // Solidne ciemne tło
        paper: '#1e293b',             // Solidny paper bez przezroczystości
        darker: '#0f172a',
        card: '#1e293b',              // Solidne tło kart
        dialog: '#1e293b',            // Solidne tło dialogów
        tooltip: '#334155',
      },
      text: {
        primary: '#f1f5f9',           // Delikatniejsza biel
        secondary: '#94a3b8',         // Stonowana szarość
        disabled: '#64748b',
      },
      divider: 'rgba(255, 255, 255, 0.08)',  // Subtelniejszy divider
      action: {
        active: '#94a3b8',
        hover: 'rgba(255, 255, 255, 0.05)',  // Delikatniejszy hover
        selected: 'rgba(255, 255, 255, 0.08)',
        disabled: '#475569',
        disabledBackground: 'rgba(255, 255, 255, 0.08)',
      },
    },
    ...commonValues,
  });

  // Stosowanie wspólnych stylów - Clean Design bez glassmorphism
  const darkComponents = {
    ...getCommonComponents(theme),
    MuiAppBar: {
      styleOverrides: {
        root: {
          boxShadow: '0 1px 0 rgba(255, 255, 255, 0.05)',  // Subtelna linia zamiast cienia
          backgroundImage: 'none',
          backgroundColor: '#1e293b',  // Solidne tło
          borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
        },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          backgroundColor: '#1e293b',  // Solidne tło
          backgroundImage: 'none',
          borderRight: '1px solid rgba(255, 255, 255, 0.06)',
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          backgroundColor: '#1e293b',  // Solidne tło
          border: '1px solid rgba(255, 255, 255, 0.06)',  // Subtelny border
          borderRadius: 8,  // Mniejsze zaokrąglenie
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.12)',  // Subtelny cień
          transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
          '&:hover': {
            borderColor: 'rgba(255, 255, 255, 0.1)',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
          },
        },
      },
    },
    // Clean Table Components
    MuiTable: {
      styleOverrides: {
        root: {
          '& .MuiTableRow-root': {
            transition: 'background-color 0.15s ease',
            '&:hover': {
              backgroundColor: 'rgba(255, 255, 255, 0.03)',
            },
          },
        },
      },
    },
    MuiTableHead: {
      styleOverrides: {
        root: {
          '& .MuiTableRow-root': {
            backgroundColor: 'rgba(255, 255, 255, 0.02)',  // Subtelne tło nagłówka
            '&:hover': {
              backgroundColor: 'rgba(255, 255, 255, 0.02)',
            },
          },
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        head: {
          fontWeight: 600,
          fontSize: '0.75rem',
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          color: '#94a3b8',
        },
        root: {
          borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
        },
      },
    },
    MuiListItem: {
      styleOverrides: {
        root: {
          borderRadius: 6,
          margin: '2px 4px',
          transition: 'background-color 0.15s ease',
          '&:hover': {
            backgroundColor: 'rgba(255, 255, 255, 0.04)',
          },
          '&.Mui-selected': {
            backgroundColor: 'rgba(59, 130, 246, 0.12)',
            '&:hover': {
              backgroundColor: 'rgba(59, 130, 246, 0.16)',
            },
          },
        },
      },
    },
    MuiSelect: {
      styleOverrides: {
        icon: {
          color: 'rgba(255, 255, 255, 0.5)',
        },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-notchedOutline': {
            borderColor: 'rgba(255, 255, 255, 0.23)',
          },
          '&:hover .MuiOutlinedInput-notchedOutline': {
            borderColor: 'rgba(255, 255, 255, 0.4)',
          },
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
            borderColor: theme.palette.primary.main,
          },
        },
      },
    },
    MuiTableContainer: {
      styleOverrides: {
        root: {
          backgroundColor: '#1e293b',  // Solidne tło
          border: '1px solid rgba(255, 255, 255, 0.06)',
          borderRadius: 8,
          overflowX: 'auto',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
        },
      },
    },
    // Clean List Components
    MuiList: {
      styleOverrides: {
        root: {
          backgroundColor: 'transparent',
          borderRadius: 8,
        },
      },
    },
    // Clean Chip Components
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 6,
          fontWeight: 500,
          fontSize: '0.75rem',
          height: 24,
          transition: 'background-color 0.15s ease',
        },
        filled: {
          backgroundColor: 'rgba(59, 130, 246, 0.15)',
          color: '#93c5fd',
          '&:hover': {
            backgroundColor: 'rgba(59, 130, 246, 0.25)',
          },
        },
        outlined: {
          borderColor: 'rgba(255, 255, 255, 0.12)',
          '&:hover': {
            backgroundColor: 'rgba(255, 255, 255, 0.04)',
          },
        },
      },
    },
    // Clean Pagination
    MuiPagination: {
      styleOverrides: {
        root: {
          '& .MuiPaginationItem-root': {
            borderRadius: 6,
            margin: '0 2px',
            transition: 'background-color 0.15s ease',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            color: '#94a3b8',
            '&:hover': {
              backgroundColor: 'rgba(255, 255, 255, 0.05)',
            },
            '&.Mui-selected': {
              backgroundColor: theme.palette.primary.main,
              color: '#ffffff',
              borderColor: 'transparent',
              '&:hover': {
                backgroundColor: theme.palette.primary.dark,
              },
            },
          },
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          backgroundColor: '#1e293b',  // Solidne tło
          backgroundImage: 'none',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          boxShadow: '0 25px 50px rgba(0, 0, 0, 0.25)',
        },
      },
    },
    MuiAutocomplete: {
      styleOverrides: {
        tag: {
          backgroundColor: 'rgba(59, 130, 246, 0.15)',
          borderRadius: 4,
        },
        paper: {
          backgroundColor: '#1e293b',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.2)',
        },
      },
    },
    MuiAlert: {
      styleOverrides: {
        root: {
          borderRadius: 6,
        },
        standardSuccess: {
          backgroundColor: 'rgba(34, 197, 94, 0.12)',
          color: '#86efac',
          border: '1px solid rgba(34, 197, 94, 0.2)',
        },
        standardError: {
          backgroundColor: 'rgba(239, 68, 68, 0.12)',
          color: '#fca5a5',
          border: '1px solid rgba(239, 68, 68, 0.2)',
        },
        standardWarning: {
          backgroundColor: 'rgba(245, 158, 11, 0.12)',
          color: '#fcd34d',
          border: '1px solid rgba(245, 158, 11, 0.2)',
        },
        standardInfo: {
          backgroundColor: 'rgba(59, 130, 246, 0.12)',
          color: '#93c5fd',
          border: '1px solid rgba(59, 130, 246, 0.2)',
        },
      },
    },
    MuiToggleButton: {
      styleOverrides: {
        root: {
          borderColor: 'rgba(255, 255, 255, 0.08)',
          color: '#94a3b8',
          borderRadius: 6,
          '&.Mui-selected': {
            backgroundColor: 'rgba(59, 130, 246, 0.15)',
            color: '#93c5fd',
            '&:hover': {
              backgroundColor: 'rgba(59, 130, 246, 0.2)',
            },
          },
        },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 500,
          minHeight: 40,
          padding: '8px 16px',
          '&.Mui-selected': {
            color: theme.palette.primary.light,
          },
        },
      },
    },
    MuiTabs: {
      styleOverrides: {
        indicator: {
          height: 2,
          borderRadius: 1,
        },
      },
    },
  };

  return createTheme({
    ...theme,
    components: darkComponents,
});
};

const createLightTheme = () => {
  const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#1976d2',
      light: '#42a5f5',
      dark: '#1565c0',
        contrastText: '#ffffff',
    },
    secondary: {
      main: '#f50057',
      light: '#ff4081',
      dark: '#c51162',
        contrastText: '#ffffff',
    },
    success: {
      main: '#4caf50',
      light: '#81c784',
      dark: '#388e3c',
        contrastText: '#ffffff',
    },
    error: {
      main: '#f44336',
      light: '#e57373',
      dark: '#d32f2f',
        contrastText: '#ffffff',
    },
    warning: {
      main: '#ff9800',
      light: '#ffb74d',
      dark: '#f57c00',
        contrastText: 'rgba(0, 0, 0, 0.87)',
    },
    info: {
      main: '#2196f3',
      light: '#64b5f6',
      dark: '#1976d2',
        contrastText: '#ffffff',
    },
    background: {
      default: '#f8fafc',           // Bardzo jasna szarość - clean
      paper: '#ffffff',             // Solidna biel
      darker: '#f1f5f9',
      card: '#ffffff',              // Solidne tło kart
      dialog: '#ffffff',            // Solidne tło dialogów
      tooltip: '#1e293b',
    },
    text: {
      primary: '#1e293b',           // Ciemniejszy tekst dla kontrastu
      secondary: '#64748b',         // Stonowana szarość
      disabled: '#94a3b8',
    },
    divider: 'rgba(0, 0, 0, 0.06)',  // Subtelniejszy divider
    action: {
      active: '#64748b',
      hover: 'rgba(0, 0, 0, 0.03)',  // Delikatniejszy hover
      selected: 'rgba(0, 0, 0, 0.05)',
      disabled: '#cbd5e1',
      disabledBackground: 'rgba(0, 0, 0, 0.04)',
    },
    },
    ...commonValues,
  });

  // Stosowanie wspólnych stylów - Clean Design dla jasnego motywu
  const lightComponents = {
    ...getCommonComponents(theme),
    MuiAppBar: {
      styleOverrides: {
        root: {
          boxShadow: '0 1px 0 rgba(0, 0, 0, 0.05)',  // Subtelna linia
          backgroundImage: 'none',
          backgroundColor: '#ffffff',  // Solidna biel
          borderBottom: '1px solid rgba(0, 0, 0, 0.06)',
          color: '#1e293b',
        },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          backgroundColor: '#ffffff',  // Solidna biel
          backgroundImage: 'none',
          borderRight: '1px solid rgba(0, 0, 0, 0.06)',
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          backgroundColor: '#ffffff',  // Solidna biel
          border: '1px solid rgba(0, 0, 0, 0.06)',  // Subtelny border
          borderRadius: 8,
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.06)',  // Subtelny cień
          transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
          '&:hover': {
            borderColor: 'rgba(0, 0, 0, 0.1)',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
          },
        },
      },
    },
    // Clean Table Components
    MuiTable: {
      styleOverrides: {
        root: {
          '& .MuiTableRow-root': {
            transition: 'background-color 0.15s ease',
            '&:hover': {
              backgroundColor: 'rgba(0, 0, 0, 0.02)',
            },
          },
        },
      },
    },
    MuiTableHead: {
      styleOverrides: {
        root: {
          '& .MuiTableRow-root': {
            backgroundColor: '#f8fafc',  // Delikatne tło nagłówka
            '&:hover': {
              backgroundColor: '#f8fafc',
            },
          },
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        head: {
          fontWeight: 600,
          fontSize: '0.75rem',
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          color: '#64748b',
        },
        root: {
          borderBottom: '1px solid rgba(0, 0, 0, 0.06)',
        },
      },
    },
    MuiListItem: {
      styleOverrides: {
        root: {
          borderRadius: 6,
          margin: '2px 4px',
          transition: 'background-color 0.15s ease',
          '&:hover': {
            backgroundColor: 'rgba(0, 0, 0, 0.03)',
          },
          '&.Mui-selected': {
            backgroundColor: 'rgba(25, 118, 210, 0.08)',
            '&:hover': {
              backgroundColor: 'rgba(25, 118, 210, 0.12)',
            },
          },
        },
      },
    },
    MuiSelect: {
      styleOverrides: {
        icon: {
          color: 'rgba(0, 0, 0, 0.54)',
        },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-notchedOutline': {
            borderColor: 'rgba(0, 0, 0, 0.23)',
          },
          '&:hover .MuiOutlinedInput-notchedOutline': {
            borderColor: 'rgba(0, 0, 0, 0.4)',
          },
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
            borderColor: theme.palette.primary.main,
          },
        },
      },
    },
    MuiTableContainer: {
      styleOverrides: {
        root: {
          backgroundColor: '#ffffff',  // Solidna biel
          border: '1px solid rgba(0, 0, 0, 0.06)',
          borderRadius: 8,
          overflowX: 'auto',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
        },
      },
    },
    // Clean List Components
    MuiList: {
      styleOverrides: {
        root: {
          backgroundColor: 'transparent',
          borderRadius: 8,
        },
      },
    },
    // Clean Chip Components
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 6,
          fontWeight: 500,
          fontSize: '0.75rem',
          height: 24,
          transition: 'background-color 0.15s ease',
        },
        filled: {
          backgroundColor: 'rgba(25, 118, 210, 0.1)',
          color: theme.palette.primary.dark,
          '&:hover': {
            backgroundColor: 'rgba(25, 118, 210, 0.16)',
          },
        },
        outlined: {
          borderColor: 'rgba(0, 0, 0, 0.12)',
          '&:hover': {
            backgroundColor: 'rgba(0, 0, 0, 0.03)',
          },
        },
      },
    },
    // Clean Pagination
    MuiPagination: {
      styleOverrides: {
        root: {
          '& .MuiPaginationItem-root': {
            borderRadius: 6,
            margin: '0 2px',
            transition: 'background-color 0.15s ease',
            border: '1px solid rgba(0, 0, 0, 0.08)',
            color: '#64748b',
            '&:hover': {
              backgroundColor: 'rgba(0, 0, 0, 0.03)',
            },
            '&.Mui-selected': {
              backgroundColor: theme.palette.primary.main,
              color: '#ffffff',
              borderColor: 'transparent',
              '&:hover': {
                backgroundColor: theme.palette.primary.dark,
              },
            },
          },
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          backgroundColor: '#ffffff',  // Solidna biel
          backgroundImage: 'none',
          border: '1px solid rgba(0, 0, 0, 0.06)',
          boxShadow: '0 25px 50px rgba(0, 0, 0, 0.12)',
        },
      },
    },
    MuiAutocomplete: {
      styleOverrides: {
        tag: {
          backgroundColor: 'rgba(25, 118, 210, 0.1)',
          borderRadius: 4,
        },
        paper: {
          backgroundColor: '#ffffff',
          border: '1px solid rgba(0, 0, 0, 0.08)',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.1)',
        },
      },
    },
    MuiAlert: {
      styleOverrides: {
        root: {
          borderRadius: 6,
        },
        standardSuccess: {
          backgroundColor: 'rgba(34, 197, 94, 0.1)',
          color: '#166534',
          border: '1px solid rgba(34, 197, 94, 0.2)',
        },
        standardError: {
          backgroundColor: 'rgba(239, 68, 68, 0.1)',
          color: '#b91c1c',
          border: '1px solid rgba(239, 68, 68, 0.2)',
        },
        standardWarning: {
          backgroundColor: 'rgba(245, 158, 11, 0.1)',
          color: '#b45309',
          border: '1px solid rgba(245, 158, 11, 0.2)',
        },
        standardInfo: {
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          color: '#1d4ed8',
          border: '1px solid rgba(59, 130, 246, 0.2)',
        },
      },
    },
    MuiToggleButton: {
      styleOverrides: {
        root: {
          borderColor: 'rgba(0, 0, 0, 0.08)',
          color: '#64748b',
          borderRadius: 6,
          '&.Mui-selected': {
            backgroundColor: 'rgba(25, 118, 210, 0.1)',
            color: theme.palette.primary.main,
            '&:hover': {
              backgroundColor: 'rgba(25, 118, 210, 0.16)',
            },
          },
        },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 500,
          minHeight: 40,
          padding: '8px 16px',
          '&.Mui-selected': {
            color: theme.palette.primary.main,
          },
        },
      },
    },
    MuiTabs: {
      styleOverrides: {
        indicator: {
          height: 2,
          borderRadius: 1,
        },
      },
    },
  };

  return createTheme({
    ...theme,
    components: lightComponents,
});
};

export const ThemeProvider = ({ children }) => {
  const auth = useAuth();
  const currentUser = auth?.currentUser;
  const [mode, setMode] = useState('light'); // zmiana domyślnego motywu na jasny
  const [theme, setTheme] = useState(createLightTheme());

  // Pobieranie preferencji z lokalnego storage przy starcie
  useEffect(() => {
    const savedMode = localStorage.getItem('themeMode');
    if (savedMode) {
      setMode(savedMode);
      setTheme(savedMode === 'light' ? createLightTheme() : createDarkTheme());
      // Aktualizacja atrybutu data-theme
      document.documentElement.setAttribute('data-theme', savedMode);
      
      // Dodaj lub usuń klasę dark-mode z body
      if (savedMode === 'dark') {
        document.body.classList.add('dark-mode');
      } else {
        document.body.classList.remove('dark-mode');
      }
    }
  }, []);

  // Pobieranie preferencji użytkownika z Firebase po zalogowaniu
  useEffect(() => {
    const fetchUserTheme = async () => {
      if (currentUser) {
        try {
          const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
          if (userDoc.exists()) {
            const userData = userDoc.data();
            if (userData.themeMode) {
              setMode(userData.themeMode);
              setTheme(userData.themeMode === 'light' ? createLightTheme() : createDarkTheme());
              // Aktualizujemy również lokalne storage
              localStorage.setItem('themeMode', userData.themeMode);
              // Aktualizacja atrybutu data-theme
              document.documentElement.setAttribute('data-theme', userData.themeMode);
              
              // Dodaj lub usuń klasę dark-mode z body
              if (userData.themeMode === 'dark') {
                document.body.classList.add('dark-mode');
              } else {
                document.body.classList.remove('dark-mode');
              }
            }
          }
        } catch (error) {
          console.error('Błąd podczas pobierania preferencji motywu:', error);
        }
      }
    };

    if (currentUser) {
      fetchUserTheme();
    }
  }, [currentUser]);

  // ⚡ OPTYMALIZACJA: useCallback zapobiega recreating funkcji przy każdym renderze
  const toggleTheme = useCallback(async () => {
    const newMode = mode === 'light' ? 'dark' : 'light';
    setMode(newMode);
    setTheme(newMode === 'light' ? createLightTheme() : createDarkTheme());
    
    // Zapisz w lokalnym storage
    localStorage.setItem('themeMode', newMode);
    
    // Aktualizuj atrybut data-theme w elemencie HTML
    document.documentElement.setAttribute('data-theme', newMode);
    document.documentElement.classList.add('theme-transition');
    
    // Dodaj lub usuń klasę dark-mode z body
    if (newMode === 'dark') {
      document.body.classList.add('dark-mode');
    } else {
      document.body.classList.remove('dark-mode');
    }

    // Zapisz w profilu użytkownika, jeśli jest zalogowany
    if (auth?.currentUser) {
      try {
        await updateDoc(doc(db, 'users', auth.currentUser.uid), {
          themeMode: newMode,
          updatedAt: new Date()
        });
      } catch (error) {
        console.error('Błąd podczas zapisywania preferencji motywu:', error);
      }
    }
  }, [mode, auth]);

  // ⚡ OPTYMALIZACJA: Memoizuj wartość kontekstu aby uniknąć niepotrzebnych rerenderów
  const contextValue = useMemo(() => ({ mode, toggleTheme }), [mode, toggleTheme]);

  return (
    <ThemeContext.Provider value={contextValue}>
      <MuiThemeProvider theme={theme}>
        {children}
      </MuiThemeProvider>
    </ThemeContext.Provider>
  );
};

// Hook ułatwiający korzystanie z kontekstu motywu
export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}; 