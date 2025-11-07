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
import { DatePicker } from '@mui/x-date-pickers';
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

const ServiceRepairReportFormPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser } = useAuth();
  const theme = useTheme();
  
  const isEditMode = new URLSearchParams(location.search).get('edit') === 'true';
  
  const [formData, setFormData] = useState({
    email: '',
    
    // Sekcja A: Identyfikacja
    employeeName: '',
    position: '',
    fillDate: new Date(),
    
    // Sekcja B: Zadanie
    taskType: '',
    completionDate: new Date(),
    performedWork: '',
    workDescription: ''
  });
  
  const [showSuccess, setShowSuccess] = useState(false);
  const [errors, setErrors] = useState({});
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isEditMode) {
      const editData = JSON.parse(sessionStorage.getItem('editFormData'));
      if (editData) {
        const fillDate = editData.fillDate ? 
          (editData.fillDate.toDate ? editData.fillDate.toDate() : new Date(editData.fillDate)) : 
          new Date();
        
        const completionDate = editData.completionDate ? 
          (editData.completionDate.toDate ? editData.completionDate.toDate() : new Date(editData.completionDate)) : 
          new Date();
        
        setFormData({
          email: editData.email || '',
          employeeName: editData.employeeName || '',
          position: editData.position || '',
          fillDate: fillDate,
          taskType: editData.taskType || '',
          completionDate: completionDate,
          performedWork: editData.performedWork || '',
          workDescription: editData.workDescription || ''
        });
        
        setEditId(editData.id);
      }
      sessionStorage.removeItem('editFormData');
    }
  }, [isEditMode]);

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
    
    if (!formData.employeeName?.trim()) {
      newErrors.employeeName = 'Imię i nazwisko jest wymagane';
    }
    
    if (!formData.position?.trim()) {
      newErrors.position = 'Stanowisko/rola jest wymagane';
    }
    
    if (!formData.fillDate) {
      newErrors.fillDate = 'Data wypełnienia jest wymagana';
    }
    
    if (!formData.taskType) {
      newErrors.taskType = 'Rodzaj zadania jest wymagany';
    }
    
    if (!formData.completionDate) {
      newErrors.completionDate = 'Data wykonania jest wymagana';
    }
    
    if (!formData.performedWork?.trim()) {
      newErrors.performedWork = 'Wykonany serwis/naprawa jest wymagany';
    }
    
    if (!formData.workDescription?.trim()) {
      newErrors.workDescription = 'Opis serwisu/naprawy jest wymagany';
    }
    
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
        taskType: formData.taskType,
        completionDate: formData.completionDate,
        performedWork: formData.performedWork,
        workDescription: formData.workDescription,
        type: 'service-repair-report'
      };

      if (isEditMode && editId) {
        odpowiedzData.updatedAt = serverTimestamp();
        const docRef = doc(db, 'Forms/RaportSerwisNapraw/Odpowiedzi', editId);
        await updateDoc(docRef, odpowiedzData);
        console.log('Raport serwisu/napraw zaktualizowany');
      } else {
        odpowiedzData.createdAt = serverTimestamp();
        const odpowiedziRef = collection(db, 'Forms/RaportSerwisNapraw/Odpowiedzi');
        await addDoc(odpowiedziRef, odpowiedzData);
        console.log('Raport serwisu/napraw wysłany');
      }
      
      setShowSuccess(true);
      
      if (!isEditMode) {
        setTimeout(() => {
          setFormData({
            email: currentUser?.email || '',
            employeeName: '',
            position: '',
            fillDate: new Date(),
            taskType: '',
            completionDate: new Date(),
            performedWork: '',
            workDescription: ''
          });
          setShowSuccess(false);
          navigate('/hall-data/forms');
        }, 2000);
      } else {
        setTimeout(() => {
          navigate('/hall-data/forms/responses?type=service-repair');
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
          <Box sx={getFormHeaderStyles(theme)}>
            <BuildIcon sx={{ fontSize: 40, mr: 2 }} />
            <Typography variant="h4" component="h1">
              Formularz - Raport Serwisu/Napraw
            </Typography>
          </Box>

          <Box sx={{ p: 3 }}>
            <Alert severity="info" sx={{ mb: 3 }}>
              W razie awarii i pilnych zgłoszeń prosimy o kontakt: <strong>mateusz@bgwpharma.com</strong>
            </Alert>

            <form onSubmit={handleSubmit}>
              {/* SEKCJA 1 z 3 - NAGŁÓWEK */}
              <Typography variant="subtitle2" sx={{ mb: 2, color: 'primary.main', fontWeight: 'bold' }}>
                Sekcja 1 z 3
              </Typography>

              {/* SEKCJA 2 z 3 - IDENTYFIKACJA */}
              <Box sx={getFormSectionStyles(theme)}>
                <Typography variant="subtitle2" sx={{ mb: 1, color: 'primary.main', fontWeight: 'bold' }}>
                  Sekcja 2 z 3
                </Typography>
                <Typography variant="h6" gutterBottom sx={{ fontWeight: 'bold', color: 'primary.main' }}>
                  SEKCJA A - Identyfikacja
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
                      label="Data wypełnienia raportu *"
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

              {/* SEKCJA 3 z 3 - ZADANIE */}
              <Box sx={getFormSectionStyles(theme)}>
                <Typography variant="subtitle2" sx={{ mb: 1, color: 'primary.main', fontWeight: 'bold' }}>
                  Sekcja 3 z 3
                </Typography>
                <Typography variant="h6" gutterBottom sx={{ fontWeight: 'bold', color: 'primary.main' }}>
                  SEKCJA B - Zadanie
                </Typography>
                <Typography variant="body2" color="text.secondary" gutterBottom sx={{ mb: 2 }}>
                  Opis (opcjonalnie)
                </Typography>
                <Divider sx={{ mb: 3 }} />
                
                <Grid container spacing={3}>
                  <Grid item xs={12}>
                    <FormControl component="fieldset" error={!!errors.taskType} required fullWidth>
                      <FormLabel component="legend" sx={{ mb: 1 }}>
                        Rodzaj zadania *
                      </FormLabel>
                      <RadioGroup
                        value={formData.taskType}
                        onChange={handleInputChange('taskType')}
                      >
                        <FormControlLabel value="Serwis" control={<Radio />} label="Serwis" />
                        <FormControlLabel value="Naprawa" control={<Radio />} label="Naprawa" />
                      </RadioGroup>
                      {errors.taskType && (
                        <Typography variant="caption" color="error" sx={{ mt: 0.5 }}>
                          {errors.taskType}
                        </Typography>
                      )}
                    </FormControl>
                  </Grid>
                  
                  <Grid item xs={12}>
                    <DatePicker
                      label="Data wykonania serwisu/naprawy *"
                      value={formData.completionDate}
                      onChange={handleDateChange('completionDate')}
                      slotProps={{
                        textField: {
                          fullWidth: true,
                          required: true,
                          error: !!errors.completionDate,
                          helperText: errors.completionDate || 'Miesiąc, dzień, rok'
                        }
                      }}
                    />
                  </Grid>
                  
                  <Grid item xs={12}>
                    <TextField
                      fullWidth
                      required
                      multiline
                      rows={4}
                      label="Wykonany serwis/naprawa"
                      value={formData.performedWork}
                      onChange={handleInputChange('performedWork')}
                      error={!!errors.performedWork}
                      helperText={errors.performedWork || 'Tekst długiej odpowiedzi'}
                      placeholder="Wprowadź szczegóły wykonanego serwisu lub naprawy"
                    />
                  </Grid>
                  
                  <Grid item xs={12}>
                    <TextField
                      fullWidth
                      required
                      multiline
                      rows={4}
                      label="Opis serwisu/naprawy"
                      value={formData.workDescription}
                      onChange={handleInputChange('workDescription')}
                      error={!!errors.workDescription}
                      helperText={errors.workDescription || 'Tekst długiej odpowiedzi'}
                      placeholder="Wprowadź szczegółowy opis wykonanych prac"
                    />
                  </Grid>
                </Grid>
              </Box>

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

        <Snackbar
          open={showSuccess}
          autoHideDuration={6000}
          onClose={() => setShowSuccess(false)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        >
          <Alert severity="success" sx={{ width: '100%' }}>
            {isEditMode ? 'Raport serwisu/napraw został zaktualizowany!' : 'Raport serwisu/napraw został wysłany pomyślnie!'}
          </Alert>
        </Snackbar>
      </Container>
    </LocalizationProvider>
  );
};

export default ServiceRepairReportFormPage;

