// src/components/common/Navbar.js
import React from 'react';
import { Link } from 'react-router-dom';
import { 
  AppBar, 
  Toolbar, 
  Typography, 
  IconButton, 
  Avatar, 
  Menu, 
  MenuItem, 
  Badge,
  Box,
  InputBase,
  alpha,
  styled
} from '@mui/material';
import { 
  Notifications, 
  ExitToApp, 
  Person,
  Search as SearchIcon,
  Settings as SettingsIcon,
  Brightness4 as DarkModeIcon,
  Apps as AppsIcon 
} from '@mui/icons-material';
import { useAuth } from '../../hooks/useAuth';

// Styled components
const SearchIconWrapper = styled('div')(({ theme }) => ({
  padding: theme.spacing(0, 2),
  height: '100%',
  position: 'absolute',
  pointerEvents: 'none',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
}));

const StyledInputBase = styled(InputBase)(({ theme }) => ({
  color: 'inherit',
  '& .MuiInputBase-input': {
    padding: theme.spacing(1, 1, 1, 0),
    paddingLeft: `calc(1em + ${theme.spacing(4)})`,
    transition: theme.transitions.create('width'),
    width: '100%',
    [theme.breakpoints.up('sm')]: {
      width: '28ch',
      '&:focus': {
        width: '38ch',
      },
    },
  },
  backgroundColor: alpha(theme.palette.common.white, 0.08),
  borderRadius: theme.shape.borderRadius,
  '&:hover': {
    backgroundColor: alpha(theme.palette.common.white, 0.12),
  },
  marginRight: theme.spacing(2),
  marginLeft: theme.spacing(2),
  width: 'auto',
}));

const StyledBadge = styled(Badge)(({ theme }) => ({
  '& .MuiBadge-badge': {
    backgroundColor: '#f50057',
    color: '#fff',
  },
}));

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
    <AppBar 
      position="static" 
      elevation={0}
      sx={{ 
        backgroundColor: '#182136',
        borderBottom: '1px solid rgba(255, 255, 255, 0.08)'
      }}
    >
      <Toolbar sx={{ justifyContent: 'space-between' }}>
        {/* Logo */}
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <Typography 
            variant="h6" 
            component={Link} 
            to="/" 
            sx={{ 
              textDecoration: 'none', 
              color: 'white',
              fontWeight: 'bold',
              fontSize: '1.3rem',
              display: 'flex',
              alignItems: 'center'
            }}
          >
            <Box
              component="span"
              sx={{
                backgroundColor: '#1976d2',
                backgroundImage: 'linear-gradient(135deg, #1976d2 30%, #42a5f5 90%)',
                borderRadius: '8px',
                padding: '6px',
                marginRight: '10px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 8px rgba(0, 0, 0, 0.15)'
              }}
            >
              M
            </Box>
            Maxton
          </Typography>
        </Box>
        
        {/* Search bar */}
        <Box sx={{ position: 'relative', flexGrow: 1, maxWidth: 500, mx: 2 }}>
          <SearchIconWrapper>
            <SearchIcon />
          </SearchIconWrapper>
          <StyledInputBase
            placeholder="Search…"
            inputProps={{ 'aria-label': 'search' }}
          />
        </Box>
        
        {/* Right side items */}
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <IconButton color="inherit" sx={{ ml: 1 }}>
            <DarkModeIcon />
          </IconButton>
          
          <IconButton color="inherit" sx={{ ml: 1 }}>
            <AppsIcon />
          </IconButton>
          
          <IconButton color="inherit" sx={{ ml: 1 }}>
            <StyledBadge badgeContent={3} max={99}>
              <Notifications />
            </StyledBadge>
          </IconButton>
          
          <IconButton 
            onClick={handleMenu} 
            color="inherit" 
            sx={{ 
              ml: 2,
              border: '2px solid rgba(255, 255, 255, 0.1)',
              padding: '4px'
            }}
          >
            <Avatar 
              src={currentUser?.photoURL || ''} 
              alt={currentUser?.displayName || 'User'}
              sx={{ width: 32, height: 32 }}
            >
              {!currentUser?.photoURL && <Person />}
            </Avatar>
          </IconButton>
          
          <Menu
            anchorEl={anchorEl}
            open={Boolean(anchorEl)}
            onClose={handleClose}
            transformOrigin={{ horizontal: 'right', vertical: 'top' }}
            anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
            PaperProps={{
              elevation: 3,
              sx: {
                mt: 1.5,
                backgroundColor: '#182136',
                backgroundImage: 'none',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                minWidth: 180
              }
            }}
          >
            <MenuItem component={Link} to="/profile" onClick={handleClose}>
              <Person fontSize="small" sx={{ mr: 1.5 }} />
              Profil
            </MenuItem>
            <MenuItem onClick={handleLogout}>
              <ExitToApp fontSize="small" sx={{ mr: 1.5 }} />
              Wyloguj
            </MenuItem>
          </Menu>
        </Box>
      </Toolbar>
    </AppBar>
  );
};

export default Navbar;