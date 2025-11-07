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
  RadioGroup,
  Radio,
  FormControlLabel,
  FormLabel,
  Divider,
  Alert,
  Snackbar,
  CircularProgress
} from '@mui/material';
import { DatePicker, TimePicker } from '@mui/x-date-pickers';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { pl } from 'date-fns/locale';
import { Save as SaveIcon, ArrowBack as ArrowBackIcon, Build as BuildIcon } from '@mui/icons-material';
import { useTheme } from '@mui/material/styles';
import { useNavigate, useLocation } from 'react-router-dom';
import { db } from '../../services/firebase/config';
import { collection, addDoc, serverTimestamp, doc, updateDoc } from 'firebase/firestore';
import { useAuth } from '../../hooks/useAuth';
import { 
  getFormHeaderStyles, 
  getFormSectionStyles, 
  getFormContainerStyles, 
  getFormPaperStyles, 
  getFormButtonStyles,
  getFormActionsStyles 
} from '../../styles/formStyles';

const ServiceReportFormPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser } = useAuth();
  const theme = useTheme();
  
  // Sprawdź czy jesteśmy w trybie edycji
  const isEditMode = new URLSearchParams(location.search).get('edit') === 'true';
  
  const [formData, setFormData] = useState({
    // Informacje użytkownika
    email: '',
    
    // Sekcja A: Identyfikacja
    employeeName: '',
    position: '',
    fillDate: new Date(),
    
    // Sekcja B: Data Serwisu
    serviceDate: new Date(),
    serviceTime: new Date(),
    
    // Sekcja C: Zadania Serwisowe (Wykonano/Nie wykonano)
    filterCleaning: '',
    actuatorCheck: '',
    sensorCleaning: '',
    pneumaticCheck: '',
    actuatorAirtightness: '',
    oilLevelCheck: '',
    controlChamberCleaning: '',
    screwsNutsCheck: '',
    rubberGasketCheck: '',
    
    // Sekcja D: Dodatkowe uwagi
    additionalNotes: ''
  });
  
  const [showSuccess, setShowSuccess] = useState(false);
  const [errors, setErrors] = useState({});
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);

  // Sprawdź czy istnieją dane do edycji w sessionStorage
  useEffect(() => {
    if (isEditMode) {
      const editData = JSON.parse(sessionStorage.getItem('editFormData'));
      if (editData) {
        const fillDate = editData.fillDate ? 
          (editData.fillDate.toDate ? editData.fillDate.toDate() : new Date(editData.fillDate)) : 
          new Date();
        
        const serviceDate = editData.serviceDate ? 
          (editData.serviceDate.toDate ? editData.serviceDate.toDate() : new Date(editData.serviceDate)) : 
          new Date();
        
        const serviceTime = editData.serviceTime ? 
          (editData.serviceTime.toDate ? editData.serviceTime.toDate() : new Date(editData.serviceTime)) : 
          new Date();
        
        setFormData({
          email: editData.email || '',
          employeeName: editData.employeeName || '',
          position: editData.position || '',
          fillDate: fillDate,
          serviceDate: serviceDate,
          serviceTime: serviceTime,
          filterCleaning: editData.filterCleaning || '',
          actuatorCheck: editData.actuatorCheck || '',
          sensorCleaning: editData.sensorCleaning || '',
          pneumaticCheck: editData.pneumaticCheck || '',
          actuatorAirtightness: editData.actuatorAirtightness || '',
          oilLevelCheck: editData.oilLevelCheck || '',
          controlChamberCleaning: editData.controlChamberCleaning || '',
          screwsNutsCheck: editData.screwsNutsCheck || '',
          rubberGasketCheck: editData.rubberGasketCheck || '',
          additionalNotes: editData.additionalNotes || ''
        });
        
        setEditId(editData.id);
      }
      sessionStorage.removeItem('editFormData');
    }
  }, [isEditMode]);

  // Ustaw email zalogowanego użytkownika (tylko jeśli nie jesteśmy w trybie edycji)
  useEffect(() => {
    if (currentUser && currentUser.email && !isEditMode) {
      setFormData(prev => ({
        ...prev,
        email: currentUser.email
      }));
    }
  }, [currentUser, isEditMode]);

  const handleInputChange = (field) => (event) => {
    const value = event.target.value;
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
    
    // Usuń błąd po poprawieniu pola
    if (errors[field]) {
      setErrors(prev => ({
        ...prev,
        [field]: undefined
      }));
    }
  };

  const handleDateChange = (field) => (date) => {
    setFormData(prev => ({
      ...prev,
      [field]: date
    }));
  };

  const validateForm = () => {
    const newErrors = {};
    
    // Sekcja A - Identyfikacja
    if (!formData.employeeName?.trim()) {
      newErrors.employeeName = 'Imię i nazwisko jest wymagane';
    }
    
    if (!formData.position?.trim()) {
      newErrors.position = 'Stanowisko/rola jest wymagane';
    }
    
    if (!formData.fillDate) {
      newErrors.fillDate = 'Data wypełnienia jest wymagana';
    }
    
    // Sekcja B - Data Serwisu
    if (!formData.serviceDate) {
      newErrors.serviceDate = 'Data wykonania serwisu jest wymagana';
    }
    
    if (!formData.serviceTime) {
      newErrors.serviceTime = 'Godzina wykonania serwisu jest wymagana';
    }
    
    // Sekcja C - Zadania Serwisowe
    const taskFields = [
      'filterCleaning', 'actuatorCheck', 'sensorCleaning', 
      'pneumaticCheck', 'actuatorAirtightness', 'oilLevelCheck',
      'controlChamberCleaning', 'screwsNutsCheck', 'rubberGasketCheck'
    ];
    
    taskFields.forEach(field => {
      if (!formData[field]) {
        newErrors[field] = 'Proszę wybrać opcję';
      }
    });
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    
    if (saving) return;
    
    if (!validateForm()) {
      return;
    }

    try {
      setSaving(true);
      const odpowiedzData = {
        email: formData.email,
        employeeName: formData.employeeName,
        position: formData.position,
        fillDate: formData.fillDate,
        serviceDate: formData.serviceDate,
        serviceTime: formData.serviceTime,
        filterCleaning: formData.filterCleaning,
        actuatorCheck: formData.actuatorCheck,
        sensorCleaning: formData.sensorCleaning,
        pneumaticCheck: formData.pneumaticCheck,
        actuatorAirtightness: formData.actuatorAirtightness,
        oilLevelCheck: formData.oilLevelCheck,
        controlChamberCleaning: formData.controlChamberCleaning,
        screwsNutsCheck: formData.screwsNutsCheck,
        rubberGasketCheck: formData.rubberGasketCheck,
        additionalNotes: formData.additionalNotes,
        type: 'service-report'
      };

      if (isEditMode && editId) {
        odpowiedzData.updatedAt = serverTimestamp();
        const docRef = doc(db, 'Forms/TygodniowyRaportSerwisu/Odpowiedzi', editId);
        await updateDoc(docRef, odpowiedzData);
        console.log('Formularz serwisu zaktualizowany');
      } else {
        odpowiedzData.createdAt = serverTimestamp();
        const odpowiedziRef = collection(db, 'Forms/TygodniowyRaportSerwisu/Odpowiedzi');
        await addDoc(odpowiedziRef, odpowiedzData);
        console.log('Formularz serwisu wysłany');
      }
      
      setShowSuccess(true);
      
      // Reset formularza po pomyślnym wysłaniu
      if (!isEditMode) {
        setTimeout(() => {
          setFormData({
            email: currentUser?.email || '',
            employeeName: '',
            position: '',
            fillDate: new Date(),
            serviceDate: new Date(),
            serviceTime: new Date(),
            filterCleaning: '',
            actuatorCheck: '',
            sensorCleaning: '',
            pneumaticCheck: '',
            actuatorAirtightness: '',
            oilLevelCheck: '',
            controlChamberCleaning: '',
            screwsNutsCheck: '',
            rubberGasketCheck: '',
            additionalNotes: ''
          });
          setShowSuccess(false);
          navigate('/hall-data/forms');
        }, 2000);
      } else {
        setTimeout(() => {
          navigate('/hall-data/forms/responses?type=service');
        }, 2000);
      }
      
    } catch (error) {
      console.error('Błąd podczas zapisywania formularza:', error);
      alert('Wystąpił błąd podczas zapisywania formularza. Spróbuj ponownie.');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    navigate('/hall-data/forms');
  };

  return (
    <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={pl}>
      <Container maxWidth="md" sx={getFormContainerStyles(theme)}>
        <Paper elevation={3} sx={getFormPaperStyles(theme)}>
          {/* Header */}
          <Box sx={getFormHeaderStyles(theme)}>
            <BuildIcon sx={{ fontSize: 40, mr: 2 }} />
            <Typography variant="h4" component="h1">
              Formularz - Tygodniowy Serwis
            </Typography>
          </Box>

          <Box sx={{ p: 3 }}>
            <Alert severity="info" sx={{ mb: 3 }}>
              W razie awarii i pilnych zgłoszeń prosimy o kontakt: <strong>mateusz@bgwpharma.com</strong>
            </Alert>

            <form onSubmit={handleSubmit}>
              {/* SEKCJA 1 z 5 - IDENTYFIKACJA */}
              <Box sx={getFormSectionStyles(theme)}>
                <Typography variant="subtitle2" sx={{ mb: 1, color: 'primary.main', fontWeight: 'bold' }}>
                  Sekcja 1 z 5
                </Typography>
                <Typography variant="h6" gutterBottom sx={{ fontWeight: 'bold', color: 'primary.main' }}>
                  Sekcja A - Identyfikacja
                </Typography>
                <Typography variant="body2" color="text.secondary" gutterBottom sx={{ mb: 2 }}>
                  Opis (opcjonalnie)
                </Typography>
                <Divider sx={{ mb: 3 }} />
                
                <Grid container spacing={3}>
                  <Grid item xs={12}>
                    <TextField
                      fullWidth
                      required
                      label="Imię i nazwisko osoby wypełniającej formularz"
                      value={formData.employeeName}
                      onChange={handleInputChange('employeeName')}
                      error={!!errors.employeeName}
                      helperText={errors.employeeName || 'Tekst krótkiej odpowiedzi'}
                      placeholder="Wprowadź imię i nazwisko"
                    />
                  </Grid>
                  
                  <Grid item xs={12}>
                    <TextField
                      fullWidth
                      required
                      label="Stanowisko/rola (np. Technik, Kierownik)"
                      value={formData.position}
                      onChange={handleInputChange('position')}
                      error={!!errors.position}
                      helperText={errors.position || 'Tekst krótkiej odpowiedzi'}
                      placeholder="Wprowadź stanowisko"
                    />
                  </Grid>
                  
                  <Grid item xs={12}>
                    <DatePicker
                      label="Data wypełnienia raportu "
                      value={formData.fillDate}
                      onChange={handleDateChange('fillDate')}
                      slotProps={{
                        textField: {
                          fullWidth: true,
                          required: true,
                          error: !!errors.fillDate,
                          helperText: errors.fillDate || 'Miesiąc, dzień, rok'
                        }
                      }}
                    />
                  </Grid>
                </Grid>
              </Box>

              {/* SEKCJA 2 z 5 - DATA SERWISU */}
              <Box sx={getFormSectionStyles(theme)}>
                <Typography variant="subtitle2" sx={{ mb: 1, color: 'primary.main', fontWeight: 'bold' }}>
                  Sekcja 2 z 5
                </Typography>
                <Typography variant="h6" gutterBottom sx={{ fontWeight: 'bold', color: 'primary.main' }}>
                  Sekcja B - Data Serwisu
                </Typography>
                <Typography variant="body2" color="text.secondary" gutterBottom sx={{ mb: 2 }}>
                  Opis (opcjonalnie)
                </Typography>
                <Divider sx={{ mb: 3 }} />
                
                <Grid container spacing={3}>
                  <Grid item xs={12}>
                    <DatePicker
                      label="Data wykonania serwisu "
                      value={formData.serviceDate}
                      onChange={handleDateChange('serviceDate')}
                      slotProps={{
                        textField: {
                          fullWidth: true,
                          required: true,
                          error: !!errors.serviceDate,
                          helperText: errors.serviceDate || 'Miesiąc, dzień, rok'
                        }
                      }}
                    />
                  </Grid>
                  
                  <Grid item xs={12}>
                    <TimePicker
                      label="Godzina wykonania serwisu "
                      value={formData.serviceTime}
                      onChange={handleDateChange('serviceTime')}
                      slotProps={{
                        textField: {
                          fullWidth: true,
                          required: true,
                          error: !!errors.serviceTime,
                          helperText: errors.serviceTime || 'Godzina'
                        }
                      }}
                    />
                  </Grid>
                </Grid>
              </Box>

              {/* SEKCJA 4 z 5 - ZADANIA SERWISOWE */}
              <Box sx={getFormSectionStyles(theme)}>
                <Typography variant="subtitle2" sx={{ mb: 1, color: 'primary.main', fontWeight: 'bold' }}>
                  Sekcja 4 z 5
                </Typography>
                <Typography variant="h6" gutterBottom sx={{ fontWeight: 'bold', color: 'primary.main' }}>
                  Sekcja C - Zadania Serwisowe
                </Typography>
                <Typography variant="body2" color="text.secondary" gutterBottom sx={{ mb: 2 }}>
                  Opis (opcjonalnie)
                </Typography>
                <Divider sx={{ mb: 3 }} />
                
                {[
                  { field: 'filterCleaning', label: 'Wyczyszczenie filtrów na ssawkach' },
                  { field: 'actuatorCheck', label: 'Sprawdzenie ustawienia kontr przy siłowniku, który otwiera przepustnicę sypania produktu' },
                  { field: 'sensorCleaning', label: 'Przedmuchanie czujników na podczerwień w komorze sterującej linii produkcyjnej' },
                  { field: 'pneumaticCheck', label: 'Sprawdzenie szczelności układu pneumatycznego' },
                  { field: 'actuatorAirtightness', label: 'Sprawdzenie siłowników pod kątem szczelności powietrza' },
                  { field: 'oilLevelCheck', label: 'Sprawdzenie poziomu oleju w naoliwiaczu' },
                  { field: 'controlChamberCleaning', label: 'Wyczyszczenie komory sterującej' },
                  { field: 'screwsNutsCheck', label: 'Ogólne sprawdzenie śrub i nakrętek maszyny' },
                  { field: 'rubberGasketCheck', label: 'Sprawdzenie gum na dościu opakowań (doypacków)' }
                ].map((task, index) => (
                  <Box key={task.field} sx={{ mb: 3 }}>
                    <FormControl component="fieldset" error={!!errors[task.field]} required fullWidth>
                      <FormLabel component="legend" sx={{ mb: 1 }}>{task.label} </FormLabel>
                      <RadioGroup
                        row
                        value={formData[task.field]}
                        onChange={handleInputChange(task.field)}
                      >
                        <FormControlLabel value="Wykonano" control={<Radio />} label="Wykonano" />
                        <FormControlLabel value="Nie wykonano" control={<Radio />} label="Nie wykonano" />
                      </RadioGroup>
                      {errors[task.field] && (
                        <Typography variant="caption" color="error" sx={{ mt: 0.5 }}>
                          {errors[task.field]}
                        </Typography>
                      )}
                    </FormControl>
                    {index < 8 && <Divider sx={{ mt: 2 }} />}
                  </Box>
                ))}
              </Box>

              {/* SEKCJA 5 z 5 - DODATKOWE UWAGI */}
              <Box sx={getFormSectionStyles(theme)}>
                <Typography variant="subtitle2" sx={{ mb: 1, color: 'primary.main', fontWeight: 'bold' }}>
                  Sekcja 5 z 5
                </Typography>
                <Typography variant="h6" gutterBottom sx={{ fontWeight: 'bold', color: 'primary.main' }}>
                  Sekcja D - Dodatkowe Uwagi
                </Typography>
                <Typography variant="body2" color="text.secondary" gutterBottom sx={{ mb: 2 }}>
                  Opis (opcjonalnie)
                </Typography>
                <Divider sx={{ mb: 3 }} />
                
                <TextField
                  fullWidth
                  multiline
                  rows={4}
                  label="Dodatkowe informacje lub komentarze"
                  value={formData.additionalNotes}
                  onChange={handleInputChange('additionalNotes')}
                  placeholder="Wprowadź dodatkowe uwagi dotyczące wykonanego serwisu..."
                  helperText="Tekst długiej odpowiedzi"
                />
              </Box>

              {/* Przyciski akcji */}
              <Box sx={getFormActionsStyles(theme)}>
                <Button
                  variant="outlined"
                  onClick={handleCancel}
                  disabled={saving}
                  startIcon={<ArrowBackIcon />}
                >
                  Anuluj
                </Button>
                <Button
                  type="submit"
                  variant="contained"
                  color="primary"
                  disabled={saving}
                  startIcon={saving ? <CircularProgress size={20} /> : <SaveIcon />}
                  sx={getFormButtonStyles(theme)}
                >
                  {saving ? 'Zapisywanie...' : (isEditMode ? 'Zaktualizuj' : 'Wyślij')}
                </Button>
              </Box>
            </form>
          </Box>
        </Paper>

        {/* Snackbar sukcesu */}
        <Snackbar
          open={showSuccess}
          autoHideDuration={6000}
          onClose={() => setShowSuccess(false)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        >
          <Alert severity="success" sx={{ width: '100%' }}>
            {isEditMode ? 'Formularz serwisu został zaktualizowany!' : 'Formularz serwisu został wysłany pomyślnie!'}
          </Alert>
        </Snackbar>
      </Container>
    </LocalizationProvider>
  );
};

export default ServiceReportFormPage;

