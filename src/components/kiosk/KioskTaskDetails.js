// src/components/kiosk/KioskTaskDetails.js
import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
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
  CheckCircle as CheckCircleIcon,
  RadioButtonUnchecked as UncheckedIcon,
  Factory as ProductionIcon
} from '@mui/icons-material';
import { doc, updateDoc, serverTimestamp, collection, query, where } from 'firebase/firestore';
import { db } from '../../services/firebase/config';
import { useVisibilityAwareSnapshot } from '../../hooks/useVisibilityAwareSnapshot';
import { baseColors, palettes, getStatusColor } from '../../styles/colorConfig';
import { useTheme as useThemeContext } from '../../contexts/ThemeContext';
import { useNotification } from '../../hooks/useNotification';
import { useAuth } from '../../hooks/useAuth';
import { formatDateTime } from '../../utils/formatters';
import { getIngredientReservationLinks } from '../../services/mixingPlanReservationService';
import { createRealtimeCheckboxNotification } from '../../services/notificationService';
import { getAllActiveUsers } from '../../services/userService';
// ✅ OPTYMALIZACJA: Import wspólnych stylów MUI
import { 
  flexCenter, 
  flexCenterGap1,
  mb2
} from '../../styles/muiCommonStyles';

// ============================================
// Style wyniesione poza komponent
// ============================================

const loadingBoxSx = { display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' };
const loadingSpinnerSx = { color: palettes.primary.main };

const backButtonSx = {
  mr: 2,
  color: palettes.primary.main,
  minWidth: 48, minHeight: 48,
  WebkitTapHighlightColor: 'transparent',
  touchAction: 'manipulation',
  '&:hover': { backgroundColor: `${palettes.primary.main}10` }
};

const titleSx = { fontWeight: 600, color: palettes.primary.dark };

const syncContainerSx = { ml: 'auto', display: 'flex', alignItems: 'center', gap: 1 };

const syncDotBaseSx = { width: 8, height: 8, borderRadius: '50%' };

const cardContentPaddingSx = { p: 2 };

const taskHeaderSx = { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2, flexWrap: 'wrap', gap: 1 };
const taskHeaderLeftSx = { flex: 1, minWidth: 0 };

const getTaskNameSx = (colors) => ({
  fontWeight: 700, color: colors.text.primary, mb: 0.5, lineHeight: 1.2
});

const getProductNameSx = (colors) => ({
  color: colors.text.secondary, fontWeight: 400, mb: 1
});

const getStatusChipSx = (statusColors) => ({
  backgroundColor: statusColors.main, color: 'white', fontWeight: 600,
  fontSize: '0.875rem', height: 32, borderRadius: 2
});

const infoGridSx = {
  display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
  gap: 1.5, mb: 2
};

const getInfoTileSx = (colors, borderColor) => ({
  p: 1.5, borderRadius: 2, bgcolor: colors.background, border: `1px solid ${borderColor}`
});

const getInfoCaptionSx = (colors) => ({
  color: colors.text.secondary, fontSize: '0.75rem', textTransform: 'uppercase'
});

const getInfoValueSx = (colors) => ({
  fontWeight: 600, color: colors.text.primary
});

const getProgressBoxSx = (statusColors) => ({
  p: 2, borderRadius: 2, bgcolor: `${statusColors.main}08`,
  border: `1px solid ${statusColors.main}20`, height: 'fit-content'
});

const getProgressTitleSx = (colors) => ({
  fontWeight: 600, mb: 1.5, color: colors.text.primary
});

const progressInnerSx = { mb: 1.5 };
const progressRowSx = { display: 'flex', justifyContent: 'space-between', mb: 1 };

const getLinearProgressSx = (colorValue) => ({
  height: 8, borderRadius: 4, backgroundColor: `${colorValue}20`,
  '& .MuiLinearProgress-bar': { backgroundColor: colorValue, borderRadius: 4 }
});

const getLinearProgressSmallSx = (colorValue) => ({
  height: 6, borderRadius: 3, backgroundColor: `${colorValue}20`,
  '& .MuiLinearProgress-bar': { backgroundColor: colorValue, borderRadius: 3 }
});

const remainingTextSx = { color: 'warning.main', mt: 1, fontWeight: 500, display: 'block' };

const getCardSx = (colors, borderColor) => ({
  borderRadius: 3, border: `1px solid ${borderColor}`, background: colors.paper
});

const getSectionTitleSx = (colors) => ({
  fontWeight: 700, mb: 2, color: colors.text.primary
});

const getOverallProgressBoxSx = () => ({
  mb: 2, p: 2, bgcolor: `${palettes.success.main}08`,
  borderRadius: 2, border: `1px solid ${palettes.success.main}20`
});

const getMixingSectionSx = (colors, borderColor) => ({
  mb: 2, border: `1px solid ${borderColor}`, borderRadius: 3,
  overflow: 'hidden', bgcolor: colors.paper
});

const getMixingHeaderSx = (colors, borderColor) => ({
  p: 2, bgcolor: colors.background, borderBottom: `1px solid ${borderColor}`
});

const getMixingHeaderTitleSx = (colors) => ({
  fontWeight: 700, color: colors.text.primary, mb: 0.5
});

const getMixingProgressBoxSx = () => ({
  p: 1.5, bgcolor: `${palettes.info.main}08`,
  borderRadius: 2, border: `1px solid ${palettes.info.main}20`
});

const getBorderedContainerSx = (borderColor) => ({
  border: `1px solid ${borderColor}`, borderRadius: 2, overflow: 'hidden'
});

const getTableHeaderSx = (colors, borderColor, isMobile) => ({
  display: isMobile ? 'none' : 'grid',
  gridTemplateColumns: '1.5fr 1fr 3fr',
  gap: 0,
  bgcolor: colors.background, p: 1, borderBottom: `1px solid ${borderColor}`
});

const getTableHeaderCellSx = (colors) => ({
  fontWeight: 700, color: colors.text.primary
});

const getIngredientRowSx = (colors, borderColor, isLast, isMobile) => ({
  display: isMobile ? 'flex' : 'grid',
  flexDirection: isMobile ? 'column' : undefined,
  gridTemplateColumns: isMobile ? undefined : '1.5fr 1fr 3fr',
  gap: isMobile ? 1.5 : 2,
  p: isMobile ? 1.5 : 1,
  borderBottom: isLast ? 'none' : `1px solid ${borderColor}`,
  '&:hover': { bgcolor: colors.background }
});

const mobileIngredientLabelSx = {
  fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase',
  letterSpacing: '0.5px', color: 'text.secondary', mb: 0.25
};

const linksColumnSx = { display: 'flex', flexDirection: 'column', gap: 0.75, width: '100%' };
const linkSummaryMarginSx = { mb: 0.5 };

const getLinkBoxSx = (colors, borderColor) => ({
  display: 'flex', alignItems: 'flex-start', gap: 1,
  p: { xs: 1, md: 0.5 },
  border: '1px solid', borderColor, borderRadius: 1,
  bgcolor: colors.background, minHeight: 'auto'
});

const linkContentColumnSx = { display: 'flex', flexDirection: 'column', flexGrow: 1, gap: 0.25 };

const lotChipSx = {
  bgcolor: `${palettes.secondary.main}20`, color: palettes.secondary.main,
  fontWeight: 600, fontSize: { xs: '0.7rem', md: '0.65rem' }, height: { xs: 24, md: 20 }
};

const locationRowSx = { display: 'flex', alignItems: 'center', gap: { xs: 0.75, md: 1.5 }, flexWrap: 'wrap' };
const consumptionRowSx = { display: 'flex', alignItems: 'center', gap: 0.75, mt: 0.25 };
const miniProgressRowSx = { display: 'flex', alignItems: 'center', gap: 0.5 };

const getConsumptionBarBgSx = (mode) => ({
  width: '25px', height: '2px',
  bgcolor: mode === 'dark' ? 'rgba(255, 255, 255, 0.2)' : 'grey.200',
  borderRadius: 2, overflow: 'hidden'
});

const consumptionSummarySx = {
  mt: 0.5, p: 0.5, bgcolor: `${palettes.primary.main}0a`,
  borderRadius: 1, border: '1px solid', borderColor: `${palettes.primary.main}20`
};

const getNotLinkedChipSx = (colors) => ({
  bgcolor: `${colors.text.disabled}20`, color: colors.text.disabled
});

const getChecklistItemSx = (borderColor, isLast) => ({
  p: { xs: 1.5, md: 1 },
  borderBottom: isLast ? 'none' : `1px solid ${borderColor}`,
  '&:hover': { bgcolor: 'action.hover' },
  WebkitTapHighlightColor: 'transparent',
  touchAction: 'manipulation'
});

const getCheckboxSx = (colors) => ({
  color: colors.text.secondary,
  '&.Mui-checked': { color: palettes.success.main }
});

const checklistLabelColumnSx = { display: 'flex', flexDirection: 'column', width: '100%' };

const formControlLabelSx = { width: '100%', alignItems: 'flex-start', m: 0 };

const completedTimeSx = { color: palettes.success.main, fontWeight: 500 };

const emptyMixingBoxSx = { textAlign: 'center', py: 4 };

const contentPaddingSx = { p: 2 };

// ============================================

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

  const cardSx = useMemo(() => getCardSx(colors, borderColor), [colors.paper, borderColor]);
  const infoTileSx = useMemo(() => getInfoTileSx(colors, borderColor), [colors.background, borderColor]);
  const infoCaptionSx = useMemo(() => getInfoCaptionSx(colors), [colors.text.secondary]);
  const infoValueSx = useMemo(() => getInfoValueSx(colors), [colors.text.primary]);
  const taskNameSx = useMemo(() => getTaskNameSx(colors), [colors.text.primary]);
  const productNameSx = useMemo(() => getProductNameSx(colors), [colors.text.secondary]);
  const sectionTitleSx = useMemo(() => getSectionTitleSx(colors), [colors.text.primary]);
  const tableHeaderCellSx = useMemo(() => getTableHeaderCellSx(colors), [colors.text.primary]);
  const borderedContainerSx = useMemo(() => getBorderedContainerSx(borderColor), [borderColor]);
  const tableHeaderSx = useMemo(() => getTableHeaderSx(colors, borderColor, isMobile), [colors.background, borderColor, isMobile]);
  const checkboxSx = useMemo(() => getCheckboxSx(colors), [colors.text.secondary]);
  const syncCaptionSx = useMemo(() => ({ color: colors.text.secondary, fontSize: '0.75rem' }), [colors.text.secondary]);
  const clientTextSx = useMemo(() => ({ color: colors.text.secondary }), [colors.text.secondary]);
  const progressLabelSx = useMemo(() => ({ color: colors.text.secondary }), [colors.text.secondary]);
  const boldCaptionSx = useMemo(() => ({ color: colors.text.primary, fontWeight: 'bold', fontSize: '0.75rem' }), [colors.text.primary]);
  const linkedQtyCaptionSx = useMemo(() => ({ color: colors.text.primary, fontWeight: 'bold', fontSize: '0.7rem' }), [colors.text.primary]);
  const locationCaptionSx = useMemo(() => ({ color: colors.text.secondary, fontSize: '0.6rem', display: 'flex', alignItems: 'center', gap: 0.25 }), [colors.text.secondary]);
  const percentCaptionSx = useMemo(() => ({ color: colors.text.secondary, fontSize: '0.6rem' }), [colors.text.secondary]);
  const consumptionSumTextSx = useMemo(() => ({ color: colors.text.primary, fontWeight: 'bold', fontSize: '0.65rem' }), [colors.text.primary]);
  const notLinkedChipSx = useMemo(() => getNotLinkedChipSx(colors), [colors.text.disabled]);
  const linkBoxSx = useMemo(() => getLinkBoxSx(colors, borderColor), [colors.background, borderColor]);
  const consumptionBarBgSx = useMemo(() => getConsumptionBarBgSx(mode), [mode]);
  const ingredientTextSx = useMemo(() => ({ fontWeight: 600, color: colors.text.primary }), [colors.text.primary]);
  const ingredientDetailsSx = useMemo(() => ({ color: colors.text.secondary }), [colors.text.secondary]);
  const detailsTextSx = useMemo(() => ({ color: colors.text.secondary, mb: 1.5 }), [colors.text.secondary]);
  const mixingHeaderTitleSx = useMemo(() => getMixingHeaderTitleSx(colors), [colors.text.primary]);
  const progressTitleSx = useMemo(() => getProgressTitleSx(colors), [colors.text.primary]);
  const emptyIconSx = useMemo(() => ({ fontSize: 80, color: colors.text.disabled, mb: 2 }), [colors.text.disabled]);
  const emptyTitleSx = useMemo(() => ({ color: colors.text.secondary, mb: 1 }), [colors.text.secondary]);
  const emptySubtitleSx = useMemo(() => ({ color: colors.text.disabled }), [colors.text.disabled]);

  // Początkowe pobranie danych + listener zadania (visibility-aware)
  const taskDocRef = useMemo(() => taskId ? doc(db, 'productionTasks', taskId) : null, [taskId]);
  const kioskTaskMountedRef = useRef(true);

  useEffect(() => {
    kioskTaskMountedRef.current = true;
    if (taskId) { setLoading(true); setError(null); }
    return () => { kioskTaskMountedRef.current = false; };
  }, [taskId]);

  useVisibilityAwareSnapshot(
    taskDocRef,
    null,
    (docSnapshot) => {
      if (!kioskTaskMountedRef.current) return;
      if (docSnapshot.exists()) {
        setIsUpdating(true);
        const taskData = { id: docSnapshot.id, ...docSnapshot.data() };
        setTask(taskData);
        setLastUpdate(new Date());
        setLoading(false);
        setTimeout(() => { if (kioskTaskMountedRef.current) setIsUpdating(false); }, 500);
      } else {
        setError('Zadanie nie zostało znalezione');
        setLoading(false);
      }
    },
    (error) => {
      if (!kioskTaskMountedRef.current) return;
      console.error('Błąd listenera zadania:', error);
      setError('Błąd podczas nasłuchiwania zmian zadania');
      showError('Błąd synchronizacji w czasie rzeczywistym');
      setLoading(false);
    },
    [taskId]
  );

  // Listener powiązań rezerwacji (visibility-aware)
  const kioskLinksQuery = useMemo(() =>
    taskId ? query(collection(db, 'ingredientReservationLinks'), where('taskId', '==', taskId)) : null,
  [taskId]);

  useVisibilityAwareSnapshot(
    kioskLinksQuery,
    null,
    async (snapshot) => {
      if (!kioskTaskMountedRef.current) return;
      try {
        const updatedLinks = await getIngredientReservationLinks(taskId);
        if (!kioskTaskMountedRef.current) return;
        setIngredientLinks(updatedLinks);
        setIsUpdating(true);
        setTimeout(() => { if (kioskTaskMountedRef.current) setIsUpdating(false); }, 500);
      } catch (error) {
        console.error('Błąd podczas aktualizacji powiązań:', error);
      }
    },
    (error) => {
      console.error('Błąd listenera powiązań rezerwacji:', error);
    },
    [taskId]
  );

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
              taskId,
              currentUser.uid
            );
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
      <Box sx={loadingBoxSx}>
        <CircularProgress size={60} sx={loadingSpinnerSx} />
      </Box>
    );
  }

  if (error) {
    return (
      <Alert severity="error" sx={mb2}>
        {error}
      </Alert>
    );
  }

  if (!task) {
    return (
      <Alert severity="warning" sx={mb2}>
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
  
  const statusChipSx = getStatusChipSx(statusColors);
  const progressBoxSx = getProgressBoxSx(statusColors);
  const statusLinearProgressSx = getLinearProgressSx(statusColors.main);
  const successLinearProgressSx = getLinearProgressSx(palettes.success.main);
  const infoLinearProgressSmallSx = getLinearProgressSmallSx(palettes.info.main);
  const overallProgressBoxSx = getOverallProgressBoxSx();
  const mixingProgressBoxSx = getMixingProgressBoxSx();
  const mixingSectionSx = getMixingSectionSx(colors, borderColor);
  const mixingHeaderSx = getMixingHeaderSx(colors, borderColor);

  return (
    <Box>
      <Box sx={{ ...flexCenter, ...mb2, flexWrap: 'wrap', gap: 1 }}>
        <IconButton onClick={onBack} sx={backButtonSx}>
          <ArrowBackIcon />
        </IconButton>
        <Typography variant={isMobile ? "h6" : "h4"} sx={{ ...titleSx, flex: 1, minWidth: 0 }}>
          Szczegóły zadania
        </Typography>
        
        <Box sx={{ ...syncContainerSx, display: isMobile ? 'none' : 'flex' }}>
          <Box
            sx={{
              ...syncDotBaseSx,
              backgroundColor: isUpdating ? 'warning.main' : 'success.main',
              animation: isUpdating ? 'pulse 1.5s infinite' : 'none'
            }}
          />
          <Typography variant="caption" sx={syncCaptionSx}>
            {isUpdating ? 'Synchronizacja...' : `Ostatnia aktualizacja: ${lastUpdate.toLocaleTimeString('pl-PL')}`}
          </Typography>
        </Box>
      </Box>

      <Grid container spacing={2}>
        <Grid item xs={12}>
          <Card elevation={0} sx={cardSx}>
            <CardContent sx={cardContentPaddingSx}>
              <Box sx={taskHeaderSx}>
                <Box sx={taskHeaderLeftSx}>
                  <Typography variant="h5" sx={taskNameSx}>
                    {task.name}
                  </Typography>
                  <Typography variant="h6" sx={productNameSx}>
                    {task.productName}
                  </Typography>
                  {task.clientName && (
                    <Typography variant="body2" sx={clientTextSx}>
                      {task.clientName}
                    </Typography>
                  )}
                </Box>
                <Chip label={task.status} sx={statusChipSx} />
              </Box>

              <Grid container spacing={2}>
                <Grid item xs={12} md={8}>
                  <Box sx={infoGridSx}>
                    <Box sx={infoTileSx}>
                      <Typography variant="caption" sx={infoCaptionSx}>
                        Numer MO
                      </Typography>
                      <Typography variant="body1" sx={infoValueSx}>
                        {task.moNumber || 'Nie przypisano'}
                      </Typography>
                    </Box>
                    
                    <Box sx={infoTileSx}>
                      <Typography variant="caption" sx={infoCaptionSx}>
                        Numer LOT
                      </Typography>
                      <Typography variant="body1" sx={infoValueSx}>
                        {task.lotNumber || 'Nie przypisano'}
                      </Typography>
                    </Box>
                    
                    <Box sx={infoTileSx}>
                      <Typography variant="caption" sx={infoCaptionSx}>
                        Data ważności
                      </Typography>
                      <Typography variant="body1" sx={infoValueSx}>
                        {task.expiryDate ? formatDateTime(task.expiryDate) : 'Nie ustawiono'}
                      </Typography>
                    </Box>
                  </Box>
                </Grid>

                <Grid item xs={12} md={4}>
                  <Box sx={progressBoxSx}>
                    <Typography variant="body1" sx={progressTitleSx}>
                      Postęp produkcji
                    </Typography>
                    
                    <Box sx={progressInnerSx}>
                      <Box sx={progressRowSx}>
                        <Typography variant="body2" sx={progressLabelSx}>
                          {totalCompletedQuantity} / {task.quantity} {task.unit}
                        </Typography>
                        <Typography variant="body2" sx={{ fontWeight: 700, color: statusColors.main }}>
                          {progress.toFixed(1)}%
                        </Typography>
                      </Box>
                      <LinearProgress variant="determinate" value={progress} sx={statusLinearProgressSx} />
                      {remainingQuantity > 0 && (
                        <Typography variant="caption" sx={remainingTextSx}>
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

        <Grid item xs={12}>
          <Card elevation={0} sx={cardSx}>
            <CardContent sx={cardContentPaddingSx}>
              <Typography variant="h6" sx={sectionTitleSx}>
                Plan mieszań
              </Typography>

              {totalItems > 0 ? (
                <>
                  <Box sx={overallProgressBoxSx}>
                    <Box sx={progressRowSx}>
                      <Typography variant="body1" sx={{ fontWeight: 600, color: colors.text.primary }}>
                        Postęp ogólny
                      </Typography>
                      <Typography variant="body1" sx={{ fontWeight: 700, color: palettes.success.main }}>
                        {completedItems} / {totalItems} ({mixingProgress.toFixed(0)}%)
                      </Typography>
                    </Box>
                    <LinearProgress variant="determinate" value={mixingProgress} sx={successLinearProgressSx} />
                  </Box>

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
                      <Box key={headerItem.id} sx={mixingSectionSx}>
                        <Box sx={mixingHeaderSx}>
                          <Typography variant="h6" sx={mixingHeaderTitleSx}>
                            {headerItem.text}
                          </Typography>
                          {headerItem.details && (
                            <Typography variant="body2" sx={detailsTextSx}>
                              {headerItem.details}
                            </Typography>
                          )}
                          
                          <Box sx={mixingProgressBoxSx}>
                            <Box sx={progressRowSx}>
                              <Typography variant="body2" sx={{ fontWeight: 600, color: colors.text.primary }}>
                                Postęp: {completedInMixing} / {totalInMixing}
                              </Typography>
                              <Typography variant="body2" sx={{ fontWeight: 700, color: palettes.info.main }}>
                                {mixingProgressPercent.toFixed(0)}%
                              </Typography>
                            </Box>
                            <LinearProgress variant="determinate" value={mixingProgressPercent} sx={infoLinearProgressSmallSx} />
                          </Box>
                        </Box>
                        
                        <Box sx={contentPaddingSx}>
                          <Grid container spacing={2}>
                            {ingredients.length > 0 && (
                              <Grid item xs={12} md={8}>
                                <Typography variant="subtitle1" sx={sectionTitleSx}>
                                  Składniki i rezerwacje
                                </Typography>
                                
                                <Box sx={borderedContainerSx}>
                                  <Box sx={tableHeaderSx}>
                                    <Typography variant="subtitle2" sx={tableHeaderCellSx}>
                                      Składnik
                                    </Typography>
                                    <Typography variant="subtitle2" sx={tableHeaderCellSx}>
                                      Ilość
                                    </Typography>
                                    <Typography variant="subtitle2" sx={tableHeaderCellSx}>
                                      Rezerwacje
                                    </Typography>
                                  </Box>
                                  
                                  {ingredients.map((ingredient, index) => {
                                    const links = ingredientLinks[ingredient.id] || [];
                                    const totalLinkedQuantity = links.reduce((sum, link) => sum + (link.linkedQuantity || 0), 0);
                                    const totalConsumedQuantity = links.reduce((sum, link) => sum + (link.consumedQuantity || 0), 0);
                                    
                                    return (
                                      <Box key={ingredient.id} sx={getIngredientRowSx(colors, borderColor, index >= ingredients.length - 1, isMobile)}>
                                        <Box>
                                          {isMobile && <Typography sx={mobileIngredientLabelSx}>Składnik</Typography>}
                                          <Typography variant="body2" sx={ingredientTextSx}>
                                            {ingredient.text}
                                          </Typography>
                                        </Box>
                                        
                                        <Box>
                                          {isMobile && <Typography sx={mobileIngredientLabelSx}>Ilość</Typography>}
                                          <Typography variant="body2" sx={ingredientDetailsSx}>
                                            {ingredient.details}
                                          </Typography>
                                        </Box>
                                        
                                        <Box>
                                          {isMobile && <Typography sx={mobileIngredientLabelSx}>Rezerwacje</Typography>}
                                          {links.length > 0 ? (
                                            <Box sx={linksColumnSx}>
                                              {links.length > 1 && (
                                                <Box sx={linkSummaryMarginSx}>
                                                  <Typography variant="caption" sx={boldCaptionSx}>
                                                    {links.length} rezerwacji → Razem: {totalLinkedQuantity} {links[0]?.batchSnapshot?.unit || 'szt.'}
                                                  </Typography>
                                                </Box>
                                              )}
                                              
                                              {links.map((link) => {
                                                const reservationFromSnapshot = {
                                                  batchNumber: link.batchSnapshot?.batchNumber || 'Brak numeru',
                                                  unit: link.batchSnapshot?.unit || 'szt.',
                                                  warehouseName: link.batchSnapshot?.warehouseName,
                                                  expiryDateString: link.batchSnapshot?.expiryDateString
                                                };
                                                
                                                return (
                                                  <Box key={link.id} sx={linkBoxSx}>
                                                    <Box sx={linkContentColumnSx}>
                                                      <Box sx={flexCenterGap1}>
                                                        <Chip
                                                          size="small"
                                                          label={`LOT: ${reservationFromSnapshot.batchNumber}`}
                                                          sx={lotChipSx}
                                                        />
                                                        <Typography variant="caption" sx={linkedQtyCaptionSx}>
                                                          {link.linkedQuantity || link.quantity} {reservationFromSnapshot.unit}
                                                        </Typography>
                                                      </Box>
                                                      
                                                      <Box sx={locationRowSx}>
                                                        {reservationFromSnapshot.warehouseName && (
                                                          <Typography variant="caption" sx={locationCaptionSx}>
                                                            📍 {reservationFromSnapshot.warehouseName}
                                                          </Typography>
                                                        )}
                                                        {reservationFromSnapshot.expiryDateString && (
                                                          <Typography variant="caption" sx={locationCaptionSx}>
                                                            📅 {reservationFromSnapshot.expiryDateString}
                                                          </Typography>
                                                        )}
                                                      </Box>
                                                      
                                                      {link.consumedQuantity > 0 && (
                                                        <Box sx={consumptionRowSx}>
                                                          <Typography variant="caption" sx={{ 
                                                            color: link.isFullyConsumed ? 'success.main' : 'warning.main',
                                                            fontSize: '0.65rem'
                                                          }}>
                                                            Użyto: {link.consumedQuantity} / Pozostało: {link.remainingQuantity}
                                                          </Typography>
                                                          {link.consumptionPercentage !== undefined && (
                                                            <Box sx={miniProgressRowSx}>
                                                              <Box sx={consumptionBarBgSx}>
                                                                <Box sx={{
                                                                  width: `${link.consumptionPercentage}%`,
                                                                  height: '100%',
                                                                  bgcolor: link.consumptionPercentage === 100 ? 'success.main' : 'primary.main',
                                                                  transition: 'width 0.3s ease'
                                                                }} />
                                                              </Box>
                                                              <Typography variant="caption" sx={percentCaptionSx}>
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
                                              
                                              {totalConsumedQuantity > 0 && links.length > 1 && (
                                                <Box sx={consumptionSummarySx}>
                                                  <Typography variant="caption" sx={consumptionSumTextSx}>
                                                    📊 Łącznie użyto: {totalConsumedQuantity} / Pozostało: {totalLinkedQuantity - totalConsumedQuantity}
                                                  </Typography>
                                                </Box>
                                              )}
                                            </Box>
                                          ) : (
                                            <Chip size="small" label="Nie powiązano" sx={notLinkedChipSx} />
                                          )}
                                        </Box>
                                      </Box>
                                    );
                                  })}
                                </Box>
                              </Grid>
                            )}
                            
                            {checkItems.length > 0 && (
                              <Grid item xs={12} md={ingredients.length > 0 ? 4 : 12}>
                                <Typography variant="subtitle1" sx={sectionTitleSx}>
                                  Status wykonania
                                </Typography>
                              
                                <Box sx={borderedContainerSx}>
                                  {checkItems.map((item, index) => (
                                    <Box
                                      key={item.id}
                                      sx={getChecklistItemSx(borderColor, index >= checkItems.length - 1)}
                                    >
                                      <FormControlLabel
                                        control={
                                          <Checkbox
                                            checked={item.completed || false}
                                            onChange={(e) => handleChecklistUpdate(item.id, e.target.checked)}
                                            icon={<UncheckedIcon />}
                                            checkedIcon={<CheckCircleIcon />}
                                            sx={checkboxSx}
                                          />
                                        }
                                        label={
                                          <Box sx={checklistLabelColumnSx}>
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
                                              <Typography variant="caption" sx={completedTimeSx}>
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
                                        sx={formControlLabelSx}
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
                <Box sx={emptyMixingBoxSx}>
                  <ProductionIcon sx={emptyIconSx} />
                  <Typography variant="h6" sx={emptyTitleSx}>
                    Brak planu mieszań
                  </Typography>
                  <Typography variant="body2" sx={emptySubtitleSx}>
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