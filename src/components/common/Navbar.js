// src/components/common/Navbar.js
import React from 'react';
import { Link } from 'react-router-dom';
import { AppBar, Toolbar, Typography, Button, IconButton, Avatar, Menu, MenuItem } from '@mui/material';
import { Notifications, ExitToApp, Person } from '@mui/icons-material';
import { useAuth } from '../../hooks/useAuth';

const Navbar = () => {
  const { currentUser, logout } = useAuth();
  const [anchorEl, setAnchorEl] = React.useState(null);
  
  const handleMenu = (event) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      console.error('Błąd podczas wylogowywania:', error);
    }
    handleClose();
  };

  return (
    <AppBar position="static">
      <Toolbar>
        <Typography variant="h6" component={Link} to="/" style={{ flexGrow: 1, textDecoration: 'none', color: 'white' }}>
          System MRP
        </Typography>
        
        <IconButton color="inherit">
          <Notifications />
        </IconButton>
        
        <div>
          <IconButton onClick={handleMenu} color="inherit">
            <Avatar src={currentUser?.photoURL || ''} alt={currentUser?.displayName || 'User'}>
              {!currentUser?.photoURL && <Person />}
            </Avatar>
          </IconButton>
          <Menu
            anchorEl={anchorEl}
            open={Boolean(anchorEl)}
            onClose={handleClose}
          >
            <MenuItem component={Link} to="/profile" onClick={handleClose}>Profil</MenuItem>
            <MenuItem onClick={handleLogout}>
              <ExitToApp fontSize="small" style={{ marginRight: 8 }} />
              Wyloguj
            </MenuItem>
          </Menu>
        </div>
      </Toolbar>
    </AppBar>
  );
};

export default Navbar;