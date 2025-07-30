// src/pages/Dashboard/Dashboard.js
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { 
  Container, 
  Grid, 
  Paper, 
  Typography, 
  Box, 
  Button, 
  Card, 
  CardContent, 
  CardActions,
  List,
  ListItem,
  ListItemText,
  Divider,
  Chip,
  LinearProgress,
  Icon,
  CircularProgress,
  Skeleton,
  TextField,
  IconButton,
  Alert,
  Snackbar,
  useTheme,
  Fade,
  Grow,
  Slide
} from '@mui/material';
import {
  MenuBook as RecipesIcon,
  Schedule as ProductionIcon,
  Inventory as InventoryIcon,
  VerifiedUser as QualityIcon,
  ShoppingCart as OrdersIcon,
  Add as AddIcon,
  InsertChart as AnalyticsIcon,
  ArrowUpward as ArrowUpIcon,
  ArrowDownward as ArrowDownIcon,
  Timeline as TimelineIcon,
  Storage as WarehouseIcon,
  Business as WorkstationIcon,
  Refresh as RefreshIcon,
  Edit as EditIcon,
  Save as SaveIcon,
  Cancel as CancelIcon,
  Announcement as AnnouncementIcon,
  ListAlt as FormsIcon
} from '@mui/icons-material';
import { getTasksByStatus } from '../../services/productionService';
import { getAllRecipes } from '../../services/recipeService';
import { getOrdersStats } from '../../services/orderService';
import { getKpiData } from '../../services/analyticsService';
import { 
  getDashboardData, 
  refreshDashboardSection, 
  clearDashboardCache,
  getDashboardCacheInfo 
} from '../../services/dashboardService';
import { useAuth } from '../../hooks/useAuth';
import { formatDate } from '../../utils/formatters';
import { formatCurrency } from '../../utils/formatUtils';
import { formatTimestamp } from '../../utils/dateUtils';
import { useTranslation } from 'react-i18next';
import { db } from '../../services/firebase/config';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { createRealtimeNotification } from '../../services/notificationService';
import { getAllActiveUsers } from '../../services/userService';

// Komponent animowanej karty
const AnimatedCard = ({ children, delay = 0, index = 0, ...props }) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(true);
    }, delay + (index * 100)); // Opóźnienie dla każdej karty

    return () => clearTimeout(timer);
  }, [delay, index]);

  return (
    <Grow
      in={isVisible}
      timeout={600}
      style={{ transformOrigin: '0 0 0' }}
    >
      <Card {...props}>
        {children}
      </Card>
    </Grow>
  );
};

// Komponent animowanego kontenera
const AnimatedContainer = ({ children, delay = 0 }) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(true);
    }, delay);

    return () => clearTimeout(timer);
  }, [delay]);

  return (
    <Fade in={isVisible} timeout={800}>
      <Box>
        {children}
      </Box>
    </Fade>
  );
};

// Komponent animowanej sekcji
const AnimatedSection = ({ children, direction = 'up', delay = 0 }) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(true);
    }, delay);

    return () => clearTimeout(timer);
  }, [delay]);

  return (
    <Slide direction={direction} in={isVisible} timeout={600}>
      <Box>
        {children}
      </Box>
    </Slide>
  );
};

// Komponent dla ładowanej sekcji
const SectionLoading = () => (
  <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
    <Fade in timeout={500}>
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <CircularProgress size={24} sx={{ mb: 2 }} />
        <Typography variant="body2" color="text.secondary">
          Ładowanie danych...
        </Typography>
      </Box>
    </Fade>
  </Box>
);

// Komponent animowanego szkieletu
const AnimatedSkeleton = ({ width = "100%", height = 40, delay = 0, variant = "text" }) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(true);
    }, delay);

    return () => clearTimeout(timer);
  }, [delay]);

  return (
    <Fade in={isVisible} timeout={600}>
      <Skeleton 
        variant={variant} 
        width={width} 
        height={height}
        sx={{
          bgcolor: 'rgba(255, 255, 255, 0.1)',
          '&::after': {
            background: 'linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.2), transparent)',
          }
        }}
      />
    </Fade>
  );
};

// Komponent animowanego licznika
const AnimatedCounter = ({ value, loading, delay = 0, suffix = "", variant = "subtitle1", sx = {} }) => {
  const [displayValue, setDisplayValue] = useState(0);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(true);
    }, delay);

    return () => clearTimeout(timer);
  }, [delay]);

  useEffect(() => {
    if (!loading && value !== undefined && isVisible) {
      const startValue = 0;
      const endValue = value;
      const duration = 1000; // 1 sekunda
      const startTime = Date.now();

      const updateCounter = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        // Funkcja easing dla płynniejszego efektu
        const easeOutQuart = 1 - Math.pow(1 - progress, 4);
        const currentValue = Math.floor(startValue + (endValue - startValue) * easeOutQuart);
        
        setDisplayValue(currentValue);

        if (progress < 1) {
          requestAnimationFrame(updateCounter);
        }
      };

      requestAnimationFrame(updateCounter);
    }
  }, [value, loading, isVisible]);

  if (loading) {
    const height = variant === "h3" ? 60 : 32;
    return <AnimatedSkeleton width="60%" height={height} delay={delay} />;
  }

  return (
    <Fade in={isVisible} timeout={800}>
      <Typography variant={variant} sx={{ mt: variant === "subtitle1" ? 2 : 1, mb: 1, ...sx }}>
        {displayValue}{suffix}
      </Typography>
    </Fade>
  );
};

// Komponent animowanego przycisku
const AnimatedButton = ({ children, delay = 0, ...props }) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(true);
    }, delay);

    return () => clearTimeout(timer);
  }, [delay]);

  return (
    <Grow in={isVisible} timeout={600}>
      <Button 
        {...props}
        sx={{
          ...props.sx,
          transition: 'all 0.3s ease',
          '&:hover': {
            transform: 'translateY(-2px)',
            boxShadow: '0 6px 20px rgba(0, 0, 0, 0.15)',
            ...props.sx?.['&:hover']
          }
        }}
      >
        {children}
      </Button>
    </Grow>
  );
};

const Dashboard = () => {
  const { currentUser } = useAuth();
  const { t } = useTranslation();
  const theme = useTheme();
  const isDarkMode = theme.palette.mode === 'dark';
  const [loading, setLoading] = useState(false);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [recipesLoading, setRecipesLoading] = useState(false);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [tasks, setTasks] = useState([]);
  const [recipes, setRecipes] = useState([]);
  const [orderStats, setOrderStats] = useState(null);
  const [analyticsData, setAnalyticsData] = useState(null);
  const [dataLoadStatus, setDataLoadStatus] = useState({
    tasks: false,
    recipes: false,
    orders: false,
    analytics: false
  });
  
  // Stan dla systemu ogłoszeń
  const [announcement, setAnnouncement] = useState('');
  const [isEditingAnnouncement, setIsEditingAnnouncement] = useState(false);
  const [editedAnnouncement, setEditedAnnouncement] = useState('');
  const [announcementLoading, setAnnouncementLoading] = useState(false);
  const [announcementInitialized, setAnnouncementInitialized] = useState(false);
  const [announcementMeta, setAnnouncementMeta] = useState({ 
    updatedBy: '', 
    updatedAt: null,
    updatedByName: ''
  });
  
  // Stan dla notyfikacji
  const [notification, setNotification] = useState({
    open: false,
    message: '',
    severity: 'success'
  });
  
  // Pobieranie zadań produkcyjnych - useCallback
  const fetchTasks = useCallback(async () => {
    if (tasksLoading) return; // Zapobiegaj równoległym zapytaniom
    
    try {
      setTasksLoading(true);
      console.log('Próba pobrania zadań w trakcie...');
      const tasksInProgress = await getTasksByStatus('W trakcie');
      
      if (!tasksInProgress || tasksInProgress.length === 0) {
        console.log('Brak zadań w trakcie, sprawdzam zadania zaplanowane...');
        const plannedTasks = await getTasksByStatus('Zaplanowane');
        
        if (plannedTasks && plannedTasks.length > 0) {
          console.log('Znaleziono zadania zaplanowane, ale brak zadań w trakcie');
          setTasks([]); 
        } else {
          console.log('Brak jakichkolwiek zadań produkcyjnych w bazie');
          setTasks([]);
        }
      } else {
        console.log(`Ustawiam ${tasksInProgress.length} zadań w trakcie`);
        setTasks(tasksInProgress);
      }
      setDataLoadStatus(prev => ({ ...prev, tasks: true }));
    } catch (error) {
      console.error('Błąd podczas pobierania zadań:', error);
      setTasks([]);
    } finally {
      setTasksLoading(false);
    }
  }, [tasksLoading]);
  
  // Pobieranie receptur - useCallback
  const fetchRecipes = useCallback(async () => {
    if (recipesLoading) return; // Zapobiegaj równoległym zapytaniom
    
    try {
      setRecipesLoading(true);
      const allRecipes = await getAllRecipes();
      console.log('Wszystkie receptury:', allRecipes);
      setRecipes(allRecipes || []);
      setDataLoadStatus(prev => ({ ...prev, recipes: true }));
    } catch (error) {
      console.error('Błąd podczas pobierania receptur:', error);
      setRecipes([]);
    } finally {
      setRecipesLoading(false);
    }
  }, [recipesLoading]);
  
  // Pobieranie statystyk zamówień - useCallback
  const fetchOrderStats = useCallback(async () => {
    if (ordersLoading) return; // Zapobiegaj równoległym zapytaniom
    
    try {
      setOrdersLoading(true);
      const stats = await getOrdersStats(true);
      console.log('Statystyki zamówień:', stats);
      setOrderStats(stats || null);
      setDataLoadStatus(prev => ({ ...prev, orders: true }));
    } catch (error) {
      console.error('Błąd podczas pobierania statystyk zamówień:', error);
      setOrderStats(null);
    } finally {
      setOrdersLoading(false);
    }
  }, [ordersLoading]);
  
  // Pobieranie danych analitycznych - useCallback
  const fetchAnalytics = useCallback(async () => {
    if (analyticsLoading) return; // Zapobiegaj równoległym zapytaniom
    
    try {
      setAnalyticsLoading(true);
      const kpiData = await getKpiData();
      console.log('Dane KPI:', kpiData);
      setAnalyticsData(kpiData || null);
      setDataLoadStatus(prev => ({ ...prev, analytics: true }));
    } catch (error) {
      console.error('Błąd podczas pobierania danych KPI:', error);
      setAnalyticsData(null);
    } finally {
      setAnalyticsLoading(false);
    }
  }, [analyticsLoading]);

  // Pobieranie ogłoszeń - zoptymalizowane aby nie przerywać animacji
  const fetchAnnouncement = useCallback(async () => {
    try {
      // Nie ustawiamy loading od razu, dajemy czas na animacje
      setTimeout(() => setAnnouncementLoading(true), 100);
      
      // Pobieranie z Firebase
      const announcementDoc = await getDoc(doc(db, 'settings', 'dashboard'));
      
      if (announcementDoc.exists()) {
        const data = announcementDoc.data();
        
        // Opóźniamy aktualizację stanu aby nie przerywać animacji
        setTimeout(() => {
          setAnnouncement(data.announcement || '');
          setAnnouncementMeta({
            updatedBy: data.updatedBy || '',
            updatedAt: data.updatedAt ? data.updatedAt.toDate() : null,
            updatedByName: data.updatedByName || ''
          });
          setAnnouncementLoading(false);
          setAnnouncementInitialized(true);
        }, 300); // Opóźnienie pozwala animacjom się zakończyć
      } else {
        // Tworzenie dokumentu jeśli nie istnieje
        await setDoc(doc(db, 'settings', 'dashboard'), {
          announcement: '',
          updatedAt: serverTimestamp(),
          updatedBy: currentUser.uid,
          updatedByName: currentUser.displayName || currentUser.email
        });
        
        setTimeout(() => {
          setAnnouncement('');
          setAnnouncementMeta({
            updatedBy: currentUser.uid,
            updatedAt: new Date(),
            updatedByName: currentUser.displayName || currentUser.email
          });
          setAnnouncementLoading(false);
          setAnnouncementInitialized(true);
        }, 300);
      }
    } catch (error) {
      console.error('Błąd podczas pobierania ogłoszenia:', error);
      // Fallback do localStorage z opóźnieniem
      setTimeout(() => {
        const savedAnnouncement = localStorage.getItem('dashboardAnnouncement') || '';
        setAnnouncement(savedAnnouncement);
        setAnnouncementLoading(false);
        setAnnouncementInitialized(true);
      }, 300);
    }
  }, [currentUser.uid, currentUser.displayName, currentUser.email]);

  // Funkcja obsługująca zamknięcie notyfikacji
  const handleCloseNotification = (event, reason) => {
    if (reason === 'clickaway') {
      return;
    }
    setNotification({ ...notification, open: false });
  };
  
  // Pokazanie notyfikacji
  const showNotification = (message, severity = 'success') => {
    setNotification({
      open: true,
      message,
      severity
    });
  };

  // Zapisywanie ogłoszeń z dodaną obsługą powiadomień
  const saveAnnouncement = useCallback(async () => {
    try {
      // Zapisywanie do Firebase
      await updateDoc(doc(db, 'settings', 'dashboard'), {
        announcement: editedAnnouncement,
        updatedAt: serverTimestamp(),
        updatedBy: currentUser.uid,
        updatedByName: currentUser.displayName || currentUser.email
      });
      
      // Równolegle aktualizujemy local state
      setAnnouncement(editedAnnouncement);
      setIsEditingAnnouncement(false);
      
      // Zachowujemy też w localStorage jako backup
      localStorage.setItem('dashboardAnnouncement', editedAnnouncement);
      
      // Wyświetlamy notyfikację o sukcesie
      showNotification('Ogłoszenie zostało pomyślnie zaktualizowane!');
      
      // Dodajemy powiadomienie dla wszystkich użytkowników w systemie
      try {
        // Pobierz wszystkich aktywnych użytkowników
        const users = await getAllActiveUsers();
        const userIds = users.map(user => user.id);
        
        // Stwórz powiadomienie w systemie powiadomień
        if (userIds.length > 0) {
          const userName = currentUser.displayName || currentUser.email || 'Użytkownik';
          await createRealtimeNotification({
            userIds,
            title: 'Aktualizacja ogłoszenia w systemie',
            message: `${userName} zaktualizował ogłoszenie: ${editedAnnouncement.length > 80 
              ? `${editedAnnouncement.substring(0, 80)}...` 
              : editedAnnouncement}`,
            type: 'info',
            entityType: 'announcement',
            entityId: 'dashboard',
            createdBy: currentUser.uid,
            createdByName: currentUser.displayName || currentUser.email
          });
          console.log('Powiadomienie o aktualizacji ogłoszenia zostało utworzone');
        }
      } catch (notificationError) {
        console.error('Błąd podczas tworzenia powiadomienia o ogłoszeniu:', notificationError);
        // Nie zwracamy błędu, ponieważ zapis ogłoszenia się udał
      }
    } catch (error) {
      console.error('Błąd podczas zapisywania ogłoszenia:', error);
      // Fallback do localStorage
      localStorage.setItem('dashboardAnnouncement', editedAnnouncement);
      setAnnouncement(editedAnnouncement);
      setIsEditingAnnouncement(false);
      
      // Wyświetlamy notyfikację o błędzie
      showNotification('Wystąpił błąd podczas zapisywania ogłoszenia. Zapisano lokalnie.', 'error');
    }
  }, [editedAnnouncement, currentUser.uid, currentUser.displayName, currentUser.email]);
  
  // Obsługa naciśnięcia klawisza Enter w polu tekstowym
  const handleKeyDown = (event) => {
    if (event.key === 'Enter' && event.ctrlKey) {
      saveAnnouncement();
    }
  };

  // Rozpoczęcie edycji ogłoszenia
  const startEditingAnnouncement = useCallback(() => {
    setEditedAnnouncement(announcement);
    setIsEditingAnnouncement(true);
  }, [announcement]);

  // Anulowanie edycji ogłoszenia
  const cancelEditingAnnouncement = useCallback(() => {
    setIsEditingAnnouncement(false);
  }, []);

  // Odświeżanie pojedynczej sekcji danych - zoptymalizowane
  const refreshSection = useCallback(async (section) => {
    // Zapobiegaj próbom odświeżenia podczas ładowania
    if (loading) return;
    
    try {
      console.log(`Odświeżam sekcję Dashboard: ${section}`);
      const freshData = await refreshDashboardSection(section);
      
      // Aktualizuj odpowiedni stan
      switch (section) {
        case 'tasks':
          if (freshData) {
            setTasks(freshData);
            setDataLoadStatus(prev => ({ ...prev, tasks: true }));
          }
          break;
        case 'recipes':
          if (freshData) {
            setRecipes(freshData);
            setDataLoadStatus(prev => ({ ...prev, recipes: true }));
          }
          break;
        case 'orders':
          if (freshData) {
            setOrderStats(freshData);
            setDataLoadStatus(prev => ({ ...prev, orders: true }));
          }
          break;
        case 'analytics':
          if (freshData) {
            setAnalyticsData(freshData);
            setDataLoadStatus(prev => ({ ...prev, analytics: true }));
          }
          break;
        default:
          console.warn(`Nieznana sekcja: ${section}`);
          break;
      }
    } catch (error) {
      console.error(`Błąd podczas odświeżania sekcji ${section}:`, error);
    }
  }, [loading]);

  // Odświeżanie wszystkich sekcji danych naraz - zoptymalizowane
  const refreshAllData = useCallback(async () => {
    if (loading) return; // Zapobiegaj równoległym odświeżeniom
    
    try {
      setLoading(true);
      console.log('Odświeżam wszystkie dane Dashboard...');
      
      // Wyczyść cache i pobierz świeże dane
      clearDashboardCache();
      const dashboardData = await getDashboardData();
      
      // Aktualizuj wszystkie stany
      if (dashboardData.recipes) {
        setRecipes(dashboardData.recipes);
        setDataLoadStatus(prev => ({ ...prev, recipes: true }));
      }
      
      if (dashboardData.orderStats) {
        setOrderStats(dashboardData.orderStats);
        setDataLoadStatus(prev => ({ ...prev, orders: true }));
      }
      
      if (dashboardData.analytics) {
        setAnalyticsData(dashboardData.analytics);
        setDataLoadStatus(prev => ({ ...prev, analytics: true }));
      }
      
      if (dashboardData.tasks) {
        setTasks(dashboardData.tasks);
        setDataLoadStatus(prev => ({ ...prev, tasks: true }));
      }
      
      console.log('Wszystkie dane Dashboard zostały odświeżone');
      
      // Pobieramy ogłoszenia z opóźnieniem
      setTimeout(() => {
        fetchAnnouncement();
      }, 500);
      
    } catch (error) {
      console.error('Błąd podczas odświeżania danych Dashboard:', error);
    } finally {
      setLoading(false);
    }
  }, [loading, fetchAnnouncement]);

  // Pierwsze ładowanie danych - tylko raz przy montowaniu komponentu
  useEffect(() => {
    let isMounted = true; // Flaga zapobiegająca aktualizacji stanu po odmontowaniu
    
    const loadData = async () => {
      try {
        if (!isMounted) return;
        setLoading(true);
        
        // Używamy zoptymalizowanego serwisu Dashboard z cache'owaniem
        console.log('Ładowanie danych Dashboard z optymalizacją...');
        const dashboardData = await getDashboardData();
        
        // Zaktualizuj stan tylko jeśli komponent jest nadal zamontowany
        if (!isMounted) return;
        
        console.log('Dane Dashboard załadowane z cache/optymalizacji');
        
        // Aktualizuj stany na podstawie danych z dashboardService
        if (dashboardData.recipes) {
          console.log('Receptury Dashboard:', dashboardData.recipes.length);
          setRecipes(dashboardData.recipes);
          setDataLoadStatus(prev => ({ ...prev, recipes: true }));
        }
        
        if (dashboardData.orderStats) {
          console.log('Statystyki zamówień Dashboard:', dashboardData.orderStats);
          setOrderStats(dashboardData.orderStats);
          setDataLoadStatus(prev => ({ ...prev, orders: true }));
        }
        
        if (dashboardData.analytics) {
          console.log('Dane KPI Dashboard:', dashboardData.analytics);
          setAnalyticsData(dashboardData.analytics);
          setDataLoadStatus(prev => ({ ...prev, analytics: true }));
        }
        
        if (dashboardData.tasks) {
          console.log(`Zadania Dashboard: ${dashboardData.tasks.length}`);
          setTasks(dashboardData.tasks);
          setDataLoadStatus(prev => ({ ...prev, tasks: true }));
        }
        
        // Pobieramy ogłoszenia na końcu, po zakończeniu głównych animacji
        setTimeout(() => {
          if (isMounted) {
            fetchAnnouncement();
          }
        }, 1500); // Opóźnienie pozwala wszystkim animacjom się zakończyć
        
      } catch (error) {
        if (!isMounted) return;
        console.error('Błąd podczas ładowania danych dashboardu:', error);
      } finally {
        if (isMounted) {
          setLoading(false);
          setTasksLoading(false);
          setRecipesLoading(false);
          setOrdersLoading(false);
          setAnalyticsLoading(false);
        }
      }
    };
    
    loadData();
    
    // Funkcja czyszcząca
    return () => {
      isMounted = false;
    };
  }, [fetchAnnouncement]); // Dodajemy fetchAnnouncement do zależności

  // Mapowanie statusów zamówień na kolory
  const getStatusColor = useMemo(() => (status) => {
    const statusMap = {
      'Nowe': 'info',
      'New': 'info',
      'W realizacji': 'warning', 
      'In Progress': 'warning',
      'Zakończone': 'success',
      'Completed': 'success',
      'Anulowane': 'error',
      'Cancelled': 'error'
    };
    return statusMap[status] || 'default';
  }, []);

  // Komponent dla karty z przyciskiem odświeżania
  const CardHeader = ({ title, isLoading, onRefresh, section }) => (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
      <Typography variant="h6">{title}</Typography>
      {isLoading ? (
        <CircularProgress size={20} />
      ) : (
        <Button 
          size="small" 
          onClick={() => onRefresh(section)}
          startIcon={<RefreshIcon />}
        >
          {t('dashboard.refresh')}
        </Button>
      )}
    </Box>
  );

  // Renderowanie informacji o ostatniej aktualizacji
  const renderLastUpdatedInfo = () => {
    if (!announcementMeta.updatedAt) return null;
    
    const formattedDate = announcementMeta.updatedAt 
      ? formatTimestamp(announcementMeta.updatedAt, true) 
      : '';
      
    const authorText = announcementMeta.updatedByName 
      ? t('dashboard.by', { name: announcementMeta.updatedByName })
      : '';
      
    return (
      <Typography variant="caption" color="text.secondary" sx={{ mt: 2, display: 'block', textAlign: 'right' }}>
        {t('dashboard.lastUpdate', { date: formattedDate, author: authorText })}
      </Typography>
    );
  };

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <AnimatedContainer delay={0}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
          <Typography variant="h4" gutterBottom>
            {t('dashboard.title')}
          </Typography>
          <Button 
            startIcon={<RefreshIcon />}
            onClick={refreshAllData}
            variant="outlined"
            disabled={loading}
          >
            {loading ? t('dashboard.refreshing') : t('dashboard.refreshAll')}
            {loading && <CircularProgress size={16} sx={{ ml: 1 }} />}
          </Button>
        </Box>
        <Typography variant="subtitle1" sx={{ mb: 2 }}>
          {t('dashboard.welcome', { name: currentUser.displayName || currentUser.email })}
        </Typography>
      </AnimatedContainer>

      {/* Sekcja Ogłoszeń */}
      <AnimatedSection direction="down" delay={400}>
        <Paper sx={{ 
          p: 2, 
          mb: 4, 
          bgcolor: isDarkMode ? 'background.paper' : '#f8f9fa', 
          borderRadius: 2, 
          border: '1px solid', 
          borderColor: 'divider',
          color: isDarkMode ? 'text.primary' : 'inherit',
          transition: 'all 0.3s ease'
        }}>
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
            <AnnouncementIcon sx={{ mr: 1, color: 'primary.main' }} />
            <Typography variant="h6">{t('dashboard.announcements')}</Typography>
            {!isEditingAnnouncement && (
              <IconButton 
                size="small" 
                onClick={startEditingAnnouncement}
                sx={{ ml: 'auto' }}
                title={t('dashboard.editAnnouncement')}
              >
                <EditIcon fontSize="small" />
              </IconButton>
            )}
          </Box>
          
          {!announcementInitialized ? (
            <Fade in timeout={1000}>
              <Typography variant="body2" sx={{ mt: 1, fontStyle: 'italic', color: 'text.secondary', opacity: 0.7 }}>
                {t('dashboard.loadingAnnouncements')}
              </Typography>
            </Fade>
          ) : announcementLoading ? (
            <AnimatedSkeleton variant="rectangular" width="100%" height={60} delay={200} />
          ) : isEditingAnnouncement ? (
            <Box sx={{ mt: 2 }}>
              <TextField
                fullWidth
                multiline
                rows={3}
                variant="outlined"
                placeholder={t('dashboard.announcementPlaceholder')}
                value={editedAnnouncement}
                onChange={(e) => setEditedAnnouncement(e.target.value)}
                onKeyDown={handleKeyDown}
                helperText={t('dashboard.announcementHelper')}
                sx={{
                  '& .MuiOutlinedInput-root': {
                    '& fieldset': {
                      borderColor: isDarkMode ? 'rgba(255, 255, 255, 0.23)' : 'rgba(0, 0, 0, 0.23)',
                    },
                    '&:hover fieldset': {
                      borderColor: isDarkMode ? 'rgba(255, 255, 255, 0.5)' : 'rgba(0, 0, 0, 0.5)',
                    },
                  },
                  '& .MuiInputBase-input': {
                    color: isDarkMode ? 'text.primary' : 'inherit',
                  },
                  '& .MuiFormHelperText-root': {
                    color: isDarkMode ? 'text.secondary' : 'inherit',
                  }
                }}
              />
              <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2, gap: 1 }}>
                <Button 
                  variant="outlined" 
                  startIcon={<CancelIcon />}
                  onClick={cancelEditingAnnouncement}
                >
                  {t('dashboard.cancel')}
                </Button>
                <Button 
                  variant="contained" 
                  color="primary"
                  startIcon={<SaveIcon />}
                  onClick={saveAnnouncement}
                >
                  {t('dashboard.save')}
                </Button>
              </Box>
            </Box>
          ) : announcement ? (
            <>
              <Typography variant="body1" sx={{ mt: 1, whiteSpace: 'pre-wrap', color: isDarkMode ? 'text.primary' : 'inherit' }}>
                {announcement}
              </Typography>
              {renderLastUpdatedInfo()}
            </>
          ) : (
            <>
              <Typography variant="body2" sx={{ mt: 1, fontStyle: 'italic', color: isDarkMode ? 'text.secondary' : 'text.secondary' }}>
                {t('dashboard.noAnnouncements')}
              </Typography>
              {renderLastUpdatedInfo()}
            </>
          )}
        </Paper>
      </AnimatedSection>
      
      {/* Notyfikacja */}
      <Snackbar 
        open={notification.open} 
        autoHideDuration={6000} 
        onClose={handleCloseNotification}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <Alert 
          onClose={handleCloseNotification} 
          severity={notification.severity} 
          variant="filled"
          sx={{ width: '100%' }}
        >
          {notification.message}
        </Alert>
      </Snackbar>

      <Grid container spacing={3}>
        {/* Główne karty KPI */}
        <Grid item xs={12} md={3}>
          <AnimatedCard index={0} delay={400} sx={{ borderRadius: 2, boxShadow: 3, height: '100%', display: 'flex', flexDirection: 'column' }}>
            <CardContent sx={{ textAlign: 'center', p: 3, flexGrow: 1 }}>
              <RecipesIcon sx={{ fontSize: 48, color: 'primary.main', mb: 1 }} />
              <Typography variant="h6">{t('dashboard.cards.recipes.title')}</Typography>
              <AnimatedCounter 
                value={recipes?.length || 0} 
                loading={recipesLoading} 
                delay={600}
              />
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Typography variant="body2" color="text.secondary">
                  {t('dashboard.cards.recipes.description')}
                </Typography>
              </Box>
            </CardContent>
            <CardActions sx={{ p: 2, pt: 0, justifyContent: 'center' }}>
              <AnimatedButton component={Link} to="/recipes" sx={{ flexGrow: 1 }} delay={800}>
                {t('dashboard.cards.recipes.goTo')}
              </AnimatedButton>
            </CardActions>
          </AnimatedCard>
        </Grid>

        <Grid item xs={12} md={3}>
          <AnimatedCard index={1} delay={400} sx={{ borderRadius: 2, boxShadow: 3, height: '100%', display: 'flex', flexDirection: 'column' }}>
            <CardContent sx={{ textAlign: 'center', p: 3, flexGrow: 1 }}>
              <ProductionIcon sx={{ fontSize: 48, color: 'primary.main', mb: 1 }} />
              <Typography variant="h6">{t('dashboard.cards.production.title')}</Typography>
              <AnimatedCounter 
                value={analyticsData?.production?.tasksInProgress || 0} 
                loading={analyticsLoading} 
                delay={700}
              />
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                {t('dashboard.cards.production.activeTasks', { count: analyticsData?.production?.tasksInProgress || 0 })}
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Typography variant="body2" color="text.secondary">
                  {t('dashboard.cards.production.description')}
                </Typography>
              </Box>
            </CardContent>
            <CardActions sx={{ p: 2, pt: 0, justifyContent: 'center' }}>
              <AnimatedButton component={Link} to="/production" sx={{ flexGrow: 1 }} delay={900}>
                {t('dashboard.cards.production.goTo')}
              </AnimatedButton>
            </CardActions>
          </AnimatedCard>
        </Grid>

        <Grid item xs={12} md={3}>
          <AnimatedCard index={2} delay={400} sx={{ borderRadius: 2, boxShadow: 3, height: '100%', display: 'flex', flexDirection: 'column' }}>
            <CardContent sx={{ textAlign: 'center', p: 3, flexGrow: 1 }}>
              <InventoryIcon sx={{ fontSize: 48, color: 'primary.main', mb: 1 }} />
              <Typography variant="h6">{t('dashboard.cards.inventory.title')}</Typography>
              <AnimatedCounter 
                value={analyticsData?.inventory?.totalItems || 0} 
                loading={analyticsLoading} 
                delay={800}
                suffix=" produktów"
              />
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Typography variant="body2" color="text.secondary">
                  {t('dashboard.cards.inventory.description')}
                </Typography>
              </Box>
            </CardContent>
            <CardActions sx={{ p: 2, pt: 0, justifyContent: 'center' }}>
              <AnimatedButton component={Link} to="/inventory" sx={{ flexGrow: 1 }} delay={1000}>
                {t('dashboard.cards.inventory.goTo')}
              </AnimatedButton>
            </CardActions>
          </AnimatedCard>
        </Grid>

        <Grid item xs={12} md={3}>
          <AnimatedCard index={3} delay={400} sx={{ borderRadius: 2, boxShadow: 3, height: '100%', display: 'flex', flexDirection: 'column' }}>
            <CardContent sx={{ textAlign: 'center', p: 3, flexGrow: 1 }}>
              <FormsIcon sx={{ fontSize: 48, color: 'primary.main', mb: 1 }} />
              <Typography variant="h6">{t('dashboard.cards.forms.title')}</Typography>
              <Fade in={!analyticsLoading} timeout={1000}>
                <Typography variant="subtitle1" sx={{ mt: 2, mb: 1 }}>
                  {t('dashboard.cards.forms.subtitle')}
                </Typography>
              </Fade>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Typography variant="body2" color="text.secondary">
                  {t('dashboard.cards.forms.description')}
                </Typography>
              </Box>
            </CardContent>
            <CardActions sx={{ p: 2, pt: 0, justifyContent: 'center' }}>
              <AnimatedButton component={Link} to="/production/forms" sx={{ flexGrow: 1 }} delay={1100}>
                {t('dashboard.cards.forms.goTo')}
              </AnimatedButton>
            </CardActions>
          </AnimatedCard>
        </Grid>
        
        {/* Zamówienia */}
        <Grid item xs={12} md={12}>
          <AnimatedCard index={4} delay={600} sx={{ borderRadius: 2, boxShadow: 3 }}>
            <CardContent sx={{ textAlign: 'center', p: 3 }}>
              <OrdersIcon sx={{ fontSize: 48, color: 'primary.main', mb: 1 }} />
              <Typography variant="h6">{t('dashboard.cards.orders.title')}</Typography>
              
              {ordersLoading ? (
                <SectionLoading />
              ) : (
                <Fade in={!ordersLoading} timeout={1200}>
                  <Box>
                    <Typography variant="subtitle1" sx={{ mt: 2, mb: 1 }}>
                      {t('dashboard.cards.orders.ordersCount', { 
                        count: orderStats?.total || 0, 
                        value: orderStats?.totalValue ? formatCurrency(orderStats.totalValue) : '0,00 EUR'
                      })}
                    </Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Typography variant="body2" color="text.secondary">
                        {t('dashboard.cards.orders.description')}
                      </Typography>
                    </Box>
                    
                    {orderStats?.recentOrders && orderStats.recentOrders.length > 0 && (
                      <Box sx={{ mt: 3, textAlign: 'left' }}>
                        <Typography variant="subtitle2" gutterBottom>
                          {t('dashboard.cards.orders.recentOrders')}
                        </Typography>
                        <List sx={{ maxHeight: '150px', overflow: 'auto' }}>
                          {orderStats.recentOrders.slice(0, 3).map((order, index) => (
                            <Slide key={order.id} direction="left" in={!ordersLoading} timeout={800 + (index * 200)}>
                              <ListItem sx={{ py: 0.5 }}>
                                <ListItemText
                                  primary={`#${order.orderNumber || (order.id ? order.id.substring(0, 8).toUpperCase() : '')}`}
                                  secondary={`${formatCurrency(order.totalValue || order.calculatedTotalValue || order.value || 0)} - ${formatTimestamp(order.date, false)}`}
                                  primaryTypographyProps={{ variant: 'body2', fontWeight: 'bold' }}
                                  secondaryTypographyProps={{ variant: 'caption' }}
                                />
                                <Chip
                                  label={order.status}
                                  color={getStatusColor(order.status)}
                                  size="small"
                                  sx={{ ml: 1 }}
                                />
                              </ListItem>
                            </Slide>
                          ))}
                        </List>
                      </Box>
                    )}
                  </Box>
                </Fade>
              )}
            </CardContent>
            <CardActions sx={{ p: 2, pt: 0, justifyContent: 'space-between' }}>
              <AnimatedButton component={Link} to="/orders" sx={{ flexGrow: 1 }} delay={1200}>
                Przejdź
              </AnimatedButton>
              <AnimatedButton 
                component={Link} 
                to="/orders/new" 
                color="primary"
                variant="contained"
                sx={{ flexGrow: 1, ml: 1 }}
                startIcon={<AddIcon />}
                delay={1300}
              >
                Nowe
              </AnimatedButton>
            </CardActions>
          </AnimatedCard>
        </Grid>
        
        {/* Zadania produkcyjne w trakcie */}
        <Grid item xs={12}>
          <AnimatedCard index={5} delay={800} sx={{ borderRadius: 2, boxShadow: 3 }}>
            <CardContent sx={{ p: 3 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="h6">
                  {t('dashboard.production.tasksInProgress')}
                </Typography>
                <Button 
                  component={Link} 
                  to="/production"
                  variant="outlined"
                  size="small"
                >
                  {t('dashboard.production.seeAll')}
                </Button>
              </Box>
              <Divider sx={{ mb: 2 }} />
              
              <Grid container spacing={3}>
                <Grid item xs={12} md={4}>
                  <Grow in={!analyticsLoading} timeout={1000}>
                    <Box sx={{ textAlign: 'center', p: 2, bgcolor: 'primary.light', borderRadius: 2, color: 'white' }}>
                      <AnimatedCounter 
                        value={analyticsData?.production?.tasksInProgress || 0} 
                        loading={analyticsLoading} 
                        delay={1000}
                        variant="h3"
                      />
                      <Typography variant="body1">
                        {t('dashboard.production.inProgress')}
                      </Typography>
                    </Box>
                  </Grow>
                </Grid>
                
                <Grid item xs={12} md={4}>
                  <Grow in={!analyticsLoading} timeout={1200}>
                    <Box sx={{ textAlign: 'center', p: 2, bgcolor: 'success.light', borderRadius: 2, color: 'white' }}>
                      <AnimatedCounter 
                        value={analyticsData?.production?.completedTasks || 0} 
                        loading={analyticsLoading} 
                        delay={1200}
                        variant="h3"
                      />
                      <Typography variant="body1">
                        {t('dashboard.production.completed')}
                      </Typography>
                    </Box>
                  </Grow>
                </Grid>
                
                <Grid item xs={12} md={4}>
                  <Grow in={!analyticsLoading} timeout={1400}>
                    <Box sx={{ textAlign: 'center', p: 2, bgcolor: 'info.light', borderRadius: 2, color: 'white' }}>
                      <AnimatedCounter 
                        value={analyticsData?.sales?.totalOrders || 0} 
                        loading={analyticsLoading} 
                        delay={1400}
                        variant="h3"
                      />
                      <Typography variant="body1">
                        {t('dashboard.production.orders')}
                      </Typography>
                    </Box>
                  </Grow>
                </Grid>
              </Grid>
              
              {tasksLoading ? (
                <Box sx={{ mt: 3 }}>
                  <Skeleton variant="rectangular" width="100%" height={120} />
                </Box>
              ) : tasks && tasks.length > 0 ? (
                <Fade in={!tasksLoading} timeout={1000}>
                  <Box sx={{ mt: 3 }}>
                    <List sx={{ bgcolor: 'background.paper', borderRadius: 2 }}>
                      {tasks.map((task, index) => (
                        <Slide key={task.id} direction="right" in={!tasksLoading} timeout={1000 + (index * 150)}>
                          <ListItem 
                            button 
                            component={Link} 
                            to={`/production/tasks/${task.id}`}
                            sx={{ 
                              borderBottom: '1px solid', 
                              borderColor: 'divider',
                              '&:last-child': { borderBottom: 'none' }
                            }}
                          >
                            <ListItemText
                              primary={task.name}
                              secondary={`${task.productName} - ${task.quantity} ${task.unit}`}
                            />
                            <Chip 
                              label={t('dashboard.production.inProgress')} 
                              color="warning" 
                              size="small" 
                            />
                          </ListItem>
                        </Slide>
                      ))}
                    </List>
                  </Box>
                </Fade>
              ) : (
                <Fade in={!tasksLoading} timeout={1000}>
                  <Box sx={{ mt: 3, p: 3, textAlign: 'center', bgcolor: 'background.paper', borderRadius: 2 }}>
                    <Typography variant="body1" color="text.secondary">
                      Brak aktywnych zadań produkcyjnych
                    </Typography>
                  </Box>
                </Fade>
              )}
            </CardContent>
          </AnimatedCard>
        </Grid>
        
        {/* Karta Analityki */}
        <Grid item xs={12}>
          <AnimatedCard index={6} delay={1000} sx={{ borderRadius: 2, boxShadow: 3 }}>
            <CardContent sx={{ p: 3 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="h6">
                  Analityka systemu
                </Typography>
                <Button 
                  component={Link} 
                  to="/analytics"
                  variant="outlined"
                  size="small"
                  startIcon={<AnalyticsIcon />}
                >
                  Przejdź do analityki
                </Button>
              </Box>
              <Divider sx={{ mb: 2 }} />
              
              <Fade in timeout={1500}>
                <Box>
                  <Typography variant="body1" gutterBottom>
                    {t('dashboard.analytics.description')}
                  </Typography>
                  
                  <Box sx={{ mt: 2, p: 2, bgcolor: 'background.paper', borderRadius: 2, border: '1px dashed', borderColor: 'divider' }}>
                    <Typography variant="subtitle2" gutterBottom>
                      {t('dashboard.analytics.availableStats')}
                    </Typography>
                    <Grid container spacing={2}>
                      <Grid item xs={12} md={4}>
                        <Slide direction="up" in timeout={1600}>
                          <Box sx={{ display: 'flex', alignItems: 'center' }}>
                            <OrdersIcon sx={{ mr: 1, color: 'primary.main' }} />
                            <Typography variant="body2">
                              {t('dashboard.analytics.ordersAndSales')}
                            </Typography>
                          </Box>
                        </Slide>
                      </Grid>
                      <Grid item xs={12} md={4}>
                        <Slide direction="up" in timeout={1800}>
                          <Box sx={{ display: 'flex', alignItems: 'center' }}>
                            <InventoryIcon sx={{ mr: 1, color: 'primary.main' }} />
                            <Typography variant="body2">
                              {t('dashboard.analytics.inventoryLevels')}
                            </Typography>
                          </Box>
                        </Slide>
                      </Grid>
                      <Grid item xs={12} md={4}>
                        <Slide direction="up" in timeout={2000}>
                          <Box sx={{ display: 'flex', alignItems: 'center' }}>
                            <ProductionIcon sx={{ mr: 1, color: 'primary.main' }} />
                            <Typography variant="body2">
                              {t('dashboard.analytics.productionTasks')}
                            </Typography>
                          </Box>
                        </Slide>
                      </Grid>
                    </Grid>
                  </Box>
                </Box>
              </Fade>
            </CardContent>
          </AnimatedCard>
        </Grid>
      </Grid>
    </Container>
  );
};

export default Dashboard;