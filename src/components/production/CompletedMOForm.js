import React, { useState, useEffect } from 'react';
import { 
  Container, 
  Typography, 
  Box, 
  Paper, 
  TextField, 
  Button, 
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Grid,
  Alert,
  Divider,
  CircularProgress
} from '@mui/material';
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { pl } from 'date-fns/locale';
import { formatDateForInput } from '../../utils/dateUtils';
import { Send as SendIcon, ArrowBack as ArrowBackIcon } from '@mui/icons-material';
import { getMONumbersForSelect } from '../../services/moService';
import { db, storage } from '../../services/firebase/config';
import { collection, addDoc, serverTimestamp, doc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';

const CompletedMOForm = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const isEditMode = searchParams.get('edit') === 'true';
  const { currentUser } = useAuth();

  const [formData, setFormData] = useState({
    email: '',
    date: new Date(),
    time: '',
    moNumber: '',
    productQuantity: '',
    packagingLoss: '',
    bulkLoss: '',
    rawMaterialLoss: '',
    mixingPlanReport: null
  });

  const [editId, setEditId] = useState(null);
  const [validationErrors, setValidationErrors] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [moOptions, setMoOptions] = useState([]);
  const [loadingMO, setLoadingMO] = useState(false);

  // Sprawdź, czy istnieją dane do edycji w sessionStorage
  useEffect(() => {
    if (isEditMode) {
      const editData = JSON.parse(sessionStorage.getItem('editFormData'));
      if (editData) {
        // Konwersja z Timestamp (jeśli istnieje)
        const date = editData.date ? 
          (typeof editData.date === 'string' ? new Date(editData.date) : editData.date) : 
          new Date();
        
        setFormData({
          email: editData.email || '',
          date: date,
          time: editData.time || '',
          moNumber: editData.moNumber || '',
          productQuantity: editData.productQuantity || '',
          packagingLoss: editData.packagingLoss || '',
          bulkLoss: editData.bulkLoss || '',
          rawMaterialLoss: editData.rawMaterialLoss || '',
          mixingPlanReport: null // Pliki muszą być wybrane ponownie
        });
        setEditId(editData.id);
      }
      // Wyczyść dane z sessionStorage po ich wykorzystaniu
      sessionStorage.removeItem('editFormData');
    }
  }, [isEditMode]);

  // Pobierz numery MO przy pierwszym renderowaniu komponentu
  useEffect(() => {
    const fetchMONumbers = async () => {
      try {
        setLoadingMO(true);
        const options = await getMONumbersForSelect();
        setMoOptions(options);
      } catch (error) {
        console.error('Błąd podczas pobierania numerów MO:', error);
      } finally {
        setLoadingMO(false);
      }
    };

    fetchMONumbers();
    
    // Ustaw email zalogowanego użytkownika
    if (currentUser && currentUser.email) {
      setFormData(prev => ({
        ...prev,
        email: currentUser.email
      }));
    }
  }, [currentUser]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    
    // Wyczyść błąd walidacji po zmianie wartości
    if (validationErrors[name]) {
      setValidationErrors(prev => ({
        ...prev,
        [name]: ''
      }));
    }
  };

  const handleDateChange = (date) => {
    setFormData(prev => ({
      ...prev,
      date
    }));
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setFormData(prev => ({
        ...prev,
        mixingPlanReport: file
      }));
    }
  };

  const validate = () => {
    const errors = {};
    
    if (!formData.email) {
      errors.email = 'Adres e-mail jest wymagany';
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      errors.email = 'Podaj prawidłowy adres e-mail';
    }
    
    if (!formData.time) {
      errors.time = 'Godzina wypełnienia jest wymagana';
    }
    
    if (!formData.moNumber) {
      errors.moNumber = 'Numer MO jest wymagany';
    }
    
    if (!formData.productQuantity) {
      errors.productQuantity = 'Ilość produktu końcowego jest wymagana';
    } else if (isNaN(formData.productQuantity)) {
      errors.productQuantity = 'Podaj wartość liczbową';
    }
    
    if (formData.packagingLoss && isNaN(formData.packagingLoss)) {
      errors.packagingLoss = 'Podaj wartość liczbową';
    }
    
    if (formData.rawMaterialLoss && isNaN(formData.rawMaterialLoss)) {
      errors.rawMaterialLoss = 'Podaj wartość liczbową';
    }
    
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (validate()) {
      try {
        setSubmitted(false);
        
        // Ścieżka do kolekcji odpowiedzi formularza w Firestore
        const odpowiedziRef = collection(db, 'Forms/SkonczoneMO/Odpowiedzi');
        
        // Przygotuj dane do zapisania
        const odpowiedzData = {
          email: formData.email,
          date: formData.date,
          time: formData.time,
          moNumber: formData.moNumber,
          productQuantity: formData.productQuantity,
          packagingLoss: formData.packagingLoss,
          bulkLoss: formData.bulkLoss,
          rawMaterialLoss: formData.rawMaterialLoss,
          createdAt: serverTimestamp()
        };
        
        // Jeśli dołączono plik, prześlij go do Firebase Storage
        if (formData.mixingPlanReport) {
          const storageRef = ref(storage, `forms/skonczone-mo/${formData.moNumber}/${Date.now()}-${formData.mixingPlanReport.name}`);
          await uploadBytes(storageRef, formData.mixingPlanReport);
          const fileUrl = await getDownloadURL(storageRef);
          odpowiedzData.mixingPlanReportUrl = fileUrl;
          odpowiedzData.mixingPlanReportName = formData.mixingPlanReport.name;
        }
        
        // Zapisz odpowiedź w Firestore
        if (isEditMode && editId) {
          // Aktualizacja istniejącego dokumentu
          const docRef = doc(db, 'Forms/SkonczoneMO/Odpowiedzi', editId);
          await updateDoc(docRef, odpowiedzData);
          console.log('Formularz zaktualizowany z danymi:', odpowiedzData);
        } else {
          // Dodanie nowego dokumentu
          await addDoc(odpowiedziRef, odpowiedzData);
          console.log('Formularz wysłany z danymi:', odpowiedzData);
        }
        
        setSubmitted(true);
        
        // Reset formularza po pomyślnym wysłaniu
        setFormData({
          email: '',
          date: new Date(),
          time: '',
          moNumber: '',
          productQuantity: '',
          packagingLoss: '',
          bulkLoss: '',
          rawMaterialLoss: '',
          mixingPlanReport: null
        });
      } catch (error) {
        console.error('Błąd podczas zapisywania formularza:', error);
        alert(`Wystąpił błąd podczas zapisywania formularza: ${error.message}`);
      }
    }
  };

  const handleBack = () => {
    navigate('/production/forms/responses');
  };

  return (
    <Container maxWidth="md" sx={{ mt: 4, mb: 4 }}>
      <Paper sx={{ p: 4 }}>
        <Box sx={{ mb: 3 }}>
          <Typography variant="h5" gutterBottom align="center" fontWeight="bold">
            {isEditMode ? 'EDYCJA - RAPORT SKOŃCZONE MO' : 'RAPORT - SKOŃCZONE MO'}
          </Typography>
          <Typography variant="body2" align="center" color="text.secondary" paragraph>
            W razie awarii i pilnych zgłoszeń prosimy o kontakt: mateusz@bgwpharma.com
          </Typography>
          <Divider />
        </Box>

        {submitted && (
          <Alert severity="success" sx={{ mb: 3 }}>
            {isEditMode ? 'Raport został zaktualizowany pomyślnie!' : 'Raport został wysłany pomyślnie!'}
          </Alert>
        )}
        
        <Box component="form" onSubmit={handleSubmit}>
          <Grid container spacing={3}>
            <Grid item xs={12}>
              <TextField
                required
                fullWidth
                label="Adres e-mail"
                name="email"
                value={formData.email}
                onChange={handleChange}
                error={!!validationErrors.email}
                helperText={validationErrors.email}
                InputProps={{
                  readOnly: true, // Pole tylko do odczytu
                }}
              />
            </Grid>
            
            <Grid item xs={12} sm={6}>
              <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={pl}>
                <DateTimePicker
                  label="Data wypełnienia"
                  value={formData.date}
                  onChange={handleDateChange}
                  renderInput={(params) => <TextField {...params} fullWidth required />}
                  format="dd.MM.yyyy"
                />
              </LocalizationProvider>
            </Grid>
            
            <Grid item xs={12} sm={6}>
              <TextField
                required
                fullWidth
                label="Godzina wypełnienia"
                name="time"
                value={formData.time}
                onChange={handleChange}
                placeholder="np. 8:30"
                error={!!validationErrors.time}
                helperText={validationErrors.time}
              />
            </Grid>
            
            <Grid item xs={12}>
              <FormControl 
                fullWidth 
                required 
                error={!!validationErrors.moNumber}
              >
                <InputLabel>Numer MO</InputLabel>
                <Select
                  name="moNumber"
                  value={formData.moNumber}
                  onChange={handleChange}
                  label="Numer MO"
                  disabled={loadingMO}
                  startAdornment={
                    loadingMO ? 
                    <CircularProgress size={20} sx={{ mr: 1 }} /> : 
                    null
                  }
                >
                  {moOptions.map((option) => (
                    <MenuItem key={option.value} value={option.value}>
                      {option.label}
                    </MenuItem>
                  ))}
                </Select>
                {validationErrors.moNumber && (
                  <Typography variant="caption" color="error">
                    {validationErrors.moNumber}
                  </Typography>
                )}
              </FormControl>
            </Grid>
            
            <Grid item xs={12}>
              <TextField
                required
                fullWidth
                label="Ilość produktu końcowego"
                name="productQuantity"
                value={formData.productQuantity}
                onChange={handleChange}
                placeholder="Proszę podać tylko wartość liczbową!"
                error={!!validationErrors.productQuantity}
                helperText={validationErrors.productQuantity}
              />
            </Grid>
            
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Strata - Opakowanie"
                name="packagingLoss"
                value={formData.packagingLoss}
                onChange={handleChange}
                placeholder="W ramach robionego MO. Proszę podać tylko wartość liczbową!"
                error={!!validationErrors.packagingLoss}
                helperText={validationErrors.packagingLoss}
              />
            </Grid>
            
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Strata - Wieczka"
                name="bulkLoss"
                value={formData.bulkLoss}
                onChange={handleChange}
                placeholder="W ramach robionego MO. Proszę podać tylko wartość liczbową!"
              />
            </Grid>
            
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Strata - Surowiec"
                name="rawMaterialLoss"
                value={formData.rawMaterialLoss}
                onChange={handleChange}
                placeholder="W ramach robionego MO. Np. rozsypane kakao, rozsypany produkt końcowy itp. Jeśli nie było straty - proszę wpisać 'brak'."
                error={!!validationErrors.rawMaterialLoss}
                helperText={validationErrors.rawMaterialLoss}
                multiline
                rows={5}
              />
            </Grid>
            
            <Grid item xs={12}>
              <Typography variant="subtitle2" gutterBottom>
                Raport z planu mieszań:
              </Typography>
              <input
                type="file"
                onChange={handleFileChange}
                style={{ width: '100%', marginTop: '8px' }}
              />
              {isEditMode && formData.mixingPlanReportUrl && (
                <Typography variant="caption" color="primary">
                  Aktualny plik: {formData.mixingPlanReportName}
                </Typography>
              )}
            </Grid>
            
            <Grid item xs={12}>
              <Box sx={{ display: 'flex', gap: 2 }}>
                <Button
                  variant="outlined"
                  color="secondary"
                  startIcon={<ArrowBackIcon />}
                  onClick={handleBack}
                >
                  Powrót
                </Button>
                <Button
                  type="submit"
                  variant="contained"
                  color="primary"
                  fullWidth
                  size="large"
                  startIcon={<SendIcon />}
                >
                  {isEditMode ? 'Aktualizuj raport' : 'Wyślij raport'}
                </Button>
              </Box>
            </Grid>
          </Grid>
        </Box>
      </Paper>
    </Container>
  );
};

export default CompletedMOForm; 