// src/components/common/Sidebar.js
import React, { useState, useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { 
  Drawer, 
  List, 
  ListItem, 
  ListItemIcon, 
  ListItemText, 
  Divider,
  Typography,
  Box,
  Collapse,
  ListItemButton,
  alpha,
  styled,
  Avatar,
  Tooltip,
  Badge,
  IconButton,
  ListSubheader
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
  Bolt as ConsumptionIcon,
  FormatListNumbered as ForecastIcon,
  Assignment as TestsIcon,
  AssessmentOutlined as QualityReportsIcon,
  Inventory2 as WaybillIcon,
  Receipt as InvoicesIcon,
  Add as AddIcon,
  Phone as CallIcon,
  Email as EmailIcon,
  EventNote as MeetingIcon,
  ListAlt as ListAltIcon,
  ChevronLeft as ChevronLeftIcon,
  Menu as MenuIcon,
  LocalShipping as ShippingIcon,
  SmartToy as AIAssistantIcon,
  Calculate as CalculateIcon,
  People as PeopleIcon,
  Settings as SettingsIcon,
  Factory as FactoryIcon,
  PrecisionManufacturing as PrecisionManufacturingIcon,
  BugReport as BugReportIcon
} from '@mui/icons-material';
import { getExpiringBatches, getExpiredBatches } from '../../services/inventoryService';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import BugReportDialog from './BugReportDialog';
import { useSidebar } from '../../contexts/SidebarContext';

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
  const [drawerWidth, setDrawerWidth] = useState(200);
  const [isDrawerOpen, setIsDrawerOpen] = useState(true);
  const [openSubmenu, setOpenSubmenu] = useState('');
  const [expiringItemsCount, setExpiringItemsCount] = useState(0);
  const { currentUser } = useAuth();
  const isAdmin = currentUser?.role === 'administrator';
  const [bugReportDialogOpen, setBugReportDialogOpen] = useState(false);
  
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
  
  useEffect(() => {
    // Ustawia początkowy stan submenu na podstawie aktualnej ścieżki
    if (location.pathname.startsWith('/production')) {
      setOpenSubmenu('Produkcja');
    } else if (location.pathname.startsWith('/orders') || location.pathname.startsWith('/customers')) {
      setOpenSubmenu('Sprzedaż');
    } else if (location.pathname.startsWith('/inventory') || location.pathname.startsWith('/purchase-orders')) {
      setOpenSubmenu('Stany');
    } else if (location.pathname === '/' || location.pathname.startsWith('/analytics')) {
      setOpenSubmenu('Dashboard');
    } else if (location.pathname.startsWith('/hall-data')) {
      setOpenSubmenu('Parametry hali');
    }
  }, [location.pathname]);
  
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
  
  const menuItems = [
    { text: 'Asystent AI',
      icon: <AIAssistantIcon />,
      path: '/ai-assistant',
      hasSubmenu: false
    },
    { text: 'Dashboard', 
      icon: <DashboardIcon />, 
      path: '/',
      hasSubmenu: true,
      children: [
        { text: 'Główny', icon: <DashboardIcon />, path: '/' },
        { text: 'Analityka', icon: <AnalyticsIcon />, path: '/analytics' },
      ].sort((a, b) => a.text.localeCompare(b.text, 'pl'))
    },
    { text: 'Parametry hali',
      icon: <FactoryIcon />,
      path: '/hall-data',
      hasSubmenu: true,
      children: [
        { text: 'Warunki środowiskowe', icon: <FactoryIcon />, path: '/hall-data/conditions' },
        { text: 'Maszyny', icon: <PrecisionManufacturingIcon />, path: '/hall-data/machines' },
      ]
    },
    { text: 'Sprzedaż',
      icon: <CustomersIcon />,
      path: '/customers',
      hasSubmenu: true,
      children: [
        { text: 'Faktury', icon: <InvoicesIcon />, path: '/invoices' },
        { text: 'Klienci', icon: <CustomersIcon />, path: '/customers' },
        { text: 'Listy cenowe', icon: <ListAltIcon />, path: '/sales/price-lists' },
        { text: 'Nowe zadanie produkcyjne', icon: <AddIcon />, path: '/production/create-from-order' },
        { text: 'Raporty CO', icon: <ReportsIcon />, path: '/sales/co-reports' },
        { text: 'Zamówienia klientów', icon: <OrdersIcon />, path: '/orders' },
      ].sort((a, b) => a.text.localeCompare(b.text, 'pl'))
    },
    { text: 'Produkcja',
      icon: <ProductionIcon />,
      path: '/production',
      hasSubmenu: true,
      children: [
        { text: 'Formularze', icon: <ListAltIcon />, path: '/production/forms' },
        { text: 'Kalendarz', icon: <CalendarIcon />, path: '/production/calendar' },
        { text: 'Kalkulator', icon: <CalculateIcon />, path: '/production/calculator' },
        { text: 'Lista zadań produkcyjnych', icon: <ListIcon />, path: '/production' },
        { text: 'Receptury', icon: <RecipesIcon />, path: '/recipes' },
        { text: 'Timeline (WIP)', icon: <AnalyticsIcon />, path: '/production/timeline' },
      ].sort((a, b) => a.text.localeCompare(b.text, 'pl'))
    },
    { text: 'Stany', 
      icon: <InventoryIcon />, 
      path: '/inventory', 
      badge: expiringItemsCount > 0 ? expiringItemsCount : null,
      hasSubmenu: true,
      children: [
        { text: 'CMR', icon: <ShippingIcon />, path: '/inventory/cmr' },
        { text: 'Dostawcy', icon: <SuppliersIcon />, path: '/suppliers' },
        { text: 'Interakcje zakupowe', icon: <CallIcon />, path: '/crm/interactions' },
        { text: 'Inwentaryzacja', icon: <QualityReportsIcon />, path: '/inventory/stocktaking' },
        { text: 'Stan', icon: <WarehouseIcon />, path: '/inventory' },
        { text: 'Terminy ważności', icon: <CalendarIcon />, path: '/inventory/expiry-dates' },
        { text: 'Zamówienia komponentów', icon: <PurchaseOrdersIcon />, path: '/purchase-orders' },
      ].sort((a, b) => a.text.localeCompare(b.text, 'pl'))
    }
  ].sort((a, b) => a.text.localeCompare(b.text, 'pl'));

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
                  {item.children.map((subItem) => (
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
                          {subItem.icon}
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
          <Tooltip title="Zgłoś błąd" placement="right" arrow>
            <ListItemIcon sx={{ minWidth: 36, color: 'error.main' }}>
              <BugReportIcon />
            </ListItemIcon>
          </Tooltip>
          {isDrawerOpen && (
            <ListItemText 
              primary="Zgłoś błąd" 
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