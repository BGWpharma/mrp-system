// src/components/kiosk/KioskTaskDetails.js
import React, { useState, useEffect } from 'react';
import {
  Paper,
  Typography,
  Box,
  CircularProgress,
  Alert,
  Grid,
  Card,
  CardContent,
  Chip,
  IconButton,
  Divider,
  LinearProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Checkbox,
  FormControlLabel,
  useTheme,
  useMediaQuery
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  Schedule as ScheduleIcon,
  Assignment as TaskIcon,
  LocalShipping as LotIcon,
  CalendarToday as CalendarIcon,
  CheckCircle as CheckCircleIcon,
  RadioButtonUnchecked as UncheckedIcon,
  Assignment as PlanIcon,
  Factory as ProductionIcon
} from '@mui/icons-material';
import { getTaskById } from '../../services/productionService';
import { getIngredientReservationLinks } from '../../services/mixingPlanReservationService';
import { doc, updateDoc, serverTimestamp, onSnapshot, collection, query, where } from 'firebase/firestore';
import { db } from '../../services/firebase/config';
import { baseColors, palettes, getStatusColor } from '../../styles/colorConfig';
import { useTheme as useThemeContext } from '../../contexts/ThemeContext';
import { useNotification } from '../../hooks/useNotification';
import { useAuth } from '../../hooks/useAuth';
import { formatDateTime } from '../../utils/formatters';

const KioskTaskDetails = ({ taskId, onBack }) => {
  const { mode } = useThemeContext();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const { showError, showSuccess } = useNotification();
  const { currentUser } = useAuth();

  const [task, setTask] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [ingredientLinks, setIngredientLinks] = useState({});
  const [lastUpdate, setLastUpdate] = useState(new Date());
  const [isUpdating, setIsUpdating] = useState(false);

  const colors = baseColors[mode];

  // Real-time synchronizacja zadania i powiązań rezerwacji
  useEffect(() => {
    if (!taskId) return;

    let unsubscribeTask = null;
    let unsubscribeLinks = null;

    const setupRealtimeListeners = async () => {
      try {
        setLoading(true);
        setError(null);

        // 1. Real-time listener dla zadania produkcyjnego
        const taskRef = doc(db, 'productionTasks', taskId);
        unsubscribeTask = onSnapshot(taskRef, (docSnapshot) => {
          if (docSnapshot.exists()) {
            setIsUpdating(true);
            const taskData = { id: docSnapshot.id, ...docSnapshot.data() };
            setTask(taskData);
            setLastUpdate(new Date());
            
            // Animacja "migania" przy aktualizacji
            setTimeout(() => setIsUpdating(false), 500);
            
            console.log('🔄 Zadanie zaktualizowane w czasie rzeczywistym:', taskData.name);
          } else {
            setError('Zadanie nie zostało znalezione');
          }
        }, (error) => {
          console.error('Błąd listenera zadania:', error);
          setError('Błąd podczas nasłuchiwania zmian zadania');
          showError('Błąd synchronizacji w czasie rzeczywistym');
        });

        // 2. Pobranie początkowych powiązań rezerwacji
        const links = await getIngredientReservationLinks(taskId);
        setIngredientLinks(links);

        // 3. Real-time listener dla powiązań rezerwacji
        const linksRef = collection(db, 'ingredientReservationLinks');
        const linksQuery = query(linksRef, where('taskId', '==', taskId));
        
        unsubscribeLinks = onSnapshot(linksQuery, async (snapshot) => {
          try {
            // Odśwież powiązania gdy coś się zmieni
            const updatedLinks = await getIngredientReservationLinks(taskId);
            setIngredientLinks(updatedLinks);
            setIsUpdating(true);
            setTimeout(() => setIsUpdating(false), 500);
            console.log('🔄 Powiązania rezerwacji zaktualizowane w czasie rzeczywistym');
          } catch (error) {
            console.error('Błąd podczas aktualizacji powiązań:', error);
          }
        });

      } catch (error) {
        console.error('Błąd podczas konfiguracji real-time listenerów:', error);
        setError('Nie udało się skonfigurować synchronizacji w czasie rzeczywistym');
        showError('Błąd podczas konfiguracji synchronizacji');
      } finally {
        setLoading(false);
      }
    };

    setupRealtimeListeners();

    // Cleanup function - odłącz listenery przy unmount
    return () => {
      if (unsubscribeTask) {
        unsubscribeTask();
        console.log('🛑 Odłączono listener zadania');
      }
      if (unsubscribeLinks) {
        unsubscribeLinks();
        console.log('🛑 Odłączono listener powiązań');
      }
    };
  }, [taskId, showError]);

  // Funkcja aktualizacji checklist
  const handleChecklistUpdate = async (itemId, completed) => {
    if (!task?.mixingPlanChecklist || !currentUser) return;

    try {
      const taskRef = doc(db, 'productionTasks', task.id);
      const updatedChecklist = task.mixingPlanChecklist.map(checkItem => {
        if (checkItem.id === itemId) {
          return {
            ...checkItem,
            completed: completed,
            completedAt: completed ? new Date().toISOString() : null,
            completedBy: completed ? currentUser.uid : null
          };
        }
        return checkItem;
      });

      await updateDoc(taskRef, {
        mixingPlanChecklist: updatedChecklist,
        updatedAt: serverTimestamp(),
        updatedBy: currentUser.uid
      });

      setTask(prevTask => ({
        ...prevTask,
        mixingPlanChecklist: updatedChecklist
      }));

      showSuccess('Zaktualizowano stan zadania');
    } catch (error) {
      console.error('Błąd podczas aktualizacji checklisty:', error);
      showError('Nie udało się zaktualizować stanu zadania');
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <CircularProgress size={60} sx={{ color: palettes.primary.main }} />
      </Box>
    );
  }

  if (error) {
    return (
      <Alert severity="error" sx={{ mb: 2 }}>
        {error}
      </Alert>
    );
  }

  if (!task) {
    return (
      <Alert severity="warning" sx={{ mb: 2 }}>
        Nie znaleziono zadania
      </Alert>
    );
  }

  const statusColors = getStatusColor(task.status);
  const totalCompletedQuantity = task.totalCompletedQuantity || 0;
  const remainingQuantity = Math.max(0, task.quantity - totalCompletedQuantity);
  const progress = task.quantity > 0 ? Math.min((totalCompletedQuantity / task.quantity) * 100, 100) : 0;

  // Przygotowanie danych planu mieszań
  const mixingPlanItems = task.mixingPlanChecklist || [];
  const completedItems = mixingPlanItems.filter(item => item.completed).length;
  const totalItems = mixingPlanItems.length;
  const mixingProgress = totalItems > 0 ? (completedItems / totalItems) * 100 : 0;

  return (
    <Box>
             {/* Nagłówek z przyciskiem powrotu i wskaźnikiem synchronizacji */}
       <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
         <IconButton
           onClick={onBack}
           sx={{
             mr: 2,
             color: palettes.primary.main,
             '&:hover': {
               backgroundColor: `${palettes.primary.main}10`
             }
           }}
         >
           <ArrowBackIcon />
         </IconButton>
         <Typography variant={isMobile ? "h5" : "h4"} sx={{ fontWeight: 600, color: palettes.primary.dark }}>
           Szczegóły zadania
         </Typography>
         
         {/* Wskaźnik synchronizacji */}
         <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 1 }}>
           <Box
             sx={{
               width: 8,
               height: 8,
               borderRadius: '50%',
               backgroundColor: isUpdating ? 'warning.main' : 'success.main',
               animation: isUpdating ? 'pulse 1.5s infinite' : 'none',
               '@keyframes pulse': {
                 '0%': { opacity: 1 },
                 '50%': { opacity: 0.5 },
                 '100%': { opacity: 1 }
               }
             }}
           />
           <Typography variant="caption" sx={{ color: colors.text.secondary, fontSize: '0.75rem' }}>
             {isUpdating ? 'Synchronizacja...' : `Ostatnia aktualizacja: ${lastUpdate.toLocaleTimeString('pl-PL')}`}
           </Typography>
         </Box>
       </Box>

      <Grid container spacing={3}>
        {/* Podstawowe informacje o zadaniu */}
        <Grid item xs={12} md={8}>
          <Card elevation={3} sx={{ borderLeft: `4px solid ${statusColors.main}` }}>
            <CardContent sx={{ p: 3 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                <Typography variant="h5" sx={{ fontWeight: 600, color: palettes.primary.main }}>
                  {task.name}
                </Typography>
                <Chip
                  label={task.status}
                  sx={{
                    backgroundColor: statusColors.main,
                    color: 'white',
                    fontWeight: 'medium',
                    fontSize: '0.875rem'
                  }}
                />
              </Box>

              <Typography variant="h6" sx={{ mb: 1, fontWeight: 500 }}>
                {task.productName}
              </Typography>

              {task.clientName && (
                <Typography variant="body1" sx={{ color: colors.text.secondary, mb: 2 }}>
                  Klient: {task.clientName}
                </Typography>
              )}

              <Grid container spacing={2} sx={{ mt: 1 }}>
                <Grid item xs={12} sm={6}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                    <TaskIcon sx={{ fontSize: 20, color: colors.text.secondary }} />
                    <Typography variant="body2" sx={{ color: colors.text.secondary }}>
                      Numer MO: <strong>{task.moNumber || 'Nie przypisano'}</strong>
                    </Typography>
                  </Box>
                </Grid>
                
                <Grid item xs={12} sm={6}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                    <LotIcon sx={{ fontSize: 20, color: colors.text.secondary }} />
                    <Typography variant="body2" sx={{ color: colors.text.secondary }}>
                      Numer LOT: <strong>{task.lotNumber || 'Nie przypisano'}</strong>
                    </Typography>
                  </Box>
                </Grid>

                <Grid item xs={12} sm={6}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                    <CalendarIcon sx={{ fontSize: 20, color: colors.text.secondary }} />
                    <Typography variant="body2" sx={{ color: colors.text.secondary }}>
                      Data ważności: <strong>{task.expiryDate ? formatDateTime(task.expiryDate) : 'Nie ustawiono'}</strong>
                    </Typography>
                  </Box>
                </Grid>

                <Grid item xs={12} sm={6}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                    <ScheduleIcon sx={{ fontSize: 20, color: colors.text.secondary }} />
                    <Typography variant="body2" sx={{ color: colors.text.secondary }}>
                      Planowany start: <strong>{formatDateTime(task.scheduledDate)}</strong>
                    </Typography>
                  </Box>
                </Grid>
              </Grid>

              <Divider sx={{ my: 2 }} />

              {/* Postęp produkcji */}
              <Typography variant="h6" sx={{ mb: 2, fontWeight: 500 }}>
                Postęp produkcji
              </Typography>
              
              <Box sx={{ mb: 2 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                  <Typography variant="body1">
                    {totalCompletedQuantity} / {task.quantity} {task.unit}
                  </Typography>
                  <Typography variant="body1" sx={{ fontWeight: 600 }}>
                    {progress.toFixed(1)}%
                  </Typography>
                </Box>
                <LinearProgress
                  variant="determinate"
                  value={progress}
                  sx={{
                    height: 10,
                    borderRadius: 5,
                    backgroundColor: `${statusColors.main}20`,
                    '& .MuiLinearProgress-bar': {
                      backgroundColor: statusColors.main,
                      borderRadius: 5
                    }
                  }}
                />
                {remainingQuantity > 0 && (
                  <Typography variant="body2" sx={{ color: 'warning.main', mt: 1, fontWeight: 500 }}>
                    Pozostało do wyprodukowania: {remainingQuantity} {task.unit}
                  </Typography>
                )}
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Plan mieszań - szczegółowy widok */}
        <Grid item xs={12}>
          <Card elevation={3}>
            <CardContent sx={{ p: 3 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
                <PlanIcon sx={{ color: palettes.primary.main }} />
                <Typography variant="h6" sx={{ fontWeight: 600 }}>
                  Plan mieszań
                </Typography>
              </Box>

              {totalItems > 0 ? (
                <>
                  {/* Ogólny postęp */}
                  <Box sx={{ mb: 3, p: 2, bgcolor: colors.paperDarker, borderRadius: 2 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                      <Typography variant="body1" sx={{ fontWeight: 500 }}>
                        Ogólny postęp planu mieszań
                      </Typography>
                      <Typography variant="body1" sx={{ fontWeight: 600 }}>
                        {completedItems} / {totalItems} ({mixingProgress.toFixed(0)}%)
                      </Typography>
                    </Box>
                    <LinearProgress
                      variant="determinate"
                      value={mixingProgress}
                      sx={{
                        height: 10,
                        borderRadius: 5,
                        backgroundColor: `${palettes.success.main}20`,
                        '& .MuiLinearProgress-bar': {
                          backgroundColor: palettes.success.main,
                          borderRadius: 5
                        }
                      }}
                    />
                  </Box>

                  {/* Lista mieszań z szczegółami */}
                  {task.mixingPlanChecklist.filter(item => item.type === 'header').map(headerItem => {
                    const ingredients = task.mixingPlanChecklist.filter(
                      item => item.parentId === headerItem.id && item.type === 'ingredient'
                    );
                    const checkItems = task.mixingPlanChecklist.filter(
                      item => item.parentId === headerItem.id && item.type === 'check'
                    );
                    
                    const completedInMixing = checkItems.filter(item => item.completed).length;
                    const totalInMixing = checkItems.length;
                    const mixingProgressPercent = totalInMixing > 0 ? (completedInMixing / totalInMixing) * 100 : 0;
                    
                    return (
                      <Box key={headerItem.id} sx={{ 
                        mb: 3, 
                        border: `2px solid ${palettes.primary.main}20`, 
                        borderRadius: 2, 
                        overflow: 'hidden'
                      }}>
                        {/* Nagłówek mieszania */}
                        <Box sx={{ 
                          p: 2, 
                          bgcolor: `${palettes.primary.main}10`,
                          borderBottom: `1px solid ${palettes.primary.main}20`
                        }}>
                          <Typography variant="h6" sx={{ fontWeight: 600, color: palettes.primary.main, mb: 0.5 }}>
                            {headerItem.text}
                          </Typography>
                          {headerItem.details && (
                            <Typography variant="body2" sx={{ color: colors.text.secondary }}>
                              {headerItem.details}
                            </Typography>
                          )}
                          
                          {/* Postęp mieszania */}
                          <Box sx={{ mt: 2 }}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                              <Typography variant="caption">
                                Postęp mieszania: {completedInMixing} / {totalInMixing}
                              </Typography>
                              <Typography variant="caption" sx={{ fontWeight: 600 }}>
                                {mixingProgressPercent.toFixed(0)}%
                              </Typography>
                            </Box>
                            <LinearProgress
                              variant="determinate"
                              value={mixingProgressPercent}
                              sx={{
                                height: 6,
                                borderRadius: 3,
                                backgroundColor: `${palettes.info.main}20`,
                                '& .MuiLinearProgress-bar': {
                                  backgroundColor: palettes.info.main,
                                  borderRadius: 3
                                }
                              }}
                            />
                          </Box>
                        </Box>
                        
                        <Box sx={{ p: 2 }}>
                          <Grid container spacing={3}>
                            {/* Składniki z rezerwacjami */}
                            {ingredients.length > 0 && (
                              <Grid item xs={12} md={8}>
                                <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 2, color: palettes.secondary.main }}>
                                  📦 Składniki i powiązane rezerwacje
                                </Typography>
                                
                                <TableContainer component={Paper} variant="outlined" sx={{ mb: 2 }}>
                                  <Table size="small">
                                    <TableHead>
                                      <TableRow>
                                        <TableCell sx={{ fontWeight: 600 }}>Składnik</TableCell>
                                        <TableCell sx={{ fontWeight: 600 }}>Ilość</TableCell>
                                        <TableCell sx={{ fontWeight: 600 }}>Rezerwacja</TableCell>
                                      </TableRow>
                                    </TableHead>
                                    <TableBody>
                                      {ingredients.map((ingredient) => {
                                        const link = ingredientLinks[ingredient.id];
                                        
                                        return (
                                          <TableRow key={ingredient.id}>
                                            <TableCell>
                                              <Typography variant="body2" sx={{ fontWeight: 500 }}>
                                                {ingredient.text}
                                              </Typography>
                                            </TableCell>
                                            <TableCell>
                                              <Typography variant="body2" sx={{ color: colors.text.secondary }}>
                                                {ingredient.details}
                                              </Typography>
                                            </TableCell>
                                            <TableCell>
                                              {link ? (
                                                <Box>
                                                  <Chip
                                                    size="small"
                                                    label={`LOT: ${link.batchSnapshot?.batchNumber || 'Brak numeru'}`}
                                                    color="secondary"
                                                    variant="outlined"
                                                    sx={{ mb: 0.5 }}
                                                  />
                                                  <Typography variant="caption" display="block" sx={{ color: colors.text.secondary }}>
                                                    Powiązano: {link.linkedQuantity || link.quantity} {link.batchSnapshot?.unit || 'szt.'}
                                                  </Typography>
                                                  {link.consumedQuantity > 0 && (
                                                    <Typography variant="caption" display="block" sx={{ 
                                                      color: link.isFullyConsumed ? 'success.main' : 'warning.main' 
                                                    }}>
                                                      Użyto: {link.consumedQuantity} / Pozostało: {link.remainingQuantity}
                                                    </Typography>
                                                  )}
                                                  {link.batchSnapshot?.warehouseName && (
                                                    <Typography variant="caption" display="block" sx={{ color: colors.text.disabled }}>
                                                      📍 {link.batchSnapshot.warehouseName}
                                                    </Typography>
                                                  )}
                                                </Box>
                                              ) : (
                                                <Chip
                                                  size="small"
                                                  label="Nie powiązano"
                                                  color="default"
                                                  variant="outlined"
                                                />
                                              )}
                                            </TableCell>
                                          </TableRow>
                                        );
                                      })}
                                    </TableBody>
                                  </Table>
                                </TableContainer>
                              </Grid>
                            )}
                            
                            {/* Status wykonania - pokazuj tylko jeśli są elementy do sprawdzenia */}
                            {checkItems.length > 0 && (
                              <Grid item xs={12} md={ingredients.length > 0 ? 4 : 12}>
                                <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 2, color: palettes.success.main }}>
                                  ✅ Status wykonania
                                </Typography>
                              
                              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                {checkItems.map((item) => (
                                  <FormControlLabel
                                    key={item.id}
                                    control={
                                      <Checkbox
                                        checked={item.completed || false}
                                        onChange={(e) => handleChecklistUpdate(item.id, e.target.checked)}
                                        icon={<UncheckedIcon />}
                                        checkedIcon={<CheckCircleIcon />}
                                        sx={{
                                          color: palettes.primary.main,
                                          '&.Mui-checked': {
                                            color: palettes.success.main,
                                          },
                                        }}
                                      />
                                    }
                                    label={
                                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                                        <Typography
                                          variant="body2"
                                          sx={{
                                            textDecoration: item.completed ? 'line-through' : 'none',
                                            color: item.completed ? colors.text.disabled : colors.text.primary,
                                            fontWeight: 500
                                          }}
                                        >
                                          {item.text}
                                        </Typography>
                                        {item.completed && item.completedAt && (
                                          <Chip 
                                            size="small" 
                                            label={new Date(item.completedAt).toLocaleDateString('pl-PL')} 
                                            color="success" 
                                            variant="outlined" 
                                            sx={{ ml: 1, height: 20, fontSize: '0.7rem' }}
                                          />
                                        )}
                                      </Box>
                                    }
                                    sx={{
                                      width: '100%',
                                      alignItems: 'flex-start',
                                      m: 0,
                                      p: 1,
                                      borderRadius: 1,
                                      '&:hover': {
                                        bgcolor: `${palettes.primary.main}05`
                                      }
                                    }}
                                  />
                                ))}
                              </Box>
                              </Grid>
                            )}
                          </Grid>
                        </Box>
                      </Box>
                    );
                  })}
                </>
              ) : (
                <Box sx={{ textAlign: 'center', py: 6 }}>
                  <ProductionIcon sx={{ fontSize: 80, color: colors.text.disabled, mb: 2 }} />
                  <Typography variant="h6" sx={{ color: colors.text.secondary, mb: 1 }}>
                    Brak planu mieszań
                  </Typography>
                  <Typography variant="body2" sx={{ color: colors.text.disabled }}>
                    Plan mieszań nie został jeszcze utworzony dla tego zadania
                  </Typography>
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
};

export default KioskTaskDetails;
