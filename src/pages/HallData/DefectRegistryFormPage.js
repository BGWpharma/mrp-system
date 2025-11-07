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
import { Save as SaveIcon, ArrowBack as ArrowBackIcon, BugReport as BugReportIcon } from '@mui/icons-material';
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

const DefectRegistryFormPage = () => {
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
    
    // Sekcja B: Szczegóły Usterki/Serwisu
    defectDescription: '',
    detectionDate: new Date(),
    detectionTime: new Date(),
    diagnosis: '',
    repairStatus: '',
    
    // Sekcja C: Dodatkowe uwagi
    additionalNotes: ''
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
        
        const detectionDate = editData.detectionDate ? 
          (editData.detectionDate.toDate ? editData.detectionDate.toDate() : new Date(editData.detectionDate)) : 
          new Date();
        
        const detectionTime = editData.detectionTime ? 
          (editData.detectionTime.toDate ? editData.detectionTime.toDate() : new Date(editData.detectionTime)) : 
          new Date();
        
        setFormData({
          email: editData.email || '',
          employeeName: editData.employeeName || '',
          position: editData.position || '',
          fillDate: fillDate,
          defectDescription: editData.defectDescription || '',
          detectionDate: detectionDate,
          detectionTime: detectionTime,
          diagnosis: editData.diagnosis || '',
          repairStatus: editData.repairStatus || '',
          additionalNotes: editData.additionalNotes || ''
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
    
    if (!formData.defectDescription?.trim()) {
      newErrors.defectDescription = 'Opis usterki jest wymagany';
    }
    
    if (!formData.detectionDate) {
      newErrors.detectionDate = 'Data wykrycia usterki jest wymagana';
    }
    
    if (!formData.detectionTime) {
      newErrors.detectionTime = 'Godzina wykrycia usterki jest wymagana';
    }
    
    if (!formData.diagnosis?.trim()) {
      newErrors.diagnosis = 'Diagnoza jest wymagana';
    }
    
    if (!formData.repairStatus) {
      newErrors.repairStatus = 'Status naprawy jest wymagany';
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
        defectDescription: formData.defectDescription,
        detectionDate: formData.detectionDate,
        detectionTime: formData.detectionTime,
        diagnosis: formData.diagnosis,
        repairStatus: formData.repairStatus,
        additionalNotes: formData.additionalNotes,
        type: 'defect-registry'
      };

      if (isEditMode && editId) {
        odpowiedzData.updatedAt = serverTimestamp();
        const docRef = doc(db, 'Forms/RejestrUsterek/Odpowiedzi', editId);
        await updateDoc(docRef, odpowiedzData);
        console.log('Rejestr usterek zaktualizowany');
      } else {
        odpowiedzData.createdAt = serverTimestamp();
        const odpowiedziRef = collection(db, 'Forms/RejestrUsterek/Odpowiedzi');
        await addDoc(odpowiedziRef, odpowiedzData);
        console.log('Rejestr usterek wysłany');
      }
      
      setShowSuccess(true);
      
      if (!isEditMode) {
        setTimeout(() => {
          setFormData({
            email: currentUser?.email || '',
            employeeName: '',
            position: '',
            fillDate: new Date(),
            defectDescription: '',
            detectionDate: new Date(),
            detectionTime: new Date(),
            diagnosis: '',
            repairStatus: '',
            additionalNotes: ''
          });
          setShowSuccess(false);
          navigate('/hall-data/forms');
        }, 2000);
      } else {
        setTimeout(() => {
          navigate('/hall-data/forms/responses?type=defect');
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
            <BugReportIcon sx={{ fontSize: 40, mr: 2 }} />
            <Typography variant="h4" component="h1">
              Formularz - Rejestr Usterek
            </Typography>
          </Box>

          <Box sx={{ p: 3 }}>
            <Alert severity="info" sx={{ mb: 3 }}>
              W razie awarii i pilnych zgłoszeń prosimy o kontakt: <strong>mateusz@bgwpharma.com</strong>
            </Alert>

            <form onSubmit={handleSubmit}>
              {/* SEKCJA 1 z 4 - NAGŁÓWEK */}
              <Typography variant="subtitle2" sx={{ mb: 2, color: 'primary.main', fontWeight: 'bold' }}>
                Sekcja 1 z 4
              </Typography>

              {/* SEKCJA 2 z 4 - IDENTYFIKACJA */}
              <Box sx={getFormSectionStyles(theme)}>
                <Typography variant="subtitle2" sx={{ mb: 1, color: 'primary.main', fontWeight: 'bold' }}>
                  Sekcja 2 z 4
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

              {/* SEKCJA 3 z 4 - SZCZEGÓŁY USTERKI/SERWISU */}
              <Box sx={getFormSectionStyles(theme)}>
                <Typography variant="subtitle2" sx={{ mb: 1, color: 'primary.main', fontWeight: 'bold' }}>
                  Sekcja 3 z 4
                </Typography>
                <Typography variant="h6" gutterBottom sx={{ fontWeight: 'bold', color: 'primary.main' }}>
                  Sekcja B - Szczegóły Usterki/Serwisu
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
                      multiline
                      rows={4}
                      label="Opis usterki"
                      value={formData.defectDescription}
                      onChange={handleInputChange('defectDescription')}
                      error={!!errors.defectDescription}
                      helperText={errors.defectDescription || 'Tekst długiej odpowiedzi'}
                      placeholder="Wprowadź szczegółowy opis usterki"
                    />
                  </Grid>
                  
                  <Grid item xs={12}>
                    <DatePicker
                      label="Data wykrycia usterki *"
                      value={formData.detectionDate}
                      onChange={handleDateChange('detectionDate')}
                      slotProps={{
                        textField: {
                          fullWidth: true,
                          required: true,
                          error: !!errors.detectionDate,
                          helperText: errors.detectionDate || 'Miesiąc, dzień, rok'
                        }
                      }}
                    />
                  </Grid>
                  
                  <Grid item xs={12}>
                    <TimePicker
                      label="Godzina wykrycia usterki *"
                      value={formData.detectionTime}
                      onChange={handleDateChange('detectionTime')}
                      slotProps={{
                        textField: {
                          fullWidth: true,
                          required: true,
                          error: !!errors.detectionTime,
                          helperText: errors.detectionTime || 'Godzina'
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
                      label="Diagnoza"
                      value={formData.diagnosis}
                      onChange={handleInputChange('diagnosis')}
                      error={!!errors.diagnosis}
                      helperText={errors.diagnosis || 'Tekst długiej odpowiedzi'}
                      placeholder="Wprowadź diagnozę problemu"
                    />
                  </Grid>
                  
                  <Grid item xs={12}>
                    <FormControl component="fieldset" error={!!errors.repairStatus} required fullWidth>
                      <FormLabel component="legend" sx={{ mb: 1 }}>
                        Status naprawy *
                      </FormLabel>
                      <RadioGroup
                        value={formData.repairStatus}
                        onChange={handleInputChange('repairStatus')}
                      >
                        <FormControlLabel value="Oczekuje" control={<Radio />} label="Oczekuje" />
                        <FormControlLabel value="W trakcie" control={<Radio />} label="W trakcie" />
                        <FormControlLabel value="Zakończono" control={<Radio />} label="Zakończono" />
                      </RadioGroup>
                      {errors.repairStatus && (
                        <Typography variant="caption" color="error" sx={{ mt: 0.5 }}>
                          {errors.repairStatus}
                        </Typography>
                      )}
                    </FormControl>
                  </Grid>
                </Grid>
              </Box>

              {/* SEKCJA 4 z 4 - DODATKOWE UWAGI */}
              <Box sx={getFormSectionStyles(theme)}>
                <Typography variant="subtitle2" sx={{ mb: 1, color: 'primary.main', fontWeight: 'bold' }}>
                  Sekcja 4 z 4
                </Typography>
                <Typography variant="h6" gutterBottom sx={{ fontWeight: 'bold', color: 'primary.main' }}>
                  Sekcja C - Dodatkowe Uwagi
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
                  placeholder="Wprowadź dodatkowe uwagi dotyczące usterki..."
                  helperText="Tekst długiej odpowiedzi"
                />
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
            {isEditMode ? 'Rejestr usterek został zaktualizowany!' : 'Rejestr usterek został wysłany pomyślnie!'}
          </Alert>
        </Snackbar>
      </Container>
    </LocalizationProvider>
  );
};

export default DefectRegistryFormPage;

