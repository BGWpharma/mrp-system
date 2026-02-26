/**
 * Komponent ulepszonego planu mieszań z możliwością powiązania rezerwacji
 * 
 * Funkcjonalności:
 * - Wyświetlanie planu mieszań z checklistą
 * - Powiązywanie składników z rezerwacjami z PO
 * - Powiązywanie składników ze standardowymi rezerwacjami magazynowymi
 * - Zarządzanie mapowaniem składników na rezerwacje
 */

import React, { useState, useEffect, memo, useMemo, useCallback, useRef } from 'react';
// 🚀 OPTYMALIZACJA: react-window dostępne dla przyszłej wirtualizacji bardzo długich list
// import { VariableSizeList as VirtualList } from 'react-window';
import {
  Box,
  Typography,
  Paper,
  Grid,
  Button,
  FormControlLabel,
  Checkbox,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Autocomplete,
  TextField,
  Alert,
  AlertTitle,
  Card,
  CardContent,
  IconButton,
  Tooltip,
  Divider,
  CircularProgress,
  InputAdornment,
  FormHelperText,
  MenuItem
} from '@mui/material';
// ✅ OPTYMALIZACJA: Import wspólnych stylów MUI
import { 
  flexCenter, 
  flexColumn, 
  flexBetween,
  flexCenterGap1,
  flexCenterGap2,
  mb1,
  mt1,
  p2,
  fontSmall,
  fontXSmall,
  textSecondary,
  textDisabled,
  typographyBold,
  typographyItalic
} from '../../styles/muiCommonStyles';
import {
  Link as LinkIcon,
  Cancel as UnlinkIcon,
  Info as InfoIcon,
  Assignment as AssignmentIcon,
  Refresh as RefreshIcon,
  LocationOn as LocationIcon,
  Schedule as ExpiryIcon,
  Edit as EditIcon,
  Add as AddIcon,
  Remove as RemoveIcon,
  ArrowDownward as ArrowDownIcon,
  ArrowUpward as ArrowUpIcon
} from '@mui/icons-material';

import { useTranslation } from '../../hooks/useTranslation';
import { useNotification } from '../../hooks/useNotification';
import { useAuth } from '../../hooks/useAuth';
import { useTheme } from '../../contexts/ThemeContext';
import { baseColors, palettes } from '../../styles/colorConfig';
import { doc, collection, query, where } from 'firebase/firestore';
import { db } from '../../services/firebase/config';
import { useVisibilityAwareSnapshot } from '../../hooks/useVisibilityAwareSnapshot';
import {
  getStandardReservationsForTask,
  linkIngredientToReservation,
  unlinkIngredientFromReservation,
  unlinkSpecificReservation,
  getIngredientReservationLinks,
  getVirtualReservationsFromSnapshots,
  getLinkedReservationIds
} from '../../services/mixingPlanReservationService';
import debounce from 'lodash/debounce';

// ===============================================
// 🚀 OPTYMALIZACJA: Wydzielone zmemoizowane komponenty
// Zapobiegają re-renderom przy aktualizacji stanu rodzica
// ===============================================

/**
 * Zmemoizowany komponent pojedynczego powiązania rezerwacji
 */
const ReservationLinkItem = memo(({ 
  link, 
  colors, 
  mode, 
  borderColor, 
  onUnlink 
}) => {
  const reservationFromSnapshot = useMemo(() => ({
    id: link.reservationId,
    batchNumber: link.batchSnapshot?.batchNumber || 'Brak numeru',
    unit: link.batchSnapshot?.unit || 'szt.',
    materialName: link.batchSnapshot?.materialName || 'Nieznany materiał',
    warehouseName: link.batchSnapshot?.warehouseName,
    warehouseAddress: link.batchSnapshot?.warehouseAddress,
    expiryDateString: link.batchSnapshot?.expiryDateString
  }), [link.reservationId, link.batchSnapshot]);
  
  return (
    <Box 
      sx={{ 
        display: 'flex', 
        alignItems: 'flex-start', 
        gap: 1,
        p: 0.75,
        border: '1px solid',
        borderColor: borderColor,
        borderRadius: 1,
        bgcolor: colors.background,
        minHeight: 'auto',
        // 🚀 GPU acceleration
        transform: 'translateZ(0)',
        willChange: 'transform',
      }}
    >
      <Box sx={{ ...flexColumn, flexGrow: 1, gap: 0.25 }}>
        {/* Linia 1: LOT + ilość powiązana */}
        <Box sx={flexCenterGap1}>
          <Chip
            size="small"
            label={`LOT: ${reservationFromSnapshot.batchNumber}`}
            color="secondary"
            variant="outlined"
            icon={<AssignmentIcon />}
          />
          <Typography variant="caption" sx={{ color: colors.text.primary, ...typographyBold, ...fontSmall }}>
            {link.linkedQuantity || link.quantity} {reservationFromSnapshot.unit}
          </Typography>
        </Box>
        
        {/* Linia 2: Lokalizacja + data ważności */}
        <Box sx={{ ...flexCenterGap2, flexWrap: 'wrap' }}>
          {reservationFromSnapshot.warehouseName && (
            <Typography variant="caption" sx={{ color: colors.text.secondary, ...fontXSmall, display: 'flex', alignItems: 'center', gap: 0.25 }}>
              📍 {reservationFromSnapshot.warehouseName}
            </Typography>
          )}
          {reservationFromSnapshot.expiryDateString && (
            <Typography variant="caption" sx={{ color: colors.text.secondary, ...fontXSmall, display: 'flex', alignItems: 'center', gap: 0.25 }}>
              📅 {reservationFromSnapshot.expiryDateString}
            </Typography>
          )}
        </Box>
        
        {/* Linia 3: Informacje o konsumpcji */}
        {link.consumedQuantity > 0 && (
          <Box sx={{ ...flexCenter, gap: 1, mt: 0.25 }}>
            <Typography variant="caption" sx={{ 
              color: link.isFullyConsumed ? 'success.main' : 'warning.main',
              fontSize: '0.7rem'
            }}>
              Użyto: {link.consumedQuantity} / Pozostało: {link.remainingQuantity}
            </Typography>
            {link.consumptionPercentage !== undefined && (
              <Box sx={{ ...flexCenter, gap: 0.5 }}>
                <Box sx={{ 
                  width: '30px', 
                  height: '3px', 
                  bgcolor: mode === 'dark' ? 'rgba(255, 255, 255, 0.2)' : 'grey.200', 
                  borderRadius: 2,
                  overflow: 'hidden'
                }}>
                  <Box sx={{
                    width: `${link.consumptionPercentage}%`,
                    height: '100%',
                    bgcolor: link.consumptionPercentage === 100 ? 'success.main' : 'primary.main',
                    // 🚀 USUNIĘTO transition - powodowało miganie na mobile
                  }} />
                </Box>
                <Typography variant="caption" sx={{ color: colors.text.secondary, ...fontXSmall }}>
                  {link.consumptionPercentage}%
                </Typography>
              </Box>
            )}
          </Box>
        )}
      </Box>
      
      {/* Przycisk odłączenia */}
      {!link.isFullyConsumed && (
        <IconButton
          size="small"
          onClick={() => onUnlink(link.id)}
          color="error"
          sx={{ alignSelf: 'flex-start' }}
        >
          <UnlinkIcon fontSize="small" />
        </IconButton>
      )}
      
      {link.isFullyConsumed && (
        <Tooltip title="Powiązanie zostało w pełni skonsumowane">
          <InfoIcon fontSize="small" color="success" sx={{ alignSelf: 'flex-start' }} />
        </Tooltip>
      )}
    </Box>
  );
});

ReservationLinkItem.displayName = 'ReservationLinkItem';

/**
 * Zmemoizowany komponent statusu powiązań składnika
 */
const IngredientLinkStatusMemo = memo(({ 
  ingredientId, 
  links, 
  colors, 
  mode, 
  borderColor, 
  onUnlinkSpecificReservation
}) => {
  if (links && links.length > 0) {
    const totalLinkedQuantity = links.reduce((sum, link) => sum + (link.linkedQuantity || 0), 0);
    const totalConsumedQuantity = links.reduce((sum, link) => sum + (link.consumedQuantity || 0), 0);
    const totalRemainingQuantity = links.reduce((sum, link) => sum + (link.remainingQuantity || 0), 0);
    const averageConsumptionPercentage = links.length > 0 
      ? Math.round(links.reduce((sum, link) => sum + (link.consumptionPercentage || 0), 0) / links.length)
      : 0;
    
    return (
      <Box sx={{ ...flexColumn, gap: 0.75, width: '100%' }}>
        {/* Nagłówek z sumarycznymi informacjami */}
        <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', ...mb1 }}>
          <Box>
            <Typography variant="caption" sx={{ color: colors.text.primary, ...typographyBold, ...fontSmall }}>
              {links.length} rezerwacji → Razem: {totalLinkedQuantity} {links[0]?.batchSnapshot?.unit || 'szt.'}
            </Typography>
            <Typography variant="caption" sx={{ color: colors.text.secondary, display: 'block', ...typographyItalic, ...fontXSmall }}>
              Kliknij wiersz aby dodać kolejną
            </Typography>
          </Box>
        </Box>
        
        {/* Lista wszystkich powiązań */}
        {links.map((link) => (
          <ReservationLinkItem
            key={link.id}
            link={link}
            colors={colors}
            mode={mode}
            borderColor={borderColor}
            onUnlink={onUnlinkSpecificReservation}
          />
        ))}
        
        {/* Sumaryczne informacje o konsumpcji */}
        {totalConsumedQuantity > 0 && (
          <Box sx={{ 
            mt: 0.5, 
            p: 0.5, 
            bgcolor: colors.primary + '0a', 
            borderRadius: 1,
            border: '1px solid',
            borderColor: colors.primary + '20'
          }}>
            <Typography variant="caption" sx={{ color: colors.text.primary, fontWeight: 'bold', fontSize: '0.7rem' }}>
              📊 Łącznie użyto: {totalConsumedQuantity} / Pozostało: {totalRemainingQuantity} / Avg: {averageConsumptionPercentage}%
            </Typography>
          </Box>
        )}
      </Box>
    );
  }
  
  return (
    <Box sx={flexCenterGap1}>
      <LinkIcon fontSize="small" sx={{ color: colors.text.disabled }} />
      <Typography variant="caption" sx={{ color: colors.text.secondary, fontStyle: 'italic' }}>
        Kliknij wiersz aby powiązać z rezerwacją
      </Typography>
    </Box>
  );
}, (prevProps, nextProps) => {
  // Custom comparator - sprawdź tylko istotne zmiany
  return (
    prevProps.ingredientId === nextProps.ingredientId &&
    JSON.stringify(prevProps.links) === JSON.stringify(nextProps.links) &&
    prevProps.mode === nextProps.mode
  );
});

IngredientLinkStatusMemo.displayName = 'IngredientLinkStatusMemo';

/**
 * Zmemoizowany komponent pojedynczego składnika (mobile card)
 */
const MobileIngredientCard = memo(({ 
  ingredient, 
  links,
  colors, 
  mode, 
  borderColor,
  onLinkIngredient,
  onEditQuantity,
  onUnlinkSpecificReservation
}) => {
  return (
    <Card 
      variant="outlined"
      sx={{
        cursor: 'pointer',
        // 🚀 GPU acceleration i izolacja renderowania
        transform: 'translateZ(0)',
        willChange: 'transform',
        contain: 'layout style paint',
        '&:hover': {
          bgcolor: mode === 'dark' ? 'rgba(25, 118, 210, 0.15)' : 'primary.light',
          opacity: 0.9
        }
      }}
      onClick={() => onLinkIngredient(ingredient)}
    >
      <CardContent sx={{ ...p2, '&:last-child': { pb: 2 } }}>
        {/* Nazwa składnika */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', ...mb1 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 600, color: colors.text.primary, flex: 1, pr: 1 }}>
            {ingredient.text}
          </Typography>
          <IconButton 
            size="medium"
            onClick={(e) => {
              e.stopPropagation();
              onEditQuantity(ingredient);
            }}
            sx={{ 
              color: 'primary.main',
              minWidth: 44,
              minHeight: 44,
              ml: 1
            }}
          >
            <EditIcon fontSize="small" />
          </IconButton>
        </Box>
        
        {/* Ilość */}
        <Box sx={{ mb: 1.5 }}>
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
            Ilość:
          </Typography>
          <Typography variant="body2" sx={{ color: colors.text.primary, fontWeight: 500 }}>
            {ingredient.details}
          </Typography>
        </Box>
        
        {/* Rezerwacje */}
        <Box>
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem', mb: 0.5, display: 'block' }}>
            Rezerwacje:
          </Typography>
          <IngredientLinkStatusMemo
            ingredientId={ingredient.id}
            links={links}
            colors={colors}
            mode={mode}
            borderColor={borderColor}
            onUnlinkSpecificReservation={onUnlinkSpecificReservation}
          />
        </Box>
      </CardContent>
    </Card>
  );
}, (prevProps, nextProps) => {
  return (
    prevProps.ingredient.id === nextProps.ingredient.id &&
    prevProps.ingredient.text === nextProps.ingredient.text &&
    prevProps.ingredient.details === nextProps.ingredient.details &&
    JSON.stringify(prevProps.links) === JSON.stringify(nextProps.links) &&
    prevProps.mode === nextProps.mode
  );
});

MobileIngredientCard.displayName = 'MobileIngredientCard';

/**
 * Zmemoizowany komponent pojedynczego wiersza składnika (desktop)
 */
const DesktopIngredientRow = memo(({ 
  ingredient, 
  isLast,
  links,
  colors, 
  mode, 
  borderColor,
  onLinkIngredient,
  onEditQuantity,
  onUnlinkSpecificReservation
}) => {
  return (
    <Box 
      sx={{ 
        display: 'grid', 
        gridTemplateColumns: '2fr 1fr 2fr 60px',
        gap: 2,
        p: 1.5,
        borderBottom: !isLast ? '1px solid' : 'none',
        borderColor: borderColor,
        cursor: 'pointer',
        // 🚀 GPU acceleration
        transform: 'translateZ(0)',
        willChange: 'transform',
        contain: 'layout style',
        '&:hover': {
          bgcolor: mode === 'dark' ? 'rgba(25, 118, 210, 0.2)' : 'primary.light',
          opacity: 0.8
        }
      }}
      onClick={() => onLinkIngredient(ingredient)}
    >
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
        <IngredientLinkStatusMemo
          ingredientId={ingredient.id}
          links={links}
          colors={colors}
          mode={mode}
          borderColor={borderColor}
          onUnlinkSpecificReservation={onUnlinkSpecificReservation}
        />
      </Box>
      
      <Box>
        <Tooltip title="Edytuj ilość">
          <IconButton 
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              onEditQuantity(ingredient);
            }}
            sx={{ color: 'primary.main' }}
          >
            <EditIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>
    </Box>
  );
}, (prevProps, nextProps) => {
  return (
    prevProps.ingredient.id === nextProps.ingredient.id &&
    prevProps.ingredient.text === nextProps.ingredient.text &&
    prevProps.ingredient.details === nextProps.ingredient.details &&
    prevProps.isLast === nextProps.isLast &&
    JSON.stringify(prevProps.links) === JSON.stringify(nextProps.links) &&
    prevProps.mode === nextProps.mode
  );
});

DesktopIngredientRow.displayName = 'DesktopIngredientRow';

// ===============================================
// GŁÓWNY KOMPONENT
// ===============================================

const EnhancedMixingPlan = ({ 
  task, 
  isMobile = false,
  isVerySmall = false,
  onChecklistItemUpdate,
  onPlanUpdate,
  externalIngredientLinks
}) => {
  const { t } = useTranslation('taskDetails');
  const { showSuccess, showError, showInfo } = useNotification();
  const { currentUser } = useAuth();
  const { mode } = useTheme();
  
  // Kolory odpowiednie dla aktualnego motywu
  const colors = baseColors[mode];
  const borderColor = colors.divider;

  // Stan komponentu
  const [standardReservations, setStandardReservations] = useState([]);
  const [ingredientLinks, setIngredientLinks] = useState({});
  const [loading, setLoading] = useState(true);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [selectedIngredient, setSelectedIngredient] = useState(null);
  const [availableReservations, setAvailableReservations] = useState([]);
  const [selectedReservation, setSelectedReservation] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [linkQuantity, setLinkQuantity] = useState('');
  const [maxAvailableQuantity, setMaxAvailableQuantity] = useState(0);
  const [requiredQuantity, setRequiredQuantity] = useState(0);
  // ⚡ OPTYMALIZACJA: Usunięto realtimeTask - TaskDetailsPage już zarządza synchronizacją
  const [isLinksUpdating, setIsLinksUpdating] = useState(false);

  // Stany dla dodawania mieszanki
  const [addMixingDialogOpen, setAddMixingDialogOpen] = useState(false);
  const [newMixingIngredients, setNewMixingIngredients] = useState([{ name: '', quantity: '', unit: 'kg' }]);
  const [newMixingPiecesCount, setNewMixingPiecesCount] = useState('');
  const [addingMixing, setAddingMixing] = useState(false);
  const [taskMaterials, setTaskMaterials] = useState([]);
  const [removingMixing, setRemovingMixing] = useState(null);
  const [removeMixingDialogOpen, setRemoveMixingDialogOpen] = useState(false);
  const [mixingToRemove, setMixingToRemove] = useState(null);

  // Stany dla edycji ilości składników
  const [editQuantityDialogOpen, setEditQuantityDialogOpen] = useState(false);
  const [editingIngredient, setEditingIngredient] = useState(null);
  const [editQuantityValue, setEditQuantityValue] = useState('');
  const [editQuantityLoading, setEditQuantityLoading] = useState(false);

  // Stany dla edycji mieszania
  const [editMixingDialogOpen, setEditMixingDialogOpen] = useState(false);
  const [editingMixing, setEditingMixing] = useState(null);
  const [editMixingName, setEditMixingName] = useState('');
  const [editMixingPiecesCount, setEditMixingPiecesCount] = useState('');
  const [editMixingLoading, setEditMixingLoading] = useState(false);

  // Śledzi czy listener powiązań jest zainicjowany
  const linksListenerInitialized = useRef(false);
  // 🔒 POPRAWKA: useRef dla timera aby uniknąć memory leak przy odmontowaniu
  const updateTimerRef = useRef(null);
  // Ref dla kontenera planu mieszań (przewijanie)
  const mixingPlanContainerRef = useRef(null);

  // 🚀 OPTYMALIZACJA: Zmemoizowane obliczenia statystyk
  const { totalIngredients, linkedIngredients, linkagePercentage } = useMemo(() => {
    const total = task?.mixingPlanChecklist
      ? task.mixingPlanChecklist.filter(item => item.type === 'ingredient').length
      : 0;
    const linked = Object.keys(ingredientLinks).filter(key =>
      ingredientLinks[key] && ingredientLinks[key].length > 0
    ).length;
    const percentage = total > 0 ? Math.round((linked / total) * 100) : 0;
    
    return { totalIngredients: total, linkedIngredients: linked, linkagePercentage: percentage };
  }, [task?.mixingPlanChecklist, ingredientLinks]);
  
  // 🚀 OPTYMALIZACJA: Przygotuj dane dla wirtualizacji
  const headers = useMemo(() => 
    task?.mixingPlanChecklist?.filter(item => item.type === 'header') || [],
    [task?.mixingPlanChecklist]
  );

  const ingredientsByHeader = useMemo(() => {
    const map = {};
    headers.forEach(header => {
      map[header.id] = task?.mixingPlanChecklist?.filter(
        item => item.parentId === header.id && item.type === 'ingredient'
      ) || [];
    });
    return map;
  }, [headers, task?.mixingPlanChecklist]);

  const checkItemsByHeader = useMemo(() => {
    const map = {};
    headers.forEach(header => {
      map[header.id] = task?.mixingPlanChecklist?.filter(
        item => item.parentId === header.id && item.type === 'check'
      ) || [];
    });
    return map;
  }, [headers, task?.mixingPlanChecklist]);

  // Pobierz materiały z zadania produkcyjnego dla autouzupełniania
  useEffect(() => {
    if (task?.materials && Array.isArray(task.materials)) {
      // Przekształć materiały zadania na format opcji autouzupełniania
      const materialOptions = task.materials.map(material => ({
        label: material.name,
        value: material.name,
        id: material.id || material.inventoryItemId,
        unit: material.unit || 'szt.'
      }));
      setTaskMaterials(materialOptions);
    } else {
      setTaskMaterials([]);
    }
  }, [task?.materials]);

  // ⚡ NOWE: Odśwież rezerwacje gdy zmieniają się konsumpcje
  // Problem: Dostępna ilość = (Rezerwacja - Powiązane) + Skonsumowane
  // Gdy konsumpcja się zmienia, musimy przeliczyć dostępne ilości
  useEffect(() => {
    let cancelled = false;
    const refreshReservations = async () => {
      if (!task?.id) return;
      
      console.log('🔄 [MIXING-PLAN] Wykryto zmianę konsumpcji, odświeżam dostępne ilości rezerwacji...');
      
      try {
        const updatedStandardRes = await getStandardReservationsForTask(task.id);
        if (cancelled) return;
        setStandardReservations(prev => {
          const virtualRes = prev.filter(r => r.type === 'virtual');
          const allReservations = [...updatedStandardRes, ...virtualRes];
          
          console.log(`✅ [MIXING-PLAN] Zaktualizowano ${updatedStandardRes.length} standardowych rezerwacji`);
          return allReservations;
        });
      } catch (error) {
        if (cancelled) return;
        console.error('❌ [MIXING-PLAN] Błąd podczas odświeżania rezerwacji po konsumpcji:', error);
      }
    };
    
    refreshReservations();
    return () => { cancelled = true; };
  }, [task?.consumedMaterials, task?.id]); // Reaguj na zmiany w consumedMaterials

  // ⚡ OPTYMALIZACJA: Deduplikacja — gdy dane przychodzą z TaskDetailsPage (externalIngredientLinks),
  // nie tworzymy własnego listenera. Listener istnieje tylko jako fallback.
  const hasExternalLinks = externalIngredientLinks !== undefined;
  const empLinksQuery = useMemo(() =>
    !hasExternalLinks && task?.id
      ? query(collection(db, 'ingredientReservationLinks'), where('taskId', '==', task.id))
      : null,
  [task?.id, hasExternalLinks]);
  const empMountedRef = useRef(true);

  useEffect(() => {
    empMountedRef.current = true;
    linksListenerInitialized.current = false;
    return () => {
      empMountedRef.current = false;
      if (updateTimerRef.current) {
        clearTimeout(updateTimerRef.current);
        updateTimerRef.current = null;
      }
      handleLinkIngredient.cancel();
    };
  }, [task?.id, handleLinkIngredient]);

  useEffect(() => {
    if (task?.id) loadData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task?.id]);

  // Synchronizacja z zewnętrznymi danymi powiązań (z TaskDetailsPage)
  useEffect(() => {
    if (!hasExternalLinks || !task?.id) return;
    let cancelled = false;

    setIngredientLinks(externalIngredientLinks || {});

    (async () => {
      try {
        setIsLinksUpdating(true);
        const [updatedStandardRes, updatedVirtualRes] = await Promise.all([
          getStandardReservationsForTask(task.id),
          getVirtualReservationsFromSnapshots(task.id)
        ]);
        if (cancelled) return;
        setStandardReservations([...updatedStandardRes, ...updatedVirtualRes]);
      } catch (error) {
        console.error('Błąd podczas aktualizacji rezerwacji:', error);
      } finally {
        if (!cancelled) {
          if (updateTimerRef.current) clearTimeout(updateTimerRef.current);
          updateTimerRef.current = setTimeout(() => {
            if (empMountedRef.current) setIsLinksUpdating(false);
          }, 800);
        }
      }
    })();

    return () => { cancelled = true; };
  }, [externalIngredientLinks, hasExternalLinks, task?.id]);

  // Fallback: własny listener gdy brak danych zewnętrznych
  useVisibilityAwareSnapshot(
    empLinksQuery,
    null,
    async (snapshot) => {
      if (!empMountedRef.current) return;
      try {
        setIsLinksUpdating(true);
        
        const taskId = task.id;
        const [updatedLinks, updatedStandardRes, updatedVirtualRes] = await Promise.all([
          getIngredientReservationLinks(taskId),
          getStandardReservationsForTask(taskId),
          getVirtualReservationsFromSnapshots(taskId)
        ]);
        
        if (!empMountedRef.current) return;
        
        setIngredientLinks(updatedLinks);
        
        const allReservations = [...updatedStandardRes, ...updatedVirtualRes];
        setStandardReservations(allReservations);
        
        if (updateTimerRef.current) {
          clearTimeout(updateTimerRef.current);
        }
        updateTimerRef.current = setTimeout(() => {
          if (empMountedRef.current) setIsLinksUpdating(false);
        }, 800);
        
        if (linksListenerInitialized.current) {
          console.log('🔄 Real-time aktualizacja powiązań wykryta');
        } else {
          linksListenerInitialized.current = true;
        }
      } catch (error) {
        if (empMountedRef.current) {
          console.error('Błąd podczas aktualizacji powiązań:', error);
          setIsLinksUpdating(false);
        }
      }
    },
    (error) => {
      console.error('Błąd listenera powiązań rezerwacji:', error);
    },
    [task?.id]
  );

  // 🔒 POPRAWKA: Zmemoizowana funkcja loadData aby uniknąć recreating przy każdym renderze
  const loadData = useCallback(async () => {
    if (!task?.id) return;
    
    try {
      setLoading(true);
      
      // Ładowanie danych planu mieszań dla zadania
      
      const [standardRes, virtualRes, links] = await Promise.all([
        getStandardReservationsForTask(task.id), // Dla nowych powiązań
        getVirtualReservationsFromSnapshots(task.id), // Z snapshotów dla istniejących
        getIngredientReservationLinks(task.id)
      ]);

      // Połącz rzeczywiste rezerwacje z wirtualnymi ze snapshotów
      const allReservations = [...standardRes, ...virtualRes];
      // Dostępne rezerwacje: ${allReservations.length}

      setStandardReservations(allReservations);
      setIngredientLinks(links);
    } catch (error) {
      console.error('Błąd podczas pobierania danych planu mieszań:', error);
      showError('Nie udało się pobrać danych rezerwacji');
    } finally {
      setLoading(false);
    }
  }, [task?.id, showError]);

  const refreshData = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
    showInfo('Dane zostały odświeżone');
  };

  // Funkcja do parsowania ilości ze składnika
  const parseIngredientQuantity = (ingredient) => {
    // Próbuj wyciągnąć ilość z pola details (np. "Ilość: 2.5000 kg")
    if (ingredient.details) {
      const match = ingredient.details.match(/(\d+(?:\.\d+)?)/);
      if (match) {
        return parseFloat(match[1]);
      }
    }
    return 0;
  };



  // 🚀 OPTYMALIZACJA C: Debounced funkcja otwierania dialogu powiązań
  const handleLinkIngredientImmediate = async (ingredient) => {
    setSelectedIngredient(ingredient);
    
    // Parsuj wymaganą ilość ze składnika
    const required = parseIngredientQuantity(ingredient);
    setRequiredQuantity(required);
    
    // Oblicz ile już powiązano dla tego składnika
    const existingLinks = ingredientLinks[ingredient.id] || [];
    const alreadyLinkedQuantity = existingLinks.reduce((sum, link) => sum + (link.linkedQuantity || 0), 0);
    
    // Oblicz ile jeszcze potrzeba powiązać
    const remainingToLink = Math.max(0, required - alreadyLinkedQuantity);
    
    // Kalkulacja: wymagane ${required}, powiązane ${alreadyLinkedQuantity}, pozostałe ${remainingToLink}
    
    // Ustaw domyślną ilość jako pozostałą do powiązania
    setLinkQuantity(remainingToLink > 0 ? remainingToLink.toString() : '0');
    
    // Debug powiązania dla składnika: ${ingredient.text}
    
    // Pobierz listę już powiązanych rezerwacji dla tego składnika
    const linkedReservationIds = await getLinkedReservationIds(task.id, ingredient.id);
    // Powiązane rezerwacje: ${linkedReservationIds.length}
    
    // Przygotuj listę dostępnych rezerwacji dla tego składnika
    const ingredientName = ingredient.text;
    
    // ✅ POPRAWKA: Bardziej elastyczne dopasowywanie nazw materiałów
    // Filtruj tylko rzeczywiste rezerwacje (nie wirtualne ze snapshotów) dla tego składnika
    // oraz wyklucz już powiązane rezerwacje
    console.log(`🔍 [DEBUG] Filtrowanie rezerwacji dla składnika: ${ingredient.name}`);
    console.log(`🔍 [DEBUG] Wszystkie rezerwacje (${standardReservations.length}):`, standardReservations.map(r => `${r.materialName}: ${r.availableQuantity}`));
    
    const available = standardReservations.filter(res => {
      console.log(`🔍 Sprawdzam rezerwację - Nazwa materiału: "${res.materialName}", Składnik: "${ingredientName}", AvailableQty: ${res.availableQuantity}, ReservedQty: ${res.reservedQuantity}`);
      
      // Sprawdź czy to rzeczywista rezerwacja
      // Wirtualne rezerwacje ze snapshotów mają reservedQuantity === linkedQuantity
      // POPRAWKA: Uwzględnij konsumpcję - jeśli dostępna ilość > 0, to rezerwacja jest rzeczywista
      const isRealReservation = res.availableQuantity > 0 || res.reservedQuantity > res.linkedQuantity;
      
      // ✅ ELASTYCZNE DOPASOWYWANIE: Sprawdź różne warianty dopasowania nazw
      const materialNameLower = (res.materialName || '').toLowerCase().trim();
      const ingredientNameLower = (ingredientName || '').toLowerCase().trim();
      
      // 1. Dokładne dopasowanie (case-insensitive)
      const exactMatch = materialNameLower === ingredientNameLower;
      
      // 2. Nazwa materiału zawiera nazwę składnika (np. "RAWGW-SWEET 25kg" zawiera "RAWGW-SWEET")
      const materialContainsIngredient = materialNameLower.includes(ingredientNameLower);
      
      // 3. Nazwa składnika zawiera nazwę materiału (np. "RAWGW-SWEET-EXTRA" zawiera "RAWGW-SWEET")
      const ingredientContainsMaterial = ingredientNameLower.includes(materialNameLower);
      
      // 4. Dopasowanie po usunięciu znaków specjalnych (np. "RAWGW-SWEET" vs "RAWGW SWEET")
      const normalizedMaterial = materialNameLower.replace(/[-_\s]/g, '');
      const normalizedIngredient = ingredientNameLower.replace(/[-_\s]/g, '');
      const normalizedMatch = normalizedMaterial === normalizedIngredient || 
                              normalizedMaterial.includes(normalizedIngredient) ||
                              normalizedIngredient.includes(normalizedMaterial);
      
      const matchesIngredient = exactMatch || materialContainsIngredient || ingredientContainsMaterial || normalizedMatch;
      
      const hasAvailableQuantity = res.availableQuantity > 0;
      // Usunięto warunek notAlreadyLinked - rezerwacje z dostępną ilością powinny być widoczne
      // nawet jeśli były już wcześniej powiązane (np. po częściowej konsumpcji)
      
      console.log(`  ➜ IsReal: ${isRealReservation}, Matches: ${matchesIngredient} (exact: ${exactMatch}, contains: ${materialContainsIngredient}/${ingredientContainsMaterial}, normalized: ${normalizedMatch}), HasQty: ${hasAvailableQuantity}`);
      
      const shouldInclude = matchesIngredient && hasAvailableQuantity && isRealReservation;
      if (!shouldInclude) {
        console.log(`    ❌ Odrzucam rezerwację: ${res.materialName} (${res.availableQuantity}) - Matches: ${matchesIngredient}, HasQty: ${hasAvailableQuantity}, IsReal: ${isRealReservation}`);
      } else {
        console.log(`    ✅ Akceptuję rezerwację: ${res.materialName} (${res.availableQuantity})`);
      }
      
      return shouldInclude;
    }).map(res => ({ ...res, type: 'standard' }));
    
    // Dostępne po filtrowaniu: ${available.length}
    
    setAvailableReservations(available);
    setLinkDialogOpen(true);
  };

  // Debounced wersja funkcji - zapobiega wielokrotnemu szybkiemu klikaniu
  const handleLinkIngredient = useMemo(
    () => debounce(handleLinkIngredientImmediate, 300),
    [standardReservations, ingredientLinks, task.id]
  );

  // Aktualizuj maksymalną dostępną ilość gdy wybrana zostanie rezerwacja
  useEffect(() => {
    if (selectedReservation) {
      const maxQty = selectedReservation.availableQuantity;
      setMaxAvailableQuantity(maxQty);
      
      // Jeśli aktualna ilość powiązania przekracza dostępną, zmniejsz ją
      if (parseFloat(linkQuantity) > maxQty) {
        setLinkQuantity(Math.min(requiredQuantity, maxQty).toString());
      }
    }
  }, [selectedReservation, requiredQuantity, linkQuantity]);

  // Powiąż składnik z rezerwacją
  const handleConfirmLink = async () => {
    if (!selectedIngredient || !selectedReservation || !linkQuantity) return;

    const quantity = parseFloat(linkQuantity);
    
    if (isNaN(quantity) || quantity <= 0) {
      showError('Podaj prawidłową ilość powiązania');
      return;
    }

    if (quantity > maxAvailableQuantity) {
      showError(`Ilość nie może przekraczać dostępnej (${maxAvailableQuantity})`);
      return;
    }

    try {
      await linkIngredientToReservation(
        task.id,
        selectedIngredient.id,
        selectedReservation.id,
        selectedReservation.type,
        quantity, // Przekaż ilość powiązania
        currentUser.uid
      );

      // ✅ Real-time listener automatycznie odświeży powiązania i dostępne ilości
      console.log('✅ Powiązanie utworzone - real-time listener zaktualizuje dane');
      
      // Zamknij dialog
      setLinkDialogOpen(false);
      setSelectedIngredient(null);
      setSelectedReservation(null);
      setLinkQuantity('');
      setMaxAvailableQuantity(0);
      setRequiredQuantity(0);
      
      showSuccess(`Składnik został powiązany z rezerwacją (${quantity} ${selectedReservation.unit || 'szt.'})`);
      
      // ✅ USUNIĘTO onPlanUpdate() - niepotrzebne pełne odświeżenie strony
      // Real-time listener dla powiązań (linia 235) automatycznie wykryje zmianę i zaktualizuje dane
      // bez resetowania pozycji scroll
    } catch (error) {
      console.error('Błąd podczas powiązania składnika:', error);
      showError('Nie udało się powiązać składnika z rezerwacją');
    }
  };

  // Funkcje dla edycji ilości składników
  const handleEditQuantity = (ingredient) => {
    // Wyodrębnij aktualną ilość z details
    const quantityMatch = ingredient.details.match(/Ilość:\s*([\d,\.]+)/);
    const currentQuantity = quantityMatch ? quantityMatch[1] : '';
    
    setEditingIngredient(ingredient);
    setEditQuantityValue(currentQuantity);
    setEditQuantityDialogOpen(true);
  };

  const handleSaveQuantity = async () => {
    if (!editingIngredient || !editQuantityValue) return;

    const newQuantity = parseFloat(editQuantityValue.replace(',', '.'));
    
    if (isNaN(newQuantity) || newQuantity < 0) {
      showError('Podaj prawidłową ilość (liczba dodatnia)');
      return;
    }

    try {
      setEditQuantityLoading(true);
      
      // Importuj funkcję dynamicznie
      const { updateIngredientQuantityInMixingPlan } = await import('../../services/productionService');
      
      const result = await updateIngredientQuantityInMixingPlan(
        task.id,
        editingIngredient.id,
        newQuantity,
        currentUser.uid
      );
      
      if (result.success) {
        showSuccess(result.message);
        setEditQuantityDialogOpen(false);
        setEditingIngredient(null);
        setEditQuantityValue('');
        
        // ✅ USUNIĘTO onPlanUpdate() - real-time listener zadania automatycznie
        // wykryje zmianę w mixingPlanChecklist i zaktualizuje dane bez resetowania scroll
      }
    } catch (error) {
      console.error('Błąd podczas aktualizacji ilości:', error);
      showError('Błąd podczas aktualizacji ilości: ' + error.message);
    } finally {
      setEditQuantityLoading(false);
    }
  };

  const handleCancelEditQuantity = () => {
    setEditQuantityDialogOpen(false);
    setEditingIngredient(null);
    setEditQuantityValue('');
  };

  // Funkcje dla edycji mieszania
  const handleEditMixing = (headerItem) => {
    // Wyodrębnij liczbę sztuk z details
    const piecesCountMatch = headerItem.details.match(/Liczba sztuk:\s*([\d,\.]+)/);
    const currentPiecesCount = piecesCountMatch ? piecesCountMatch[1] : '';
    
    setEditingMixing(headerItem);
    setEditMixingName(headerItem.text);
    setEditMixingPiecesCount(currentPiecesCount);
    setEditMixingDialogOpen(true);
  };

  const handleSaveMixing = async () => {
    if (!editingMixing) return;

    // Walidacja - nazwa jest opcjonalna, ale jeśli podana, nie może być pusta
    if (editMixingName && editMixingName.trim() === '') {
      showError('Nazwa mieszania nie może być pusta');
      return;
    }

    // Walidacja liczby sztuk - jeśli podana, musi być liczbą dodatnią
    let piecesCount = null;
    if (editMixingPiecesCount && editMixingPiecesCount.trim() !== '') {
      const parsedPiecesCount = parseFloat(editMixingPiecesCount.replace(',', '.'));
      if (isNaN(parsedPiecesCount) || parsedPiecesCount < 0) {
        showError('Liczba sztuk musi być liczbą dodatnią');
        return;
      }
      piecesCount = parsedPiecesCount;
    }

    try {
      setEditMixingLoading(true);
      
      // Importuj funkcję dynamicznie
      const { updateMixingDetails } = await import('../../services/productionService');
      
      const result = await updateMixingDetails(
        task.id,
        editingMixing.id,
        editMixingName,
        piecesCount,
        currentUser.uid
      );
      
      if (result.success) {
        showSuccess(result.message);
        setEditMixingDialogOpen(false);
        setEditingMixing(null);
        setEditMixingName('');
        setEditMixingPiecesCount('');
        
        // ✅ USUNIĘTO onPlanUpdate() - real-time listener zadania automatycznie
        // wykryje zmianę w mixingPlanChecklist i zaktualizuje dane bez resetowania scroll
      }
    } catch (error) {
      console.error('Błąd podczas aktualizacji mieszania:', error);
      showError('Błąd podczas aktualizacji mieszania: ' + error.message);
    } finally {
      setEditMixingLoading(false);
    }
  };

  const handleCancelEditMixing = () => {
    setEditMixingDialogOpen(false);
    setEditingMixing(null);
    setEditMixingName('');
    setEditMixingPiecesCount('');
  };

  // Usuń konkretne powiązanie składnik-rezerwacja
  const handleUnlinkSpecificReservation = async (linkId) => {
    try {
      await unlinkSpecificReservation(linkId, currentUser.uid);
      
      // Odśwież dane natychmiast - nie czekaj tylko na real-time listener
      console.log('✅ Konkretne powiązanie usunięte, odświeżam dane...');
      
      // ✅ Real-time listener automatycznie odświeży powiązania i dostępne ilości
      
      showSuccess('Powiązanie zostało usunięte');
      
      // ✅ USUNIĘTO onPlanUpdate() - real-time listener dla powiązań automatycznie
      // wykryje zmianę i zaktualizuje dane bez resetowania scroll
    } catch (error) {
      console.error('Błąd podczas usuwania konkretnego powiązania:', error);
      showError('Nie udało się usunąć powiązania');
    }
  };

  // Usuń wszystkie powiązania składnika (zachowane dla kompatybilności)
  const handleUnlinkIngredient = async (ingredientId) => {
    try {
      await unlinkIngredientFromReservation(task.id, ingredientId, currentUser.uid);
      
      // ✅ Real-time listener automatycznie odświeży powiązania i dostępne ilości
      console.log('✅ Wszystkie powiązania składnika usunięte - real-time listener zaktualizuje dane');
      
      showSuccess('Wszystkie powiązania zostały usunięte');
      
      // ✅ USUNIĘTO onPlanUpdate() - real-time listener dla powiązań automatycznie
      // wykryje zmianę i zaktualizuje dane bez resetowania scroll
    } catch (error) {
      console.error('Błąd podczas usuwania powiązań składnika:', error);
      showError('Nie udało się usunąć powiązań');
    }
  };

  // Funkcja do dodawania nowej mieszanki
  const handleAddMixing = async () => {
    if (!currentUser?.uid) {
      showError(t('auth.errors.notAuthenticated'));
      return;
    }

    if (newMixingIngredients.length === 0 || !newMixingIngredients[0].name) {
      showError(t('mixingPlan.noIngredients'));
      return;
    }

    // Sprawdź czy wszystkie składniki mają nazwy i ilości
    const validIngredients = newMixingIngredients.filter(ing => ing.name && ing.quantity > 0);
    if (validIngredients.length === 0) {
      showError(t('mixingPlan.invalidIngredients'));
      return;
    }

    try {
      setAddingMixing(true);

      const mixingData = {
        ingredients: validIngredients.map(ing => ({
          name: ing.name,
          quantity: parseFloat(ing.quantity),
          unit: ing.unit
        })),
        piecesCount: newMixingPiecesCount ? parseFloat(newMixingPiecesCount) : undefined
      };

      const { addMixingToPlan } = await import('../../services/productionService');
      const result = await addMixingToPlan(task.id, mixingData, currentUser.uid);

      if (result.success) {
        showSuccess(result.message);
        setAddMixingDialogOpen(false);
        setNewMixingIngredients([{ name: '', quantity: '', unit: 'kg' }]);
        setNewMixingPiecesCount('');

        // ✅ USUNIĘTO onPlanUpdate() - real-time listener zadania automatycznie
        // wykryje zmianę w mixingPlanChecklist (nowe mieszanie) i zaktualizuje interfejs
        // bez resetowania scroll position
      }
    } catch (error) {
      console.error('Błąd podczas dodawania mieszania:', error);
      showError(t('mixingPlan.errors.addMixingFailed') + ': ' + error.message);
    } finally {
      setAddingMixing(false);
    }
  };

  // Funkcja do dodawania składnika w modalu
  const addIngredientField = () => {
    setNewMixingIngredients([...newMixingIngredients, { name: '', quantity: '', unit: 'kg' }]);
  };

  // Funkcja do usuwania składnika w modalu
  const removeIngredientField = (index) => {
    const updated = newMixingIngredients.filter((_, i) => i !== index);
    setNewMixingIngredients(updated);
  };

  // Funkcja do aktualizacji składnika w modalu
  const updateIngredientField = (index, field, value) => {
    const updated = newMixingIngredients.map((ing, i) =>
      i === index ? { ...ing, [field]: value } : ing
    );
    setNewMixingIngredients(updated);
  };

  // Funkcja do usuwania mieszanki
  const handleRemoveMixing = async (mixingId) => {
    if (!currentUser?.uid) {
      showError(t('auth.errors.notAuthenticated'));
      return;
    }

    // Wyciągnij numer mieszania z ID
    const mixingNumber = mixingId.match(/mixing-(\d+)/)?.[1];
    if (!mixingNumber) {
      showError(t('mixingPlan.errors.invalidMixingId'));
      return;
    }

    // Otwórz dialog potwierdzenia zamiast używać confirm
    setMixingToRemove({ id: mixingId, number: mixingNumber });
    setRemoveMixingDialogOpen(true);
  };

  // Funkcja do potwierdzania usunięcia mieszanki
  const handleConfirmRemoveMixing = async () => {
    if (!mixingToRemove) return;

    try {
      setRemovingMixing(mixingToRemove.id);

      const { removeMixingFromPlan } = await import('../../services/productionService');
      const result = await removeMixingFromPlan(task.id, parseInt(mixingToRemove.number), currentUser.uid);

      if (result.success) {
        showSuccess(result.message);

        // ✅ USUNIĘTO onPlanUpdate() - real-time listener zadania automatycznie
        // wykryje zmianę w mixingPlanChecklist (usunięte mieszanie) i zaktualizuje interfejs
        // bez resetowania scroll position
      }
    } catch (error) {
      console.error('Błąd podczas usuwania mieszania:', error);
      showError(t('mixingPlan.errors.removeMixingFailed') + ': ' + error.message);
    } finally {
      setRemovingMixing(null);
      setRemoveMixingDialogOpen(false);
      setMixingToRemove(null);
    }
  };

  // Funkcja do anulowania usunięcia mieszanki
  const handleCancelRemoveMixing = () => {
    setRemoveMixingDialogOpen(false);
    setMixingToRemove(null);
  };

  // Funkcje przewijania
  const scrollToBottom = () => {
    if (mixingPlanContainerRef.current) {
      mixingPlanContainerRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  };

  const scrollToTop = () => {
    if (mixingPlanContainerRef.current) {
      mixingPlanContainerRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  // Renderuj chip rezerwacji (tylko standardowe)
  const renderReservationChip = (reservation) => {
    return (
      <Chip
        size="small"
        label={`LOT: ${reservation.batchNumber}`}
        color="secondary"
        variant="outlined"
        icon={<AssignmentIcon />}
      />
    );
  };

  // Renderuj status powiązań składnika (obsługuje wiele powiązań)
  const renderIngredientLinkStatus = (ingredient) => {
    const links = ingredientLinks[ingredient.id] || [];
    
    if (links.length > 0) {
      // Oblicz sumaryczne statystyki
      const totalLinkedQuantity = links.reduce((sum, link) => sum + (link.linkedQuantity || 0), 0);
      const totalConsumedQuantity = links.reduce((sum, link) => sum + (link.consumedQuantity || 0), 0);
      const totalRemainingQuantity = links.reduce((sum, link) => sum + (link.remainingQuantity || 0), 0);
      const averageConsumptionPercentage = links.length > 0 
        ? Math.round(links.reduce((sum, link) => sum + (link.consumptionPercentage || 0), 0) / links.length)
        : 0;
      
      return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, width: '100%' }}>
          {/* Nagłówek z sumarycznymi informacjami */}
          <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 0.5 }}>
            <Box>
              <Typography variant="caption" sx={{ color: colors.text.primary, ...typographyBold, ...fontSmall }}>
                {links.length} rezerwacji → Razem: {totalLinkedQuantity} {links[0]?.batchSnapshot?.unit || 'szt.'}
              </Typography>
              <Typography variant="caption" sx={{ color: colors.text.secondary, display: 'block', ...typographyItalic, ...fontXSmall }}>
                Kliknij wiersz aby dodać kolejną
              </Typography>
            </Box>
          </Box>
          
          {/* Lista wszystkich powiązań */}
          {links.map((link, index) => {
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
                  p: 0.75,
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
                    {renderReservationChip({ ...reservationFromSnapshot, type: link.reservationType })}
                    <Typography variant="caption" sx={{ color: colors.text.primary, ...typographyBold, ...fontSmall }}>
                      {link.linkedQuantity || link.quantity} {reservationFromSnapshot.unit}
                    </Typography>
                  </Box>
                  
                  {/* Linia 2: Lokalizacja + data ważności (w jednej linii) */}
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                    {reservationFromSnapshot.warehouseName && (
                      <Typography variant="caption" sx={{ color: colors.text.secondary, ...fontXSmall, display: 'flex', alignItems: 'center', gap: 0.25 }}>
                        📍 {reservationFromSnapshot.warehouseName}
                      </Typography>
                    )}
                    {reservationFromSnapshot.expiryDateString && (
                      <Typography variant="caption" sx={{ color: colors.text.secondary, ...fontXSmall, display: 'flex', alignItems: 'center', gap: 0.25 }}>
                        📅 {reservationFromSnapshot.expiryDateString}
                      </Typography>
                    )}
                  </Box>
                  
                  {/* Linia 3: Informacje o konsumpcji (tylko jeśli istnieją) */}
                  {link.consumedQuantity > 0 && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.25 }}>
                      <Typography variant="caption" sx={{ 
                        color: link.isFullyConsumed ? 'success.main' : 'warning.main',
                        fontSize: '0.7rem'
                      }}>
                        Użyto: {link.consumedQuantity} / Pozostało: {link.remainingQuantity}
                      </Typography>
                      {link.consumptionPercentage !== undefined && (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <Box sx={{ 
                            width: '30px', 
                            height: '3px', 
                            bgcolor: mode === 'dark' ? 'rgba(255, 255, 255, 0.2)' : 'grey.200', 
                            borderRadius: 2,
                            overflow: 'hidden'
                          }}>
                            <Box sx={{
                              width: `${link.consumptionPercentage}%`,
                              height: '100%',
                              bgcolor: link.consumptionPercentage === 100 ? 'success.main' : 'primary.main',
                              // 🚀 USUNIĘTO transition - powodowało miganie na mobile
                            }} />
                          </Box>
                          <Typography variant="caption" sx={{ color: colors.text.secondary, ...fontXSmall }}>
                            {link.consumptionPercentage}%
                          </Typography>
                        </Box>
                      )}
                    </Box>
                  )}
                </Box>
                
                {/* Pokazuj przycisk odłączenia tylko jeśli nie jest w pełni skonsumowane */}
                {!link.isFullyConsumed && (
                  <IconButton
                    size="small"
                    onClick={() => handleUnlinkSpecificReservation(link.id)}
                    color="error"
                    sx={{ alignSelf: 'flex-start' }}
                  >
                    <UnlinkIcon fontSize="small" />
                  </IconButton>
                )}
                
                {/* Ikona informacji dla w pełni skonsumowanych */}
                {link.isFullyConsumed && (
                  <Tooltip title="Powiązanie zostało w pełni skonsumowane">
                    <InfoIcon fontSize="small" color="success" sx={{ alignSelf: 'flex-start' }} />
                  </Tooltip>
                )}
              </Box>
            );
          })}
          
          {/* Sumaryczne informacje o konsumpcji */}
          {totalConsumedQuantity > 0 && (
            <Box sx={{ 
              mt: 0.5, 
              p: 0.5, 
              bgcolor: colors.primary + '0a', 
              borderRadius: 1,
              border: '1px solid',
              borderColor: colors.primary + '20'
            }}>
              <Typography variant="caption" sx={{ color: colors.text.primary, fontWeight: 'bold', fontSize: '0.7rem' }}>
                📊 Łącznie użyto: {totalConsumedQuantity} / Pozostało: {totalRemainingQuantity} / Avg: {averageConsumptionPercentage}%
              </Typography>
            </Box>
          )}
        </Box>
      );
    }
    
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <LinkIcon fontSize="small" sx={{ color: colors.text.disabled }} />
        <Typography variant="caption" sx={{ color: colors.text.secondary, fontStyle: 'italic' }}>
          Kliknij wiersz aby powiązać z rezerwacją
        </Typography>
      </Box>
    );
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!task?.mixingPlanChecklist || task.mixingPlanChecklist.length === 0) {
    return (
      <Alert severity="info">
        <AlertTitle>Brak planu mieszań</AlertTitle>
        Plan mieszań nie został jeszcze wygenerowany dla tego zadania.
      </Alert>
    );
  }

  return (
    <Paper 
      ref={mixingPlanContainerRef} 
      sx={{ 
        p: isMobile ? 2 : 1.5, 
        mb: 1.5,
        // 🚀 GPU acceleration dla płynnego przewijania
        transform: 'translateZ(0)',
        willChange: 'scroll-position',
        WebkitOverflowScrolling: 'touch', // iOS smooth scroll
        contain: 'layout style', // Izolacja re-renderów
      }}
    >
      {/* Nagłówek z przyciskami - responsywny */}
      <Box sx={{ 
        display: 'flex', 
        flexDirection: isMobile ? 'column' : 'row',
        justifyContent: 'space-between', 
        alignItems: isMobile ? 'flex-start' : 'center',
        mb: 1.5,
        gap: isMobile ? 2 : 0
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
          <Typography variant="h6" sx={{ fontSize: isMobile ? '1rem' : '1.1rem' }}>
            {t('mixingPlan.title')}
          </Typography>
          {totalIngredients > 0 && !isVerySmall && (
            <Chip
              label={`${linkedIngredients}/${totalIngredients} (${linkagePercentage}%)`}
              size="small"
              color={linkagePercentage === 100 ? 'success' : linkagePercentage > 50 ? 'warning' : 'default'}
              variant="outlined"
              sx={{ height: 20, fontSize: '0.7rem' }}
            />
          )}
        </Box>
        <Box sx={{ 
          display: 'flex', 
          flexDirection: isMobile ? 'column' : 'row',
          alignItems: isMobile ? 'stretch' : 'center',
          gap: 1,
          width: isMobile ? '100%' : 'auto'
        }}>
          {/* 🚀 OPTYMALIZACJA: Wskaźnik synchronizacji - CircularProgress zamiast pulse animation */}
          {isLinksUpdating && !isVerySmall && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <CircularProgress size={10} color="success" />
              <Typography variant="caption" sx={{ color: 'success.main', fontSize: '0.7rem' }}>
                Aktualizacja...
              </Typography>
            </Box>
          )}

          <Button
            startIcon={!isMobile && <AddIcon />}
            onClick={() => setAddMixingDialogOpen(true)}
            size={isMobile ? "medium" : "small"}
            fullWidth={isMobile}
            sx={{ 
              fontSize: isMobile ? '0.875rem' : '0.75rem',
              py: isMobile ? 1 : 0.5,
              px: isMobile ? 2 : 1,
              minHeight: isMobile ? 44 : 'auto'
            }}
          >
            {t('mixingPlan.addMixing')}
          </Button>

          <Button
            startIcon={!isMobile && <RefreshIcon />}
            onClick={refreshData}
            disabled={refreshing}
            size={isMobile ? "medium" : "small"}
            fullWidth={isMobile}
            sx={{ 
              fontSize: isMobile ? '0.875rem' : '0.75rem',
              py: isMobile ? 1 : 0.5,
              px: isMobile ? 2 : 1,
              minHeight: isMobile ? 44 : 'auto'
            }}
          >
            Odśwież
          </Button>

          {!isMobile && (
            <Tooltip title="Przewiń na dół">
              <IconButton
                onClick={scrollToBottom}
                size="small"
                color="primary"
              >
                <ArrowDownIcon />
              </IconButton>
            </Tooltip>
          )}
        </Box>
      </Box>



      {/* 🚀 OPTYMALIZACJA: Lista mieszań - używa przygotowanych danych zamiast filtrowania przy każdym renderze */}
      {headers.map(headerItem => {
        // Używamy zmemoizowanych danych zamiast filtrowania
        const ingredients = ingredientsByHeader[headerItem.id] || [];
        const checkItems = checkItemsByHeader[headerItem.id] || [];
        

        
        return (
          <Box key={headerItem.id} sx={{ 
            mb: 2, 
            border: '1px solid', 
            borderColor: borderColor, 
            borderRadius: 3, 
            overflow: 'hidden',
            bgcolor: colors.paper
          }}>
            {/* Nagłówek mieszania z tłem - responsywny */}
            <Box sx={{
              p: isMobile ? 1.5 : 2,
              bgcolor: colors.background,
              borderBottom: '1px solid',
              borderColor: borderColor,
              display: 'flex',
              flexDirection: isMobile ? 'column' : 'row',
              justifyContent: 'space-between',
              alignItems: isMobile ? 'flex-start' : 'flex-start',
              gap: isMobile ? 1.5 : 0
            }}>
              <Box>
                <Typography variant="h6" sx={{ 
                  fontWeight: 700, 
                  color: 'primary.main', 
                  mb: 0.5,
                  fontSize: isMobile ? '1rem' : '1.25rem'
                }}>
                  {headerItem.text}
                </Typography>
                {headerItem.details && (
                  <Typography variant="body2" sx={{ 
                    color: colors.text.secondary,
                    fontSize: isMobile ? '0.875rem' : '1rem'
                  }}>
                    {headerItem.details}
                  </Typography>
                )}
              </Box>
              <Box sx={{ 
                display: 'flex', 
                flexDirection: isMobile ? 'column' : 'row',
                gap: 1,
                width: isMobile ? '100%' : 'auto'
              }}>
                <Tooltip title={!isMobile ? t('mixingPlan.editMixing') : ''}>
                  <Button
                    size={isMobile ? "medium" : "small"}
                    color="primary"
                    variant="outlined"
                    startIcon={!isMobile && <EditIcon />}
                    onClick={() => handleEditMixing(headerItem)}
                    fullWidth={isMobile}
                    sx={{ 
                      minWidth: isMobile ? 'auto' : 'auto',
                      px: isMobile ? 2 : 1,
                      minHeight: isMobile ? 44 : 'auto'
                    }}
                  >
                    {t('common.edit')}
                  </Button>
                </Tooltip>
                <Button
                  size={isMobile ? "medium" : "small"}
                  color="error"
                  variant="outlined"
                  startIcon={!isMobile && <UnlinkIcon />}
                  onClick={() => handleRemoveMixing(headerItem.id)}
                  disabled={removingMixing === headerItem.id}
                  fullWidth={isMobile}
                  sx={{ 
                    minWidth: isMobile ? 'auto' : 'auto',
                    px: isMobile ? 2 : 1,
                    minHeight: isMobile ? 44 : 'auto'
                  }}
                >
                  {removingMixing === headerItem.id ? t('common.removing') : t('mixingPlan.removeMixing')}
                </Button>
              </Box>
            </Box>
            
            <Box sx={{ p: isMobile ? 1.5 : 2 }}>
            
            <Grid container spacing={isMobile ? 2 : 1.5}>
              {/* Składniki z możliwością powiązania rezerwacji */}
              <Grid item xs={12} md={8}>
                <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 2, color: colors.text.primary }}>
                  Składniki i rezerwacje
                </Typography>
                
                {/* 🚀 OPTYMALIZACJA: Użycie zmemoizowanych komponentów */}
                {ingredients.length === 0 ? (
                  <Alert severity="info" sx={{ mt: 1 }}>
                    Brak składników w tym mieszaniu
                  </Alert>
                ) : isMobile ? (
                  // 📱 Widok mobilny - Zmemoizowane Cards
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                    {ingredients.map((ingredient) => (
                      <MobileIngredientCard
                        key={ingredient.id}
                        ingredient={ingredient}
                        links={ingredientLinks[ingredient.id] || []}
                        colors={colors}
                        mode={mode}
                        borderColor={borderColor}
                        onLinkIngredient={handleLinkIngredient}
                        onEditQuantity={handleEditQuantity}
                        onUnlinkSpecificReservation={handleUnlinkSpecificReservation}
                      />
                    ))}
                  </Box>
                ) : (
                  // 💻 Widok desktop - Zmemoizowane wiersze
                  <Box sx={{ 
                    border: '1px solid',
                    borderColor: borderColor,
                    borderRadius: 2,
                    overflow: 'hidden'
                  }}>
                    {/* Nagłówek grid */}
                    <Box sx={{ 
                      display: 'grid', 
                      gridTemplateColumns: '2fr 1fr 2fr 60px',
                      gap: 2,
                      bgcolor: colors.background,
                      p: 1.5,
                      borderBottom: '1px solid',
                      borderColor: borderColor
                    }}>
                      <Typography variant="subtitle2" sx={{ fontWeight: 700, color: colors.text.primary }}>
                        Składnik
                      </Typography>
                      <Typography variant="subtitle2" sx={{ fontWeight: 700, color: colors.text.primary }}>
                        Ilość
                      </Typography>
                      <Typography variant="subtitle2" sx={{ fontWeight: 700, color: colors.text.primary }}>
                        Rezerwacja
                      </Typography>
                      <Typography variant="subtitle2" sx={{ fontWeight: 700, color: colors.text.primary }}>
                        Akcje
                      </Typography>
                    </Box>
                    
                    {/* Wiersze składników - zmemoizowane komponenty */}
                    {ingredients.map((ingredient, index) => (
                      <DesktopIngredientRow
                        key={ingredient.id}
                        ingredient={ingredient}
                        isLast={index === ingredients.length - 1}
                        links={ingredientLinks[ingredient.id] || []}
                        colors={colors}
                        mode={mode}
                        borderColor={borderColor}
                        onLinkIngredient={handleLinkIngredient}
                        onEditQuantity={handleEditQuantity}
                        onUnlinkSpecificReservation={handleUnlinkSpecificReservation}
                      />
                    ))}
                  </Box>
                )}
              </Grid>
              
              {/* Status wykonania - checkboxy */}
              <Grid item xs={12} md={4}>
                <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 2, color: colors.text.primary }}>
                  Status wykonania
                </Typography>
                <Box sx={{ 
                  border: '1px solid',
                  borderColor: borderColor,
                  borderRadius: 2,
                  bgcolor: colors.paper
                }}>
                  <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                  {checkItems.map((item, index) => (
                    <Box key={item.id} sx={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'space-between',
                      p: 1.5,
                      borderBottom: index < checkItems.length - 1 ? '1px solid' : 'none',
                      borderColor: borderColor,
                      '&:hover': {
                        bgcolor: colors.background
                      }
                    }}>
                      <FormControlLabel 
                        control={
                          <Checkbox 
                            checked={item.completed || false}
                            size="small"
                            onChange={(e) => onChecklistItemUpdate(item.id, e.target.checked)}
                          />
                        } 
                        label={
                          <Typography variant="body2" sx={{ fontSize: '0.875rem' }}>
                            {item.text}
                          </Typography>
                        }
                        sx={{ margin: 0 }}
                      />
                      {item.completed && (
                        <Chip 
                          size="small" 
                          label={item.completedAt ? new Date(item.completedAt).toLocaleString('pl-PL', {
                            year: 'numeric',
                            month: '2-digit',
                            day: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit'
                          }) : '-'} 
                          color="success" 
                          variant="outlined" 
                          sx={{ height: 20, fontSize: '0.7rem' }}
                        />
                      )}
                    </Box>
                  ))}
                </Box>
                </Box>
              </Grid>
            </Grid>
            </Box>
          </Box>
        );
      })}

      {/* Dialog powiązania składnika z rezerwacją - fullScreen na mobile */}
      <Dialog 
        open={linkDialogOpen} 
        onClose={() => setLinkDialogOpen(false)} 
        maxWidth="md" 
        fullWidth
        fullScreen={isMobile}
        scroll="paper"
      >
        <DialogTitle sx={{ 
          pb: isMobile ? 1 : 2,
          position: 'sticky',
          top: 0,
          bgcolor: 'background.paper',
          zIndex: 1
        }}>
          Powiąż składnik z rezerwacją
          {selectedIngredient && (
            <Typography component="div" variant="subtitle2" color="text.secondary">
              Składnik: {selectedIngredient.text}
            </Typography>
          )}
        </DialogTitle>
        <DialogContent sx={{ p: isMobile ? 2 : 3 }}>
          {availableReservations.length === 0 ? (
            <Alert severity="warning">
              <AlertTitle>Brak dostępnych rezerwacji</AlertTitle>
              Nie znaleziono dostępnych rezerwacji dla tego składnika.
              Sprawdź czy materiał ma aktywne rezerwacje w systemie.
            </Alert>
          ) : (
            <Box sx={{ mt: 2 }}>
              {/* Informacje o istniejących powiązaniach */}
              {selectedIngredient && (() => {
                const existingLinks = ingredientLinks[selectedIngredient.id] || [];
                const alreadyLinkedQuantity = existingLinks.reduce((sum, link) => sum + (link.linkedQuantity || 0), 0);
                const remainingToLink = Math.max(0, requiredQuantity - alreadyLinkedQuantity);
                
                return existingLinks.length > 0 ? (
                  <Alert severity="info" sx={{ mb: 2 }}>
                    <AlertTitle>Informacje o powiązaniach</AlertTitle>
                    <Typography variant="body2">
                      {t('mixingPlan.totalRequired', { quantity: requiredQuantity, unit: existingLinks[0]?.batchSnapshot?.unit || 'szt.' })}
                    </Typography>
                    <Typography variant="body2">
                      Już powiązano: <strong>{alreadyLinkedQuantity} {existingLinks[0]?.batchSnapshot?.unit || 'szt.'}</strong> ({existingLinks.length} rezerwacji)
                    </Typography>
                    <Typography variant="body2" sx={{ color: remainingToLink > 0 ? 'warning.main' : 'success.main' }}>
                      Pozostało do powiązania: <strong>{remainingToLink} {existingLinks[0]?.batchSnapshot?.unit || 'szt.'}</strong>
                    </Typography>
                  </Alert>
                ) : null;
              })()}
              
              <Typography variant="body2" sx={{ mb: 2 }}>
                Wybierz rezerwację do powiązania ze składnikiem:
              </Typography>
              
              <Autocomplete
                options={availableReservations}
                value={selectedReservation}
                onChange={(event, newValue) => setSelectedReservation(newValue)}
                getOptionLabel={(option) => `LOT: ${option.batchNumber} - ${option.availableQuantity} ${option.unit}`}
                renderOption={(props, option) => {
                  const { key, ...otherProps } = props;
                  return (
                    <Box component="li" key={key} {...otherProps}>
                    <Box sx={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        {renderReservationChip(option)}
                        <Typography variant="body2">
                          {option.materialName}
                        </Typography>
                      </Box>
                      <Typography variant="caption" color="text.secondary">
                        Dostępne: {option.availableQuantity} {option.unit}
                        {option.linkedQuantity > 0 && (
                          <span style={{ color: '#ff9800', marginLeft: 8 }}>
                            (Powiązano: {option.linkedQuantity} {option.unit})
                          </span>
                        )}
                      </Typography>
                      
                      {/* Informacje o lokalizacji */}
                      {option.warehouseName && (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}>
                          <LocationIcon fontSize="small" sx={{ color: 'text.secondary' }} />
                          <Typography variant="caption" color="text.secondary">
                            {option.warehouseName}
                            {option.warehouseAddress && ` (${option.warehouseAddress})`}
                          </Typography>
                        </Box>
                      )}
                      
                      {/* Informacje o dacie ważności */}
                      {option.expiryDateString && (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}>
                          <ExpiryIcon fontSize="small" sx={{ color: 'text.secondary' }} />
                          <Typography variant="caption" color="text.secondary">
                            Ważność: {option.expiryDateString}
                          </Typography>
                        </Box>
                      )}
                    </Box>
                  </Box>
                  );
                }}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label={t('mixingPlan.selectReservation')}
                    variant="outlined"
                    fullWidth
                  />
                )}
                sx={{ mb: 2 }}
              />

              {/* Szczegóły wybranej rezerwacji */}
              {selectedReservation && (
                <Paper sx={{ 
                  mb: 2, 
                  p: 2, 
                  bgcolor: (theme) => theme.palette.mode === 'dark' 
                    ? theme.palette.grey[900] 
                    : theme.palette.grey[50],
                  elevation: 1
                }}>
                  <Typography variant="subtitle2" sx={{ mb: 1 }}>
                    Szczegóły wybranej partii:
                  </Typography>
                  
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    {/* Lokalizacja */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <LocationIcon fontSize="small" sx={{ color: 'text.secondary' }} />
                      <Typography variant="body2">
                        <strong>Lokalizacja:</strong> {selectedReservation.warehouseName || 'Nieznana'}
                        {selectedReservation.warehouseAddress && ` (${selectedReservation.warehouseAddress})`}
                      </Typography>
                    </Box>
                    
                    {/* Data ważności */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <ExpiryIcon fontSize="small" sx={{ color: 'text.secondary' }} />
                      <Typography variant="body2">
                        <strong>Data ważności:</strong> {selectedReservation.expiryDateString || 'Brak terminu ważności'}
                      </Typography>
                    </Box>
                    
                    {/* Numer partii */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <AssignmentIcon fontSize="small" sx={{ color: 'text.secondary' }} />
                      <Typography variant="body2">
                        <strong>Numer partii:</strong> {selectedReservation.batchNumber}
                      </Typography>
                    </Box>
                  </Box>
                </Paper>
              )}

              {/* Kontrola ilości powiązania */}
              {selectedReservation && (
                <Box sx={{ mt: 2 }}>
                  <TextField
                    label={t('mixingPlan.quantityToLink')}
                    type="number"
                    value={linkQuantity}
                    onChange={(e) => setLinkQuantity(e.target.value)}
                    fullWidth
                    variant="outlined"
                    inputProps={{
                      min: 0,
                      max: maxAvailableQuantity,
                      step: 0.0001
                    }}
                    InputProps={{
                      endAdornment: (
                        <InputAdornment position="end">
                          {selectedReservation.unit || 'szt.'}
                        </InputAdornment>
                      )
                    }}
                    helperText={
                      <Box>
                        {(() => {
                          const existingLinks = ingredientLinks[selectedIngredient?.id] || [];
                          const alreadyLinkedQuantity = existingLinks.reduce((sum, link) => sum + (link.linkedQuantity || 0), 0);
                          const remainingToLink = Math.max(0, requiredQuantity - alreadyLinkedQuantity);
                          
                          return (
                            <>
                              <Typography variant="caption" color="text.secondary">
                                {t('mixingPlan.totalRequired', { quantity: requiredQuantity, unit: selectedReservation.unit || 'szt.' })} | 
                                Już powiązano: {alreadyLinkedQuantity} {selectedReservation.unit || 'szt.'} | 
                                Pozostało: {remainingToLink} {selectedReservation.unit || 'szt.'} | 
                                Dostępne w tej rezerwacji: {maxAvailableQuantity} {selectedReservation.unit || 'szt.'}
                              </Typography>
                              {parseFloat(linkQuantity) > maxAvailableQuantity && (
                                <Typography variant="caption" color="error" display="block">
                                  Ilość przekracza dostępną w tej rezerwacji
                                </Typography>
                              )}
                              {(alreadyLinkedQuantity + parseFloat(linkQuantity)) > requiredQuantity && (
                                <Typography variant="caption" color="info.main" display="block">
                                  Łączna ilość będzie większa niż wymagana do mieszania (nadwyżka: {((alreadyLinkedQuantity + parseFloat(linkQuantity)) - requiredQuantity).toFixed(2)} {selectedReservation.unit || 'szt.'})
                                </Typography>
                              )}
                              {remainingToLink <= 0 && alreadyLinkedQuantity === requiredQuantity && (
                                <Typography variant="caption" color="success.main" display="block">
                                  Składnik jest powiązany w dokładnej wymaganej ilości
                                </Typography>
                              )}
                              {remainingToLink < 0 && (
                                <Typography variant="caption" color="info.main" display="block">
                                  Składnik ma nadwyżkę: {Math.abs(remainingToLink).toFixed(2)} {selectedReservation.unit || 'szt.'}
                                </Typography>
                              )}
                            </>
                          );
                        })()}
                      </Box>
                    }
                  />
                </Box>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ 
          p: isMobile ? 2 : 1,
          gap: isMobile ? 1 : 0,
          flexDirection: isMobile ? 'column' : 'row'
        }}>
          <Button 
            onClick={() => setLinkDialogOpen(false)}
            fullWidth={isMobile}
            size={isMobile ? "large" : "medium"}
          >
            Anuluj
          </Button>
          <Button 
            onClick={handleConfirmLink}
            variant="contained"
            fullWidth={isMobile}
            size={isMobile ? "large" : "medium"}
            disabled={(() => {
              if (!selectedReservation || !linkQuantity || parseFloat(linkQuantity) <= 0 || parseFloat(linkQuantity) > maxAvailableQuantity) {
                return true;
              }
              
              // Umożliwienie powiązania większej ilości niż zaplanowano
              // Walidacja została usunięta - można teraz powiązać dowolną ilość dostępną w rezerwacji
              return false;
            })()}
          >
            Powiąż
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog edycji ilości składnika - fullScreen na mobile */}
      <Dialog 
        open={editQuantityDialogOpen} 
        onClose={handleCancelEditQuantity} 
        maxWidth="sm" 
        fullWidth
        fullScreen={isMobile}
      >
        <DialogTitle>
          Edytuj ilość składnika
          {editingIngredient && (
            <Typography component="div" variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              {editingIngredient.text}
            </Typography>
          )}
        </DialogTitle>
        <DialogContent sx={{ p: isMobile ? 2 : 3 }}>
          <TextField
            autoFocus
            margin="dense"
            label={t('common:common.newQuantity')}
            type="number"
            fullWidth
            variant="outlined"
            value={editQuantityValue}
            onChange={(e) => setEditQuantityValue(e.target.value)}
            helperText={editingIngredient ? `Aktualna ilość: ${editingIngredient.details}` : ''}
            InputProps={{
              inputProps: { 
                min: 0, 
                step: 0.001,
                style: { textAlign: 'right' }
              },
              endAdornment: editingIngredient && (
                <InputAdornment position="end">
                  {(() => {
                    const unitMatch = editingIngredient.details.match(/\s(\w+)$/);
                    return unitMatch ? unitMatch[1] : 'kg';
                  })()}
                </InputAdornment>
              )
            }}
            sx={{ mt: 2 }}
          />
          <Alert severity="info" sx={{ mt: 2 }}>
            <AlertTitle>Informacja</AlertTitle>
            Zmiana ilości składnika zaktualizuje plan mieszań i automatycznie przeliczy sumę dla całego mieszania.
          </Alert>
        </DialogContent>
        <DialogActions sx={{ 
          p: isMobile ? 2 : 1,
          gap: isMobile ? 1 : 0,
          flexDirection: isMobile ? 'column' : 'row'
        }}>
          <Button 
            onClick={handleCancelEditQuantity}
            fullWidth={isMobile}
            size={isMobile ? "large" : "medium"}
          >
            Anuluj
          </Button>
          <Button 
            onClick={handleSaveQuantity}
            variant="contained"
            fullWidth={isMobile}
            size={isMobile ? "large" : "medium"}
            disabled={editQuantityLoading || !editQuantityValue || parseFloat(editQuantityValue.replace(',', '.')) < 0}
            startIcon={editQuantityLoading ? <CircularProgress size={16} /> : null}
          >
            {editQuantityLoading ? 'Zapisuję...' : 'Zapisz'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog do dodawania nowej mieszanki - fullScreen na mobile */}
      <Dialog
        open={addMixingDialogOpen}
        onClose={() => setAddMixingDialogOpen(false)}
        maxWidth="md"
        fullWidth
        fullScreen={isMobile}
        scroll="paper"
      >
        <DialogTitle>
          {t('mixingPlan.addMixingDialogTitle')}
        </DialogTitle>
        <DialogContent sx={{ p: isMobile ? 2 : 3 }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, pt: 2 }}>

            {/* Liczba sztuk (opcjonalne) */}
            <TextField
              fullWidth
              label={t('mixingPlan.piecesCount')}
              type="number"
              value={newMixingPiecesCount}
              onChange={(e) => setNewMixingPiecesCount(e.target.value)}
              helperText={t('mixingPlan.piecesCountHelper')}
              InputProps={{
                inputProps: { min: 0, step: 0.01 }
              }}
            />

            {/* Składniki */}
            <Box>
              <Typography variant="subtitle1" gutterBottom>
                {t('mixingPlan.ingredients')}
              </Typography>

              {taskMaterials.length === 0 && (
                <Alert severity="info" sx={{ mb: 2 }}>
                  {t('mixingPlan.noTaskMaterials')}
                </Alert>
              )}

              {newMixingIngredients.map((ingredient, index) => (
                <Box key={index} sx={{ display: 'flex', gap: 2, mb: 2, alignItems: 'center' }}>
                  <Autocomplete
                    fullWidth
                    options={taskMaterials}
                    getOptionLabel={(option) => option?.label || ''}
                    value={ingredient.name ? taskMaterials.find(material => material.value === ingredient.name) || { label: ingredient.name, value: ingredient.name } : null}
                    onChange={(event, newValue) => {
                      // Jeśli newValue jest null (kliknięcie poza polem), nie rób nic
                      if (newValue === null) {
                        return;
                      }

                      // Jeśli newValue ma wartość, ustaw ją
                      if (newValue && newValue.value) {
                        updateIngredientField(index, 'name', newValue.value);
                        // Automatycznie ustaw jednostkę jeśli materiał ją ma
                        if (newValue.unit && newValue.unit !== 'szt.') {
                          updateIngredientField(index, 'unit', newValue.unit);
                        }
                      } else {
                        // W innych przypadkach (np. wyczyszczenie pola przez użytkownika)
                        updateIngredientField(index, 'name', '');
                      }
                    }}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        label={`${t('mixingPlan.ingredientName')} ${index + 1}`}
                        placeholder={t('mixingPlan.ingredientNamePlaceholder')}
                      />
                    )}
                    freeSolo
                    autoSelect
                    onBlur={(event) => {
                      // Gdy użytkownik kliknie poza polem, nie czyść wartości jeśli była wpisana ręcznie
                      const inputValue = event.target.value;
                      if (inputValue && inputValue.trim() !== '') {
                        // Sprawdź czy wartość jest już ustawiona jako ingredient.name
                        if (ingredient.name !== inputValue.trim()) {
                          updateIngredientField(index, 'name', inputValue.trim());
                        }
                      }
                    }}
                  />

                  <TextField
                    label={t('mixingPlan.quantity')}
                    type="number"
                    value={ingredient.quantity}
                    onChange={(e) => updateIngredientField(index, 'quantity', e.target.value)}
                    InputProps={{
                      inputProps: { min: 0, step: 0.01 }
                    }}
                    sx={{ width: 150 }}
                  />

                  <TextField
                    select
                    label={t('mixingPlan.unit')}
                    value={ingredient.unit}
                    onChange={(e) => updateIngredientField(index, 'unit', e.target.value)}
                    sx={{ width: 100 }}
                  >
                    <MenuItem value="kg">kg</MenuItem>
                    <MenuItem value="g">g</MenuItem>
                    <MenuItem value="mg">mg</MenuItem>
                    <MenuItem value="caps">caps</MenuItem>
                  </TextField>

                  {newMixingIngredients.length > 1 && (
                    <IconButton
                      color="error"
                      onClick={() => removeIngredientField(index)}
                      size="small"
                    >
                      <RemoveIcon />
                    </IconButton>
                  )}
                </Box>
              ))}

              <Button
                startIcon={<AddIcon />}
                onClick={addIngredientField}
                variant="outlined"
                size="small"
              >
                {t('mixingPlan.addIngredient')}
              </Button>
            </Box>
          </Box>
        </DialogContent>
        <DialogActions sx={{ 
          p: isMobile ? 2 : 1,
          gap: isMobile ? 1 : 0,
          flexDirection: isMobile ? 'column' : 'row'
        }}>
          <Button 
            onClick={() => setAddMixingDialogOpen(false)}
            fullWidth={isMobile}
            size={isMobile ? "large" : "medium"}
          >
            {t('common.cancel')}
          </Button>
          <Button
            onClick={handleAddMixing}
            variant="contained"
            fullWidth={isMobile}
            size={isMobile ? "large" : "medium"}
            disabled={addingMixing}
            startIcon={addingMixing ? <CircularProgress size={16} /> : <AddIcon />}
          >
            {addingMixing ? t('common.adding') : t('mixingPlan.addMixing')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog potwierdzenia usunięcia mieszanki - fullScreen na mobile */}
      <Dialog
        open={removeMixingDialogOpen}
        onClose={handleCancelRemoveMixing}
        maxWidth="sm"
        fullWidth
        fullScreen={isMobile}
      >
        <DialogTitle>
          {t('mixingPlan.removeMixing')}
        </DialogTitle>
        <DialogContent sx={{ p: isMobile ? 2 : 3 }}>
          <Typography variant="body1" gutterBottom>
            {t('mixingPlan.confirmRemoveMixing', { number: mixingToRemove?.number })}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Ta akcja jest nieodwracalna.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ 
          p: isMobile ? 2 : 1,
          gap: isMobile ? 1 : 0,
          flexDirection: isMobile ? 'column' : 'row'
        }}>
          <Button 
            onClick={handleCancelRemoveMixing}
            fullWidth={isMobile}
            size={isMobile ? "large" : "medium"}
          >
            {t('common.cancel')}
          </Button>
          <Button
            onClick={handleConfirmRemoveMixing}
            variant="contained"
            color="error"
            fullWidth={isMobile}
            size={isMobile ? "large" : "medium"}
            disabled={removingMixing !== null}
            startIcon={removingMixing !== null ? <CircularProgress size={16} /> : <UnlinkIcon />}
          >
            {removingMixing !== null ? t('common.removing') : t('mixingPlan.removeMixing')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog edycji mieszania - fullScreen na mobile */}
      <Dialog 
        open={editMixingDialogOpen} 
        onClose={handleCancelEditMixing} 
        maxWidth="sm" 
        fullWidth
        fullScreen={isMobile}
      >
        <DialogTitle>
          {t('mixingPlan.editMixingDialogTitle')}
          {editingMixing && (
            <Typography component="div" variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Aktualne: {editingMixing.text}
            </Typography>
          )}
        </DialogTitle>
        <DialogContent sx={{ p: isMobile ? 2 : 3 }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
            <TextField
              autoFocus
              fullWidth
              label={t('mixingPlan.mixingName')}
              type="text"
              variant="outlined"
              value={editMixingName}
              onChange={(e) => setEditMixingName(e.target.value)}
              helperText={t('mixingPlan.mixingNameHelper')}
              placeholder="Mieszanie nr 1"
            />

            <TextField
              fullWidth
              label={t('mixingPlan.piecesCountLabel')}
              type="number"
              variant="outlined"
              value={editMixingPiecesCount}
              onChange={(e) => setEditMixingPiecesCount(e.target.value)}
              helperText={t('mixingPlan.piecesCountLabelHelper')}
              placeholder="np. 1000"
              InputProps={{
                inputProps: { 
                  min: 0, 
                  step: 0.01,
                  style: { textAlign: 'right' }
                },
                endAdornment: (
                  <InputAdornment position="end">
                    szt.
                  </InputAdornment>
                )
              }}
            />

            <Alert severity="info">
              <AlertTitle>Informacja</AlertTitle>
              {t('mixingPlan.editMixingInfo')}
            </Alert>
          </Box>
        </DialogContent>
        <DialogActions sx={{ 
          p: isMobile ? 2 : 1,
          gap: isMobile ? 1 : 0,
          flexDirection: isMobile ? 'column' : 'row'
        }}>
          <Button 
            onClick={handleCancelEditMixing}
            fullWidth={isMobile}
            size={isMobile ? "large" : "medium"}
          >
            {t('common.cancel')}
          </Button>
          <Button 
            onClick={handleSaveMixing}
            variant="contained"
            fullWidth={isMobile}
            size={isMobile ? "large" : "medium"}
            disabled={editMixingLoading || !editMixingName || editMixingName.trim() === ''}
            startIcon={editMixingLoading ? <CircularProgress size={16} /> : <EditIcon />}
          >
            {editMixingLoading ? t('common.saving') : t('common.save')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Przyciski na dole planu - responsywne */}
      <Box sx={{ 
        display: 'flex', 
        flexDirection: isMobile ? 'column' : 'row',
        justifyContent: 'center', 
        gap: isMobile ? 1.5 : 2,
        mt: 2, 
        pt: 2, 
        borderTop: '1px solid', 
        borderColor: borderColor 
      }}>
        <Button
          startIcon={!isMobile && <AddIcon />}
          onClick={() => setAddMixingDialogOpen(true)}
          size={isMobile ? "large" : "small"}
          variant="contained"
          fullWidth={isMobile}
          sx={{ 
            fontSize: isMobile ? '0.875rem' : '0.75rem',
            py: isMobile ? 1 : 0.5,
            px: isMobile ? 3 : 2,
            minHeight: isMobile ? 48 : 'auto'
          }}
        >
          {t('mixingPlan.addMixing')}
        </Button>
        
        <Tooltip title={!isMobile ? "Przewiń do góry" : ""}>
          <Button
            onClick={scrollToTop}
            startIcon={!isMobile && <ArrowUpIcon />}
            size={isMobile ? "large" : "small"}
            variant="outlined"
            fullWidth={isMobile}
            sx={{ 
              fontSize: isMobile ? '0.875rem' : '0.75rem',
              py: isMobile ? 1 : 0.5,
              px: isMobile ? 3 : 2,
              minHeight: isMobile ? 48 : 'auto'
            }}
          >
            Przewiń do góry
          </Button>
        </Tooltip>
      </Box>
    </Paper>
  );
};

export default memo(EnhancedMixingPlan);
