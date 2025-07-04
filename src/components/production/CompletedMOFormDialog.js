import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  IconButton,
  Box,
  Typography,
  Container,
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
import { Close as CloseIcon, Send as SendIcon, ArrowBack as ArrowBackIcon } from '@mui/icons-material';
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { pl } from 'date-fns/locale';
import { getMONumbersForSelect } from '../../services/moService';
import { db, storage } from '../../services/firebase/config';
import { collection, addDoc, serverTimestamp, doc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useAuth } from '../../hooks/useAuth';

const CompletedMOFormDialog = ({ 
  open, 
  onClose, 
  task = null,
  onSuccess = null 
}) => {
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

  const [validationErrors, setValidationErrors] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [moOptions, setMoOptions] = useState([]);
  const [loadingMO, setLoadingMO] = useState(false);

  // Przygotuj dane wstępne na podstawie zadania produkcyjnego
  useEffect(() => {
    if (task && open) {
      setFormData(prev => ({
        ...prev,
        email: currentUser?.email || '',
        moNumber: task.moNumber || '',
        date: new Date(),
        time: new Date().toLocaleTimeString('pl', { hour: '2-digit', minute: '2-digit' })
      }));
    }
  }, [task, open, currentUser]);

  // Pobierz numery MO przy pierwszym renderowaniu komponentu
  useEffect(() => {
    if (open) {
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
    }
  }, [open]);

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
        
        // Dodaj dokument do kolekcji
        await addDoc(odpowiedziRef, odpowiedzData);
        console.log('Formularz zakończonego MO wysłany z danymi:', odpowiedzData);
        
        setSubmitted(true);
        
        // Wywołaj callback sukcesu i zamknij dialog
        if (onSuccess) {
          onSuccess(odpowiedzData);
        }
        setTimeout(() => {
          if (onClose) {
            onClose();
          }
        }, 1500);
        
      } catch (error) {
        console.error('Błąd podczas zapisywania formularza zakończonego MO:', error);
        alert(`Wystąpił błąd podczas zapisywania formularza: ${error.message}`);
      }
    }
  };

  const handleClose = () => {
    // Resetuj formularz przy zamknięciu
    setFormData({
      email: currentUser?.email || '',
      date: new Date(),
      time: '',
      moNumber: task?.moNumber || '',
      productQuantity: '',
      packagingLoss: '',
      bulkLoss: '',
      rawMaterialLoss: '',
      mixingPlanReport: null
    });
    setValidationErrors({});
    setSubmitted(false);
    onClose();
  };

  return (
    <Dialog 
      open={open} 
      onClose={handleClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: { 
          minHeight: '80vh',
          maxHeight: '90vh'
        }
      }}
    >
      <DialogTitle>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h6">
            Raport - Skończone MO
          </Typography>
          <IconButton
            aria-label="close"
            onClick={handleClose}
            sx={{
              color: (theme) => theme.palette.grey[500],
            }}
          >
            <CloseIcon />
          </IconButton>
        </Box>
      </DialogTitle>
      <DialogContent sx={{ p: 3 }}>
        <Box sx={{ mb: 3 }}>
          <Typography variant="body2" align="center" color="text.secondary" paragraph>
            W razie awarii i pilnych zgłoszeń prosimy o kontakt: mateusz@bgwpharma.com
          </Typography>
          <Divider />
        </Box>

        {submitted && (
          <Alert severity="success" sx={{ mb: 3 }}>
            Raport skończonego MO został wysłany pomyślnie!
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
                  readOnly: true,
                }}
              />
            </Grid>
            
            <Grid item xs={12} sm={6}>
              <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={pl}>
                <DateTimePicker
                  label="Data wypełnienia"
                  value={formData.date}
                  onChange={handleDateChange}
                  renderInput={(params) => 
                    <TextField {...params} fullWidth required />
                  }
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
                type="time"
                value={formData.time}
                onChange={handleChange}
                error={!!validationErrors.time}
                helperText={validationErrors.time}
                InputLabelProps={{
                  shrink: true,
                }}
              />
            </Grid>
            
            <Grid item xs={12}>
              <FormControl 
                fullWidth 
                required 
                error={!!validationErrors.moNumber}
              >
                <InputLabel>Manufacturing Order</InputLabel>
                <Select
                  name="moNumber"
                  value={formData.moNumber}
                  onChange={handleChange}
                  label="Manufacturing Order"
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
                label="Ilość produktu końcowego (szt.)"
                name="productQuantity"
                type="number"
                value={formData.productQuantity}
                onChange={handleChange}
                error={!!validationErrors.productQuantity}
                helperText={validationErrors.productQuantity}
                inputProps={{ min: 0, step: 'any' }}
              />
            </Grid>
            
            <Grid item xs={12} sm={4}>
              <TextField
                fullWidth
                label="Straty opakowania (szt.)"
                name="packagingLoss"
                type="number"
                value={formData.packagingLoss}
                onChange={handleChange}
                error={!!validationErrors.packagingLoss}
                helperText={validationErrors.packagingLoss}
                inputProps={{ min: 0, step: 'any' }}
              />
            </Grid>
            
            <Grid item xs={12} sm={4}>
              <TextField
                fullWidth
                label="Straty wieczka (szt.)"
                name="bulkLoss"
                type="number"
                value={formData.bulkLoss}
                onChange={handleChange}
                error={!!validationErrors.bulkLoss}
                helperText={validationErrors.bulkLoss}
                inputProps={{ min: 0, step: 'any' }}
              />
            </Grid>
            
            <Grid item xs={12} sm={4}>
              <TextField
                fullWidth
                label="Straty surowca (kg)"
                name="rawMaterialLoss"
                type="number"
                value={formData.rawMaterialLoss}
                onChange={handleChange}
                error={!!validationErrors.rawMaterialLoss}
                helperText={validationErrors.rawMaterialLoss}
                inputProps={{ min: 0, step: 'any' }}
              />
            </Grid>
            
            <Grid item xs={12}>
              <Typography variant="subtitle2" gutterBottom>
                Raport planu mieszań
              </Typography>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Plik PDF z raportem mieszań (opcjonalnie)
              </Typography>
              <input
                type="file"
                accept=".pdf"
                onChange={handleFileChange}
                style={{ width: '100%', marginTop: '8px' }}
              />
            </Grid>
            
            <Grid item xs={12}>
              <Box sx={{ display: 'flex', gap: 2 }}>
                <Button
                  variant="outlined"
                  color="secondary"
                  startIcon={<ArrowBackIcon />}
                  onClick={handleClose}
                >
                  Anuluj
                </Button>
                <Button
                  type="submit"
                  variant="contained"
                  color="primary"
                  fullWidth
                  size="large"
                  startIcon={<SendIcon />}
                >
                  Wyślij raport
                </Button>
              </Box>
            </Grid>
          </Grid>
        </Box>
      </DialogContent>
    </Dialog>
  );
};

export default CompletedMOFormDialog; 