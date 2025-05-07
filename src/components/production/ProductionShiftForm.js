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

const ProductionShiftForm = () => {
  const staffOptions = [
    "Valentyna Tarasiuk",
    "Mariia Pokrovets"
  ];
  
  const shiftWorkerOptions = [
    "Luis Carlos Tapiero",
    "Ewa Bojke",
    "Maria Angelica Bermudez",
    "Mariia Pokrovets",
    "Valentyna Tarasiuk",
    "Daria Shadiuk"
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

  const handleDateChange = (date) => {
    setFormData(prev => ({
      ...prev,
      fillDate: date
    }));
  };

  const handleWorkersChange = (e) => {
    const { checked, value } = e.target;
    let updatedWorkers = [...formData.shiftWorkers];
    
    if (checked) {
      updatedWorkers.push(value);
    } else {
      updatedWorkers = updatedWorkers.filter(worker => worker !== value);
    }
    
    setFormData(prev => ({
      ...prev,
      shiftWorkers: updatedWorkers
    }));
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
    
    if (formData.shiftWorkers.length === 0) {
      errors.shiftWorkers = 'Wybierz co najmniej jednego pracownika zmiany';
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
    
    if (!formData.productionQuantity) {
      errors.productionQuantity = 'Ilość zrobionego produktu jest wymagana';
    } else if (isNaN(formData.productionQuantity)) {
      errors.productionQuantity = 'Podaj wartość liczbową';
    }
    
    if (formData.firstProduct !== 'BRAK' && !formData.firstProductQuantity) {
      errors.firstProductQuantity = 'Podaj ilość dla pierwszego produktu';
    }
    
    if (formData.secondProduct !== 'BRAK' && !formData.secondProductQuantity) {
      errors.secondProductQuantity = 'Podaj ilość dla drugiego produktu';
    }
    
    if (formData.thirdProduct !== 'BRAK' && !formData.thirdProductQuantity) {
      errors.thirdProductQuantity = 'Podaj ilość dla trzeciego produktu';
    }
    
    if (!formData.machineIssues && formData.machineIssues !== 'brak') {
      errors.machineIssues = 'Pole jest wymagane. Jeśli brak awarii, wpisz "brak"';
    }
    
    if (!formData.otherActivities && formData.otherActivities !== 'brak') {
      errors.otherActivities = 'Pole jest wymagane. Jeśli brak dodatkowych czynności, wpisz "brak"';
    }
    
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (validate()) {
      // W prawdziwej aplikacji, tutaj byłoby wysyłanie danych do backend'u
      console.log('Formularz zmiany produkcyjnej wysłany z danymi:', formData);
      setSubmitted(true);
      
      // Reset formularza po pomyślnym wysłaniu
      setFormData({
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
    }
  };

  return (
    <Container maxWidth="md" sx={{ mt: 4, mb: 4 }}>
      <Paper sx={{ p: 4 }}>
        <Box sx={{ mb: 3 }}>
          <Typography variant="h5" gutterBottom align="center" fontWeight="bold">
            RAPORT - ZMIANA PRODUKCJI
          </Typography>
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
            
            <Grid item xs={12}>
              <FormControl fullWidth required error={!!validationErrors.responsiblePerson}>
                <InputLabel>Osoba odpowiedzialna za zmianę</InputLabel>
                <Select
                  name="responsiblePerson"
                  value={formData.responsiblePerson}
                  onChange={handleChange}
                  label="Osoba odpowiedzialna za zmianę"
                >
                  {staffOptions.map(option => (
                    <MenuItem key={option} value={option}>{option}</MenuItem>
                  ))}
                </Select>
                {validationErrors.responsiblePerson && (
                  <Typography color="error" variant="caption">
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
                value={formData.fillTime}
                onChange={handleChange}
                placeholder="np. 8:30"
                error={!!validationErrors.fillTime}
                helperText={validationErrors.fillTime}
              />
            </Grid>
            
            <Grid item xs={12}>
              <Typography variant="subtitle1" gutterBottom>
                Sekcja: Pracownicy Produkcji/Rodzaj Zmiany
              </Typography>
            </Grid>
            
            <Grid item xs={12}>
              <FormControl component="fieldset" error={!!validationErrors.shiftWorkers} required>
                <FormLabel component="legend">Pracownicy zmiany</FormLabel>
                <FormGroup>
                  {shiftWorkerOptions.map(worker => (
                    <FormControlLabel
                      key={worker}
                      control={
                        <Checkbox 
                          checked={formData.shiftWorkers.includes(worker)}
                          onChange={handleWorkersChange}
                          value={worker}
                        />
                      }
                      label={worker}
                    />
                  ))}
                </FormGroup>
                {validationErrors.shiftWorkers && (
                  <Typography color="error" variant="caption">
                    {validationErrors.shiftWorkers}
                  </Typography>
                )}
              </FormControl>
            </Grid>
            
            <Grid item xs={12}>
              <FormControl component="fieldset" error={!!validationErrors.shiftType} required>
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
                  <Typography color="error" variant="caption">
                    {validationErrors.shiftType}
                  </Typography>
                )}
              </FormControl>
            </Grid>
            
            <Grid item xs={12}>
              <Typography variant="subtitle1" gutterBottom>
                Sekcja: Raport Wykonanych Czynności Na Zmianie
              </Typography>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Raport zmiany wykonujemy per jeden produkt gotowy!
              </Typography>
            </Grid>
            
            <Grid item xs={12}>
              <FormControl fullWidth required error={!!validationErrors.product}>
                <InputLabel>Produkt</InputLabel>
                <Select
                  name="product"
                  value={formData.product}
                  onChange={handleChange}
                  label="Produkt"
                >
                  {productOptions.map(option => (
                    <MenuItem key={option} value={option}>{option}</MenuItem>
                  ))}
                </Select>
                {validationErrors.product && (
                  <Typography color="error" variant="caption">
                    {validationErrors.product}
                  </Typography>
                )}
              </FormControl>
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
                  <Typography color="error" variant="caption">
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
            
            <Grid item xs={12}>
              <FormControl fullWidth>
                <InputLabel>Rodzaj nadrukowanych doypack/tub - 1</InputLabel>
                <Select
                  name="firstProduct"
                  value={formData.firstProduct}
                  onChange={handleChange}
                  label="Rodzaj nadrukowanych doypack/tub - 1"
                >
                  <MenuItem value="BRAK">BRAK</MenuItem>
                  {productOptions.map(option => (
                    <MenuItem key={option} value={option}>{option}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            
            {formData.firstProduct !== 'BRAK' && (
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Ilość nadrukowanych doypack/tub - 1"
                  name="firstProductQuantity"
                  value={formData.firstProductQuantity}
                  onChange={handleChange}
                  placeholder="Proszę podać tylko wartość liczbową dla pierwszego zadrukowanego produktu z poprzedniej listy!"
                  error={!!validationErrors.firstProductQuantity}
                  helperText={validationErrors.firstProductQuantity}
                />
              </Grid>
            )}
            
            <Grid item xs={12}>
              <FormControl fullWidth>
                <InputLabel>Rodzaj nadrukowanych doypack/tub - 2</InputLabel>
                <Select
                  name="secondProduct"
                  value={formData.secondProduct}
                  onChange={handleChange}
                  label="Rodzaj nadrukowanych doypack/tub - 2"
                >
                  <MenuItem value="BRAK">BRAK</MenuItem>
                  {productOptions.map(option => (
                    <MenuItem key={option} value={option}>{option}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            
            {formData.secondProduct !== 'BRAK' && (
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Ilość nadrukowanych doypack/tub - 2"
                  name="secondProductQuantity"
                  value={formData.secondProductQuantity}
                  onChange={handleChange}
                  placeholder="Proszę podać tylko wartość liczbową dla drugiego zadrukowanego produktu z poprzedniej listy!"
                  error={!!validationErrors.secondProductQuantity}
                  helperText={validationErrors.secondProductQuantity}
                />
              </Grid>
            )}
            
            <Grid item xs={12}>
              <FormControl fullWidth>
                <InputLabel>Rodzaj nadrukowanych doypack/tub - 3</InputLabel>
                <Select
                  name="thirdProduct"
                  value={formData.thirdProduct}
                  onChange={handleChange}
                  label="Rodzaj nadrukowanych doypack/tub - 3"
                >
                  <MenuItem value="BRAK">BRAK</MenuItem>
                  {productOptions.map(option => (
                    <MenuItem key={option} value={option}>{option}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            
            {formData.thirdProduct !== 'BRAK' && (
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Ilość nadrukowanych doypack/tub - 3"
                  name="thirdProductQuantity"
                  value={formData.thirdProductQuantity}
                  onChange={handleChange}
                  placeholder="Proszę podać tylko wartość liczbową dla trzeciego zadrukowanego produktu z poprzedniej listy!"
                  error={!!validationErrors.thirdProductQuantity}
                  helperText={validationErrors.thirdProductQuantity}
                />
              </Grid>
            )}
            
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Ilość strat doypack/tub - 1"
                name="firstProductLoss"
                value={formData.firstProductLoss}
                onChange={handleChange}
                placeholder="Proszę podać tylko wartość liczbową dla pierwszego zadrukowanego produktu z poprzedniej listy!"
              />
            </Grid>
            
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Ilość strat doypack/tub - 2"
                name="secondProductLoss"
                value={formData.secondProductLoss}
                onChange={handleChange}
                placeholder="Proszę podać tylko wartość liczbową dla drugiego zadrukowanego produktu z poprzedniej listy!"
              />
            </Grid>
            
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Ilość strat doypack/tub - 3"
                name="thirdProductLoss"
                value={formData.thirdProductLoss}
                onChange={handleChange}
                placeholder="Proszę podać tylko wartość liczbową dla trzeciego zadrukowanego produktu z poprzedniej listy!"
              />
            </Grid>
            
            <Grid item xs={12}>
              <TextField
                required
                fullWidth
                multiline
                rows={5}
                label="Pozostałe czynności produkcyjne"
                name="otherActivities"
                value={formData.otherActivities}
                onChange={handleChange}
                placeholder="Wpisujemy np. czyszczenie maszyny, sprzątanie produkcji, sprzątanie generalne zakładu produkcyjnego itp."
                error={!!validationErrors.otherActivities}
                helperText={validationErrors.otherActivities}
              />
            </Grid>
            
            <Grid item xs={12}>
              <TextField
                required
                fullWidth
                multiline
                rows={5}
                label="Awarie maszyn"
                name="machineIssues"
                value={formData.machineIssues}
                onChange={handleChange}
                placeholder="Wpisujemy w przypadku awarii cały opis co się wydarzyło. Jeśli brak - proszę wpisać 'brak'."
                error={!!validationErrors.machineIssues}
                helperText={validationErrors.machineIssues}
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

export default ProductionShiftForm; 