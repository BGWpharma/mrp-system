import React, { createContext, useContext, useEffect, useState, useMemo, useCallback } from 'react';
import { createTheme, ThemeProvider as MuiThemeProvider, alpha } from '@mui/material/styles';
import { doc, updateDoc, getDoc } from 'firebase/firestore';
import { db } from '../services/firebase/config';
import { useAuth } from '../hooks/useAuth';

// Tworzenie kontekstu
export const ThemeContext = createContext();

/**
 * Common Values — shared across light and dark themes
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
      fontSize: '0.75rem',     // 12px
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
      {
        props: { 'data-variant': 'page-container' },
        style: {
          paddingTop: theme.spacing(6),
          paddingBottom: theme.spacing(4),
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
      {
        props: { 'data-variant': 'page-title' },
        style: {
          fontWeight: 600,
          fontSize: '1.25rem',
          marginBottom: theme.spacing(2),
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
  MuiCssBaseline: {
    styleOverrides: {
      body: {
        scrollbarWidth: 'thin',
        position: 'relative',
        backgroundColor: theme.palette.background.default,
      },
    },
  },
    // =============================================
    // MuiButton - Clean Design (globalne style)
    // =============================================
    MuiButton: {
      defaultProps: {
        disableElevation: true,
      },
      styleOverrides: {
        root: {
          textTransform: 'none',
          borderRadius: 6,
          fontWeight: 500,
          fontSize: '0.875rem',
          lineHeight: 1.5,
          // Clean Design - szybkie, subtelne transitions
          transition: 'background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease',
          '&:focus-visible': {
            outline: 'none',
            boxShadow: `0 0 0 3px ${alpha(theme.palette.primary.main, 0.2)}`,
          },
        },
        // Contained - solidne tło
        contained: {
          padding: '8px 16px',
          boxShadow: 'none',
          '&:hover': {
            boxShadow: 'none',
          },
          '&:active': {
            boxShadow: 'none',
          },
          '&.Mui-disabled': {
            backgroundColor: theme.palette.mode === 'dark' 
              ? 'rgba(255, 255, 255, 0.12)' 
              : 'rgba(0, 0, 0, 0.12)',
            color: theme.palette.mode === 'dark' 
              ? 'rgba(255, 255, 255, 0.3)' 
              : 'rgba(0, 0, 0, 0.26)',
          },
        },
        containedPrimary: {
          backgroundColor: theme.palette.primary.main,
          '&:hover': {
            backgroundColor: theme.palette.primary.dark,
          },
        },
        containedSecondary: {
          backgroundColor: theme.palette.secondary.main,
          '&:hover': {
            backgroundColor: theme.palette.secondary.dark,
          },
        },
        containedSuccess: {
          backgroundColor: theme.palette.success.main,
          color: '#ffffff',
          '&:hover': {
            backgroundColor: theme.palette.success.dark,
          },
        },
        containedError: {
          backgroundColor: theme.palette.error.main,
          color: '#ffffff',
          '&:hover': {
            backgroundColor: theme.palette.error.dark,
          },
        },
        containedWarning: {
          backgroundColor: theme.palette.warning.main,
          color: 'rgba(0, 0, 0, 0.87)',
          '&:hover': {
            backgroundColor: theme.palette.warning.dark,
          },
        },
        containedInfo: {
          backgroundColor: theme.palette.info.main,
          color: '#ffffff',
          '&:hover': {
            backgroundColor: theme.palette.info.dark,
          },
        },
        // Outlined - przezroczyste z ramką
        outlined: {
          padding: '7px 15px',
          borderWidth: '1px',
          borderColor: theme.palette.mode === 'dark' 
            ? 'rgba(255, 255, 255, 0.23)' 
            : 'rgba(0, 0, 0, 0.23)',
          '&:hover': {
            borderWidth: '1px',
            backgroundColor: theme.palette.mode === 'dark' 
              ? 'rgba(255, 255, 255, 0.05)' 
              : 'rgba(0, 0, 0, 0.04)',
          },
          '&.Mui-disabled': {
            borderColor: theme.palette.mode === 'dark' 
              ? 'rgba(255, 255, 255, 0.12)' 
              : 'rgba(0, 0, 0, 0.12)',
          },
        },
        outlinedPrimary: {
          borderColor: alpha(theme.palette.primary.main, 0.5),
          '&:hover': {
            borderColor: theme.palette.primary.main,
            backgroundColor: alpha(theme.palette.primary.main, 0.08),
          },
        },
        outlinedSecondary: {
          borderColor: alpha(theme.palette.secondary.main, 0.5),
          '&:hover': {
            borderColor: theme.palette.secondary.main,
            backgroundColor: alpha(theme.palette.secondary.main, 0.08),
          },
        },
        outlinedSuccess: {
          color: theme.palette.success.main,
          borderColor: alpha(theme.palette.success.main, 0.5),
          '&:hover': {
            borderColor: theme.palette.success.main,
            backgroundColor: alpha(theme.palette.success.main, 0.08),
          },
        },
        outlinedError: {
          color: theme.palette.error.main,
          borderColor: alpha(theme.palette.error.main, 0.5),
          '&:hover': {
            borderColor: theme.palette.error.main,
            backgroundColor: alpha(theme.palette.error.main, 0.08),
          },
        },
        outlinedWarning: {
          color: theme.palette.warning.main,
          borderColor: alpha(theme.palette.warning.main, 0.5),
          '&:hover': {
            borderColor: theme.palette.warning.main,
            backgroundColor: alpha(theme.palette.warning.main, 0.08),
          },
        },
        outlinedInfo: {
          color: theme.palette.info.main,
          borderColor: alpha(theme.palette.info.main, 0.5),
          '&:hover': {
            borderColor: theme.palette.info.main,
            backgroundColor: alpha(theme.palette.info.main, 0.08),
          },
        },
        // Text - tylko tekst bez ramki
        text: {
          padding: '8px 12px',
          '&:hover': {
            backgroundColor: theme.palette.mode === 'dark' 
              ? 'rgba(255, 255, 255, 0.05)' 
              : 'rgba(0, 0, 0, 0.04)',
          },
        },
        textPrimary: {
          '&:hover': {
            backgroundColor: alpha(theme.palette.primary.main, 0.08),
          },
        },
        textSecondary: {
          '&:hover': {
            backgroundColor: alpha(theme.palette.secondary.main, 0.08),
          },
        },
        textSuccess: {
          color: theme.palette.success.main,
          '&:hover': {
            backgroundColor: alpha(theme.palette.success.main, 0.08),
          },
        },
        textError: {
          color: theme.palette.error.main,
          '&:hover': {
            backgroundColor: alpha(theme.palette.error.main, 0.08),
          },
        },
        textWarning: {
          color: theme.palette.warning.main,
          '&:hover': {
            backgroundColor: alpha(theme.palette.warning.main, 0.08),
          },
        },
        textInfo: {
          color: theme.palette.info.main,
          '&:hover': {
            backgroundColor: alpha(theme.palette.info.main, 0.08),
          },
        },
        // Rozmiary
        sizeSmall: {
          padding: '4px 10px',
          fontSize: '0.8125rem',
          borderRadius: 4,
        },
        sizeMedium: {
          padding: '6px 14px',
        },
        sizeLarge: {
          padding: '10px 22px',
          fontSize: '0.9375rem',
          borderRadius: 8,
        },
        // Ikona start/end
        startIcon: {
          marginRight: 6,
          '& > *:first-of-type': {
            fontSize: 18,
          },
        },
        endIcon: {
          marginLeft: 6,
          '& > *:first-of-type': {
            fontSize: 18,
          },
        },
      },
    },
    
    // =============================================
    // MuiIconButton - Clean Design (globalne style)
    // =============================================
    MuiIconButton: {
      styleOverrides: {
        root: {
          borderRadius: 6,
          padding: 8,
          transition: 'background-color 0.15s ease',
          '&:hover': {
            backgroundColor: theme.palette.mode === 'dark' 
              ? 'rgba(255, 255, 255, 0.08)' 
              : 'rgba(0, 0, 0, 0.04)',
          },
          '&:focus-visible': {
            outline: 'none',
            boxShadow: `0 0 0 3px ${alpha(theme.palette.primary.main, 0.2)}`,
          },
          '&.Mui-disabled': {
            color: theme.palette.mode === 'dark' 
              ? 'rgba(255, 255, 255, 0.3)' 
              : 'rgba(0, 0, 0, 0.26)',
          },
        },
        sizeSmall: {
          padding: 4,
          borderRadius: 4,
        },
        sizeLarge: {
          padding: 12,
          borderRadius: 8,
        },
        colorPrimary: {
          '&:hover': {
            backgroundColor: alpha(theme.palette.primary.main, 0.08),
          },
        },
        colorSecondary: {
          '&:hover': {
            backgroundColor: alpha(theme.palette.secondary.main, 0.08),
          },
        },
        colorError: {
          '&:hover': {
            backgroundColor: alpha(theme.palette.error.main, 0.08),
          },
        },
        colorSuccess: {
          '&:hover': {
            backgroundColor: alpha(theme.palette.success.main, 0.08),
          },
        },
        colorWarning: {
          '&:hover': {
            backgroundColor: alpha(theme.palette.warning.main, 0.08),
          },
        },
        colorInfo: {
          '&:hover': {
            backgroundColor: alpha(theme.palette.info.main, 0.08),
          },
        },
      },
    },
    MuiPaper: {
      defaultProps: {
        elevation: 0,
      },
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
        {
          props: { 'data-variant': 'card-hover' },
          style: {
            transition: 'box-shadow 0.2s ease, border-color 0.2s ease',
            '&:hover': {
              boxShadow: theme.palette.mode === 'dark'
                ? '0 8px 25px rgba(0,0,0,0.25)'
                : '0 8px 25px rgba(0,0,0,0.1)',
            },
          },
        },
      ],
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          borderRadius: 8,
          transition: theme.transitions.create(['box-shadow']),
        },
        elevation1: {
          boxShadow: theme.palette.mode === 'dark'
            ? '0 1px 3px rgba(0,0,0,0.2), 0 1px 2px rgba(0,0,0,0.12)'
            : '0 1px 3px rgba(0,0,0,0.1), 0 1px 2px rgba(0,0,0,0.06)',
        },
        elevation2: {
          boxShadow: theme.palette.mode === 'dark'
            ? '0 4px 6px rgba(0,0,0,0.15), 0 2px 4px rgba(0,0,0,0.12)'
            : '0 4px 6px rgba(0,0,0,0.07), 0 2px 4px rgba(0,0,0,0.06)',
        },
        elevation3: {
          boxShadow: theme.palette.mode === 'dark'
            ? '0 10px 15px rgba(0,0,0,0.2), 0 4px 6px rgba(0,0,0,0.1)'
            : '0 10px 15px rgba(0,0,0,0.1), 0 4px 6px rgba(0,0,0,0.05)',
        },
        elevation4: {
          boxShadow: theme.palette.mode === 'dark'
            ? '0 20px 25px rgba(0,0,0,0.25), 0 8px 10px rgba(0,0,0,0.1)'
            : '0 20px 25px rgba(0,0,0,0.1), 0 8px 10px rgba(0,0,0,0.04)',
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
        main: '#3b82f6',
        light: '#60a5fa',
        dark: '#2563eb',
        contrastText: '#ffffff',
      },
      secondary: {
        main: '#f50057',
        light: '#ff4081',
        dark: '#c51162',
        contrastText: '#ffffff',
      },
      success: {
        main: '#22c55e',
        light: '#4ade80',
        dark: '#16a34a',
        contrastText: '#ffffff',
      },
      error: {
        main: '#ef4444',
        light: '#f87171',
        dark: '#dc2626',
        contrastText: '#ffffff',
      },
      warning: {
        main: '#f59e0b',
        light: '#fbbf24',
        dark: '#d97706',
        contrastText: 'rgba(0, 0, 0, 0.87)',
      },
      info: {
        main: '#38bdf8',
        light: '#7dd3fc',
        dark: '#0ea5e9',
        contrastText: '#ffffff',
      },
      status: {
        pending: { main: '#f59e0b', light: '#fbbf24', bg: 'rgba(245, 158, 11, 0.12)' },
        active: { main: '#22c55e', light: '#4ade80', bg: 'rgba(34, 197, 94, 0.12)' },
        completed: { main: '#3b82f6', light: '#60a5fa', bg: 'rgba(59, 130, 246, 0.12)' },
        error: { main: '#ef4444', light: '#f87171', bg: 'rgba(239, 68, 68, 0.12)' },
        inProgress: { main: '#8b5cf6', light: '#a78bfa', bg: 'rgba(139, 92, 246, 0.12)' },
        onHold: { main: '#6b7280', light: '#9ca3af', bg: 'rgba(107, 114, 128, 0.12)' },
        draft: { main: '#6b7280', light: '#9ca3af', bg: 'rgba(107, 114, 128, 0.12)' },
        shipped: { main: '#8b5cf6', light: '#a78bfa', bg: 'rgba(139, 92, 246, 0.12)' },
        delivered: { main: '#22c55e', light: '#4ade80', bg: 'rgba(34, 197, 94, 0.12)' },
        confirmed: { main: '#06b6d4', light: '#22d3ee', bg: 'rgba(6, 182, 212, 0.12)' },
        partial: { main: '#f59e0b', light: '#fbbf24', bg: 'rgba(245, 158, 11, 0.12)' },
        cancelled: { main: '#ef4444', light: '#f87171', bg: 'rgba(239, 68, 68, 0.12)' },
      },
      background: {
        default: '#0f172a',
        paper: '#1e293b',
        darker: '#0f172a',
        card: '#1e293b',
        dialog: '#1e293b',
        tooltip: '#334155',
      },
      text: {
        primary: '#f1f5f9',
        secondary: '#94a3b8',
        disabled: '#64748b',
      },
      divider: 'rgba(255, 255, 255, 0.08)',
      action: {
        active: '#94a3b8',
        hover: 'rgba(255, 255, 255, 0.05)',
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
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.2)',
          transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
          '&:hover': {
            borderColor: 'rgba(255, 255, 255, 0.12)',
            boxShadow: '0 8px 25px rgba(0, 0, 0, 0.25)',
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
          fontSize: '0.8125rem',
          letterSpacing: '0.3px',
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
            backgroundColor: alpha(theme.palette.primary.main, 0.12),
            '&:hover': {
              backgroundColor: alpha(theme.palette.primary.main, 0.16),
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
          backgroundColor: alpha(theme.palette.primary.main, 0.15),
          color: theme.palette.primary.light,
          '&:hover': {
            backgroundColor: alpha(theme.palette.primary.main, 0.25),
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
          backgroundColor: alpha(theme.palette.primary.main, 0.15),
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
          backgroundColor: alpha(theme.palette.success.main, 0.12),
          color: theme.palette.success.light,
          border: `1px solid ${alpha(theme.palette.success.main, 0.2)}`,
        },
        standardError: {
          backgroundColor: alpha(theme.palette.error.main, 0.12),
          color: theme.palette.error.light,
          border: `1px solid ${alpha(theme.palette.error.main, 0.2)}`,
        },
        standardWarning: {
          backgroundColor: alpha(theme.palette.warning.main, 0.12),
          color: theme.palette.warning.light,
          border: `1px solid ${alpha(theme.palette.warning.main, 0.2)}`,
        },
        standardInfo: {
          backgroundColor: alpha(theme.palette.primary.main, 0.12),
          color: theme.palette.primary.light,
          border: `1px solid ${alpha(theme.palette.primary.main, 0.2)}`,
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
            backgroundColor: alpha(theme.palette.primary.main, 0.15),
            color: theme.palette.primary.light,
            '&:hover': {
              backgroundColor: alpha(theme.palette.primary.main, 0.2),
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
      main: '#2563eb',
      light: '#3b82f6',
      dark: '#1d4ed8',
      contrastText: '#ffffff',
    },
    secondary: {
      main: '#f50057',
      light: '#ff4081',
      dark: '#c51162',
      contrastText: '#ffffff',
    },
    success: {
      main: '#22c55e',
      light: '#4ade80',
      dark: '#16a34a',
      contrastText: '#ffffff',
    },
    error: {
      main: '#ef4444',
      light: '#f87171',
      dark: '#dc2626',
      contrastText: '#ffffff',
    },
    warning: {
      main: '#f59e0b',
      light: '#fbbf24',
      dark: '#d97706',
      contrastText: 'rgba(0, 0, 0, 0.87)',
    },
    info: {
      main: '#2196f3',
      light: '#64b5f6',
      dark: '#1976d2',
      contrastText: '#ffffff',
    },
    status: {
      pending: { main: '#f59e0b', light: '#fbbf24', bg: 'rgba(245, 158, 11, 0.12)' },
      active: { main: '#22c55e', light: '#4ade80', bg: 'rgba(34, 197, 94, 0.12)' },
      completed: { main: '#3b82f6', light: '#60a5fa', bg: 'rgba(59, 130, 246, 0.12)' },
      error: { main: '#ef4444', light: '#f87171', bg: 'rgba(239, 68, 68, 0.12)' },
      inProgress: { main: '#8b5cf6', light: '#a78bfa', bg: 'rgba(139, 92, 246, 0.12)' },
      onHold: { main: '#6b7280', light: '#9ca3af', bg: 'rgba(107, 114, 128, 0.12)' },
      draft: { main: '#6b7280', light: '#9ca3af', bg: 'rgba(107, 114, 128, 0.12)' },
      shipped: { main: '#8b5cf6', light: '#a78bfa', bg: 'rgba(139, 92, 246, 0.12)' },
      delivered: { main: '#22c55e', light: '#4ade80', bg: 'rgba(34, 197, 94, 0.12)' },
      confirmed: { main: '#06b6d4', light: '#22d3ee', bg: 'rgba(6, 182, 212, 0.12)' },
      partial: { main: '#f59e0b', light: '#fbbf24', bg: 'rgba(245, 158, 11, 0.12)' },
      cancelled: { main: '#ef4444', light: '#f87171', bg: 'rgba(239, 68, 68, 0.12)' },
    },
    background: {
      default: '#f8fafc',
      paper: '#ffffff',
      darker: '#f1f5f9',
      card: '#ffffff',
      dialog: '#ffffff',
      tooltip: '#1e293b',
    },
    text: {
      primary: '#1e293b',
      secondary: '#64748b',
      disabled: '#94a3b8',
    },
    divider: 'rgba(0, 0, 0, 0.06)',
    action: {
      active: '#64748b',
      hover: 'rgba(0, 0, 0, 0.03)',
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
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.08)',
          transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
          '&:hover': {
            borderColor: 'rgba(0, 0, 0, 0.12)',
            boxShadow: '0 8px 25px rgba(0, 0, 0, 0.1)',
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
          fontSize: '0.8125rem',
          letterSpacing: '0.3px',
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
            backgroundColor: alpha(theme.palette.primary.main, 0.08),
            '&:hover': {
              backgroundColor: alpha(theme.palette.primary.main, 0.12),
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
          backgroundColor: alpha(theme.palette.primary.main, 0.1),
          color: theme.palette.primary.dark,
          '&:hover': {
            backgroundColor: alpha(theme.palette.primary.main, 0.16),
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
          backgroundColor: alpha(theme.palette.primary.main, 0.1),
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
          backgroundColor: alpha(theme.palette.success.main, 0.1),
          color: theme.palette.success.dark,
          border: `1px solid ${alpha(theme.palette.success.main, 0.2)}`,
        },
        standardError: {
          backgroundColor: alpha(theme.palette.error.main, 0.1),
          color: theme.palette.error.dark,
          border: `1px solid ${alpha(theme.palette.error.main, 0.2)}`,
        },
        standardWarning: {
          backgroundColor: alpha(theme.palette.warning.main, 0.1),
          color: theme.palette.warning.dark,
          border: `1px solid ${alpha(theme.palette.warning.main, 0.2)}`,
        },
        standardInfo: {
          backgroundColor: alpha(theme.palette.primary.main, 0.1),
          color: theme.palette.primary.dark,
          border: `1px solid ${alpha(theme.palette.primary.main, 0.2)}`,
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
            backgroundColor: alpha(theme.palette.primary.main, 0.1),
            color: theme.palette.primary.main,
            '&:hover': {
              backgroundColor: alpha(theme.palette.primary.main, 0.16),
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