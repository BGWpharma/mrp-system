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
  LinearProgress,
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
  Factory as ProductionIcon
} from '@mui/icons-material';
import { doc, updateDoc, serverTimestamp, onSnapshot, collection, query, where } from 'firebase/firestore';
import { db } from '../../services/firebase/config';
import { baseColors, palettes, getStatusColor } from '../../styles/colorConfig';
import { useTheme as useThemeContext } from '../../contexts/ThemeContext';
import { useNotification } from '../../hooks/useNotification';
import { useAuth } from '../../hooks/useAuth';
import { formatDateTime } from '../../utils/formatters';
import { getIngredientReservationLinks } from '../../services/mixingPlanReservationService';

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
  const borderColor = mode === 'dark' ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.12)';

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

      // Jeśli checkbox został zaznaczony, wyślij powiadomienie
      if (completed) {
        try {
          const { createRealtimeCheckboxNotification } = require('../../services/notificationService');
          const { getAllActiveUsers } = require('../../services/userService');
          
          // Znajdź zaznaczony item
          const checkedItem = task.mixingPlanChecklist.find(item => item.id === itemId);
          
          if (checkedItem) {
            // Znajdź numer mieszania na podstawie parentId
            let mixingNumber = 'Nieznane';
            if (checkedItem.parentId) {
              const headerItem = task.mixingPlanChecklist.find(item => item.id === checkedItem.parentId);
              if (headerItem) {
                // Wyodrębnij numer mieszania z tekstu nagłówka (np. "Mieszanie nr 1")
                const match = headerItem.text.match(/nr\s*(\d+)/i);
                if (match) {
                  mixingNumber = match[1];
                }
              }
            }
            
            // Pobierz wszystkich aktywnych użytkowników do powiadomienia
            const allUsers = await getAllActiveUsers();
            const userIds = allUsers.map(user => user.id);
            
            // Fallback na wypadek braku użytkowników
            if (userIds.length === 0) {
              userIds.push(currentUser.uid);
            }
            
            await createRealtimeCheckboxNotification(
              userIds,
              checkedItem.text,
              mixingNumber,
              task.moNumber || task.name || task.id.substring(0, 8),
              currentUser.uid
            );
            
            console.log(`Wysłano powiadomienie o zaznaczeniu checkboxa do ${userIds.length} użytkowników: ${checkedItem.text}`);
          }
        } catch (notificationError) {
          console.warn('Nie udało się wysłać powiadomienia o zaznaczeniu checkboxa:', notificationError);
          // Nie przerywamy głównego procesu - powiadomienie jest dodatkowe
        }
      }

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

  // Przygotowanie danych planu mieszań - liczy tylko elementy typu 'check' (zadania do wykonania)
  const mixingPlanItems = task.mixingPlanChecklist || [];
  const checkItems = mixingPlanItems.filter(item => item.type === 'check');
  const completedItems = checkItems.filter(item => item.completed).length;
  const totalItems = checkItems.length;
  const mixingProgress = totalItems > 0 ? (completedItems / totalItems) * 100 : 0;
  
  console.log('[KIOSK DEBUG] Postęp ogólny:', {
    allItems: mixingPlanItems.length,
    checkItems: totalItems,
    completedItems,
    progress: mixingProgress
  });

  return (
    <Box>
      {/* Nagłówek z przyciskiem powrotu i wskaźnikiem synchronizacji */}
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
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

      <Grid container spacing={2}>
        {/* Podstawowe informacje o zadaniu */}
        <Grid item xs={12}>
          <Card elevation={0} sx={{ 
            borderRadius: 3,
            border: `1px solid ${borderColor}`,
            background: colors.paper
          }}>
            <CardContent sx={{ p: 2 }}>
              {/* Header z nazwą i statusem */}
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                <Box sx={{ flex: 1 }}>
                  <Typography variant="h5" sx={{ 
                    fontWeight: 700, 
                    color: colors.text.primary,
                    mb: 0.5,
                    lineHeight: 1.2
                  }}>
                    {task.name}
                  </Typography>
                  <Typography variant="h6" sx={{ 
                    color: colors.text.secondary, 
                    fontWeight: 400,
                    mb: 1
                  }}>
                    {task.productName}
                  </Typography>
                  {task.clientName && (
                    <Typography variant="body2" sx={{ color: colors.text.secondary }}>
                      {task.clientName}
                    </Typography>
                  )}
                </Box>
                <Chip
                  label={task.status}
                  sx={{
                    backgroundColor: statusColors.main,
                    color: 'white',
                    fontWeight: 600,
                    fontSize: '0.875rem',
                    height: 32,
                    borderRadius: 2
                  }}
                />
              </Box>

              {/* Informacje szczegółowe */}
              <Grid container spacing={2}>
                <Grid item xs={12} md={8}>
                  <Box sx={{ 
                    display: 'grid', 
                    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
                    gap: 1.5,
                    mb: 2
                  }}>
                    <Box sx={{ 
                      p: 1.5, 
                      borderRadius: 2, 
                      bgcolor: colors.background,
                      border: `1px solid ${borderColor}`
                    }}>
                      <Typography variant="caption" sx={{ color: colors.text.secondary, fontSize: '0.75rem', textTransform: 'uppercase' }}>
                        Numer MO
                      </Typography>
                      <Typography variant="body1" sx={{ fontWeight: 600, color: colors.text.primary }}>
                        {task.moNumber || 'Nie przypisano'}
                      </Typography>
                    </Box>
                    
                    <Box sx={{ 
                      p: 1.5, 
                      borderRadius: 2, 
                      bgcolor: colors.background,
                      border: `1px solid ${borderColor}`
                    }}>
                      <Typography variant="caption" sx={{ color: colors.text.secondary, fontSize: '0.75rem', textTransform: 'uppercase' }}>
                        Numer LOT
                      </Typography>
                      <Typography variant="body1" sx={{ fontWeight: 600, color: colors.text.primary }}>
                        {task.lotNumber || 'Nie przypisano'}
                      </Typography>
                    </Box>
                    
                    <Box sx={{ 
                      p: 1.5, 
                      borderRadius: 2, 
                      bgcolor: colors.background,
                      border: `1px solid ${borderColor}`
                    }}>
                      <Typography variant="caption" sx={{ color: colors.text.secondary, fontSize: '0.75rem', textTransform: 'uppercase' }}>
                        Data ważności
                      </Typography>
                      <Typography variant="body1" sx={{ fontWeight: 600, color: colors.text.primary }}>
                        {task.expiryDate ? formatDateTime(task.expiryDate) : 'Nie ustawiono'}
                      </Typography>
                    </Box>
                    

                  </Box>
                </Grid>

                {/* Postęp produkcji */}
                <Grid item xs={12} md={4}>
                  <Box sx={{ 
                    p: 2, 
                    borderRadius: 2, 
                    bgcolor: `${statusColors.main}08`,
                    border: `1px solid ${statusColors.main}20`,
                    height: 'fit-content'
                  }}>
                    <Typography variant="body1" sx={{ fontWeight: 600, mb: 1.5, color: colors.text.primary }}>
                      Postęp produkcji
                    </Typography>
                    
                    <Box sx={{ mb: 1.5 }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                        <Typography variant="body2" sx={{ color: colors.text.secondary }}>
                          {totalCompletedQuantity} / {task.quantity} {task.unit}
                        </Typography>
                        <Typography variant="body2" sx={{ fontWeight: 700, color: statusColors.main }}>
                          {progress.toFixed(1)}%
                        </Typography>
                      </Box>
                      <LinearProgress
                        variant="determinate"
                        value={progress}
                        sx={{
                          height: 8,
                          borderRadius: 4,
                          backgroundColor: `${statusColors.main}20`,
                          '& .MuiLinearProgress-bar': {
                            backgroundColor: statusColors.main,
                            borderRadius: 4
                          }
                        }}
                      />
                      {remainingQuantity > 0 && (
                        <Typography variant="caption" sx={{ 
                          color: 'warning.main', 
                          mt: 1, 
                          fontWeight: 500,
                          display: 'block'
                        }}>
                          Pozostało: {remainingQuantity} {task.unit}
                        </Typography>
                      )}
                    </Box>
                  </Box>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>

        {/* Plan mieszań - szczegółowy widok */}
        <Grid item xs={12}>
          <Card elevation={0} sx={{ 
            borderRadius: 3,
            border: `1px solid ${borderColor}`,
            background: colors.paper
          }}>
            <CardContent sx={{ p: 2 }}>
              <Typography variant="h6" sx={{ fontWeight: 700, mb: 2, color: colors.text.primary }}>
                Plan mieszań
              </Typography>

              {totalItems > 0 ? (
                <>
                  {/* Ogólny postęp */}
                  <Box sx={{ 
                    mb: 2, 
                    p: 2, 
                    bgcolor: `${palettes.success.main}08`, 
                    borderRadius: 2,
                    border: `1px solid ${palettes.success.main}20`
                  }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                      <Typography variant="body1" sx={{ fontWeight: 600, color: colors.text.primary }}>
                        Postęp ogólny
                      </Typography>
                      <Typography variant="body1" sx={{ fontWeight: 700, color: palettes.success.main }}>
                        {completedItems} / {totalItems} ({mixingProgress.toFixed(0)}%)
                      </Typography>
                    </Box>
                    <LinearProgress
                      variant="determinate"
                      value={mixingProgress}
                      sx={{
                        height: 8,
                        borderRadius: 4,
                        backgroundColor: `${palettes.success.main}20`,
                        '& .MuiLinearProgress-bar': {
                          backgroundColor: palettes.success.main,
                          borderRadius: 4
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
                        mb: 2, 
                        border: `1px solid ${borderColor}`, 
                        borderRadius: 3, 
                        overflow: 'hidden',
                        bgcolor: colors.paper
                      }}>
                        {/* Nagłówek mieszania */}
                        <Box sx={{ 
                          p: 2, 
                          bgcolor: colors.background,
                          borderBottom: `1px solid ${borderColor}`
                        }}>
                          <Typography variant="h6" sx={{ fontWeight: 700, color: colors.text.primary, mb: 0.5 }}>
                            {headerItem.text}
                          </Typography>
                          {headerItem.details && (
                            <Typography variant="body2" sx={{ color: colors.text.secondary, mb: 1.5 }}>
                              {headerItem.details}
                            </Typography>
                          )}
                          
                          {/* Postęp mieszania */}
                          <Box sx={{ 
                            p: 1.5, 
                            bgcolor: `${palettes.info.main}08`, 
                            borderRadius: 2,
                            border: `1px solid ${palettes.info.main}20`
                          }}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                              <Typography variant="body2" sx={{ fontWeight: 600, color: colors.text.primary }}>
                                Postęp: {completedInMixing} / {totalInMixing}
                              </Typography>
                              <Typography variant="body2" sx={{ fontWeight: 700, color: palettes.info.main }}>
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
                          <Grid container spacing={2}>
                            {/* Składniki z rezerwacjami */}
                            {ingredients.length > 0 && (
                              <Grid item xs={12} md={8}>
                                <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 2, color: colors.text.primary }}>
                                  Składniki i rezerwacje
                                </Typography>
                                
                                <Box sx={{ 
                                  border: `1px solid ${borderColor}`,
                                  borderRadius: 2,
                                  overflow: 'hidden'
                                }}>
                                  <Box sx={{ 
                                    display: 'grid', 
                                    gridTemplateColumns: '1.5fr 1fr 3fr',
                                    gap: 0,
                                    bgcolor: colors.background,
                                    p: 1,
                                    borderBottom: `1px solid ${borderColor}`
                                  }}>
                                    <Typography variant="subtitle2" sx={{ fontWeight: 700, color: colors.text.primary }}>
                                      Składnik
                                    </Typography>
                                    <Typography variant="subtitle2" sx={{ fontWeight: 700, color: colors.text.primary }}>
                                      Ilość
                                    </Typography>
                                    <Typography variant="subtitle2" sx={{ fontWeight: 700, color: colors.text.primary }}>
                                      Rezerwacje
                                    </Typography>
                                  </Box>
                                  
                                  {ingredients.map((ingredient, index) => {
                                    const links = ingredientLinks[ingredient.id] || [];
                                    const totalLinkedQuantity = links.reduce((sum, link) => sum + (link.linkedQuantity || 0), 0);
                                    const totalConsumedQuantity = links.reduce((sum, link) => sum + (link.consumedQuantity || 0), 0);
                                    
                                    return (
                                      <Box key={ingredient.id} sx={{ 
                                        display: 'grid', 
                                        gridTemplateColumns: '1.5fr 1fr 3fr',
                                        gap: 2,
                                        p: 1,
                                        borderBottom: index < ingredients.length - 1 ? `1px solid ${borderColor}` : 'none',
                                        '&:hover': {
                                          bgcolor: colors.background
                                        }
                                      }}>
                                        <Box>
                                          <Typography variant="body2" sx={{ fontWeight: 600, color: colors.text.primary }}>
                                            {ingredient.text}
                                          </Typography>
                                        </Box>
                                        
                                        <Box>
                                          <Typography variant="body2" sx={{ color: colors.text.secondary }}>
                                            {ingredient.details}
                                          </Typography>
                                        </Box>
                                        
                                        <Box>
                                          {links.length > 0 ? (
                                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, width: '100%' }}>
                                              {/* Nagłówek z sumarycznymi informacjami */}
                                              {links.length > 1 && (
                                                <Box sx={{ mb: 0.5 }}>
                                                  <Typography variant="caption" sx={{ color: colors.text.primary, fontWeight: 'bold', fontSize: '0.75rem' }}>
                                                    {links.length} rezerwacji → Razem: {totalLinkedQuantity} {links[0]?.batchSnapshot?.unit || 'szt.'}
                                                  </Typography>
                                                </Box>
                                              )}
                                              
                                              {/* Lista wszystkich powiązań */}
                                              {links.map((link, linkIndex) => {
                                                const reservationFromSnapshot = {
                                                  id: link.reservationId,
                                                  batchNumber: link.batchSnapshot?.batchNumber || 'Brak numeru',
                                                  unit: link.batchSnapshot?.unit || 'szt.',
                                                  materialName: link.batchSnapshot?.materialName || 'Nieznany materiał',
                                                  warehouseName: link.batchSnapshot?.warehouseName,
                                                  warehouseAddress: link.batchSnapshot?.warehouseAddress,
                                                  expiryDateString: link.batchSnapshot?.expiryDateString
                                                };
                                                
                                                return (
                                                  <Box 
                                                    key={link.id} 
                                                    sx={{ 
                                                      display: 'flex', 
                                                      alignItems: 'flex-start', 
                                                      gap: 1,
                                                      p: 0.5,
                                                      border: '1px solid',
                                                      borderColor: borderColor,
                                                      borderRadius: 1,
                                                      bgcolor: colors.background,
                                                      minHeight: 'auto'
                                                    }}
                                                  >
                                                    <Box sx={{ display: 'flex', flexDirection: 'column', flexGrow: 1, gap: 0.25 }}>
                                                      {/* Linia 1: LOT + ilość powiązana */}
                                                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                        <Chip
                                                          size="small"
                                                          label={`LOT: ${reservationFromSnapshot.batchNumber}`}
                                                          sx={{
                                                            bgcolor: `${palettes.secondary.main}20`,
                                                            color: palettes.secondary.main,
                                                            fontWeight: 600,
                                                            fontSize: '0.65rem',
                                                            height: 20
                                                          }}
                                                        />
                                                        <Typography variant="caption" sx={{ color: colors.text.primary, fontWeight: 'bold', fontSize: '0.7rem' }}>
                                                          {link.linkedQuantity || link.quantity} {reservationFromSnapshot.unit}
                                                        </Typography>
                                                      </Box>
                                                      
                                                      {/* Linia 2: Lokalizacja + data ważności (w jednej linii) */}
                                                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
                                                        {reservationFromSnapshot.warehouseName && (
                                                          <Typography variant="caption" sx={{ color: colors.text.secondary, fontSize: '0.6rem', display: 'flex', alignItems: 'center', gap: 0.25 }}>
                                                            📍 {reservationFromSnapshot.warehouseName}
                                                          </Typography>
                                                        )}
                                                        {reservationFromSnapshot.expiryDateString && (
                                                          <Typography variant="caption" sx={{ color: colors.text.secondary, fontSize: '0.6rem', display: 'flex', alignItems: 'center', gap: 0.25 }}>
                                                            📅 {reservationFromSnapshot.expiryDateString}
                                                          </Typography>
                                                        )}
                                                      </Box>
                                                      
                                                      {/* Linia 3: Informacje o konsumpcji (tylko jeśli istnieją) */}
                                                      {link.consumedQuantity > 0 && (
                                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mt: 0.25 }}>
                                                          <Typography variant="caption" sx={{ 
                                                            color: link.isFullyConsumed ? 'success.main' : 'warning.main',
                                                            fontSize: '0.65rem'
                                                          }}>
                                                            Użyto: {link.consumedQuantity} / Pozostało: {link.remainingQuantity}
                                                          </Typography>
                                                          {link.consumptionPercentage !== undefined && (
                                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                                              <Box sx={{ 
                                                                width: '25px', 
                                                                height: '2px', 
                                                                bgcolor: mode === 'dark' ? 'rgba(255, 255, 255, 0.2)' : 'grey.200', 
                                                                borderRadius: 2,
                                                                overflow: 'hidden'
                                                              }}>
                                                                <Box sx={{
                                                                  width: `${link.consumptionPercentage}%`,
                                                                  height: '100%',
                                                                  bgcolor: link.consumptionPercentage === 100 ? 'success.main' : 'primary.main',
                                                                  transition: 'width 0.3s ease'
                                                                }} />
                                                              </Box>
                                                              <Typography variant="caption" sx={{ color: colors.text.secondary, fontSize: '0.6rem' }}>
                                                                {link.consumptionPercentage}%
                                                              </Typography>
                                                            </Box>
                                                          )}
                                                        </Box>
                                                      )}
                                                    </Box>
                                                  </Box>
                                                );
                                              })}
                                              
                                              {/* Sumaryczne informacje o konsumpcji */}
                                              {totalConsumedQuantity > 0 && links.length > 1 && (
                                                <Box sx={{ 
                                                  mt: 0.5, 
                                                  p: 0.5, 
                                                  bgcolor: `${palettes.primary.main}0a`, 
                                                  borderRadius: 1,
                                                  border: '1px solid',
                                                  borderColor: `${palettes.primary.main}20`
                                                }}>
                                                  <Typography variant="caption" sx={{ color: colors.text.primary, fontWeight: 'bold', fontSize: '0.65rem' }}>
                                                    📊 Łącznie użyto: {totalConsumedQuantity} / Pozostało: {totalLinkedQuantity - totalConsumedQuantity}
                                                  </Typography>
                                                </Box>
                                              )}
                                            </Box>
                                          ) : (
                                            <Chip
                                              size="small"
                                              label="Nie powiązano"
                                              sx={{
                                                bgcolor: `${colors.text.disabled}20`,
                                                color: colors.text.disabled
                                              }}
                                            />
                                          )}
                                        </Box>
                                      </Box>
                                    );
                                  })}
                                </Box>
                              </Grid>
                            )}
                            
                            {/* Status wykonania - pokazuj tylko jeśli są elementy do sprawdzenia */}
                            {checkItems.length > 0 && (
                              <Grid item xs={12} md={ingredients.length > 0 ? 4 : 12}>
                                <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 2, color: colors.text.primary }}>
                                  Status wykonania
                                </Typography>
                              
                                <Box sx={{ 
                                  border: `1px solid ${borderColor}`,
                                  borderRadius: 2,
                                  overflow: 'hidden'
                                }}>
                                  {checkItems.map((item, index) => (
                                    <Box
                                      key={item.id}
                                      sx={{
                                        p: 1,
                                        borderBottom: index < checkItems.length - 1 ? `1px solid ${borderColor}` : 'none',
                                        '&:hover': {
                                          bgcolor: colors.background
                                        }
                                      }}
                                    >
                                      <FormControlLabel
                                        control={
                                          <Checkbox
                                            checked={item.completed || false}
                                            onChange={(e) => handleChecklistUpdate(item.id, e.target.checked)}
                                            icon={<UncheckedIcon />}
                                            checkedIcon={<CheckCircleIcon />}
                                            sx={{
                                              color: colors.text.secondary,
                                              '&.Mui-checked': {
                                                color: palettes.success.main,
                                              },
                                            }}
                                          />
                                        }
                                        label={
                                          <Box sx={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
                                            <Typography
                                              variant="body2"
                                              sx={{
                                                textDecoration: item.completed ? 'line-through' : 'none',
                                                color: item.completed ? colors.text.disabled : colors.text.primary,
                                                fontWeight: 600,
                                                mb: item.completed && item.completedAt ? 0.5 : 0
                                              }}
                                            >
                                              {item.text}
                                            </Typography>
                                            {item.completed && item.completedAt && (
                                              <Typography variant="caption" sx={{ 
                                                color: palettes.success.main,
                                                fontWeight: 500
                                              }}>
                                                Ukończono: {new Date(item.completedAt).toLocaleString('pl-PL', {
                                                  year: 'numeric',
                                                  month: '2-digit',
                                                  day: '2-digit',
                                                  hour: '2-digit',
                                                  minute: '2-digit'
                                                })}
                                              </Typography>
                                            )}
                                          </Box>
                                        }
                                        sx={{
                                          width: '100%',
                                          alignItems: 'flex-start',
                                          m: 0
                                        }}
                                      />
                                    </Box>
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
                                                <Box sx={{ textAlign: 'center', py: 4 }}>
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