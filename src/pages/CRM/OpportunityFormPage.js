import React, { useState, useEffect } from 'react';
import {
  Container,
  Typography,
  Box,
  Paper,
  Grid,
  TextField,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormHelperText,
  Autocomplete,
  CircularProgress,
  Slider,
  InputAdornment,
  Chip
} from '@mui/material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { pl } from 'date-fns/locale';
import {
  Save as SaveIcon,
  ArrowBack as BackIcon,
  Delete as DeleteIcon
} from '@mui/icons-material';
import { Link, useNavigate, useParams, useLocation } from 'react-router-dom';
import {
  getOpportunityById,
  createOpportunity,
  updateOpportunity,
  getAllContacts
} from '../../services/crmService';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';
import { useTranslation } from '../../hooks/useTranslation';
import { OPPORTUNITY_STAGES, DEFAULT_CRM_VALUES } from '../../utils/constants';

const OpportunityFormPage = () => {
  const { opportunityId } = useParams();
  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  const contactIdFromQuery = queryParams.get('contactId');
  
  const isEditMode = !!opportunityId;
  
  const [formData, setFormData] = useState({
    ...DEFAULT_CRM_VALUES.NEW_OPPORTUNITY,
    contactId: contactIdFromQuery || '',
  });
  
  const [loading, setLoading] = useState(isEditMode);
  const [submitting, setSubmitting] = useState(false);
  const [contacts, setContacts] = useState([]);
  const [contactsLoading, setContactsLoading] = useState(true);
  const [selectedContact, setSelectedContact] = useState(null);
  const [errors, setErrors] = useState({});
  
  const { currentUser } = useAuth();
  const { showSuccess, showError } = useNotification();
  const { t } = useTranslation('interactions');
  const navigate = useNavigate();
  
  useEffect(() => {
    const fetchContacts = async () => {
      try {
        const allContacts = await getAllContacts();
        setContacts(allContacts);
        
        // Jeśli jest contactId z query, znajdź i ustaw wybrany kontakt
        if (contactIdFromQuery) {
          const contact = allContacts.find(c => c.id === contactIdFromQuery);
          if (contact) {
            setSelectedContact(contact);
            setFormData(prev => ({
              ...prev,
              contactName: `${contact.firstName || ''} ${contact.lastName || ''}`.trim() || contact.company || 'Nieznany kontakt'
            }));
          }
        }
      } catch (error) {
        console.error('Błąd podczas pobierania kontaktów:', error);
        showError('Nie udało się pobrać listy kontaktów: ' + error.message);
      } finally {
        setContactsLoading(false);
      }
    };
    
    fetchContacts();
    
    if (isEditMode) {
      const fetchOpportunity = async () => {
        try {
          const opportunityData = await getOpportunityById(opportunityId);
          setFormData(opportunityData);
          
          // Znajdź kontakt, jeśli istnieje
          if (opportunityData.contactId) {
            const contact = contacts.find(c => c.id === opportunityData.contactId);
            if (contact) {
              setSelectedContact(contact);
            }
          }
        } catch (error) {
          console.error('Błąd podczas pobierania szansy sprzedaży:', error);
          showError('Nie udało się pobrać danych szansy sprzedaży: ' + error.message);
        } finally {
          setLoading(false);
        }
      };
      
      fetchOpportunity();
    }
  }, [opportunityId, contactIdFromQuery, isEditMode, showError]);
  
  const validateForm = () => {
    const newErrors = {};
    
    if (!formData.name.trim()) {
      newErrors.name = 'Nazwa jest wymagana';
    }
    
    if (!formData.stage) {
      newErrors.stage = 'Etap jest wymagany';
    }
    
    if (formData.amount < 0) {
      newErrors.amount = 'Wartość nie może być ujemna';
    }
    
    if (formData.probability < 0 || formData.probability > 100) {
      newErrors.probability = 'Prawdopodobieństwo musi być między 0 a 100';
    }
    
    if (!formData.expectedCloseDate) {
      newErrors.expectedCloseDate = 'Data planowanego zamknięcia jest wymagana';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) return;
    
    setSubmitting(true);
    
    try {
      if (isEditMode) {
        await updateOpportunity(opportunityId, formData, currentUser.uid);
        showSuccess('Szansa sprzedaży została zaktualizowana');
      } else {
        const newOpportunity = await createOpportunity(formData, currentUser.uid);
        showSuccess('Szansa sprzedaży została utworzona');
        navigate(`/crm/opportunities/${newOpportunity.id}`);
        return; // Wróci przed setSubmitting(false), ponieważ nawigujemy
      }
      navigate(`/crm/opportunities/${opportunityId || ''}`);
    } catch (error) {
      console.error('Błąd podczas zapisywania szansy sprzedaży:', error);
      showError('Nie udało się zapisać szansy sprzedaży: ' + error.message);
      setSubmitting(false);
    }
  };
  
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    
    // Wyczyść błąd po zmianie wartości
    if (errors[name]) {
      setErrors(prev => ({
        ...prev,
        [name]: undefined
      }));
    }
  };
  
  const handleDateChange = (date) => {
    setFormData(prev => ({
      ...prev,
      expectedCloseDate: date ? date.toISOString() : null
    }));
    
    if (errors.expectedCloseDate) {
      setErrors(prev => ({
        ...prev,
        expectedCloseDate: undefined
      }));
    }
  };
  
  const handleContactChange = (event, newValue) => {
    setSelectedContact(newValue);
    setFormData(prev => ({
      ...prev,
      contactId: newValue ? newValue.id : '',
      contactName: newValue ? 
        `${newValue.firstName || ''} ${newValue.lastName || ''}`.trim() || newValue.company || 'Nieznany kontakt' : ''
    }));
  };
  
  const handleProbabilityChange = (event, newValue) => {
    setFormData(prev => ({
      ...prev,
      probability: newValue
    }));
  };
  
  if (loading) {
    return (
      <Container>
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
          <CircularProgress />
        </Box>
      </Container>
    );
  }
  
  return (
    <Container>
      <Box mt={4} mb={4} display="flex" alignItems="center">
        <Button 
          component={Link} 
          to={opportunityId ? `/crm/opportunities/${opportunityId}` : '/crm/opportunities'} 
          startIcon={<BackIcon />}
          sx={{ mr: 2 }}
        >
          {opportunityId ? 'Wróć do szczegółów' : 'Wróć do listy'}
        </Button>
        <Typography variant="h4" component="h1">
          {isEditMode ? 'Edytuj szansę sprzedaży' : 'Nowa szansa sprzedaży'}
        </Typography>
      </Box>
      
      <Paper sx={{ p: 3 }}>
        <form onSubmit={handleSubmit}>
          <Grid container spacing={3}>
            <Grid item xs={12}>
              <TextField
                label={t('opportunities.name')}
                name="name"
                value={formData.name}
                onChange={handleChange}
                fullWidth
                variant="outlined"
                required
                error={!!errors.name}
                helperText={errors.name}
              />
            </Grid>
            
            <Grid item xs={12} md={6}>
              <FormControl fullWidth variant="outlined" error={!!errors.stage}>
                <InputLabel>Etap</InputLabel>
                <Select
                  name="stage"
                  value={formData.stage}
                  onChange={handleChange}
                  label="Etap"
                  required
                >
                  {Object.entries(OPPORTUNITY_STAGES).map(([key, value]) => (
                    <MenuItem key={key} value={value}>
                      {value}
                    </MenuItem>
                  ))}
                </Select>
                {errors.stage && <FormHelperText>{errors.stage}</FormHelperText>}
              </FormControl>
            </Grid>
            
            <Grid item xs={12} md={6}>
              <Autocomplete
                options={contacts}
                loading={contactsLoading}
                value={selectedContact}
                onChange={handleContactChange}
                getOptionLabel={(option) => 
                  `${option.firstName || ''} ${option.lastName || ''}`.trim() || option.company || 'Bez nazwy'
                }
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Powiązany kontakt"
                    variant="outlined"
                    fullWidth
                    InputProps={{
                      ...params.InputProps,
                      endAdornment: (
                        <>
                          {contactsLoading ? <CircularProgress color="inherit" size={20} /> : null}
                          {params.InputProps.endAdornment}
                        </>
                      ),
                    }}
                  />
                )}
              />
            </Grid>
            
            <Grid item xs={12} md={6}>
              <TextField
                label={t('opportunities.valueEUR')}
                name="amount"
                type="number"
                value={formData.amount}
                onChange={handleChange}
                fullWidth
                variant="outlined"
                InputProps={{
                  startAdornment: <InputAdornment position="start">EUR</InputAdornment>,
                }}
                error={!!errors.amount}
                helperText={errors.amount}
              />
            </Grid>
            
            <Grid item xs={12} md={6}>
              <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={pl}>
                <DatePicker
                  label="Planowana data zamknięcia"
                  value={formData.expectedCloseDate ? new Date(formData.expectedCloseDate) : null}
                  onChange={handleDateChange}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      fullWidth
                      variant="outlined"
                      error={!!errors.expectedCloseDate}
                      helperText={errors.expectedCloseDate}
                      required
                    />
                  )}
                />
              </LocalizationProvider>
            </Grid>
            
            <Grid item xs={12}>
              <Box>
                <Typography gutterBottom>
                  Prawdopodobieństwo sukcesu: {formData.probability}%
                </Typography>
                <Slider
                  value={formData.probability}
                  onChange={handleProbabilityChange}
                  aria-labelledby="probability-slider"
                  valueLabelDisplay="auto"
                  step={5}
                  marks
                  min={0}
                  max={100}
                  color={
                    formData.probability < 30 ? 'error' : 
                    formData.probability < 60 ? 'warning' : 'success'
                  }
                />
              </Box>
            </Grid>
            
            <Grid item xs={12}>
              <TextField
                label="Notatki"
                name="notes"
                value={formData.notes || ''}
                onChange={handleChange}
                fullWidth
                variant="outlined"
                multiline
                rows={4}
              />
            </Grid>
            
            <Grid item xs={12} sx={{ mt: 2 }}>
              <Box display="flex" justifyContent="flex-end">
                <Button
                  component={Link}
                  to={opportunityId ? `/crm/opportunities/${opportunityId}` : '/crm/opportunities'}
                  sx={{ mr: 1 }}
                >
                  Anuluj
                </Button>
                <Button
                  type="submit"
                  variant="contained"
                  color="primary"
                  startIcon={<SaveIcon />}
                  disabled={submitting}
                >
                  {submitting ? 'Zapisywanie...' : 'Zapisz'}
                </Button>
              </Box>
            </Grid>
          </Grid>
        </form>
      </Paper>
    </Container>
  );
};

export default OpportunityFormPage; 