import React, { useState, useEffect, useRef } from 'react';
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
  Slider,
  Stack
} from '@mui/material';
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { pl } from 'date-fns/locale';
import { Send as SendIcon, ArrowBack as ArrowBackIcon } from '@mui/icons-material';
import { getMONumbersForSelect } from '../../services/moService';
import { formatDateForInput } from '../../utils/dateUtils';
import { db, storage } from '../../services/firebase/config';
import { collection, addDoc, serverTimestamp, doc, updateDoc, getDoc, getDocs } from 'firebase/firestore';
import { ref as firebaseStorageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useNavigate, useLocation } from 'react-router-dom';
import { format } from 'date-fns';
import { query, where } from 'firebase/firestore';
import { getAllOrders } from '../../services/orderService';
import { useAuth } from '../../hooks/useAuth';
import { useStaffOptions, usePositionOptions } from '../../hooks/useFormOptions';

// Funkcja pomocnicza do formatowania daty w prawidłowym formacie dla pola expiryDate
const formatExpiryDate = (dateValue) => {
  try {
    if (!dateValue) return '';
    
    let date;
    
    // Jeśli to obiekt Date
    if (dateValue instanceof Date) {
      date = dateValue;
    }
    // Jeśli to timestamp Firestore
    else if (dateValue.toDate && typeof dateValue.toDate === 'function') {
      date = dateValue.toDate();
    }
    // Jeśli to timestamp z sekundami
    else if (dateValue.seconds) {
      date = new Date(dateValue.seconds * 1000);
    }
    // Jeśli to string
    else if (typeof dateValue === 'string') {
      // Usuń ewentualne spacje
      const trimmedDate = dateValue.trim();
      
      // Sprawdź różne formaty daty
      if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(trimmedDate)) {
        // Format MM/DD/YYYY lub M/D/YYYY
        const [month, day, year] = trimmedDate.split('/');
        date = new Date(year, month - 1, day);
      } else if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(trimmedDate)) {
        // Format ISO YYYY-MM-DD
        date = new Date(trimmedDate);
      } else if (/^\d{1,2}\/\d{4}$/.test(trimmedDate)) {
        // Format MM/YYYY
        const [month, year] = trimmedDate.split('/');
        // Ustaw jako pierwszy dzień miesiąca
        date = new Date(year, month - 1, 1);
      } else if (/^\d{1,2}\.\d{1,2}\.\d{4}$/.test(trimmedDate)) {
        // Format DD.MM.YYYY
        const [day, month, year] = trimmedDate.split('.');
        date = new Date(year, month - 1, day);
      } else {
        // Standardowe parsowanie daty
        date = new Date(trimmedDate);
      }
      
      // Sprawdź czy data jest poprawna
      if (isNaN(date.getTime())) {
        console.error('Invalid date format:', dateValue);
        return '';
      }
    } else {
      return '';
    }
    
    // Formatuj datę do wyświetlenia w formacie DD.MM.YYYY (format polski)
    return format(date, 'dd.MM.yyyy');
  } catch (error) {
    console.error('Error formatting expiry date:', error, dateValue);
    return '';
  }
};

// Funkcja do pobierania szczegółów zadania produkcyjnego (MO) na podstawie numeru MO
const getMODetailsById = async (moNumber) => {
  try {
    const tasksRef = collection(db, 'productionTasks');
    const q = query(tasksRef, where('moNumber', '==', moNumber));
    const querySnapshot = await getDocs(q);
    
    if (!querySnapshot.empty) {
      const taskDoc = querySnapshot.docs[0];
      const taskData = taskDoc.data();
      
      // Pobierz nazwę produktu i przygotuj ją do lepszego dopasowania
      let productName = taskData.productName || '';
      
      // Formatuj datę ważności
      let expiryDate = null;
      if (taskData.expiryDate) {
        try {
          if (taskData.expiryDate instanceof Date) {
            expiryDate = taskData.expiryDate;
          } else if (taskData.expiryDate.toDate && typeof taskData.expiryDate.toDate === 'function') {
            expiryDate = taskData.expiryDate.toDate();
          } else if (taskData.expiryDate.seconds) {
            expiryDate = new Date(taskData.expiryDate.seconds * 1000);
          } else {
            expiryDate = new Date(taskData.expiryDate);
          }
        } catch (error) {
          console.error('Błąd podczas formatowania daty ważności:', error);
        }
      }
      
      return {
        id: taskDoc.id,
        moNumber: taskData.moNumber,
        productName: productName,
        lotNumber: taskData.lotNumber || `SN/${taskData.moNumber}`,
        expiryDate: expiryDate,
        quantity: taskData.quantity || '',
        orderNumber: taskData.orderNumber || '' // Dodaj orderNumber
      };
    }
    
    return null;
  } catch (error) {
    console.error('Błąd podczas pobierania szczegółów MO:', error);
    return null;
  }
};

const ProductionControlForm = ({ 
  isDialog = false, 
  onClose = null, 
  prefilledData = {}, 
  onSuccess = null 
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const isEditMode = searchParams.get('edit') === 'true';
  const { currentUser } = useAuth();

  // Używamy hooków do pobierania opcji z bazy danych
  const { options: staffOptions, loading: staffLoading } = useStaffOptions();
  const { options: positionOptions, loading: positionLoading } = usePositionOptions();
  
  const [customerOrders, setCustomerOrders] = useState([]);
  const [loadingCustomerOrders, setLoadingCustomerOrders] = useState(false);

  const [formData, setFormData] = useState({
    email: prefilledData.email || '',
    name: prefilledData.name || '',
    position: prefilledData.position || '',
    fillDate: prefilledData.fillDate || new Date(),
    manufacturingOrder: prefilledData.manufacturingOrder || '',
    customerOrder: prefilledData.customerOrder || '',
    productionStartDate: prefilledData.productionStartDate || new Date(),
    productionStartTime: prefilledData.productionStartTime || '',
    productionEndDate: prefilledData.productionEndDate || new Date(),
    productionEndTime: prefilledData.productionEndTime || '',
    readingDate: prefilledData.readingDate || new Date(),
    readingTime: prefilledData.readingTime || '',
    productName: prefilledData.productName || '',
    lotNumber: prefilledData.lotNumber || '',
    expiryDate: prefilledData.expiryDate || '',
    quantity: prefilledData.quantity || '',
    shiftNumber: prefilledData.shiftNumber || [],
    rawMaterialPurity: prefilledData.rawMaterialPurity || 'Prawidłowa',
    packagingPurity: prefilledData.packagingPurity || 'Prawidłowa',
    packagingClosure: prefilledData.packagingClosure || 'Prawidłowa',
    packagingQuantity: prefilledData.packagingQuantity || 'Prawidłowa',
    documentScans: null,
    productPhoto1: null,
    productPhoto2: null,
    productPhoto3: null,
    humidity: prefilledData.humidity || '',
    temperature: prefilledData.temperature || ''
  });

  const [validationErrors, setValidationErrors] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [moOptions, setMoOptions] = useState([]);
  const [loadingMO, setLoadingMO] = useState(false);
  const [editId, setEditId] = useState(null);

  // Ref do timeoutów dla debounce'owania suwaków
  const sliderTimeoutRef = useRef(null);

  // Pobierz numery MO i ustaw email użytkownika przy pierwszym renderowaniu komponentu
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

  // Pobierz listę zamówień klientów przy pierwszym renderowaniu komponentu
  useEffect(() => {
    const fetchCustomerOrders = async () => {
      try {
        setLoadingCustomerOrders(true);
        // Pobierz wszystkie zamówienia klientów bez filtrowania po statusie
        const orders = await getAllOrders();
        // Filtruj tylko aby upewnić się, że mają numer zamówienia
        const filteredOrders = orders.filter(order => 
          order.orderNumber && 
          order.type !== 'purchase' // Upewnij się, że to nie są zamówienia zakupu
        );

        console.log('Pobrane zamówienia klientów:', filteredOrders);

        // Przygotuj opcje dla selecta
        const options = filteredOrders.map(order => ({
          value: order.orderNumber,
          label: `${order.orderNumber} - ${order.customer?.name || 'Brak nazwy klienta'}`
        }));

        setCustomerOrders(options);
      } catch (error) {
        console.error('Błąd podczas pobierania zamówień klientów:', error);
      } finally {
        setLoadingCustomerOrders(false);
      }
    };

    fetchCustomerOrders();
  }, []);

  // Sprawdź, czy istnieją dane do edycji w sessionStorage
  useEffect(() => {
    if (isEditMode) {
      const editData = JSON.parse(sessionStorage.getItem('editFormData'));
      if (editData) {
        // Konwersja timestampów na daty (jeśli istnieją)
        const fillDate = editData.fillDate ? 
          (typeof editData.fillDate === 'string' ? new Date(editData.fillDate) : editData.fillDate) : 
          new Date();
        
        const productionStartDate = editData.productionStartDate ? 
          (typeof editData.productionStartDate === 'string' ? new Date(editData.productionStartDate) : editData.productionStartDate) : 
          new Date();
        
        const productionEndDate = editData.productionEndDate ? 
          (typeof editData.productionEndDate === 'string' ? new Date(editData.productionEndDate) : editData.productionEndDate) : 
          new Date();
        
        const readingDate = editData.readingDate ? 
          (typeof editData.readingDate === 'string' ? new Date(editData.readingDate) : editData.readingDate) : 
          new Date();
        
        // Konwersja wilgotności i temperatury ze stringa na liczbę, jeśli to możliwe
        let humidity = editData.humidity || '';
        let temperature = editData.temperature || '';
        
        // Próba konwersji wilgotności na liczbę (usuń znak '%' jeśli istnieje)
        if (typeof humidity === 'string') {
          const humidityMatch = humidity.match(/(\d+)%?/);
          if (humidityMatch && humidityMatch[1]) {
            humidity = parseInt(humidityMatch[1], 10);
          } else if (humidity === 'PONIŻEJ NORMY 40%!') {
            humidity = 35; // Wartość poniżej normy
          } else if (humidity === 'POWYŻEJ NORMY 60%!') {
            humidity = 65; // Wartość powyżej normy
          }
        }
        
        // Próba konwersji temperatury na liczbę (usuń znak '°C' jeśli istnieje)
        if (typeof temperature === 'string') {
          const temperatureMatch = temperature.match(/(\d+)°?C?/);
          if (temperatureMatch && temperatureMatch[1]) {
            temperature = parseInt(temperatureMatch[1], 10);
          } else if (temperature === 'PONIŻEJ 10°C!') {
            temperature = 7; // Wartość poniżej normy
          } else if (temperature === 'POWYŻEJ 25°C!') {
            temperature = 28; // Wartość powyżej normy
          }
        }
        
        setFormData({
          email: editData.email || '',
          name: editData.name || '',
          position: editData.position || '',
          fillDate: fillDate,
          manufacturingOrder: editData.manufacturingOrder || '',
          customerOrder: editData.customerOrder || '',
          productionStartDate: productionStartDate,
          productionStartTime: editData.productionStartTime || '',
          productionEndDate: productionEndDate,
          productionEndTime: editData.productionEndTime || '',
          readingDate: readingDate,
          readingTime: editData.readingTime || '',
          productName: editData.productName || '',
          lotNumber: editData.lotNumber || '',
          expiryDate: editData.expiryDate || '',
          quantity: editData.quantity || '',
          shiftNumber: editData.shiftNumber || [],
          rawMaterialPurity: editData.rawMaterialPurity || 'Prawidłowa',
          packagingPurity: editData.packagingPurity || 'Prawidłowa',
          packagingClosure: editData.packagingClosure || 'Prawidłowa',
          packagingQuantity: editData.packagingQuantity || 'Prawidłowa',
          documentScans: null,
          productPhoto1: null,
          productPhoto2: null,
          productPhoto3: null,
          humidity: humidity,
          temperature: temperature
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
    if (name === 'manufacturingOrder' && value) {
      try {
        // Pokaż spinner ładowania
        setLoadingMO(true);
        
        // Pobierz szczegóły MO
        const moDetails = await getMODetailsById(value);
        
        if (moDetails) {
          // Format daty ważności do wyświetlenia - używamy pełnej daty
          let formattedExpiryDate = '';
          if (moDetails.expiryDate) {
            try {
              formattedExpiryDate = formatExpiryDate(moDetails.expiryDate);
            } catch (error) {
              console.error('Błąd formatowania daty ważności:', error);
            }
          }
          
          // Użyj nazwy produktu bezpośrednio z zadania produkcyjnego
          const productName = moDetails.productName || '';
          
          // Aktualizuj formularz o dane z MO
          setFormData(prev => ({
            ...prev,
            productName: productName,
            lotNumber: moDetails.lotNumber || '',
            expiryDate: formattedExpiryDate, // Używamy pełnej daty
            customerOrder: moDetails.orderNumber || '' // Automatycznie ustaw Customer Order
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

  const handleSliderChange = (event, newValue, name) => {
    // Używamy debounce aby poprawić wydajność podczas przeciągania
    if (sliderTimeoutRef.current) {
      clearTimeout(sliderTimeoutRef.current);
    }
    
    sliderTimeoutRef.current = setTimeout(() => {
      setFormData(prev => ({
        ...prev,
        [name]: newValue
      }));
    }, 10); // Opóźnienie 10ms
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (validate()) {
      try {
        setSubmitted(false);
        
        // Ścieżka do kolekcji odpowiedzi formularza w Firestore
        const odpowiedziRef = collection(db, 'Forms/KontrolaProdukcji/Odpowiedzi');
        
        // Przygotuj dane do zapisania
        const odpowiedzData = {
          email: formData.email,
          name: formData.name,
          position: formData.position,
          fillDate: formData.fillDate,
          manufacturingOrder: formData.manufacturingOrder,
          customerOrder: formData.customerOrder,
          productionStartDate: formData.productionStartDate,
          productionStartTime: formData.productionStartTime,
          productionEndDate: formData.productionEndDate,
          productionEndTime: formData.productionEndTime,
          readingDate: formData.readingDate,
          readingTime: formData.readingTime,
          productName: formData.productName,
          lotNumber: formData.lotNumber,
          expiryDate: formData.expiryDate,
          quantity: formData.quantity,
          shiftNumber: formData.shiftNumber,
          rawMaterialPurity: formData.rawMaterialPurity,
          packagingPurity: formData.packagingPurity,
          packagingClosure: formData.packagingClosure,
          packagingQuantity: formData.packagingQuantity,
          // Zapisz temperaturę i wilgotność w formacie z jednostką
          humidity: typeof formData.humidity === 'number' ? `${formData.humidity}%` : formData.humidity,
          temperature: typeof formData.temperature === 'number' ? `${formData.temperature}°C` : formData.temperature,
          createdAt: serverTimestamp()
        };
        
        // Prześlij pliki do Firebase Storage i dodaj URL do dokumentu
        const uploadFiles = async () => {
          const fileFields = ['documentScans', 'productPhoto1', 'productPhoto2', 'productPhoto3'];
          
          for (const field of fileFields) {
            if (formData[field]) {
              const storageRef = firebaseStorageRef(storage, `forms/kontrola-produkcji/${formData.manufacturingOrder}/${field}-${Date.now()}-${formData[field].name}`);
              await uploadBytes(storageRef, formData[field]);
              const fileUrl = await getDownloadURL(storageRef);
              odpowiedzData[`${field}Url`] = fileUrl;
              odpowiedzData[`${field}Name`] = formData[field].name;
            }
          }
        };
        
        await uploadFiles();
        
        // Zapisz odpowiedź w Firestore
        if (isEditMode && editId) {
          // Aktualizacja istniejącego dokumentu
          const docRef = doc(db, 'Forms/KontrolaProdukcji/Odpowiedzi', editId);
          await updateDoc(docRef, odpowiedzData);
          console.log('Formularz kontroli produkcji zaktualizowany z danymi:', odpowiedzData);
        } else {
          // Dodanie nowego dokumentu
          await addDoc(odpowiedziRef, odpowiedzData);
          console.log('Formularz kontroli produkcji wysłany z danymi:', odpowiedzData);
        }
        
      setSubmitted(true);
      
      // W trybie dialogu - wywołaj callback i zamknij dialog
      if (isDialog) {
        if (onSuccess) {
          onSuccess(odpowiedzData);
        }
        setTimeout(() => {
          if (onClose) {
            onClose();
          }
        }, 1500); // Krótkie opóźnienie aby użytkownik zobaczył komunikat sukcesu
      } else {
        // Reset formularza po pomyślnym wysłaniu (tylko w trybie normalnym)
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
      } catch (error) {
        console.error('Błąd podczas zapisywania formularza kontroli produkcji:', error);
        alert(`Wystąpił błąd podczas zapisywania formularza: ${error.message}`);
      }
    }
  };
  
  const handleBack = () => {
    if (isDialog && onClose) {
      onClose();
    } else {
      navigate('/production/forms/responses');
    }
  };

  // Wyczyść timeout przy odmontowaniu komponentu
  useEffect(() => {
    return () => {
      if (sliderTimeoutRef.current) {
        clearTimeout(sliderTimeoutRef.current);
      }
    };
  }, []);

  const FormContent = () => (
    <>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h5" gutterBottom align="center" fontWeight="bold">
          {isEditMode ? 'EDYCJA - RAPORT KONTROLA PRODUKCJI' : 'RAPORT - KONTROLA PRODUKCJI'}
        </Typography>
        <Typography variant="body2" align="center" color="text.secondary" paragraph>
          W razie awarii i pilnych zgłoszeń prosimy o kontakt: mateusz@bgwpharma.com
        </Typography>
        <Divider />
      </Box>

        {submitted && (
          <Alert severity="success" sx={{ mb: 3 }}>
            {isEditMode ? 'Raport kontroli produkcji został zaktualizowany pomyślnie!' : 'Raport kontroli produkcji został wysłany pomyślnie!'}
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
              <FormControl 
                fullWidth
                error={!!validationErrors.customerOrder}
              >
                <InputLabel>Customer Order</InputLabel>
                <Select
                name="customerOrder"
                value={formData.customerOrder}
                onChange={handleChange}
                  label="Customer Order"
                  disabled={loadingCustomerOrders}
                  startAdornment={
                    loadingCustomerOrders ? 
                    <CircularProgress size={20} sx={{ mr: 1 }} /> : 
                    null
                  }
                >
                  <MenuItem value="">
                    <em>Wybierz zamówienie klienta</em>
                  </MenuItem>
                  {customerOrders.map((option) => (
                    <MenuItem key={option.value} value={option.value}>
                      {option.label}
                    </MenuItem>
                  ))}
                </Select>
                {validationErrors.customerOrder && (
                  <Typography variant="caption" color="error">
                    {validationErrors.customerOrder}
                  </Typography>
                )}
              </FormControl>
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
              <TextField
                required
                fullWidth
                label="Nazwa produktu"
                name="productName"
                value={formData.productName}
                onChange={handleChange}
                error={!!validationErrors.productName}
                helperText={validationErrors.productName || "Nazwa produktu jest automatycznie wypełniana na podstawie wybranego MO"}
                InputProps={{
                  readOnly: true,
                }}
              />
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
              <FormControl component="fieldset" fullWidth>
                <FormLabel component="legend">Zmierzona wilgotność powietrza w pomieszczeniu</FormLabel>
                <Box sx={{ px: 2, py: 3 }}>
                  <Stack spacing={2} direction="row" alignItems="center" sx={{ mb: 1 }}>
                    <Typography variant="body2" color="error">PONIŻEJ NORMY!</Typography>
                    <Slider
                  name="humidity"
                      value={typeof formData.humidity === 'number' ? formData.humidity : 45}
                      onChange={(e, newValue) => handleSliderChange(e, newValue, 'humidity')}
                      min={20}
                      max={70}
                      step={1}
                      marks={[
                        { value: 20, label: '20%' },
                        { value: 30, label: '30%' },
                        { value: 40, label: '40%' },
                        { value: 50, label: '50%' },
                        { value: 60, label: '60%' },
                        { value: 70, label: '70%' }
                      ]}
                      valueLabelDisplay="on"
                      valueLabelFormat={(value) => `${value}%`}
                      sx={{
                        '& .MuiSlider-markLabel': { fontSize: '0.75rem' },
                        '& .MuiSlider-track': { 
                          background: (theme) => {
                            const value = typeof formData.humidity === 'number' ? formData.humidity : 45;
                            return value < 40 || value > 60 
                              ? theme.palette.error.main 
                              : theme.palette.success.main;
                          }
                        },
                        '& .MuiSlider-rail': { opacity: 0.5 },
                        '& .MuiSlider-thumb': {
                          height: 24,
                          width: 24,
                          '&:hover': {
                            boxShadow: '0 0 0 8px rgba(25, 118, 210, 0.16)'
                          }
                        }
                      }}
                    />
                    <Typography variant="body2" color="error">POWYŻEJ NORMY!</Typography>
                  </Stack>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', px: 1 }}>
                    <Typography variant="caption" color="text.secondary">
                      Prawidłowy zakres: 40-60%
                    </Typography>
                    <Typography variant="caption" fontWeight="bold">
                      Wybrana wartość: {typeof formData.humidity === 'number' ? `${formData.humidity}%` : 'Nie wybrano'}
                    </Typography>
                  </Box>
                </Box>
              </FormControl>
            </Grid>
            
            <Grid item xs={12}>
              <FormControl component="fieldset" fullWidth>
                <FormLabel component="legend">Zmierzona temperatura powietrza w pomieszczeniu</FormLabel>
                <Box sx={{ px: 2, py: 3 }}>
                  <Stack spacing={2} direction="row" alignItems="center" sx={{ mb: 1 }}>
                    <Typography variant="body2" color="error">PONIŻEJ NORMY!</Typography>
                    <Slider
                  name="temperature"
                      value={typeof formData.temperature === 'number' ? formData.temperature : 20}
                      onChange={(e, newValue) => handleSliderChange(e, newValue, 'temperature')}
                      min={5}
                      max={40}
                      step={1}
                      marks={[
                        { value: 5, label: '5°C' },
                        { value: 10, label: '10°C' },
                        { value: 15, label: '15°C' },
                        { value: 20, label: '20°C' },
                        { value: 25, label: '25°C' },
                        { value: 30, label: '30°C' },
                        { value: 35, label: '35°C' },
                        { value: 40, label: '40°C' }
                      ]}
                      valueLabelDisplay="on"
                      valueLabelFormat={(value) => `${value}°C`}
                      sx={{
                        '& .MuiSlider-markLabel': { fontSize: '0.75rem' },
                        '& .MuiSlider-track': { 
                          background: (theme) => {
                            const value = typeof formData.temperature === 'number' ? formData.temperature : 20;
                            return value < 10 || value > 25 
                              ? theme.palette.error.main 
                              : theme.palette.success.main;
                          }
                        },
                        '& .MuiSlider-rail': { opacity: 0.5 },
                        '& .MuiSlider-thumb': {
                          height: 24,
                          width: 24,
                          '&:hover': {
                            boxShadow: '0 0 0 8px rgba(25, 118, 210, 0.16)'
                          }
                        }
                      }}
                    />
                    <Typography variant="body2" color="error">POWYŻEJ NORMY!</Typography>
                  </Stack>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', px: 1 }}>
                    <Typography variant="caption" color="text.secondary">
                      Prawidłowy zakres: 10-25°C
                    </Typography>
                    <Typography variant="caption" fontWeight="bold">
                      Wybrana wartość: {typeof formData.temperature === 'number' ? `${formData.temperature}°C` : 'Nie wybrano'}
                    </Typography>
                  </Box>
                </Box>
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
    </>
  );

  // W trybie dialogu zwróć tylko zawartość formularza
  if (isDialog) {
    return <FormContent />;
  }

  // W trybie normalnym zwróć formularz w kontenerze
  return (
    <Container maxWidth="md" sx={{ mt: 4, mb: 4 }}>
      <Paper sx={{ p: 4 }}>
        <FormContent />
      </Paper>
    </Container>
  );
};

export default ProductionControlForm; 