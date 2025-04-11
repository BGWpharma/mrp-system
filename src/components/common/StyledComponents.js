import { styled, alpha } from '@mui/material/styles';
import { 
  Card, 
  Paper, 
  Button, 
  Typography, 
  Box, 
  TableRow, 
  TableCell, 
  Chip,
  Badge,
  ListItemButton,
  CircularProgress
} from '@mui/material';

/**
 * KARTY I KONTENERY
 */

// Karta z lepszym cieniowaniem i zaokrąglonymi rogami
export const EnhancedCard = styled(Card)(({ theme }) => ({
  borderRadius: theme.shape.borderRadius,
  transition: 'transform 0.2s, box-shadow 0.2s',
  overflow: 'hidden',
  height: '100%',
  '&:hover': {
    transform: 'translateY(-4px)',
    boxShadow: theme.palette.mode === 'dark' 
      ? '0 8px 24px rgba(0, 0, 0, 0.4)' 
      : '0 8px 24px rgba(0, 0, 0, 0.15)',
  },
}));

// Kontener sekcji z delikatnym tłem
export const SectionContainer = styled(Paper)(({ theme }) => ({
  padding: theme.spacing(3),
  marginBottom: theme.spacing(3),
  backgroundColor: theme.palette.mode === 'dark' 
    ? alpha(theme.palette.background.paper, 0.8)
    : theme.palette.background.paper,
}));

// Kontener dla dashboardu
export const DashboardContainer = styled(Box)(({ theme }) => ({
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
  gap: theme.spacing(3),
  padding: theme.spacing(2, 0),
}));

/**
 * TYPOGRAFIA
 */

// Nagłówek sekcji
export const SectionTitle = styled(Typography)(({ theme }) => ({
  fontSize: '1.25rem',
  fontWeight: 600,
  marginBottom: theme.spacing(2),
  color: theme.palette.text.primary,
  position: 'relative',
  paddingBottom: theme.spacing(1),
  '&:after': {
    content: '""',
    position: 'absolute',
    left: 0,
    bottom: 0,
    width: 40,
    height: 3,
    backgroundColor: theme.palette.primary.main,
    borderRadius: 3,
  },
}));

// Etykieta pomocnicza
export const LabelText = styled(Typography)(({ theme }) => ({
  fontSize: '0.75rem',
  color: theme.palette.text.secondary,
  fontWeight: 500,
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  marginBottom: theme.spacing(0.5),
}));

// Wartość w kartach statystycznych
export const StatValue = styled(Typography)(({ theme, color = 'primary' }) => ({
  fontSize: '2rem',
  fontWeight: 700,
  color: theme.palette[color]?.main || theme.palette.text.primary,
  lineHeight: 1,
}));

/**
 * KOMPONENTY TABELARYCZNE
 */

// Wiersz tabeli z efektem hover
export const EnhancedTableRow = styled(TableRow)(({ theme, isSelected, isDisabled }) => ({
  cursor: 'pointer',
  backgroundColor: isSelected 
    ? alpha(theme.palette.primary.main, 0.1) 
    : 'transparent',
  opacity: isDisabled ? 0.6 : 1,
  '&:hover': {
    backgroundColor: isSelected 
      ? alpha(theme.palette.primary.main, 0.15) 
      : theme.palette.mode === 'dark'
        ? alpha(theme.palette.common.white, 0.05)
        : alpha(theme.palette.common.black, 0.02),
  },
  '&:last-child td, &:last-child th': {
    borderBottom: 0,
  },
}));

// Nagłówek kolumny tabeli
export const TableHeaderCell = styled(TableCell)(({ theme }) => ({
  fontWeight: 600,
  backgroundColor: theme.palette.mode === 'dark'
    ? alpha(theme.palette.common.white, 0.05)
    : alpha(theme.palette.common.black, 0.02),
  color: theme.palette.text.primary,
}));

/**
 * PRZYCISKI I ETYKIETY
 */

// Przycisk akcji z lepszym efektem hover
export const ActionButton = styled(Button)(({ theme, color = 'primary' }) => ({
  borderRadius: 8,
  textTransform: 'none',
  fontWeight: 500,
  boxShadow: 'none',
  background: theme.palette[color]?.main || theme.palette.primary.main,
  '&:hover': {
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
    background: theme.palette[color]?.dark || theme.palette.primary.dark,
  },
}));

// Etykieta statusu
export const StatusChip = styled(Chip)(({ theme, statuscolor = 'default' }) => {
  const getStatusColor = () => {
    switch (statuscolor) {
      case 'success': return theme.palette.success;
      case 'error': return theme.palette.error;
      case 'warning': return theme.palette.warning;
      case 'info': return theme.palette.info;
      case 'primary': return theme.palette.primary;
      case 'secondary': return theme.palette.secondary;
      default: return {
        main: theme.palette.mode === 'dark' ? '#888' : '#AAA',
        light: theme.palette.mode === 'dark' ? '#666' : '#DDD',
      };
    }
  };

  const color = getStatusColor();

  return {
    borderRadius: 12,
    fontWeight: 500,
    height: 24,
    fontSize: '0.75rem',
    backgroundColor: alpha(color.main, theme.palette.mode === 'dark' ? 0.2 : 0.1),
    color: theme.palette.mode === 'dark' ? color.light : color.main,
    border: `1px solid ${alpha(color.main, 0.2)}`,
    '& .MuiChip-label': {
      padding: '0 8px',
    },
  };
});

// Badge z powiadomieniami
export const NotificationBadge = styled(Badge)(({ theme }) => ({
  '& .MuiBadge-badge': {
    backgroundColor: theme.palette.error.main,
    color: theme.palette.error.contrastText,
    fontWeight: 'bold',
    fontSize: '0.75rem',
    minWidth: 18,
    height: 18,
    padding: '0 4px',
    boxShadow: theme.palette.mode === 'dark' 
      ? '0 0 0 2px #182136'
      : '0 0 0 2px #fff',
  },
}));

/**
 * ELEMENTY MENU I NAWIGACJI
 */

// Element menu z lepszym podświetleniem
export const MenuListItem = styled(ListItemButton)(({ theme, active }) => ({
  borderRadius: theme.shape.borderRadius,
  margin: '2px 4px',
  padding: '8px 12px',
  color: active ? theme.palette.primary.main : theme.palette.text.primary,
  backgroundColor: active ? alpha(theme.palette.primary.main, 0.1) : 'transparent',
  '&.Mui-selected': {
    backgroundColor: alpha(theme.palette.primary.main, 0.15),
    '&:hover': {
      backgroundColor: alpha(theme.palette.primary.main, 0.25),
    },
  },
  '&:hover': {
    backgroundColor: theme.palette.mode === 'dark'
      ? alpha(theme.palette.common.white, 0.05)
      : alpha(theme.palette.common.black, 0.04),
  },
  transition: theme.transitions.create(['background-color', 'color']),
}));

/**
 * WSKAŹNIKI I STATUSY
 */

// Wskaźnik ładowania
export const CenteredLoadingIndicator = styled(Box)(({ theme }) => ({
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  padding: theme.spacing(4),
  height: '100%',
  width: '100%',
}));

// Kustomowy wskaźnik ładowania
export const CustomProgress = styled(CircularProgress)(({ theme, size = 40, color = 'primary' }) => ({
  color: theme.palette[color]?.main || theme.palette.primary.main,
}));

// Box z elastycznym rozmieszczeniem elementów w poziomie
export const FlexBox = styled(Box)(({ theme, spacing = 2, alignItems = 'center', justifyContent = 'flex-start' }) => ({
  display: 'flex',
  alignItems,
  justifyContent,
  gap: theme.spacing(spacing),
}));

// Box z elastycznym rozmieszczeniem elementów w pionie
export const ColumnBox = styled(Box)(({ theme, spacing = 2, alignItems = 'flex-start', justifyContent = 'flex-start' }) => ({
  display: 'flex',
  flexDirection: 'column',
  alignItems,
  justifyContent,
  gap: theme.spacing(spacing),
})); 