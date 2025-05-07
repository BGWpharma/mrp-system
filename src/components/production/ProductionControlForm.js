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
  RadioGroup,
  Radio,
  FormControlLabel,
  FormLabel,
  Checkbox,
  FormGroup,
  CircularProgress
} from '@mui/material';
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { pl } from 'date-fns/locale';
import { Send as SendIcon } from '@mui/icons-material';
import { getMONumbersForSelect } from '../../services/moService';

const ProductionControlForm = () => {
  const staffOptions = [
    "Valentyna Tarasiuk",
    "Seweryn Burandt",
    "Łukasz Bojke"
  ];
  
  const positionOptions = [
    "Mistrz produkcji",
    "Kierownik Magazynu"
  ];
  
  const productOptions = [
    "BLC-COLL-GLYC",
    "BW3Y-Glycine",
    "BW3Y-MAGN-BISG",
    "BW3Y-VITAMINC",
    "BW3Y-GAINER-VANILLA",
    "BW3Y-PREWORKOUT-CAF-200G",
    "BW3Y-RICECREAM-1500G-CHOCOLATE",
    "BW3Y-WPI-900G-CHOCOLATE",
    "BW3Y-VITD3",
    "BW3Y-ZMMB",
    "BW3Y-ZINC",
    "BW3Y-CREA-MONOHYDRATE",
    "BW3Y-GAINER-CHOCOLATE",
    "BW3Y-CREA-MONOHYDRATE-NON-LABELISEE-300G",
    "BW3Y-O3-CAPS-90",
    "BW3Y-COLL",
    "BW3Y-SHAKER-NOIR-LOGO-600ML",
    "BW3Y-RICECREAM-1500G-VANILLA",
    "BW3Y-DOSING-CUPS",
    "BW3Y-WPI-900G-VANILLA",
    "BW3Y-MULTIVIT",
    "COR-COLLAGEN-PEACH-180G",
    "COR-OMEGA3-250DHA-120CAPS",
    "COR-GLYCINE-300G",
    "COR-CREATINE-300G",
    "COR-NWPI-CHOC-1000G",
    "COR-MULTIVIT 60 caps",
    "COR-PREWORKOUT-200G",
    "GRN-VITAMIND3-CAPS",
    "GRN-VPM-VANILLA-V2",
    "GRN-COLLAGEN-UNFLAVORED",
    "GRN-MCI-COFFEE",
    "GRN-WPI-BLUBERRY",
    "GRN-GLYCINE-LUBLIN",
    "GRN-MULTIVITAMINS-CAPS",
    "GRN-WPI-COFFEE",
    "GRN-OMEGA3-CAPS",
    "GRN-ZINC-CAPS",
    "GRN-VPM-BLUBERRY-V2",
    "GRN-PROBIOTICS-CAPS",
    "GRN-MAGNESIUM-CAPS",
    "GRN-WPC-CHOCOLATE",
    "GRN-VPM-COFFEE-V2",
    "GRN-VITAMINC-CAPS",
    "GRN-COLLAGEN-UNFLAVORED-LUBLIN",
    "GRN-MCI-CHOCOLATE",
    "GRN-WPC-VANILLA",
    "GRN-CREA-UNFLAVORED",
    "GRN-COLLAGEN-COCOA",
    "GRN-MCI-VANILLA",
    "GRN-WPI-CHOCOLATE",
    "GRN-OMEGA3-CAPS-40/30",
    "GRN-WPI-VANILLA",
    "GRN-PREWORKOUT",
    "GRN-GLYCINE",
    "GRN-WPC-BLUBERRY",
    "GRN-BCAA-MANGO",
    "GRN-VPM-CHOCOLATE-V2",
    "GRN-SLEEP-CAPS",
    "GRN-SPIRULINA-TABS",
    "GRN-MCI-BLUEBERRY",
    "GRN-WPC-COFFEE"
  ];

  const [formData, setFormData] = useState({
    email: '',
    name: '',
    position: '',
    fillDate: new Date(),
    manufacturingOrder: '',
    customerOrder: '',
    productionStartDate: new Date(),
    productionStartTime: '',
    productionEndDate: new Date(),
    productionEndTime: '',
    readingDate: new Date(),
    readingTime: '',
    productName: '',
    lotNumber: '',
    expiryDate: '',
    quantity: '',
    shiftNumber: [],
    rawMaterialPurity: 'Prawidłowa',
    packagingPurity: 'Prawidłowa',
    packagingClosure: 'Prawidłowa',
    packagingQuantity: 'Prawidłowa',
    documentScans: null,
    productPhoto1: null,
    productPhoto2: null,
    productPhoto3: null,
    humidity: '',
    temperature: ''
  });

  const [validationErrors, setValidationErrors] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [moOptions, setMoOptions] = useState([]);
  const [loadingMO, setLoadingMO] = useState(false);

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
  }, []);

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

  const handleDateChange = (date, fieldName) => {
    setFormData(prev => ({
      ...prev,
      [fieldName]: date
    }));
  };

  const handleFileChange = (e, fieldName) => {
    const file = e.target.files[0];
    if (file) {
      setFormData(prev => ({
        ...prev,
        [fieldName]: file
      }));
    }
  };

  const handleCheckboxChange = (e) => {
    const { value, checked } = e.target;
    let updatedShifts = [...formData.shiftNumber];
    
    if (checked) {
      updatedShifts.push(value);
    } else {
      updatedShifts = updatedShifts.filter(shift => shift !== value);
    }
    
    setFormData(prev => ({
      ...prev,
      shiftNumber: updatedShifts
    }));
  };

  const handleRadioChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const validate = () => {
    const errors = {};
    
    if (!formData.email) {
      errors.email = 'Adres e-mail jest wymagany';
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      errors.email = 'Podaj prawidłowy adres e-mail';
    }
    
    if (!formData.name) {
      errors.name = 'Imię i nazwisko jest wymagane';
    }
    
    if (!formData.position) {
      errors.position = 'Stanowisko jest wymagane';
    }
    
    if (!formData.manufacturingOrder) {
      errors.manufacturingOrder = 'Manufacturing Order jest wymagany';
    }
    
    if (!formData.productionStartTime) {
      errors.productionStartTime = 'Godzina rozpoczęcia produkcji jest wymagana';
    }
    
    if (!formData.readingTime) {
      errors.readingTime = 'Godzina odczytu jest wymagana';
    }
    
    if (!formData.productName) {
      errors.productName = 'Nazwa produktu jest wymagana';
    }
    
    if (!formData.lotNumber) {
      errors.lotNumber = 'Numer LOT jest wymagany';
    }
    
    if (!formData.expiryDate) {
      errors.expiryDate = 'Data ważności (EXP) jest wymagana';
    }
    
    if (!formData.quantity) {
      errors.quantity = 'Ilość jest wymagana';
    } else if (isNaN(formData.quantity)) {
      errors.quantity = 'Podaj wartość liczbową';
    }
    
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (validate()) {
      // W prawdziwej aplikacji, tutaj byłoby wysyłanie danych do backend'u
      console.log('Formularz kontroli produkcji wysłany z danymi:', formData);
      setSubmitted(true);
      
      // Reset formularza po pomyślnym wysłaniu
      setFormData({
        email: '',
        name: '',
        position: '',
        fillDate: new Date(),
        manufacturingOrder: '',
        customerOrder: '',
        productionStartDate: new Date(),
        productionStartTime: '',
        productionEndDate: new Date(),
        productionEndTime: '',
        readingDate: new Date(),
        readingTime: '',
        productName: '',
        lotNumber: '',
        expiryDate: '',
        quantity: '',
        shiftNumber: [],
        rawMaterialPurity: 'Prawidłowa',
        packagingPurity: 'Prawidłowa',
        packagingClosure: 'Prawidłowa',
        packagingQuantity: 'Prawidłowa',
        documentScans: null,
        productPhoto1: null,
        productPhoto2: null,
        productPhoto3: null,
        humidity: '',
        temperature: ''
      });
    }
  };

  return (
    <Container maxWidth="md" sx={{ mt: 4, mb: 4 }}>
      <Paper sx={{ p: 4 }}>
        <Box sx={{ mb: 3 }}>
          <Typography variant="h5" gutterBottom align="center" fontWeight="bold">
            RAPORT - KONTROLA PRODUKCJI
          </Typography>
          <Typography variant="body2" align="center" color="text.secondary" paragraph>
            W razie awarii i pilnych zgłoszeń prosimy o kontakt: mateusz@bgwpharma.com
          </Typography>
          <Divider />
        </Box>

        {submitted && (
          <Alert severity="success" sx={{ mb: 3 }}>
            Raport kontroli produkcji został wysłany pomyślnie!
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
              />
            </Grid>
            
            <Grid item xs={12}>
              <Typography variant="subtitle1" gutterBottom>
                Sekcja: Identyfikacja
              </Typography>
            </Grid>
            
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth required error={!!validationErrors.name}>
                <InputLabel>Imię i nazwisko</InputLabel>
                <Select
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  label="Imię i nazwisko"
                >
                  {staffOptions.map(option => (
                    <MenuItem key={option} value={option}>{option}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth required error={!!validationErrors.position}>
                <InputLabel>Stanowisko</InputLabel>
                <Select
                  name="position"
                  value={formData.position}
                  onChange={handleChange}
                  label="Stanowisko"
                >
                  {positionOptions.map(option => (
                    <MenuItem key={option} value={option}>{option}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            
            <Grid item xs={12}>
              <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={pl}>
                <DateTimePicker
                  label="Data wypełnienia"
                  value={formData.fillDate}
                  onChange={(date) => handleDateChange(date, 'fillDate')}
                  renderInput={(params) => 
                    <TextField {...params} fullWidth required />
                  }
                  format="dd.MM.yyyy"
                />
              </LocalizationProvider>
            </Grid>
            
            <Grid item xs={12}>
              <Typography variant="subtitle1" gutterBottom>
                Sekcja: Protokół Kontroli Produkcji
              </Typography>
            </Grid>
            
            <Grid item xs={12}>
              <FormControl 
                fullWidth 
                required 
                error={!!validationErrors.manufacturingOrder}
              >
                <InputLabel>Manufacturing Order</InputLabel>
                <Select
                  name="manufacturingOrder"
                  value={formData.manufacturingOrder}
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
                {validationErrors.manufacturingOrder && (
                  <Typography variant="caption" color="error">
                    {validationErrors.manufacturingOrder}
                  </Typography>
                )}
              </FormControl>
            </Grid>
            
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Customer Order"
                name="customerOrder"
                value={formData.customerOrder}
                onChange={handleChange}
              />
            </Grid>
            
            <Grid item xs={12} sm={6}>
              <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={pl}>
                <DateTimePicker
                  label="Data rozpoczęcia produkcji"
                  value={formData.productionStartDate}
                  onChange={(date) => handleDateChange(date, 'productionStartDate')}
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
                label="Godzina rozpoczęcia produkcji"
                name="productionStartTime"
                value={formData.productionStartTime}
                onChange={handleChange}
                placeholder="np. 8:30"
                error={!!validationErrors.productionStartTime}
                helperText={validationErrors.productionStartTime}
              />
            </Grid>
            
            <Grid item xs={12} sm={6}>
              <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={pl}>
                <DateTimePicker
                  label="Data zakończenia produkcji"
                  value={formData.productionEndDate}
                  onChange={(date) => handleDateChange(date, 'productionEndDate')}
                  renderInput={(params) => 
                    <TextField {...params} fullWidth />
                  }
                  format="dd.MM.yyyy"
                />
              </LocalizationProvider>
            </Grid>
            
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Godzina zakończenia produkcji"
                name="productionEndTime"
                value={formData.productionEndTime}
                onChange={handleChange}
                placeholder="np. 8:30"
              />
            </Grid>
            
            <Grid item xs={12} sm={6}>
              <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={pl}>
                <DateTimePicker
                  label="Data odczytu (Warunków Atmosferycznych)"
                  value={formData.readingDate}
                  onChange={(date) => handleDateChange(date, 'readingDate')}
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
                label="Godzina odczytu (Warunków Atmosferycznych)"
                name="readingTime"
                value={formData.readingTime}
                onChange={handleChange}
                placeholder="np. 8:30"
                error={!!validationErrors.readingTime}
                helperText={validationErrors.readingTime}
              />
            </Grid>
            
            <Grid item xs={12}>
              <FormControl fullWidth required error={!!validationErrors.productName}>
                <InputLabel>Nazwa produktu</InputLabel>
                <Select
                  name="productName"
                  value={formData.productName}
                  onChange={handleChange}
                  label="Nazwa produktu"
                >
                  {productOptions.map(option => (
                    <MenuItem key={option} value={option}>{option}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            
            <Grid item xs={12}>
              <TextField
                required
                fullWidth
                label="LOT"
                name="lotNumber"
                value={formData.lotNumber}
                onChange={handleChange}
                error={!!validationErrors.lotNumber}
                helperText={validationErrors.lotNumber}
              />
            </Grid>
            
            <Grid item xs={12}>
              <TextField
                required
                fullWidth
                label="EXP"
                name="expiryDate"
                value={formData.expiryDate}
                onChange={handleChange}
                error={!!validationErrors.expiryDate}
                helperText={validationErrors.expiryDate}
              />
            </Grid>
            
            <Grid item xs={12}>
              <FormControl component="fieldset">
                <FormLabel component="legend">Zmierzona wilgotność powietrza w pomieszczeniu</FormLabel>
                <RadioGroup
                  name="humidity"
                  value={formData.humidity}
                  onChange={handleRadioChange}
                >
                  <FormControlLabel value="PONIŻEJ NORMY 40%!" control={<Radio />} label="PONIŻEJ NORMY 40%!" />
                  {Array.from({ length: 21 }, (_, i) => i + 40).map(value => (
                    <FormControlLabel key={value} value={`${value}%`} control={<Radio />} label={`${value}%`} />
                  ))}
                  <FormControlLabel value="POWYŻEJ NORMY 60%!" control={<Radio />} label="POWYŻEJ NORMY 60%!" />
                </RadioGroup>
              </FormControl>
            </Grid>
            
            <Grid item xs={12}>
              <FormControl component="fieldset">
                <FormLabel component="legend">Zmierzona temperatura powietrza w pomieszczeniu</FormLabel>
                <RadioGroup
                  name="temperature"
                  value={formData.temperature}
                  onChange={handleRadioChange}
                >
                  <FormControlLabel value="PONIŻEJ 10°C!" control={<Radio />} label="PONIŻEJ 10°C!" />
                  {Array.from({ length: 16 }, (_, i) => i + 10).map(value => (
                    <FormControlLabel key={value} value={`${value}°C`} control={<Radio />} label={`${value}°C`} />
                  ))}
                  <FormControlLabel value="POWYŻEJ 25°C!" control={<Radio />} label="POWYŻEJ 25°C!" />
                </RadioGroup>
              </FormControl>
            </Grid>
            
            <Grid item xs={12}>
              <TextField
                required
                fullWidth
                label="Ilość (szt.)"
                name="quantity"
                value={formData.quantity}
                onChange={handleChange}
                error={!!validationErrors.quantity}
                helperText={validationErrors.quantity}
                placeholder="W kartonie"
              />
            </Grid>
            
            <Grid item xs={12}>
              <FormControl component="fieldset">
                <FormLabel component="legend">Numer zmiany produkcji</FormLabel>
                <FormGroup>
                  <FormControlLabel
                    control={<Checkbox onChange={handleCheckboxChange} value="Zmiana 1" />}
                    label="Zmiana 1"
                  />
                  <FormControlLabel
                    control={<Checkbox onChange={handleCheckboxChange} value="Zmiana 2" />}
                    label="Zmiana 2"
                  />
                </FormGroup>
              </FormControl>
            </Grid>
            
            <Grid item xs={12}>
              <FormControl component="fieldset">
                <FormLabel component="legend">Czystość surowca</FormLabel>
                <RadioGroup
                  name="rawMaterialPurity"
                  value={formData.rawMaterialPurity}
                  onChange={handleRadioChange}
                >
                  <FormControlLabel value="Prawidłowa" control={<Radio />} label="Prawidłowa" />
                  <FormControlLabel value="Nieprawidłowa" control={<Radio />} label="Nieprawidłowa" />
                </RadioGroup>
              </FormControl>
            </Grid>
            
            <Grid item xs={12}>
              <FormControl component="fieldset">
                <FormLabel component="legend">Czystość opakowania (doypack/tuba)</FormLabel>
                <RadioGroup
                  name="packagingPurity"
                  value={formData.packagingPurity}
                  onChange={handleRadioChange}
                >
                  <FormControlLabel value="Prawidłowa" control={<Radio />} label="Prawidłowa" />
                  <FormControlLabel value="Nieprawidłowa" control={<Radio />} label="Nieprawidłowa" />
                </RadioGroup>
              </FormControl>
            </Grid>
            
            <Grid item xs={12}>
              <FormControl component="fieldset">
                <FormLabel component="legend">Zamknięcie opakowania (doypack/tuba)</FormLabel>
                <RadioGroup
                  name="packagingClosure"
                  value={formData.packagingClosure}
                  onChange={handleRadioChange}
                >
                  <FormControlLabel value="Prawidłowa" control={<Radio />} label="Prawidłowa" />
                  <FormControlLabel value="Nieprawidłowa" control={<Radio />} label="Nieprawidłowa" />
                </RadioGroup>
              </FormControl>
            </Grid>
            
            <Grid item xs={12}>
              <FormControl component="fieldset">
                <FormLabel component="legend">Ilość doypacków/tub na jednej palecie</FormLabel>
                <RadioGroup
                  name="packagingQuantity"
                  value={formData.packagingQuantity}
                  onChange={handleRadioChange}
                >
                  <FormControlLabel value="Prawidłowa" control={<Radio />} label="Prawidłowa" />
                  <FormControlLabel value="Nieprawidłowa" control={<Radio />} label="Nieprawidłowa" />
                </RadioGroup>
              </FormControl>
            </Grid>
            
            <Grid item xs={12}>
              <Typography variant="subtitle2" gutterBottom>
                Skany Dokumentów
              </Typography>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Np. Plan mieszań
              </Typography>
              <input
                type="file"
                onChange={(e) => handleFileChange(e, 'documentScans')}
                style={{ width: '100%', marginTop: '8px' }}
              />
            </Grid>
            
            <Grid item xs={12}>
              <Typography variant="subtitle2" gutterBottom>
                Zdjęcie produktu - 1
              </Typography>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Zdjęcie produktu od frontu
              </Typography>
              <input
                type="file"
                onChange={(e) => handleFileChange(e, 'productPhoto1')}
                style={{ width: '100%', marginTop: '8px' }}
              />
            </Grid>
            
            <Grid item xs={12}>
              <Typography variant="subtitle2" gutterBottom>
                Zdjęcie produktu - 2
              </Typography>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Zdjęcie produktu z widocznym nr. LOT - EXP
              </Typography>
              <input
                type="file"
                onChange={(e) => handleFileChange(e, 'productPhoto2')}
                style={{ width: '100%', marginTop: '8px' }}
              />
            </Grid>
            
            <Grid item xs={12}>
              <Typography variant="subtitle2" gutterBottom>
                Zdjęcie produktu - 3
              </Typography>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Zdjęcie zapakowanego produktu w karton z widoczną etykietą
              </Typography>
              <input
                type="file"
                onChange={(e) => handleFileChange(e, 'productPhoto3')}
                style={{ width: '100%', marginTop: '8px' }}
              />
            </Grid>
            
            <Grid item xs={12}>
              <Button
                type="submit"
                variant="contained"
                color="primary"
                fullWidth
                size="large"
                startIcon={<SendIcon />}
                sx={{ mt: 2 }}
              >
                Wyślij raport
              </Button>
            </Grid>
          </Grid>
        </Box>
      </Paper>
    </Container>
  );
};

export default ProductionControlForm; 