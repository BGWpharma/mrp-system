// src/components/sales/co-reports/OperationalCostsDialog.js
import React, { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  IconButton,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Chip,
  Divider,
  CircularProgress,
  Alert,
  FormControlLabel,
  Checkbox,
  Tooltip,
  Paper,
  Grid
} from '@mui/material';
import {
  ExpandMore as ExpandMoreIcon,
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Close as CloseIcon,
  Save as SaveIcon,
  Cancel as CancelIcon,
  Settings as SettingsIcon,
  AttachMoney as AttachMoneyIcon,
  CheckCircle as CheckCircleIcon,
  Schedule as ScheduleIcon
} from '@mui/icons-material';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { LocalizationProvider, DatePicker } from '@mui/x-date-pickers';
import { pl } from 'date-fns/locale';
import { useAuth } from '../../../contexts/AuthContext';
import { useNotification } from '../../../hooks/useNotification';
import { useTranslation } from '../../../hooks/useTranslation';
import { formatCurrency } from '../../../utils/formatUtils';
import {
  getOperationalCostsInRange,
  addOperationalCost,
  updateOperationalCost,
  deleteOperationalCost,
  getMonthKeysInRange,
  formatMonthName,
  OPERATIONAL_COST_CATEGORIES,
  getCategoryLabel
} from '../../../services/operationalCostService';

/**
 * Dialog do zarządzania kosztami operacyjnymi per miesiąc
 */
const OperationalCostsDialog = ({ 
  open, 
  onClose, 
  dateFrom, 
  dateTo, 
  onSave,
  currency = 'EUR' 
}) => {
  const { currentUser } = useAuth();
  const { showSuccess, showError } = useNotification();
  const { t } = useTranslation('operationalCosts');

  // Stan danych
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [monthsData, setMonthsData] = useState([]);
  const [expandedMonth, setExpandedMonth] = useState(null);
  const [error, setError] = useState(null);

  // Stan formularza
  const [editMode, setEditMode] = useState(null); // null | { monthKey, costId } | { monthKey, isNew: true }
  const [formData, setFormData] = useState({
    name: '',
    amount: '',
    category: 'other',
    description: '',
    isPaid: false,
    paidDate: null
  });

  // Pobierz dane przy otwarciu dialogu
  useEffect(() => {
    if (open && dateFrom && dateTo) {
      fetchData();
    }
  }, [open, dateFrom, dateTo]);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getOperationalCostsInRange(dateFrom, dateTo);
      setMonthsData(data);
      
      // Rozwiń pierwszy miesiąc z kosztami lub pierwszy miesiąc
      if (data.length > 0) {
        const firstWithCosts = data.find(m => m.costs && m.costs.length > 0);
        setExpandedMonth(firstWithCosts?.id || data[0]?.id);
      }
    } catch (err) {
      console.error('Błąd pobierania kosztów:', err);
      setError('Nie udało się pobrać kosztów operacyjnych');
    } finally {
      setLoading(false);
    }
  };

  const handleAccordionChange = (monthKey) => (event, isExpanded) => {
    setExpandedMonth(isExpanded ? monthKey : null);
    // Zamknij edycję przy zmianie accordion
    if (editMode && editMode.monthKey !== monthKey) {
      handleCancelEdit();
    }
  };

  const handleStartAdd = (monthKey) => {
    setEditMode({ monthKey, isNew: true });
    setFormData({
      name: '',
      amount: '',
      category: 'other',
      description: '',
      isPaid: false,
      paidDate: null
    });
  };

  const handleStartEdit = (monthKey, cost) => {
    setEditMode({ monthKey, costId: cost.id });
    setFormData({
      name: cost.name || '',
      amount: cost.amount?.toString() || '',
      category: cost.category || 'other',
      description: cost.description || '',
      isPaid: cost.isPaid || false,
      paidDate: cost.paidDate?.toDate?.() || cost.paidDate || null
    });
  };

  const handleCancelEdit = () => {
    setEditMode(null);
    setFormData({
      name: '',
      amount: '',
      category: 'other',
      description: '',
      isPaid: false,
      paidDate: null
    });
  };

  const handleFormChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSave = async () => {
    if (!formData.name || !formData.amount) {
      showError('Nazwa i kwota są wymagane');
      return;
    }

    setSaving(true);
    try {
      if (editMode.isNew) {
        await addOperationalCost(editMode.monthKey, formData, currentUser?.uid);
        showSuccess('Dodano koszt operacyjny');
      } else {
        await updateOperationalCost(editMode.monthKey, editMode.costId, formData);
        showSuccess('Zaktualizowano koszt operacyjny');
      }
      
      handleCancelEdit();
      await fetchData();
      
      // Powiadom rodzica o zmianie
      if (onSave) {
        onSave();
      }
    } catch (err) {
      console.error('Błąd zapisywania kosztu:', err);
      showError('Nie udało się zapisać kosztu');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (monthKey, costId, costName) => {
    if (!window.confirm(`Czy na pewno chcesz usunąć koszt "${costName}"?`)) {
      return;
    }

    setSaving(true);
    try {
      await deleteOperationalCost(monthKey, costId);
      showSuccess('Usunięto koszt operacyjny');
      await fetchData();
      
      if (onSave) {
        onSave();
      }
    } catch (err) {
      console.error('Błąd usuwania kosztu:', err);
      showError('Nie udało się usunąć kosztu');
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    handleCancelEdit();
    onClose();
  };

  // Oblicz sumy
  const totals = monthsData.reduce((acc, month) => {
    acc.totalAmount += month.totalAmount || 0;
    acc.totalPaid += month.totalPaid || 0;
    return acc;
  }, { totalAmount: 0, totalPaid: 0 });

  // Formularz edycji/dodawania
  const renderForm = () => (
    <Paper 
      elevation={2} 
      sx={{ 
        p: 2, 
        mt: 2, 
        mb: 2, 
        backgroundColor: 'background.default',
        border: '2px solid',
        borderColor: 'primary.main'
      }}
    >
      <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 600 }}>
        {editMode?.isNew ? '➕ Nowy koszt operacyjny' : '✏️ Edycja kosztu'}
      </Typography>
      
      <Grid container spacing={2}>
        <Grid item xs={12} sm={6}>
          <TextField
            label="Nazwa kosztu *"
            value={formData.name}
            onChange={(e) => handleFormChange('name', e.target.value)}
            fullWidth
            size="small"
            placeholder="np. Czynsz biura"
          />
        </Grid>
        
        <Grid item xs={12} sm={6}>
          <TextField
            label="Kwota (EUR) *"
            value={formData.amount}
            onChange={(e) => handleFormChange('amount', e.target.value)}
            fullWidth
            size="small"
            type="number"
            inputProps={{ min: 0, step: 0.01 }}
            placeholder="0.00"
          />
        </Grid>
        
        <Grid item xs={12} sm={6}>
          <FormControl fullWidth size="small">
            <InputLabel>Kategoria</InputLabel>
            <Select
              value={formData.category}
              label="Kategoria"
              onChange={(e) => handleFormChange('category', e.target.value)}
            >
              {OPERATIONAL_COST_CATEGORIES.map((cat) => (
                <MenuItem key={cat.value} value={cat.value}>
                  {cat.icon} {cat.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Grid>
        
        <Grid item xs={12} sm={6}>
          <TextField
            label="Opis (opcjonalnie)"
            value={formData.description}
            onChange={(e) => handleFormChange('description', e.target.value)}
            fullWidth
            size="small"
            placeholder="Dodatkowe informacje..."
          />
        </Grid>
        
        <Grid item xs={12} sm={6}>
          <FormControlLabel
            control={
              <Checkbox
                checked={formData.isPaid}
                onChange={(e) => handleFormChange('isPaid', e.target.checked)}
                color="success"
              />
            }
            label="Zapłacone"
          />
        </Grid>
        
        {formData.isPaid && (
          <Grid item xs={12} sm={6}>
            <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={pl}>
              <DatePicker
                label="Data zapłaty"
                value={formData.paidDate}
                onChange={(date) => handleFormChange('paidDate', date)}
                slotProps={{ 
                  textField: { 
                    fullWidth: true, 
                    size: 'small' 
                  } 
                }}
              />
            </LocalizationProvider>
          </Grid>
        )}
      </Grid>
      
      <Box sx={{ mt: 2, display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
        <Button
          variant="outlined"
          size="small"
          startIcon={<CancelIcon />}
          onClick={handleCancelEdit}
          disabled={saving}
        >
          Anuluj
        </Button>
        <Button
          variant="contained"
          size="small"
          startIcon={saving ? <CircularProgress size={16} /> : <SaveIcon />}
          onClick={handleSave}
          disabled={saving || !formData.name || !formData.amount}
        >
          {editMode?.isNew ? 'Dodaj' : 'Zapisz'}
        </Button>
      </Box>
    </Paper>
  );

  // Lista kosztów dla miesiąca
  const renderCostsList = (monthData) => {
    const costs = monthData.costs || [];
    const isEditing = editMode?.monthKey === monthData.id;
    
    return (
      <Box>
        {costs.length === 0 && !isEditing && (
          <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
            Brak kosztów operacyjnych dla tego miesiąca
          </Typography>
        )}
        
        {costs.length > 0 && (
          <List dense disablePadding>
            {costs.map((cost, index) => {
              const category = getCategoryLabel(cost.category);
              const isEditingThis = editMode?.costId === cost.id;
              
              if (isEditingThis) {
                return (
                  <Box key={cost.id}>
                    {renderForm()}
                  </Box>
                );
              }
              
              return (
                <React.Fragment key={cost.id}>
                  {index > 0 && <Divider />}
                  <ListItem 
                    sx={{ 
                      py: 1.5,
                      '&:hover': { backgroundColor: 'action.hover' }
                    }}
                  >
                    <ListItemText
                      primary={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Typography variant="body2" sx={{ fontWeight: 500 }}>
                            {category.icon} {cost.name}
                          </Typography>
                          <Chip
                            label={category.label}
                            size="small"
                            variant="outlined"
                            sx={{ fontSize: '0.7rem', height: 20 }}
                          />
                          {cost.isPaid ? (
                            <Chip
                              icon={<CheckCircleIcon sx={{ fontSize: 14 }} />}
                              label="Zapłacone"
                              size="small"
                              color="success"
                              sx={{ fontSize: '0.7rem', height: 20 }}
                            />
                          ) : (
                            <Chip
                              icon={<ScheduleIcon sx={{ fontSize: 14 }} />}
                              label="Do zapłaty"
                              size="small"
                              color="warning"
                              sx={{ fontSize: '0.7rem', height: 20 }}
                            />
                          )}
                        </Box>
                      }
                      secondary={
                        <Box sx={{ mt: 0.5 }}>
                          <Typography variant="body2" color="primary.main" fontWeight="bold">
                            {formatCurrency(cost.amount, currency)}
                          </Typography>
                          {cost.description && (
                            <Typography variant="caption" color="text.secondary">
                              {cost.description}
                            </Typography>
                          )}
                        </Box>
                      }
                    />
                    <ListItemSecondaryAction>
                      <Tooltip title="Edytuj">
                        <IconButton
                          size="small"
                          onClick={() => handleStartEdit(monthData.id, cost)}
                          disabled={saving || editMode !== null}
                        >
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Usuń">
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => handleDelete(monthData.id, cost.id, cost.name)}
                          disabled={saving || editMode !== null}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </ListItemSecondaryAction>
                  </ListItem>
                </React.Fragment>
              );
            })}
          </List>
        )}
        
        {/* Formularz dodawania nowego kosztu */}
        {isEditing && editMode.isNew && renderForm()}
        
        {/* Przycisk dodawania */}
        {!isEditing && (
          <Box sx={{ mt: 2, textAlign: 'center' }}>
            <Button
              variant="outlined"
              size="small"
              startIcon={<AddIcon />}
              onClick={() => handleStartAdd(monthData.id)}
              disabled={saving || editMode !== null}
            >
              Dodaj koszt operacyjny
            </Button>
          </Box>
        )}
      </Box>
    );
  };

  return (
    <Dialog 
      open={open} 
      onClose={handleClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: { minHeight: '60vh' }
      }}
    >
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <SettingsIcon color="primary" />
            <Typography variant="h6">
              Koszty operacyjne
            </Typography>
          </Box>
          <IconButton onClick={handleClose} size="small">
            <CloseIcon />
          </IconButton>
        </Box>
        <Typography variant="body2" color="text.secondary">
          Zarządzaj miesięcznymi kosztami operacyjnymi (czynsz, media, wynagrodzenia itp.)
        </Typography>
      </DialogTitle>
      
      <DialogContent dividers>
        {/* Podsumowanie */}
        <Paper 
          elevation={0} 
          sx={{ 
            p: 2, 
            mb: 3, 
            background: 'linear-gradient(135deg, rgba(79,172,254,0.1) 0%, rgba(0,242,254,0.1) 100%)',
            borderRadius: 2
          }}
        >
          <Grid container spacing={2}>
            <Grid item xs={12} sm={4}>
              <Typography variant="caption" color="text.secondary">
                Okres
              </Typography>
              <Typography variant="body1" fontWeight="bold">
                {dateFrom?.toLocaleDateString('pl-PL')} - {dateTo?.toLocaleDateString('pl-PL')}
              </Typography>
            </Grid>
            <Grid item xs={6} sm={4}>
              <Typography variant="caption" color="text.secondary">
                Łączne koszty
              </Typography>
              <Typography variant="h6" fontWeight="bold" color="error.main">
                {formatCurrency(totals.totalAmount, currency)}
              </Typography>
            </Grid>
            <Grid item xs={6} sm={4}>
              <Typography variant="caption" color="text.secondary">
                W tym zapłacone
              </Typography>
              <Typography variant="h6" fontWeight="bold" color="success.main">
                {formatCurrency(totals.totalPaid, currency)}
              </Typography>
            </Grid>
          </Grid>
        </Paper>

        {/* Ładowanie */}
        {loading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress />
          </Box>
        )}

        {/* Błąd */}
        {error && !loading && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {/* Lista miesięcy */}
        {!loading && !error && (
          <Box>
            {monthsData.map((monthData) => {
              const hasData = monthData.costs && monthData.costs.length > 0;
              
              return (
                <Accordion
                  key={monthData.id}
                  expanded={expandedMonth === monthData.id}
                  onChange={handleAccordionChange(monthData.id)}
                  sx={{ 
                    mb: 1,
                    '&:before': { display: 'none' },
                    boxShadow: 1
                  }}
                >
                  <AccordionSummary
                    expandIcon={<ExpandMoreIcon />}
                    sx={{ 
                      backgroundColor: hasData ? 'rgba(79,172,254,0.05)' : 'background.paper',
                      '&:hover': { backgroundColor: 'action.hover' }
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, width: '100%', pr: 2 }}>
                      <Typography variant="subtitle1" sx={{ fontWeight: 600, minWidth: 150 }}>
                        📅 {formatMonthName(monthData.id)}
                      </Typography>
                      
                      {hasData ? (
                        <>
                          <Chip
                            label={`${monthData.costs.length} ${monthData.costs.length === 1 ? 'koszt' : 'kosztów'}`}
                            size="small"
                            color="primary"
                            variant="outlined"
                          />
                          <Box sx={{ flexGrow: 1 }} />
                          <Typography variant="body2" color="error.main" fontWeight="bold">
                            {formatCurrency(monthData.totalAmount || 0, currency)}
                          </Typography>
                          {monthData.totalPaid > 0 && (
                            <Chip
                              icon={<CheckCircleIcon sx={{ fontSize: 14 }} />}
                              label={formatCurrency(monthData.totalPaid, currency)}
                              size="small"
                              color="success"
                              sx={{ fontSize: '0.7rem' }}
                            />
                          )}
                        </>
                      ) : (
                        <Typography variant="body2" color="text.secondary">
                          Brak kosztów
                        </Typography>
                      )}
                    </Box>
                  </AccordionSummary>
                  
                  <AccordionDetails sx={{ pt: 0 }}>
                    {renderCostsList(monthData)}
                  </AccordionDetails>
                </Accordion>
              );
            })}
          </Box>
        )}
      </DialogContent>
      
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={handleClose} variant="outlined">
          Zamknij
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default OperationalCostsDialog;
