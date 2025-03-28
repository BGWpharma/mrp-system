// src/components/common/Navbar.js
import React, { useState, useEffect } from 'react';
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
  styled,
  Tooltip
} from '@mui/material';
import { 
  Notifications, 
  ExitToApp, 
  Person,
  Search as SearchIcon,
  Settings as SettingsIcon,
  Brightness4 as DarkModeIcon,
  Brightness7 as LightModeIcon,
  Apps as AppsIcon,
  Translate as TranslateIcon
} from '@mui/icons-material';
import { useAuth } from '../../hooks/useAuth';
import { useTheme } from '../../contexts/ThemeContext';

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
  const { mode, toggleTheme } = useTheme();
  const [anchorEl, setAnchorEl] = useState(null);
  const [isTranslateVisible, setIsTranslateVisible] = useState(false);
  
  const handleMenu = (event) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  // Funkcja do usuwania widgetu tłumaczenia
  const removeTranslateWidget = () => {
    // Usuń kontener widgetu, jeśli istnieje
    const translateDiv = document.getElementById('google-translate-element');
    if (translateDiv) {
      translateDiv.innerHTML = '';
      translateDiv.style.display = 'none';
    }
    
    // Usuń iframe tłumaczenia Google
    const iframes = document.querySelectorAll('iframe.goog-te-menu-frame');
    iframes.forEach(iframe => iframe.remove());
    
    // Usuń pasek tłumaczenia Google na górze strony
    const gtBanners = document.querySelectorAll('.skiptranslate');
    gtBanners.forEach(banner => banner.remove());
    
    // Przywróć normalny widok strony
    if (document.body.style.top) {
      document.body.style.top = '';
    }
    
    // Usuń klasy dodane przez Google Translate
    document.body.classList.remove('translated-ltr');
    document.documentElement.classList.remove('translated-ltr');
    
    // Usuń cookie Google Translate
    document.cookie = 'googtrans=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
  };

  const handleTranslate = () => {
    // Przełączanie stanu widoczności widgetu
    setIsTranslateVisible(prevState => !prevState);
    
    // Jeśli widget jest już widoczny, usuń go
    if (isTranslateVisible) {
      removeTranslateWidget();
      // Usuń skrypt Google Translate
      const script = document.querySelector('script[src*="translate.google.com"]');
      if (script) {
        script.remove();
      }
      return;
    }
    
    // Dodanie oficjalnego widgetu Google Translate do strony
    // Funkcja, która zostanie wywołana po załadowaniu skryptu Google Translate
    const googleTranslateElementInit = () => {
      new window.google.translate.TranslateElement({
        pageLanguage: 'pl',
        includedLanguages: 'en',
        layout: window.google.translate.TranslateElement.InlineLayout.SIMPLE
      }, 'google-translate-element');
    };
    
    // Dodanie elementu kontenera, jeśli nie istnieje
    let translateDiv = document.getElementById('google-translate-element');
    if (!translateDiv) {
      translateDiv = document.createElement('div');
      translateDiv.id = 'google-translate-element';
      translateDiv.style.position = 'absolute';
      translateDiv.style.top = '60px';
      translateDiv.style.right = '10px';
      translateDiv.style.zIndex = '9999';
      document.body.appendChild(translateDiv);
    } else {
      translateDiv.style.display = 'block';
      translateDiv.innerHTML = '';
    }
    
    // Dodanie skryptu Google Translate, jeśli jeszcze nie został dodany
    if (!document.querySelector('script[src*="translate.google.com"]')) {
      // Dodanie funkcji inicjującej do globalnego obiektu window
      window.googleTranslateElementInit = googleTranslateElementInit;
      
      // Utworzenie i dodanie skryptu
      const script = document.createElement('script');
      script.src = '//translate.google.com/translate_a/element.js?cb=googleTranslateElementInit';
      script.async = true;
      document.head.appendChild(script);
    } else {
      // Jeśli skrypt już istnieje, spróbuj ponownie wywołać funkcję inicjującą
      if (window.google && window.google.translate) {
        googleTranslateElementInit();
      }
    }
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
        backgroundColor: mode === 'dark' ? '#182136' : '#ffffff',
        borderBottom: '1px solid',
        borderColor: mode === 'dark' ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)',
        color: mode === 'dark' ? '#ffffff' : 'rgba(0, 0, 0, 0.87)'
      }}
    >
      <Toolbar sx={{ justifyContent: 'space-between' }}>
        {/* Logo */}
        <Box sx={{ display: 'flex', alignItems: 'center', ml: 4 }}>
          <Link 
            to="/" 
            style={{ 
              textDecoration: 'none', 
              display: 'flex',
              alignItems: 'center'
            }}
          >
            <Box
              component="img"
              src={mode === 'dark' ? '/BGWPharma_Logo_DarkTheme.png' : '/BGWPharma_Logo_LightTheme.png'}
              alt="BGW Pharma Logo"
              sx={{ 
                height: '32px',
                maxWidth: '160px',
                padding: '3px 0',
                objectFit: 'contain',
                ml: 2
              }}
            />
          </Link>
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
          <Tooltip title={mode === 'dark' ? 'Przełącz na jasny motyw' : 'Przełącz na ciemny motyw'}>
            <IconButton 
              color="inherit" 
              sx={{ ml: 1 }}
              onClick={toggleTheme}
              aria-label={mode === 'dark' ? 'Przełącz na jasny motyw' : 'Przełącz na ciemny motyw'}
            >
              {mode === 'dark' ? <LightModeIcon /> : <DarkModeIcon />}
            </IconButton>
          </Tooltip>
          
          <Tooltip title="Przetłumacz na angielski">
            <IconButton 
              color="inherit" 
              sx={{ ml: 1 }}
              onClick={handleTranslate}
              aria-label="Przetłumacz na angielski"
            >
              <TranslateIcon />
            </IconButton>
          </Tooltip>
          
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
              border: '2px solid',
              borderColor: mode === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
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
                backgroundColor: mode === 'dark' ? '#182136' : '#ffffff',
                backgroundImage: 'none',
                border: '1px solid',
                borderColor: mode === 'dark' ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)',
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