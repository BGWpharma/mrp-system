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
  Autocomplete,
  FormHelperText,
  CircularProgress,
  IconButton
} from '@mui/material';
import { Link, useNavigate, useParams, useLocation } from 'react-router-dom';
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { pl } from 'date-fns/locale';
import {
  ArrowBack as ArrowBackIcon,
  Phone as CallIcon,
  Email as EmailIcon,
  EventNote as MeetingIcon,
  Note as NoteIcon,
  LocationOn as LocationIcon,
  Person as PersonIcon
} from '@mui/icons-material';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';
import { useTranslation } from '../../hooks/useTranslation';
import {
  createInteraction,
  updateInteraction,
  getInteractionById
} from '../../services/crmService';
import { getAllSuppliers } from '../../services/supplierService';
import { INTERACTION_TYPES, INTERACTION_STATUSES } from '../../utils/constants';

const InteractionFormPage = () => {
  const { interactionId } = useParams();
  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  const contactIdFromQuery = queryParams.get('contactId');
  const typeFromQuery = queryParams.get('type');

  const initialFormState = {
    contactId: contactIdFromQuery || '',
    type: typeFromQuery || INTERACTION_TYPES.CALL,
    subject: '',
    date: new Date(),
    status: INTERACTION_STATUSES.PLANNED,
    notes: '',
    createdBy: '', // Wypełniane automatycznie
    createdAt: null, // Wypełniane automatycznie
    updatedBy: '', // Wypełniane automatycznie
    updatedAt: null // Wypełniane automatycznie
  };

  const [formData, setFormData] = useState(initialFormState);
  const [suppliers, setSuppliers] = useState([]);
  const [selectedSupplier, setSelectedSupplier] = useState(null);
  const [loading, setLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState({});

  const { currentUser } = useAuth();
  const { showSuccess, showError } = useNotification();
  const { t } = useTranslation();
  const navigate = useNavigate();

  const isEditMode = Boolean(interactionId);

  useEffect(() => {
    fetchSuppliers();
    if (isEditMode) {
      fetchInteractionData();
    }
  }, [interactionId]);

  const fetchSuppliers = async () => {
    try {
      setLoading(true);
      const suppliersData = await getAllSuppliers();
      setSuppliers(suppliersData);

      // Jeśli przekazano contactId z query params, znajdź i ustaw wybranego dostawcę
      if (contactIdFromQuery) {
        const supplier = suppliersData.find(s => s.id === contactIdFromQuery);
        if (supplier) {
          setSelectedSupplier(supplier);
        }
      }
    } catch (error) {
      console.error('Błąd podczas pobierania dostawców:', error);
      showError(t('purchaseInteractions.notifications.loadSuppliersFailed') + ': ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchInteractionData = async () => {
    try {
      setLoading(true);
      const interactionData = await getInteractionById(interactionId);
      
      // Konwersja daty z Firestore
      let date;
      if (interactionData.date) {
        if (typeof interactionData.date === 'object' && interactionData.date.seconds) {
          date = new Date(interactionData.date.seconds * 1000);
        } else {
          date = new Date(interactionData.date);
        }
      } else {
        date = new Date();
      }
      
      setFormData({
        ...interactionData,
        date
      });

      // Znajdź i ustaw wybranego dostawcę
      if (interactionData.contactId) {
        const supplier = suppliers.find(s => s.id === interactionData.contactId);
        if (supplier) {
          setSelectedSupplier(supplier);
        }
      }
    } catch (error) {
      console.error('Błąd podczas pobierania danych interakcji:', error);
      showError(t('purchaseInteractions.notifications.loadFailed') + ': ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const validateForm = () => {
    const newErrors = {};

    if (!formData.contactId) {
      newErrors.contactId = t('purchaseInteractions.form.validation.supplierRequired');
    }

    if (!formData.type) {
      newErrors.type = t('purchaseInteractions.form.validation.typeRequired');
    }

    if (!formData.subject) {
      newErrors.subject = t('purchaseInteractions.form.validation.subjectRequired');
    } else if (formData.subject.length < 3) {
      newErrors.subject = t('purchaseInteractions.form.validation.subjectMinLength');
    }

    if (!formData.date) {
      newErrors.date = t('purchaseInteractions.form.validation.dateRequired');
    }

    if (!formData.status) {
      newErrors.status = t('purchaseInteractions.form.validation.statusRequired');
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      [name]: value
    });

    // Clear error when field is edited
    if (errors[name]) {
      setErrors({
        ...errors,
        [name]: null
      });
    }
  };

  const handleDateChange = (newDate) => {
    setFormData({
      ...formData,
      date: newDate
    });

    // Clear error when field is edited
    if (errors.date) {
      setErrors({
        ...errors,
        date: null
      });
    }
  };

  const handleContactChange = (event, newValue) => {
    setSelectedSupplier(newValue);
    setFormData({
      ...formData,
      contactId: newValue ? newValue.id : ''
    });

    // Clear error when field is edited
    if (errors.contactId) {
      setErrors({
        ...errors,
        contactId: null
      });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    try {
      setIsSubmitting(true);

      if (!currentUser) {
        throw new Error('Użytkownik nie jest zalogowany');
      }

      // Przygotuj dane do zapisania, upewniając się że wszystkie pola są zdefiniowane
      const interactionData = {
        contactId: formData.contactId,
        type: formData.type,
        subject: formData.subject,
        date: formData.date,
        status: formData.status,
        notes: formData.notes || '',
      };

      if (isEditMode) {
        // Aktualizacja istniejącej interakcji
        await updateInteraction(interactionId, interactionData, currentUser.uid);
        showSuccess(t('purchaseInteractions.notifications.updated'));
        navigate('/crm/interactions');
      } else {
        // Tworzenie nowej interakcji
        const newInteractionId = await createInteraction(interactionData, currentUser.uid);
        showSuccess(t('purchaseInteractions.notifications.created'));
        navigate('/crm/interactions');
      }
    } catch (error) {
      console.error('Błąd podczas zapisywania interakcji:', error);
      showError(t('purchaseInteractions.notifications.createFailed') + ': ' + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const getTypeIcon = (type) => {
    switch (type) {
      case INTERACTION_TYPES.CALL:
        return <CallIcon color="primary" />;
      case INTERACTION_TYPES.EMAIL:
        return <EmailIcon color="info" />;
      case INTERACTION_TYPES.MEETING:
        return <MeetingIcon color="success" />;
      default:
        return <NoteIcon />;
    }
  };

  const getPageTitle = () => {
    if (isEditMode) {
      return t('purchaseInteractions.editInteraction');
    }

    switch (formData.type) {
      case INTERACTION_TYPES.CALL:
        return 'Nowa rozmowa telefoniczna';
      case INTERACTION_TYPES.EMAIL:
        return 'Nowy email';
      case INTERACTION_TYPES.MEETING:
        return 'Nowe spotkanie';
      default:
        return t('purchaseInteractions.newInteraction');
    }
  };

  const getBackLink = () => {
    if (isEditMode) {
      return `/crm/interactions/${interactionId}`;
    }
    if (contactIdFromQuery) {
      return `/crm/contacts/${contactIdFromQuery}`;
    }
    return '/crm/interactions';
  };

  return (
    <Container maxWidth="lg">
      <Box mt={4} mb={4} display="flex" alignItems="center">
        <IconButton
          component={Link}
          to={getBackLink()}
          sx={{ mr: 2 }}
        >
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h4" component="h1">
          {getPageTitle()}
        </Typography>
      </Box>

      <Paper sx={{ p: 3 }}>
        {loading ? (
          <Box display="flex" justifyContent="center" p={4}>
            <CircularProgress />
          </Box>
        ) : (
          <form onSubmit={handleSubmit}>
            <Grid container spacing={3}>
              <Grid item xs={12} md={6}>
                <Autocomplete
                  id="contact-select"
                  options={suppliers}
                  value={selectedSupplier}
                  onChange={handleContactChange}
                  getOptionLabel={(option) => option.name || ''}
                  renderInput={(params) => (
                    <TextField 
                      {...params} 
                      label={t('purchaseInteractions.form.selectSupplier')} 
                      variant="outlined" 
                      required
                      error={Boolean(errors.contactId)}
                      helperText={errors.contactId}
                      fullWidth
                    />
                  )}
                  disabled={isSubmitting || loading}
                />
              </Grid>

              <Grid item xs={12} md={6}>
                <FormControl fullWidth error={Boolean(errors.type)}>
                  <InputLabel id="type-label">{t('purchaseInteractions.form.type')}</InputLabel>
                  <Select
                    labelId="type-label"
                    id="type"
                    name="type"
                    value={formData.type}
                    onChange={handleInputChange}
                    label={t('purchaseInteractions.form.type')}
                    required
                    startAdornment={getTypeIcon(formData.type)}
                    disabled={isSubmitting || Boolean(typeFromQuery)}
                  >
                    <MenuItem value={INTERACTION_TYPES.CALL}>
                      <Box display="flex" alignItems="center">
                        <CallIcon color="primary" sx={{ mr: 1 }} />
                        {t('purchaseInteractions.types.call')}
                      </Box>
                    </MenuItem>
                    <MenuItem value={INTERACTION_TYPES.EMAIL}>
                      <Box display="flex" alignItems="center">
                        <EmailIcon color="info" sx={{ mr: 1 }} />
                        {t('purchaseInteractions.types.email')}
                      </Box>
                    </MenuItem>
                    <MenuItem value={INTERACTION_TYPES.MEETING}>
                      <Box display="flex" alignItems="center">
                        <MeetingIcon color="success" sx={{ mr: 1 }} />
                        {t('purchaseInteractions.types.meeting')}
                      </Box>
                    </MenuItem>
                    <MenuItem value={INTERACTION_TYPES.NOTE}>
                      <Box display="flex" alignItems="center">
                        <NoteIcon sx={{ mr: 1 }} />
                        {t('purchaseInteractions.types.note')}
                      </Box>
                    </MenuItem>
                  </Select>
                  {errors.type && <FormHelperText>{errors.type}</FormHelperText>}
                </FormControl>
              </Grid>

              {selectedSupplier && (
                <Grid item xs={12}>
                  <Paper variant="outlined" sx={{ p: 2, mb: 2, bgcolor: 'background.paper' }}>
                    <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                      Informacje o dostawcy:
                    </Typography>
                    <Grid container spacing={2}>
                      {selectedSupplier.phone && (
                        <Grid item xs={12} sm={4}>
                          <Box display="flex" alignItems="center">
                            <CallIcon fontSize="small" color="primary" sx={{ mr: 1 }} />
                            <Typography variant="body2">{selectedSupplier.phone}</Typography>
                          </Box>
                        </Grid>
                      )}
                      {selectedSupplier.email && (
                        <Grid item xs={12} sm={4}>
                          <Box display="flex" alignItems="center">
                            <EmailIcon fontSize="small" color="primary" sx={{ mr: 1 }} />
                            <Typography variant="body2">{selectedSupplier.email}</Typography>
                          </Box>
                        </Grid>
                      )}
                      {selectedSupplier.addresses && selectedSupplier.addresses.length > 0 && (
                        <Grid item xs={12} sm={4}>
                          <Box display="flex" alignItems="flex-start">
                            <LocationIcon fontSize="small" color="primary" sx={{ mr: 1, mt: 0.3 }} />
                            <Typography variant="body2">
                              {(() => {
                                const mainAddress = selectedSupplier.addresses.find(a => a.isMain) || selectedSupplier.addresses[0];
                                return `${mainAddress.street}, ${mainAddress.postalCode} ${mainAddress.city}`;
                              })()}
                            </Typography>
                          </Box>
                        </Grid>
                      )}
                      {selectedSupplier.contactPerson && (
                        <Grid item xs={12} sm={4}>
                          <Box display="flex" alignItems="center">
                            <PersonIcon fontSize="small" color="primary" sx={{ mr: 1 }} />
                            <Typography variant="body2">{selectedSupplier.contactPerson}</Typography>
                          </Box>
                        </Grid>
                      )}
                    </Grid>
                  </Paper>
                </Grid>
              )}

              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label={t('purchaseInteractions.form.subject')}
                  name="subject"
                  value={formData.subject}
                  onChange={handleInputChange}
                  error={Boolean(errors.subject)}
                  helperText={errors.subject}
                  required
                  disabled={isSubmitting}
                />
              </Grid>

              <Grid item xs={12} md={6}>
                <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={pl}>
                  <DateTimePicker
                    label={t('purchaseInteractions.form.date')}
                    value={formData.date}
                    onChange={handleDateChange}
                    format="dd.MM.yyyy HH:mm"
                    slotProps={{
                      textField: {
                        fullWidth: true,
                        required: true,
                        error: Boolean(errors.date),
                        helperText: errors.date,
                        disabled: isSubmitting
                      }
                    }}
                  />
                </LocalizationProvider>
              </Grid>

              <Grid item xs={12} md={6}>
                <FormControl fullWidth error={Boolean(errors.status)}>
                  <InputLabel id="status-label">{t('purchaseInteractions.form.status')}</InputLabel>
                  <Select
                    labelId="status-label"
                    id="status"
                    name="status"
                    value={formData.status}
                    onChange={handleInputChange}
                    label={t('purchaseInteractions.form.status')}
                    required
                    disabled={isSubmitting}
                  >
                    <MenuItem value={INTERACTION_STATUSES.PLANNED}>{t('purchaseInteractions.statuses.planned')}</MenuItem>
                    <MenuItem value={INTERACTION_STATUSES.IN_PROGRESS}>{t('purchaseInteractions.statuses.inProgress')}</MenuItem>
                    <MenuItem value={INTERACTION_STATUSES.COMPLETED}>{t('purchaseInteractions.statuses.completed')}</MenuItem>
                    <MenuItem value={INTERACTION_STATUSES.CANCELLED}>{t('purchaseInteractions.statuses.cancelled')}</MenuItem>
                  </Select>
                  {errors.status && <FormHelperText>{errors.status}</FormHelperText>}
                </FormControl>
              </Grid>

              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label={t('purchaseInteractions.form.notes')}
                  name="notes"
                  value={formData.notes}
                  onChange={handleInputChange}
                  multiline
                  rows={4}
                  disabled={isSubmitting}
                />
              </Grid>

              <Grid item xs={12}>
                <Box display="flex" justifyContent="flex-end" mt={2}>
                  <Button
                    component={Link}
                    to={getBackLink()}
                    sx={{ mr: 2 }}
                    disabled={isSubmitting}
                  >
                    {t('purchaseInteractions.actions.cancel')}
                  </Button>
                  <Button
                    type="submit"
                    variant="contained"
                    color="primary"
                    disabled={isSubmitting}
                    startIcon={isSubmitting ? <CircularProgress size={20} /> : null}
                  >
                    {isSubmitting ? t('purchaseInteractions.loading') : isEditMode ? t('purchaseInteractions.actions.update') : t('purchaseInteractions.actions.save')}
                  </Button>
                </Box>
              </Grid>
            </Grid>
          </form>
        )}
      </Paper>
    </Container>
  );
};

export default InteractionFormPage; 