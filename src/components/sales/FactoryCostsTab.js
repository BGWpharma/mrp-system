// src/components/sales/FactoryCostsTab.js
/**
 * Komponent zakładki kosztów zakładu
 * Pozwala na dodawanie, edycję i usuwanie kosztów zakładu
 * oraz wyświetla statystyki efektywnego czasu pracy i kosztu na minutę
 */

import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  Grid,
  Button,
  TextField,
  IconButton,
  Tooltip,
  CircularProgress,
  Alert,
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
  useTheme,
  Chip,
  InputAdornment,
  FormControl,
  FormLabel,
  FormGroup,
  FormControlLabel,
  Checkbox,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Badge
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Refresh as RefreshIcon,
  Factory as FactoryIcon,
  CalendarMonth as CalendarIcon,
  Calculate as CalculateIcon,
  ExpandMore as ExpandMoreIcon,
  FilterAlt as FilterIcon
} from '@mui/icons-material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { pl } from 'date-fns/locale';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { useAuth } from '../../contexts/AuthContext';
import { useNotification } from '../../hooks/useNotification';
import { useTranslation } from '../../hooks/useTranslation';
import {
  getFactoryCostsWithAnalysis,
  addFactoryCost,
  updateFactoryCost,
  deleteFactoryCost,
  recalculateAllFactoryCosts,
  getProductionTasksInDateRange,
  updateFactoryCostInTasks,
  recalculateAllTaskFactoryCosts
} from '../../services/factoryCostService';

const FactoryCostsTab = () => {
  const { currentUser } = useAuth();
  const { showSuccess, showError } = useNotification();
  const { t } = useTranslation('invoices');
  const theme = useTheme();

  // Stan główny
  const [loading, setLoading] = useState(true);
  const [recalculating, setRecalculating] = useState(false);
  const [costs, setCosts] = useState([]);

  // Dialog dodawania/edycji kosztu
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCost, setEditingCost] = useState(null);
  const [formData, setFormData] = useState({
    startDate: startOfMonth(new Date()),
    endDate: endOfMonth(new Date()),
    amount: '',
    description: '',
    excludedTaskIds: [],
    isPaid: true // Domyślnie opłacone
  });

  // Dostępne zadania produkcyjne w wybranym zakresie dat (do wykluczenia)
  const [availableTasks, setAvailableTasks] = useState([]);
  const [loadingTasks, setLoadingTasks] = useState(false);

  // Dialog potwierdzenia usunięcia
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [costToDelete, setCostToDelete] = useState(null);

  // Pobieranie danych początkowych
  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const fetchedCosts = await getFactoryCostsWithAnalysis();
      setCosts(fetchedCosts);
    } catch (error) {
      console.error('Błąd podczas pobierania danych:', error);
      showError(t('factoryCosts.errors.fetchData', 'Błąd podczas pobierania danych'));
    } finally {
      setLoading(false);
    }
  };

  // Ręczne przeliczanie wszystkich kosztów
  const handleRecalculateAll = async () => {
    try {
      setRecalculating(true);
      
      // Przelicz koszty zakładu
      const result = await recalculateAllFactoryCosts();
      
      // Przelicz koszty zakładu w zadaniach produkcyjnych
      const tasksResult = await recalculateAllTaskFactoryCosts();
      
      showSuccess(t('factoryCosts.notifications.recalculatedWithTasks', 
        `Przeliczono ${result.updated} kosztów i ${tasksResult.updated} zadań`));
      await fetchData();
    } catch (error) {
      console.error('Błąd podczas przeliczania:', error);
      showError(t('factoryCosts.errors.recalculate', 'Błąd podczas przeliczania kosztów'));
    } finally {
      setRecalculating(false);
    }
  };

  // Pobieranie zadań produkcyjnych w zakresie dat
  const fetchTasksInRange = async (startDate, endDate) => {
    try {
      setLoadingTasks(true);
      const tasks = await getProductionTasksInDateRange(startDate, endDate);
      setAvailableTasks(tasks);
    } catch (error) {
      console.error('Błąd podczas pobierania zadań:', error);
      setAvailableTasks([]);
    } finally {
      setLoadingTasks(false);
    }
  };

  // Otwieranie dialogu dodawania
  const handleOpenAddDialog = () => {
    setEditingCost(null);
    const startDate = startOfMonth(new Date());
    const endDate = endOfMonth(new Date());
    setFormData({
      startDate,
      endDate,
      amount: '',
      description: '',
      excludedTaskIds: [],
      isPaid: true // Domyślnie opłacone
    });
    setAvailableTasks([]);
    setDialogOpen(true);
    // Pobierz zadania w zakresie
    fetchTasksInRange(startDate, endDate);
  };

  // Otwieranie dialogu edycji
  const handleOpenEditDialog = (cost) => {
    setEditingCost(cost);
    setFormData({
      startDate: cost.startDate,
      endDate: cost.endDate,
      amount: cost.amount.toString(),
      description: cost.description || '',
      excludedTaskIds: cost.excludedTaskIds || [],
      isPaid: cost.isPaid !== undefined ? cost.isPaid : true // Domyślnie true dla starych rekordów
    });
    setAvailableTasks([]);
    setDialogOpen(true);
    // Pobierz zadania w zakresie
    fetchTasksInRange(cost.startDate, cost.endDate);
  };

  // Zamykanie dialogu
  const handleCloseDialog = () => {
    setDialogOpen(false);
    setEditingCost(null);
    setAvailableTasks([]);
  };

  // Obsługa zmiany zakresu dat - odśwież listę zadań
  const handleDateChange = (field, value) => {
    const newFormData = { ...formData, [field]: value };
    setFormData(newFormData);
    
    // Jeśli obie daty są ustawione, pobierz zadania
    if (newFormData.startDate && newFormData.endDate && newFormData.startDate <= newFormData.endDate) {
      fetchTasksInRange(newFormData.startDate, newFormData.endDate);
    }
  };

  // Obsługa zmiany wykluczeń
  const handleExclusionToggle = (taskId) => {
    setFormData(prev => {
      const excluded = prev.excludedTaskIds || [];
      if (excluded.includes(taskId)) {
        return { ...prev, excludedTaskIds: excluded.filter(id => id !== taskId) };
      } else {
        return { ...prev, excludedTaskIds: [...excluded, taskId] };
      }
    });
  };

  // Zapisywanie kosztu
  const handleSaveCost = async () => {
    try {
      if (!formData.amount || parseFloat(formData.amount) <= 0) {
        showError(t('factoryCosts.errors.invalidAmount', 'Kwota musi być większa od zera'));
        return;
      }

      if (formData.startDate > formData.endDate) {
        showError(t('factoryCosts.errors.invalidDateRange', 'Data początkowa musi być wcześniejsza od daty końcowej'));
        return;
      }

      let savedCostId;
      if (editingCost) {
        await updateFactoryCost(editingCost.id, formData);
        savedCostId = editingCost.id;
        showSuccess(t('factoryCosts.notifications.costUpdated', 'Koszt został zaktualizowany'));
      } else {
        const result = await addFactoryCost(formData, currentUser?.uid);
        savedCostId = result.id;
        showSuccess(t('factoryCosts.notifications.costAdded', 'Koszt został dodany'));
      }

      // Aktualizuj koszty zakładu w zadaniach produkcyjnych
      if (savedCostId) {
        try {
          console.log(`[FACTORY COST] Aktualizacja kosztów zakładu w zadaniach dla ${savedCostId}...`);
          const tasksResult = await updateFactoryCostInTasks(savedCostId);
          console.log(`[FACTORY COST] Zaktualizowano ${tasksResult.updated} zadań`);
        } catch (taskError) {
          console.error('Błąd podczas aktualizacji kosztów w zadaniach:', taskError);
          // Nie pokazuj błędu użytkownikowi - główna operacja się powiodła
        }
      }

      handleCloseDialog();
      await fetchData();
    } catch (error) {
      console.error('Błąd podczas zapisywania kosztu:', error);
      showError(t('factoryCosts.errors.saveCost', 'Błąd podczas zapisywania kosztu'));
    }
  };

  // Otwieranie dialogu usuwania
  const handleOpenDeleteDialog = (cost) => {
    setCostToDelete(cost);
    setDeleteDialogOpen(true);
  };

  // Usuwanie kosztu
  const handleDeleteCost = async () => {
    try {
      if (costToDelete) {
        await deleteFactoryCost(costToDelete.id);
        showSuccess(t('factoryCosts.notifications.costDeleted', 'Koszt został usunięty'));
        setDeleteDialogOpen(false);
        setCostToDelete(null);
        await fetchData();
      }
    } catch (error) {
      console.error('Błąd podczas usuwania kosztu:', error);
      showError(t('factoryCosts.errors.deleteCost', 'Błąd podczas usuwania kosztu'));
    }
  };

  // Formatowanie waluty
  const formatCurrency = (value) => {
    return new Intl.NumberFormat('pl-PL', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value || 0);
  };

  // Formatowanie czasu
  const formatTime = (minutes) => {
    if (!minutes) return '0 min';
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    if (hours > 0) {
      return `${hours}h ${mins}min`;
    }
    return `${mins} min`;
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={pl}>
      <Box>
        {/* Nagłówek */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
          <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <FactoryIcon color="primary" />
            {t('factoryCosts.title', 'Koszty zakładu')}
          </Typography>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Tooltip title={t('common.refresh', 'Odśwież')}>
              <span>
                <IconButton onClick={fetchData} disabled={loading || recalculating}>
                  <RefreshIcon />
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip title={t('factoryCosts.recalculateAll', 'Przelicz wszystkie koszty')}>
              <span>
                <Button
                  variant="outlined"
                  startIcon={recalculating ? <CircularProgress size={16} /> : <CalculateIcon />}
                  onClick={handleRecalculateAll}
                  disabled={loading || recalculating || costs.length === 0}
                  size="small"
                >
                  {t('factoryCosts.recalculate', 'Przelicz')}
                </Button>
              </span>
            </Tooltip>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={handleOpenAddDialog}
            >
              {t('factoryCosts.addCost', 'Dodaj koszt')}
            </Button>
          </Box>
        </Box>

        {/* Alert informacyjny */}
        <Alert severity="info" sx={{ mb: 3 }}>
          {t('factoryCosts.infoAlert', 'Koszt na minutę jest obliczany na podstawie efektywnego czasu pracy w zakresie dat każdego kosztu. Nakładające się sesje produkcyjne są automatycznie łączone, aby uniknąć podwójnego liczenia czasu.')}
        </Alert>

        {/* Tabela kosztów */}
        <Paper sx={{ overflow: 'hidden' }}>
          <Box sx={{ p: 2, borderBottom: `1px solid ${theme.palette.divider}` }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 500 }}>
              {t('factoryCosts.costsList', 'Lista kosztów zakładu')}
            </Typography>
          </Box>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>{t('factoryCosts.table.period', 'Okres')}</TableCell>
                  <TableCell align="right">{t('factoryCosts.table.amount', 'Kwota')}</TableCell>
                  <TableCell align="right">{t('factoryCosts.table.effectiveTime', 'Efektywny czas')}</TableCell>
                  <TableCell align="right">{t('factoryCosts.table.costPerMinute', 'Koszt/min')}</TableCell>
                  <TableCell align="center">{t('factoryCosts.table.status', 'Status')}</TableCell>
                  <TableCell>{t('factoryCosts.table.description', 'Opis')}</TableCell>
                  <TableCell align="center">{t('factoryCosts.table.actions', 'Akcje')}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {costs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} align="center" sx={{ py: 4 }}>
                      <Typography color="text.secondary">
                        {t('factoryCosts.noCosts', 'Brak wpisów kosztów zakładu')}
                      </Typography>
                      <Button
                        variant="outlined"
                        startIcon={<AddIcon />}
                        onClick={handleOpenAddDialog}
                        sx={{ mt: 2 }}
                      >
                        {t('factoryCosts.addFirstCost', 'Dodaj pierwszy koszt')}
                      </Button>
                    </TableCell>
                  </TableRow>
                ) : (
                  costs.map((cost) => (
                    <TableRow key={cost.id} hover>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <CalendarIcon fontSize="small" color="action" />
                          <Box>
                            <Typography variant="body2">
                              {format(cost.startDate, 'dd.MM.yyyy')} - {format(cost.endDate, 'dd.MM.yyyy')}
                            </Typography>
                          </Box>
                        </Box>
                      </TableCell>
                      <TableCell align="right">
                        <Chip
                          label={formatCurrency(cost.amount)}
                          color="primary"
                          size="small"
                          sx={{ fontWeight: 600 }}
                        />
                      </TableCell>
                      <TableCell align="right">
                        <Tooltip title={`${cost.sessionsCount || 0} ${t('factoryCosts.sessions', 'sesji')} → ${cost.mergedPeriodsCount || 0} ${t('factoryCosts.periods', 'okresów')}`}>
                          <Box>
                            <Typography variant="body2" sx={{ fontWeight: 500 }}>
                              {cost.effectiveHours ? `${cost.effectiveHours}h` : '0h'}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {formatTime(cost.effectiveMinutes)}
                            </Typography>
                          </Box>
                        </Tooltip>
                      </TableCell>
                      <TableCell align="right">
                        <Tooltip title={`${formatCurrency(cost.costPerHour || 0)}/h`}>
                          <Chip
                            label={formatCurrency(cost.costPerMinute || 0)}
                            color={cost.costPerMinute > 0 ? 'success' : 'default'}
                            size="small"
                            sx={{ fontWeight: 600 }}
                          />
                        </Tooltip>
                      </TableCell>
                      <TableCell align="center">
                        <Chip
                          label={cost.isPaid !== false 
                            ? t('factoryCosts.status.paid', 'Opłacone') 
                            : t('factoryCosts.status.unpaid', 'Nieopłacone')
                          }
                          color={cost.isPaid !== false ? 'success' : 'warning'}
                          size="small"
                        />
                      </TableCell>
                      <TableCell>
                        <Box>
                          <Typography variant="body2" color="text.secondary">
                            {cost.description || '-'}
                          </Typography>
                          {cost.excludedTaskIds?.length > 0 && (
                            <Tooltip title={t('factoryCosts.table.excludedTasks', 'Wykluczone MO z kalkulacji')}>
                              <Chip
                                icon={<FilterIcon />}
                                label={`${cost.excludedTaskIds.length} ${t('factoryCosts.excluded', 'wyklucz.')}`}
                                size="small"
                                color="warning"
                                variant="outlined"
                                sx={{ mt: 0.5 }}
                              />
                            </Tooltip>
                          )}
                        </Box>
                      </TableCell>
                      <TableCell align="center">
                        <Tooltip title={t('common.edit', 'Edytuj')}>
                          <IconButton size="small" onClick={() => handleOpenEditDialog(cost)}>
                            <EditIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title={t('common.delete', 'Usuń')}>
                          <IconButton 
                            size="small" 
                            color="error"
                            onClick={() => handleOpenDeleteDialog(cost)}
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>

        {/* Dialog dodawania/edycji */}
        <Dialog open={dialogOpen} onClose={handleCloseDialog} maxWidth="md" fullWidth>
          <DialogTitle>
            {editingCost 
              ? t('factoryCosts.dialog.editTitle', 'Edytuj koszt zakładu')
              : t('factoryCosts.dialog.addTitle', 'Dodaj koszt zakładu')
            }
          </DialogTitle>
          <DialogContent>
            <Box sx={{ pt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                  <DatePicker
                    label={t('factoryCosts.dialog.startDate', 'Data od')}
                    value={formData.startDate}
                    onChange={(date) => handleDateChange('startDate', date)}
                    slotProps={{ textField: { fullWidth: true } }}
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <DatePicker
                    label={t('factoryCosts.dialog.endDate', 'Data do')}
                    value={formData.endDate}
                    onChange={(date) => handleDateChange('endDate', date)}
                    slotProps={{ textField: { fullWidth: true } }}
                  />
                </Grid>
              </Grid>
              <TextField
                label={t('factoryCosts.dialog.amount', 'Kwota')}
                type="number"
                value={formData.amount}
                onChange={(e) => setFormData(prev => ({ ...prev, amount: e.target.value }))}
                fullWidth
                required
                InputProps={{
                  endAdornment: <InputAdornment position="end">EUR</InputAdornment>
                }}
              />
              <TextField
                label={t('factoryCosts.dialog.description', 'Opis (opcjonalnie)')}
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                fullWidth
                multiline
                rows={2}
              />
              
              {/* Status płatności */}
              <FormControlLabel
                control={
                  <Checkbox
                    checked={formData.isPaid}
                    onChange={(e) => setFormData(prev => ({ ...prev, isPaid: e.target.checked }))}
                    color="success"
                  />
                }
                label={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography>
                      {t('factoryCosts.dialog.isPaid', 'Opłacone')}
                    </Typography>
                    <Chip 
                      label={formData.isPaid ? t('common.yes', 'Tak') : t('common.no', 'Nie')}
                      size="small"
                      color={formData.isPaid ? 'success' : 'warning'}
                    />
                  </Box>
                }
              />
              
              {/* Sekcja wykluczeń MO/CO */}
              <Accordion defaultExpanded={formData.excludedTaskIds?.length > 0}>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <FilterIcon color="action" fontSize="small" />
                    <Typography>
                      {t('factoryCosts.dialog.exclusions', 'Wykluczone MO z kalkulacji')}
                    </Typography>
                    {formData.excludedTaskIds?.length > 0 && (
                      <Badge 
                        badgeContent={formData.excludedTaskIds.length} 
                        color="warning"
                        sx={{ ml: 1 }}
                      />
                    )}
                  </Box>
                </AccordionSummary>
                <AccordionDetails>
                  {loadingTasks ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
                      <CircularProgress size={24} />
                    </Box>
                  ) : availableTasks.length === 0 ? (
                    <Alert severity="info" sx={{ mb: 0 }}>
                      {t('factoryCosts.dialog.noTasksInRange', 'Brak zadań produkcyjnych w wybranym zakresie dat')}
                    </Alert>
                  ) : (
                    <FormControl component="fieldset" fullWidth>
                      <FormLabel component="legend" sx={{ mb: 1 }}>
                        {t('factoryCosts.dialog.selectToExclude', 'Zaznacz MO do wykluczenia z kalkulacji efektywnego czasu:')}
                      </FormLabel>
                      <FormGroup>
                        <TableContainer sx={{ maxHeight: 300 }}>
                          <Table size="small" stickyHeader>
                            <TableHead>
                              <TableRow>
                                <TableCell padding="checkbox"></TableCell>
                                <TableCell>{t('factoryCosts.dialog.moNumber', 'Nr MO')}</TableCell>
                                <TableCell>{t('factoryCosts.dialog.product', 'Produkt')}</TableCell>
                                <TableCell>{t('factoryCosts.dialog.orderNumber', 'Nr CO')}</TableCell>
                                <TableCell align="right">{t('factoryCosts.dialog.time', 'Czas')}</TableCell>
                              </TableRow>
                            </TableHead>
                            <TableBody>
                              {availableTasks.map((task) => (
                                <TableRow 
                                  key={task.taskId}
                                  hover
                                  onClick={() => handleExclusionToggle(task.taskId)}
                                  sx={{ 
                                    cursor: 'pointer',
                                    bgcolor: formData.excludedTaskIds?.includes(task.taskId) 
                                      ? 'action.selected' 
                                      : 'inherit'
                                  }}
                                >
                                  <TableCell padding="checkbox">
                                    <Checkbox
                                      checked={formData.excludedTaskIds?.includes(task.taskId) || false}
                                      onChange={() => handleExclusionToggle(task.taskId)}
                                    />
                                  </TableCell>
                                  <TableCell>
                                    <Typography variant="body2" fontWeight={500}>
                                      {task.moNumber}
                                    </Typography>
                                  </TableCell>
                                  <TableCell>
                                    <Typography variant="body2" noWrap sx={{ maxWidth: 200 }}>
                                      {task.productName}
                                    </Typography>
                                  </TableCell>
                                  <TableCell>
                                    {task.orderNumber ? (
                                      <Chip 
                                        label={task.orderNumber} 
                                        size="small" 
                                        variant="outlined"
                                      />
                                    ) : (
                                      <Typography variant="body2" color="text.secondary">-</Typography>
                                    )}
                                  </TableCell>
                                  <TableCell align="right">
                                    <Typography variant="body2">
                                      {task.totalHours}h ({task.sessionsCount} {t('factoryCosts.sessions', 'sesji')})
                                    </Typography>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </TableContainer>
                      </FormGroup>
                      {formData.excludedTaskIds?.length > 0 && (
                        <Alert severity="warning" sx={{ mt: 2 }}>
                          {t('factoryCosts.dialog.excludedInfo', 
                            `Wykluczone zostaną sesje z ${formData.excludedTaskIds.length} zadań produkcyjnych`
                          )}
                        </Alert>
                      )}
                    </FormControl>
                  )}
                </AccordionDetails>
              </Accordion>
            </Box>
          </DialogContent>
          <DialogActions>
            <Button onClick={handleCloseDialog}>
              {t('common.cancel', 'Anuluj')}
            </Button>
            <Button variant="contained" onClick={handleSaveCost}>
              {editingCost ? t('common.save', 'Zapisz') : t('factoryCosts.dialog.add', 'Dodaj')}
            </Button>
          </DialogActions>
        </Dialog>

        {/* Dialog potwierdzenia usunięcia */}
        <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
          <DialogTitle>
            {t('factoryCosts.deleteDialog.title', 'Potwierdzenie usunięcia')}
          </DialogTitle>
          <DialogContent>
            <Typography>
              {t('factoryCosts.deleteDialog.message', 'Czy na pewno chcesz usunąć ten wpis kosztu zakładu?')}
            </Typography>
            {costToDelete && (
              <Box sx={{ mt: 2, p: 2, bgcolor: 'action.hover', borderRadius: 1 }}>
                <Typography variant="body2">
                  <strong>{t('factoryCosts.table.period', 'Okres')}:</strong>{' '}
                  {format(costToDelete.startDate, 'dd.MM.yyyy')} - {format(costToDelete.endDate, 'dd.MM.yyyy')}
                </Typography>
                <Typography variant="body2">
                  <strong>{t('factoryCosts.table.amount', 'Kwota')}:</strong>{' '}
                  {formatCurrency(costToDelete.amount)}
                </Typography>
              </Box>
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDeleteDialogOpen(false)}>
              {t('common.cancel', 'Anuluj')}
            </Button>
            <Button variant="contained" color="error" onClick={handleDeleteCost}>
              {t('common.delete', 'Usuń')}
            </Button>
          </DialogActions>
        </Dialog>
      </Box>
    </LocalizationProvider>
  );
};

export default FactoryCostsTab;
