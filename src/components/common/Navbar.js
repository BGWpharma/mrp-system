// src/components/common/Navbar.js
import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
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
  Tooltip,
  CircularProgress,
  Paper,
  List,
  ListItem,
  ListItemText,
  Chip,
  Divider,
  ListItemIcon
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
  Translate as TranslateIcon,
  People as PeopleIcon,
  AdminPanelSettings as AdminIcon,
  BugReport as BugReportIcon
} from '@mui/icons-material';
import { useAuth } from '../../hooks/useAuth';
import { useTheme } from '../../contexts/ThemeContext';
import { 
  getAllPurchaseOrders, 
  getPurchaseOrderById 
} from '../../services/purchaseOrderService';
import { getAllOrders, getOrderById } from '../../services/orderService';
import { getAllTasks } from '../../services/productionService';
import NotificationsMenu from './NotificationsMenu';
import { getAllInventoryItems } from '../../services/inventoryService';
import { getDocs, collection } from 'firebase/firestore';
import { db } from '../../services/firebase/config';

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

const Navbar = () => {
  const { currentUser, logout } = useAuth();
  const { mode, toggleTheme } = useTheme();
  const [anchorEl, setAnchorEl] = useState(null);
  const [isTranslateVisible, setIsTranslateVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const navigate = useNavigate();
  const searchTimeout = useRef(null);
  const searchResultsRef = useRef(null);
  
  const isAdmin = currentUser?.role === 'administrator';
  
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

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (searchResultsRef.current && !searchResultsRef.current.contains(event.target)) {
        setIsSearchFocused(false);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleSearch = async (query) => {
    if (query.trim() === '') {
      setSearchResults([]);
      return;
    }
    
    setIsSearching(true);
    
    try {
      // Pobierz dane z różnych źródeł
      const [purchaseOrders, customerOrders, productionTasks, inventoryItems] = await Promise.all([
        getAllPurchaseOrders(),
        getAllOrders(),
        getAllTasks(),
        getAllInventoryItems()
      ]);
      
      const queryLower = query.toLowerCase();
      
      // Filtruj zamówienia zakupowe
      const filteredPOs = purchaseOrders
        .filter(po => 
          po.number?.toLowerCase().includes(queryLower) || 
          po.supplier?.name?.toLowerCase().includes(queryLower)
        )
        .map(po => ({
          id: po.id,
          number: po.number,
          title: `PO: ${po.number} - ${po.supplier?.name || 'Dostawca nieznany'}`,
          type: 'purchaseOrder',
          date: po.orderDate || po.createdAt,
          status: po.status
        }));
      
      // Filtruj zamówienia klientów
      const filteredCOs = customerOrders
        .filter(co => 
          co.orderNumber?.toLowerCase().includes(queryLower) || 
          co.customer?.name?.toLowerCase().includes(queryLower)
        )
        .map(co => ({
          id: co.id,
          number: co.orderNumber,
          title: `CO: ${co.orderNumber} - ${co.customer?.name || 'Klient nieznany'}`,
          type: 'customerOrder',
          date: co.orderDate || co.createdAt,
          status: co.status
        }));
      
      // Filtruj zadania produkcyjne (dodaj wyszukiwanie po lotNumber)
      const filteredMOs = productionTasks
        .filter(mo => 
          mo.moNumber?.toLowerCase().includes(queryLower) || 
          mo.name?.toLowerCase().includes(queryLower) ||
          mo.productName?.toLowerCase().includes(queryLower) ||
          mo.lotNumber?.toLowerCase().includes(queryLower)
        )
        .map(mo => ({
          id: mo.id,
          number: mo.moNumber,
          title: `MO: ${mo.moNumber} - ${mo.productName || mo.name || 'Produkt nieznany'}`,
          type: 'productionTask',
          date: mo.scheduledDate || mo.createdAt,
          status: mo.status,
          // Dodaj informację o LOT jeśli dostępna
          lotInfo: mo.lotNumber ? `LOT: ${mo.lotNumber}` : null
        }));
        
      // Pobierz wszystkie partie z bazy danych
      const batchesSnapshot = await getDocs(collection(db, 'inventoryBatches'));
      const batches = batchesSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      // Filtruj partie po LOT, numerze partii, nazwie produktu
      const filteredBatches = batches
        .filter(batch => 
          batch.lotNumber?.toLowerCase().includes(queryLower) || 
          batch.batchNumber?.toLowerCase().includes(queryLower) ||
          batch.itemName?.toLowerCase().includes(queryLower)
        )
        .map(batch => {
          // Znajdź nazwę produktu dla partii
          const item = inventoryItems.find(item => item.id === batch.itemId);
          return {
            id: batch.id,
            itemId: batch.itemId,
            number: batch.lotNumber || batch.batchNumber,
            title: `LOT: ${batch.lotNumber || batch.batchNumber} - ${batch.itemName || 'Produkt nieznany'}`,
            type: 'inventoryBatch',
            date: batch.receivedDate || batch.createdAt,
            quantity: batch.quantity,
            unit: item?.unit || 'szt.',
            expiryDate: batch.expiryDate
          };
        });
      
      // Połącz wyniki i ogranicz liczbę
      const combinedResults = [...filteredPOs, ...filteredCOs, ...filteredMOs, ...filteredBatches]
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .slice(0, 15);
      
      setSearchResults(combinedResults);
    } catch (error) {
      console.error('Błąd podczas wyszukiwania:', error);
    } finally {
      setIsSearching(false);
    }
  };
  
  const handleSearchChange = (event) => {
    const query = event.target.value;
    setSearchQuery(query);
    
    // Anuluj poprzednie wyszukiwanie
    if (searchTimeout.current) {
      clearTimeout(searchTimeout.current);
    }
    
    // Opóźnij wyszukiwanie, aby zmniejszyć obciążenie bazy danych
    searchTimeout.current = setTimeout(() => {
      handleSearch(query);
    }, 300);
  };
  
  const handleSearchFocus = () => {
    setIsSearchFocused(true);
    if (searchQuery.trim() !== '') {
      handleSearch(searchQuery);
    }
  };
  
  const handleResultClick = (result) => {
    setIsSearchFocused(false);
    setSearchQuery('');
    
    // Nawiguj do odpowiedniego detalu
    if (result.type === 'purchaseOrder') {
      navigate(`/purchase-orders/${result.id}`);
    } else if (result.type === 'customerOrder') {
      navigate(`/orders/${result.id}`);
    } else if (result.type === 'productionTask') {
      navigate(`/production/tasks/${result.id}`);
    } else if (result.type === 'inventoryBatch') {
      navigate(`/inventory/${result.itemId}/batches?batchId=${result.id}`);
    }
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
        <Box sx={{ position: 'relative', flexGrow: 1, maxWidth: 500, mx: 2 }} ref={searchResultsRef}>
          <SearchIconWrapper>
            <SearchIcon />
          </SearchIconWrapper>
          <StyledInputBase
            placeholder="Szukaj PO, CO, MO, LOT..."
            inputProps={{ 'aria-label': 'search' }}
            value={searchQuery}
            onChange={handleSearchChange}
            onFocus={handleSearchFocus}
            sx={{
              width: '100%',
              '& .MuiInputBase-input': {
                paddingRight: isSearching ? '30px' : '8px',
              }
            }}
          />
          {isSearching && (
            <CircularProgress 
              size={20} 
              sx={{ 
                position: 'absolute', 
                right: 16, 
                top: '50%', 
                transform: 'translateY(-50%)',
                color: theme => theme.palette.text.secondary
              }} 
            />
          )}
          
          {/* Wyniki wyszukiwania */}
          {isSearchFocused && searchResults.length > 0 && (
            <Paper
              sx={{
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                zIndex: 1000,
                mt: 1,
                maxHeight: '80vh',
                overflow: 'auto',
                boxShadow: 3,
                bgcolor: mode === 'dark' ? '#1a2235' : '#ffffff',
              }}
            >
              <List>
                {searchResults.map((result) => (
                  <ListItem 
                    key={`${result.type}-${result.id}`} 
                    button
                    onClick={() => handleResultClick(result)}
                    sx={{
                      borderLeft: '4px solid',
                      borderColor: () => {
                        if (result.type === 'purchaseOrder') return '#3f51b5';
                        if (result.type === 'customerOrder') return '#4caf50';
                        if (result.type === 'productionTask') return '#ff9800';
                        if (result.type === 'inventoryBatch') return '#e91e63';
                        return 'transparent';
                      }
                    }}
                  >
                    <ListItemText 
                      primary={
                        <>
                          {result.title}
                          {result.lotInfo && <Chip size="small" label={result.lotInfo} sx={{ ml: 1, height: 20, fontSize: '0.7rem' }} />}
                        </>
                      }
                      secondary={
                        <Typography variant="caption" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          {result.type === 'inventoryBatch' ? (
                            <>
                              <Chip 
                                label={`Ilość: ${result.quantity} ${result.unit}`} 
                                size="small" 
                                sx={{ height: 20, fontSize: '0.7rem' }}
                              />
                              {result.expiryDate && 
                                `Ważne do: ${new Date(result.expiryDate).toLocaleDateString('pl-PL')}`
                              }
                            </>
                          ) : (
                            <>
                              <Chip 
                                label={result.status} 
                                size="small" 
                                sx={{ height: 20, fontSize: '0.7rem' }}
                              />
                              {result.date && new Date(result.date).toLocaleDateString()}
                            </>
                          )}
                        </Typography>
                      }
                    />
                  </ListItem>
                ))}
              </List>
            </Paper>
          )}
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
          
          <NotificationsMenu />
          
          <Box sx={{ position: 'relative', ml: 2 }}>
            <IconButton 
              onClick={handleMenu} 
              color="inherit" 
              sx={{ 
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
            
            {isAdmin && (
              <Tooltip title="Administrator">
                <Box
                  sx={{
                    position: 'absolute',
                    bottom: -4,
                    right: -4,
                    backgroundColor: mode === 'dark' ? '#304FFE' : '#1565C0',
                    borderRadius: '50%',
                    width: 16,
                    height: 16,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: '1px solid',
                    borderColor: mode === 'dark' ? '#1A1A2E' : '#fff',
                  }}
                >
                  <AdminIcon fontSize="inherit" sx={{ fontSize: 10, color: '#fff' }} />
                </Box>
              </Tooltip>
            )}
          </Box>
          
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
                minWidth: 200
              }
            }}
          >
            <MenuItem component={Link} to="/profile" onClick={handleClose}>
              <ListItemIcon><Person fontSize="small" /></ListItemIcon>
              {isAdmin ? 'Profil administratora' : 'Profil'}
            </MenuItem>
            
            {isAdmin && (
              <>
                <Divider />
                <Typography variant="caption" color="text.secondary" sx={{ px: 2, py: 1, display: 'block' }}>
                  Administracja
                </Typography>
                
                <MenuItem component={Link} to="/admin/users" onClick={handleClose}>
                  <ListItemIcon><PeopleIcon fontSize="small" /></ListItemIcon>
                  Użytkownicy
                </MenuItem>
                
                <MenuItem component={Link} to="/admin/system" onClick={handleClose}>
                  <ListItemIcon><SettingsIcon fontSize="small" /></ListItemIcon>
                  Narzędzia systemowe
                </MenuItem>
                
                <MenuItem component={Link} to="/admin/bug-reports" onClick={handleClose}>
                  <ListItemIcon><BugReportIcon fontSize="small" /></ListItemIcon>
                  Zgłoszenia błędów
                </MenuItem>
                <Divider />
              </>
            )}
            
            <MenuItem onClick={handleLogout}>
              <ListItemIcon><ExitToApp fontSize="small" /></ListItemIcon>
              Wyloguj
            </MenuItem>
          </Menu>
        </Box>
      </Toolbar>
    </AppBar>
  );
};

export default Navbar;