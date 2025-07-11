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
  Stack,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions
} from '@mui/material';
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { pl } from 'date-fns/locale';
import { Send as SendIcon, ArrowBack as ArrowBackIcon, Delete as DeleteIcon, Visibility as VisibilityIcon, AttachFile as AttachFileIcon, Sensors as SensorsIcon } from '@mui/icons-material';
import { useTheme } from '@mui/material/styles';
import { getMONumbersForSelect } from '../../services/moService';
import { formatDateForInput } from '../../utils/dateUtils';
import { db, storage } from '../../services/firebase/config';
import { collection, addDoc, serverTimestamp, doc, updateDoc, getDoc, getDocs } from 'firebase/firestore';
import { ref as firebaseStorageRef, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { useNavigate, useLocation } from 'react-router-dom';
import { format } from 'date-fns';
import { query, where } from 'firebase/firestore';
import { getAllOrders } from '../../services/orderService';
import { useAuth } from '../../hooks/useAuth';
import { useStaffOptions, usePositionOptions } from '../../hooks/useFormOptions';
import FileOrCameraInput from '../common/FileOrCameraInput';
import { 
  getSensors, 
  getCurrentSensorData, 
  getSensorDataForDateTime,
  formatSensorTimestamp,
  checkEnvironmentalNorms 
} from '../../services/environmentalConditionsService';

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

// Komponent do wyświetlania istniejącego załącznika
const ExistingAttachment = ({ fileUrl, fileName, onRemove, fieldName }) => {
  if (!fileUrl) return null;

  const isImage = fileName && /\.(jpg|jpeg|png|gif|bmp|webp)$/i.test(fileName);

  return (
    <Box sx={{ 
      mt: 1, 
      p: 2, 
      border: '1px solid #e0e0e0', 
      borderRadius: 1, 
      backgroundColor: 'rgba(0, 0, 0, 0.02)',
      display: 'flex',
      alignItems: 'center',
      gap: 2
    }}>
      {isImage ? (
        <img 
          src={fileUrl} 
          alt={fileName || 'Załącznik'}
          style={{ 
            maxWidth: '60px', 
            maxHeight: '60px', 
            borderRadius: '4px',
            cursor: 'pointer' 
          }}
          onClick={() => window.open(fileUrl, '_blank')}
        />
      ) : (
        <AttachFileIcon color="action" />
      )}
      
      <Box sx={{ flexGrow: 1 }}>
        <Typography variant="body2" color="text.primary">
          {fileName || 'Załączony plik'}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Aktualnie załączony plik
        </Typography>
      </Box>
      
      <Box sx={{ display: 'flex', gap: 1 }}>
        <Button
          size="small"
          variant="outlined"
          startIcon={<VisibilityIcon />}
          onClick={() => window.open(fileUrl, '_blank')}
        >
          Pokaż
        </Button>
        <Button
          size="small"
          variant="outlined"
          color="error"
          startIcon={<DeleteIcon />}
          onClick={() => onRemove(fieldName)}
        >
          Usuń
        </Button>
      </Box>
    </Box>
  );
};

// Komponent do wyświetlania podglądu nowo wybranego pliku
const FilePreview = ({ file, onRemove, fieldName }) => {
  const [previewUrl, setPreviewUrl] = useState(null);

  useEffect(() => {
    if (file && file instanceof File) {
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
      
      // Cleanup URL gdy komponent się odmontowuje
      return () => {
        URL.revokeObjectURL(url);
      };
    }
  }, [file]);

  if (!file) return null;

  const isImage = file.type.startsWith('image/');

  return (
    <Box sx={{ 
      mt: 1, 
      p: 2, 
      border: '1px solid #2196f3', 
      borderRadius: 1, 
      backgroundColor: 'rgba(33, 150, 243, 0.08)',
      display: 'flex',
      alignItems: 'center',
      gap: 2
    }}>
      {isImage && previewUrl ? (
        <img 
          src={previewUrl} 
          alt={file.name}
          style={{ 
            maxWidth: '60px', 
            maxHeight: '60px', 
            borderRadius: '4px',
            cursor: 'pointer' 
          }}
          onClick={() => window.open(previewUrl, '_blank')}
        />
      ) : (
        <AttachFileIcon color="primary" />
      )}
      
      <Box sx={{ flexGrow: 1 }}>
        <Typography variant="body2" color="text.primary">
          {file.name}
        </Typography>
        <Typography variant="caption" color="primary">
          Nowy plik - gotowy do zapisania
        </Typography>
      </Box>
      
      <Box sx={{ display: 'flex', gap: 1 }}>
        {isImage && previewUrl && (
          <Button
            size="small"
            variant="outlined"
            startIcon={<VisibilityIcon />}
            onClick={() => window.open(previewUrl, '_blank')}
          >
            Podgląd
          </Button>
        )}
        <Button
          size="small"
          variant="outlined"
          color="error"
          startIcon={<DeleteIcon />}
          onClick={() => onRemove(fieldName)}
        >
          Usuń
        </Button>
      </Box>
    </Box>
  );
};

const ProductionControlForm = ({ 
  isDialog = false, 
  onClose = null, 
  prefilledData = {}, 
  onSuccess = null 
}) => {
  const theme = useTheme();
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
    documentScansUrl: prefilledData.documentScansUrl || '',
    documentScansName: prefilledData.documentScansName || '',
    productPhoto1Url: prefilledData.productPhoto1Url || '',
    productPhoto1Name: prefilledData.productPhoto1Name || '',
    productPhoto2Url: prefilledData.productPhoto2Url || '',
    productPhoto2Name: prefilledData.productPhoto2Name || '',
    productPhoto3Url: prefilledData.productPhoto3Url || '',
    productPhoto3Name: prefilledData.productPhoto3Name || '',
    humidity: prefilledData.humidity || 45, // Domyślna wartość w środku zakresu (45%)
    temperature: prefilledData.temperature || 20 // Domyślna wartość w środku zakresu (20°C)
  });

  const [validationErrors, setValidationErrors] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [moOptions, setMoOptions] = useState([]);
  const [loadingMO, setLoadingMO] = useState(false);
  const [editId, setEditId] = useState(null);
  const [removedAttachments, setRemovedAttachments] = useState([]); // Śledzenie usuniętych załączników

  // Stany dla czujników środowiskowych
  const [sensors, setSensors] = useState([]);
  const [selectedSensor, setSelectedSensor] = useState('');
  const [loadingSensors, setLoadingSensors] = useState(false);
  const [sensorData, setSensorData] = useState(null);

  // Stany dla okienka dialogowego z informacjami o czujniku
  const [sensorInfoDialog, setSensorInfoDialog] = useState({
    open: false,
    title: '',
    message: '',
    isError: false
  });

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

    // Ustaw email zalogowanego użytkownika i upewnij się że domyślne wartości suwaków są ustawione
    if (currentUser && currentUser.email) {
      setFormData(prev => ({
        ...prev,
        email: currentUser.email,
        // Upewnij się że domyślne wartości suwaków są ustawione jeśli nie są jeszcze
        humidity: prev.humidity !== '' ? prev.humidity : 45,
        temperature: prev.temperature !== '' ? prev.temperature : 20
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

  // Pobierz listę dostępnych czujników
  useEffect(() => {
    const fetchSensors = async () => {
      try {
        setLoadingSensors(true);
        const sensorsList = await getSensors();
        setSensors(sensorsList);
        
        // Automatycznie wybierz pierwszy dostępny czujnik
        if (sensorsList.length > 0) {
          setSelectedSensor(sensorsList[0].id);
        }
      } catch (error) {
        console.error('Błąd podczas pobierania listy czujników:', error);
      } finally {
        setLoadingSensors(false);
      }
    };

    fetchSensors();
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
        let humidity = editData.humidity || 45; // Domyślna wartość jeśli brak danych
        let temperature = editData.temperature || 20; // Domyślna wartość jeśli brak danych
        
        // Próba konwersji wilgotności na liczbę (usuń znak '%' jeśli istnieje)
        if (typeof humidity === 'string') {
          const humidityMatch = humidity.match(/(\d+)%?/);
          if (humidityMatch && humidityMatch[1]) {
            humidity = parseInt(humidityMatch[1], 10);
          } else if (humidity === 'PONIŻEJ NORMY 40%!') {
            humidity = 35; // Wartość poniżej normy
          } else if (humidity === 'POWYŻEJ NORMY 60%!') {
            humidity = 65; // Wartość powyżej normy
          } else {
            humidity = 45; // Domyślna wartość jeśli nie można sparsować
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
          } else {
            temperature = 20; // Domyślna wartość jeśli nie można sparsować
          }
        }
        
        // Ustaw również dane czujnika w trybie edycji
        if (editData.selectedSensor) {
          setSelectedSensor(editData.selectedSensor);
        }
        if (editData.sensorDataTimestamp) {
          setSensorData({
            timestamp: editData.sensorDataTimestamp,
            temperature: parseFloat(editData.temperature) || 20,
            humidity: parseFloat(editData.humidity) || 45
          });
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
          documentScansUrl: editData.documentScansUrl || '',
          documentScansName: editData.documentScansName || '',
          productPhoto1Url: editData.productPhoto1Url || '',
          productPhoto1Name: editData.productPhoto1Name || '',
          productPhoto2Url: editData.productPhoto2Url || '',
          productPhoto2Name: editData.productPhoto2Name || '',
          productPhoto3Url: editData.productPhoto3Url || '',
          productPhoto3Name: editData.productPhoto3Name || '',
          humidity: humidity,
          temperature: temperature
        });
        setEditId(editData.id);
      }
      // Wyczyść dane z sessionStorage po ich wykorzystaniu
      sessionStorage.removeItem('editFormData');
    }
  }, [isEditMode]);

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

  // Oddzielna funkcja do obsługi zmiany Manufacturing Order
  const handleMOChange = async (e) => {
    const { name, value } = e.target;
    
    // Najpierw zaktualizuj stan formularza
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    
    // Jeśli zmieniono numer MO, pobierz dodatkowe dane i uzupełnij pola
    if (name === 'manufacturingOrder' && value) {
      try {
        setLoadingMO(true);
        
        // Pobierz szczegóły MO
        const moDetails = await getMODetailsById(value);
        
        if (moDetails) {
          // Format daty ważności do wyświetlenia
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
            expiryDate: formattedExpiryDate,
            customerOrder: moDetails.orderNumber || ''
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
        [fieldName]: file,
        // Wyczyść istniejący URL gdy użytkownik wybierze nowy plik
        [`${fieldName}Url`]: '',
        [`${fieldName}Name`]: ''
      }));
    }
  };

  const handleRemoveAttachment = (fieldName) => {
    // Jeśli istnieje URL do pliku, dodaj go do listy do usunięcia
    if (formData[`${fieldName}Url`]) {
      setRemovedAttachments(prev => [...prev, {
        fieldName,
        url: formData[`${fieldName}Url`],
        name: formData[`${fieldName}Name`]
      }]);
    }
    
    // Wyczyść wszystkie pola związane z tym załącznikiem
    setFormData(prev => ({
      ...prev,
      [fieldName]: null,
      [`${fieldName}Url`]: '',
      [`${fieldName}Name`]: ''
    }));
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

  // Funkcje obsługi czujników środowiskowych
  const handleSensorChange = (e) => {
    setSelectedSensor(e.target.value);
  };

  const showSensorInfoDialog = (title, message, isError = false) => {
    setSensorInfoDialog({
      open: true,
      title,
      message,
      isError
    });
  };

  const closeSensorInfoDialog = () => {
    setSensorInfoDialog(prev => ({
      ...prev,
      open: false
    }));
  };

  const handleLoadSensorData = async () => {
    if (!selectedSensor) {
      showSensorInfoDialog('Błąd', 'Proszę wybrać czujnik', true);
      return;
    }

    if (!formData.readingDate || !formData.readingTime) {
      showSensorInfoDialog('Błąd', 'Proszę podać datę i godzinę odczytu', true);
      return;
    }

    try {
      const data = await getSensorDataForDateTime(
        selectedSensor, 
        formData.readingDate, 
        formData.readingTime
      );
      setSensorData(data);
      
      // Zaktualizuj tylko wartości temperatury i wilgotności
      // (data i godzina już są ustawione przez użytkownika)
      setFormData(prev => ({
        ...prev,
        temperature: Math.round(data.temperature * 10) / 10, // Zaokrąglij do jednego miejsca po przecinku
        humidity: Math.round(data.humidity * 10) / 10
      }));

      // Pokaż komunikat o pomyślnym pobraniu danych
      const norms = checkEnvironmentalNorms(data.temperature, data.humidity);
      const temperatureStatus = norms.temperature.isInRange ? 'w normie' : norms.temperature.message.toLowerCase();
      const humidityStatus = norms.humidity.isInRange ? 'w normie' : norms.humidity.message.toLowerCase();
      const actualTimestamp = formatSensorTimestamp(data.timestamp);
      
      let message = `Dane pobrane pomyślnie z czujnika "${selectedSensor}":\n\n` +
                   `🌡️ Temperatura: ${data.temperature.toFixed(1)}°C (${temperatureStatus})\n` +
                   `💧 Wilgotność: ${data.humidity.toFixed(1)}% (${humidityStatus})\n` +
                   `⏰ Rzeczywisty czas odczytu: ${actualTimestamp.full}`;
      
      if (data.timeDifference > 0) {
        message += `\n\n⚠️ Różnica czasowa: ${data.timeDifference} minut od żądanego czasu`;
      }
      
      showSensorInfoDialog('Dane z czujnika pobrane pomyślnie', message);
            
    } catch (error) {
      console.error('Błąd podczas pobierania danych z czujnika:', error);
      showSensorInfoDialog('Błąd pobierania danych', error.message, true);
    }
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
      errors.quantity = 'Wyprodukowana ilość jest wymagana';
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
          // Dodaj informacje o źródle danych środowiskowych
          selectedSensor: selectedSensor,
          sensorDataTimestamp: sensorData ? sensorData.timestamp : null,
          createdAt: serverTimestamp()
        };
        
        // Prześlij pliki do Firebase Storage i dodaj URL do dokumentu
        const uploadFiles = async () => {
          const fileFields = ['documentScans', 'productPhoto1', 'productPhoto2', 'productPhoto3'];
          
          // Usuń pliki które zostały oznaczone do usunięcia
          for (const removedFile of removedAttachments) {
            try {
              // Wyciągnij ścieżkę z URL Firebase Storage
              const url = removedFile.url;
              if (url.includes('firebase')) {
                // Dekoduj URL aby uzyskać ścieżkę pliku
                const baseUrl = 'https://firebasestorage.googleapis.com/v0/b/';
                const pathStart = url.indexOf('/o/') + 3;
                const pathEnd = url.indexOf('?');
                if (pathStart > 2 && pathEnd > pathStart) {
                  const filePath = decodeURIComponent(url.substring(pathStart, pathEnd));
                  const fileRef = firebaseStorageRef(storage, filePath);
                  await deleteObject(fileRef);
                  console.log(`Usunięto plik: ${filePath}`);
                }
              }
            } catch (error) {
              console.error('Błąd podczas usuwania pliku:', error);
              // Kontynuuj mimo błędu usuwania
            }
          }
          
          for (const field of fileFields) {
            // Sprawdź czy pole zostało usunięte
            const wasRemoved = removedAttachments.some(removed => removed.fieldName === field);
            
            if (formData[field]) {
              // Jeśli wybrano nowy plik, prześlij go
              const storageRef = firebaseStorageRef(storage, `forms/kontrola-produkcji/${formData.manufacturingOrder}/${field}-${Date.now()}-${formData[field].name}`);
              await uploadBytes(storageRef, formData[field]);
              const fileUrl = await getDownloadURL(storageRef);
              odpowiedzData[`${field}Url`] = fileUrl;
              odpowiedzData[`${field}Name`] = formData[field].name;
            } else if (formData[`${field}Url`] && !wasRemoved) {
              // Jeśli nie wybrano nowego pliku ale istnieje URL i nie został usunięty, zachowaj go
              odpowiedzData[`${field}Url`] = formData[`${field}Url`];
              odpowiedzData[`${field}Name`] = formData[`${field}Name`];
            } else if (wasRemoved) {
              // Jeśli plik został usunięty, ustaw pola na null
              odpowiedzData[`${field}Url`] = null;
              odpowiedzData[`${field}Name`] = null;
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
      
      // Wyczyść listę usuniętych załączników po pomyślnym zapisie
      setRemovedAttachments([]);
      
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
          documentScansUrl: '',
          documentScansName: '',
          productPhoto1Url: '',
          productPhoto1Name: '',
          productPhoto2Url: '',
          productPhoto2Name: '',
          productPhoto3Url: '',
          productPhoto3Name: '',
          humidity: 45, // Domyślna wartość w środku zakresu (45%)
          temperature: 20 // Domyślna wartość w środku zakresu (20°C)
        });
        setRemovedAttachments([]); // Wyczyść listę usuniętych załączników
        
        // Przekierowanie do strony odpowiedzi po 2 sekundach
        setTimeout(() => {
          navigate('/production/forms/responses');
        }, 2000);
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

  // Główny content formularza
  const formContent = (
    <>
              <Box sx={{ 
          mb: { xs: 2, sm: 3 },
          p: { xs: 2, sm: 3 },
          borderRadius: 2,
          background: theme.palette.mode === 'dark' 
          ? 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(76,175,80,0.1) 100%)'
          : 'linear-gradient(135deg, #f5f5f5 0%, #e8f5e8 100%)',
          border: '1px solid',
          borderColor: 'divider'
        }}>
        <Typography variant="h5" gutterBottom align="center" fontWeight="bold" sx={{
          fontSize: { xs: '1.25rem', sm: '1.5rem' },
          color: 'primary.main'
        }}>
          {isEditMode ? 'EDYCJA - RAPORT KONTROLA PRODUKCJI' : 'RAPORT - KONTROLA PRODUKCJI'}
        </Typography>
        <Typography variant="body2" align="center" color="text.secondary" paragraph sx={{
          fontSize: { xs: '0.75rem', sm: '0.875rem' },
          mb: 0
        }}>
          W razie awarii i pilnych zgłoszeń prosimy o kontakt: mateusz@bgwpharma.com
        </Typography>
      </Box>

        {submitted && (
          <Alert severity="success" sx={{ mb: 3 }}>
            {isEditMode ? 'Raport kontroli produkcji został zaktualizowany pomyślnie!' : 'Raport kontroli produkcji został wysłany pomyślnie!'}
          </Alert>
        )}
        
        <Box component="form" onSubmit={handleSubmit}>
          <Grid container spacing={{ xs: 2, sm: 3 }}>
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
                  onChange={handleMOChange}
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
            
            {/* Sekcja wyboru czujnika i pobierania danych środowiskowych */}
            <Grid item xs={12}>
              <Box sx={{ 
                mt: 3, 
                mb: 2, 
                p: 2, 
                borderRadius: 2, 
                background: theme.palette.mode === 'dark'
            ? 'linear-gradient(45deg, rgba(33,150,243,0.1) 30%, rgba(156,39,176,0.1) 90%)'
            : 'linear-gradient(45deg, #e3f2fd 30%, #f3e5f5 90%)',
                border: '1px solid',
                borderColor: 'primary.light'
              }}>
                <Typography variant="h6" gutterBottom sx={{ 
                  color: 'primary.main',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  fontWeight: 'bold'
                }}>
                  <SensorsIcon /> Warunki środowiskowe
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Wybierz czujnik i pobierz dane dla określonej daty i godziny odczytu
                </Typography>
              </Box>
            </Grid>
            
            <Grid item xs={12} md={6}>
              <FormControl fullWidth>
                <InputLabel>Wybierz czujnik</InputLabel>
                <Select
                  value={selectedSensor}
                  onChange={handleSensorChange}
                  label="Wybierz czujnik"
                  disabled={loadingSensors}
                  sx={{ 
                    '& .MuiOutlinedInput-root': {
                      backgroundColor: 'background.paper'
                    }
                  }}
                >
                  {sensors.map((sensor) => (
                    <MenuItem key={sensor.id} value={sensor.id}>
                      {sensor.name}
                    </MenuItem>
                  ))}
                </Select>
                {loadingSensors && (
                  <Box sx={{ display: 'flex', alignItems: 'center', mt: 1, gap: 1 }}>
                    <CircularProgress size={16} />
                    <Typography variant="caption" color="text.secondary">
                      Ładowanie czujników...
                    </Typography>
                  </Box>
                )}
                {sensors.length === 0 && !loadingSensors && (
                  <Alert severity="warning" sx={{ mt: 1 }}>
                    <Typography variant="caption">
                      Brak dostępnych czujników
                    </Typography>
                  </Alert>
                )}
              </FormControl>
            </Grid>
            
            <Grid item xs={12} md={6}>
              <Button
                variant="contained"
                color="primary"
                onClick={handleLoadSensorData}
                disabled={!selectedSensor || loadingSensors || !formData.readingDate || !formData.readingTime}
                fullWidth
                sx={{ 
                  height: { xs: '48px', sm: '56px' },
                  fontSize: { xs: '0.875rem', sm: '1rem' },
                  px: { xs: 2, sm: 3 }
                }}
                startIcon={<SensorsIcon />}
              >
                <Box sx={{ textAlign: 'center' }}>
                  <Typography variant="body2" sx={{ 
                    fontSize: { xs: '0.75rem', sm: '0.875rem' },
                    lineHeight: 1.2,
                    display: { xs: 'block', sm: 'none' }
                  }}>
                    Pobierz dane
                  </Typography>
                  <Typography sx={{ 
                    fontSize: { xs: '0.75rem', sm: '1rem' },
                    display: { xs: 'none', sm: 'block' }
                  }}>
                    Pobierz dane dla określonej daty/godziny
                  </Typography>
                </Box>
              </Button>
              
              {sensorData && (
                <Alert severity="success" sx={{ mt: 1, py: 0.5 }}>
                  <Typography variant="caption" sx={{ fontSize: '0.75rem' }}>
                    <strong>Ostatnio pobrano:</strong><br />
                    {formatSensorTimestamp(sensorData.timestamp).full}
                    {sensorData.timeDifference > 0 && (
                      <span style={{ color: '#ff9800', fontWeight: 'bold' }}>
                        <br />⚠️ Różnica: {sensorData.timeDifference} min
                      </span>
                    )}
                  </Typography>
                </Alert>
              )}
              
              {(!formData.readingDate || !formData.readingTime) && (
                <Alert severity="info" sx={{ mt: 1, py: 0.5 }}>
                  <Typography variant="caption" sx={{ fontSize: '0.75rem' }}>
                    Najpierw ustaw datę i godzinę odczytu powyżej
                  </Typography>
                </Alert>
              )}
            </Grid>
            
            <Grid item xs={12}>
              <Paper sx={{ 
                p: { xs: 2, sm: 3 }, 
                borderRadius: 2,
                background: theme.palette.mode === 'dark'
            ? 'linear-gradient(135deg, rgba(76,175,80,0.1) 0%, rgba(33,150,243,0.1) 100%)'
            : 'linear-gradient(135deg, #e8f5e8 0%, #f0f8ff 100%)',
                border: '1px solid',
                borderColor: 'divider'
              }}>
                <FormControl component="fieldset" fullWidth>
                  <FormLabel component="legend" sx={{ 
                    fontSize: { xs: '1rem', sm: '1.1rem' },
                    fontWeight: 'bold',
                    color: 'primary.main',
                    mb: 2
                  }}>
                    💧 Zmierzona wilgotność powietrza w pomieszczeniu
                  </FormLabel>
                  
                  <Box sx={{ mt: 2 }}>
                    <Stack 
                      spacing={2} 
                      direction={{ xs: 'column', sm: 'row' }} 
                      alignItems="center" 
                      sx={{ mb: 2 }}
                    >
                      <Typography variant="body2" color="error" sx={{ 
                        fontSize: { xs: '0.75rem', sm: '0.875rem' },
                        fontWeight: 'bold',
                        minWidth: { sm: '120px' }
                      }}>
                        PONIŻEJ NORMY!
                      </Typography>
                      
                      <Box sx={{ flex: 1, width: '100%', px: { xs: 0, sm: 2 } }}>
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
                            '& .MuiSlider-markLabel': { 
                              fontSize: { xs: '0.65rem', sm: '0.75rem' },
                              '@media (max-width: 600px)': {
                                '&:nth-of-type(even)': {
                                  display: 'none'
                                }
                              }
                            },
                            '& .MuiSlider-track': { 
                              background: (theme) => {
                                const value = typeof formData.humidity === 'number' ? formData.humidity : 45;
                                return value < 40 || value > 60 
                                  ? theme.palette.error.main 
                                  : theme.palette.success.main;
                              },
                              height: { xs: 6, sm: 8 }
                            },
                            '& .MuiSlider-rail': { 
                              opacity: 0.5,
                              height: { xs: 6, sm: 8 }
                            },
                            '& .MuiSlider-thumb': {
                              height: { xs: 20, sm: 24 },
                              width: { xs: 20, sm: 24 },
                              '&:hover': {
                                boxShadow: '0 0 0 8px rgba(25, 118, 210, 0.16)'
                              }
                            },
                            '& .MuiSlider-valueLabel': {
                              fontSize: { xs: '0.75rem', sm: '0.875rem' }
                            }
                          }}
                        />
                      </Box>
                      
                      <Typography variant="body2" color="error" sx={{ 
                        fontSize: { xs: '0.75rem', sm: '0.875rem' },
                        fontWeight: 'bold',
                        minWidth: { sm: '120px' },
                        textAlign: { sm: 'right' }
                      }}>
                        POWYŻEJ NORMY!
                      </Typography>
                    </Stack>
                    
                    <Box sx={{ 
                      display: 'flex', 
                      flexDirection: { xs: 'column', sm: 'row' },
                      justifyContent: 'space-between', 
                      gap: { xs: 1, sm: 0 },
                      px: 1,
                      mt: 2
                    }}>
                      <Typography variant="caption" color="text.secondary" sx={{ 
                        fontSize: { xs: '0.7rem', sm: '0.75rem' }
                      }}>
                        Prawidłowy zakres: 40-60%
                      </Typography>
                      <Typography variant="caption" fontWeight="bold" sx={{ 
                        fontSize: { xs: '0.7rem', sm: '0.75rem' },
                        color: (typeof formData.humidity === 'number' && formData.humidity >= 40 && formData.humidity <= 60) 
                          ? 'success.main' 
                          : 'error.main'
                      }}>
                        Wybrana wartość: {typeof formData.humidity === 'number' ? `${formData.humidity}%` : 'Nie wybrano'}
                      </Typography>
                    </Box>
                  </Box>
                </FormControl>
              </Paper>
            </Grid>
            
            <Grid item xs={12}>
              <Paper sx={{ 
                p: { xs: 2, sm: 3 }, 
                borderRadius: 2,
                background: theme.palette.mode === 'dark'
            ? 'linear-gradient(135deg, rgba(255,152,0,0.1) 0%, rgba(233,30,99,0.1) 100%)'
            : 'linear-gradient(135deg, #fff3e0 0%, #fce4ec 100%)',
                border: '1px solid',
                borderColor: 'divider'
              }}>
                <FormControl component="fieldset" fullWidth>
                  <FormLabel component="legend" sx={{ 
                    fontSize: { xs: '1rem', sm: '1.1rem' },
                    fontWeight: 'bold',
                    color: 'primary.main',
                    mb: 2
                  }}>
                    🌡️ Zmierzona temperatura powietrza w pomieszczeniu
                  </FormLabel>
                  
                  <Box sx={{ mt: 2 }}>
                    <Stack 
                      spacing={2} 
                      direction={{ xs: 'column', sm: 'row' }} 
                      alignItems="center" 
                      sx={{ mb: 2 }}
                    >
                      <Typography variant="body2" color="error" sx={{ 
                        fontSize: { xs: '0.75rem', sm: '0.875rem' },
                        fontWeight: 'bold',
                        minWidth: { sm: '120px' }
                      }}>
                        PONIŻEJ NORMY!
                      </Typography>
                      
                      <Box sx={{ flex: 1, width: '100%', px: { xs: 0, sm: 2 } }}>
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
                            '& .MuiSlider-markLabel': { 
                              fontSize: { xs: '0.65rem', sm: '0.75rem' },
                              '@media (max-width: 600px)': {
                                '&:nth-of-type(even)': {
                                  display: 'none'
                                }
                              }
                            },
                            '& .MuiSlider-track': { 
                              background: (theme) => {
                                const value = typeof formData.temperature === 'number' ? formData.temperature : 20;
                                return value < 10 || value > 25 
                                  ? theme.palette.error.main 
                                  : theme.palette.success.main;
                              },
                              height: { xs: 6, sm: 8 }
                            },
                            '& .MuiSlider-rail': { 
                              opacity: 0.5,
                              height: { xs: 6, sm: 8 }
                            },
                            '& .MuiSlider-thumb': {
                              height: { xs: 20, sm: 24 },
                              width: { xs: 20, sm: 24 },
                              '&:hover': {
                                boxShadow: '0 0 0 8px rgba(25, 118, 210, 0.16)'
                              }
                            },
                            '& .MuiSlider-valueLabel': {
                              fontSize: { xs: '0.75rem', sm: '0.875rem' }
                            }
                          }}
                        />
                      </Box>
                      
                      <Typography variant="body2" color="error" sx={{ 
                        fontSize: { xs: '0.75rem', sm: '0.875rem' },
                        fontWeight: 'bold',
                        minWidth: { sm: '120px' },
                        textAlign: { sm: 'right' }
                      }}>
                        POWYŻEJ NORMY!
                      </Typography>
                    </Stack>
                    
                    <Box sx={{ 
                      display: 'flex', 
                      flexDirection: { xs: 'column', sm: 'row' },
                      justifyContent: 'space-between', 
                      gap: { xs: 1, sm: 0 },
                      px: 1,
                      mt: 2
                    }}>
                      <Typography variant="caption" color="text.secondary" sx={{ 
                        fontSize: { xs: '0.7rem', sm: '0.75rem' }
                      }}>
                        Prawidłowy zakres: 10-25°C
                      </Typography>
                      <Typography variant="caption" fontWeight="bold" sx={{ 
                        fontSize: { xs: '0.7rem', sm: '0.75rem' },
                        color: (typeof formData.temperature === 'number' && formData.temperature >= 10 && formData.temperature <= 25) 
                          ? 'success.main' 
                          : 'error.main'
                      }}>
                        Wybrana wartość: {typeof formData.temperature === 'number' ? `${formData.temperature}°C` : 'Nie wybrano'}
                      </Typography>
                    </Box>
                  </Box>
                </FormControl>
              </Paper>
            </Grid>
            
            <Grid item xs={12}>
              <TextField
                required
                fullWidth
                label="Wyprodukowana ilość (szt.)"
                name="quantity"
                value={formData.quantity}
                onChange={handleChange}
                error={!!validationErrors.quantity}
                helperText={validationErrors.quantity}
              />
            </Grid>
            
            <Grid item xs={12}>
              <FormControl component="fieldset">
                <FormLabel component="legend">Numer zmiany produkcji</FormLabel>
                <FormGroup>
                  <FormControlLabel
                    control={
                      <Checkbox 
                        onChange={handleCheckboxChange} 
                        value="Zmiana 1"
                        checked={formData.shiftNumber.includes("Zmiana 1")}
                      />
                    }
                    label="Zmiana 1"
                  />
                  <FormControlLabel
                    control={
                      <Checkbox 
                        onChange={handleCheckboxChange} 
                        value="Zmiana 2"
                        checked={formData.shiftNumber.includes("Zmiana 2")}
                      />
                    }
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
              
              {/* Pokaż istniejący plik (z URL) */}
              <ExistingAttachment
                fileUrl={formData.documentScansUrl}
                fileName={formData.documentScansName}
                onRemove={handleRemoveAttachment}
                fieldName="documentScans"
              />
              
              {/* Pokaż nowo wybrany plik */}
              <FilePreview
                file={formData.documentScans}
                onRemove={handleRemoveAttachment}
                fieldName="documentScans"
              />
              
              <Box sx={{ mt: 1 }}>
                <FileOrCameraInput
                  onChange={(e) => handleFileChange(e, 'documentScans')}
                  accept="image/*,application/pdf,.doc,.docx"
                />
              </Box>
            </Grid>
            
            <Grid item xs={12}>
              <Typography variant="subtitle2" gutterBottom>
                Zdjęcie produktu - 1
              </Typography>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Zdjęcie produktu od frontu
              </Typography>
              
              {/* Pokaż istniejący plik (z URL) */}
              <ExistingAttachment
                fileUrl={formData.productPhoto1Url}
                fileName={formData.productPhoto1Name}
                onRemove={handleRemoveAttachment}
                fieldName="productPhoto1"
              />
              
              {/* Pokaż nowo wybrany plik */}
              <FilePreview
                file={formData.productPhoto1}
                onRemove={handleRemoveAttachment}
                fieldName="productPhoto1"
              />
              
              <Box sx={{ mt: 1 }}>
                <FileOrCameraInput
                  onChange={(e) => handleFileChange(e, 'productPhoto1')}
                  accept="image/*"
                />
              </Box>
            </Grid>
            
            <Grid item xs={12}>
              <Typography variant="subtitle2" gutterBottom>
                Zdjęcie produktu - 2
              </Typography>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Zdjęcie produktu z widocznym nr. LOT - EXP
              </Typography>
              
              {/* Pokaż istniejący plik (z URL) */}
              <ExistingAttachment
                fileUrl={formData.productPhoto2Url}
                fileName={formData.productPhoto2Name}
                onRemove={handleRemoveAttachment}
                fieldName="productPhoto2"
              />
              
              {/* Pokaż nowo wybrany plik */}
              <FilePreview
                file={formData.productPhoto2}
                onRemove={handleRemoveAttachment}
                fieldName="productPhoto2"
              />
              
              <Box sx={{ mt: 1 }}>
                <FileOrCameraInput
                  onChange={(e) => handleFileChange(e, 'productPhoto2')}
                  accept="image/*"
                />
              </Box>
            </Grid>
            
            <Grid item xs={12}>
              <Typography variant="subtitle2" gutterBottom>
                Zdjęcie produktu - 3
              </Typography>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Zdjęcie zapakowanego produktu w karton z widoczną etykietą
              </Typography>
              
              {/* Pokaż istniejący plik (z URL) */}
              <ExistingAttachment
                fileUrl={formData.productPhoto3Url}
                fileName={formData.productPhoto3Name}
                onRemove={handleRemoveAttachment}
                fieldName="productPhoto3"
              />
              
              {/* Pokaż nowo wybrany plik */}
              <FilePreview
                file={formData.productPhoto3}
                onRemove={handleRemoveAttachment}
                fieldName="productPhoto3"
              />
              
              <Box sx={{ mt: 1 }}>
                <FileOrCameraInput
                  onChange={(e) => handleFileChange(e, 'productPhoto3')}
                  accept="image/*"
                />
              </Box>
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

  // Komponent okienka dialogowego z informacjami o czujniku
  const SensorInfoDialog = () => (
    <Dialog
      open={sensorInfoDialog.open}
      onClose={closeSensorInfoDialog}
      maxWidth="sm"
      fullWidth
      fullScreen={false}
      sx={{
        '& .MuiDialog-paper': {
          margin: { xs: 2, sm: 4 },
          maxHeight: { xs: '90vh', sm: 'calc(100% - 64px)' },
          borderRadius: { xs: 2, sm: 2 }
        }
      }}
    >
      <DialogTitle sx={{ 
        color: sensorInfoDialog.isError ? 'error.main' : 'success.main',
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        fontSize: { xs: '1.1rem', sm: '1.25rem' },
        py: { xs: 2, sm: 3 },
        borderBottom: '1px solid',
        borderColor: 'divider'
      }}>
        <Box sx={{ fontSize: { xs: '1.2rem', sm: '1.5rem' } }}>
          {sensorInfoDialog.isError ? '⚠️' : '✅'}
        </Box>
        <Box>{sensorInfoDialog.title}</Box>
      </DialogTitle>
      <DialogContent sx={{ py: { xs: 2, sm: 3 } }}>
        <Typography sx={{ 
          whiteSpace: 'pre-line', 
          fontSize: { xs: '0.875rem', sm: '1rem' },
          lineHeight: 1.6
        }}>
          {sensorInfoDialog.message}
        </Typography>
      </DialogContent>
      <DialogActions sx={{ 
        p: { xs: 2, sm: 3 },
        borderTop: '1px solid',
        borderColor: 'divider'
      }}>
        <Button 
          onClick={closeSensorInfoDialog} 
          variant="contained"
          color={sensorInfoDialog.isError ? 'error' : 'primary'}
          sx={{ 
            minWidth: { xs: 80, sm: 120 },
            py: { xs: 1, sm: 1.5 }
          }}
        >
          OK
        </Button>
      </DialogActions>
    </Dialog>
  );

  // W trybie dialogu zwróć tylko zawartość formularza
  if (isDialog) {
    return (
      <>
        {formContent}
        <SensorInfoDialog />
      </>
    );
  }

  // W trybie normalnym zwróć formularz w kontenerze
  return (
    <Container maxWidth="md" sx={{ 
      mt: { xs: 2, sm: 4 }, 
      mb: { xs: 2, sm: 4 },
      px: { xs: 1, sm: 3 }
    }}>
      <Paper sx={{ 
        p: { xs: 2, sm: 4 },
        borderRadius: { xs: 2, sm: 2 },
        boxShadow: { xs: 2, sm: 3 }
      }}>
        {formContent}
      </Paper>
      <SensorInfoDialog />
    </Container>
  );
};

export default ProductionControlForm; 