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
          Ładowanie zadań...
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
          Brak aktywnych zadań
        </Typography>
        <Typography variant="body2" sx={{ color: colors.text.disabled, mt: 1 }}>
          Wszystkie zadania zostały zakończone
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
          Sprawdź wpisane frazy lub wyczyść wyszukiwanie
        </Typography>
      </Paper>
    );
  }

  // Renderowanie w trybie kart dla wszystkich urządzeń (mobile i desktop)
  return (
      <Box>
        {/* Pole wyszukiwania */}
        <Box sx={{ 
          mb: 3, 
          p: { xs: 2, md: 2.5 },
          borderRadius: 4,
          background: mode === 'dark' 
            ? `linear-gradient(135deg, ${colors.paper} 0%, rgba(33, 150, 243, 0.03) 100%)`
            : `linear-gradient(135deg, ${colors.paper} 0%, rgba(33, 150, 243, 0.01) 100%)`,
          border: `1px solid ${mode === 'dark' ? 'rgba(33, 150, 243, 0.15)' : 'rgba(33, 150, 243, 0.08)'}`,
          boxShadow: `0 4px 20px rgba(33, 150, 243, 0.08)`,
          position: 'relative',
          overflow: 'hidden'
        }}>
          {/* Decorative gradient */}
          <Box
            sx={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: 2,
              background: `linear-gradient(90deg, transparent 0%, rgba(33, 150, 243, 0.6) 50%, transparent 100%)`,
            }}
          />
          
          <Box sx={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center', 
            flexWrap: 'wrap', 
            gap: 2,
            position: 'relative',
            zIndex: 1
          }}>
            <Box sx={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: 2, 
              width: isMobile ? '100%' : 'auto',
              flex: 1
            }}>
              <Box
                sx={{
                  p: 1.5,
                  borderRadius: 2,
                  background: `linear-gradient(135deg, rgba(33, 150, 243, 0.1) 0%, rgba(33, 150, 243, 0.05) 100%)`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minWidth: 'auto'
                }}
              >
                <SearchIcon sx={{ 
                  color: 'primary.main', 
                  fontSize: { xs: 20, md: 24 }
                }} />
              </Box>
              
              <TextField
                variant="outlined"
                size="medium"
                placeholder="Wyszukaj zadania produkcyjne..."
                value={searchTerm}
                onChange={handleSearchChange}
                sx={{ 
                  flex: 1,
                  maxWidth: isMobile ? '100%' : 500,
                  '& .MuiOutlinedInput-root': {
                    fontSize: { xs: '0.9rem', md: '1rem' },
                    backgroundColor: mode === 'dark' ? 'rgba(255, 255, 255, 0.02)' : 'rgba(255, 255, 255, 0.8)',
                    borderRadius: 3,
                    border: `2px solid ${mode === 'dark' ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)'}`,
                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                    '&:hover': {
                      borderColor: 'primary.main',
                      backgroundColor: mode === 'dark' ? 'rgba(255, 255, 255, 0.04)' : 'rgba(255, 255, 255, 0.95)',
                      boxShadow: `0 4px 12px rgba(33, 150, 243, 0.15)`
                    },
                    '&.Mui-focused': {
                      borderColor: 'primary.main',
                      backgroundColor: mode === 'dark' ? 'rgba(255, 255, 255, 0.05)' : '#ffffff',
                      boxShadow: `0 6px 20px rgba(33, 150, 243, 0.2)`
                    },
                    '& fieldset': {
                      border: 'none'
                    }
                  },
                  '& .MuiOutlinedInput-input': {
                    py: { xs: 1.5, md: 2 },
                    px: 2,
                    fontWeight: 500,
                    '&::placeholder': {
                      color: colors.text.secondary,
                      opacity: 0.8,
                      fontStyle: 'italic'
                    }
                  }
                }}
              />
            </Box>
            
            {/* Informacja o liczbie wyników */}
            {searchTerm && (
              <Box sx={{ 
                px: 2, 
                py: 1,
                borderRadius: 2,
                background: `linear-gradient(135deg, rgba(76, 175, 80, 0.1) 0%, rgba(76, 175, 80, 0.05) 100%)`,
                border: `1px solid rgba(76, 175, 80, 0.2)`,
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                minWidth: 'auto'
              }}>
                <Box
                  sx={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    backgroundColor: 'success.main',
                    animation: 'pulse 2s infinite',
                    '@keyframes pulse': {
                      '0%': {
                        opacity: 1,
                        transform: 'scale(1)'
                      },
                      '50%': {
                        opacity: 0.7,
                        transform: 'scale(1.1)'
                      },
                      '100%': {
                        opacity: 1,
                        transform: 'scale(1)'
                      }
                    }
                  }}
                />
                <Typography 
                  variant="body2"
                  sx={{ 
                    color: 'success.main',
                    fontWeight: 600,
                    fontSize: { xs: '0.8rem', md: '0.875rem' }
                  }}
                >
                  {filteredTasks.length} z {tasks.length} zadań
                </Typography>
              </Box>
            )}
          </Box>
        </Box>

        <Grid container spacing={isFullscreen ? 3 : 2.5}>
        {filteredTasks.map((task) => {
          const statusInfo = getStatusInfo(task.status);
          const progress = calculateProgress(task);
          const statusColors = getStatusColor(task.status);
          const totalCompletedQuantity = task.totalCompletedQuantity || 0;
          const remainingQuantity = Math.max(0, task.quantity - totalCompletedQuantity);
          
          return (
            <Grid item xs={12} sm={6} md={isFullscreen ? 4 : 6} lg={isFullscreen ? 4 : 4} xl={isFullscreen ? 3 : 4} key={task.id}>
              <Card 
                elevation={0}
                sx={{ 
                  height: '100%',
                  minHeight: { xs: 280, md: 320 },
                  display: 'flex',
                  flexDirection: 'column',
                  borderRadius: 4,
                  border: `2px solid ${mode === 'dark' ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)'}`,
                  bgcolor: colors.paper,
                  cursor: 'pointer',
                  overflow: 'hidden',
                  position: 'relative',
                  '&:hover': {
                    transform: 'translateY(-2px)',
                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                    boxShadow: `0 12px 40px ${statusColors.main}20`,
                    borderColor: statusColors.main,
                    '&::before': {
                      opacity: 1
                    }
                  },
                  '&::before': {
                    content: '""',
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: `linear-gradient(135deg, ${statusColors.main}05 0%, transparent 50%)`,
                    opacity: 0,
                    transition: 'opacity 0.3s ease-in-out',
                    pointerEvents: 'none',
                    zIndex: 0
                  }
                }}
                onClick={() => onTaskClick && onTaskClick(task)}
              >
                {/* Status header bar */}
                <Box sx={{ 
                  height: 6, 
                  background: `linear-gradient(90deg, ${statusColors.main} 0%, ${statusColors.light || statusColors.main} 100%)`,
                  width: '100%',
                  position: 'relative',
                  zIndex: 1
                }} />
                
                <CardContent sx={{ p: { xs: 2.5, md: 3 }, flexGrow: 1, position: 'relative', zIndex: 1 }}>
                  {/* Header z nazwą i statusem */}
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2.5 }}>
                    <Typography variant="h6" sx={{ 
                      color: colors.text.primary,
                      fontWeight: 700,
                      fontSize: { xs: '1.1rem', md: '1.2rem' },
                      lineHeight: 1.3,
                      flex: 1,
                      pr: 1
                    }}>
                      {task.name}
                    </Typography>
                    <Chip 
                      label={statusInfo.label} 
                      size="small"
                      sx={{ 
                        background: `linear-gradient(135deg, ${statusColors.main} 0%, ${statusColors.dark || statusColors.main} 100%)`,
                        color: 'white',
                        fontWeight: 600,
                        fontSize: '0.75rem',
                        height: 28,
                        borderRadius: 2,
                        boxShadow: `0 2px 8px ${statusColors.main}40`,
                        ml: 1,
                        minWidth: 'auto'
                      }}
                    />
                  </Box>
                  
                  {/* Produkt */}
                  <Typography variant="body1" sx={{ 
                    color: colors.text.primary,
                    fontWeight: 600,
                    mb: 2,
                    fontSize: { xs: '0.95rem', md: '1rem' },
                    lineHeight: 1.4
                  }}>
                    {task.productName}
                  </Typography>
                  
                  {/* MO Number i Client w jednej linii */}
                  <Box sx={{ display: 'flex', gap: 1.5, mb: 2.5, flexWrap: 'wrap' }}>
                    {task.moNumber && (
                      <Box sx={{ 
                        px: 2, 
                        py: 0.75, 
                        borderRadius: 2, 
                        background: `linear-gradient(135deg, ${colors.background} 0%, rgba(33, 150, 243, 0.03) 100%)`,
                        border: `1px solid ${mode === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)'}`,
                        boxShadow: `0 1px 3px rgba(0, 0, 0, 0.05)`
                      }}>
                        <Typography variant="caption" sx={{ 
                          color: colors.text.secondary,
                          fontSize: '0.75rem',
                          textTransform: 'uppercase',
                          fontWeight: 600,
                          letterSpacing: '0.5px'
                        }}>
                          MO: {task.moNumber}
                        </Typography>
                      </Box>
                    )}
                    
                    {task.clientName && (
                      <Box sx={{ 
                        px: 2, 
                        py: 0.75, 
                        borderRadius: 2, 
                        background: `linear-gradient(135deg, ${colors.background} 0%, rgba(76, 175, 80, 0.03) 100%)`,
                        border: `1px solid ${mode === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)'}`,
                        boxShadow: `0 1px 3px rgba(0, 0, 0, 0.05)`
                      }}>
                        <Typography variant="caption" sx={{ 
                          color: colors.text.secondary,
                          fontSize: '0.75rem',
                          fontWeight: 600
                        }}>
                          {task.clientName}
                        </Typography>
                      </Box>
                    )}
                  </Box>
                  
                  {/* Postęp produkcji */}
                  <Box sx={{ 
                    p: 2, 
                    borderRadius: 3, 
                    background: `linear-gradient(135deg, ${statusColors.main}05 0%, ${statusColors.main}02 100%)`,
                    border: `1px solid ${statusColors.main}15`,
                    mb: 2,
                    position: 'relative',
                    overflow: 'hidden',
                    '&::before': {
                      content: '""',
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      right: 0,
                      height: 2,
                      background: `linear-gradient(90deg, ${statusColors.main} 0%, ${statusColors.light || statusColors.main} 100%)`,
                      opacity: 0.6
                    }
                  }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1.5 }}>
                      <Typography variant="body2" sx={{ 
                        color: colors.text.primary,
                        fontWeight: 600,
                        fontSize: '0.9rem'
                      }}>
                        Postęp
                      </Typography>
                      <Typography variant="body2" sx={{ 
                        color: statusColors.main,
                        fontWeight: 700,
                        fontSize: '0.9rem'
                      }}>
                        {totalCompletedQuantity} / {task.quantity} {task.unit}
                      </Typography>
                    </Box>
                    
                    <LinearProgress 
                      variant="determinate" 
                      value={Math.min((totalCompletedQuantity / task.quantity) * 100, 100)}
                      sx={{
                        height: 8,
                        borderRadius: 4,
                        backgroundColor: `${statusColors.main}15`,
                        position: 'relative',
                        overflow: 'hidden',
                        '& .MuiLinearProgress-bar': {
                          background: `linear-gradient(90deg, ${statusColors.main} 0%, ${statusColors.light || statusColors.main} 100%)`,
                          borderRadius: 4,
                          position: 'relative',
                          '&::after': {
                            content: '""',
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            right: 0,
                            bottom: 0,
                            background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.2) 50%, transparent 100%)',
                            animation: 'shimmer 2s infinite linear'
                          }
                        },
                        '@keyframes shimmer': {
                          '0%': { transform: 'translateX(-100%)' },
                          '100%': { transform: 'translateX(100%)' }
                        }
                      }}
                    />
                    
                    {remainingQuantity > 0 && (
                      <Typography variant="caption" sx={{ 
                        color: 'warning.main',
                        fontWeight: 600,
                        display: 'block',
                        mt: 1,
                        fontSize: '0.8rem'
                      }}>
                        Pozostało: {remainingQuantity} {task.unit}
                      </Typography>
                    )}
                  </Box>
                  
                  {/* Data rozpoczęcia */}
                  <Box sx={{ 
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    p: 1.5,
                    borderRadius: 2,
                    background: `linear-gradient(135deg, ${colors.background} 0%, rgba(158, 158, 158, 0.02) 100%)`,
                    border: `1px solid ${mode === 'dark' ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)'}`
                  }}>
                    <ScheduleIcon sx={{ 
                      fontSize: 16, 
                      color: colors.text.secondary 
                    }} />
                    <Typography variant="body2" sx={{ 
                      color: colors.text.secondary,
                      fontSize: '0.85rem',
                      fontWeight: 500
                    }}>
                      {formatDateTime(task.scheduledDate)}
                    </Typography>
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
