// src/components/common/Sidebar.js
import React, { useState, useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { 
  Drawer, 
  List, 
  ListItem, 
  ListItemIcon, 
  ListItemText, 
  Typography,
  Box,
  Collapse,
  ListItemButton,
  alpha,
  styled,
  Tooltip,
  Badge,
  IconButton
} from '@mui/material';
import { 
  Dashboard as DashboardIcon, 
  Book as RecipesIcon, 
  Engineering as ProductionIcon, 
  Inventory as InventoryIcon, 
  FactCheck as QualityIcon,
  ShoppingCart as OrdersIcon,
  People as CustomersIcon,
  Assessment as AnalyticsIcon,
  Assessment as AssessmentIcon,
  ExpandLess,
  ExpandMore,
  CalendarMonth as CalendarIcon,
  ShoppingBasket as PurchaseOrdersIcon,
  Business as SuppliersIcon,
  Store as WarehouseIcon,
  List as ListIcon,
  BarChart as ReportsIcon,
  AssessmentOutlined as QualityReportsIcon,
  Receipt as InvoicesIcon,
  Add as AddIcon,
  ListAlt as ListAltIcon,
  ChevronLeft as ChevronLeftIcon,
  Menu as MenuIcon,
  LocalShipping as ShippingIcon,
  Calculate as CalculateIcon,
  Factory as FactoryIcon,
  PrecisionManufacturing as PrecisionManufacturingIcon,
  BugReport as BugReportIcon,
  HelpOutline as FaqIcon,
  Assignment as FormIcon,
  TrendingUp as ForecastIcon,
  ViewKanban as TaskboardIcon,
  Home as HomeIcon,
  Insights as InsightsIcon,
  AccessTime as AccessTimeIcon,
  CalendarMonth as CalendarMonthIcon
} from '@mui/icons-material';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../services/firebase/config';
import { refreshExpiryStats } from '../../services/cloudFunctionsService';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import BugReportDialog from './BugReportDialog';
import FaqDialog from './FaqDialog';
import { useSidebar } from '../../contexts/SidebarContext';
import { useTranslation } from '../../hooks/useTranslation';
import { getUserHiddenSidebarTabs, getUserHiddenSidebarSubtabs } from '../../services/userService';

// Styled components - Clean Design
const StyledListItemButton = styled(ListItemButton)(({ theme }) => ({
  borderRadius: '6px',
  margin: '2px 8px',
  padding: '8px 12px',
  border: 'none',
  transition: 'background-color 0.15s ease',
  '&.Mui-selected': {
    // Clean Design - solidny kolor zamiast gradient
    backgroundColor: theme.palette.mode === 'dark'
      ? 'rgba(59, 130, 246, 0.15)'
      : 'rgba(25, 118, 210, 0.12)',
    color: theme.palette.mode === 'dark' ? '#93c5fd' : '#1d4ed8',
    fontWeight: 600,
    border: 'none',
    '&:hover': {
      backgroundColor: theme.palette.mode === 'dark'
        ? 'rgba(59, 130, 246, 0.2)'
        : 'rgba(25, 118, 210, 0.16)',
      border: 'none',
    },
  },
  '&:hover': {
    backgroundColor: theme.palette.mode === 'dark' 
      ? 'rgba(255, 255, 255, 0.06)'
      : 'rgba(0, 0, 0, 0.04)',
    color: theme.palette.mode === 'dark' 
      ? 'inherit' 
      : '#1e293b',
    border: 'none',
  },
}));

// Clean Design - uproszczony StyledListItem
const StyledListItem = styled(ListItem)(({ theme }) => ({
  borderRadius: '6px',
  margin: '1px 12px',
  padding: '4px 8px',
  border: 'none !important',
  outline: 'none !important',
  boxShadow: 'none !important',
  backgroundColor: 'transparent !important',
  transition: 'background-color 0.15s ease',
  '&::before': {
    display: 'none !important',
  },
  '&::after': {
    display: 'none !important',
  },
  '&.Mui-selected': {
    backgroundColor: theme.palette.mode === 'dark'
      ? 'rgba(59, 130, 246, 0.12) !important'
      : 'rgba(25, 118, 210, 0.1) !important',
    borderLeft: theme.palette.mode === 'dark' 
      ? '2px solid #3b82f6' 
      : '2px solid #1976d2',
    borderRight: 'none !important',
    borderTop: 'none !important',
    borderBottom: 'none !important',
    outline: 'none !important',
    boxShadow: 'none !important',
    color: theme.palette.mode === 'dark' 
      ? '#93c5fd' 
      : '#1d4ed8',
    '&:hover': {
      backgroundColor: theme.palette.mode === 'dark'
        ? 'rgba(59, 130, 246, 0.18) !important'
        : 'rgba(25, 118, 210, 0.14) !important',
      borderRight: 'none !important',
      borderTop: 'none !important',
      borderBottom: 'none !important',
      outline: 'none !important',
      boxShadow: 'none !important',
    },
  },
  '&:hover': {
    backgroundColor: theme.palette.mode === 'dark' 
      ? 'rgba(255, 255, 255, 0.04) !important'
      : 'rgba(0, 0, 0, 0.03) !important',
    border: 'none !important',
    outline: 'none !important',
    boxShadow: 'none !important',
  },
}));

const StyledBadge = styled(Badge)(({ theme }) => ({
  '& .MuiBadge-badge': {
    backgroundColor: theme.palette.primary.main,
    color: theme.palette.primary.contrastText,
    fontSize: '0.65rem',
  },
}));

const Sidebar = ({ onToggle }) => {
  const location = useLocation();
  const { mode } = useTheme();
  const { t } = useTranslation('sidebar');
  const [drawerWidth, setDrawerWidth] = useState(200);
  const [isDrawerOpen, setIsDrawerOpen] = useState(true);
  const [openSubmenu, setOpenSubmenu] = useState('');
  const [expiringItemsCount, setExpiringItemsCount] = useState(0);
  const { currentUser } = useAuth();
  const [bugReportDialogOpen, setBugReportDialogOpen] = useState(false);
  const [faqDialogOpen, setFaqDialogOpen] = useState(false);
  const [hiddenTabs, setHiddenTabs] = useState([]);
  const [hiddenSubtabs, setHiddenSubtabs] = useState([]);
  
  // Funkcja do mapowania podzakładek na identyfikatory
  const getSubtabId = (parentTabId, subItem) => {
    // Mapowanie na podstawie ścieżki - zgodnie z definicją w getAvailableSidebarTabs
    const pathToIdMap = {
      // Dashboard
      '/': 'dashboard-main',
      '/taskboard': 'dashboard-taskboard',
      '/work-time': 'dashboard-worktime',
      '/schedule': 'dashboard-schedule',
      
      // Hall Data
      '/hall-data/conditions': 'hall-data-conditions',
      '/hall-data/machines': 'hall-data-machines',
      
      // Sales
      '/sales': 'sales-invoices',
      '/sales/quotation': 'sales-quotation',
      '/invoices': 'sales-invoices',
      '/orders': 'sales-customer-orders',
      '/orders/customers': 'sales-customer-orders',
      '/orders/price-lists': 'sales-customer-orders',
      '/customers': 'sales-customer-orders',
      '/sales/price-lists': 'sales-customer-orders', // legacy - redirect
      '/production/create-from-order': 'sales-production-task',
      
      // Production
      '/production/forms': 'production-forms',
      '/production/calculator': 'production-calculator',
      '/production': 'production-tasks',
      '/recipes': 'production-recipes',
      '/production/timeline': 'production-timeline',
      
      // Inventory
      '/inventory/cmr': 'inventory-cmr',
      '/suppliers': 'inventory-suppliers',
      '/inventory/forms': 'inventory-forms',
      '/inventory/stocktaking': 'inventory-stocktaking',
      '/inventory': 'inventory-status',
      '/inventory/expiry-dates': 'inventory-expiry-dates',
      '/purchase-orders': 'inventory-component-orders'
    };
    
    return pathToIdMap[subItem.path] || `${parentTabId}-${subItem.path.replace(/\//g, '-')}`;
  };
  
  // Używamy kontekstu sidebar
  const { isOpen, toggle, isMobile } = useSidebar();
  
  // Referencja do elementu Drawer
  const drawerRef = useRef(null);
  
  // Zarządzanie fokusem dla dostępności
  useEffect(() => {
    if (isMobile && isOpen && drawerRef.current) {
      // Po otwarciu sidebara na urządzeniu mobilnym, ustawienie fokusu na kontener menu
      const menuElement = drawerRef.current.querySelector('[role="menu"]') || 
                          drawerRef.current.querySelector('ul') ||
                          drawerRef.current;
      
      if (menuElement) {
        // Dodajemy małe opóźnienie, aby zapewnić, że sidebar zostanie otwarty przed ustawieniem fokusu
        setTimeout(() => {
          menuElement.focus();
        }, 100);
      }
    }
  }, [isMobile, isOpen]);
  
  // Wywołujemy callback onToggle przy zmianie stanu sidebara
  useEffect(() => {
    if (onToggle) {
      onToggle(!isDrawerOpen);
    }
  }, [isDrawerOpen, onToggle]);
  
  // Stan do śledzenia czy to jest ręczne kliknięcie
  const [isManualClick, setIsManualClick] = useState(false);
  const previousPath = useRef(location.pathname);
  
  useEffect(() => {
    // Sprawdź czy ścieżka się zmieniła (prawdziwa nawigacja)
    if (previousPath.current !== location.pathname) {
      setIsManualClick(false);
      previousPath.current = location.pathname;
    }
    
    // Nie resetuj submenu jeśli użytkownik ręcznie kliknął w zakładkę
    if (isManualClick) {
      return;
    }
    
    // Ustawia początkowy stan submenu na podstawie aktualnej ścieżki
    if (location.pathname.startsWith('/production') || location.pathname.startsWith('/recipes')) {
      setOpenSubmenu(t('production'));
    } else if (location.pathname.startsWith('/orders') || location.pathname.startsWith('/customers') || location.pathname.startsWith('/invoices') || location.pathname.startsWith('/sales/')) {
      setOpenSubmenu(t('sales'));
    } else if (location.pathname.startsWith('/inventory') || location.pathname.startsWith('/purchase-orders') || location.pathname.startsWith('/suppliers')) {
      setOpenSubmenu(t('inventory'));
    } else if (location.pathname === '/' || location.pathname.startsWith('/taskboard') || location.pathname.startsWith('/work-time') || location.pathname.startsWith('/schedule')) {
      setOpenSubmenu(t('dashboard'));
    } else if (location.pathname.startsWith('/analytics')) {
      setOpenSubmenu('');
    } else if (location.pathname.startsWith('/hall-data')) {
      setOpenSubmenu(t('hallData'));
    }
  }, [location.pathname, t, isManualClick]);
  
  // Ładowanie ukrytych zakładek i podzakładek użytkownika
  useEffect(() => {
    const loadUserHiddenTabs = async () => {
      if (currentUser?.uid) {
        try {
          const userHiddenTabs = await getUserHiddenSidebarTabs(currentUser.uid);
          setHiddenTabs(userHiddenTabs);
          
          const userHiddenSubtabs = await getUserHiddenSidebarSubtabs(currentUser.uid);
          setHiddenSubtabs(userHiddenSubtabs);
        } catch (error) {
          console.error('Błąd podczas ładowania ukrytych zakładek użytkownika:', error);
          setHiddenTabs([]);
          setHiddenSubtabs([]);
        }
      }
    };

    loadUserHiddenTabs();
  }, [currentUser?.uid]);

  useEffect(() => {
    let hasTriggeredRefresh = false;
    
    // ✅ OPTYMALIZACJA: Nasłuchuj na dokument agregatów zamiast pobierać wszystkie partie
    // Cloud Function updateExpiryStats aktualizuje ten dokument co godzinę
    // To redukuje liczbę odczytów z setek do 1
    const unsubscribe = onSnapshot(
      doc(db, 'aggregates', 'expiryStats'),
      async (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data();
          setExpiringItemsCount(data.totalCount || 0);
        } else {
          // Dokument jeszcze nie istnieje - wywołaj Cloud Function żeby go utworzyć
          setExpiringItemsCount(0);
          
          // Wywołaj refreshExpiryStats tylko raz (unikaj wielokrotnych wywołań)
          if (!hasTriggeredRefresh) {
            hasTriggeredRefresh = true;
            try {
              console.log('📊 Dokument agregatów nie istnieje - tworzę początkowe dane...');
              await refreshExpiryStats();
              console.log('✅ Początkowe agregaty utworzone pomyślnie');
            } catch (error) {
              console.warn('⚠️ Nie udało się utworzyć początkowych agregatów:', error.message);
              // Nie blokuj aplikacji - scheduled function utworzy je później
            }
          }
        }
      },
      (error) => {
        console.error('Błąd podczas nasłuchiwania na agregaty wygasających partii:', error);
        setExpiringItemsCount(0);
      }
    );

    return () => unsubscribe();
  }, []);
  
  const isActive = (path) => {
    return location.pathname.startsWith(path);
  };
  
  const isMenuActive = (menuPath) => {
    // Specjalne przypadki dla głównych sekcji
    if (menuPath === '/') {
      return location.pathname === '/' || location.pathname.startsWith('/taskboard');
    } else if (menuPath === '/sales') {
      // Sales obejmuje wszystkie ścieżki związane ze sprzedażą
      return location.pathname.startsWith('/customers') || 
             location.pathname.startsWith('/orders') || 
             location.pathname.startsWith('/invoices') ||
             location.pathname.startsWith('/sales/');
    } else if (menuPath === '/production') {
      // Production obejmuje wszystkie ścieżki związane z produkcją
      return location.pathname.startsWith('/production') || 
             location.pathname.startsWith('/recipes');
    } else if (menuPath === '/inventory') {
      // Inventory obejmuje wszystkie ścieżki związane z magazynem
      return location.pathname.startsWith('/inventory') || 
             location.pathname.startsWith('/purchase-orders') ||
             location.pathname.startsWith('/suppliers');
    } else {
      return location.pathname.startsWith(menuPath);
    }
  };
  
  const handleSubmenuClick = (menuTitle) => {
    // Oznacz że to jest ręczne kliknięcie
    setIsManualClick(true);
    
    // Jeśli kliknięto w otwarte submenu, zamykamy je
    if (openSubmenu === menuTitle) {
      setOpenSubmenu('');
    } else {
      // W przeciwnym razie zamykamy aktualne i otwieramy nowe
      setOpenSubmenu(menuTitle);
    }
  };

  const toggleDrawer = () => {
    setIsDrawerOpen(!isDrawerOpen);
    // Dostosuj szerokość sidebara w zależności od stanu
    setDrawerWidth(isDrawerOpen ? 60 : 200);
  };
  
  const allMenuItems = [
    { 
      id: 'dashboard',
      text: t('dashboard'), 
      icon: <DashboardIcon />, 
      path: '/',
      hasSubmenu: true,
      children: [
        { text: t('submenu.dashboard.taskboard'), icon: <TaskboardIcon />, path: '/taskboard' },
        { text: t('submenu.dashboard.workTime'), icon: <AccessTimeIcon />, path: '/work-time' },
        { text: t('submenu.dashboard.schedule'), icon: <CalendarMonthIcon />, path: '/schedule' },
      ].sort((a, b) => a.text.localeCompare(b.text))
    },
    { 
      id: 'analytics',
      text: t('analytics'), 
      icon: <InsightsIcon />, 
      path: '/analytics',
      hasSubmenu: false,
      children: []
    },
    { 
      id: 'hall-data',
      text: t('hallData'),
      icon: <FactoryIcon />,
      path: '/hall-data',
      hasSubmenu: true,
      children: [
        { text: t('submenu.hallData.environmentalConditions'), icon: <FactoryIcon />, path: '/hall-data/conditions' },
        { text: t('submenu.hallData.machines'), icon: <PrecisionManufacturingIcon />, path: '/hall-data/machines' },
        { text: t('submenu.hallData.forms'), icon: <FormIcon />, path: '/hall-data/forms' },
      ]
    },
    { 
      id: 'sales',
      text: t('sales'),
      icon: <CustomersIcon />,
      path: '/sales',
      hasSubmenu: true,
      children: [
        { text: t('submenu.sales.invoices'), icon: <InvoicesIcon />, path: '/sales' },
        { text: t('submenu.sales.quotation'), icon: <CalculateIcon />, path: '/sales/quotation' },
        { text: t('submenu.sales.customerOrders'), icon: <OrdersIcon />, path: '/orders' },
      ].sort((a, b) => a.text.localeCompare(b.text))
    },
    { 
      id: 'production',
      text: t('production'),
      icon: <ProductionIcon />,
      path: '/production',
      hasSubmenu: true,
      children: [
        { text: t('submenu.production.calculator'), icon: <CalculateIcon />, path: '/production/calculator' },
        { text: t('submenu.production.forecast'), icon: <ForecastIcon />, path: '/production/forecast' },
        { text: t('submenu.production.productionTasks'), icon: <ListIcon />, path: '/production' },
        { text: t('submenu.production.recipes'), icon: <RecipesIcon />, path: '/recipes' },
        { text: t('submenu.production.timeline'), icon: <AnalyticsIcon />, path: '/production/timeline' },
      ].sort((a, b) => a.text.localeCompare(b.text))
    },
    { 
      id: 'inventory',
      text: t('inventory'), 
      icon: <InventoryIcon />, 
      path: '/inventory', 
      badge: expiringItemsCount > 0 ? expiringItemsCount : null,
      hasSubmenu: true,
      children: [
        { text: t('submenu.inventory.cmr'), icon: <ShippingIcon />, path: '/inventory/cmr' },
        { text: t('submenu.inventory.forms'), icon: <ListAltIcon />, path: '/inventory/forms' },
        { text: t('submenu.inventory.status'), icon: <WarehouseIcon />, path: '/inventory' },
        { text: t('submenu.inventory.componentOrders'), icon: <PurchaseOrdersIcon />, path: '/purchase-orders' },
      ].sort((a, b) => a.text.localeCompare(b.text))
    },
  ].sort((a, b) => a.text.localeCompare(b.text));

  // Filtrowanie menuItems na podstawie ukrytych zakładek użytkownika
  const menuItems = allMenuItems.filter(item => !hiddenTabs.includes(item.id));
  


  return (
    <Drawer
      variant={isMobile ? "temporary" : "permanent"}
      anchor="left"
      open={isOpen}
      onClose={toggle}
      {...(isMobile && {
        keepMounted: false,
        disableEnforceFocus: true,
        disableAutoFocus: false,
      })}
      sx={{
        width: drawerWidth,
        flexShrink: 0,
        '& .MuiDrawer-paper': {
          width: drawerWidth,
          boxSizing: 'border-box',
          transition: 'width 0.2s ease',
          overflowX: 'hidden',
          // Clean Design - solidne tło bez glassmorphism
          background: mode === 'dark' ? '#1e293b' : '#ffffff',
          backgroundImage: 'none',
          borderRight: '1px solid',
          borderColor: mode === 'dark' 
            ? 'rgba(255, 255, 255, 0.06)'
            : 'rgba(0, 0, 0, 0.06)',
          height: '100vh',
          top: 0,
          left: 0, 
          display: 'flex',
          flexDirection: 'column',
          zIndex: (theme) => theme.zIndex.drawer + 1,
        },
        ...(isMobile && {
          '& .MuiBackdrop-root': {
            zIndex: (theme) => theme.zIndex.drawer,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
          },
          zIndex: (theme) => theme.zIndex.drawer + 2,
          position: 'relative'
        })
      }}
      ref={drawerRef}
    >
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          p: 1.5,
          borderBottom: '1px solid',
          borderColor: mode === 'dark' ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)',
          flexShrink: 0,
        }}
      >
        {isDrawerOpen && (
          <Typography
            variant="subtitle1"
            component="div"
            sx={{
              fontWeight: 600,
              fontSize: '0.75rem',
              color: mode === 'dark' ? '#94a3b8' : '#64748b',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              ml: 1,
            }}
          >
            Menu
          </Typography>
        )}
        <IconButton 
          onClick={toggleDrawer}
          sx={{ 
            p: 0.5, 
            color: mode === 'dark' ? '#94a3b8' : '#64748b',
            transition: 'background-color 0.15s ease',
            borderRadius: '6px',
            '&:hover': {
              backgroundColor: mode === 'dark'
                ? 'rgba(255, 255, 255, 0.06)'
                : 'rgba(0, 0, 0, 0.04)',
            }
          }}
        >
          {isDrawerOpen ? <ChevronLeftIcon /> : <MenuIcon />}
        </IconButton>
      </Box>

      <List 
        className="sidebar-list"
        sx={{ 
          pt: 1,
          flexGrow: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          backgroundColor: 'transparent !important',
          background: 'transparent !important',
          border: 'none !important',
          backdropFilter: 'none !important',
          '&::-webkit-scrollbar': {
            width: '8px',
          },
          '&::-webkit-scrollbar-track': {
            backgroundColor: mode === 'dark' ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)',
          },
          '&::-webkit-scrollbar-thumb': {
            backgroundColor: mode === 'dark' ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.2)',
            borderRadius: '4px',
          },
          '&::-webkit-scrollbar-thumb:hover': {
            backgroundColor: mode === 'dark' ? 'rgba(255, 255, 255, 0.3)' : 'rgba(0, 0, 0, 0.3)',
          }
        }}
        role="menu"
        aria-label="Menu nawigacyjne"
        tabIndex={-1}
      >
        {menuItems.map((item) => (
          item.children && item.children.length > 0 ? (
            <React.Fragment key={item.text}>
              <StyledListItemButton 
                onClick={() => handleSubmenuClick(item.text)} 
                selected={isMenuActive(item.path)}
                role="menuitem"
                aria-haspopup="true"
                aria-expanded={openSubmenu === item.text}
              >
                <Tooltip title={item.text} placement="right" arrow>
                  <ListItemIcon sx={{ 
                    minWidth: 36, 
                    color: isMenuActive(item.path) 
                      ? '#ffffff' // białe ikony dla aktywnych sekcji w obu motywach
                      : 'inherit' 
                  }}>
                    {item.badge ? (
                      <StyledBadge badgeContent={item.badge} color="primary">
                        {item.icon}
                      </StyledBadge>
                    ) : (
                      item.icon
                    )}
                  </ListItemIcon>
                </Tooltip>
                {isDrawerOpen && (
                  <Box component="div" sx={{ display: 'flex', alignItems: 'center', flexGrow: 1, pr: 1 }}>
                    <ListItemText 
                      primary={item.text} 
                      primaryTypographyProps={{ 
                        sx: {
                          fontSize: '0.875rem',
                          fontWeight: isMenuActive(item.path) ? 'bold' : 'normal',
                          color: isMenuActive(item.path) 
                            ? '#ffffff' // zawsze biały dla selected w obu motywach - gradient tła zapewnia kontrast
                            : 'inherit',
                          wordBreak: 'break-word',
                          overflowWrap: 'break-word',
                          lineHeight: 1.3,
                          whiteSpace: 'normal'
                        }
                      }}
                      sx={{
                        pr: 1,
                        '& .MuiTypography-root': {
                          wordBreak: 'break-word',
                          overflowWrap: 'break-word'
                        }
                      }}
                    />
                    {openSubmenu === item.text ? <ExpandLess /> : <ExpandMore />}
                  </Box>
                )}
              </StyledListItemButton>
              <Collapse 
                in={openSubmenu === item.text} 
                timeout="auto" 
                unmountOnExit
                sx={{
                  backgroundColor: 'transparent !important',
                  '& .MuiCollapse-wrapper': {
                    backgroundColor: 'transparent !important',
                  },
                  '& .MuiCollapse-wrapperInner': {
                    backgroundColor: 'transparent !important',
                  }
                }}
              >
                <List 
                  component="div" 
                  disablePadding 
                  className="sidebar-list"
                                     sx={{ 
                     overflowX: 'hidden',
                     backgroundColor: 'transparent !important',
                     background: 'transparent !important',
                     border: 'none !important',
                     backdropFilter: 'none !important',
                     '&::-webkit-scrollbar:horizontal': {
                       display: 'none',
                     },
                     '& .MuiListItem-divider': {
                       borderBottom: 'none !important',
                     }
                   }}
                  role="menu"
                  aria-label={`Podmenu ${item.text}`}
                >
                  {item.children
                    .filter((subItem) => {
                      // Filtrowanie podzakładek na podstawie ukrytych podzakładek
                      // Sprawdzamy czy podzakładka ma ID i czy nie jest ukryta
                      const subtabId = getSubtabId(item.id, subItem);
                      return !hiddenSubtabs.includes(subtabId);
                    })
                    .map((subItem) => (
                    <StyledListItem
                      component={subItem.path ? Link : 'div'}
                      key={subItem.text}
                      to={subItem.path}
                      onClick={subItem.onClick}
                      selected={subItem.path ? location.pathname === subItem.path : false}
                      divider={false}
                      role="menuitem"
                                             sx={{ 
                        pl: isDrawerOpen ? 4 : 2,
                        pr: 1, // Dodany padding prawy
                        borderRight: 'none !important',
                        borderTop: 'none !important',
                        borderBottom: 'none !important',
                        outline: 'none !important',
                        boxShadow: 'none !important',
                        '&::before': {
                          display: 'none !important',
                        },
                        '&::after': {
                          display: 'none !important',
                        },
                        // Zapewnienie prawidłowego layoutu dla długich tekstów
                        overflow: 'hidden',
                        alignItems: 'flex-start'
                      }}
                    >
                      <Tooltip title={subItem.text} placement="right" arrow>
                        <ListItemIcon sx={{ minWidth: 36, color: 'inherit' }}>
                          {subItem.badge ? (
                            <StyledBadge badgeContent={subItem.badge} color="primary">
                              {subItem.icon}
                            </StyledBadge>
                          ) : (
                            subItem.icon
                          )}
                        </ListItemIcon>
                      </Tooltip>
                      {isDrawerOpen && (
                        <ListItemText 
                          primary={subItem.text} 
                          primaryTypographyProps={{ 
                            sx: {
                              fontSize: '0.875rem',
                              fontWeight: subItem.path && location.pathname === subItem.path ? 'bold' : 'normal',
                              color: subItem.path && location.pathname === subItem.path
                                ? (mode === 'dark' ? '#ffffff' : '#1e293b') // biały dla dark mode, ciemny dla light mode
                                : 'inherit',
                              // Dodane style dla lepszego łamania tekstu
                              wordBreak: 'break-word',
                              overflowWrap: 'break-word',
                              hyphens: 'auto',
                              lineHeight: 1.3,
                              whiteSpace: 'normal'
                            }
                          }}
                          sx={{
                            pr: 4, // Padding prawy, żeby tekst nie stykał się z krawędzią
                            '& .MuiTypography-root': {
                              wordBreak: 'break-word',
                              overflowWrap: 'break-word'
                            }
                          }}
                        />
                      )}
                    </StyledListItem>
                  ))}
                </List>
              </Collapse>
            </React.Fragment>
          ) : (
            <StyledListItem 
              component={Link} 
              key={item.text} 
              to={item.path}
              role="menuitem"
              selected={item.path === '/' ? location.pathname === '/' : isActive(item.path)}
            >
              <Tooltip title={item.text} placement="right" arrow>
                <ListItemIcon sx={{ minWidth: 36, color: 'inherit' }}>
                  {item.badge ? (
                    <StyledBadge badgeContent={item.badge} color="primary">
                      {item.icon}
                    </StyledBadge>
                  ) : (
                    item.icon
                  )}
                </ListItemIcon>
              </Tooltip>
              {isDrawerOpen && (
                <ListItemText 
                  primary={item.text} 
                  primaryTypographyProps={{ 
                    sx: {
                      fontSize: '0.875rem',
                      fontWeight: item.path === '/' 
                        ? location.pathname === '/' ? 'bold' : 'normal'
                        : isActive(item.path) ? 'bold' : 'normal',
                      color: (item.path === '/' ? location.pathname === '/' : isActive(item.path))
                        ? '#ffffff' // biały tekst dla selected items - działa dla obu motywów dzięki gradientowi tła
                        : 'inherit',
                      wordBreak: 'break-word',
                      overflowWrap: 'break-word',
                      lineHeight: 1.3,
                      whiteSpace: 'normal'
                    }
                  }}
                  sx={{
                    pr: 2,
                    '& .MuiTypography-root': {
                      wordBreak: 'break-word',
                      overflowWrap: 'break-word'
                    }
                  }}
                />
              )}
            </StyledListItem>
          )
        ))}
      </List>
      
      <Box sx={{ 
        flexShrink: 0,
        borderTop: '1px solid', 
        borderColor: mode === 'dark' ? 'rgba(55, 65, 81, 0.5)' : 'rgba(148, 163, 184, 0.3)',
        background: mode === 'dark' 
          ? 'rgba(31, 41, 55, 0.9)' 
          : 'rgba(255, 255, 255, 0.9)',
        backdropFilter: 'blur(8px)',
        p: 1.5,
        position: 'relative',
        zIndex: 10
      }}>
        <StyledListItem 
          component="div"
          sx={{
            color: 'info.main',
            borderRadius: '8px',
            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            '&:hover': {
              background: 'linear-gradient(to right, rgba(33, 150, 243, 0.1), rgba(25, 118, 210, 0.1))',
              transform: 'translateX(4px)',
              boxShadow: '0 4px 12px rgba(33, 150, 243, 0.2)',
            },
            cursor: 'pointer',
            mb: 0.5
          }}
          onClick={() => setFaqDialogOpen(true)}
        >
          <Tooltip title={t('faq')} placement="right" arrow>
            <ListItemIcon sx={{ minWidth: 36, color: 'info.main' }}>
              <FaqIcon />
            </ListItemIcon>
          </Tooltip>
          {isDrawerOpen && (
            <ListItemText 
              primary={t('faq')} 
              primaryTypographyProps={{ 
                sx: {
                  fontSize: '0.875rem',
                  fontWeight: 'medium',
                  color: 'info.main',
                  wordBreak: 'break-word',
                  overflowWrap: 'break-word',
                  lineHeight: 1.3,
                  whiteSpace: 'normal'
                }
              }}
              sx={{
                pr: 2,
                '& .MuiTypography-root': {
                  wordBreak: 'break-word',
                  overflowWrap: 'break-word'
                }
              }}
            />
          )}
        </StyledListItem>
        <StyledListItem 
          component="div"
          sx={{
            color: 'error.main',
            borderRadius: '8px',
            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            '&:hover': {
              background: 'linear-gradient(to right, rgba(239, 68, 68, 0.1), rgba(220, 38, 38, 0.1))',
              transform: 'translateX(4px)',
              boxShadow: '0 4px 12px rgba(239, 68, 68, 0.2)',
            },
            cursor: 'pointer'
          }}
          onClick={() => setBugReportDialogOpen(true)}
        >
          <Tooltip title={t('reportBug')} placement="right" arrow>
            <ListItemIcon sx={{ minWidth: 36, color: 'error.main' }}>
              <BugReportIcon />
            </ListItemIcon>
          </Tooltip>
          {isDrawerOpen && (
            <ListItemText 
              primary={t('reportBug')} 
              primaryTypographyProps={{ 
                sx: {
                  fontSize: '0.875rem',
                  fontWeight: 'medium',
                  color: 'error.main',
                  wordBreak: 'break-word',
                  overflowWrap: 'break-word',
                  lineHeight: 1.3,
                  whiteSpace: 'normal'
                }
              }}
              sx={{
                pr: 2,
                '& .MuiTypography-root': {
                  wordBreak: 'break-word',
                  overflowWrap: 'break-word'
                }
              }}
            />
          )}
        </StyledListItem>
      </Box>
      
      <BugReportDialog 
        open={bugReportDialogOpen} 
        onClose={() => setBugReportDialogOpen(false)} 
      />
      <FaqDialog 
        open={faqDialogOpen} 
        onClose={() => setFaqDialogOpen(false)} 
      />
    </Drawer>
  );
};

export default Sidebar;