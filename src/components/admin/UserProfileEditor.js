import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Typography,
  Box,
  Grid,
  Avatar,
  Divider,
  CircularProgress
} from '@mui/material';
import {
  Edit as EditIcon,
  Person as PersonIcon
} from '@mui/icons-material';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';
import { updateUserProfile } from '../../services/userService';

/**
 * Komponent do edycji danych profilu użytkownika
 */
const UserProfileEditor = ({ open, onClose, selectedUser, onUserUpdated }) => {
  const [formData, setFormData] = useState({
    displayName: '',
    email: '',
    photoURL: '',
    phone: '',
    position: '',
    department: '',
    employeeId: ''
  });
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  
  const { currentUser } = useAuth();
  const { showSuccess, showError } = useNotification();
  
  // Ładowanie danych użytkownika przy otwarciu dialogu
  useEffect(() => {
    if (open && selectedUser) {
      setFormData({
        displayName: selectedUser.displayName || '',
        email: selectedUser.email || '',
        photoURL: selectedUser.photoURL || '',
        phone: selectedUser.phone || '',
        position: selectedUser.position || '',
        department: selectedUser.department || '',
        employeeId: selectedUser.employeeId || ''
      });
      setErrors({});
    }
  }, [open, selectedUser]);
  
  const handleInputChange = (field) => (event) => {
    const value = event.target.value;
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
    
    // Wyczyść błąd dla tego pola
    if (errors[field]) {
      setErrors(prev => ({
        ...prev,
        [field]: ''
      }));
    }
  };
  
  const validateForm = () => {
    const newErrors = {};
    
    // Sprawdź wymagane pola
    if (!formData.displayName.trim()) {
      newErrors.displayName = 'Nazwa użytkownika jest wymagana';
    }
    
    if (!formData.email.trim()) {
      newErrors.email = 'Adres email jest wymagany';
    } else {
      // Sprawdź format email
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(formData.email)) {
        newErrors.email = 'Nieprawidłowy format adresu email';
      }
    }
    
    // Sprawdź URL zdjęcia (jeśli podano)
    if (formData.photoURL && formData.photoURL.trim()) {
      try {
        new URL(formData.photoURL);
      } catch {
        newErrors.photoURL = 'Nieprawidłowy URL zdjęcia profilowego';
      }
    }
    
    // Sprawdź telefon (jeśli podano)
    if (formData.phone && formData.phone.trim()) {
      const phoneRegex = /^[\+]?[0-9\s\-\(\)]{9,}$/;
      if (!phoneRegex.test(formData.phone)) {
        newErrors.phone = 'Nieprawidłowy format numeru telefonu';
      }
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };
  
  const handleSave = async () => {
    if (!selectedUser || !validateForm()) return;
    
    setSaving(true);
    try {
      // Sprawdź czy dane się zmieniły
      const hasChanges = Object.keys(formData).some(key => 
        formData[key] !== (selectedUser[key] || '')
      );
      
      if (!hasChanges) {
        showSuccess('Brak zmian do zapisania');
        onClose();
        return;
      }
      
      // Upewnij się, że employeeId jest uppercase
      const dataToSave = {
        ...formData,
        employeeId: formData.employeeId ? formData.employeeId.toUpperCase().trim() : ''
      };
      await updateUserProfile(selectedUser.id, dataToSave, currentUser.uid);
      showSuccess(`Dane użytkownika ${formData.displayName} zostały zaktualizowane`);
      
      // Wywołaj callback do odświeżenia listy użytkowników
      if (onUserUpdated) {
        onUserUpdated();
      }
      
      onClose();
    } catch (error) {
      console.error('Błąd podczas zapisywania danych użytkownika:', error);
      showError(error.message || 'Nie udało się zapisać danych użytkownika');
    } finally {
      setSaving(false);
    }
  };
  
  const handleClose = () => {
    setFormData({
      displayName: '',
      email: '',
      photoURL: '',
      phone: '',
      position: '',
      department: '',
      employeeId: ''
    });
    setErrors({});
    onClose();
  };
  
  return (
    <Dialog 
      open={open} 
      onClose={handleClose}
      maxWidth="md"
      fullWidth
    >
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <EditIcon sx={{ mr: 1 }} />
          Edycja danych użytkownika
        </Box>
      </DialogTitle>
      
      <DialogContent dividers>
        {selectedUser && (
          <Box sx={{ mb: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
              <Avatar 
                src={formData.photoURL} 
                sx={{ width: 64, height: 64, mr: 2 }}
              >
                <PersonIcon />
              </Avatar>
              <Box>
                <Typography variant="h6">
                  {selectedUser.displayName || selectedUser.email}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  ID: {selectedUser.id}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Rola: {selectedUser.role === 'administrator' ? 'Administrator' : 'Pracownik'}
                </Typography>
              </Box>
            </Box>
          </Box>
        )}
        
        <Divider sx={{ mb: 3 }} />
        
        <Grid container spacing={3}>
          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              label="Nazwa użytkownika"
              value={formData.displayName}
              onChange={handleInputChange('displayName')}
              error={!!errors.displayName}
              helperText={errors.displayName}
              required
            />
          </Grid>
          
          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              label="Adres email"
              type="email"
              value={formData.email}
              onChange={handleInputChange('email')}
              error={!!errors.email}
              helperText={errors.email}
              required
            />
          </Grid>
          
          <Grid item xs={12}>
            <TextField
              fullWidth
              label="URL zdjęcia profilowego"
              value={formData.photoURL}
              onChange={handleInputChange('photoURL')}
              error={!!errors.photoURL}
              helperText={errors.photoURL || 'Wprowadź URL do zdjęcia profilowego'}
              placeholder="https://example.com/avatar.jpg"
            />
          </Grid>
          
          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              label="ID pracownika"
              value={formData.employeeId}
              onChange={handleInputChange('employeeId')}
              error={!!errors.employeeId}
              helperText={errors.employeeId || 'Unikalny identyfikator do rejestracji czasu pracy i grafiku (np. BGW-001)'}
              placeholder="np. BGW-001"
              InputProps={{
                style: { textTransform: 'uppercase' }
              }}
            />
          </Grid>

          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              label="Numer telefonu"
              value={formData.phone}
              onChange={handleInputChange('phone')}
              error={!!errors.phone}
              helperText={errors.phone}
              placeholder="+48 123 456 789"
            />
          </Grid>
          
          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              label="Stanowisko"
              value={formData.position}
              onChange={handleInputChange('position')}
              placeholder="np. Specjalista ds. produkcji"
            />
          </Grid>
          
          <Grid item xs={12}>
            <TextField
              fullWidth
              label="Dział"
              value={formData.department}
              onChange={handleInputChange('department')}
              placeholder="np. Produkcja, Logistyka, Administracja"
            />
          </Grid>
        </Grid>
        
        <Box sx={{ mt: 3 }}>
          <Typography variant="body2" color="text.secondary">
            <strong>Uwaga:</strong> Zmiana adresu email może wpłynąć na możliwość logowania użytkownika.
            Upewnij się, że podany adres jest prawidłowy i aktualny.
          </Typography>
        </Box>
      </DialogContent>
      
      <DialogActions>
        <Button 
          onClick={handleClose} 
          disabled={saving}
        >
          Anuluj
        </Button>
        <Button 
          onClick={handleSave} 
          variant="contained" 
          disabled={saving || !selectedUser}
        >
          {saving ? <CircularProgress size={24} /> : 'Zapisz zmiany'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default UserProfileEditor; 