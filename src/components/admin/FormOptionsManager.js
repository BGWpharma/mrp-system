import React, { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  CardActions,
  Button,
  Typography,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Box,
  Chip,
  Alert,
  CircularProgress,
  Switch,
  FormControlLabel,
  Divider,
  Grid
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  DragIndicator as DragIcon,
  Upload as UploadIcon,
  Refresh as RefreshIcon
} from '@mui/icons-material';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';
import {
  getAllFormOptions,
  addFormOption,
  updateFormOption,
  deleteFormOption,
  migrateFormOptions,
  FORM_OPTION_TYPES,
  FORM_OPTION_CATEGORIES
} from '../../services/formOptionsService';

const FormOptionsManager = () => {
  const { currentUser } = useAuth();
  const { showSuccess, showError } = useNotification();
  
  const [selectedType, setSelectedType] = useState(FORM_OPTION_TYPES.STAFF);
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingOption, setEditingOption] = useState(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [optionToDelete, setOptionToDelete] = useState(null);
  const [migrationDialogOpen, setMigrationDialogOpen] = useState(false);
  
  const [formData, setFormData] = useState({
    value: '',
    order: 0,
    isActive: true
  });

  // Istniejące opcje z kodu do migracji
  const LEGACY_OPTIONS = {
    [FORM_OPTION_TYPES.STAFF]: [
      "Valentyna Tarasiuk",
      "Seweryn Burandt", 
      "Łukasz Bojke",
      "Mariia Pokrovets"
    ],
    [FORM_OPTION_TYPES.POSITIONS]: [
      "Mistrz produkcji",
      "Kierownik Magazynu"
    ],
    [FORM_OPTION_TYPES.SHIFT_WORKERS]: [
      "Luis Carlos Tapiero",
      "Ewa Bojke",
      "Maria Angelica Bermudez",
      "Mariia Pokrovets",
      "Valentyna Tarasiuk",
      "Daria Shadiuk"
    ],
    [FORM_OPTION_TYPES.INVENTORY_EMPLOYEES]: [
      "Łukasz Bojke"
    ],
    [FORM_OPTION_TYPES.INVENTORY_POSITIONS]: [
      "Magazynier"
    ]
  };

  useEffect(() => {
    fetchOptions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedType]);

  const fetchOptions = async () => {
    try {
      setLoading(true);
      const data = await getAllFormOptions(selectedType);
      setOptions(data);
    } catch (error) {
      showError('Błąd podczas pobierania opcji: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleTypeChange = (event) => {
    setSelectedType(event.target.value);
  };

  const handleAddNew = () => {
    setEditingOption(null);
    setFormData({
      value: '',
      order: options.length,
      isActive: true
    });
    setDialogOpen(true);
  };

  const handleEdit = (option) => {
    setEditingOption(option);
    setFormData({
      value: option.value,
      order: option.order,
      isActive: option.isActive
    });
    setDialogOpen(true);
  };

  const handleDelete = (option) => {
    setOptionToDelete(option);
    setDeleteDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.value.trim()) {
      showError('Wartość opcji nie może być pusta');
      return;
    }

    try {
      if (editingOption) {
        await updateFormOption(editingOption.id, formData, currentUser.uid);
        showSuccess('Opcja została zaktualizowana');
      } else {
        await addFormOption(selectedType, formData.value, formData.order, currentUser.uid);
        showSuccess('Opcja została dodana');
      }
      
      setDialogOpen(false);
      fetchOptions();
    } catch (error) {
      showError('Błąd podczas zapisywania opcji: ' + error.message);
    }
  };

  const handleConfirmDelete = async () => {
    try {
      await deleteFormOption(optionToDelete.id);
      showSuccess('Opcja została usunięta');
      setDeleteDialogOpen(false);
      setOptionToDelete(null);
      fetchOptions();
    } catch (error) {
      showError('Błąd podczas usuwania opcji: ' + error.message);
    }
  };

  const handleMigrate = async () => {
    try {
      const legacyOptions = LEGACY_OPTIONS[selectedType] || [];
      if (legacyOptions.length === 0) {
        showError('Brak opcji do migracji dla tego typu');
        return;
      }

      const result = await migrateFormOptions(selectedType, legacyOptions, currentUser.uid);
      
      if (result.success) {
        showSuccess(result.message);
        fetchOptions();
      } else {
        showError(result.message);
      }
      
      setMigrationDialogOpen(false);
    } catch (error) {
      showError('Błąd podczas migracji: ' + error.message);
    }
  };

  const handleFormChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  return (
    <Card sx={{ mb: 3 }}>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          Zarządzanie opcjami formularzy
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Zarządzaj opcjami wyboru w formularzach produkcyjnych. Opcje są używane w polach typu select.
        </Typography>
        
        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid item xs={12} sm={6}>
            <FormControl fullWidth>
              <InputLabel>Kategoria opcji</InputLabel>
              <Select
                value={selectedType}
                onChange={handleTypeChange}
                label="Kategoria opcji"
              >
                {Object.entries(FORM_OPTION_CATEGORIES).map(([key, label]) => (
                  <MenuItem key={key} value={key}>
                    {label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={6}>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={handleAddNew}
                sx={{ flexGrow: 1 }}
              >
                Dodaj opcję
              </Button>
              <Button
                variant="outlined"
                startIcon={<UploadIcon />}
                onClick={() => setMigrationDialogOpen(true)}
                disabled={!LEGACY_OPTIONS[selectedType]?.length}
              >
                Migruj
              </Button>
              <Button
                variant="outlined"
                startIcon={<RefreshIcon />}
                onClick={fetchOptions}
              >
                Odśwież
              </Button>
            </Box>
          </Grid>
        </Grid>

        <Divider sx={{ mb: 2 }} />

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
            <CircularProgress />
          </Box>
        ) : options.length === 0 ? (
          <Alert severity="info">
            Brak opcji dla wybranej kategorii. Dodaj pierwszą opcję lub użyj migracji.
          </Alert>
        ) : (
          <List>
            {options.map((option, index) => (
              <ListItem key={option.id} divider={index < options.length - 1}>
                <DragIcon sx={{ mr: 1, color: 'text.secondary' }} />
                <ListItemText
                  primary={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      {option.value}
                      {!option.isActive && (
                        <Chip label="Nieaktywna" size="small" color="default" />
                      )}
                    </Box>
                  }
                  secondary={`Kolejność: ${option.order}`}
                />
                <ListItemSecondaryAction>
                  <IconButton
                    edge="end"
                    aria-label="edit"
                    onClick={() => handleEdit(option)}
                    sx={{ mr: 1 }}
                  >
                    <EditIcon />
                  </IconButton>
                  <IconButton
                    edge="end"
                    aria-label="delete"
                    onClick={() => handleDelete(option)}
                  >
                    <DeleteIcon />
                  </IconButton>
                </ListItemSecondaryAction>
              </ListItem>
            ))}
          </List>
        )}
      </CardContent>

      {/* Dialog dodawania/edycji opcji */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          {editingOption ? 'Edytuj opcję' : 'Dodaj nową opcję'}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2 }}>
            <TextField
              autoFocus
              label="Wartość opcji"
              fullWidth
              value={formData.value}
              onChange={(e) => handleFormChange('value', e.target.value)}
              sx={{ mb: 2 }}
              required
            />
            <TextField
              label="Kolejność"
              type="number"
              fullWidth
              value={formData.order}
              onChange={(e) => handleFormChange('order', parseInt(e.target.value) || 0)}
              sx={{ mb: 2 }}
            />
            <FormControlLabel
              control={
                <Switch
                  checked={formData.isActive}
                  onChange={(e) => handleFormChange('isActive', e.target.checked)}
                />
              }
              label="Opcja aktywna"
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>
            Anuluj
          </Button>
          <Button onClick={handleSave} variant="contained">
            {editingOption ? 'Zapisz' : 'Dodaj'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog potwierdzenia usunięcia */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>Potwierdź usunięcie</DialogTitle>
        <DialogContent>
          <Typography>
            Czy na pewno chcesz usunąć opcję "{optionToDelete?.value}"?
          </Typography>
          <Alert severity="warning" sx={{ mt: 2 }}>
            Ta operacja jest nieodwracalna. Opcja zostanie usunięta ze wszystkich formularzy.
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>
            Anuluj
          </Button>
          <Button onClick={handleConfirmDelete} color="error" variant="contained">
            Usuń
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog migracji */}
      <Dialog open={migrationDialogOpen} onClose={() => setMigrationDialogOpen(false)}>
        <DialogTitle>Migracja opcji z kodu</DialogTitle>
        <DialogContent>
          <Typography sx={{ mb: 2 }}>
            Czy chcesz zmigrować istniejące opcje z kodu do bazy danych?
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Kategoria: {FORM_OPTION_CATEGORIES[selectedType]}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Opcje do migracji: {LEGACY_OPTIONS[selectedType]?.length || 0}
          </Typography>
          <Alert severity="info" sx={{ mt: 2 }}>
            Migracja doda tylko te opcje, które jeszcze nie istnieją w bazie danych.
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setMigrationDialogOpen(false)}>
            Anuluj
          </Button>
          <Button onClick={handleMigrate} variant="contained">
            Migruj opcje
          </Button>
        </DialogActions>
      </Dialog>
    </Card>
  );
};

export default FormOptionsManager; 