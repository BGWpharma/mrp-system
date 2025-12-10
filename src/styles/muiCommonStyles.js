/**
 * 🎨 MUI Common Styles - Wspólne style dla komponentów MUI
 * 
 * OPTYMALIZACJA WYDAJNOŚCI:
 * - Style zdefiniowane poza komponentami nie są tworzone przy każdym renderze
 * - Eliminuje tworzenie nowych obiektów sx przy każdym re-renderze
 * - Redukuje pressure na garbage collector
 * 
 * UŻYCIE:
 * import { flexCenter, flexBetween, spacingStyles } from '@/styles/muiCommonStyles';
 * <Box sx={flexCenter}>...</Box>
 * <Box sx={{ ...flexCenter, mt: 2 }}>...</Box>
 */

// ============================================
// FLEXBOX LAYOUTS
// ============================================

/** Centrowanie elementów flex */
export const flexCenter = {
  display: 'flex',
  alignItems: 'center',
};

/** Flex z elementami wycentrowanymi i rozłożonymi */
export const flexBetween = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
};

/** Flex z elementami na końcu */
export const flexEnd = {
  display: 'flex',
  justifyContent: 'flex-end',
  alignItems: 'center',
};

/** Flex z elementami na początku */
export const flexStart = {
  display: 'flex',
  justifyContent: 'flex-start',
  alignItems: 'center',
};

/** Flex kolumnowy */
export const flexColumn = {
  display: 'flex',
  flexDirection: 'column',
};

/** Flex kolumnowy z centrowaniem */
export const flexColumnCenter = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
};

/** Flex z zawijaniem */
export const flexWrap = {
  display: 'flex',
  flexWrap: 'wrap',
};

/** Flex row z gap */
export const flexRowGap = (gap = 1) => ({
  display: 'flex',
  alignItems: 'center',
  gap,
});

/** Flex column z gap */
export const flexColumnGap = (gap = 1) => ({
  display: 'flex',
  flexDirection: 'column',
  gap,
});

// ============================================
// SPACING UTILITIES
// ============================================

/** Marginesy */
export const mb1 = { mb: 1 };
export const mb2 = { mb: 2 };
export const mb3 = { mb: 3 };
export const mt1 = { mt: 1 };
export const mt2 = { mt: 2 };
export const mt3 = { mt: 3 };
export const mr1 = { mr: 1 };
export const mr2 = { mr: 2 };
export const ml1 = { ml: 1 };
export const ml2 = { ml: 2 };
export const mx1 = { mx: 1 };
export const mx2 = { mx: 2 };
export const my1 = { my: 1 };
export const my2 = { my: 2 };

/** Padding */
export const p1 = { p: 1 };
export const p2 = { p: 2 };
export const p3 = { p: 3 };
export const px1 = { px: 1 };
export const px2 = { px: 2 };
export const px3 = { px: 3 };
export const py1 = { py: 1 };
export const py2 = { py: 2 };
export const py3 = { py: 3 };

// ============================================
// COMMON COMPONENT PATTERNS
// ============================================

/** Loading spinner container */
export const loadingContainer = {
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  p: 3,
};

/** Card content z flex between */
export const cardHeader = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  mb: 2,
};

/** Section header style */
export const sectionHeader = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  mb: 1,
};

/** Action buttons container */
export const actionButtons = {
  display: 'flex',
  gap: 1,
  alignItems: 'center',
};

/** Button row at end */
export const buttonRow = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: 1,
  mt: 2,
};

/** Centered text container */
export const textCenter = {
  textAlign: 'center',
};

/** Full width element */
export const fullWidth = {
  width: '100%',
};

// ============================================
// TABLE STYLES
// ============================================

/** Table cell with nowrap */
export const tableNowrap = {
  whiteSpace: 'nowrap',
};

/** Table header cell */
export const tableHeaderCell = {
  fontWeight: 'bold',
  whiteSpace: 'nowrap',
};

/** Compact table cell */
export const compactCell = {
  py: 0.5,
  px: 1,
};

// ============================================
// FORM STYLES
// ============================================

/** Form field container */
export const formField = {
  mb: 2,
  width: '100%',
};

/** Form row with gap */
export const formRow = {
  display: 'flex',
  gap: 2,
  mb: 2,
};

/** Form actions */
export const formActions = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: 1,
  mt: 3,
  pt: 2,
  borderTop: 1,
  borderColor: 'divider',
};

// ============================================
// DIALOG STYLES
// ============================================

/** Dialog content with padding */
export const dialogContent = {
  p: 2,
};

/** Dialog actions */
export const dialogActions = {
  px: 3,
  pb: 2,
};

// ============================================
// STATUS & BADGES
// ============================================

/** Badge container */
export const badgeContainer = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 0.5,
};

/** Status indicator */
export const statusIndicator = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 0.5,
  px: 1,
  py: 0.25,
  borderRadius: 1,
};

// ============================================
// PAPER / CARD STYLES
// ============================================

/** Elevated paper */
export const elevatedPaper = {
  p: 2,
  borderRadius: 2,
};

/** Info box */
export const infoBox = {
  p: 2,
  bgcolor: 'info.light',
  borderRadius: 1,
};

/** Warning box */
export const warningBox = {
  p: 2,
  bgcolor: 'warning.light',
  borderRadius: 1,
};

/** Hover card effect */
export const hoverCard = {
  transition: 'all 0.2s ease-in-out',
  '&:hover': {
    transform: 'translateY(-2px)',
    boxShadow: 3,
  },
};

// ============================================
// RESPONSIVE STYLES
// ============================================

/** Hide on mobile */
export const hideOnMobile = {
  display: { xs: 'none', sm: 'flex' },
};

/** Show only on mobile */
export const showOnMobile = {
  display: { xs: 'flex', sm: 'none' },
};

/** Responsive flex direction */
export const responsiveFlex = {
  display: 'flex',
  flexDirection: { xs: 'column', sm: 'row' },
  gap: 2,
};

/** Responsive padding */
export const responsivePadding = {
  p: { xs: 1, sm: 2, md: 3 },
};

// ============================================
// ICON STYLES
// ============================================

/** Icon with right margin */
export const iconMr = {
  mr: 1,
};

/** Icon with left margin */
export const iconMl = {
  ml: 1,
};

/** Small icon */
export const iconSmall = {
  fontSize: '1rem',
};

/** Medium icon */
export const iconMedium = {
  fontSize: '1.25rem',
};

// ============================================
// SCROLL STYLES
// ============================================

/** Scrollable container */
export const scrollableY = {
  overflowY: 'auto',
  maxHeight: '100%',
};

/** Scrollable horizontal */
export const scrollableX = {
  overflowX: 'auto',
  maxWidth: '100%',
};

// ============================================
// OVERLAY STYLES
// ============================================

/** Overlay backdrop */
export const overlay = {
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  bgcolor: 'rgba(0, 0, 0, 0.5)',
  zIndex: 1,
};

// ============================================
// TYPOGRAPHY HELPERS
// ============================================

/** Bold text */
export const textBold = {
  fontWeight: 'bold',
};

/** Secondary text color */
export const textSecondary = {
  color: 'text.secondary',
};

/** Primary color text */
export const textPrimary = {
  color: 'primary.main',
};

/** Error color text */
export const textError = {
  color: 'error.main',
};

/** Success color text */
export const textSuccess = {
  color: 'success.main',
};

// ============================================
// COMPOSITE STYLES (często używane kombinacje)
// ============================================

/** Task details page - section title */
export const sectionTitle = {
  mb: 2,
  fontWeight: 'medium',
  color: 'primary.main',
};

/** Production task card header */
export const taskCardHeader = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  width: '100%',
};

/** Material row in task */
export const materialRow = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 1,
};

/** Chip container */
export const chipContainer = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 0.5,
};

/** Alert with margin */
export const alertWithMargin = {
  mt: 1,
};

/** Caption text with margin */
export const captionWithMargin = {
  ml: 1,
};

/** Text right aligned */
export const textRight = {
  textAlign: 'right',
};

/** Mobile button style */
export const mobileButton = (isMobile) => ({
  mr: 1,
  mb: isMobile ? 1 : 0,
});

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Łączy wiele obiektów stylów
 * @param {...object} styles - Obiekty stylów do połączenia
 * @returns {object} Połączony obiekt stylów
 */
export const combineStyles = (...styles) => {
  return Object.assign({}, ...styles);
};

/**
 * Tworzy obiekt sx z warunkowymi stylami
 * @param {object} baseStyles - Bazowe style
 * @param {boolean} condition - Warunek
 * @param {object} conditionalStyles - Style do dodania gdy warunek jest spełniony
 * @returns {object} Obiekt stylów
 */
export const conditionalStyles = (baseStyles, condition, conditionalStyles) => {
  return condition 
    ? { ...baseStyles, ...conditionalStyles }
    : baseStyles;
};

export default {
  // Flexbox
  flexCenter,
  flexBetween,
  flexEnd,
  flexStart,
  flexColumn,
  flexColumnCenter,
  flexWrap,
  flexRowGap,
  flexColumnGap,
  
  // Spacing
  mb1, mb2, mb3,
  mt1, mt2, mt3,
  mr1, mr2, ml1, ml2,
  mx1, mx2, my1, my2,
  p1, p2, p3,
  px1, px2, px3,
  py1, py2, py3,
  
  // Common patterns
  loadingContainer,
  cardHeader,
  sectionHeader,
  actionButtons,
  buttonRow,
  textCenter,
  fullWidth,
  
  // Table
  tableNowrap,
  tableHeaderCell,
  compactCell,
  
  // Form
  formField,
  formRow,
  formActions,
  
  // Dialog
  dialogContent,
  dialogActions,
  
  // Status
  badgeContainer,
  statusIndicator,
  
  // Paper/Card
  elevatedPaper,
  infoBox,
  warningBox,
  hoverCard,
  
  // Responsive
  hideOnMobile,
  showOnMobile,
  responsiveFlex,
  responsivePadding,
  
  // Icons
  iconMr,
  iconMl,
  iconSmall,
  iconMedium,
  
  // Scroll
  scrollableY,
  scrollableX,
  
  // Overlay
  overlay,
  
  // Typography
  textBold,
  textSecondary,
  textPrimary,
  textError,
  textSuccess,
  
  // Composite
  sectionTitle,
  taskCardHeader,
  materialRow,
  chipContainer,
  alertWithMargin,
  captionWithMargin,
  textRight,
  mobileButton,
  
  // Helpers
  combineStyles,
  conditionalStyles,
};

