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
  ListItemIcon,
  useMediaQuery,
  useTheme as useMuiTheme
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

  People as PeopleIcon,
  AdminPanelSettings as AdminIcon,
  BugReport as BugReportIcon,
  Cancel as CancelIcon,
  Menu as MenuIcon,
  Computer as KioskIcon
} from '@mui/icons-material';
import { useAuth } from '../../hooks/useAuth';
import { useTheme } from '../../contexts/ThemeContext';
import { 
  collection,
  query,
  orderBy,
  startAt,
  endAt,
  limit,
  getDocs
} from 'firebase/firestore';
import { db } from '../../services/firebase/config';
import NotificationsMenu from './NotificationsMenu';
import BugReportDialog from './BugReportDialog';
import { useSidebar } from '../../contexts/SidebarContext';
import LanguageSwitcher from './LanguageSwitcher';
import { useTranslation } from '../../hooks/useTranslation';
import debounce from 'lodash.debounce';

// Funkcja zwracająca kolor dla danego typu wyszukiwania
const getTypeColor = (type) => {
  switch (type) {
    case 'purchaseOrder':
      return '#3f51b5'; // niebieski
    case 'customerOrder':
      return '#4caf50'; // zielony
    case 'productionTask':
      return '#ff9800'; // pomarańczowy
    case 'inventoryBatch':
      return '#e91e63'; // różowy
    default:
      return '#9e9e9e'; // szary dla nieznanych typów
  }
};

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
  const { t } = useTranslation();
  const muiTheme = useMuiTheme();
  const isMobile = useMediaQuery(muiTheme.breakpoints.down('md'));
  const [anchorEl, setAnchorEl] = useState(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [bugReportDialogOpen, setBugReportDialogOpen] = useState(false);
  const navigate = useNavigate();
  const searchResultsRef = useRef(null);
  
  // Używamy kontekstu sidebara
  const { isOpen, toggle } = useSidebar();
  
  // Cache dla wyników wyszukiwania
  const searchCache = useRef(new Map());
  
  // Czas ważności cache (5 minut)
  const CACHE_EXPIRY_TIME = 5 * 60 * 1000;
  
  const isAdmin = currentUser?.role === 'administrator';
  
  const handleMenu = (event) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  // Funkcja do przełączania widoczności sidebara na urządzeniach mobilnych
  const toggleMobileSidebar = () => {
    toggle();
    console.log('Przełączenie sidebara na urządzeniu mobilnym');
  };

  const handleLogout = async () => {
    try {
      await logout();
      // Wyczyść cache przy wylogowaniu
      searchCache.current.clear();
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

  // Sprawdza czy wynik w cache jest ważny
  const isCacheValid = (cacheEntry) => {
    return cacheEntry && (Date.now() - cacheEntry.timestamp) < CACHE_EXPIRY_TIME;
  };

  // Funkcja do wyszukiwania w pojedynczej kolekcji z optymalizacją Firebase
  const searchInCollection = async (collectionName, searchTerm, fieldName = 'code') => {
    try {
      const collectionRef = collection(db, collectionName);
      const q = query(
        collectionRef,
        orderBy(fieldName),
        startAt(searchTerm),
        endAt(searchTerm + '\uf8ff'),
        limit(10)
      );
      
      const querySnapshot = await getDocs(q);
      return querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    } catch (error) {
      console.error(`Błąd podczas wyszukiwania w kolekcji ${collectionName}:`, error);
      return [];
    }
  };

  // Funkcja do mapowania wyników z różnych kolekcji
  const mapSearchResults = (purchaseOrders, customerOrders, productionTasks, inventoryBatches) => {
    const results = [];

    // Mapowanie Purchase Orders
    purchaseOrders.forEach(po => {
      if (po.number || po.code) {
        results.push({
          id: po.id,
          number: po.number || po.code,
          title: `PO: ${po.number || po.code} - ${po.supplier?.name || 'Dostawca nieznany'}`,
          type: 'purchaseOrder',
          date: po.orderDate || po.createdAt,
          status: po.status
        });
      }
    });

    // Mapowanie Customer Orders
    customerOrders.forEach(co => {
      if (co.orderNumber || co.code) {
        results.push({
          id: co.id,
          number: co.orderNumber || co.code,
          title: `CO: ${co.orderNumber || co.code} - ${co.customer?.name || 'Klient nieznany'}`,
          type: 'customerOrder',
          date: co.orderDate || co.createdAt,
          status: co.status
        });
      }
    });

    // Mapowanie Production Tasks
    productionTasks.forEach(mo => {
      if (mo.moNumber || mo.code) {
        results.push({
          id: mo.id,
          number: mo.moNumber || mo.code,
          title: `MO: ${mo.moNumber || mo.code} - ${mo.productName || mo.name || 'Produkt nieznany'}`,
          type: 'productionTask',
          date: mo.scheduledDate || mo.createdAt,
          status: mo.status,
          lotInfo: mo.lotNumber ? `LOT: ${mo.lotNumber}` : null
        });
      }
    });

    // Mapowanie Inventory Batches
    inventoryBatches.forEach(batch => {
      if (batch.lotNumber || batch.batchNumber || batch.code) {
        results.push({
          id: batch.id,
          itemId: batch.itemId,
          number: batch.lotNumber || batch.batchNumber || batch.code,
          title: `LOT: ${batch.lotNumber || batch.batchNumber || batch.code} - ${batch.itemName || 'Produkt nieznany'}`,
          type: 'inventoryBatch',
          date: batch.receivedDate || batch.createdAt,
          quantity: batch.quantity,
          unit: batch.unit || 'szt.',
          expiryDate: batch.expiryDate
        });
      }
    });

    return results;
  };

  // Główna funkcja wyszukiwania
  const performSearch = async (searchTerm) => {
    if (!searchTerm || searchTerm.length < 2) {
      setSearchResults([]);
      return;
    }

    // Sprawdź cache
    const cacheKey = searchTerm.toLowerCase();
    const cachedResult = searchCache.current.get(cacheKey);
    
    if (isCacheValid(cachedResult)) {
      console.log('Używam cache dla zapytania:', searchTerm);
      setSearchResults(cachedResult.results);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    console.log('Wykonuję wyszukiwanie dla:', searchTerm);

    try {
      // Wyszukiwanie równoległe we wszystkich kolekcjach
      const [purchaseOrders, customerOrders, productionTasks, inventoryBatches] = await Promise.all([
        searchInCollection('purchaseOrders', searchTerm, 'number'),
        searchInCollection('orders', searchTerm, 'orderNumber'), 
        searchInCollection('productionTasks', searchTerm, 'moNumber'),
        searchInCollection('inventoryBatches', searchTerm, 'lotNumber')
      ]);

      // Mapowanie wyników
      const mappedResults = mapSearchResults(purchaseOrders, customerOrders, productionTasks, inventoryBatches);

      // Sortowanie wyników - dokładne dopasowania na górze
      const exactMatches = [];
      const partialMatches = [];
      const searchTermLower = searchTerm.toLowerCase();

      mappedResults.forEach(result => {
        if (result.number?.toLowerCase() === searchTermLower) {
          exactMatches.push(result);
        } else {
          partialMatches.push(result);
        }
      });

      const finalResults = [...exactMatches, ...partialMatches]
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .slice(0, 15);

      // Zapisz w cache
      searchCache.current.set(cacheKey, {
        results: finalResults,
        timestamp: Date.now()
      });

      setSearchResults(finalResults);
    } catch (error) {
      console.error('Błąd podczas wyszukiwania:', error);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  // Debounced search function z 400ms opóźnieniem
  const debouncedSearch = useMemo(
    () => debounce(performSearch, 400),
    []
  );

  // Cleanup debounced function on unmount
  useEffect(() => {
    return () => {
      debouncedSearch.cancel();
    };
  }, [debouncedSearch]);

  // Handler dla zmian w polu wyszukiwania
  const handleSearchChange = (event) => {
    const query = event.target.value;
    setSearchQuery(query);
    
    // Jeśli pole jest puste lub ma mniej niż 2 znaki, wyczyść wyniki
    if (!query || query.length < 2) {
      setSearchResults([]);
      setIsSearching(false);
      debouncedSearch.cancel();
      return;
    }

    // Uruchom debounced search
    debouncedSearch(query);
  };
  
  const handleSearchFocus = () => {
    setIsSearchFocused(true);
    // Nie wykonuj automatycznego wyszukiwania przy focus
  };

  const handleSearchKeyPress = (event) => {
    if (event.key === 'Enter' && searchQuery.trim() !== '' && searchQuery.length >= 2) {
      // Anuluj debounced search i wykonaj natychmiast
      debouncedSearch.cancel();
      performSearch(searchQuery);
      
      // Jeśli jest tylko jeden wynik, przejdź do niego automatycznie
      if (searchResults.length === 1) {
        handleResultClick(searchResults[0]);
      }
    }
  };
  
  const handleClearSearch = () => {
    setSearchQuery('');
    setSearchResults([]);
    setIsSearching(false);
    debouncedSearch.cancel();
  };
  
  const handleResultClick = (result) => {
    setIsSearchFocused(false);
    setSearchQuery('');
    setSearchResults([]);
    
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
          {/* Lewa strona paska */}
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            {/* Przycisk hamburger dla urządzeń mobilnych */}
            {isMobile && (
              <IconButton
                edge="start"
                color="inherit"
                aria-label="menu"
                onClick={toggleMobileSidebar}
                sx={{ 
                  mr: 1,
                  zIndex: 1201,
                  display: isOpen ? 'none' : 'flex'
                }}
              >
                <MenuIcon />
              </IconButton>
            )}
          
            {/* Logo - widoczne tylko na większych ekranach */}
            {!isMobile && (
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
            )}
          </Box>
          
          {/* Search bar - różne style dla mobilnej i desktopowej wersji */}
          <Box sx={{ 
            position: 'relative', 
            flexGrow: 1, 
            maxWidth: isMobile ? '100%' : 500, 
            mx: isMobile ? 1 : 2,
            ml: isMobile ? 1 : 2,
            mr: isMobile ? 1 : 2
          }} ref={searchResultsRef}>
            <SearchIconWrapper>
              <SearchIcon />
            </SearchIconWrapper>
            <StyledInputBase
              placeholder={isMobile ? t('common.navbar.searchPlaceholderMobile') : t('common.navbar.searchPlaceholder')}
              inputProps={{ 'aria-label': 'search' }}
              value={searchQuery}
              onChange={handleSearchChange}
              onFocus={handleSearchFocus}
              onKeyPress={handleSearchKeyPress}
              sx={{
                width: '100%',
                '& .MuiInputBase-input': {
                  paddingRight: (searchQuery.length > 0 || isSearching) ? '42px' : '8px',
                  fontSize: isMobile ? '0.85rem' : '1rem',
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
                aria-label={t('common.navbar.clearSearch')}
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

            {/* Informacja o minimalnej liczbie znaków */}
            {isSearchFocused && searchQuery.length > 0 && searchQuery.length < 2 && (
              <Paper
                sx={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  right: 0,
                  zIndex: 1000,
                  mt: 1,
                  p: 2,
                  boxShadow: 3,
                  bgcolor: mode === 'dark' ? '#1a2235' : '#ffffff',
                }}
              >
                <Typography variant="body2" color="text.secondary" align="center">
                  Wpisz co najmniej 2 znaki aby rozpocząć wyszukiwanie
                </Typography>
              </Paper>
            )}
          </Box>
          
          {/* Right side items */}
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            {/* Na urządzeniach mobilnych pokazujemy tylko ikony z najważniejszymi funkcjami */}
            <Tooltip title={t('common.navbar.themeToggleTooltip')}>
              <IconButton 
                color="inherit" 
                sx={{ ml: isMobile ? 0.5 : 1 }}
                onClick={toggleTheme}
                aria-label={t('common.navbar.themeToggleTooltip')}
              >
                {mode === 'dark' ? <LightModeIcon /> : <DarkModeIcon />}
              </IconButton>
            </Tooltip>
            
            {/* Na urządzeniach mobilnych ukryjemy przycisk tłumaczenia */}
            {!isMobile && (
              <LanguageSwitcher />
            )}
            
            {/* Kompaktowa wersja na urządzeniach mobilnych */}
            <Box sx={{ ml: isMobile ? 0.5 : 1 }}>
              <NotificationsMenu />
            </Box>
            
            <Box sx={{ position: 'relative', ml: isMobile ? 0.5 : 2 }}>
              <IconButton 
                onClick={handleMenu} 
                color="inherit" 
                sx={{ 
                  border: '2px solid',
                  borderColor: mode === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
                  padding: isMobile ? '2px' : '4px'
                }}
              >
                <Avatar 
                  src={currentUser?.photoURL || ''} 
                  alt={currentUser?.displayName || 'User'}
                  sx={{ width: isMobile ? 28 : 32, height: isMobile ? 28 : 32 }}
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
                      {t('common.navbar.administration')}
                    </Typography>
                    
                    <MenuItem component={Link} to="/admin/users" onClick={handleClose}>
                      <ListItemIcon><PeopleIcon fontSize="small" /></ListItemIcon>
                      {t('common.navbar.users')}
                    </MenuItem>
                    
                    <MenuItem component={Link} to="/admin/system" onClick={handleClose}>
                      <ListItemIcon><SettingsIcon fontSize="small" /></ListItemIcon>
                      {t('common.navbar.systemTools')}
                    </MenuItem>
                    
                    <MenuItem component={Link} to="/admin/bug-reports" onClick={handleClose}>
                      <ListItemIcon><BugReportIcon fontSize="small" /></ListItemIcon>
                      {t('common.navbar.bugReports')}
                    </MenuItem>
                    <Divider />
                  </Box>
                )}
                
                <MenuItem component={Link} to="/notifications/history" onClick={handleClose}>
                  <ListItemIcon><NotificationsIcon fontSize="small" /></ListItemIcon>
                  {t('common.navbar.notificationHistory')}
                </MenuItem>
                
                <Divider />
                
                <MenuItem component={Link} to="/kiosk" onClick={handleClose}>
                  <ListItemIcon><KioskIcon fontSize="small" /></ListItemIcon>
                  Kiosk
                </MenuItem>
                
                <MenuItem onClick={handleLogout}>
                  <ListItemIcon><ExitToApp fontSize="small" /></ListItemIcon>
                  {t('common.navbar.logout')}
                </MenuItem>
              </Menu>
            </Box>
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