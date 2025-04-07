import React, { useState, useEffect } from 'react';
import {
  Container,
  Typography,
  Paper,
  Button,
  TextField,
  Grid,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  CircularProgress,
  Box,
  Divider,
  Alert,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Stack
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Save as SaveIcon,
  Cancel as CancelIcon,
  ColorLens as ColorLensIcon
} from '@mui/icons-material';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';
import {
  getAllWorkstations,
  createWorkstation,
  updateWorkstation,
  deleteWorkstation
} from '../../services/workstationService';

// Predefiniowane kolory do wyboru
const COLOR_OPTIONS = [
  { name: 'Niebieski', value: '#2196f3' },
  { name: 'Zielony', value: '#4caf50' },
  { name: 'Czerwony', value: '#f44336' },
  { name: 'Pomarańczowy', value: '#ff9800' },
  { name: 'Fioletowy', value: '#9c27b0' },
  { name: 'Turkusowy', value: '#009688' },
  { name: 'Różowy', value: '#e91e63' },
  { name: 'Szary', value: '#9e9e9e' },
  { name: 'Brązowy', value: '#795548' },
  { name: 'Indygo', value: '#3f51b5' },
  { name: 'Cyjan', value: '#00bcd4' },
  { name: 'Limonkowy', value: '#cddc39' }
];

const WorkstationsPage = () => {
  const { currentUser } = useAuth();
  const { showSuccess, showError } = useNotification();
  
  const [workstations, setWorkstations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [currentWorkstation, setCurrentWorkstation] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    machineType: '',
    location: '',
    status: 'Active',
    color: '#2196f3' // Domyślny kolor - niebieski
  });

  // Pobierz wszystkie stanowiska przy ładowaniu strony
  useEffect(() => {
    fetchWorkstations();
  }, []);

  // Pobierz stanowiska z bazy danych
  const fetchWorkstations = async () => {
    try {
      setLoading(true);
      const data = await getAllWorkstations();
      setWorkstations(data);
    } catch (error) {
      showError('Błąd podczas pobierania stanowisk: ' + error.message);
      console.error('Error fetching workstations:', error);
    } finally {
      setLoading(false);
    }
  };

  // Obsługa zmiany pól formularza
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  // Resetuj formularz
  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      machineType: '',
      location: '',
      status: 'Active',
      color: '#2196f3' // Resetuj także kolor
    });
    setCurrentWorkstation(null);
  };

  // Otwórz formularz do dodawania nowego stanowiska
  const handleAddNew = () => {
    resetForm();
    setFormOpen(true);
  };

  // Otwórz formularz do edycji istniejącego stanowiska
  const handleEdit = (workstation) => {
    setCurrentWorkstation(workstation);
    setFormData({
      name: workstation.name || '',
      description: workstation.description || '',
      machineType: workstation.machineType || '',
      location: workstation.location || '',
      status: workstation.status || 'Active',
      color: workstation.color || '#2196f3' // Użyj koloru z danych lub domyślny jeśli brak
    });
    setFormOpen(true);
  };

  // Otwórz dialog potwierdzenia usunięcia
  const handleDeleteConfirm = (workstation) => {
    setCurrentWorkstation(workstation);
    setDeleteDialogOpen(true);
  };

  // Zapisz stanowisko (nowe lub edytowane)
  const handleSave = async () => {
    // Walidacja
    if (!formData.name) {
      showError('Nazwa stanowiska jest wymagana');
      return;
    }

    try {
      if (currentWorkstation) {
        // Aktualizuj istniejące stanowisko
        await updateWorkstation(currentWorkstation.id, formData, currentUser.uid);
        showSuccess('Stanowisko zostało zaktualizowane');
      } else {
        // Dodaj nowe stanowisko
        await createWorkstation(formData, currentUser.uid);
        showSuccess('Stanowisko zostało dodane');
      }
      
      // Odśwież listę stanowisk
      await fetchWorkstations();
      
      // Zamknij formularz
      setFormOpen(false);
      resetForm();
    } catch (error) {
      showError('Błąd podczas zapisywania stanowiska: ' + error.message);
      console.error('Error saving workstation:', error);
    }
  };

  // Usuń stanowisko
  const handleDelete = async () => {
    if (!currentWorkstation) return;
    
    try {
      await deleteWorkstation(currentWorkstation.id);
      showSuccess('Stanowisko zostało usunięte');
      
      // Odśwież listę stanowisk
      await fetchWorkstations();
      
      // Zamknij dialog
      setDeleteDialogOpen(false);
      setCurrentWorkstation(null);
    } catch (error) {
      showError('Błąd podczas usuwania stanowiska: ' + error.message);
      console.error('Error deleting workstation:', error);
    }
  };

  return (
    <Container maxWidth="lg">
      <Box sx={{ my: 4 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          Stanowiska produkcyjne
        </Typography>
        
        <Button
          variant="contained"
          color="primary"
          startIcon={<AddIcon />}
          onClick={handleAddNew}
          sx={{ mb: 3 }}
        >
          Dodaj nowe stanowisko
        </Button>

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', my: 4 }}>
            <CircularProgress />
          </Box>
        ) : (
          <Paper elevation={3} sx={{ p: 2 }}>
            {workstations.length === 0 ? (
              <Alert severity="info">
                Brak zdefiniowanych stanowisk produkcyjnych. Dodaj pierwsze stanowisko, aby rozpocząć.
              </Alert>
            ) : (
              <List>
                {workstations.map((workstation) => (
                  <React.Fragment key={workstation.id}>
                    <ListItem>
                      <Box 
                        sx={{ 
                          width: 16, 
                          height: 16, 
                          bgcolor: workstation.color || '#2196f3',
                          borderRadius: '50%',
                          mr: 2
                        }} 
                      />
                      <ListItemText
                        primary={workstation.name}
                        secondary={
                          <>
                            <Typography variant="body2" component="span">
                              {workstation.machineType && `Typ: ${workstation.machineType} | `}
                              {workstation.location && `Lokalizacja: ${workstation.location} | `}
                              Status: {workstation.status}
                            </Typography>
                            {workstation.description && (
                              <Typography variant="body2" color="textSecondary" display="block">
                                {workstation.description}
                              </Typography>
                            )}
                          </>
                        }
                      />
                      <ListItemSecondaryAction>
                        <IconButton
                          edge="end"
                          aria-label="edit"
                          onClick={() => handleEdit(workstation)}
                          sx={{ mr: 1 }}
                        >
                          <EditIcon />
                        </IconButton>
                        <IconButton
                          edge="end"
                          aria-label="delete"
                          onClick={() => handleDeleteConfirm(workstation)}
                        >
                          <DeleteIcon />
                        </IconButton>
                      </ListItemSecondaryAction>
                    </ListItem>
                    <Divider />
                  </React.Fragment>
                ))}
              </List>
            )}
          </Paper>
        )}

        {/* Formularz dodawania/edycji stanowiska */}
        <Dialog
          open={formOpen}
          onClose={() => setFormOpen(false)}
          fullWidth
          maxWidth="sm"
        >
          <DialogTitle>
            {currentWorkstation ? 'Edytuj stanowisko' : 'Dodaj nowe stanowisko'}
          </DialogTitle>
          <DialogContent>
            <Grid container spacing={2} sx={{ mt: 1 }}>
              <Grid item xs={12}>
                <TextField
                  label="Nazwa stanowiska *"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  fullWidth
                  required
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  label="Opis"
                  name="description"
                  value={formData.description}
                  onChange={handleChange}
                  fullWidth
                  multiline
                  rows={2}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  label="Typ maszyny"
                  name="machineType"
                  value={formData.machineType}
                  onChange={handleChange}
                  fullWidth
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  label="Lokalizacja"
                  name="location"
                  value={formData.location}
                  onChange={handleChange}
                  fullWidth
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth>
                  <InputLabel>Status</InputLabel>
                  <Select
                    name="status"
                    value={formData.status}
                    onChange={handleChange}
                    label="Status"
                  >
                    <MenuItem value="Active">Aktywne</MenuItem>
                    <MenuItem value="Inactive">Nieaktywne</MenuItem>
                    <MenuItem value="Maintenance">W konserwacji</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth>
                  <InputLabel>Kolor w kalendarzu</InputLabel>
                  <Select
                    name="color"
                    value={formData.color}
                    onChange={handleChange}
                    label="Kolor w kalendarzu"
                    renderValue={(selected) => (
                      <Box sx={{ display: 'flex', alignItems: 'center' }}>
                        <Box 
                          sx={{ 
                            width: 20, 
                            height: 20, 
                            bgcolor: selected,
                            borderRadius: '50%',
                            mr: 1
                          }} 
                        />
                        {COLOR_OPTIONS.find(option => option.value === selected)?.name || selected}
                      </Box>
                    )}
                  >
                    {COLOR_OPTIONS.map((option) => (
                      <MenuItem key={option.value} value={option.value}>
                        <Stack direction="row" alignItems="center" spacing={1}>
                          <Box 
                            sx={{ 
                              width: 20, 
                              height: 20, 
                              bgcolor: option.value,
                              borderRadius: '50%'
                            }} 
                          />
                          <Typography>{option.name}</Typography>
                        </Stack>
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
            </Grid>
          </DialogContent>
          <DialogActions>
            <Button
              onClick={() => {
                setFormOpen(false);
                resetForm();
              }}
              startIcon={<CancelIcon />}
            >
              Anuluj
            </Button>
            <Button
              onClick={handleSave}
              color="primary"
              variant="contained"
              startIcon={<SaveIcon />}
            >
              Zapisz
            </Button>
          </DialogActions>
        </Dialog>

        {/* Dialog potwierdzenia usunięcia */}
        <Dialog
          open={deleteDialogOpen}
          onClose={() => setDeleteDialogOpen(false)}
        >
          <DialogTitle>Potwierdź usunięcie</DialogTitle>
          <DialogContent>
            <DialogContentText>
              Czy na pewno chcesz usunąć stanowisko "{currentWorkstation?.name}"? Tej operacji nie można cofnąć.
            </DialogContentText>
          </DialogContent>
          <DialogActions>
            <Button
              onClick={() => setDeleteDialogOpen(false)}
              startIcon={<CancelIcon />}
            >
              Anuluj
            </Button>
            <Button
              onClick={handleDelete}
              color="error"
              variant="contained"
              startIcon={<DeleteIcon />}
            >
              Usuń
            </Button>
          </DialogActions>
        </Dialog>
      </Box>
    </Container>
  );
};

export default WorkstationsPage; 