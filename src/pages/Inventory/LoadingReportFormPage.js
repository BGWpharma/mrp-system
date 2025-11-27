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
  InputLabel,
  Select,
  MenuItem,
  RadioGroup,
  Radio,
  FormControlLabel,
  FormLabel,
  Divider,
  Alert,
  Snackbar,
  Autocomplete,
  InputAdornment,
  CircularProgress
} from '@mui/material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { pl } from 'date-fns/locale';
import { Save as SaveIcon, ArrowBack as ArrowBackIcon, Search as SearchIcon, LocalShipping as LocalShippingIcon, Person as PersonIcon, Inventory as InventoryIcon } from '@mui/icons-material';
import { useTheme } from '@mui/material/styles';
import { useNavigate, useLocation } from 'react-router-dom';
import { useInventoryEmployeeOptions, useInventoryPositionOptions } from '../../hooks/useFormOptions';
import { getAllCmrDocuments, getCmrDocumentById } from '../../services/cmrService';
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

const LoadingReportFormPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser } = useAuth();
  const theme = useTheme();
  
  // Sprawdź czy jesteśmy w trybie edycji
  const isEditMode = new URLSearchParams(location.search).get('edit') === 'true';
  
  // Pobieranie opcji z bazy danych
  const { options: employeeOptions, loading: employeeLoading } = useInventoryEmployeeOptions();
  const { options: positionOptions, loading: positionLoading } = useInventoryPositionOptions();
  
  // Stany dla wyszukiwarki CMR
  const [cmrDocuments, setCmrDocuments] = useState([]);
  const [filteredCmrDocuments, setFilteredCmrDocuments] = useState([]);
  const [cmrSearchQuery, setCmrSearchQuery] = useState('');
  const [cmrLoading, setCmrLoading] = useState(false);
  const [autoFillNotification, setAutoFillNotification] = useState(false);
  
  const [formData, setFormData] = useState({
    // Informacje użytkownika
    email: '',
    
    // Sekcja 2: Identyfikacja
    cmrNumber: '',
    employeeName: '',
    position: '',
    fillDate: new Date(),
    fillTime: new Date().toLocaleTimeString('pl', { hour: '2-digit', minute: '2-digit' }),
    
    // Sekcja 3: Informacje o załadunku
    loadingDate: new Date(),
    loadingTime: '',
    carrierName: '',
    vehicleRegistration: '',
    vehicleTechnicalCondition: '',
    notes: '',
    
    // Sekcja 4: Informacje o towarze
    clientName: '',
    orderNumber: '',
    palletProductName: '',
    palletQuantity: '',
    weight: '',
    goodsNotes: '',
    

    
    // Dostępne numery zamówień dla danego CMR
    availableOrderNumbers: []
  });
  
  const [showSuccess, setShowSuccess] = useState(false);
  const [errors, setErrors] = useState({});
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);

  // Pobieranie dokumentów CMR przy inicjalizacji
  useEffect(() => {
    const fetchCmrDocuments = async () => {
      try {
        setCmrLoading(true);
        const documents = await getAllCmrDocuments();
        setCmrDocuments(documents);
      } catch (error) {
        console.error('Błąd podczas pobierania dokumentów CMR:', error);
      } finally {
        setCmrLoading(false);
      }
    };

    fetchCmrDocuments();
  }, []);

  // Sprawdź czy istnieją dane do edycji w sessionStorage
  useEffect(() => {
    if (isEditMode) {
      const editData = JSON.parse(sessionStorage.getItem('editFormData'));
      if (editData) {
        // Konwersja dat z Timestamp na Date
        const fillDate = editData.fillDate ? 
          (editData.fillDate.toDate ? editData.fillDate.toDate() : new Date(editData.fillDate)) : 
          new Date();
        
        const loadingDate = editData.loadingDate ? 
          (editData.loadingDate.toDate ? editData.loadingDate.toDate() : new Date(editData.loadingDate)) : 
          new Date();
        
        setFormData({
          email: editData.email || '',
          cmrNumber: editData.cmrNumber || '',
          employeeName: editData.employeeName || '',
          position: editData.position || '',
          fillDate: fillDate,
          fillTime: editData.fillTime || '',
          loadingDate: loadingDate,
          loadingTime: editData.loadingTime || '',
          carrierName: editData.carrierName || '',
          vehicleRegistration: editData.vehicleRegistration || '',
          vehicleTechnicalCondition: editData.vehicleTechnicalCondition || '',
          notes: editData.notes || '',
          clientName: editData.clientName || '',
          orderNumber: editData.orderNumber || '',
          palletProductName: editData.palletProductName || '',
          palletQuantity: editData.palletQuantity || '',
          weight: editData.weight || '',
          goodsNotes: editData.goodsNotes || ''
        });
        
        setEditId(editData.id);
        
        // Ustaw też wyszukiwanie CMR jeśli jest dostępne
        if (editData.cmrNumber) {
          setCmrSearchQuery(editData.cmrNumber);
        }
      }
      // Wyczyść dane z sessionStorage po ich wykorzystaniu
      sessionStorage.removeItem('editFormData');
    }
  }, [isEditMode]);

  // Ustaw email zalogowanego użytkownika i aktualną godzinę (tylko jeśli nie jesteśmy w trybie edycji)
  useEffect(() => {
    if (currentUser && currentUser.email && !isEditMode) {
      setFormData(prev => ({
        ...prev,
        email: currentUser.email,
        fillTime: new Date().toLocaleTimeString('pl', { hour: '2-digit', minute: '2-digit' })
      }));
    }
  }, [currentUser, isEditMode]);

  // Filtrowanie dokumentów CMR na podstawie wyszukiwania
  useEffect(() => {
    if (!cmrSearchQuery.trim()) {
      setFilteredCmrDocuments(cmrDocuments.slice(0, 10)); // Pokaż pierwsze 10 opcji gdy brak wyszukiwania
      return;
    }

    const searchLower = cmrSearchQuery.toLowerCase();
    const filtered = cmrDocuments.filter(cmr => 
      cmr.cmrNumber?.toLowerCase().includes(searchLower) ||
      cmr.customerName?.toLowerCase().includes(searchLower) ||
      cmr.id?.toLowerCase().includes(searchLower)
    ).slice(0, 20); // Maksymalnie 20 wyników

    setFilteredCmrDocuments(filtered);
  }, [cmrSearchQuery, cmrDocuments]);

  const handleInputChange = (field) => (event) => {
    const value = event.target.value;
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
    
    // Usuń błąd po poprawieniu pola
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



  // Funkcja pomocnicza do pobierania pełnych danych CMR z pozycjami
  const handleCmrSelectionWithDetails = async (basicCmrData) => {
    try {
      setCmrLoading(true);
      
      // Pobierz pełne dane CMR z pozycjami
      const fullCmrData = await getCmrDocumentById(basicCmrData.id);
      
      // Oblicz sumę wag pozycji CMR
      const totalWeight = fullCmrData.items?.reduce((sum, item) => {
        const weight = parseFloat(item.weight) || 0;
        return sum + weight;
      }, 0) || 0;
      
      // Przygotuj opis pozycji (paleta/nazwa produktu)
      const itemsDescription = fullCmrData.items?.map(item => {
        const description = item.description || '';
        const quantity = item.quantity || '';
        const unit = item.unit || 'szt.';
        return quantity ? `${description} (${quantity} ${unit})` : description;
      }).filter(desc => desc.trim()).join(', ') || '';
      
      // Pobierz wszystkie numery zamówień z powiązanych CO
      let availableOrderNumbers = [];
      
      // Sprawdź nowy format (linkedOrderNumbers)
      if (fullCmrData.linkedOrderNumbers && Array.isArray(fullCmrData.linkedOrderNumbers)) {
        availableOrderNumbers.push(...fullCmrData.linkedOrderNumbers);
      }
      
      // Sprawdź czy są również powiązane zamówienia z numerami
      if (fullCmrData.linkedOrders && Array.isArray(fullCmrData.linkedOrders)) {
        const orderNumbersFromLinked = fullCmrData.linkedOrders
          .map(order => order.orderNumber)
          .filter(num => num && !availableOrderNumbers.includes(num));
        availableOrderNumbers.push(...orderNumbersFromLinked);
      }
      
      // Usuń duplikaty i puste wartości
      availableOrderNumbers = [...new Set(availableOrderNumbers.filter(num => num && num.trim()))];
      
      // Wybierz odpowiedni numer zamówienia
      const orderNumber = availableOrderNumbers.length === 1 
        ? availableOrderNumbers[0] 
        : availableOrderNumbers.length > 1 
          ? availableOrderNumbers.join(', ') // Pokaż wszystkie jeśli jest więcej niż 1
          : '';
      
      setFormData(prev => ({
        ...prev,
        cmrNumber: fullCmrData.cmrNumber,
        carrierName: fullCmrData.carrier || '',
        vehicleRegistration: fullCmrData.vehicleInfo?.vehicleRegistration || '',
        // Nowe pola z sekcji "Informacje o towarze"
        clientName: fullCmrData.recipient || '',
        orderNumber: orderNumber || '',
        palletProductName: itemsDescription || '',
        weight: totalWeight > 0 ? `${totalWeight} kg` : '',
        // Zapisz dostępne numery zamówień do późniejszego wyboru
        availableOrderNumbers: availableOrderNumbers
      }));
      setCmrSearchQuery(fullCmrData.cmrNumber);
      
      // Komunikat o automatycznym uzupełnieniu
      const filledFields = [];
      if (fullCmrData.carrier) filledFields.push('przewoźnik');
      if (fullCmrData.vehicleInfo?.vehicleRegistration) filledFields.push('nr rejestracyjny');
      if (fullCmrData.recipient) filledFields.push('nazwa klienta');
      if (orderNumber) filledFields.push(`numer${availableOrderNumbers.length > 1 ? 'y' : ''} zamówienia`);
      if (itemsDescription) filledFields.push('opis produktu');
      if (totalWeight > 0) filledFields.push('waga');
      
      if (filledFields.length > 0) {
        setAutoFillNotification(true);
        setTimeout(() => setAutoFillNotification(false), 4000);
        console.log('Automatycznie uzupełniono dane z CMR:', {
          przewoźnik: fullCmrData.carrier,
          rejestracja: fullCmrData.vehicleInfo?.vehicleRegistration,
          klient: fullCmrData.recipient,
          zamówienie: orderNumber,
          dostępneZamówienia: availableOrderNumbers,
          produkty: itemsDescription,
          waga: `${totalWeight} kg`,
          pozycjeCMR: fullCmrData.items?.length || 0,
          szczegółyPozycji: fullCmrData.items?.map(item => ({
            opis: item.description,
            ilość: item.quantity,
            jednostka: item.unit,
            waga: item.weight
          }))
        });
      }
              } catch (error) {
       console.error('Błąd podczas pobierania szczegółów CMR:', error);
       alert('Błąd podczas pobierania szczegółów dokumentu CMR');
     } finally {
       setCmrLoading(false);
    }
  };

  const handleCmrSearchChange = (event, newValue) => {
    if (typeof newValue === 'string') {
      setCmrSearchQuery(newValue);
      setFormData(prev => ({
        ...prev,
        cmrNumber: newValue
      }));
    } else if (newValue && newValue.inputValue) {
      setCmrSearchQuery(newValue.inputValue);
      setFormData(prev => ({
        ...prev,
        cmrNumber: newValue.inputValue
      }));
    } else if (newValue && newValue.cmrNumber) {
      // Wybrany dokument CMR - pobierz pełne dane z pozycjami
      handleCmrSelectionWithDetails(newValue);
    } else {
      setCmrSearchQuery('');
      setFormData(prev => ({
        ...prev,
        cmrNumber: ''
      }));
    }
    
    // Usuń błędy walidacji po wyborze/wpisaniu CMR
    if (errors.cmrNumber || errors.carrierName || errors.vehicleRegistration || 
        errors.clientName || errors.orderNumber || errors.palletProductName || errors.weight) {
      setErrors(prev => ({
        ...prev,
        cmrNumber: undefined,
        carrierName: undefined,
        vehicleRegistration: undefined,
        clientName: undefined,
        orderNumber: undefined,
        palletProductName: undefined,
        weight: undefined
      }));
    }
  };

  const validateForm = () => {
    const newErrors = {};
    
    // Walidacja imienia i nazwiska
    if (!formData.employeeName) {
      newErrors.employeeName = 'Imię i nazwisko jest wymagane';
    }
    
    // Walidacja stanowiska
    if (!formData.position) {
      newErrors.position = 'Stanowisko jest wymagane';
    }
    
    // Walidacja godziny wypełnienia
    if (!formData.fillTime) {
      newErrors.fillTime = 'Godzina wypełnienia jest wymagana';
    }
    
    // Walidacja numeru CMR
    if (!formData.cmrNumber.trim()) {
      newErrors.cmrNumber = 'Nr CMR jest wymagany';
    }
    if (!formData.carrierName.trim()) {
      newErrors.carrierName = 'Nazwa przewoźnika jest wymagana';
    }
    if (!formData.vehicleRegistration.trim()) {
      newErrors.vehicleRegistration = 'Nr rejestracyjny samochodu jest wymagany';
    }
    if (!formData.vehicleTechnicalCondition) {
      newErrors.vehicleTechnicalCondition = 'Stan techniczny samochodu jest wymagany';
    }
    
    // Walidacja informacji o towarze
    if (!formData.clientName.trim()) {
      newErrors.clientName = 'Nazwa klienta jest wymagana';
    }
    if (!formData.orderNumber.trim()) {
      newErrors.orderNumber = 'Numer zamówienia jest wymagany';
    }
    if (!formData.palletProductName.trim()) {
      newErrors.palletProductName = 'Paleta/nazwa produktu jest wymagana';
    }
    if (!formData.palletQuantity.trim()) {
      newErrors.palletQuantity = 'Ilość palet jest wymagana';
    }
    if (!formData.weight.trim()) {
      newErrors.weight = 'Waga jest wymagana';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    
    // Zabezpieczenie przed wielokrotnym zapisywaniem
    if (saving) return;
    
    if (!validateForm()) {
      return;
    }

    try {
      setSaving(true);
      // Przygotuj dane do zapisania
      const odpowiedzData = {
        email: formData.email,
        cmrNumber: formData.cmrNumber,
        employeeName: formData.employeeName,
        position: formData.position,
        fillDate: formData.fillDate,
        fillTime: formData.fillTime,
        loadingDate: formData.loadingDate,
        loadingTime: formData.loadingTime,
        carrierName: formData.carrierName,
        vehicleRegistration: formData.vehicleRegistration,
        vehicleTechnicalCondition: formData.vehicleTechnicalCondition,
        notes: formData.notes,
        clientName: formData.clientName,
        orderNumber: formData.orderNumber,
        palletProductName: formData.palletProductName,
        palletQuantity: formData.palletQuantity,
        weight: formData.weight,
        goodsNotes: formData.goodsNotes,
        type: 'loading-report'
      };



      if (isEditMode && editId) {
        // Aktualizuj istniejący dokument
        odpowiedzData.updatedAt = serverTimestamp();
        const docRef = doc(db, 'Forms/ZaladunekTowaru/Odpowiedzi', editId);
        await updateDoc(docRef, odpowiedzData);
        console.log('Formularz załadunku towaru zaktualizowany z danymi:', odpowiedzData);
      } else {
        // Utwórz nowy dokument
        odpowiedzData.createdAt = serverTimestamp();
        const odpowiedziRef = collection(db, 'Forms/ZaladunekTowaru/Odpowiedzi');
        await addDoc(odpowiedziRef, odpowiedzData);
        console.log('Formularz załadunku towaru wysłany z danymi:', odpowiedzData);
      }
      
      setShowSuccess(true);
      
      // Reset formularza po pomyślnym wysłaniu (tylko w trybie tworzenia)
      if (!isEditMode) {
        setFormData({
          email: currentUser?.email || '',
          cmrNumber: '',
          employeeName: '',
          position: '',
          fillDate: new Date(),
          fillTime: new Date().toLocaleTimeString('pl', { hour: '2-digit', minute: '2-digit' }),
          loadingDate: new Date(),
          loadingTime: '',
          carrierName: '',
          vehicleRegistration: '',
          vehicleTechnicalCondition: '',
          notes: '',
          clientName: '',
          orderNumber: '',
          palletProductName: '',
          palletQuantity: '',
          weight: '',
          goodsNotes: ''
        });
      }
      
      // Przekierowanie po 1.2 sekundach
      setTimeout(() => {
        navigate('/inventory/forms/responses?tab=loadingReport');
      }, 1200);
      
    } catch (error) {
      console.error('Błąd podczas zapisywania formularza:', error);
      alert(`Wystąpił błąd podczas zapisywania formularza: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleBack = () => {
    navigate('/inventory/forms');
  };

  return (
    <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={pl}>
      <Container maxWidth="md" sx={getFormContainerStyles()}>
        <Paper sx={getFormPaperStyles(theme)}>
          {/* Nagłówek formularza */}
          <Box sx={getFormHeaderStyles(theme, isEditMode)}>
            <Typography variant="h5" gutterBottom align="center" fontWeight="bold" sx={{
              fontSize: { xs: '1.25rem', sm: '1.5rem' },
              color: isEditMode ? 'warning.main' : 'primary.main',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 1
            }}>
              <LocalShippingIcon sx={{ fontSize: { xs: '1.5rem', sm: '2rem' } }} />
              {isEditMode ? 'EDYCJA RAPORTU - ZAŁADUNEK TOWARU' : 'RAPORT - ZAŁADUNEK TOWARU'}
            </Typography>
            <Typography variant="body2" align="center" color="text.secondary" sx={{
              fontSize: { xs: '0.75rem', sm: '0.875rem' },
              mb: 2
            }}>
              {isEditMode ? 'Edytuj wypełniony formularz załadunku towaru' : 'Formularz dokumentujący proces załadunku towaru'}
            </Typography>
            <Typography variant="body2" align="center" color="text.secondary" sx={{
              fontSize: { xs: '0.75rem', sm: '0.875rem' },
              mb: 0
            }}>
              W razie awarii i pilnych zgłoszeń prosimy o kontakt: mateusz@bgwpharma.com
            </Typography>
          </Box>

          {/* Przycisk powrotu */}
          <Box sx={{ mb: 2 }}>
            <Button
              startIcon={<ArrowBackIcon />}
              onClick={handleBack}
              variant="outlined"
              sx={getFormButtonStyles('outlined')}
            >
              Powrót
            </Button>
          </Box>

                  <Box component="form" onSubmit={handleSubmit} sx={{ px: { xs: 1, sm: 0 } }}>
            {/* Email użytkownika */}
            <TextField
              required
              fullWidth
              label="Adres e-mail"
              name="email"
              value={formData.email}
              onChange={handleInputChange('email')}
              error={!!errors.email}
              helperText={errors.email}
              InputProps={{
                readOnly: true, // Pole tylko do odczytu
              }}
              sx={{ mb: 3 }}
            />
            
            {/* SEKCJA 1 z 3 - IDENTYFIKACJA */}
            <Box sx={getFormSectionStyles(theme, 'primary')}>
              <Typography variant="subtitle2" sx={{ mb: 1, color: 'primary.main', fontWeight: 'bold' }}>
                Sekcja 1 z 3
              </Typography>
              <Typography variant="h6" gutterBottom sx={{ fontWeight: 'bold', color: 'primary.main', display: 'flex', alignItems: 'center', gap: 1 }}>
                <PersonIcon className="section-icon" />
                Identyfikacja
              </Typography>
              <Divider sx={{ mb: 3 }} />
              
              <Grid container spacing={{ xs: 2, sm: 3 }}>
                <Grid item xs={12} sm={6}>
              <Autocomplete
                options={filteredCmrDocuments}
                getOptionLabel={(option) => {
                  if (typeof option === 'string') {
                    return option;
                  }
                  const cmrNumber = option.cmrNumber || '';
                  const customerName = option.customerName || '';
                  return customerName ? `${cmrNumber} - ${customerName}` : cmrNumber;
                }}
                value={formData.cmrNumber ? filteredCmrDocuments.find(cmr => cmr.cmrNumber === formData.cmrNumber) || formData.cmrNumber : null}
                onChange={handleCmrSearchChange}
                onInputChange={(event, newInputValue) => {
                  setCmrSearchQuery(newInputValue);
                  setFormData(prev => ({
                    ...prev,
                    cmrNumber: newInputValue
                  }));
                }}
                inputValue={cmrSearchQuery || formData.cmrNumber}
                filterOptions={(options, { inputValue }) => {
                  const filtered = options.filter(option => {
                    const searchLower = inputValue.toLowerCase();
                    return (
                      option.cmrNumber?.toLowerCase().includes(searchLower) ||
                      option.customerName?.toLowerCase().includes(searchLower) ||
                      option.id?.toLowerCase().includes(searchLower)
                    );
                  });
                  return filtered;
                }}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Nr CMR"
                    variant="outlined"
                    placeholder="Wpisz numer CMR, nazwę klienta..."
                    required
                    error={!!errors.cmrNumber}
                    helperText={errors.cmrNumber || "Wpisz numer CMR lub wybierz z listy istniejących dokumentów"}
                    InputProps={{
                      ...params.InputProps,
                      startAdornment: (
                        <InputAdornment position="start">
                          <SearchIcon color="action" />
                        </InputAdornment>
                      ),
                      endAdornment: (
                        <>
                          {cmrLoading ? <CircularProgress color="inherit" size={20} /> : null}
                          {params.InputProps.endAdornment}
                        </>
                      ),
                    }}
                  />
                )}
                renderOption={(props, option) => (
                  <Box component="li" {...props}>
                    <Box>
                      <Typography variant="body1" sx={{ fontWeight: 'bold' }}>
                        {option.cmrNumber}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {option.customerName}
                      </Typography>
                    </Box>
                  </Box>
                )}
                freeSolo={true}
                clearOnBlur={false}
                selectOnFocus={true}
                handleHomeEndKeys={true}
                noOptionsText="Brak dokumentów CMR spełniających kryteria wyszukiwania"
                loadingText="Ładowanie dokumentów CMR..."
                loading={cmrLoading}
              />
            </Grid>
            
            <Grid item xs={12}>
              <FormControl component="fieldset" required error={!!errors.employeeName}>
                <FormLabel component="legend">Imię i nazwisko: </FormLabel>
                <RadioGroup
                  value={formData.employeeName}
                  onChange={handleInputChange('employeeName')}
                >
                  {employeeLoading ? (
                    <Typography variant="body2" color="text.secondary">Ładowanie opcji...</Typography>
                  ) : (
                    employeeOptions.map((employee) => (
                      <FormControlLabel 
                        key={employee}
                        value={employee} 
                        control={<Radio />} 
                        label={employee} 
                      />
                    ))
                  )}
                </RadioGroup>
              </FormControl>
            </Grid>
            
            <Grid item xs={12}>
              <FormControl component="fieldset" required error={!!errors.position}>
                <FormLabel component="legend">Stanowisko: </FormLabel>
                <RadioGroup
                  value={formData.position}
                  onChange={handleInputChange('position')}
                >
                  {positionLoading ? (
                    <Typography variant="body2" color="text.secondary">Ładowanie opcji...</Typography>
                  ) : (
                    positionOptions.map((position) => (
                      <FormControlLabel 
                        key={position}
                        value={position} 
                        control={<Radio />} 
                        label={position} 
                      />
                    ))
                  )}
                </RadioGroup>
              </FormControl>
            </Grid>
            
            <Grid item xs={12} sm={6}>
              <DatePicker
                label="Data wypełnienia"
                value={formData.fillDate}
                onChange={handleDateChange('fillDate')}
                renderInput={(params) => <TextField {...params} fullWidth required />}
              />
            </Grid>
            
            <Grid item xs={12} sm={6}>
              <TextField
                required
                fullWidth
                label="Godzina wypełnienia"
                name="fillTime"
                type="time"
                value={formData.fillTime}
                onChange={handleInputChange('fillTime')}
                error={!!errors.fillTime}
                helperText={errors.fillTime}
                InputLabelProps={{
                  shrink: true,
                }}
              />
                </Grid>
              </Grid>
            </Box>

            {/* SEKCJA 2 z 3 - INFORMACJE O ZAŁADUNKU */}
            <Box sx={getFormSectionStyles(theme, 'warning')}>
              <Typography variant="subtitle2" sx={{ mb: 1, color: 'warning.main', fontWeight: 'bold' }}>
                Sekcja 2 z 3
              </Typography>
              <Typography variant="h6" gutterBottom sx={{ fontWeight: 'bold', color: 'warning.main', display: 'flex', alignItems: 'center', gap: 1 }}>
                <LocalShippingIcon className="section-icon" />
                Informacje o załadunku
              </Typography>
              <Divider sx={{ mb: 3 }} />
              
              <Grid container spacing={{ xs: 2, sm: 3 }}>
                <Grid item xs={12} sm={6}>
              <DatePicker
                label="Data załadunku"
                value={formData.loadingDate}
                onChange={handleDateChange('loadingDate')}
                renderInput={(params) => <TextField {...params} fullWidth required />}
              />
            </Grid>
            
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Godzina załadunku"
                name="loadingTime"
                type="time"
                value={formData.loadingTime}
                onChange={handleInputChange('loadingTime')}
                InputLabelProps={{
                  shrink: true,
                }}
              />
            </Grid>
            
            <Grid item xs={12} sm={6}>
              <TextField
                label="Nazwa przewoźnika"
                value={formData.carrierName}
                onChange={handleInputChange('carrierName')}
                fullWidth
                required
                error={!!errors.carrierName}
                helperText={errors.carrierName || "Wybierz CMR powyżej, aby automatycznie uzupełnić to pole"}
                placeholder="Automatycznie uzupełniane z CMR"
              />
            </Grid>
            
            <Grid item xs={12} sm={6}>
              <TextField
                label="Nr rejestracyjny samochodu"
                value={formData.vehicleRegistration}
                onChange={handleInputChange('vehicleRegistration')}
                fullWidth
                required
                error={!!errors.vehicleRegistration}
                helperText={errors.vehicleRegistration || "Wybierz CMR powyżej, aby automatycznie uzupełnić to pole"}
                placeholder="Automatycznie uzupełniane z CMR"
              />
            </Grid>
            
            <Grid item xs={12}>
              <FormControl component="fieldset" required error={!!errors.vehicleTechnicalCondition}>
                <FormLabel component="legend">Stan techniczny samochodu:</FormLabel>
                <RadioGroup
                  value={formData.vehicleTechnicalCondition}
                  onChange={handleInputChange('vehicleTechnicalCondition')}
                  row
                >
                  <FormControlLabel 
                    value="Prawidłowy" 
                    control={<Radio />} 
                    label="Prawidłowy" 
                  />
                  <FormControlLabel 
                    value="Uszkodzony" 
                    control={<Radio />} 
                    label="Uszkodzony" 
                  />
                </RadioGroup>
              </FormControl>
            </Grid>
            
            <Grid item xs={12}>
              <TextField
                label="Uwagi"
                value={formData.notes}
                onChange={handleInputChange('notes')}
                fullWidth
                multiline
                rows={4}
                placeholder="Ewentualne uwagi do stanu technicznego samochodu - jeśli był 'uszkodzony' w poprzednim pytaniu"
                helperText="Tekst długiej odpowiedzi"
              />
                </Grid>
              </Grid>
            </Box>

            {/* SEKCJA 3 z 3 - INFORMACJE O TOWARZE */}
            <Box sx={getFormSectionStyles(theme, 'success')}>
              <Typography variant="subtitle2" sx={{ mb: 1, color: 'success.main', fontWeight: 'bold' }}>
                Sekcja 3 z 3
              </Typography>
              <Typography variant="h6" gutterBottom sx={{ fontWeight: 'bold', color: 'success.main', display: 'flex', alignItems: 'center', gap: 1 }}>
                <InventoryIcon className="section-icon" />
                Informacje o towarze
              </Typography>
              <Divider sx={{ mb: 3 }} />
              
              <Grid container spacing={{ xs: 2, sm: 3 }}>
                <Grid item xs={12} sm={6}>
              <TextField
                label="Nazwa klienta"
                value={formData.clientName}
                onChange={handleInputChange('clientName')}
                fullWidth
                required
                error={!!errors.clientName}
                helperText={errors.clientName || "Automatycznie uzupełniane z odbiorcy CMR"}
                placeholder="Automatycznie z CMR - odbiorca"
              />
            </Grid>
            
            <Grid item xs={12} sm={6}>
              {formData.availableOrderNumbers && formData.availableOrderNumbers.length > 1 ? (
                <FormControl fullWidth required error={!!errors.orderNumber}>
                  <InputLabel>Numer zamówienia</InputLabel>
                  <Select
                    value={formData.orderNumber}
                    onChange={handleInputChange('orderNumber')}
                    label="Numer zamówienia"
                  >
                    <MenuItem value="">
                      <em>Wybierz numer zamówienia</em>
                    </MenuItem>
                    {formData.availableOrderNumbers.map((orderNum, index) => (
                      <MenuItem key={index} value={orderNum}>
                        {orderNum}
                      </MenuItem>
                    ))}
                    <MenuItem value={formData.availableOrderNumbers.join(', ')}>
                      <em>Wszystkie zamówienia: {formData.availableOrderNumbers.join(', ')}</em>
                    </MenuItem>
                  </Select>
                  {errors.orderNumber && (
                    <Typography variant="caption" color="error" sx={{ mt: 0.5, ml: 1.5 }}>
                      {errors.orderNumber}
                    </Typography>
                  )}
                  <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, ml: 1.5 }}>
                    CMR ma {formData.availableOrderNumbers.length} powiązanych zamówień - wybierz jedno lub wszystkie
                  </Typography>
                </FormControl>
              ) : (
                <TextField
                  label="Numer zamówienia"
                  value={formData.orderNumber}
                  onChange={handleInputChange('orderNumber')}
                  fullWidth
                  required
                  error={!!errors.orderNumber}
                  helperText={
                    errors.orderNumber || 
                    (formData.availableOrderNumbers && formData.availableOrderNumbers.length === 1 
                      ? "Automatycznie uzupełnione z powiązanego CO w CMR"
                      : "Automatycznie uzupełniane z powiązanych CO w CMR")
                  }
                  placeholder="Automatycznie z CMR - powiązane CO"
                />
              )}
            </Grid>
            
            <Grid item xs={12} sm={6}>
              <TextField
                label="Paleta/nazwa produktu"
                value={formData.palletProductName}
                onChange={handleInputChange('palletProductName')}
                fullWidth
                required
                error={!!errors.palletProductName}
                helperText={errors.palletProductName || "Automatycznie uzupełniane z pozycji CMR"}
                placeholder="Automatycznie z CMR - pozycje + ilości"
              />
            </Grid>
            
            <Grid item xs={12} sm={6}>
              <TextField
                label="Ilość palet"
                value={formData.palletQuantity}
                onChange={handleInputChange('palletQuantity')}
                fullWidth
                required
                type="number"
                error={!!errors.palletQuantity}
                helperText={errors.palletQuantity || "Tekst krótkiej odpowiedzi"}
              />
            </Grid>
            
            <Grid item xs={12} sm={6}>
              <TextField
                label="Waga"
                value={formData.weight}
                onChange={handleInputChange('weight')}
                fullWidth
                required
                error={!!errors.weight}
                helperText={errors.weight || "Automatycznie uzupełniane - suma wag z CMR"}
                placeholder="Automatycznie z CMR - suma wag pozycji"
              />
            </Grid>
            
            <Grid item xs={12} sm={6}>
              <TextField
                label="Uwagi"
                value={formData.goodsNotes}
                onChange={handleInputChange('goodsNotes')}
                fullWidth
                helperText="Tekst krótkiej odpowiedzi"
              />
                </Grid>
              </Grid>
            </Box>

            {/* PRZYCISKI AKCJI */}
            <Box sx={getFormActionsStyles()}>
              <Button
                variant="outlined"
                onClick={handleBack}
                sx={getFormButtonStyles('outlined')}
              >
                Anuluj
              </Button>
              <Button
                type="submit"
                variant="contained"
                disabled={saving}
                startIcon={saving ? <CircularProgress size={20} color="inherit" /> : <SaveIcon />}
                sx={{
                  ...getFormButtonStyles('contained'),
                  flexGrow: 1
                }}
              >
                {saving ? 'Zapisywanie...' : (isEditMode ? 'Zapisz zmiany' : 'Prześlij raport')}
              </Button>
            </Box>
          </Box>

        <Snackbar
          open={showSuccess}
          autoHideDuration={6000}
          onClose={() => setShowSuccess(false)}
        >
          <Alert onClose={() => setShowSuccess(false)} severity="success" sx={{ width: '100%' }}>
            {isEditMode ? 'Raport załadunku towaru został zaktualizowany pomyślnie!' : 'Raport załadunku towaru został przesłany pomyślnie!'}
          </Alert>
        </Snackbar>

        <Snackbar
          open={autoFillNotification}
          autoHideDuration={4000}
          onClose={() => setAutoFillNotification(false)}
          anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
        >
          <Alert onClose={() => setAutoFillNotification(false)} severity="info" sx={{ width: '100%' }}>
            ✅ Automatycznie uzupełniono dane z dokumentu CMR (przewoźnik, pojazd, klient, zamówienie, produkty, waga)
          </Alert>
        </Snackbar>
        </Paper>
      </Container>
    </LocalizationProvider>
  );
};

export default LoadingReportFormPage; 