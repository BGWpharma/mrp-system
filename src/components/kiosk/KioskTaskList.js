// src/components/kiosk/KioskTaskList.js
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  Chip,
  Box,
  CircularProgress,
  Grid,
  Card,
  CardContent,
  Alert,
  LinearProgress,
  useTheme,
  useMediaQuery,
  TextField,
  InputAdornment
} from '@mui/material';
import {
  PlayArrow as StartIcon,
  Pause as PauseIcon,
  CheckCircle as CompleteIcon,
  Schedule as ScheduleIcon,
  Assignment as TaskIcon,
  Factory as ProductionIcon,
  Person as PersonIcon,
  CalendarToday as CalendarIcon,
  Search as SearchIcon
} from '@mui/icons-material';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../../services/firebase/config';
import { baseColors, palettes, getStatusColor } from '../../styles/colorConfig';
import { useTheme as useThemeContext } from '../../contexts/ThemeContext';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';
import { formatDateTime } from '../../utils/formatters';
import { getUsersDisplayNames } from '../../services/userService';
import { calculateMaterialReservationStatus } from '../../utils/productionUtils';

const KioskTaskList = ({ refreshTrigger, isFullscreen, onTaskClick }) => {
  const { mode } = useThemeContext();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('lg'));
  const { currentUser } = useAuth();
  const { showError } = useNotification();

  const [tasks, setTasks] = useState([]);
  const [filteredTasks, setFilteredTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [userNames, setUserNames] = useState({});
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [lastUpdate, setLastUpdate] = useState(new Date());
  const [isUpdating, setIsUpdating] = useState(false);

  const searchTermTimerRef = useRef(null);
  const colors = baseColors[mode];



  // Funkcja filtrowania zadań na podstawie wyszukiwania
  const filterTasks = useCallback((tasks, searchTerm) => {
    if (!searchTerm.trim()) {
      return tasks;
    }

    const lowercaseSearch = searchTerm.toLowerCase();
    return tasks.filter(task => 
      task.name?.toLowerCase().includes(lowercaseSearch) ||
      task.moNumber?.toLowerCase().includes(lowercaseSearch) ||
      task.productName?.toLowerCase().includes(lowercaseSearch) ||
      task.clientName?.toLowerCase().includes(lowercaseSearch) ||
      task.recipeName?.toLowerCase().includes(lowercaseSearch)
    );
  }, []);

  // Obsługa zmiany pola wyszukiwania
  const handleSearchChange = (event) => {
    setSearchTerm(event.target.value);
  };

  // Debouncing dla wyszukiwania
  useEffect(() => {
    if (searchTermTimerRef.current) {
      clearTimeout(searchTermTimerRef.current);
    }
    
    searchTermTimerRef.current = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 300); // Krótszy timeout dla kiosku

    return () => {
      if (searchTermTimerRef.current) {
        clearTimeout(searchTermTimerRef.current);
      }
    };
  }, [searchTerm]);

  // Filtrowanie zadań gdy zmieni się search term lub lista zadań
  useEffect(() => {
    const filtered = filterTasks(tasks, debouncedSearchTerm);
    setFilteredTasks(filtered);
  }, [tasks, debouncedSearchTerm, filterTasks]);

  // Real-time synchronizacja zadań produkcyjnych
  useEffect(() => {
    let unsubscribe = null;

    const setupRealtimeListener = () => {
      try {
        setLoading(true);
        setError(null);

        // Real-time listener dla zadań produkcyjnych
        const tasksRef = collection(db, 'productionTasks');
        const activeTasksQuery = query(
          tasksRef,
          where('status', '!=', 'completed')
        );

        unsubscribe = onSnapshot(activeTasksQuery, async (snapshot) => {
          try {
            setIsUpdating(true);
            
            const tasksData = snapshot.docs.map(doc => ({
              id: doc.id,
              ...doc.data()
            }));

            // Filtrujemy tylko aktywne zadania (nie zakończone i nie anulowane)
            const activeTasks = tasksData.filter(task => 
              task.status !== 'completed' && 
              task.status !== 'cancelled'
            );

            // Sortujemy według statusu i daty
            const sortedTasks = activeTasks.sort((a, b) => {
              const statusPriority = {
                'in-progress': 1,
                'ready': 2,
                'pending': 3,
                'on-hold': 4
              };
              
              const priorityA = statusPriority[a.status] || 5;
              const priorityB = statusPriority[b.status] || 5;
              
              if (priorityA !== priorityB) {
                return priorityA - priorityB;
              }
              
              // Jeśli ten sam status, sortuj według daty
              const dateA = a.scheduledDate?.toDate?.() || new Date(a.scheduledDate);
              const dateB = b.scheduledDate?.toDate?.() || new Date(b.scheduledDate);
              return dateA - dateB;
            });

            setTasks(sortedTasks);
            setLastUpdate(new Date());

            // Pobierz nazwy użytkowników
            const userIds = [...new Set(sortedTasks.map(task => task.assignedTo).filter(Boolean))];
            if (userIds.length > 0) {
              const users = await getUsersDisplayNames(userIds);
              setUserNames(users);
            }

            // Animacja aktualizacji
            setTimeout(() => setIsUpdating(false), 500);
            
            console.log('🔄 Lista zadań zaktualizowana w czasie rzeczywistym:', sortedTasks.length, 'zadań');
            
          } catch (error) {
            console.error('Błąd podczas przetwarzania zmian zadań:', error);
            setError('Błąd podczas aktualizacji listy zadań');
          } finally {
            setLoading(false);
          }
        }, (error) => {
          console.error('Błąd listenera zadań:', error);
          setError('Błąd podczas nasłuchiwania zmian zadań');
          setLoading(false);
        });

      } catch (error) {
        console.error('Błąd podczas konfiguracji real-time listenera:', error);
        setError('Nie udało się skonfigurować synchronizacji w czasie rzeczywistym');
        setLoading(false);
      }
    };

    setupRealtimeListener();

    // Cleanup function
    return () => {
      if (unsubscribe) {
        unsubscribe();
        console.log('🛑 Odłączono listener listy zadań');
      }
    };
  }, []);

  // Funkcja formatowania statusu
  const getStatusInfo = (status) => {
    const statusConfig = {
      'pending': { label: 'Oczekujące', icon: <ScheduleIcon />, color: 'warning' },
      'ready': { label: 'Gotowe', icon: <TaskIcon />, color: 'info' },
      'in-progress': { label: 'W trakcie', icon: <StartIcon />, color: 'primary' },
      'on-hold': { label: 'Wstrzymane', icon: <PauseIcon />, color: 'secondary' },
      'completed': { label: 'Zakończone', icon: <CompleteIcon />, color: 'success' }
    };
    
    return statusConfig[status] || { label: status, icon: <TaskIcon />, color: 'default' };
  };

  // Funkcja formatowania priorytetu
  const getPriorityColor = (priority) => {
    switch (priority?.toLowerCase()) {
      case 'high': case 'wysoki': return 'error';
      case 'medium': case 'średni': return 'warning';
      case 'low': case 'niski': return 'success';
      default: return 'default';
    }
  };

  // Funkcja obliczania postępu
  const calculateProgress = (task) => {
    if (!task.targetQuantity || task.targetQuantity === 0) return 0;
    const completed = task.completedQuantity || 0;
    return Math.min((completed / task.targetQuantity) * 100, 100);
  };

  if (loading) {
    return (
      <Paper elevation={2} sx={{ p: 4, textAlign: 'center' }}>
        <CircularProgress size={60} sx={{ color: palettes.primary.main }} />
        <Typography variant="h6" sx={{ mt: 2, color: colors.text.secondary }}>
          Ładowanie zadań produkcyjnych...
        </Typography>
      </Paper>
    );
  }

  if (error) {
    return (
      <Alert severity="error" sx={{ mb: 2 }}>
        {error}
      </Alert>
    );
  }

  if (tasks.length === 0) {
    return (
      <Paper elevation={2} sx={{ p: 4, textAlign: 'center' }}>
        <ProductionIcon sx={{ fontSize: 80, color: colors.text.disabled, mb: 2 }} />
        <Typography variant="h6" sx={{ color: colors.text.secondary }}>
          Brak aktywnych zadań produkcyjnych
        </Typography>
        <Typography variant="body2" sx={{ color: colors.text.disabled, mt: 1 }}>
          Wszystkie zadania zostały zakończone lub nie ma zaplanowanych zadań
        </Typography>
      </Paper>
    );
  }

  if (filteredTasks.length === 0 && tasks.length > 0) {
    return (
      <Paper elevation={2} sx={{ p: 4, textAlign: 'center' }}>
        <SearchIcon sx={{ fontSize: 80, color: colors.text.disabled, mb: 2 }} />
        <Typography variant="h6" sx={{ color: colors.text.secondary }}>
          Brak wyników wyszukiwania
        </Typography>
        <Typography variant="body2" sx={{ color: colors.text.disabled, mt: 1 }}>
          Spróbuj użyć innych słów kluczowych lub wyczyść wyszukiwanie
        </Typography>
      </Paper>
    );
  }

  // Renderowanie w trybie kart dla wszystkich urządzeń (mobile i desktop)
  return (
      <Box>
        {/* Pole wyszukiwania */}
        <Box sx={{ mb: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
          <TextField
            variant="outlined"
            size="small"
            placeholder="Wyszukaj zadania..."
            value={searchTerm}
            onChange={handleSearchChange}
            sx={{ 
              width: isMobile ? '100%' : 400,
              '& .MuiInputBase-root': {
                fontSize: '0.875rem'
              }
            }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon color="action" sx={{ fontSize: isMobile ? '1.1rem' : '1.25rem' }} />
                </InputAdornment>
              ),
              sx: {
                borderRadius: '8px',
                backgroundColor: colors.paper,
              }
            }}
          />
          
          {/* Informacja o liczbie wyników */}
          {searchTerm && (
            <Typography 
              variant={isMobile ? "caption" : "body2"} 
              sx={{ 
                color: colors.text.secondary,
                mt: isMobile ? 0.5 : 0,
                display: isMobile ? 'block' : 'inline',
                width: isMobile ? '100%' : 'auto'
              }}
            >
              Znaleziono: {filteredTasks.length} z {tasks.length} zadań
            </Typography>
          )}
        </Box>

        <Grid container spacing={isFullscreen ? 2 : 1.5}>
        {filteredTasks.map((task) => {
          const statusInfo = getStatusInfo(task.status);
          const progress = calculateProgress(task);
          const statusColors = getStatusColor(task.status);
          const totalCompletedQuantity = task.totalCompletedQuantity || 0;
          const remainingQuantity = Math.max(0, task.quantity - totalCompletedQuantity);
          
          return (
            <Grid item xs={12} sm={6} md={isFullscreen ? 3 : 4} lg={isFullscreen ? 3 : 4} xl={isFullscreen ? 3 : 3} key={task.id}>
              <Card 
                variant="outlined" 
                sx={{ 
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  bgcolor: mode === 'dark' ? 'background.paper' : 'rgb(249, 249, 249)',
                  borderColor: mode === 'dark' ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.12)',
                  borderLeft: `4px solid ${statusColors.main}`,
                  cursor: 'pointer',
                  '&:hover': {
                    elevation: 4,
                    transform: 'translateY(-2px)',
                    transition: 'all 0.2s ease-in-out',
                    borderColor: statusColors.main,
                    boxShadow: `0 4px 20px ${statusColors.main}30`
                  }
                }}
                onClick={() => onTaskClick && onTaskClick(task)}
              >
                <CardContent sx={{ pb: 1.5, pt: 2, px: 2, flexGrow: 1 }}>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <Typography variant="subtitle1" sx={{ 
                        color: palettes.primary.main,
                        fontWeight: 'semibold',
                        fontSize: isMobile ? '0.95rem' : '1.1rem',
                        lineHeight: 1.3
                      }}>
                        {task.name}
                      </Typography>
                      <Chip 
                        label={statusInfo.label} 
                        size={isMobile ? "small" : "medium"}
                        sx={{ 
                          fontSize: isMobile ? '0.7rem' : '0.8rem', 
                          height: isMobile ? '24px' : '28px',
                          backgroundColor: statusColors.main,
                          color: 'white',
                          fontWeight: 'medium'
                        }}
                      />
                    </Box>
                    
                    {task.moNumber && (
                      <Chip 
                        size="small" 
                        label={`MO: ${task.moNumber}`} 
                        color="secondary" 
                        variant="outlined" 
                        sx={{ 
                          alignSelf: 'flex-start', 
                          fontSize: isMobile ? '0.7rem' : '0.75rem', 
                          height: isMobile ? '20px' : '24px',
                          mt: 0.5
                        }}
                      />
                    )}
                    
                    <Typography variant="body2" sx={{ 
                      fontSize: isMobile ? '0.85rem' : '1rem',
                      color: colors.text.primary,
                      fontWeight: 'medium',
                      mt: 0.5
                    }}>
                      {task.productName}
                    </Typography>
                    
                    {task.clientName && (
                      <Typography variant="body2" sx={{ 
                        color: colors.text.secondary,
                        fontSize: isMobile ? '0.8rem' : '0.9rem'
                      }}>
                        Klient: {task.clientName}
                      </Typography>
                    )}
                    
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 1 }}>
                      <Typography variant="body2" sx={{ 
                        color: colors.text.secondary,
                        fontSize: isMobile ? '0.8rem' : '0.9rem'
                      }}>
                        Ilość: {totalCompletedQuantity} / {task.quantity} {task.unit}
                      </Typography>
                      <Typography variant="body2" sx={{ 
                        color: remainingQuantity > 0 ? 'warning.main' : 'success.main',
                        fontWeight: 'medium',
                        fontSize: isMobile ? '0.8rem' : '0.9rem'
                      }}>
                        {remainingQuantity > 0 ? `Pozostało: ${remainingQuantity}` : 'Zakończone'}
                      </Typography>
                    </Box>
                    
                    {task.quantity > 0 && (
                      <LinearProgress 
                        variant="determinate" 
                        value={Math.min((totalCompletedQuantity / task.quantity) * 100, 100)}
                        sx={{
                          height: 6,
                          borderRadius: 3,
                          backgroundColor: `${statusColors.main}20`,
                          '& .MuiLinearProgress-bar': {
                            backgroundColor: statusColors.main,
                            borderRadius: 3
                          }
                        }}
                      />
                    )}
                    
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, mt: 1 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <CalendarIcon sx={{ fontSize: isMobile ? 14 : 16, color: colors.text.secondary }} />
                        <Typography variant="body2" sx={{ 
                          color: colors.text.secondary,
                          fontSize: isMobile ? '0.75rem' : '0.85rem'
                        }}>
                          Start: {formatDateTime(task.scheduledDate)}
                        </Typography>
                      </Box>
                      
                      {task.endDate && (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <CalendarIcon sx={{ fontSize: isMobile ? 14 : 16, color: colors.text.secondary }} />
                          <Typography variant="body2" sx={{ 
                            color: colors.text.secondary,
                            fontSize: isMobile ? '0.75rem' : '0.85rem'
                          }}>
                            Koniec: {formatDateTime(task.endDate)}
                          </Typography>
                        </Box>
                      )}
                      
                      {(() => {
                        const reservationStatus = calculateMaterialReservationStatus(task);
                        const statusText = reservationStatus.isFullyReserved ? 'Materiały zarezerwowane' : 
                                          reservationStatus.isPartiallyReserved ? 'Materiały częściowo zarezerwowane' : 'Materiały nie zarezerwowane';
                        const statusColor = reservationStatus.isFullyReserved ? 'success.main' : 
                                           reservationStatus.isPartiallyReserved ? 'warning.main' : 'error.main';
                        
                        return (
                          <Typography variant="body2" sx={{ 
                            color: statusColor,
                            fontWeight: 'medium',
                            fontSize: isMobile ? '0.75rem' : '0.85rem',
                            mt: 0.5
                          }}>
                            {statusText}
                          </Typography>
                        );
                      })()}
                    </Box>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          );
        })}
        </Grid>
      </Box>
    );
  
};

export default KioskTaskList;
