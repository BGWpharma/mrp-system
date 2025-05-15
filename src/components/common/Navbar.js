// src/components/common/Navbar.js
import React, { useState, useEffect, useRef, useMemo } from 'react';
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
  Notifications as NotificationsIcon, 
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
  BugReport as BugReportIcon,
  Cancel as CancelIcon
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
import BugReportDialog from './BugReportDialog';

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
  const [bugReportDialogOpen, setBugReportDialogOpen] = useState(false);
  const navigate = useNavigate();
  const searchTimeout = useRef(null);
  const searchResultsRef = useRef(null);
  
  // Dodajemy cache do przechowywania danych
  const dataCache = useRef({
    purchaseOrders: null,
    customerOrders: null,
    productionTasks: null,
    inventoryItems: null,
    batches: null,
    lastFetchTime: null
  });
  
  // Czas ważności cache (5 minut)
  const CACHE_EXPIRY_TIME = 5 * 60 * 1000;
  
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

  // Funkcja do pobierania danych z cache lub z bazy danych
  const fetchDataWithCache = async () => {
    const currentTime = Date.now();
    const isCacheValid = dataCache.current.lastFetchTime && 
                          (currentTime - dataCache.current.lastFetchTime) < CACHE_EXPIRY_TIME;
    
    // Jeśli cache jest ważny i zawiera dane, użyj go
    if (isCacheValid && 
        dataCache.current.purchaseOrders && 
        dataCache.current.customerOrders && 
        dataCache.current.productionTasks && 
        dataCache.current.inventoryItems) {
      return [
        dataCache.current.purchaseOrders,
        dataCache.current.customerOrders,
        dataCache.current.productionTasks,
        dataCache.current.inventoryItems,
        dataCache.current.batches
      ];
    }
    
    // W przeciwnym razie pobierz dane z bazy
    try {
      const [purchaseOrders, customerOrders, productionTasks, inventoryItems] = await Promise.all([
        getAllPurchaseOrders(),
        getAllOrders(),
        getAllTasks(),
        getAllInventoryItems()
      ]);
      
      const batchesSnapshot = await getDocs(collection(db, 'inventoryBatches'));
      const batches = batchesSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      // Zapisz dane w cache
      dataCache.current = {
        purchaseOrders,
        customerOrders,
        productionTasks,
        inventoryItems,
        batches,
        lastFetchTime: currentTime
      };
      
      return [purchaseOrders, customerOrders, productionTasks, inventoryItems, batches];
    } catch (error) {
      console.error('Błąd podczas pobierania danych:', error);
      // W przypadku błędu zwróć dane z cache (nawet jeśli są nieaktualne) lub puste tablice
      if (dataCache.current.lastFetchTime) {
        return [
          dataCache.current.purchaseOrders || [],
          dataCache.current.customerOrders || [],
          dataCache.current.productionTasks || [],
          dataCache.current.inventoryItems || [],
          dataCache.current.batches || []
        ];
      }
      return [[], [], [], [], []];
    }
  };

  // Nowa funkcja do inteligentnego przeszukiwania danych
  const searchData = (data, query, fields) => {
    const queryLower = query.toLowerCase();
    const queryTerms = queryLower.split(/\s+/).filter(term => term.length > 0);
    
    // Jeśli nie ma terminów do wyszukiwania, zwróć pustą tablicę
    if (queryTerms.length === 0) return [];
    
    return data.filter(item => {
      // Sprawdź, czy przedmiot pasuje do wszystkich terminów
      return queryTerms.every(term => {
        // Sprawdź, czy term występuje w którymkolwiek z pól
        return fields.some(field => {
          const fieldPath = field.split('.');
          let value = item;
          
          // Obsłuż zagnieżdżone pola (np. supplier.name)
          for (const path of fieldPath) {
            if (value == null) return false;
            value = value[path];
          }
          
          if (typeof value === 'string') {
            return value.toLowerCase().includes(term);
          }
          return false;
        });
      });
    });
  };

  const handleSearch = async (query) => {
    if (query.trim() === '') {
      setSearchResults([]);
      return;
    }
    
    setIsSearching(true);
    
    try {
      // Pobierz dane z cache lub bazy danych
      const [purchaseOrders, customerOrders, productionTasks, inventoryItems, batches] = await fetchDataWithCache();
      
      // Inteligentne przeszukiwanie danych
      const filteredPOs = searchData(purchaseOrders, query, ['number', 'supplier.name'])
        .map(po => ({
          id: po.id,
          number: po.number,
          title: `PO: ${po.number} - ${po.supplier?.name || 'Dostawca nieznany'}`,
          type: 'purchaseOrder',
          date: po.orderDate || po.createdAt,
          status: po.status
        }));
      
      const filteredCOs = searchData(customerOrders, query, ['orderNumber', 'customer.name'])
        .map(co => ({
          id: co.id,
          number: co.orderNumber,
          title: `CO: ${co.orderNumber} - ${co.customer?.name || 'Klient nieznany'}`,
          type: 'customerOrder',
          date: co.orderDate || co.createdAt,
          status: co.status
        }));
      
      const filteredMOs = searchData(productionTasks, query, ['moNumber', 'name', 'productName', 'lotNumber'])
        .map(mo => ({
          id: mo.id,
          number: mo.moNumber,
          title: `MO: ${mo.moNumber} - ${mo.productName || mo.name || 'Produkt nieznany'}`,
          type: 'productionTask',
          date: mo.scheduledDate || mo.createdAt,
          status: mo.status,
          lotInfo: mo.lotNumber ? `LOT: ${mo.lotNumber}` : null
        }));
      
      const filteredBatches = searchData(batches, query, ['lotNumber', 'batchNumber', 'itemName'])
        .map(batch => {
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
      
      // Ustawienie priorytetu wyników - dokładne dopasowania na górze
      const exactMatches = [];
      const partialMatches = [];
      
      const queryLower = query.toLowerCase();
      
      [...filteredPOs, ...filteredCOs, ...filteredMOs, ...filteredBatches].forEach(result => {
        if (result.number?.toLowerCase() === queryLower || 
            result.title?.toLowerCase().includes(queryLower + ' -')) {
          exactMatches.push(result);
        } else {
          partialMatches.push(result);
        }
      });
      
      // Połącz wyniki z zachowaniem priorytetu i ogranicz liczbę
      const combinedResults = [...exactMatches, ...partialMatches]
        .sort((a, b) => {
          // Najpierw sortuj według dokładności dopasowania
          const aExact = exactMatches.includes(a);
          const bExact = exactMatches.includes(b);
          if (aExact && !bExact) return -1;
          if (!aExact && bExact) return 1;
          
          // Następnie sortuj według daty
          return new Date(b.date) - new Date(a.date);
        })
        .slice(0, 15);
      
      setSearchResults(combinedResults);
    } catch (error) {
      console.error('Błąd podczas wyszukiwania:', error);
    } finally {
      setIsSearching(false);
    }
  };
  
  // Zoptymalizowana wersja funkcji obsługującej zmiany w polu wyszukiwania
  const handleSearchChange = (event) => {
    const query = event.target.value;
    setSearchQuery(query);
    
    // Anuluj poprzednie wyszukiwanie
    if (searchTimeout.current) {
      clearTimeout(searchTimeout.current);
    }
    
    // Opóźnij wyszukiwanie, aby zmniejszyć obciążenie systemu
    // Krótsze opóźnienie dla krótkich zapytań
    const delay = query.length <= 2 ? 500 : 300;
    
    searchTimeout.current = setTimeout(() => {
      handleSearch(query);
    }, delay);
  };
  
  const handleSearchFocus = () => {
    setIsSearchFocused(true);
    if (searchQuery.trim() !== '') {
      handleSearch(searchQuery);
    }
  };

  const handleSearchKeyPress = (event) => {
    if (event.key === 'Enter' && searchQuery.trim() !== '') {
      handleSearch(searchQuery);
      
      // Jeśli jest tylko jeden wynik, przejdź do niego automatycznie
      if (searchResults.length === 1) {
        handleResultClick(searchResults[0]);
      }
    }
  };
  
  const handleClearSearch = () => {
    setSearchQuery('');
    setSearchResults([]);
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
    <>
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
              onKeyPress={handleSearchKeyPress}
              sx={{
                width: '100%',
                '& .MuiInputBase-input': {
                  paddingRight: (searchQuery.length > 0 || isSearching) ? '42px' : '8px',
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
            {searchQuery.length > 0 && !isSearching && (
              <IconButton
                aria-label="Wyczyść wyszukiwanie"
                onClick={handleClearSearch}
                sx={{
                  position: 'absolute',
                  right: 8,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'inherit',
                  padding: '4px'
                }}
                size="small"
              >
                <CancelIcon fontSize="small" />
              </IconButton>
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
                      sx={{
                        borderLeft: '4px solid',
                        borderColor: () => {
                          if (result.type === 'purchaseOrder') return '#3f51b5';
                          if (result.type === 'customerOrder') return '#4caf50';
                          if (result.type === 'productionTask') return '#ff9800';
                          if (result.type === 'inventoryBatch') return '#e91e63';
                          return 'transparent';
                        },
                        cursor: 'pointer'
                      }}
                      onClick={() => handleResultClick(result)}
                    >
                      <ListItemText 
                        primary={
                          <Box component="div">
                            {result.title}
                            {result.lotInfo && <Chip size="small" label={result.lotInfo} sx={{ ml: 1, height: 20, fontSize: '0.7rem' }} />}
                          </Box>
                        }
                        secondary={
                          <Typography variant="caption" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            {result.type === 'inventoryBatch' ? (
                              <Box component="div" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <Chip 
                                  label={`Ilość: ${result.quantity} ${result.unit}`} 
                                  size="small" 
                                  sx={{ height: 20, fontSize: '0.7rem' }}
                                />
                                {result.expiryDate && 
                                  `Ważne do: ${new Date(result.expiryDate).toLocaleDateString('pl-PL')}`
                                }
                              </Box>
                            ) : (
                              <Box component="div" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <Chip 
                                  label={result.status} 
                                  size="small" 
                                  sx={{ height: 20, fontSize: '0.7rem' }}
                                />
                                {result.date && new Date(result.date).toLocaleDateString()}
                              </Box>
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
                <Box component="div">
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
                </Box>
              )}
              
              <MenuItem component={Link} to="/notifications/history" onClick={handleClose}>
                <ListItemIcon><NotificationsIcon fontSize="small" /></ListItemIcon>
                Historia powiadomień
              </MenuItem>
              
              <MenuItem onClick={handleLogout}>
                <ListItemIcon><ExitToApp fontSize="small" /></ListItemIcon>
                Wyloguj
              </MenuItem>
            </Menu>
          </Box>
        </Toolbar>
      </AppBar>
      
      <BugReportDialog 
        open={bugReportDialogOpen} 
        onClose={() => setBugReportDialogOpen(false)} 
      />
    </>
  );
};

export default Navbar;