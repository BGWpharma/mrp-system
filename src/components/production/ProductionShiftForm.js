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
import { useTheme } from '@mui/material/styles';
import { getMONumbersForSelect } from '../../services/moService';
import { addProductionSessionFromShiftReport, updateProductionSession, parseShiftTime } from '../../services/productionService';
import { getAllWarehouses } from '../../services/inventory';
import { formatDateForInput } from '../../utils/dateUtils';
import { db } from '../../services/firebase/config';
import { collection, addDoc, serverTimestamp, doc, updateDoc, getDocs, query, where, getDoc } from 'firebase/firestore';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useTranslation } from '../../hooks/useTranslation';
import { useStaffOptions, useShiftWorkerOptions, useProductOptionsForPrinting, useFilteredProductOptions } from '../../hooks/useFormOptions';
import { 
  getFormHeaderStyles, 
  getFormSectionStyles,
  getFormContainerStyles, 
  getFormPaperStyles, 
  getFormButtonStyles,
  getFormActionsStyles 
} from '../../styles/formStyles';

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
  const theme = useTheme();
  const { t } = useTranslation('forms');

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
    shiftStartTime: '',
    shiftEndTime: '',
    product: '',
    moNumber: '',
    productionQuantity: '',
    warehouseId: '', // Magazyn docelowy
    firstProduct: 'BRAK',
    secondProduct: 'BRAK',
    thirdProduct: 'BRAK',
    firstProductQuantity: '',
    secondProductQuantity: '',
    thirdProductQuantity: '',
    firstProductLoss: '',
    secondProductLoss: '',
    thirdProductLoss: '',
    rawMaterialLoss: '', // Nowe pole: Straty surowca
    finishedProductLoss: '', // Nowe pole: Straty - produkt gotowy
    lidLoss: '', // Nowe pole: Strata wieczek
    otherActivities: '',
    machineIssues: ''
  });

  const [validationErrors, setValidationErrors] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [moOptions, setMoOptions] = useState([]);
  const [loadingMO, setLoadingMO] = useState(false);
  const [editId, setEditId] = useState(null);
  const [warehouses, setWarehouses] = useState([]);
  const [warehousesLoading, setWarehousesLoading] = useState(false);
  const [saving, setSaving] = useState(false);

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

  // Pobierz magazyny przy pierwszym renderowaniu komponentu
  useEffect(() => {
    const fetchWarehouses = async () => {
      try {
        setWarehousesLoading(true);
        const warehousesList = await getAllWarehouses();
        setWarehouses(warehousesList);
      } catch (error) {
        console.error('Błąd podczas pobierania magazynów:', error);
      } finally {
        setWarehousesLoading(false);
      }
    };

    fetchWarehouses();
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
        
        setFormData({
          email: editData.email || '',
          responsiblePerson: editData.responsiblePerson || '',
          fillDate: fillDate,
          fillTime: editData.fillTime || '',
          shiftWorkers: editData.shiftWorkers || [],
          shiftStartTime: editData.shiftStartTime || '',
          shiftEndTime: editData.shiftEndTime || '',
          product: editData.product || '',
          moNumber: editData.moNumber || '',
          productionQuantity: editData.productionQuantity || '',
          warehouseId: editData.warehouseId || '',
          firstProduct: editData.firstProduct || 'BRAK',
          secondProduct: editData.secondProduct || 'BRAK',
          thirdProduct: editData.thirdProduct || 'BRAK',
          firstProductQuantity: editData.firstProductQuantity || '',
          secondProductQuantity: editData.secondProductQuantity || '',
          thirdProductQuantity: editData.thirdProductQuantity || '',
          firstProductLoss: editData.firstProductLoss || '',
          secondProductLoss: editData.secondProductLoss || '',
          thirdProductLoss: editData.thirdProductLoss || '',
          rawMaterialLoss: editData.rawMaterialLoss || '',
          finishedProductLoss: editData.finishedProductLoss || '',
          lidLoss: editData.lidLoss || '',
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
      errors.email = t('validation.emailRequired');
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      errors.email = t('validation.emailInvalid');
    }
    
    if (!formData.responsiblePerson) {
      errors.responsiblePerson = t('validation.responsiblePersonRequired');
    }
    
    if (!formData.fillTime) {
      errors.fillTime = t('validation.fillTimeRequired');
    }
    
    if (formData.shiftWorkers.length === 0) {
      errors.shiftWorkers = t('validation.shiftWorkersRequired');
    }
    
    if (!formData.shiftStartTime) {
      errors.shiftStartTime = t('validation.shiftStartTimeRequired');
    }
    
    if (!formData.shiftEndTime) {
      errors.shiftEndTime = t('validation.shiftEndTimeRequired');
    }
    
    if (!formData.product) {
      errors.product = t('validation.productRequired');
    }
    
    if (!formData.moNumber) {
      errors.moNumber = t('validation.moNumberRequired');
    }
    
    if (!formData.productionQuantity) {
      errors.productionQuantity = t('validation.productionQuantityRequired');
    } else if (isNaN(formData.productionQuantity)) {
      errors.productionQuantity = t('validation.numericRequired');
    }
    
    if (!formData.warehouseId) {
      errors.warehouseId = t('validation.warehouseRequired');
    }
    
    if (formData.firstProduct !== 'BRAK' && !formData.firstProductQuantity) {
      errors.firstProductQuantity = t('validation.quantityRequired');
    }
    
    if (formData.secondProduct !== 'BRAK' && !formData.secondProductQuantity) {
      errors.secondProductQuantity = t('validation.quantityRequired');
    }
    
    if (formData.thirdProduct !== 'BRAK' && !formData.thirdProductQuantity) {
      errors.thirdProductQuantity = t('validation.quantityRequired');
    }
    
    // Walidacja pola strat produktu gotowego
    if (formData.finishedProductLoss && isNaN(formData.finishedProductLoss)) {
      errors.finishedProductLoss = t('validation.numericRequired');
    }
    
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Zabezpieczenie przed wielokrotnym zapisywaniem
    if (saving) return;
    
    if (validate()) {
      try {
        setSaving(true);
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
          shiftStartTime: formData.shiftStartTime,
          shiftEndTime: formData.shiftEndTime,
          product: formData.product,
          moNumber: formData.moNumber,
          productionQuantity: formData.productionQuantity,
          warehouseId: formData.warehouseId,
          firstProduct: formData.firstProduct,
          secondProduct: formData.secondProduct,
          thirdProduct: formData.thirdProduct,
          firstProductQuantity: formData.firstProductQuantity,
          secondProductQuantity: formData.secondProductQuantity,
          thirdProductQuantity: formData.thirdProductQuantity,
          firstProductLoss: formData.firstProductLoss,
          secondProductLoss: formData.secondProductLoss,
          thirdProductLoss: formData.thirdProductLoss,
          rawMaterialLoss: formData.rawMaterialLoss,
          finishedProductLoss: formData.finishedProductLoss,
          lidLoss: formData.lidLoss,
          otherActivities: formData.otherActivities,
          machineIssues: formData.machineIssues,
          createdAt: serverTimestamp(),
          addedToHistory: false // Flaga czy dodano do historii
        };
        
        // Zapisz odpowiedź w Firestore
        let docId;
        if (isEditMode && editId) {
          // Aktualizacja istniejącego dokumentu
          const docRef = doc(db, 'Forms/ZmianaProdukcji/Odpowiedzi', editId);
          await updateDoc(docRef, odpowiedzData);
          docId = editId;
          console.log('Formularz zmiany produkcyjnej zaktualizowany z danymi:', odpowiedzData);
        } else {
          // Dodanie nowego dokumentu
          const docRef = await addDoc(odpowiedziRef, odpowiedzData);
          docId = docRef.id;
          console.log('Formularz zmiany produkcyjnej wysłany z danymi:', odpowiedzData);
        }
        
        // ✅ Automatyczna synchronizacja z historią produkcji
        if (formData.moNumber && formData.productionQuantity && 
            formData.shiftStartTime && formData.shiftEndTime) {
          try {
            console.log('🔄 Rozpoczynam synchronizację z historią produkcji...');
            
            // Sprawdź czy to edycja istniejącej sesji
            if (isEditMode && editId) {
              // Pobierz dane edytowanej odpowiedzi
              const odpowiedzDocRef = doc(db, 'Forms/ZmianaProdukcji/Odpowiedzi', editId);
              const odpowiedzDoc = await getDoc(odpowiedzDocRef);
              const odpowiedzData = odpowiedzDoc.data();
              
              if (odpowiedzData && odpowiedzData.productionSessionId) {
                // EDYCJA istniejącej sesji - użyj updateProductionSession
                console.log('📝 Aktualizacja istniejącej sesji:', odpowiedzData.productionSessionId);
                
                const startTime = parseShiftTime(formData.fillDate, formData.shiftStartTime);
                const endTime = parseShiftTime(formData.fillDate, formData.shiftEndTime);
                
                // Jeśli koniec jest przed początkiem, oznacza że zmiana przeszła przez północ
                if (endTime < startTime) {
                  endTime.setDate(endTime.getDate() + 1);
                }
                
                const timeSpentMinutes = Math.round((endTime - startTime) / (1000 * 60));
                
                await updateProductionSession(
                  odpowiedzData.productionSessionId,
                  {
                    startTime: startTime.toISOString(),
                    endTime: endTime.toISOString(),
                    timeSpent: timeSpentMinutes,
                    quantity: parseFloat(formData.productionQuantity)
                  },
                  currentUser.uid
                );
                
                console.log('✅ Sesja produkcyjna została zaktualizowana (partia skorygowana)');
              } else {
                // Nie ma przypisanej sesji - dodaj nową
                console.log('➕ Dodawanie nowej sesji dla edytowanego raportu');
                
                const result = await addProductionSessionFromShiftReport(
                  formData.moNumber,
                  {
                    shiftStartTime: formData.shiftStartTime,
                    shiftEndTime: formData.shiftEndTime,
                    quantity: parseFloat(formData.productionQuantity),
                    fillDate: formData.fillDate,
                    responsiblePerson: formData.responsiblePerson,
                    warehouseId: formData.warehouseId
                  },
                  currentUser.uid,
                  docId
                );
                
                // Zapisz referencje do nowej sesji
                await updateDoc(odpowiedzDocRef, {
                  addedToHistory: true,
                  historyAddedAt: serverTimestamp(),
                  productionTaskId: result.taskId,
                  productionTaskName: result.taskName,
                  productionSessionId: result.sessionId,
                  productionSessionIndex: result.sessionIndex
                });
                
                console.log('✅ Nowa sesja produkcyjna dodana do historii:', result);
              }
            } else {
              // NOWA odpowiedź - dodaj nową sesję
              console.log('➕ Dodawanie nowej sesji produkcyjnej');
              
              const result = await addProductionSessionFromShiftReport(
                formData.moNumber,
                {
                  shiftStartTime: formData.shiftStartTime,
                  shiftEndTime: formData.shiftEndTime,
                  quantity: parseFloat(formData.productionQuantity),
                  fillDate: formData.fillDate,
                  responsiblePerson: formData.responsiblePerson,
                  warehouseId: formData.warehouseId
                },
                currentUser.uid,
                docId
              );
              
              // Oznacz raport jako dodany do historii
              await updateDoc(doc(db, 'Forms/ZmianaProdukcji/Odpowiedzi', docId), {
                addedToHistory: true,
                historyAddedAt: serverTimestamp(),
                productionTaskId: result.taskId,
                productionTaskName: result.taskName,
                productionSessionId: result.sessionId,
                productionSessionIndex: result.sessionIndex
              });
              
              console.log('✅ Sesja produkcyjna automatycznie dodana do historii:', result);
            }
          } catch (historyError) {
            console.error('⚠️ Błąd podczas synchronizacji z historią produkcji:', historyError);
            // Raport został zapisany, ale historia nie - nie przerywaj procesu
            alert('Raport został zapisany, ale wystąpił problem z synchronizacją historii produkcji: ' + historyError.message);
          }
        }
        
        setSubmitted(true);
        
        // Reset formularza po pomyślnym wysłaniu
        setFormData({
          email: '',
          responsiblePerson: '',
          fillDate: new Date(),
          fillTime: '',
          shiftWorkers: [],
          shiftStartTime: '',
          shiftEndTime: '',
          product: '',
          moNumber: '',
          productionQuantity: '',
          warehouseId: '',
          firstProduct: 'BRAK',
          secondProduct: 'BRAK',
          thirdProduct: 'BRAK',
          firstProductQuantity: '',
          secondProductQuantity: '',
          thirdProductQuantity: '',
          firstProductLoss: '',
          secondProductLoss: '',
          thirdProductLoss: '',
          rawMaterialLoss: '',
          finishedProductLoss: '',
          lidLoss: '',
          otherActivities: '',
          machineIssues: ''
        });
        
        // Przekierowanie do strony odpowiedzi po 1.2 sekundach
        setTimeout(() => {
          navigate('/production/forms/responses?tab=productionShift');
        }, 1200);
      } catch (error) {
        console.error('Błąd podczas zapisywania formularza zmiany produkcyjnej:', error);
        alert(`Wystąpił błąd podczas zapisywania formularza: ${error.message}`);
      } finally {
        setSaving(false);
      }
    }
  };
  
  const handleBack = () => {
    navigate('/production/forms/responses?tab=productionShift');
  };

  return (
    <Container maxWidth="md" sx={getFormContainerStyles()}>
      <Paper sx={getFormPaperStyles(theme)}>
        <Box sx={getFormHeaderStyles(theme, isEditMode)}>
          <Typography variant="h5" gutterBottom align="center" fontWeight="bold" sx={{
            fontSize: { xs: '1.25rem', sm: '1.5rem' },
            color: isEditMode ? 'warning.main' : 'primary.main'
          }}>
            {isEditMode ? t('productionForms.productionShift.editTitle') : t('productionForms.productionShift.formTitle')}
          </Typography>
          <Typography variant="body2" align="center" color="text.secondary" paragraph sx={{
            fontSize: { xs: '0.75rem', sm: '0.875rem' },
            mb: 0
          }}>
            {t('common.emergencyContact')} mateusz@bgwpharma.com
          </Typography>
        </Box>

        {submitted && (
          <Alert severity="success" sx={{ mb: 3 }}>
            {isEditMode ? t('common.successUpdate') : t('common.successCreate')}
          </Alert>
        )}
        
        <Box component="form" onSubmit={handleSubmit} sx={{ px: { xs: 1, sm: 0 } }}>
          {/* SEKCJA 1 z 3 - IDENTYFIKACJA */}
          <Box sx={getFormSectionStyles(theme, 'primary')}>
            <Typography variant="subtitle2" sx={{ mb: 1, color: 'primary.main', fontWeight: 'bold' }}>
              {t('common.section', { current: 1, total: 3 })}
            </Typography>
            <Typography variant="h6" gutterBottom sx={{ fontWeight: 'bold', color: 'primary.main' }}>
              👤 {t('sections.identification')}
            </Typography>
            <Divider sx={{ mb: 3 }} />
            
            <Grid container spacing={{ xs: 2, sm: 3 }}>
              <Grid item xs={12}>
                <TextField
                  required
                  fullWidth
                  label={t('fields.email')}
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
                <FormControl fullWidth required error={!!validationErrors.responsiblePerson}>
                  <InputLabel>{t('fields.responsiblePerson')}</InputLabel>
                  <Select
                    name="responsiblePerson"
                    value={formData.responsiblePerson}
                    onChange={handleChange}
                    label={t('fields.responsiblePerson')}
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
                    label={t('fields.fillDate')}
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
                  label={t('fields.fillTime')}
                  name="fillTime"
                  value={formData.fillTime}
                  onChange={handleChange}
                  placeholder="np. 8:30"
                  error={!!validationErrors.fillTime}
                  helperText={validationErrors.fillTime}
                />
              </Grid>
            </Grid>
          </Box>

          {/* SEKCJA 2 z 3 - PRACOWNICY PRODUKCJI/RODZAJ ZMIANY */}
          <Box sx={getFormSectionStyles(theme, 'warning')}>
            <Typography variant="subtitle2" sx={{ mb: 1, color: 'warning.main', fontWeight: 'bold' }}>
              {t('common.section', { current: 2, total: 3 })}
            </Typography>
            <Typography variant="h6" gutterBottom sx={{ fontWeight: 'bold', color: 'warning.main' }}>
              👥 {t('sections.shiftWorkers')}
            </Typography>
            <Divider sx={{ mb: 3 }} />
            
            <Grid container spacing={{ xs: 2, sm: 3 }}>
              <Grid item xs={12}>
                <FormControl component="fieldset" error={!!validationErrors.shiftWorkers} required>
                  <FormLabel component="legend">{t('fields.shiftWorkers')}</FormLabel>
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
              
              <Grid item xs={12} sm={6}>
                <TextField
                  required
                  fullWidth
                  type="time"
                  label={t('fields.shiftStartTime')}
                  name="shiftStartTime"
                  value={formData.shiftStartTime}
                  onChange={handleChange}
                  error={!!validationErrors.shiftStartTime}
                  helperText={validationErrors.shiftStartTime}
                  InputLabelProps={{
                    shrink: true,
                  }}
                />
              </Grid>
              
              <Grid item xs={12} sm={6}>
                <TextField
                  required
                  fullWidth
                  type="time"
                  label={t('fields.shiftEndTime')}
                  name="shiftEndTime"
                  value={formData.shiftEndTime}
                  onChange={handleChange}
                  error={!!validationErrors.shiftEndTime}
                  helperText={validationErrors.shiftEndTime}
                  InputLabelProps={{
                    shrink: true,
                  }}
                />
              </Grid>
            </Grid>
          </Box>

          {/* SEKCJA 3 z 3 - RAPORT WYKONANYCH CZYNNOŚCI NA ZMIANIE */}
          <Box sx={getFormSectionStyles(theme, 'success')}>
            <Typography variant="subtitle2" sx={{ mb: 1, color: 'success.main', fontWeight: 'bold' }}>
              {t('common.section', { current: 3, total: 3 })}
            </Typography>
            <Typography variant="h6" gutterBottom sx={{ fontWeight: 'bold', color: 'success.main' }}>
              📊 {t('sections.shiftReport')}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              {t('helpers.oneProductPerReport')}
            </Typography>
            <Divider sx={{ mb: 3 }} />
            
            <Grid container spacing={{ xs: 2, sm: 3 }}>
            
            <Grid item xs={12}>
              <FormControl 
                fullWidth 
                required 
                error={!!validationErrors.moNumber}
              >
                <InputLabel>{t('fields.moNumber')}</InputLabel>
                <Select
                  name="moNumber"
                  value={formData.moNumber}
                  onChange={handleChange}
                  label={t('fields.moNumber')}
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
                label={t('fields.product')}
                name="product"
                value={formData.product}
                onChange={handleChange}
                error={!!validationErrors.product}
                helperText={validationErrors.product || t('helpers.productAutoFill')}
                InputProps={{
                  readOnly: true,
                }}
              />
            </Grid>
            
            <Grid item xs={12}>
              <TextField
                required
                fullWidth
                label={t('fields.productionQuantity')}
                name="productionQuantity"
                value={formData.productionQuantity}
                onChange={handleChange}
                placeholder={t('helpers.numericOnly')}
                error={!!validationErrors.productionQuantity}
                helperText={validationErrors.productionQuantity}
              />
            </Grid>
            
            <Grid item xs={12}>
              <FormControl 
                fullWidth 
                required 
                error={!!validationErrors.warehouseId}
                disabled={warehousesLoading}
              >
                <InputLabel>{t('fields.warehouse')}</InputLabel>
                <Select
                  name="warehouseId"
                  value={formData.warehouseId}
                  onChange={handleChange}
                  label={t('fields.warehouse')}
                >
                  {warehouses.map(warehouse => (
                    <MenuItem key={warehouse.id} value={warehouse.id}>
                      {warehouse.name}
                    </MenuItem>
                  ))}
                </Select>
                {validationErrors.warehouseId && (
                  <Typography color="error" variant="caption" sx={{ mt: 0.5, ml: 2 }}>
                    {validationErrors.warehouseId}
                  </Typography>
                )}
              </FormControl>
            </Grid>
            
            <Grid item xs={12}>
              <Autocomplete
                fullWidth
                freeSolo
                options={[{ id: 'brak', name: t('common.none'), searchText: 'brak' }, ...filteredFirstProducts]}
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
                    label={t('fields.printedProduct1')}
                    placeholder={t('helpers.productPlaceholder')}
                    helperText={t('helpers.searchOrType')}
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
                  label={t('fields.printedQuantity1')}
                  name="firstProductQuantity"
                  value={formData.firstProductQuantity}
                  onChange={handleChange}
                  placeholder={t('helpers.numericOnly')}
                  error={!!validationErrors.firstProductQuantity}
                  helperText={validationErrors.firstProductQuantity}
                />
              </Grid>
            )}
            
            <Grid item xs={12}>
              <Autocomplete
                fullWidth
                freeSolo
                options={[{ id: 'brak', name: t('common.none'), searchText: 'brak' }, ...filteredSecondProducts]}
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
                    label={t('fields.printedProduct2')}
                    placeholder={t('helpers.productPlaceholder')}
                    helperText={t('helpers.searchOrType')}
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
                  label={t('fields.printedQuantity2')}
                  name="secondProductQuantity"
                  value={formData.secondProductQuantity}
                  onChange={handleChange}
                  placeholder={t('helpers.numericOnly')}
                  error={!!validationErrors.secondProductQuantity}
                  helperText={validationErrors.secondProductQuantity}
                />
              </Grid>
            )}
            
            <Grid item xs={12}>
              <Autocomplete
                fullWidth
                freeSolo
                options={[{ id: 'brak', name: t('common.none'), searchText: 'brak' }, ...filteredThirdProducts]}
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
                    label={t('fields.printedProduct3')}
                    placeholder={t('helpers.productPlaceholder')}
                    helperText={t('helpers.searchOrType')}
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
                  label={t('fields.printedQuantity3')}
                  name="thirdProductQuantity"
                  value={formData.thirdProductQuantity}
                  onChange={handleChange}
                  placeholder={t('helpers.numericOnly')}
                  error={!!validationErrors.thirdProductQuantity}
                  helperText={validationErrors.thirdProductQuantity}
                />
              </Grid>
            )}
            
            <Grid item xs={12}>
              <TextField
                fullWidth
                label={t('fields.lossQuantity1')}
                name="firstProductLoss"
                value={formData.firstProductLoss}
                onChange={handleChange}
                placeholder={t('helpers.numericOnly')}
              />
            </Grid>
            
            <Grid item xs={12}>
              <TextField
                fullWidth
                label={t('fields.lossQuantity2')}
                name="secondProductLoss"
                value={formData.secondProductLoss}
                onChange={handleChange}
                placeholder={t('helpers.numericOnly')}
              />
            </Grid>
            
            <Grid item xs={12}>
              <TextField
                fullWidth
                label={t('fields.lossQuantity3')}
                name="thirdProductLoss"
                value={formData.thirdProductLoss}
                onChange={handleChange}
                placeholder={t('helpers.numericOnly')}
              />
            </Grid>
            
            <Grid item xs={12}>
              <TextField
                fullWidth
                multiline
                rows={3}
                label={t('fields.rawMaterialLoss')}
                name="rawMaterialLoss"
                value={formData.rawMaterialLoss}
                onChange={handleChange}
                placeholder={t('helpers.lossDescription')}
                helperText={t('helpers.rawMaterialLossHelper')}
              />
            </Grid>
            
            <Grid item xs={12}>
              <TextField
                fullWidth
                label={t('fields.finishedProductLoss')}
                name="finishedProductLoss"
                type="number"
                value={formData.finishedProductLoss}
                onChange={handleChange}
                placeholder={t('helpers.finishedProductLossHelper')}
                helperText={t('helpers.optionalField')}
                inputProps={{ min: 0, step: 'any' }}
              />
            </Grid>
            
            <Grid item xs={12}>
              <TextField
                fullWidth
                label={t('fields.lidLoss')}
                name="lidLoss"
                type="number"
                value={formData.lidLoss}
                onChange={handleChange}
                placeholder={t('helpers.numericOnly')}
                helperText={t('helpers.lidLossHelper')}
                inputProps={{ min: 0, step: 'any' }}
              />
            </Grid>
            
            <Grid item xs={12}>
              <TextField
                fullWidth
                multiline
                rows={5}
                label={t('fields.otherActivities')}
                name="otherActivities"
                value={formData.otherActivities}
                onChange={handleChange}
                placeholder={t('helpers.otherActivitiesDesc')}
                error={!!validationErrors.otherActivities}
                helperText={validationErrors.otherActivities || t('helpers.optionalField')}
              />
            </Grid>
            
            <Grid item xs={12}>
              <TextField
                fullWidth
                multiline
                rows={5}
                label={t('fields.machineIssues')}
                name="machineIssues"
                value={formData.machineIssues}
                onChange={handleChange}
                placeholder={t('helpers.machineIssuesDesc')}
                error={!!validationErrors.machineIssues}
                helperText={validationErrors.machineIssues || t('helpers.optionalField')}
              />
            </Grid>
            
            </Grid>
          </Box>

          {/* PRZYCISKI AKCJI */}
          <Box sx={getFormActionsStyles()}>
            <Button
              variant="outlined"
              color="secondary"
              startIcon={<ArrowBackIcon />}
              onClick={handleBack}
              sx={getFormButtonStyles('outlined')}
            >
              {t('common.back')}
            </Button>
            <Button
              type="submit"
              variant="contained"
              color="primary"
              disabled={saving}
              startIcon={saving ? <CircularProgress size={20} color="inherit" /> : <SendIcon />}
              sx={{
                ...getFormButtonStyles('contained'),
                flexGrow: 1
              }}
            >
              {saving ? t('common.saving') : (isEditMode ? t('common.update') : t('common.submit'))}
            </Button>
          </Box>
        </Box>
      </Paper>
    </Container>
  );
};

export default ProductionShiftForm; 