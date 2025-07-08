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
  CircularProgress,
  Autocomplete
} from '@mui/material';
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { pl } from 'date-fns/locale';
import { Send as SendIcon, ArrowBack as ArrowBackIcon } from '@mui/icons-material';
import { getMONumbersForSelect } from '../../services/moService';
import { formatDateForInput } from '../../utils/dateUtils';
import { db } from '../../services/firebase/config';
import { collection, addDoc, serverTimestamp, doc, updateDoc, getDocs, query, where } from 'firebase/firestore';
import { useNavigate, useLocation } from 'react-router-dom';
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

const ProductionShiftForm = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const isEditMode = searchParams.get('edit') === 'true';
  const { currentUser } = useAuth();

  // Używamy hooków do pobierania opcji z bazy danych
  const { options: staffOptions, loading: staffLoading } = useStaffOptions();
  const { options: shiftWorkerOptions, loading: shiftWorkersLoading } = useShiftWorkerOptions();
  // Hook dla opcji produktów używany tylko w polach "Rodzaj nadrukowanych doypack/tub"
  const { options: productOptions, loading: productLoading } = useProductOptionsForPrinting();
  
  // Stany dla wyszukiwarek produktów
  const [firstProductSearch, setFirstProductSearch] = useState('');
  const [secondProductSearch, setSecondProductSearch] = useState('');
  const [thirdProductSearch, setThirdProductSearch] = useState('');
  
  // Przefiltrowane opcje produktów dla każdego pola
  const filteredFirstProducts = useFilteredProductOptions(firstProductSearch, productOptions);
  const filteredSecondProducts = useFilteredProductOptions(secondProductSearch, productOptions);
  const filteredThirdProducts = useFilteredProductOptions(thirdProductSearch, productOptions);

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
  const [editId, setEditId] = useState(null);

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

  // Sprawdź, czy istnieją dane do edycji w sessionStorage
  useEffect(() => {
    if (isEditMode) {
      const editData = JSON.parse(sessionStorage.getItem('editFormData'));
      if (editData) {
        // Konwersja timestampów na daty (jeśli istnieją)
        const fillDate = editData.fillDate ? 
          (typeof editData.fillDate === 'string' ? new Date(editData.fillDate) : editData.fillDate) : 
          new Date();
        
        setFormData({
          email: editData.email || '',
          responsiblePerson: editData.responsiblePerson || '',
          fillDate: fillDate,
          fillTime: editData.fillTime || '',
          shiftWorkers: editData.shiftWorkers || [],
          shiftType: editData.shiftType || '',
          product: editData.product || '',
          moNumber: editData.moNumber || '',
          productionQuantity: editData.productionQuantity || '',
          firstProduct: editData.firstProduct || 'BRAK',
          secondProduct: editData.secondProduct || 'BRAK',
          thirdProduct: editData.thirdProduct || 'BRAK',
          firstProductQuantity: editData.firstProductQuantity || '',
          secondProductQuantity: editData.secondProductQuantity || '',
          thirdProductQuantity: editData.thirdProductQuantity || '',
          firstProductLoss: editData.firstProductLoss || '',
          secondProductLoss: editData.secondProductLoss || '',
          thirdProductLoss: editData.thirdProductLoss || '',
          otherActivities: editData.otherActivities || '',
          machineIssues: editData.machineIssues || ''
        });
        setEditId(editData.id);
      }
      // Wyczyść dane z sessionStorage po ich wykorzystaniu
      sessionStorage.removeItem('editFormData');
    }
  }, [isEditMode]);

  const handleChange = async (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    
    // Jeśli zmieniono numer MO, pobierz dodatkowe dane i uzupełnij pola
    if (name === 'moNumber' && value) {
      try {
        // Pokaż spinner ładowania
        setLoadingMO(true);
        
        // Pobierz szczegóły MO
        const moDetails = await getMODetailsById(value);
        
        if (moDetails) {
          // Użyj nazwy produktu bezpośrednio z zadania produkcyjnego
          const productName = moDetails.productName || '';
          
          // Aktualizuj formularz o dane z MO
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (validate()) {
      try {
        setSubmitted(false);
        
        // Ścieżka do kolekcji odpowiedzi formularza w Firestore
        const odpowiedziRef = collection(db, 'Forms/ZmianaProdukcji/Odpowiedzi');
        
        // Przygotuj dane do zapisania
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
        
        // Zapisz odpowiedź w Firestore
        if (isEditMode && editId) {
          // Aktualizacja istniejącego dokumentu
          const docRef = doc(db, 'Forms/ZmianaProdukcji/Odpowiedzi', editId);
          await updateDoc(docRef, odpowiedzData);
          console.log('Formularz zmiany produkcyjnej zaktualizowany z danymi:', odpowiedzData);
        } else {
          // Dodanie nowego dokumentu
          await addDoc(odpowiedziRef, odpowiedzData);
          console.log('Formularz zmiany produkcyjnej wysłany z danymi:', odpowiedzData);
        }
        
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
        
        // Przekierowanie do strony odpowiedzi po 2 sekundach
        setTimeout(() => {
          navigate('/production/forms/responses');
        }, 2000);
      } catch (error) {
        console.error('Błąd podczas zapisywania formularza zmiany produkcyjnej:', error);
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
            {isEditMode ? 'EDYCJA - RAPORT ZMIANA PRODUKCJI' : 'RAPORT - ZMIANA PRODUKCJI'}
          </Typography>
          <Typography variant="body2" align="center" color="text.secondary" paragraph>
            W razie awarii i pilnych zgłoszeń prosimy o kontakt: mateusz@bgwpharma.com
          </Typography>
          <Divider />
        </Box>

        {submitted && (
          <Alert severity="success" sx={{ mb: 3 }}>
            {isEditMode ? 'Raport zmiany produkcyjnej został zaktualizowany pomyślnie!' : 'Raport zmiany produkcyjnej został wysłany pomyślnie!'}
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
              <Autocomplete
                fullWidth
                freeSolo
                options={[{ id: 'brak', name: 'BRAK', searchText: 'brak' }, ...filteredFirstProducts]}
                getOptionLabel={(option) => typeof option === 'string' ? option : option.name}
                value={null} // Zawsze null aby umożliwić swobodne wpisywanie
                onChange={(event, newValue) => {
                  const value = newValue ? (typeof newValue === 'string' ? newValue : newValue.name) : '';
                  setFormData(prev => ({ ...prev, firstProduct: value || 'BRAK' }));
                  setFirstProductSearch(value || '');
                }}
                onInputChange={(event, newInputValue) => {
                  setFirstProductSearch(newInputValue);
                  setFormData(prev => ({ ...prev, firstProduct: newInputValue || 'BRAK' }));
                }}
                inputValue={firstProductSearch}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Rodzaj nadrukowanych doypack/tub - 1"
                    placeholder="Wpisz nazwę produktu lub fragment, np. 'mango', lub 'BRAK'"
                    helperText="Wyszukaj gotowy produkt z magazynu lub wpisz dowolny tekst"
                  />
                )}
                renderOption={(props, option) => (
                  <li {...props} key={option.id || option.name}>
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
              <Autocomplete
                fullWidth
                freeSolo
                options={[{ id: 'brak', name: 'BRAK', searchText: 'brak' }, ...filteredSecondProducts]}
                getOptionLabel={(option) => typeof option === 'string' ? option : option.name}
                value={null} // Zawsze null aby umożliwić swobodne wpisywanie
                onChange={(event, newValue) => {
                  const value = newValue ? (typeof newValue === 'string' ? newValue : newValue.name) : '';
                  setFormData(prev => ({ ...prev, secondProduct: value || 'BRAK' }));
                  setSecondProductSearch(value || '');
                }}
                onInputChange={(event, newInputValue) => {
                  setSecondProductSearch(newInputValue);
                  setFormData(prev => ({ ...prev, secondProduct: newInputValue || 'BRAK' }));
                }}
                inputValue={secondProductSearch}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Rodzaj nadrukowanych doypack/tub - 2"
                    placeholder="Wpisz nazwę produktu lub fragment, np. 'mango', lub 'BRAK'"
                    helperText="Wyszukaj gotowy produkt z magazynu lub wpisz dowolny tekst"
                  />
                )}
                renderOption={(props, option) => (
                  <li {...props} key={option.id || option.name}>
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
              <Autocomplete
                fullWidth
                freeSolo
                options={[{ id: 'brak', name: 'BRAK', searchText: 'brak' }, ...filteredThirdProducts]}
                getOptionLabel={(option) => typeof option === 'string' ? option : option.name}
                value={null} // Zawsze null aby umożliwić swobodne wpisywanie
                onChange={(event, newValue) => {
                  const value = newValue ? (typeof newValue === 'string' ? newValue : newValue.name) : '';
                  setFormData(prev => ({ ...prev, thirdProduct: value || 'BRAK' }));
                  setThirdProductSearch(value || '');
                }}
                onInputChange={(event, newInputValue) => {
                  setThirdProductSearch(newInputValue);
                  setFormData(prev => ({ ...prev, thirdProduct: newInputValue || 'BRAK' }));
                }}
                inputValue={thirdProductSearch}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Rodzaj nadrukowanych doypack/tub - 3"
                    placeholder="Wpisz nazwę produktu lub fragment, np. 'mango', lub 'BRAK'"
                    helperText="Wyszukaj gotowy produkt z magazynu lub wpisz dowolny tekst"
                  />
                )}
                renderOption={(props, option) => (
                  <li {...props} key={option.id || option.name}>
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

export default ProductionShiftForm; 