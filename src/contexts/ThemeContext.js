import React, { createContext, useContext, useEffect, useState } from 'react';
import { createTheme, ThemeProvider as MuiThemeProvider, alpha } from '@mui/material/styles';
import { doc, updateDoc, getDoc } from 'firebase/firestore';
import { db } from '../services/firebase/config';
import { useAuth } from '../hooks/useAuth';

// Tworzenie kontekstu
export const ThemeContext = createContext();

// Wspólne wartości dla obu motywów
const commonValues = {
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
    h1: {
      fontWeight: 700,
      fontSize: '2.5rem',
    },
    h2: {
      fontWeight: 600,
      fontSize: '2rem',
    },
    h3: {
      fontWeight: 600,
      fontSize: '1.75rem',
    },
    h4: {
      fontWeight: 600,
      fontSize: '1.5rem',
    },
    h5: {
      fontWeight: 600,
      fontSize: '1.25rem',
    },
    h6: {
      fontWeight: 600,
      fontSize: '1rem',
    },
    subtitle1: {
      fontSize: '1rem',
      fontWeight: 500,
    },
    subtitle2: {
      fontSize: '0.875rem',
      fontWeight: 500,
    },
    body1: {
      fontSize: '1rem',
    },
    body2: {
      fontSize: '0.875rem',
    },
    button: {
      textTransform: 'none',
      fontWeight: 500,
    },
  },
  shape: {
    borderRadius: 12,
  },
  transitions: {
    easing: {
      easeInOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
      easeOut: 'cubic-bezier(0.0, 0, 0.2, 1)',
      easeIn: 'cubic-bezier(0.4, 0, 1, 1)',
      sharp: 'cubic-bezier(0.4, 0, 0.6, 1)',
    },
    duration: {
      shortest: 150,
      shorter: 200,
      short: 250,
      standard: 300,
      complex: 375,
      enteringScreen: 225,
      leavingScreen: 195,
    },
  },
};

// Wspólne style komponentów dla obu motywów
const getCommonComponents = (theme) => ({
  MuiCssBaseline: {
    styleOverrides: {
      body: {
        scrollbarWidth: 'thin',
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
          boxShadow: 'none',
          backgroundImage: 'none',
          backgroundColor: 'rgba(31, 41, 55, 0.9)',
          backdropFilter: 'blur(8px)',
          borderBottom: '1px solid rgba(55, 65, 81, 0.5)',
          position: 'relative',
          '&::before': {
            content: '""',
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'linear-gradient(to right, rgba(31, 41, 55, 0.5), rgba(55, 65, 81, 0.3))',
            pointerEvents: 'none',
            zIndex: -1,
          },
        },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          backgroundColor: 'rgba(31, 41, 55, 0.9)',
          backdropFilter: 'blur(8px)',
          backgroundImage: 'none',
          borderRight: '1px solid rgba(255, 255, 255, 0.05)',
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          backgroundColor: 'rgba(31, 41, 55, 0.8)',
          backdropFilter: 'blur(8px)',
          border: '1px solid rgba(255, 255, 255, 0.05)',
          boxShadow: '0px 5px 15px rgba(0, 0, 0, 0.15)',
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          '&:hover': {
            transform: 'translateY(-2px) scale(1.01)',
            boxShadow: '0px 25px 50px rgba(0, 0, 0, 0.3)',
            borderColor: 'rgba(59, 130, 246, 0.4)',
          },
        },
      },
    },
    // Customer-portal style button enhancements
    MuiButton: {
      ...getCommonComponents(theme).MuiButton,
      styleOverrides: {
        ...getCommonComponents(theme).MuiButton.styleOverrides,
        root: {
          ...getCommonComponents(theme).MuiButton.styleOverrides.root,
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          '&:hover': {
            transform: 'scale(1.02)',
          },
        },
        contained: {
          ...getCommonComponents(theme).MuiButton.styleOverrides.contained,
          background: 'linear-gradient(to right, #3b82f6, #8b5cf6)', // blue to purple gradient
          '&:hover': {
            background: 'linear-gradient(to right, #2563eb, #7c3aed)',
            boxShadow: '0 0 20px rgba(59, 130, 246, 0.4)',
          },
        },
      },
    },
    MuiIconButton: {
      ...getCommonComponents(theme).MuiIconButton,
      styleOverrides: {
        ...getCommonComponents(theme).MuiIconButton.styleOverrides,
        root: {
          ...getCommonComponents(theme).MuiIconButton.styleOverrides.root,
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          '&:hover': {
            transform: 'scale(1.05)',
            background: 'linear-gradient(to right, rgba(55, 65, 81, 0.8), rgba(75, 85, 99, 0.8))',
          },
        },
      },
    },
    MuiMenuItem: {
      styleOverrides: {
        root: {
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          '&:hover': {
            background: 'linear-gradient(to right, rgba(55, 65, 81, 0.8), rgba(75, 85, 99, 0.8))',
            transform: 'translateX(4px)',
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
          '&.Mui-selected': {
            backgroundColor: 'rgba(66, 165, 245, 0.15)',
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
    // Enhanced Table Styling - customer-portal style
    MuiTableContainer: {
      styleOverrides: {
        root: {
          backgroundColor: 'rgba(31, 41, 55, 0.8)',
          backdropFilter: 'blur(12px)',
          border: '1px solid rgba(55, 65, 81, 0.5)',
          borderRadius: '12px',
          boxShadow: '0 10px 25px rgba(0, 0, 0, 0.25)',
          overflow: 'hidden',
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          '&:hover': {
            transform: 'translateY(-2px)',
            boxShadow: '0 20px 40px rgba(0, 0, 0, 0.3)',
            borderColor: 'rgba(59, 130, 246, 0.3)',
          },
        },
      },
    },
    MuiTable: {
      styleOverrides: {
        root: {
          borderCollapse: 'separate',
          borderSpacing: 0,
        },
      },
    },
    MuiTableHead: {
      styleOverrides: {
        root: {
          background: 'linear-gradient(to right, rgba(31, 41, 55, 0.9), rgba(55, 65, 81, 0.9))',
          '& .MuiTableCell-root': {
            borderBottom: '2px solid rgba(59, 130, 246, 0.3)',
          },
        },
      },
    },
    MuiTableBody: {
      styleOverrides: {
        root: {
          '& .MuiTableRow-root': {
            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            '&:hover': {
              backgroundColor: 'rgba(55, 65, 81, 0.8)',
              transform: 'scale(1.01)',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
              '& .MuiTableCell-root': {
                color: '#ffffff',
              },
            },
            '&:nth-of-type(even)': {
              backgroundColor: 'rgba(55, 65, 81, 0.3)',
            },
          },
        },
      },
    },
    MuiTableRow: {
      styleOverrides: {
        root: {
          '&.Mui-selected': {
            backgroundColor: 'rgba(59, 130, 246, 0.2) !important',
            '&:hover': {
              backgroundColor: 'rgba(59, 130, 246, 0.3) !important',
            },
          },
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: {
          borderBottom: '1px solid rgba(55, 65, 81, 0.5)',
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          padding: '12px 16px',
        },
        head: {
          fontWeight: 'bold',
          color: '#ffffff',
          fontSize: '0.875rem',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          background: 'transparent',
        },
        body: {
          color: 'rgba(255, 255, 255, 0.9)',
          fontSize: '0.875rem',
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
          backdropFilter: 'blur(8px)',
          backgroundImage: 'none',
          borderRight: '1px solid rgba(0, 0, 0, 0.08)',
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          backgroundColor: 'rgba(255, 255, 255, 0.8)',
          backdropFilter: 'blur(8px)',
          border: '1px solid rgba(0, 0, 0, 0.05)',
          boxShadow: '0px 4px 12px rgba(0, 0, 0, 0.05)',
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          '&:hover': {
            transform: 'translateY(-2px) scale(1.01)',
            boxShadow: '0px 20px 40px rgba(0, 0, 0, 0.1)',
            borderColor: 'rgba(29, 78, 216, 0.3)',
          },
        },
      },
    },
    // Customer-portal style button enhancements for light theme
    MuiButton: {
      ...getCommonComponents(theme).MuiButton,
      styleOverrides: {
        ...getCommonComponents(theme).MuiButton.styleOverrides,
        root: {
          ...getCommonComponents(theme).MuiButton.styleOverrides.root,
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          '&:hover': {
            transform: 'scale(1.02)',
          },
        },
        contained: {
          ...getCommonComponents(theme).MuiButton.styleOverrides.contained,
          background: 'linear-gradient(to right, #1d4ed8, #7c3aed)',
          '&:hover': {
            background: 'linear-gradient(to right, #1e40af, #6d28d9)',
            boxShadow: '0 0 20px rgba(29, 78, 216, 0.4)',
          },
        },
      },
    },
    MuiIconButton: {
      ...getCommonComponents(theme).MuiIconButton,
      styleOverrides: {
        ...getCommonComponents(theme).MuiIconButton.styleOverrides,
        root: {
          ...getCommonComponents(theme).MuiIconButton.styleOverrides.root,
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          '&:hover': {
            transform: 'scale(1.05)',
            background: 'linear-gradient(to right, rgba(241, 245, 249, 0.8), rgba(226, 232, 240, 0.8))',
          },
        },
      },
    },
    MuiMenuItem: {
      styleOverrides: {
        root: {
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          '&:hover': {
            background: 'linear-gradient(to right, rgba(241, 245, 249, 0.8), rgba(226, 232, 240, 0.8))',
            transform: 'translateX(4px)',
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
          '&.Mui-selected': {
            backgroundColor: 'rgba(25, 118, 210, 0.08)',
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
    // Enhanced Table Styling - customer-portal style for light theme
    MuiTableContainer: {
      styleOverrides: {
        root: {
          backgroundColor: 'rgba(255, 255, 255, 0.9)',
          backdropFilter: 'blur(12px)',
          border: '1px solid rgba(148, 163, 184, 0.3)',
          borderRadius: '12px',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.05)',
          overflow: 'hidden',
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          '&:hover': {
            transform: 'translateY(-2px)',
            boxShadow: '0 20px 40px rgba(0, 0, 0, 0.1)',
            borderColor: 'rgba(29, 78, 216, 0.3)',
          },
        },
      },
    },
    MuiTable: {
      styleOverrides: {
        root: {
          borderCollapse: 'separate',
          borderSpacing: 0,
        },
      },
    },
    MuiTableHead: {
      styleOverrides: {
        root: {
          background: 'linear-gradient(to right, rgba(248, 250, 252, 0.9), rgba(241, 245, 249, 0.9))',
          '& .MuiTableCell-root': {
            borderBottom: '2px solid rgba(29, 78, 216, 0.2)',
          },
        },
      },
    },
    MuiTableBody: {
      styleOverrides: {
        root: {
          '& .MuiTableRow-root': {
            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            '&:hover': {
              backgroundColor: 'rgba(241, 245, 249, 0.8)',
              transform: 'scale(1.01)',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
              '& .MuiTableCell-root': {
                color: 'rgba(15, 23, 42, 0.9)',
              },
            },
            '&:nth-of-type(even)': {
              backgroundColor: 'rgba(248, 250, 252, 0.5)',
            },
          },
        },
      },
    },
    MuiTableRow: {
      styleOverrides: {
        root: {
          '&.Mui-selected': {
            backgroundColor: 'rgba(29, 78, 216, 0.1) !important',
            '&:hover': {
              backgroundColor: 'rgba(29, 78, 216, 0.15) !important',
            },
          },
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: {
          borderBottom: '1px solid rgba(148, 163, 184, 0.3)',
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          padding: '12px 16px',
        },
        head: {
          fontWeight: 'bold',
          color: 'rgba(15, 23, 42, 0.9)',
          fontSize: '0.875rem',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          background: 'transparent',
        },
        body: {
          color: 'rgba(51, 65, 85, 0.8)',
          fontSize: '0.875rem',
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

  // Funkcja do przełączania motywu
  const toggleTheme = async () => {
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
  };

  return (
    <ThemeContext.Provider value={{ mode, toggleTheme }}>
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