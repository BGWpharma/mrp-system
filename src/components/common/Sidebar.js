// src/components/common/Sidebar.js
import React, { useState } from 'react';
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
  ListItemButton
} from '@mui/material';
import { 
  Dashboard as DashboardIcon, 
  MenuBook as RecipesIcon, 
  Schedule as ProductionIcon, 
  Inventory as InventoryIcon, 
  VerifiedUser as QualityIcon,
  ShoppingCart as OrdersIcon,
  ExpandLess,
  ExpandMore,
  CalendarMonth as CalendarIcon,
  ViewList as ListIcon,
  InsertChart as AnalyticsIcon
} from '@mui/icons-material';

const Sidebar = () => {
  const location = useLocation();
  const drawerWidth = 240;
  const [openProduction, setOpenProduction] = useState(location.pathname.startsWith('/production'));
  
  const isActive = (path) => {
    return location.pathname.startsWith(path);
  };
  
  const handleProductionClick = () => {
    setOpenProduction(!openProduction);
  };
  
  const menuItems = [
    { text: 'Dashboard', icon: <DashboardIcon />, path: '/' },
    { text: 'Receptury', icon: <RecipesIcon />, path: '/recipes' },
    { 
      text: 'Produkcja', 
      icon: <ProductionIcon />, 
      path: '/production',
      hasSubmenu: true,
      submenu: [
        { text: 'Lista zadań', icon: <ListIcon />, path: '/production' },
        { text: 'Kalendarz', icon: <CalendarIcon />, path: '/production/calendar' }
      ]
    },
    { text: 'Magazyn', icon: <InventoryIcon />, path: '/inventory' },
    { text: 'Jakość', icon: <QualityIcon />, path: '/quality' },
    { text: 'Zamówienia', icon: <OrdersIcon />, path: '/orders' },
    { text: 'Analizy i Raporty', icon: <AnalyticsIcon />, path: '/analytics' },
  ];

  return (
    <Drawer
      variant="permanent"
      sx={{
        width: drawerWidth,
        flexShrink: 0,
        '& .MuiDrawer-paper': {
          width: drawerWidth,
          boxSizing: 'border-box',
        },
      }}
    >
      <Box sx={{ p: 2 }}>
        <Typography variant="h6" component="div" align="center">
          Menu
        </Typography>
      </Box>
      <Divider />
      <List>
        {menuItems.map((item) => (
          item.hasSubmenu ? (
            <React.Fragment key={item.text}>
              <ListItemButton onClick={handleProductionClick} selected={isActive(item.path)}>
                <ListItemIcon>{item.icon}</ListItemIcon>
                <ListItemText primary={item.text} />
                {openProduction ? <ExpandLess /> : <ExpandMore />}
              </ListItemButton>
              <Collapse in={openProduction} timeout="auto" unmountOnExit>
                <List component="div" disablePadding>
                  {item.submenu.map((subItem) => (
                    <ListItem
                      button
                      key={subItem.text}
                      component={Link}
                      to={subItem.path}
                      selected={location.pathname === subItem.path}
                      sx={{ pl: 4 }}
                    >
                      <ListItemIcon>{subItem.icon}</ListItemIcon>
                      <ListItemText primary={subItem.text} />
                    </ListItem>
                  ))}
                </List>
              </Collapse>
            </React.Fragment>
          ) : (
            <ListItem 
              button 
              key={item.text} 
              component={Link} 
              to={item.path}
              selected={item.path === '/' ? location.pathname === '/' : isActive(item.path)}
            >
              <ListItemIcon>{item.icon}</ListItemIcon>
              <ListItemText primary={item.text} />
            </ListItem>
          )
        ))}
      </List>
      <Divider />
    </Drawer>
  );
};

export default Sidebar;