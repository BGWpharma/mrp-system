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
  Badge
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
  EventNote as MeetingIcon
} from '@mui/icons-material';
import { getExpiringBatches, getExpiredBatches } from '../../services/inventoryService';

// Styled components
const StyledListItemButton = styled(ListItemButton)(({ theme }) => ({
  borderRadius: theme.shape.borderRadius,
  margin: '4px 8px',
  padding: '8px 12px',
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
  margin: '4px 8px',
  padding: '8px 12px',
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

const Sidebar = () => {
  const location = useLocation();
  const drawerWidth = 240;
  const [openProduction, setOpenProduction] = useState(location.pathname.startsWith('/production'));
  const [openOrders, setOpenOrders] = useState(location.pathname.startsWith('/orders') || location.pathname.startsWith('/customers'));
  const [openInventory, setOpenInventory] = useState(location.pathname.startsWith('/inventory') || location.pathname.startsWith('/purchase-orders'));
  const [openCustomers, setOpenCustomers] = useState(location.pathname.startsWith('/customers') || location.pathname.startsWith('/orders'));
  const [openCRM, setOpenCRM] = useState(location.pathname.startsWith('/crm'));
  const [expiringItemsCount, setExpiringItemsCount] = useState(0);
  
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
  
  const handleProductionClick = () => {
    setOpenProduction(!openProduction);
  };
  
  const handleOrdersClick = () => {
    setOpenOrders(!openOrders);
  };

  const handleInventoryClick = () => {
    setOpenInventory(!openInventory);
  };
  
  const handleCustomersClick = () => {
    setOpenCustomers(!openCustomers);
  };
  
  const handleCRMClick = () => {
    setOpenCRM(!openCRM);
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
    { text: 'Klienci',
      icon: <CustomersIcon />,
      path: '/customers',
      hasSubmenu: true,
      children: [
        { text: 'Faktury', icon: <InvoicesIcon />, path: '/invoices' },
        { text: 'Lista klientów', icon: <CustomersIcon />, path: '/customers' },
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
        { text: 'CMR', icon: <WaybillIcon />, path: '/inventory/cmr' },
        { text: 'Dostawcy', icon: <SuppliersIcon />, path: '/suppliers' },
        { text: 'Stan magazynowy', icon: <InventoryIcon />, path: '/inventory' },
        { text: 'Zamówienia komponentów', icon: <PurchaseOrdersIcon />, path: '/purchase-orders' },
        { text: 'Terminy ważności', icon: <CalendarIcon />, path: '/inventory/expiry-dates' },
      ].sort((a, b) => a.text.localeCompare(b.text, 'pl'))
    },
    { text: 'Produkcja',
      icon: <ProductionIcon />,
      path: '/production',
      hasSubmenu: true,
      children: [
        { text: 'Kalendarz', icon: <CalendarIcon />, path: '/production/calendar' },
        { text: 'Zadania MO', icon: <ListIcon />, path: '/production' },
        { text: 'Prognoza zapotrzebowania', icon: <ForecastIcon />, path: '/production/forecast' },
      ].sort((a, b) => a.text.localeCompare(b.text, 'pl'))
    },
    { text: 'Receptury', icon: <RecipesIcon />, path: '/recipes' },
  ].sort((a, b) => a.text.localeCompare(b.text, 'pl'));

  return (
    <Drawer
      variant="permanent"
      sx={{
        width: drawerWidth,
        flexShrink: 0,
        '& .MuiDrawer-paper': {
          width: drawerWidth,
          boxSizing: 'border-box',
          backgroundColor: '#182136',
          border: 'none',
          backgroundImage: 'none',
          boxShadow: '4px 0 8px rgba(0, 0, 0, 0.1)',
        },
      }}
    >
      <Box 
        sx={{ 
          p: 2.5, 
          display: 'flex', 
          alignItems: 'center',
          justifyContent: 'flex-start',
          mb: 1
        }}
      >
        <Avatar 
          sx={{ 
            width: 32, 
            height: 32, 
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
            fontWeight: 'bold',
            fontSize: '1.1rem'
          }}
        >
          Widgets
        </Typography>
      </Box>
      <Divider sx={{ 
        borderColor: 'rgba(255, 255, 255, 0.08)',
        mb: 1 
      }} />
      <List component="nav" sx={{ p: 1 }}>
        {menuItems.map((item) => (
          item.children ? (
            <React.Fragment key={item.text}>
              <StyledListItemButton 
                onClick={item.text === 'Produkcja' ? handleProductionClick : 
                         item.text === 'Zamówienia' ? handleOrdersClick : 
                         item.text === 'Magazyn' ? handleInventoryClick :
                         item.text === 'Klienci' ? handleCustomersClick :
                         item.text === 'CRM' ? handleCRMClick : () => {}} 
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
                <ListItemText 
                  primary={item.text} 
                  primaryTypographyProps={{ 
                    fontSize: '0.875rem',
                    fontWeight: isActive(item.path) ? 'medium' : 'normal'
                  }} 
                />
                {(item.text === 'Produkcja' && openProduction) || 
                 (item.text === 'Zamówienia' && openOrders) ||
                 (item.text === 'Magazyn' && openInventory) ||
                 (item.text === 'Klienci' && openCustomers) ||
                 (item.text === 'CRM' && openCRM) ? <ExpandLess /> : <ExpandMore />}
              </StyledListItemButton>
              <Collapse 
                in={item.text === 'Produkcja' ? openProduction : 
                     item.text === 'Zamówienia' ? openOrders : 
                     item.text === 'Magazyn' ? openInventory :
                     item.text === 'Klienci' ? openCustomers :
                     item.text === 'CRM' ? openCRM : false} 
                timeout="auto" 
                unmountOnExit
              >
                <List component="div" disablePadding>
                  {item.children.map((subItem) => (
                    <StyledListItem
                      component={subItem.path ? Link : 'div'}
                      key={subItem.text}
                      to={subItem.path}
                      onClick={subItem.onClick}
                      selected={subItem.path ? location.pathname === subItem.path : false}
                      sx={{ pl: 4 }}
                    >
                      <Tooltip title={subItem.text} placement="right" arrow>
                        <ListItemIcon sx={{ minWidth: 36, color: 'inherit' }}>
                          {subItem.icon}
                        </ListItemIcon>
                      </Tooltip>
                      <ListItemText 
                        primary={subItem.text} 
                        primaryTypographyProps={{ 
                          fontSize: '0.875rem',
                          fontWeight: subItem.path && location.pathname === subItem.path ? 'medium' : 'normal'
                        }} 
                      />
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
              <ListItemText 
                primary={item.text} 
                primaryTypographyProps={{ 
                  fontSize: '0.875rem',
                  fontWeight: item.path === '/' 
                    ? location.pathname === '/' ? 'medium' : 'normal'
                    : isActive(item.path) ? 'medium' : 'normal'
                }} 
              />
            </StyledListItem>
          )
        ))}
      </List>
    </Drawer>
  );
};

export default Sidebar;