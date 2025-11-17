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
  
  // Typography - Zoptymalizowana dla aplikacji biznesowych
  typography: {
    fontFamily: [
      'Roboto',
      '-apple-system',
      'BlinkMacSystemFont',
      '"Segoe UI"',
      '"Helvetica Neue"',
      'Arial',
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
      background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
      WebkitBackgroundClip: 'text',
      WebkitTextFillColor: 'transparent',
      backgroundClip: 'text',
      textShadow: '0 0 30px rgba(59, 130, 246, 0.3)',
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
  
  // Shape - zgodny z design-tokens
  shape: {
    borderRadius: 12,          // --radius-lg
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
  MuiCssBaseline: {
    styleOverrides: {
      body: {
        scrollbarWidth: 'thin',
        position: 'relative',
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
            : 'linear-gradient(135deg, rgba(59, 130, 246, 0.05) 0%, rgba(139, 92, 246, 0.03) 25%, rgba(236, 254, 255, 0.8) 50%, rgba(219, 234, 254, 0.6) 75%, rgba(165, 180, 252, 0.04) 100%)'
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
            ? `radial-gradient(circle at 15% 25%, ${alpha('#3b82f6', 0.12)} 0%, transparent 50%), radial-gradient(circle at 85% 75%, ${alpha('#8b5cf6', 0.1)} 0%, transparent 50%), radial-gradient(circle at 50% 60%, ${alpha('#06b6d4', 0.08)} 0%, transparent 50%)`
            : `radial-gradient(circle at 15% 25%, ${alpha('#3b82f6', 0.08)} 0%, transparent 50%), radial-gradient(circle at 85% 75%, ${alpha('#8b5cf6', 0.06)} 0%, transparent 50%), radial-gradient(circle at 50% 60%, ${alpha('#06b6d4', 0.04)} 0%, transparent 50%)`
        },
        '&::-webkit-scrollbar': {
          width: '8px',
          height: '8px',
        },
        '&::-webkit-scrollbar-track': {
          background: theme.palette.mode === 'dark' 
            ? alpha(theme.palette.common.white, 0.05)
            : alpha(theme.palette.common.black, 0.05),
          borderRadius: '4px',
        },
        '&::-webkit-scrollbar-thumb': {
          backgroundColor: theme.palette.mode === 'dark' 
            ? alpha(theme.palette.common.white, 0.2)
            : alpha(theme.palette.common.black, 0.2),
          borderRadius: '4px',
          '&:hover': {
            backgroundColor: theme.palette.mode === 'dark' 
              ? alpha(theme.palette.common.white, 0.3)
              : alpha(theme.palette.common.black, 0.3),
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
        default: 'transparent',
        paper: 'rgba(31, 41, 55, 0.8)',
        darker: '#0f172a',
        card: 'rgba(30, 41, 59, 0.8)',
        dialog: 'rgba(30, 41, 59, 0.9)',
        tooltip: 'rgba(30, 41, 59, 0.9)',
      },
      text: {
        primary: '#ffffff',
        secondary: 'rgba(255, 255, 255, 0.7)',
        disabled: 'rgba(255, 255, 255, 0.5)',
      },
      divider: 'rgba(255, 255, 255, 0.12)',
      action: {
        active: 'rgba(255, 255, 255, 0.7)',
        hover: 'rgba(255, 255, 255, 0.1)',
        selected: 'rgba(255, 255, 255, 0.15)',
        disabled: 'rgba(255, 255, 255, 0.3)',
        disabledBackground: 'rgba(255, 255, 255, 0.12)',
      },
    },
    ...commonValues,
  });

  // Stosowanie wspólnych stylów a następnie dodanie specyficznych dla ciemnego motywu
  const darkComponents = {
    ...getCommonComponents(theme),
    MuiAppBar: {
      styleOverrides: {
        root: {
          boxShadow: '0px 2px 10px rgba(0, 0, 0, 0.2)',
          backgroundImage: 'none',
          backgroundColor: 'rgba(31, 41, 55, 0.9)',
          backdropFilter: 'blur(8px)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
        },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          backgroundColor: 'rgba(31, 41, 55, 0.9)',
          backgroundImage: 'none',
          borderRight: '1px solid rgba(255, 255, 255, 0.05)',
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          backgroundColor: 'rgba(30, 41, 59, 0.85)',
          backdropFilter: 'blur(20px) saturate(180%)',
          border: '1px solid rgba(59, 130, 246, 0.2)',
          borderRadius: 16,
          position: 'relative',
          overflow: 'hidden',
          boxShadow: '0px 8px 32px rgba(0, 0, 0, 0.3), 0px 1px 0px rgba(255, 255, 255, 0.1) inset',
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          '&::before': {
            content: '""',
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.1) 0%, transparent 50%, rgba(255, 255, 255, 0.05) 100%)',
            pointerEvents: 'none',
            opacity: 0,
            transition: 'opacity 0.3s ease'
          },
          '&:hover': {
            transform: 'translateY(-4px)',
            borderColor: 'rgba(59, 130, 246, 0.3)',
            boxShadow: '0px 20px 40px rgba(59, 130, 246, 0.2), 0px 1px 0px rgba(255, 255, 255, 0.15) inset',
            '&::before': {
              opacity: 1
            }
          },
        },
      },
    },
    // Enhanced Table Components
    MuiTable: {
      styleOverrides: {
        root: {
          '& .MuiTableRow-root': {
            transition: 'background-color 0.2s ease',
            '&:hover': {
              backgroundColor: 'rgba(59, 130, 246, 0.08)',
            },
          },
        },
      },
    },
    MuiTableHead: {
      styleOverrides: {
        root: {
          '& .MuiTableRow-root': {
            background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.1) 0%, rgba(139, 92, 246, 0.1) 100%)',
            '&:hover': {
              backgroundColor: 'transparent',
              transform: 'none',
            },
          },
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        head: {
          fontWeight: 'bold',
          backgroundColor: 'rgba(255, 255, 255, 0.05)',
        },
        root: {
          borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
        },
      },
    },
    MuiListItem: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          margin: '4px 8px',
          transition: 'all 0.2s ease',
          '&:hover': {
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            transform: 'translateX(4px)',
          },
          '&.Mui-selected': {
            backgroundColor: 'rgba(66, 165, 245, 0.15)',
            '&:hover': {
              backgroundColor: 'rgba(59, 130, 246, 0.25)',
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
          backgroundColor: 'rgba(30, 41, 59, 0.8)',
          backdropFilter: 'blur(8px)',
          border: '1px solid rgba(255, 255, 255, 0.05)',
          borderRadius: 16,
          overflowX: 'auto',
          boxShadow: '0px 8px 32px rgba(0, 0, 0, 0.3), inset 0px 1px 0px rgba(255, 255, 255, 0.1)',
          '&:hover': {
            borderColor: 'rgba(59, 130, 246, 0.3)',
            boxShadow: '0px 12px 40px rgba(59, 130, 246, 0.2)',
          },
        },
      },
    },
    // Enhanced List Components
    MuiList: {
      styleOverrides: {
        root: {
          backgroundColor: 'rgba(30, 41, 59, 0.6)',
          backdropFilter: 'blur(20px)',
          borderRadius: 16,
          border: '1px solid rgba(59, 130, 246, 0.2)',
          overflow: 'hidden',
        },
      },
    },
    // Enhanced Chip Components
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          fontWeight: 500,
          backdropFilter: 'blur(10px)',
          border: '1px solid rgba(59, 130, 246, 0.3)',
          transition: 'all 0.2s ease',
          '&:hover': {
            transform: 'scale(1.05)',
            boxShadow: '0px 4px 12px rgba(59, 130, 246, 0.3)',
          },
        },
        filled: {
          background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.8) 0%, rgba(139, 92, 246, 0.8) 100%)',
          color: '#ffffff',
        },
        outlined: {
          backgroundColor: 'rgba(30, 41, 59, 0.6)',
          borderColor: 'rgba(59, 130, 246, 0.4)',
          color: '#e2e8f0',
        },
      },
    },
    // Enhanced Pagination
    MuiPagination: {
      styleOverrides: {
        root: {
          '& .MuiPaginationItem-root': {
            borderRadius: 12,
            margin: '0 2px',
            transition: 'all 0.2s ease',
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(59, 130, 246, 0.2)',
            backgroundColor: 'rgba(30, 41, 59, 0.6)',
            color: '#e2e8f0',
            '&:hover': {
              backgroundColor: 'rgba(59, 130, 246, 0.2)',
              borderColor: 'rgba(59, 130, 246, 0.4)',
              transform: 'translateY(-2px)',
              boxShadow: '0px 4px 12px rgba(59, 130, 246, 0.3)',
            },
            '&.Mui-selected': {
              background: 'linear-gradient(135deg, #2196f3 0%, #8b5cf6 100%)',
              color: '#ffffff',
              borderColor: 'transparent',
              '&:hover': {
                background: 'linear-gradient(135deg, #1976d2 0%, #7c3aed 100%)',
              },
            },
          },
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          backgroundColor: 'rgba(30, 41, 59, 0.9)',
          backdropFilter: 'blur(8px)',
          backgroundImage: 'none',
          border: '1px solid rgba(255, 255, 255, 0.05)',
        },
      },
    },
    MuiAutocomplete: {
      styleOverrides: {
        tag: {
          backgroundColor: 'rgba(255, 255, 255, 0.15)',
        },
      },
    },
    MuiAlert: {
      styleOverrides: {
        standardSuccess: {
          backgroundColor: alpha(theme.palette.success.main, 0.15),
          color: theme.palette.success.light,
        },
        standardError: {
          backgroundColor: alpha(theme.palette.error.main, 0.15),
          color: theme.palette.error.light,
        },
        standardWarning: {
          backgroundColor: alpha(theme.palette.warning.main, 0.15),
          color: theme.palette.warning.light,
        },
        standardInfo: {
          backgroundColor: alpha(theme.palette.info.main, 0.15),
          color: theme.palette.info.light,
        },
      },
    },
    MuiToggleButton: {
      styleOverrides: {
        root: {
          borderColor: 'rgba(255, 255, 255, 0.12)',
          color: 'rgba(255, 255, 255, 0.7)',
          '&.Mui-selected': {
            backgroundColor: 'rgba(66, 165, 245, 0.2)',
            color: theme.palette.primary.light,
          },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 6,
          backgroundColor: 'rgba(255, 255, 255, 0.1)',
        },
        outlined: {
          borderColor: 'rgba(255, 255, 255, 0.23)',
        },
        deleteIcon: {
          color: 'rgba(255, 255, 255, 0.7)',
          '&:hover': {
            color: 'rgba(255, 255, 255, 0.9)',
          },
        },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 500,
          '&.Mui-selected': {
            color: theme.palette.primary.light,
        },
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
      default: 'transparent',
      paper: 'rgba(255, 255, 255, 0.8)',
      darker: '#eaeaea',
        card: 'rgba(255, 255, 255, 0.8)',
        dialog: 'rgba(255, 255, 255, 0.9)',
        tooltip: '#616161',
    },
    text: {
      primary: 'rgba(0, 0, 0, 0.87)',
      secondary: 'rgba(0, 0, 0, 0.6)',
      disabled: 'rgba(0, 0, 0, 0.38)',
    },
    divider: 'rgba(0, 0, 0, 0.12)',
      action: {
        active: 'rgba(0, 0, 0, 0.54)',
        hover: 'rgba(0, 0, 0, 0.04)',
        selected: 'rgba(0, 0, 0, 0.08)',
        disabled: 'rgba(0, 0, 0, 0.26)',
        disabledBackground: 'rgba(0, 0, 0, 0.12)',
      },
    },
    ...commonValues,
  });

  // Stosowanie wspólnych stylów a następnie dodanie specyficznych dla jasnego motywu
  const lightComponents = {
    ...getCommonComponents(theme),
    MuiAppBar: {
      styleOverrides: {
        root: {
          boxShadow: '0px 2px 10px rgba(0, 0, 0, 0.1)',
          backgroundImage: 'none',
          backgroundColor: 'rgba(255, 255, 255, 0.9)',
          backdropFilter: 'blur(8px)',
          borderBottom: '1px solid rgba(0, 0, 0, 0.05)',
          color: 'rgba(0, 0, 0, 0.87)',
        },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          backgroundColor: 'rgba(255, 255, 255, 0.9)',
          backgroundImage: 'none',
          borderRight: '1px solid rgba(0, 0, 0, 0.08)',
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          backgroundColor: 'rgba(255, 255, 255, 0.85)',
          backdropFilter: 'blur(20px) saturate(180%)',
          border: '1px solid rgba(59, 130, 246, 0.1)',
          borderRadius: 16,
          position: 'relative',
          overflow: 'hidden',
          boxShadow: '0px 8px 32px rgba(59, 130, 246, 0.1), 0px 1px 0px rgba(255, 255, 255, 0.8) inset',
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          '&::before': {
            content: '""',
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.1) 0%, transparent 50%, rgba(255, 255, 255, 0.05) 100%)',
            pointerEvents: 'none',
            opacity: 0,
            transition: 'opacity 0.3s ease'
          },
          '&:hover': {
            transform: 'translateY(-4px)',
            borderColor: 'rgba(59, 130, 246, 0.3)',
            boxShadow: '0px 20px 40px rgba(59, 130, 246, 0.15), 0px 1px 0px rgba(255, 255, 255, 0.9) inset',
            '&::before': {
              opacity: 1
            }
          },
        },
      },
    },
    // Enhanced Table Components
    MuiTable: {
      styleOverrides: {
        root: {
          '& .MuiTableRow-root': {
            transition: 'background-color 0.2s ease',
            '&:hover': {
              backgroundColor: 'rgba(25, 118, 210, 0.04)',
            },
          },
        },
      },
    },
    MuiTableHead: {
      styleOverrides: {
        root: {
          '& .MuiTableRow-root': {
            background: 'linear-gradient(135deg, rgba(25, 118, 210, 0.05) 0%, rgba(124, 58, 237, 0.05) 100%)',
            '&:hover': {
              backgroundColor: 'transparent',
              transform: 'none',
            },
          },
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        head: {
          fontWeight: 'bold',
          backgroundColor: 'rgba(0, 0, 0, 0.02)',
        },
        root: {
          borderBottom: '1px solid rgba(0, 0, 0, 0.1)',
        },
      },
    },
    MuiListItem: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          margin: '4px 8px',
          transition: 'all 0.2s ease',
          '&:hover': {
            backgroundColor: 'rgba(25, 118, 210, 0.06)',
            transform: 'translateX(4px)',
          },
          '&.Mui-selected': {
            backgroundColor: 'rgba(25, 118, 210, 0.08)',
            '&:hover': {
              backgroundColor: 'rgba(25, 118, 210, 0.16)',
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
          backgroundColor: 'rgba(255, 255, 255, 0.8)',
          backdropFilter: 'blur(8px)',
          border: '1px solid rgba(0, 0, 0, 0.05)',
          borderRadius: 16,
          overflowX: 'auto',
          boxShadow: '0px 8px 32px rgba(25, 118, 210, 0.1), inset 0px 1px 0px rgba(255, 255, 255, 0.8)',
          '&:hover': {
            borderColor: 'rgba(25, 118, 210, 0.3)',
            boxShadow: '0px 12px 40px rgba(25, 118, 210, 0.15)',
          },
        },
      },
    },
    // Enhanced List Components
    MuiList: {
      styleOverrides: {
        root: {
          backgroundColor: 'rgba(255, 255, 255, 0.7)',
          backdropFilter: 'blur(20px)',
          borderRadius: 16,
          border: '1px solid rgba(25, 118, 210, 0.15)',
          overflow: 'hidden',
        },
      },
    },
    // Enhanced Chip Components
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          fontWeight: 500,
          backdropFilter: 'blur(10px)',
          border: '1px solid rgba(25, 118, 210, 0.2)',
          transition: 'all 0.2s ease',
          '&:hover': {
            transform: 'scale(1.05)',
            boxShadow: '0px 4px 12px rgba(25, 118, 210, 0.2)',
          },
        },
        filled: {
          background: 'linear-gradient(135deg, rgba(25, 118, 210, 0.9) 0%, rgba(124, 58, 237, 0.9) 100%)',
          color: '#ffffff',
        },
        outlined: {
          backgroundColor: 'rgba(255, 255, 255, 0.8)',
          borderColor: 'rgba(25, 118, 210, 0.3)',
          color: '#334155',
        },
      },
    },
    // Enhanced Pagination
    MuiPagination: {
      styleOverrides: {
        root: {
          '& .MuiPaginationItem-root': {
            borderRadius: 12,
            margin: '0 2px',
            transition: 'all 0.2s ease',
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(25, 118, 210, 0.15)',
            backgroundColor: 'rgba(255, 255, 255, 0.7)',
            color: '#334155',
            '&:hover': {
              backgroundColor: 'rgba(25, 118, 210, 0.1)',
              borderColor: 'rgba(25, 118, 210, 0.3)',
              transform: 'translateY(-2px)',
              boxShadow: '0px 4px 12px rgba(25, 118, 210, 0.2)',
            },
            '&.Mui-selected': {
              background: 'linear-gradient(135deg, #1976d2 0%, #7c3aed 100%)',
              color: '#ffffff',
              borderColor: 'transparent',
              '&:hover': {
                background: 'linear-gradient(135deg, #1565c0 0%, #5b21b6 100%)',
              },
            },
          },
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          backgroundColor: 'rgba(255, 255, 255, 0.9)',
          backdropFilter: 'blur(8px)',
          backgroundImage: 'none',
          border: '1px solid rgba(0, 0, 0, 0.05)',
        },
      },
    },
    MuiAutocomplete: {
      styleOverrides: {
        tag: {
          backgroundColor: 'rgba(0, 0, 0, 0.08)',
        },
      },
    },
    MuiAlert: {
      styleOverrides: {
        standardSuccess: {
          backgroundColor: alpha(theme.palette.success.main, 0.1),
          color: theme.palette.success.dark,
        },
        standardError: {
          backgroundColor: alpha(theme.palette.error.main, 0.1),
          color: theme.palette.error.dark,
        },
        standardWarning: {
          backgroundColor: alpha(theme.palette.warning.main, 0.1),
          color: theme.palette.warning.dark,
        },
        standardInfo: {
          backgroundColor: alpha(theme.palette.info.main, 0.1),
          color: theme.palette.info.dark,
        },
      },
    },
    MuiToggleButton: {
      styleOverrides: {
        root: {
          borderColor: 'rgba(0, 0, 0, 0.12)',
          color: 'rgba(0, 0, 0, 0.6)',
          '&.Mui-selected': {
            backgroundColor: 'rgba(25, 118, 210, 0.1)',
            color: theme.palette.primary.main,
          },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 6,
        },
        outlined: {
          borderColor: 'rgba(0, 0, 0, 0.23)',
        },
        deleteIcon: {
          color: 'rgba(0, 0, 0, 0.6)',
          '&:hover': {
            color: 'rgba(0, 0, 0, 0.8)',
          },
        },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 500,
          '&.Mui-selected': {
            color: theme.palette.primary.main,
        },
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