// src/components/common/Sidebar.js
import React, { useState, useEffect } from 'react';
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
  Bolt as ConsumptionIcon,
  FormatListNumbered as ForecastIcon,
  Assignment as TestsIcon,
  AssessmentOutlined as QualityReportsIcon,
  Inventory2 as WaybillIcon,
  Receipt as InvoicesIcon,
  Add as AddIcon,
  ContactPhone as CRMIcon,
  Contacts as ContactsIcon,
  Phone as CallIcon,
  Email as EmailIcon,
  EventNote as MeetingIcon,
  ListAlt as ListAltIcon,
  ChevronLeft as ChevronLeftIcon,
  Menu as MenuIcon,
  LocalShipping as ShippingIcon
} from '@mui/icons-material';
import { getExpiringBatches, getExpiredBatches } from '../../services/inventoryService';

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
  const [drawerWidth, setDrawerWidth] = useState(200);
  const [isDrawerOpen, setIsDrawerOpen] = useState(true);
  const [openSubmenu, setOpenSubmenu] = useState('');
  const [expiringItemsCount, setExpiringItemsCount] = useState(0);
  
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
      setOpenSubmenu('Magazyn');
    } else if (location.pathname.startsWith('/crm')) {
      setOpenSubmenu('CRM');
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
    { text: 'Dashboard', icon: <DashboardIcon />, path: '/' },
    { text: 'Analityka', icon: <AnalyticsIcon />, path: '/analytics' },
    { text: 'CRM',
      icon: <CRMIcon />,
      path: '/crm',
      hasSubmenu: true,
      children: [
        { text: 'Dashboard', icon: <DashboardIcon />, path: '/crm' },
        { text: 'Kontakty', icon: <ContactsIcon />, path: '/crm/contacts' },
        { text: 'Interakcje', icon: <CallIcon />, path: '/crm/interactions' },
        { text: 'Szanse sprzedaży', icon: <SuppliersIcon />, path: '/crm/opportunities' },
      ].sort((a, b) => a.text.localeCompare(b.text, 'pl'))
    },
    { text: 'Sprzedaż',
      icon: <CustomersIcon />,
      path: '/customers',
      hasSubmenu: true,
      children: [
        { text: 'Faktury', icon: <InvoicesIcon />, path: '/invoices' },
        { text: 'Klienci', icon: <CustomersIcon />, path: '/customers' },
        { text: 'Nowe zadanie produkcyjne', icon: <AddIcon />, path: '/production/create-from-order' },
        { text: 'Zamówienia', icon: <OrdersIcon />, path: '/orders' },
      ].sort((a, b) => a.text.localeCompare(b.text, 'pl'))
    },
    { text: 'Magazyn', 
      icon: <InventoryIcon />, 
      path: '/inventory', 
      badge: expiringItemsCount > 0 ? expiringItemsCount : null,
      hasSubmenu: true,
      children: [
        { text: 'CMR', icon: <ShippingIcon />, path: '/inventory/cmr' },
        { text: 'Dostawcy', icon: <SuppliersIcon />, path: '/suppliers' },
        { text: 'Inwentaryzacja', icon: <QualityReportsIcon />, path: '/inventory/stocktaking' },
        { text: 'Stan magazynowy', icon: <WarehouseIcon />, path: '/inventory' },
        { text: 'Terminy ważności', icon: <CalendarIcon />, path: '/inventory/expiry-dates' },
        { text: 'Zamówienia komponentów', icon: <PurchaseOrdersIcon />, path: '/purchase-orders' },
      ].sort((a, b) => a.text.localeCompare(b.text, 'pl'))
    },
    { text: 'Produkcja',
      icon: <ProductionIcon />,
      path: '/production',
      hasSubmenu: true,
      children: [
        { text: 'Kalendarz', icon: <CalendarIcon />, path: '/production/calendar' },
        { text: 'Receptury', icon: <RecipesIcon />, path: '/recipes' },
        { text: 'Zadania MO', icon: <ListIcon />, path: '/production' },
        { text: 'Prognoza zapotrzebowania', icon: <ForecastIcon />, path: '/production/forecast' },
      ].sort((a, b) => a.text.localeCompare(b.text, 'pl'))
    }
  ].sort((a, b) => a.text.localeCompare(b.text, 'pl'));

  return (
    <Drawer
      variant="permanent"
      open={isDrawerOpen}
      sx={{
        width: drawerWidth,
        flexShrink: 0,
        transition: 'width 0.3s ease',
        '& .MuiDrawer-paper': {
          width: drawerWidth,
          boxSizing: 'border-box',
          backgroundColor: '#182136',
          border: 'none',
          backgroundImage: 'none',
          boxShadow: '4px 0 8px rgba(0, 0, 0, 0.1)',
          overflowX: 'hidden',
          transition: 'width 0.3s ease',
        },
      }}
    >
      <Box 
        sx={{ 
          p: 1.8, 
          display: 'flex', 
          alignItems: 'center',
          justifyContent: 'space-between',
          mb: 0.5
        }}
      >
        {isDrawerOpen && (
          <>
            <Avatar 
              sx={{ 
                width: 28, 
                height: 28, 
                bgcolor: 'primary.main',
                backgroundImage: 'linear-gradient(135deg, #1976d2 30%, #42a5f5 90%)',
                mr: 1.5,
                boxShadow: '0 2px 6px rgba(0, 0, 0, 0.15)'
              }}
            >
              M
            </Avatar>
            <Typography 
              variant="h6" 
              component="div" 
              sx={{ 
                flexGrow: 1,
                fontWeight: 'bold',
                fontSize: '1rem'
              }}
            >
              Widgets
            </Typography>
          </>
        )}
        <IconButton onClick={toggleDrawer} size="small" sx={{ color: 'white' }}>
          {isDrawerOpen ? <ChevronLeftIcon /> : <MenuIcon />}
        </IconButton>
      </Box>

      <Divider sx={{ 
        borderColor: 'rgba(255, 255, 255, 0.08)',
        mb: 0.5 
      }} />

      <List 
        component="nav" 
        sx={{ 
          p: 0.5,
          overflowY: 'auto',
          overflowX: 'hidden',
          maxHeight: 'calc(100vh - 80px)',
          scrollbarWidth: 'thin',
          msOverflowStyle: 'none',
          '&::-webkit-scrollbar': {
            width: '6px',
            display: 'block',
          },
          '&::-webkit-scrollbar-track': {
            background: 'rgba(0, 0, 0, 0.1)',
            borderRadius: '3px',
          },
          '&::-webkit-scrollbar-thumb': {
            background: 'rgba(255, 255, 255, 0.15)',
            borderRadius: '3px',
          },
          '&::-webkit-scrollbar-thumb:hover': {
            background: 'rgba(255, 255, 255, 0.25)',
          },
          '&::-webkit-scrollbar:horizontal': {
            display: 'none',
          },
        }}
      >
        {menuItems.map((item) => (
          item.children ? (
            <React.Fragment key={item.text}>
              <StyledListItemButton 
                onClick={() => handleSubmenuClick(item.text)} 
                selected={isActive(item.path)}
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
                  <>
                    <ListItemText 
                      primary={item.text} 
                      primaryTypographyProps={{ 
                        fontSize: '0.875rem',
                        fontWeight: isActive(item.path) ? 'medium' : 'normal'
                      }} 
                    />
                    {openSubmenu === item.text ? <ExpandLess /> : <ExpandMore />}
                  </>
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
                }}>
                  {item.children.map((subItem) => (
                    <StyledListItem
                      component={subItem.path ? Link : 'div'}
                      key={subItem.text}
                      to={subItem.path}
                      onClick={subItem.onClick}
                      selected={subItem.path ? location.pathname === subItem.path : false}
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
    </Drawer>
  );
};

export default Sidebar;