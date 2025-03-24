import React, { useState, useEffect } from 'react';
import { 
  Container, 
  Typography, 
  Box, 
  Paper, 
  TextField, 
  Button, 
  Grid, 
  FormControl, 
  InputLabel, 
  Select, 
  MenuItem, 
  Divider,
  CircularProgress,
  FormHelperText
} from '@mui/material';
import { 
  Save as SaveIcon, 
  Cancel as CancelIcon, 
  ArrowBack as ArrowBackIcon
} from '@mui/icons-material';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';
import { createContact, getContactById, updateContact } from '../../services/crmService';
import { CRM_CONTACT_TYPES, DEFAULT_CRM_VALUES } from '../../utils/constants';

const ContactFormPage = () => {
  const { contactId } = useParams();
  const isEditMode = !!contactId;
  
  const [formData, setFormData] = useState(DEFAULT_CRM_VALUES.NEW_CONTACT);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});
  
  const { currentUser } = useAuth();
  const { showSuccess, showError } = useNotification();
  const navigate = useNavigate();
  
  useEffect(() => {
    if (isEditMode) {
      fetchContact();
    }
  }, [contactId]);
  
  const fetchContact = async () => {
    try {
      setLoading(true);
      const contact = await getContactById(contactId);
      setFormData(contact);
    } catch (error) {
      console.error('Błąd podczas pobierania kontaktu:', error);
      showError('Nie udało się pobrać danych kontaktu: ' + error.message);
    } finally {
      setLoading(false);
    }
  };
  
  const validateForm = () => {
    const newErrors = {};
    
    // Walidacja podstawowych pól
    if (!formData.type) {
      newErrors.type = 'Typ kontaktu jest wymagany';
    }
    
    if (!formData.firstName && !formData.lastName && !formData.company) {
      newErrors.firstName = 'Podaj imię, nazwisko lub nazwę firmy';
      newErrors.lastName = 'Podaj imię, nazwisko lub nazwę firmy';
      newErrors.company = 'Podaj imię, nazwisko lub nazwę firmy';
    }
    
    // Walidacja email (jeśli podany)
    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Podaj poprawny adres e-mail';
    }
    
    // Walidacja telefonu (jeśli podany)
    if (formData.phone && !/^[0-9+ -]{9,15}$/.test(formData.phone)) {
      newErrors.phone = 'Podaj poprawny numer telefonu';
    }
    
    // Walidacja kodu pocztowego (jeśli podany)
    if (formData.address?.postalCode && !/^[0-9]{2}-[0-9]{3}$/.test(formData.address.postalCode)) {
      newErrors.postalCode = 'Podaj poprawny kod pocztowy (format: 00-000)';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };
  
  const handleChange = (e) => {
    const { name, value } = e.target;
    
    if (name.includes('.')) {
      const [parent, child] = name.split('.');
      setFormData(prev => ({
        ...prev,
        [parent]: {
          ...prev[parent],
          [child]: value
        }
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        [name]: value
      }));
    }
    
    // Usuń błąd po zmianie wartości pola
    if (errors[name]) {
      setErrors(prev => ({
        ...prev,
        [name]: undefined
      }));
    }
  };
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) {
      showError('Formularz zawiera błędy');
      return;
    }
    
    try {
      setLoading(true);
      
      // Upewnij się, że address jest obiektem, nawet jeśli jest pusty
      const contactData = {
        ...formData,
        address: formData.address || {
          street: '',
          city: '',
          postalCode: '',
          country: 'Polska'
        }
      };
      
      if (isEditMode) {
        await updateContact(contactId, contactData, currentUser.uid);
        showSuccess('Kontakt został zaktualizowany');
      } else {
        const newContact = await createContact(contactData, currentUser.uid);
        showSuccess('Kontakt został utworzony');
      }
      
      navigate('/crm/contacts');
    } catch (error) {
      console.error('Błąd podczas zapisywania kontaktu:', error);
      showError('Nie udało się zapisać kontaktu: ' + error.message);
    } finally {
      setLoading(false);
    }
  };
  
  if (loading && isEditMode) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }
  
  return (
    <Container maxWidth="lg">
      <Box mb={4} display="flex" alignItems="center">
        <Button 
          component={Link} 
          to="/crm/contacts" 
          startIcon={<ArrowBackIcon />}
          sx={{ mr: 2 }}
        >
          Powrót
        </Button>
        <Typography variant="h4" component="h1">
          {isEditMode ? 'Edytuj kontakt' : 'Nowy kontakt'}
        </Typography>
      </Box>
      
      <Paper component="form" onSubmit={handleSubmit} sx={{ p: 3 }}>
        <Grid container spacing={3}>
          {/* Dane podstawowe */}
          <Grid item xs={12}>
            <Typography variant="h6" gutterBottom>
              Dane podstawowe
            </Typography>
          </Grid>
          
          <Grid item xs={12} md={4}>
            <FormControl fullWidth error={!!errors.type}>
              <InputLabel id="type-label">Typ kontaktu *</InputLabel>
              <Select
                labelId="type-label"
                name="type"
                value={formData.type || ''}
                onChange={handleChange}
                label="Typ kontaktu *"
              >
                {Object.values(CRM_CONTACT_TYPES).map((type) => (
                  <MenuItem key={type} value={type}>
                    {type}
                  </MenuItem>
                ))}
              </Select>
              {errors.type && <FormHelperText>{errors.type}</FormHelperText>}
            </FormControl>
          </Grid>
          
          <Grid item xs={12} md={4}>
            <TextField
              fullWidth
              name="firstName"
              label="Imię"
              value={formData.firstName || ''}
              onChange={handleChange}
              error={!!errors.firstName}
              helperText={errors.firstName}
            />
          </Grid>
          
          <Grid item xs={12} md={4}>
            <TextField
              fullWidth
              name="lastName"
              label="Nazwisko"
              value={formData.lastName || ''}
              onChange={handleChange}
              error={!!errors.lastName}
              helperText={errors.lastName}
            />
          </Grid>
          
          <Grid item xs={12} md={6}>
            <TextField
              fullWidth
              name="company"
              label="Firma"
              value={formData.company || ''}
              onChange={handleChange}
              error={!!errors.company}
              helperText={errors.company}
            />
          </Grid>
          
          <Grid item xs={12} md={6}>
            <TextField
              fullWidth
              name="position"
              label="Stanowisko"
              value={formData.position || ''}
              onChange={handleChange}
            />
          </Grid>
          
          <Grid item xs={12}>
            <Divider sx={{ my: 2 }} />
            <Typography variant="h6" gutterBottom>
              Dane kontaktowe
            </Typography>
          </Grid>
          
          <Grid item xs={12} md={6}>
            <TextField
              fullWidth
              name="email"
              label="Email"
              type="email"
              value={formData.email || ''}
              onChange={handleChange}
              error={!!errors.email}
              helperText={errors.email}
            />
          </Grid>
          
          <Grid item xs={12} md={6}>
            <TextField
              fullWidth
              name="phone"
              label="Telefon"
              value={formData.phone || ''}
              onChange={handleChange}
              error={!!errors.phone}
              helperText={errors.phone}
            />
          </Grid>
          
          <Grid item xs={12} md={6}>
            <TextField
              fullWidth
              name="mobile"
              label="Telefon komórkowy"
              value={formData.mobile || ''}
              onChange={handleChange}
            />
          </Grid>
          
          <Grid item xs={12}>
            <Divider sx={{ my: 2 }} />
            <Typography variant="h6" gutterBottom>
              Adres
            </Typography>
          </Grid>
          
          <Grid item xs={12} md={12}>
            <TextField
              fullWidth
              name="address.street"
              label="Ulica i numer"
              value={formData.address?.street || ''}
              onChange={handleChange}
            />
          </Grid>
          
          <Grid item xs={12} md={6}>
            <TextField
              fullWidth
              name="address.city"
              label="Miasto"
              value={formData.address?.city || ''}
              onChange={handleChange}
            />
          </Grid>
          
          <Grid item xs={12} md={3}>
            <TextField
              fullWidth
              name="address.postalCode"
              label="Kod pocztowy"
              value={formData.address?.postalCode || ''}
              onChange={handleChange}
              placeholder="00-000"
              error={!!errors.postalCode}
              helperText={errors.postalCode}
            />
          </Grid>
          
          <Grid item xs={12} md={3}>
            <TextField
              fullWidth
              name="address.country"
              label="Kraj"
              value={formData.address?.country || 'Polska'}
              onChange={handleChange}
            />
          </Grid>
          
          <Grid item xs={12}>
            <Divider sx={{ my: 2 }} />
            <Typography variant="h6" gutterBottom>
              Dodatkowe informacje
            </Typography>
          </Grid>
          
          <Grid item xs={12}>
            <TextField
              fullWidth
              name="notes"
              label="Notatki"
              multiline
              rows={4}
              value={formData.notes || ''}
              onChange={handleChange}
            />
          </Grid>
          
          <Grid item xs={12} display="flex" justifyContent="flex-end" gap={2} mt={2}>
            <Button 
              variant="outlined" 
              color="secondary" 
              startIcon={<CancelIcon />}
              component={Link}
              to="/crm/contacts"
            >
              Anuluj
            </Button>
            <Button 
              type="submit" 
              variant="contained" 
              color="primary" 
              startIcon={<SaveIcon />}
              disabled={loading}
            >
              {loading ? (
                <>
                  <CircularProgress size={24} sx={{ mr: 1 }} />
                  Zapisywanie...
                </>
              ) : (
                'Zapisz kontakt'
              )}
            </Button>
          </Grid>
        </Grid>
      </Paper>
    </Container>
  );
};

export default ContactFormPage;