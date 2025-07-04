import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  IconButton,
  Box,
  Typography,
  TextField,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Grid,
  Alert,
  Divider,
  RadioGroup,
  Radio,
  FormControlLabel,
  FormLabel,
  Checkbox,
  FormGroup,
  CircularProgress
} from '@mui/material';
import { Close as CloseIcon, Send as SendIcon, ArrowBack as ArrowBackIcon } from '@mui/icons-material';
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { pl } from 'date-fns/locale';
import { getMONumbersForSelect } from '../../services/moService';
import { db } from '../../services/firebase/config';
import { collection, addDoc, serverTimestamp, getDocs, query, where } from 'firebase/firestore';
import { useAuth } from '../../hooks/useAuth';
import { useStaffOptions, useShiftWorkerOptions, useProductOptionsForPrinting } from '../../hooks/useFormOptions';

// Funkcja do pobierania szczegółów zadania produkcyjnego (MO) na podstawie numeru MO
const getMODetailsById = async (moNumber) => {
  try {
    const tasksRef = collection(db, 'productionTasks');
    const q = query(tasksRef, where('moNumber', '==', moNumber));
    const querySnapshot = await getDocs(q);
    
    if (!querySnapshot.empty) {
      const taskDoc = querySnapshot.docs[0];
      const taskData = taskDoc.data();
      
      return {
        id: taskDoc.id,
        moNumber: taskData.moNumber,
        productName: taskData.productName || '',
        lotNumber: taskData.lotNumber || `SN/${taskData.moNumber}`,
        quantity: taskData.quantity || ''
      };
    }
    
    return null;
  } catch (error) {
    console.error('Błąd podczas pobierania szczegółów MO:', error);
    return null;
  }
};

const ProductionShiftFormDialog = ({ 
  open, 
  onClose, 
  task = null,
  onSuccess = null 
}) => {
  const { currentUser } = useAuth();

  // Używamy hooków do pobierania opcji z bazy danych
  const { options: staffOptions, loading: staffLoading } = useStaffOptions();
  const { options: shiftWorkerOptions, loading: shiftWorkersLoading } = useShiftWorkerOptions();
  const { options: productOptions, loading: productLoading } = useProductOptionsForPrinting();

  const [formData, setFormData] = useState({
    email: '',
    responsiblePerson: '',
    fillDate: new Date(),
    fillTime: '',
    shiftWorkers: [],
    shiftType: '',
    product: '',
    moNumber: '',
    productionQuantity: '',
    firstProduct: 'BRAK',
    secondProduct: 'BRAK',
    thirdProduct: 'BRAK',
    firstProductQuantity: '',
    secondProductQuantity: '',
    thirdProductQuantity: '',
    firstProductLoss: '',
    secondProductLoss: '',
    thirdProductLoss: '',
    otherActivities: '',
    machineIssues: ''
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
        product: task.productName || '',
        fillDate: new Date(),
        fillTime: new Date().toLocaleTimeString('pl', { hour: '2-digit', minute: '2-digit' })
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

  const handleChange = async (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    
    // Jeśli zmieniono numer MO, pobierz dodatkowe dane i uzupełnij pola
    if (name === 'moNumber' && value) {
      try {
        setLoadingMO(true);
        const moDetails = await getMODetailsById(value);
        
        if (moDetails) {
          const productName = moDetails.productName || '';
          setFormData(prev => ({
            ...prev,
            product: productName
          }));
        }
      } catch (error) {
        console.error('Błąd podczas pobierania danych MO:', error);
      } finally {
        setLoadingMO(false);
      }
    }
    
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
      fillDate: date
    }));
  };

  const handleWorkersChange = (e) => {
    const { value, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      shiftWorkers: checked
        ? [...prev.shiftWorkers, value]
        : prev.shiftWorkers.filter(worker => worker !== value)
    }));
    
    // Wyczyść błąd walidacji
    if (validationErrors.shiftWorkers) {
      setValidationErrors(prev => ({
        ...prev,
        shiftWorkers: ''
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
    
    if (!formData.responsiblePerson) {
      errors.responsiblePerson = 'Osoba odpowiedzialna jest wymagana';
    }
    
    if (!formData.fillTime) {
      errors.fillTime = 'Godzina wypełnienia jest wymagana';
    }
    
    if (!formData.shiftType) {
      errors.shiftType = 'Typ zmiany jest wymagany';
    }
    
    if (!formData.moNumber) {
      errors.moNumber = 'Numer MO jest wymagany';
    }
    
    if (formData.shiftWorkers.length === 0) {
      errors.shiftWorkers = 'Wybierz przynajmniej jednego pracownika';
    }
    
    if (formData.productionQuantity && isNaN(formData.productionQuantity)) {
      errors.productionQuantity = 'Podaj wartość liczbową';
    }
    
    // Walidacja produktów nadrukowanych
    if (formData.firstProductQuantity && isNaN(formData.firstProductQuantity)) {
      errors.firstProductQuantity = 'Podaj wartość liczbową';
    }
    if (formData.secondProductQuantity && isNaN(formData.secondProductQuantity)) {
      errors.secondProductQuantity = 'Podaj wartość liczbową';
    }
    if (formData.thirdProductQuantity && isNaN(formData.thirdProductQuantity)) {
      errors.thirdProductQuantity = 'Podaj wartość liczbową';
    }
    
    // Walidacja strat
    if (formData.firstProductLoss && isNaN(formData.firstProductLoss)) {
      errors.firstProductLoss = 'Podaj wartość liczbową';
    }
    if (formData.secondProductLoss && isNaN(formData.secondProductLoss)) {
      errors.secondProductLoss = 'Podaj wartość liczbową';
    }
    if (formData.thirdProductLoss && isNaN(formData.thirdProductLoss)) {
      errors.thirdProductLoss = 'Podaj wartość liczbową';
    }
    
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (validate()) {
      try {
        setSubmitted(false);
        
        const odpowiedziRef = collection(db, 'Forms/ZmianaProdukcyjna/Odpowiedzi');
        
        const odpowiedzData = {
          email: formData.email,
          responsiblePerson: formData.responsiblePerson,
          fillDate: formData.fillDate,
          fillTime: formData.fillTime,
          shiftWorkers: formData.shiftWorkers,
          shiftType: formData.shiftType,
          product: formData.product,
          moNumber: formData.moNumber,
          productionQuantity: formData.productionQuantity,
          firstProduct: formData.firstProduct,
          secondProduct: formData.secondProduct,
          thirdProduct: formData.thirdProduct,
          firstProductQuantity: formData.firstProductQuantity,
          secondProductQuantity: formData.secondProductQuantity,
          thirdProductQuantity: formData.thirdProductQuantity,
          firstProductLoss: formData.firstProductLoss,
          secondProductLoss: formData.secondProductLoss,
          thirdProductLoss: formData.thirdProductLoss,
          otherActivities: formData.otherActivities,
          machineIssues: formData.machineIssues,
          createdAt: serverTimestamp()
        };
        
        await addDoc(odpowiedziRef, odpowiedzData);
        console.log('Formularz zmiany produkcyjnej wysłany z danymi:', odpowiedzData);
        
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
        console.error('Błąd podczas zapisywania formularza zmiany produkcyjnej:', error);
        alert(`Wystąpił błąd podczas zapisywania formularza: ${error.message}`);
      }
    }
  };

  const handleClose = () => {
    // Resetuj formularz przy zamknięciu
    setFormData({
      email: currentUser?.email || '',
      responsiblePerson: '',
      fillDate: new Date(),
      fillTime: '',
      shiftWorkers: [],
      shiftType: '',
      product: task?.productName || '',
      moNumber: task?.moNumber || '',
      productionQuantity: '',
      firstProduct: 'BRAK',
      secondProduct: 'BRAK',
      thirdProduct: 'BRAK',
      firstProductQuantity: '',
      secondProductQuantity: '',
      thirdProductQuantity: '',
      firstProductLoss: '',
      secondProductLoss: '',
      thirdProductLoss: '',
      otherActivities: '',
      machineIssues: ''
    });
    setValidationErrors({});
    setSubmitted(false);
    onClose();
  };

  return (
    <Dialog 
      open={open} 
      onClose={handleClose}
      maxWidth="lg"
      fullWidth
      PaperProps={{
        sx: { 
          minHeight: '85vh',
          maxHeight: '95vh'
        }
      }}
    >
      <DialogTitle>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h6">
            Raport - Zmiana Produkcyjna
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
            Raport zmiany produkcyjnej został wysłany pomyślnie!
          </Alert>
        )}
        
        <Box component="form" onSubmit={handleSubmit}>
          <Grid container spacing={3}>
            {/* Sekcja identyfikacji */}
            <Grid item xs={12}>
              <Typography variant="subtitle1" gutterBottom>
                Sekcja: Identyfikacja
              </Typography>
            </Grid>
            
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
              <FormControl fullWidth required error={!!validationErrors.responsiblePerson}>
                <InputLabel>Osoba odpowiedzialna</InputLabel>
                <Select
                  name="responsiblePerson"
                  value={formData.responsiblePerson}
                  onChange={handleChange}
                  label="Osoba odpowiedzialna"
                >
                  {staffOptions.map(option => (
                    <MenuItem key={option} value={option}>{option}</MenuItem>
                  ))}
                </Select>
                {validationErrors.responsiblePerson && (
                  <Typography variant="caption" color="error">
                    {validationErrors.responsiblePerson}
                  </Typography>
                )}
              </FormControl>
            </Grid>
            
            <Grid item xs={12} sm={6}>
              <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={pl}>
                <DateTimePicker
                  label="Data wypełnienia"
                  value={formData.fillDate}
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
                name="fillTime"
                type="time"
                value={formData.fillTime}
                onChange={handleChange}
                error={!!validationErrors.fillTime}
                helperText={validationErrors.fillTime}
                InputLabelProps={{
                  shrink: true,
                }}
              />
            </Grid>
            
            {/* Sekcja zmiany */}
            <Grid item xs={12}>
              <Typography variant="subtitle1" gutterBottom>
                Sekcja: Zmiana
              </Typography>
            </Grid>
            
            <Grid item xs={12}>
              <FormControl component="fieldset" error={!!validationErrors.shiftWorkers}>
                <FormLabel component="legend">Pracownicy w zmianie</FormLabel>
                <FormGroup>
                  {shiftWorkerOptions.map(worker => (
                    <FormControlLabel
                      key={worker}
                      control={
                        <Checkbox
                          value={worker}
                          checked={formData.shiftWorkers.includes(worker)}
                          onChange={handleWorkersChange}
                        />
                      }
                      label={worker}
                    />
                  ))}
                </FormGroup>
                {validationErrors.shiftWorkers && (
                  <Typography variant="caption" color="error">
                    {validationErrors.shiftWorkers}
                  </Typography>
                )}
              </FormControl>
            </Grid>
            
            <Grid item xs={12} sm={6}>
              <FormControl component="fieldset" required error={!!validationErrors.shiftType}>
                <FormLabel component="legend">Typ zmiany</FormLabel>
                <RadioGroup
                  name="shiftType"
                  value={formData.shiftType}
                  onChange={handleChange}
                >
                  <FormControlLabel value="Dzienna" control={<Radio />} label="Dzienna" />
                  <FormControlLabel value="Popołudniowa" control={<Radio />} label="Popołudniowa" />
                  <FormControlLabel value="Nocna" control={<Radio />} label="Nocna" />
                </RadioGroup>
                {validationErrors.shiftType && (
                  <Typography variant="caption" color="error">
                    {validationErrors.shiftType}
                  </Typography>
                )}
              </FormControl>
            </Grid>
            
            {/* Sekcja produkcji */}
            <Grid item xs={12}>
              <Typography variant="subtitle1" gutterBottom>
                Sekcja: Produkcja
              </Typography>
            </Grid>
            
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Produkt"
                name="product"
                value={formData.product}
                onChange={handleChange}
                InputProps={{
                  readOnly: true,
                }}
              />
            </Grid>
            
            <Grid item xs={12} sm={6}>
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
                fullWidth
                label="Ilość produkcji (szt.)"
                name="productionQuantity"
                type="number"
                value={formData.productionQuantity}
                onChange={handleChange}
                error={!!validationErrors.productionQuantity}
                helperText={validationErrors.productionQuantity}
                inputProps={{ min: 0, step: 'any' }}
              />
            </Grid>
            
            {/* Sekcja nadrukowanych produktów */}
            <Grid item xs={12}>
              <Typography variant="subtitle1" gutterBottom>
                Rodzaj nadrukowanych doypack/tub
              </Typography>
            </Grid>
            
            {[1, 2, 3].map((num) => (
              <React.Fragment key={num}>
                <Grid item xs={12} sm={4}>
                  <FormControl fullWidth>
                    <InputLabel>{`Produkt nadrukowany ${num}`}</InputLabel>
                    <Select
                      name={`${num === 1 ? 'first' : num === 2 ? 'second' : 'third'}Product`}
                      value={formData[`${num === 1 ? 'first' : num === 2 ? 'second' : 'third'}Product`]}
                      onChange={handleChange}
                      label={`Produkt nadrukowany ${num}`}
                    >
                      <MenuItem value="BRAK">BRAK</MenuItem>
                      {productOptions.map(option => (
                        <MenuItem key={option} value={option}>{option}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={12} sm={4}>
                  <TextField
                    fullWidth
                    label={`Ilość produktu ${num} (szt.)`}
                    name={`${num === 1 ? 'first' : num === 2 ? 'second' : 'third'}ProductQuantity`}
                    type="number"
                    value={formData[`${num === 1 ? 'first' : num === 2 ? 'second' : 'third'}ProductQuantity`]}
                    onChange={handleChange}
                    error={!!validationErrors[`${num === 1 ? 'first' : num === 2 ? 'second' : 'third'}ProductQuantity`]}
                    helperText={validationErrors[`${num === 1 ? 'first' : num === 2 ? 'second' : 'third'}ProductQuantity`]}
                    inputProps={{ min: 0, step: 'any' }}
                  />
                </Grid>
                <Grid item xs={12} sm={4}>
                  <TextField
                    fullWidth
                    label={`Straty produktu ${num} (szt.)`}
                    name={`${num === 1 ? 'first' : num === 2 ? 'second' : 'third'}ProductLoss`}
                    type="number"
                    value={formData[`${num === 1 ? 'first' : num === 2 ? 'second' : 'third'}ProductLoss`]}
                    onChange={handleChange}
                    error={!!validationErrors[`${num === 1 ? 'first' : num === 2 ? 'second' : 'third'}ProductLoss`]}
                    helperText={validationErrors[`${num === 1 ? 'first' : num === 2 ? 'second' : 'third'}ProductLoss`]}
                    inputProps={{ min: 0, step: 'any' }}
                  />
                </Grid>
              </React.Fragment>
            ))}
            
            {/* Sekcja dodatkowych informacji */}
            <Grid item xs={12}>
              <Typography variant="subtitle1" gutterBottom>
                Dodatkowe informacje
              </Typography>
            </Grid>
            
            <Grid item xs={12}>
              <TextField
                fullWidth
                multiline
                rows={3}
                label="Problemy maszyn"
                name="machineIssues"
                value={formData.machineIssues}
                onChange={handleChange}
              />
            </Grid>
            
            <Grid item xs={12}>
              <TextField
                fullWidth
                multiline
                rows={3}
                label="Inne aktywności"
                name="otherActivities"
                value={formData.otherActivities}
                onChange={handleChange}
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

export default ProductionShiftFormDialog; 