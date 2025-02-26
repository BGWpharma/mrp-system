// src/components/common/Sidebar.js
import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { 
  Drawer, 
  List, 
  ListItem, 
  ListItemIcon, 
  ListItemText, 
  Divider,
  Typography,
  Box
} from '@mui/material';
import { 
  Dashboard as DashboardIcon, 
  MenuBook as RecipesIcon, 
  Schedule as ProductionIcon, 
  Inventory as InventoryIcon, 
  VerifiedUser as QualityIcon
} from '@mui/icons-material';

const Sidebar = () => {
  const location = useLocation();
  const drawerWidth = 240;
  
  const isActive = (path) => {
    return location.pathname.startsWith(path);
  };
  
  const menuItems = [
    { text: 'Dashboard', icon: <DashboardIcon />, path: '/' },
    { text: 'Receptury', icon: <RecipesIcon />, path: '/recipes' },
    { text: 'Produkcja', icon: <ProductionIcon />, path: '/production' },
    { text: 'Magazyn', icon: <InventoryIcon />, path: '/inventory' },
    { text: 'Jakość', icon: <QualityIcon />, path: '/quality' },
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
        ))}
      </List>
      <Divider />
    </Drawer>
  );
};

export default Sidebar;