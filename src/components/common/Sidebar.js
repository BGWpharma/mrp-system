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
  ExpandLess,
  ExpandMore,
  CalendarMonth as CalendarIcon,
  ShoppingBasket as PurchaseOrdersIcon,
  Business as SuppliersIcon,
  Store as WarehouseIcon,
  List as ListIcon,
  BarChart as ReportsIcon,
  FormatListNumbered as ForecastIcon,
  AssessmentOutlined as QualityReportsIcon,
  Receipt as InvoicesIcon,
  Add as AddIcon,
  ListAlt as ListAltIcon,
  ChevronLeft as ChevronLeftIcon,
  Menu as MenuIcon,
  LocalShipping as ShippingIcon,
  SmartToy as AIAssistantIcon,

  Calculate as CalculateIcon,
  Factory as FactoryIcon,
  PrecisionManufacturing as PrecisionManufacturingIcon,
  BugReport as BugReportIcon
} from '@mui/icons-material';
import { getExpiringBatches, getExpiredBatches } from '../../services/inventory';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import BugReportDialog from './BugReportDialog';
import { useSidebar } from '../../contexts/SidebarContext';
import { useTranslation } from '../../hooks/useTranslation';
import { getUserHiddenSidebarTabs, getUserHiddenSidebarSubtabs } from '../../services/userService';

// Styled components
const StyledListItemButton = styled(ListItemButton)(({ theme }) => ({
  borderRadius: theme.shape.borderRadius,
  margin: '2px 4px',
  padding: '6px 8px',
  '&.Mui-selected': {
    backgroundColor: alpha(theme.palette.primary.main, 0.15),
    '&:hover': {
      backgroundColor: alpha(theme.palette.primary.main, 0.25),
    },
  },
  '&:hover': {
    backgroundColor: alpha(theme.palette.common.white, 0.05),
  },
  transition: theme.transitions.create(['background-color', 'box-shadow'], {
    duration: 200,
  }),
}));

const StyledListItem = styled(ListItem)(({ theme }) => ({
  borderRadius: theme.shape.borderRadius,
  margin: '2px 4px',
  padding: '6px 8px',
  '&.Mui-selected': {
    backgroundColor: alpha(theme.palette.primary.main, 0.15),
    '&:hover': {
      backgroundColor: alpha(theme.palette.primary.main, 0.25),
    },
  },
  '&:hover': {
    backgroundColor: alpha(theme.palette.common.white, 0.05),
  },
  transition: theme.transitions.create(['background-color', 'box-shadow'], {
    duration: 200,
  }),
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
  const [hiddenTabs, setHiddenTabs] = useState([]);
  const [hiddenSubtabs, setHiddenSubtabs] = useState([]);
  
  // Funkcja do mapowania podzakładek na identyfikatory
  const getSubtabId = (parentTabId, subItem) => {
    // Mapowanie na podstawie ścieżki - zgodnie z definicją w getAvailableSidebarTabs
    const pathToIdMap = {
      // Dashboard
      '/': 'dashboard-main',
      '/analytics': 'dashboard-analytics',
      
      // Hall Data
      '/hall-data/conditions': 'hall-data-conditions',
      '/hall-data/machines': 'hall-data-machines',
      
      // Sales
      '/invoices': 'sales-invoices',
      '/customers': 'sales-customers',
      '/sales/price-lists': 'sales-pricelists',
      '/production/create-from-order': 'sales-production-task',
      '/sales/co-reports': 'sales-co-reports',
      '/orders': 'sales-customer-orders',
      
      // Production
      '/production/forms': 'production-forms',
      '/production/calculator': 'production-calculator',
      '/production/forecast': 'production-forecast',
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
    if (location.pathname.startsWith('/production')) {
      setOpenSubmenu(t('production'));
    } else if (location.pathname.startsWith('/orders') || location.pathname.startsWith('/customers')) {
      setOpenSubmenu(t('sales'));
    } else if (location.pathname.startsWith('/inventory') || location.pathname.startsWith('/purchase-orders')) {
      setOpenSubmenu(t('inventory'));
    } else if (location.pathname === '/' || location.pathname.startsWith('/analytics')) {
      setOpenSubmenu(t('dashboard'));
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
    const fetchExpiringProducts = async () => {
      try {
        // Pobierz produkty zbliżające się do końca terminu ważności (domyślnie 30 dni)
        const expiringBatches = await getExpiringBatches(30);
        // Pobierz produkty, które już są przeterminowane
        const expiredBatches = await getExpiredBatches();
        // Łączna ilość produktów wygasających i przeterminowanych
        setExpiringItemsCount(expiringBatches.length + expiredBatches.length);
      } catch (error) {
        console.error('Błąd podczas pobierania danych o wygasających produktach:', error);
        setExpiringItemsCount(0);
      }
    };

    fetchExpiringProducts();
    
    // Odświeżaj dane co 30 minut
    const intervalId = setInterval(fetchExpiringProducts, 30 * 60 * 1000);
    
    return () => clearInterval(intervalId);
  }, []);
  
  const isActive = (path) => {
    return location.pathname.startsWith(path);
  };
  
  const isMenuActive = (menuPath) => {
    if (menuPath === '/') {
      return location.pathname === '/' || location.pathname.startsWith('/analytics');
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
      id: 'ai-assistant',
      text: t('aiAssistant'),
      icon: <AIAssistantIcon />,
      path: '/ai-assistant',
      hasSubmenu: false
    },

    { 
      id: 'dashboard',
      text: t('dashboard'), 
      icon: <DashboardIcon />, 
      path: '/',
      hasSubmenu: true,
      children: [
        { text: t('submenu.dashboard.main'), icon: <DashboardIcon />, path: '/' },
        { text: t('submenu.dashboard.analytics'), icon: <AnalyticsIcon />, path: '/analytics' },
      ].sort((a, b) => a.text.localeCompare(b.text))
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
      ]
    },
    { 
      id: 'sales',
      text: t('sales'),
      icon: <CustomersIcon />,
      path: '/customers',
      hasSubmenu: true,
      children: [
        { text: t('submenu.sales.invoices'), icon: <InvoicesIcon />, path: '/invoices' },
        { text: t('submenu.sales.customers'), icon: <CustomersIcon />, path: '/customers' },
        { text: t('submenu.sales.priceLists'), icon: <ListAltIcon />, path: '/sales/price-lists' },
        { text: t('submenu.sales.newProductionTask'), icon: <AddIcon />, path: '/production/create-from-order' },
        { text: t('submenu.sales.coReports'), icon: <ReportsIcon />, path: '/sales/co-reports' },
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
        { text: t('submenu.production.forms'), icon: <ListAltIcon />, path: '/production/forms' },
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
        { text: t('submenu.inventory.suppliers'), icon: <SuppliersIcon />, path: '/suppliers' },
        { text: t('submenu.inventory.forms'), icon: <ListAltIcon />, path: '/inventory/forms' },
        { text: t('submenu.inventory.stocktaking'), icon: <QualityReportsIcon />, path: '/inventory/stocktaking' },
        { text: t('submenu.inventory.status'), icon: <WarehouseIcon />, path: '/inventory' },
        { text: t('submenu.inventory.expiryDates'), icon: <CalendarIcon />, path: '/inventory/expiry-dates', badge: expiringItemsCount > 0 ? expiringItemsCount : null },
        { text: t('submenu.inventory.componentOrders'), icon: <PurchaseOrdersIcon />, path: '/purchase-orders' },
      ].sort((a, b) => a.text.localeCompare(b.text))
    }
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
          transition: 'width 225ms cubic-bezier(0.4, 0, 0.6, 1) 0ms',
          overflowX: 'hidden',
          backgroundColor: mode === 'dark' ? '#182136' : '#ffffff',
          borderRight: '1px solid',
          borderColor: mode === 'dark' ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.08)',
          height: '100%', 
          display: 'flex',
          flexDirection: 'column',
          zIndex: (theme) => theme.zIndex.drawer + 1,
        },
        ...(isMobile && {
          '& .MuiBackdrop-root': {
            zIndex: (theme) => theme.zIndex.drawer,
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
          borderColor: mode === 'dark' ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.08)',
          flexShrink: 0,
        }}
      >
        {isDrawerOpen && (
          <Typography
            variant="subtitle1"
            component="div"
            sx={{
              fontWeight: 'bold',
              fontSize: '0.875rem',
              color: mode === 'dark' ? 'rgba(255, 255, 255, 0.7)' : 'rgba(0, 0, 0, 0.6)',
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
          sx={{ p: 0.5, color: mode === 'dark' ? 'rgba(255, 255, 255, 0.7)' : 'rgba(0, 0, 0, 0.6)' }}
        >
          {isDrawerOpen ? <ChevronLeftIcon /> : <MenuIcon />}
        </IconButton>
      </Box>

      <List sx={{ 
        pt: 1,
        flexGrow: 1,
        overflowY: 'auto',
        overflowX: 'hidden',
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
          item.children ? (
            <React.Fragment key={item.text}>
              <StyledListItemButton 
                onClick={() => handleSubmenuClick(item.text)} 
                selected={isMenuActive(item.path)}
                role="menuitem"
                aria-haspopup="true"
                aria-expanded={openSubmenu === item.text}
                sx={{
                  backgroundColor: isMenuActive(item.path) ? alpha('#3f51b5', 0.15) : 'transparent',
                  color: isMenuActive(item.path) ? 'primary.main' : 'inherit'
                }}
              >
                <Tooltip title={item.text} placement="right" arrow>
                  <ListItemIcon sx={{ 
                    minWidth: 36, 
                    color: isMenuActive(item.path) ? 'primary.main' : 'inherit' 
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
                  <Box component="div" sx={{ display: 'flex', alignItems: 'center', flexGrow: 1 }}>
                    <ListItemText 
                      primary={item.text} 
                      primaryTypographyProps={{ 
                        fontSize: '0.875rem',
                        fontWeight: isMenuActive(item.path) ? 'medium' : 'normal',
                        color: isMenuActive(item.path) ? 'primary.main' : 'inherit'
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
              >
                <List component="div" disablePadding sx={{ 
                  overflowX: 'hidden',
                  '&::-webkit-scrollbar:horizontal': {
                    display: 'none',
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
                      role="menuitem"
                      sx={{ pl: isDrawerOpen ? 4 : 2 }}
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
                            fontSize: '0.875rem',
                            fontWeight: subItem.path && location.pathname === subItem.path ? 'medium' : 'normal'
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
                    fontSize: '0.875rem',
                    fontWeight: item.path === '/' 
                      ? location.pathname === '/' ? 'medium' : 'normal'
                      : isActive(item.path) ? 'medium' : 'normal'
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
        borderColor: mode === 'dark' ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.08)',
        backgroundColor: mode === 'dark' ? '#182136' : '#ffffff',
        p: 1.5
      }}>
        <StyledListItem 
          component="div"
          sx={{
            color: 'error.main',
            '&:hover': {
              backgroundColor: alpha('#f44336', 0.08),
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
                fontSize: '0.875rem',
                fontWeight: 'medium',
                color: 'error.main'
              }} 
            />
          )}
        </StyledListItem>
      </Box>
      
      <BugReportDialog 
        open={bugReportDialogOpen} 
        onClose={() => setBugReportDialogOpen(false)} 
      />
    </Drawer>
  );
};

export default Sidebar;