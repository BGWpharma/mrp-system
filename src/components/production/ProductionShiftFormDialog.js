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
  CircularProgress,
  Autocomplete
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
import { useStaffOptions, useShiftWorkerOptions, useProductOptionsForPrinting, useFilteredProductOptions } from '../../hooks/useFormOptions';

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
  
  // Stany dla wyszukiwarek produktów
  const [productSearches, setProductSearches] = useState({
    first: '',
    second: '',
    third: ''
  });
  
  // Przefiltrowane opcje produktów dla każdego pola
  const filteredFirstProducts = useFilteredProductOptions(productSearches.first, productOptions);
  const filteredSecondProducts = useFilteredProductOptions(productSearches.second, productOptions);
  const filteredThirdProducts = useFilteredProductOptions(productSearches.third, productOptions);

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
      errors.responsiblePerson = 'Osoba odpowiedzialna za zmianę jest wymagana';
    }
    
    if (!formData.fillTime) {
      errors.fillTime = 'Godzina wypełnienia jest wymagana';
    }
    
    if (!formData.shiftType) {
      errors.shiftType = 'Rodzaj zmiany jest wymagany';
    }
    
    if (!formData.product) {
      errors.product = 'Produkt jest wymagany';
    }
    
    if (!formData.moNumber) {
      errors.moNumber = 'Numer MO jest wymagany';
    }
    
    if (formData.shiftWorkers.length === 0) {
      errors.shiftWorkers = 'Wybierz co najmniej jednego pracownika zmiany';
    }
    
    if (!formData.productionQuantity) {
      errors.productionQuantity = 'Ilość zrobionego produktu jest wymagana';
    } else if (isNaN(formData.productionQuantity)) {
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
    
    if (!formData.otherActivities) {
      errors.otherActivities = 'Pozostałe czynności produkcyjne są wymagane';
    }
    
    if (!formData.machineIssues) {
      errors.machineIssues = 'Awarie maszyn są wymagane';
    }
    
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (validate()) {
      try {
        setSubmitted(false);
        
        const odpowiedziRef = collection(db, 'Forms/ZmianaProdukcji/Odpowiedzi');
        
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
                Sekcja: Pracownicy Produkcji/Rodzaj Zmiany
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
                <FormLabel component="legend">Rodzaj zmiany</FormLabel>
                <RadioGroup
                  name="shiftType"
                  value={formData.shiftType}
                  onChange={handleChange}
                >
                  <FormControlLabel value="zmiana 1 (6-14)" control={<Radio />} label="zmiana 1 (6-14)" />
                  <FormControlLabel value="zmiana 2 (14-22)" control={<Radio />} label="zmiana 2 (14-22)" />
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
                Sekcja: Raport Wykonanych Czynności Na Zmianie
              </Typography>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Raport zmiany wykonujemy per jeden produkt gotowy!
              </Typography>
            </Grid>
            
            <Grid item xs={12} sm={6}>
              <TextField
                required
                fullWidth
                label="Produkt"
                name="product"
                value={formData.product}
                onChange={handleChange}
                error={!!validationErrors.product}
                helperText={validationErrors.product || "Nazwa produktu jest automatycznie wypełniana na podstawie wybranego MO"}
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
                <InputLabel>Numer MO</InputLabel>
                <Select
                  name="moNumber"
                  value={formData.moNumber}
                  onChange={handleChange}
                  label="Numer MO"
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
                required
                fullWidth
                label="Ilość zrobionego produktu"
                name="productionQuantity"
                value={formData.productionQuantity}
                onChange={handleChange}
                placeholder="Proszę podać tylko wartość liczbową!"
                error={!!validationErrors.productionQuantity}
                helperText={validationErrors.productionQuantity}
              />
            </Grid>
            

            
            {/* Pierwszy produkt */}
            <Grid item xs={12}>
              <Autocomplete
                fullWidth
                freeSolo
                options={[{ id: 'brak', name: 'BRAK', searchText: 'brak' }, ...filteredFirstProducts]}
                getOptionLabel={(option) => typeof option === 'string' ? option : option.name}
                value={null}
                onChange={(event, newValue) => {
                  const value = newValue ? (typeof newValue === 'string' ? newValue : newValue.name) : '';
                  setFormData(prev => ({ ...prev, firstProduct: value || 'BRAK' }));
                  setProductSearches(prev => ({ ...prev, first: value || '' }));
                }}
                onInputChange={(event, newInputValue) => {
                  setProductSearches(prev => ({ ...prev, first: newInputValue }));
                  setFormData(prev => ({ ...prev, firstProduct: newInputValue || 'BRAK' }));
                }}
                inputValue={productSearches.first}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Rodzaj nadrukowanych doypack/tub - 1"
                    placeholder="Wpisz nazwę produktu lub fragment, np. 'mango', lub 'BRAK'"
                    helperText="Wyszukaj gotowy produkt z magazynu lub wpisz dowolny tekst"
                  />
                )}
                renderOption={(props, option) => (
                  <li {...props} key={`first-${option.id || option.name}`}>
                    <Box>
                      <Typography variant="body2">{option.name}</Typography>
                      {option.description && (
                        <Typography variant="caption" color="text.secondary">
                          {option.description}
                        </Typography>
                      )}
                    </Box>
                  </li>
                )}
                loading={productLoading}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Ilość nadrukowanych doypack/tub - 1"
                name="firstProductQuantity"
                type="number"
                value={formData.firstProductQuantity}
                onChange={handleChange}
                error={!!validationErrors.firstProductQuantity}
                helperText={validationErrors.firstProductQuantity}
                inputProps={{ min: 0, step: 'any' }}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Ilość strat doypack/tub - 1"
                name="firstProductLoss"
                type="number"
                value={formData.firstProductLoss}
                onChange={handleChange}
                error={!!validationErrors.firstProductLoss}
                helperText={validationErrors.firstProductLoss}
                inputProps={{ min: 0, step: 'any' }}
              />
            </Grid>

            {/* Drugi produkt */}
            <Grid item xs={12}>
              <Autocomplete
                fullWidth
                freeSolo
                options={[{ id: 'brak', name: 'BRAK', searchText: 'brak' }, ...filteredSecondProducts]}
                getOptionLabel={(option) => typeof option === 'string' ? option : option.name}
                value={null}
                onChange={(event, newValue) => {
                  const value = newValue ? (typeof newValue === 'string' ? newValue : newValue.name) : '';
                  setFormData(prev => ({ ...prev, secondProduct: value || 'BRAK' }));
                  setProductSearches(prev => ({ ...prev, second: value || '' }));
                }}
                onInputChange={(event, newInputValue) => {
                  setProductSearches(prev => ({ ...prev, second: newInputValue }));
                  setFormData(prev => ({ ...prev, secondProduct: newInputValue || 'BRAK' }));
                }}
                inputValue={productSearches.second}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Rodzaj nadrukowanych doypack/tub - 2"
                    placeholder="Wpisz nazwę produktu lub fragment, np. 'mango', lub 'BRAK'"
                    helperText="Wyszukaj gotowy produkt z magazynu lub wpisz dowolny tekst"
                  />
                )}
                renderOption={(props, option) => (
                  <li {...props} key={`second-${option.id || option.name}`}>
                    <Box>
                      <Typography variant="body2">{option.name}</Typography>
                      {option.description && (
                        <Typography variant="caption" color="text.secondary">
                          {option.description}
                        </Typography>
                      )}
                    </Box>
                  </li>
                )}
                loading={productLoading}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Ilość nadrukowanych doypack/tub - 2"
                name="secondProductQuantity"
                type="number"
                value={formData.secondProductQuantity}
                onChange={handleChange}
                error={!!validationErrors.secondProductQuantity}
                helperText={validationErrors.secondProductQuantity}
                inputProps={{ min: 0, step: 'any' }}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Ilość strat doypack/tub - 2"
                name="secondProductLoss"
                type="number"
                value={formData.secondProductLoss}
                onChange={handleChange}
                error={!!validationErrors.secondProductLoss}
                helperText={validationErrors.secondProductLoss}
                inputProps={{ min: 0, step: 'any' }}
              />
            </Grid>

            {/* Trzeci produkt */}
            <Grid item xs={12}>
              <Autocomplete
                fullWidth
                freeSolo
                options={[{ id: 'brak', name: 'BRAK', searchText: 'brak' }, ...filteredThirdProducts]}
                getOptionLabel={(option) => typeof option === 'string' ? option : option.name}
                value={null}
                onChange={(event, newValue) => {
                  const value = newValue ? (typeof newValue === 'string' ? newValue : newValue.name) : '';
                  setFormData(prev => ({ ...prev, thirdProduct: value || 'BRAK' }));
                  setProductSearches(prev => ({ ...prev, third: value || '' }));
                }}
                onInputChange={(event, newInputValue) => {
                  setProductSearches(prev => ({ ...prev, third: newInputValue }));
                  setFormData(prev => ({ ...prev, thirdProduct: newInputValue || 'BRAK' }));
                }}
                inputValue={productSearches.third}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Rodzaj nadrukowanych doypack/tub - 3"
                    placeholder="Wpisz nazwę produktu lub fragment, np. 'mango', lub 'BRAK'"
                    helperText="Wyszukaj gotowy produkt z magazynu lub wpisz dowolny tekst"
                  />
                )}
                renderOption={(props, option) => (
                  <li {...props} key={`third-${option.id || option.name}`}>
                    <Box>
                      <Typography variant="body2">{option.name}</Typography>
                      {option.description && (
                        <Typography variant="caption" color="text.secondary">
                          {option.description}
                        </Typography>
                      )}
                    </Box>
                  </li>
                )}
                loading={productLoading}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Ilość nadrukowanych doypack/tub - 3"
                name="thirdProductQuantity"
                type="number"
                value={formData.thirdProductQuantity}
                onChange={handleChange}
                error={!!validationErrors.thirdProductQuantity}
                helperText={validationErrors.thirdProductQuantity}
                inputProps={{ min: 0, step: 'any' }}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Ilość strat doypack/tub - 3"
                name="thirdProductLoss"
                type="number"
                value={formData.thirdProductLoss}
                onChange={handleChange}
                error={!!validationErrors.thirdProductLoss}
                helperText={validationErrors.thirdProductLoss}
                inputProps={{ min: 0, step: 'any' }}
              />
            </Grid>
            
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