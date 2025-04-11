/**
 * Konfiguracja kolorów dla całej aplikacji
 * Zapewnia jednolite używanie kolorów we wszystkich komponentach
 */

// Podstawowe kolory dla motywów (spójne z ThemeContext)
const baseColors = {
  light: {
    background: '#f5f5f5',
    paper: '#ffffff',
    paperDarker: '#eaeaea', 
    text: {
      primary: 'rgba(0, 0, 0, 0.87)',
      secondary: 'rgba(0, 0, 0, 0.6)',
      disabled: 'rgba(0, 0, 0, 0.38)',
    },
    divider: 'rgba(0, 0, 0, 0.12)',
  },
  dark: {
    background: '#111827',
    paper: '#182136',
    paperDarker: '#0a101f',
    text: {
      primary: '#ffffff',
      secondary: 'rgba(255, 255, 255, 0.7)',
      disabled: 'rgba(255, 255, 255, 0.5)',
    },
    divider: 'rgba(255, 255, 255, 0.12)',
  }
};

// Pallety kolorów dla obydwu motywów
const palettes = {
  primary: {
    light: '#42a5f5',
    main: '#1976d2',
    dark: '#1565c0',
    contrastText: '#ffffff',
  },
  secondary: {
    light: '#ff4081',
    main: '#f50057',
    dark: '#c51162',
    contrastText: '#ffffff',
  },
  success: {
    light: '#81c784',
    main: '#4caf50',
    dark: '#388e3c',
    contrastText: '#ffffff',
  },
  error: {
    light: '#e57373',
    main: '#f44336',
    dark: '#d32f2f',
    contrastText: '#ffffff',
  },
  warning: {
    light: '#ffb74d',
    main: '#ff9800',
    dark: '#f57c00',
    contrastText: 'rgba(0, 0, 0, 0.87)',
  },
  info: {
    light: '#64b5f6',
    main: '#2196f3',
    dark: '#1976d2',
    contrastText: '#ffffff',
  },
};

// Statusy dla komponentów
const statusColors = {
  pending: {
    light: '#ffecb3',
    main: '#ffc107',
    dark: '#ffa000',
    text: 'rgba(0, 0, 0, 0.87)',
  },
  active: {
    light: '#b3e5fc',
    main: '#03a9f4',
    dark: '#0288d1',
    text: '#ffffff',
  },
  completed: {
    light: '#c8e6c9',
    main: '#4caf50',
    dark: '#388e3c',
    text: '#ffffff',
  },
  cancelled: {
    light: '#ffcdd2',
    main: '#f44336',
    dark: '#d32f2f',
    text: '#ffffff',
  },
  inProgress: {
    light: '#bbdefb',
    main: '#2196f3',
    dark: '#1976d2',
    text: '#ffffff',
  },
  onHold: {
    light: '#e1bee7',
    main: '#9c27b0',
    dark: '#7b1fa2',
    text: '#ffffff',
  },
  overdue: {
    light: '#ffccbc',
    main: '#ff5722',
    dark: '#e64a19',
    text: '#ffffff',
  },
  expired: {
    light: '#d7ccc8',
    main: '#795548',
    dark: '#5d4037',
    text: '#ffffff',
  },
};

// Gradientowe tła
const gradients = {
  primary: 'linear-gradient(45deg, #1976d2 30%, #42a5f5 90%)',
  secondary: 'linear-gradient(45deg, #f50057 30%, #ff4081 90%)',
  success: 'linear-gradient(45deg, #388e3c 30%, #4caf50 90%)',
  error: 'linear-gradient(45deg, #d32f2f 30%, #f44336 90%)',
  warning: 'linear-gradient(45deg, #f57c00 30%, #ff9800 90%)',
  info: 'linear-gradient(45deg, #0288d1 30%, #29b6f6 90%)',
  purple: 'linear-gradient(45deg, #7b1fa2 30%, #9c27b0 90%)',
  orange: 'linear-gradient(45deg, #e64a19 30%, #ff5722 90%)',
  grey: 'linear-gradient(45deg, #455a64 30%, #607d8b 90%)',
  dark: 'linear-gradient(45deg, #212121 30%, #424242 90%)',
};

// Pomocnicze funkcje dla konwersji kolorów
const hexToRgba = (hex, alpha = 1) => {
  // Najpierw konwertuj hex do RGB
  let r = 0, g = 0, b = 0;
  
  // 3 cyfry
  if (hex.length === 4) {
    r = parseInt(hex[1] + hex[1], 16);
    g = parseInt(hex[2] + hex[2], 16);
    b = parseInt(hex[3] + hex[3], 16);
  } 
  // 6 cyfr
  else if (hex.length === 7) {
    r = parseInt(hex.substring(1, 3), 16);
    g = parseInt(hex.substring(3, 5), 16);
    b = parseInt(hex.substring(5, 7), 16);
  }
  
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

// Eksport wszystkich kolorów i funkcji pomocniczych
export {
  baseColors,
  palettes,
  statusColors,
  gradients,
  hexToRgba,
};

// Przydatne przeliczenia dla komponentów
export const getStatusColor = (status) => {
  switch (status?.toLowerCase()) {
    case 'pending':
    case 'oczekujący':
    case 'oczekujące':
    case 'waiting':
      return statusColors.pending;
    
    case 'active':
    case 'aktywne':
    case 'aktywny':
      return statusColors.active;
    
    case 'completed':
    case 'zakończone':
    case 'zakończony':
    case 'done':
      return statusColors.completed;
    
    case 'cancelled':
    case 'anulowany':
    case 'anulowane':
      return statusColors.cancelled;
    
    case 'in progress':
    case 'w trakcie':
    case 'in-progress':
    case 'processing':
      return statusColors.inProgress;
    
    case 'on hold':
    case 'wstrzymane':
    case 'wstrzymany':
    case 'hold':
      return statusColors.onHold;
    
    case 'overdue':
    case 'przeterminowany':
    case 'przeterminowane':
    case 'delayed':
    case 'late':
      return statusColors.overdue;
    
    case 'expired':
    case 'wygasły':
    case 'wygasłe':
      return statusColors.expired;
    
    default:
      return palettes.info;
  }
}; 