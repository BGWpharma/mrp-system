/**
 * Konfiguracja kolorów dla całej aplikacji
 * Zapewnia jednolite używanie kolorów we wszystkich komponentach
 */

// Podstawowe kolory dla motywów (spójne z ThemeContext)
const baseColors = {
  light: {
    background: '#f8fafc',
    paper: '#ffffff',
    paperDarker: '#f1f5f9',
    text: {
      primary: '#1e293b',
      secondary: '#64748b',
      disabled: '#94a3b8',
    },
    divider: 'rgba(0, 0, 0, 0.06)',
  },
  dark: {
    background: '#0f172a',
    paper: '#1e293b',
    paperDarker: '#0f172a',
    text: {
      primary: '#f1f5f9',
      secondary: '#94a3b8',
      disabled: '#64748b',
    },
    divider: 'rgba(255, 255, 255, 0.08)',
  }
};

// Pallety kolorów dla obydwu motywów
const palettes = {
  primary: {
    light: '#3b82f6',
    main: '#2563eb',
    dark: '#1d4ed8',
    contrastText: '#ffffff',
  },
  secondary: {
    light: '#ff4081',
    main: '#f50057',
    dark: '#c51162',
    contrastText: '#ffffff',
  },
  success: {
    light: '#4ade80',
    main: '#22c55e',
    dark: '#16a34a',
    contrastText: '#ffffff',
  },
  error: {
    light: '#f87171',
    main: '#ef4444',
    dark: '#dc2626',
    contrastText: '#ffffff',
  },
  warning: {
    light: '#fbbf24',
    main: '#f59e0b',
    dark: '#d97706',
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
    light: '#fbbf24',
    main: '#f59e0b',
    dark: '#d97706',
    text: 'rgba(0, 0, 0, 0.87)',
  },
  active: {
    light: '#4ade80',
    main: '#22c55e',
    dark: '#16a34a',
    text: '#ffffff',
  },
  completed: {
    light: '#60a5fa',
    main: '#3b82f6',
    dark: '#2563eb',
    text: '#ffffff',
  },
  cancelled: {
    light: '#f87171',
    main: '#ef4444',
    dark: '#dc2626',
    text: '#ffffff',
  },
  inProgress: {
    light: '#a78bfa',
    main: '#8b5cf6',
    dark: '#7c3aed',
    text: '#ffffff',
  },
  onHold: {
    light: '#9ca3af',
    main: '#6b7280',
    dark: '#4b5563',
    text: '#ffffff',
  },
  draft: {
    light: '#9ca3af',
    main: '#6b7280',
    dark: '#4b5563',
    text: '#ffffff',
  },
  shipped: {
    light: '#a78bfa',
    main: '#8b5cf6',
    dark: '#7c3aed',
    text: '#ffffff',
  },
  delivered: {
    light: '#4ade80',
    main: '#22c55e',
    dark: '#16a34a',
    text: '#ffffff',
  },
  confirmed: {
    light: '#22d3ee',
    main: '#06b6d4',
    dark: '#0891b2',
    text: '#ffffff',
  },
  partial: {
    light: '#fbbf24',
    main: '#f59e0b',
    dark: '#d97706',
    text: 'rgba(0, 0, 0, 0.87)',
  },
  overdue: {
    light: '#fb923c',
    main: '#f97316',
    dark: '#ea580c',
    text: '#ffffff',
  },
  expired: {
    light: '#a8a29e',
    main: '#78716c',
    dark: '#57534e',
    text: '#ffffff',
  },
};

// Mapa statusow (PL/EN/lowercase) -> klucz w statusColors / palette.status
const STATUS_KEY_MAP = {
  'Szkic': 'draft', 'Draft': 'draft', 'draft': 'draft',
  'Zaplanowane': 'draft', 'scheduled': 'draft',
  'Zamówione': 'active', 'ordered': 'active',
  'Potwierdzone': 'confirmed', 'confirmed': 'confirmed',
  'Zatwierdzone': 'confirmed', 'approved': 'confirmed',
  'Wysłane': 'shipped', 'shipped': 'shipped',
  'W transporcie': 'shipped', 'In Transit': 'shipped',
  'Wystawiony': 'active', 'Issued': 'active',
  'Dostarczone': 'delivered', 'delivered': 'delivered',
  'W trakcie': 'inProgress', 'In Progress': 'inProgress',
  'Potwierdzenie zużycia': 'inProgress',
  'Zakończone': 'completed', 'Zakończony': 'completed', 'completed': 'completed',
  'Anulowane': 'cancelled', 'Anulowany': 'cancelled', 'cancelled': 'cancelled',
  'Wstrzymane': 'onHold', 'On Hold': 'onHold',
  'Oczekujące': 'pending', 'pending': 'pending',
  'Częściowo dostarczone': 'partial', 'partial': 'partial',
};

const getStatusKeyFromLabel = (statusLabel) => {
  return STATUS_KEY_MAP[statusLabel] || STATUS_KEY_MAP[statusLabel?.toLowerCase()] || 'draft';
};

const getStatusMainColor = (statusLabel) => {
  const key = getStatusKeyFromLabel(statusLabel);
  return statusColors[key]?.main || statusColors.draft.main;
};

// Gradientowe tła
const gradients = {
  primary: 'linear-gradient(45deg, #1d4ed8 30%, #3b82f6 90%)',
  secondary: 'linear-gradient(45deg, #f50057 30%, #ff4081 90%)',
  success: 'linear-gradient(45deg, #16a34a 30%, #22c55e 90%)',
  error: 'linear-gradient(45deg, #dc2626 30%, #ef4444 90%)',
  warning: 'linear-gradient(45deg, #d97706 30%, #f59e0b 90%)',
  info: 'linear-gradient(45deg, #0ea5e9 30%, #38bdf8 90%)',
  purple: 'linear-gradient(45deg, #7c3aed 30%, #8b5cf6 90%)',
  orange: 'linear-gradient(45deg, #ea580c 30%, #f97316 90%)',
  grey: 'linear-gradient(45deg, #4b5563 30%, #6b7280 90%)',
  dark: 'linear-gradient(45deg, #1e293b 30%, #334155 90%)',
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
  STATUS_KEY_MAP,
  getStatusKeyFromLabel,
  getStatusMainColor,
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