import React, { useState, useEffect } from 'react';
import { 
  Grid, 
  TextField, 
  Typography, 
  Box, 
  Button, 
  Card, 
  CardContent, 
  CardHeader, 
  Divider,
  MenuItem,
  IconButton,
  FormHelperText,
  FormControl,
  InputLabel,
  Select,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  CircularProgress,
  Autocomplete,
  Snackbar,
  Alert,
  Checkbox,
  FormControlLabel,
  FormGroup
} from '@mui/material';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { LocalizationProvider, DatePicker } from '@mui/x-date-pickers';
import pl from 'date-fns/locale/pl';
import { format } from 'date-fns';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import RefreshIcon from '@mui/icons-material/Refresh';
import SearchIcon from '@mui/icons-material/Search';
import { CMR_STATUSES, TRANSPORT_TYPES } from '../../../services/cmrService';
import { getOrderById, getAllOrders, searchOrdersByNumber } from '../../../services/orderService';
import { getCustomerById } from '../../../services/customerService';
import { getCompanyData } from '../../../services/companyService';

/**
 * Komponent formularza CMR rozszerzony o możliwość uzupełniania pól na podstawie zamówienia klienta (CO).
 * 
 * @param {Object} initialData - Początkowe dane formularza
 * @param {Function} onSubmit - Funkcja wywołana po zapisaniu formularza
 * @param {Function} onCancel - Funkcja wywołana po anulowaniu edycji
 * @returns {JSX.Element} Formularz CMR
 */
const CmrForm = ({ initialData, onSubmit, onCancel }) => {
  const emptyItem = {
    description: '',
    quantity: '',
    unit: 'szt.',
    weight: '',
    volume: '',
    notes: ''
  };
  
  const emptyFormData = {
    cmrNumber: '',
    issueDate: new Date(),
    deliveryDate: null,
    status: CMR_STATUSES.DRAFT,
    transportType: TRANSPORT_TYPES.ROAD,
    
    // Dane nadawcy
    sender: '',
    senderAddress: '',
    senderPostalCode: '',
    senderCity: '',
    senderCountry: '',
    
    // Dane odbiorcy
    recipient: '',
    recipientAddress: '',
    recipientPostalCode: '',
    recipientCity: '',
    recipientCountry: '',
    
    // Dane przewoźnika
    carrier: '',
    carrierAddress: '',
    carrierPostalCode: '',
    carrierCity: '',
    carrierCountry: '',
    
    // Miejsce załadunku i rozładunku
    loadingPlace: '',
    loadingDate: null,
    deliveryPlace: '',
    
    // Dane dotyczące przesyłki
    attachedDocuments: '',
    instructionsFromSender: '',
    
    // Opłaty
    freight: '',
    carriage: '',
    discounts: '',
    balance: '',
    specialAgreements: '',
    
    // Płatność
    paymentMethod: 'sender', // sender, recipient, other
    
    // Dane pojazdu
    vehicleInfo: {
      vehicleRegistration: '',
      trailerRegistration: '',
    },
    
    // Rezerwacje
    reservations: '',
    
    items: [{ ...emptyItem }],
    notes: ''
  };
  
  const [formData, setFormData] = useState(emptyFormData);
  const [formErrors, setFormErrors] = useState({});
  
  // Dodane stany dla obsługi wyboru dokumentu CO
  const [isOrderDialogOpen, setIsOrderDialogOpen] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState('');
  const [isLoadingOrder, setIsLoadingOrder] = useState(false);
  const [availableOrders, setAvailableOrders] = useState([]);
  const [orderSearchQuery, setOrderSearchQuery] = useState('');
  
  // Dodane stany dla wyboru, które dane importować z CO
  const [importOptions, setImportOptions] = useState({
    recipientData: true,
    deliveryPlace: true,
    deliveryDate: true,
    items: true,
    documents: true
  });
  
  // Dodane stany dla dialogu wyboru pól nadawcy
  const [isSenderDialogOpen, setIsSenderDialogOpen] = useState(false);
  const [isLoadingSenderData, setIsLoadingSenderData] = useState(false);
  const [senderImportOptions, setSenderImportOptions] = useState({
    name: true,
    address: true,
    postalCode: true,
    city: true,
    country: true
  });
  
  // Dodane stany dla obsługi komunikatów
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [snackbarSeverity, setSnackbarSeverity] = useState('info');
  
  // Funkcja do wyświetlania komunikatów
  const showMessage = (message, severity = 'info') => {
    setSnackbarMessage(message);
    setSnackbarSeverity(severity);
    setSnackbarOpen(true);
  };
  
  // Funkcja do zamykania komunikatu
  const handleCloseSnackbar = () => {
    setSnackbarOpen(false);
  };
  
  // Funkcja do ładowania dostępnych zamówień klienta (CO)
  const loadAvailableOrders = async () => {
    try {
      // Pobierz zamówienia klienta (CO) z bazy danych
      // Filtrujemy tylko zamówienia klienta (nie zamówienia zakupu)
      const orders = await getAllOrders();
      // Filtrujemy zamówienia, które nie mają typu 'purchase'
      const customerOrders = orders.filter(order => order.type !== 'purchase');
      setAvailableOrders(customerOrders);
      
      if (customerOrders.length > 0) {
        showMessage(`Załadowano ${customerOrders.length} zamówień klienta`, 'info');
      } else {
        showMessage('Nie znaleziono żadnych zamówień klienta', 'warning');
      }
    } catch (error) {
      console.error('Błąd podczas pobierania zamówień klienta:', error);
      showMessage('Wystąpił błąd podczas pobierania zamówień klienta', 'error');
    }
  };
  
  useEffect(() => {
    if (initialData) {
      // Konwertuj daty z ISO String (jeśli są) na obiekty Date
      const processedData = {
        ...initialData,
        issueDate: initialData.issueDate ? new Date(initialData.issueDate) : new Date(),
        deliveryDate: initialData.deliveryDate ? new Date(initialData.deliveryDate) : null,
        loadingDate: initialData.loadingDate ? new Date(initialData.loadingDate) : null,
        items: initialData.items && initialData.items.length > 0 
          ? initialData.items 
          : [{ ...emptyItem }]
      };
      
      setFormData(processedData);
    }
    
    // Załaduj listę dostępnych zamówień klienta
    loadAvailableOrders();
    
    // Załaduj dane firmy i uzupełnij pole nadawcy
    loadCompanyData();
  }, [initialData]);
  
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    // Usuń błąd po edycji pola
    if (formErrors[name]) {
      setFormErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[name];
        return newErrors;
      });
    }
  };
  
  const handleDateChange = (name, date) => {
    setFormData(prev => ({ ...prev, [name]: date }));
    // Usuń błąd po edycji pola
    if (formErrors[name]) {
      setFormErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[name];
        return newErrors;
      });
    }
  };
  
  const handleItemChange = (index, field, value) => {
    setFormData(prev => {
      const updatedItems = [...prev.items];
      updatedItems[index] = { ...updatedItems[index], [field]: value };
      return { ...prev, items: updatedItems };
    });
  };
  
  const addItem = () => {
    setFormData(prev => ({
      ...prev,
      items: [...prev.items, { ...emptyItem }]
    }));
  };
  
  const removeItem = (index) => {
    if (formData.items.length <= 1) return;
    
    setFormData(prev => {
      const updatedItems = [...prev.items];
      updatedItems.splice(index, 1);
      return { ...prev, items: updatedItems };
    });
  };
  
  const validateForm = () => {
    const errors = {};
    
    // Wymagane pola podstawowe
    if (!formData.sender) errors.sender = 'Nadawca jest wymagany';
    if (!formData.senderAddress) errors.senderAddress = 'Adres nadawcy jest wymagany';
    if (!formData.recipient) errors.recipient = 'Odbiorca jest wymagany';
    if (!formData.recipientAddress) errors.recipientAddress = 'Adres odbiorcy jest wymagany';
    if (!formData.carrier) errors.carrier = 'Przewoźnik jest wymagany';
    if (!formData.carrierAddress) errors.carrierAddress = 'Adres przewoźnika jest wymagany';
    
    // Walidacja miejsca załadunku i rozładunku
    if (!formData.loadingPlace) errors.loadingPlace = 'Miejsce załadunku jest wymagane';
    if (!formData.deliveryPlace) errors.deliveryPlace = 'Miejsce rozładunku jest wymagane';
    
    // Walidacja dat
    if (!formData.issueDate) errors.issueDate = 'Data wystawienia jest wymagana';
    
    // Walidacja informacji o pojeździe
    if (!formData.vehicleInfo?.vehicleRegistration) errors['vehicleInfo.vehicleRegistration'] = 'Numer rejestracyjny pojazdu jest wymagany';
    
    // Upewnij się, że pola specjalnych ustaleń i zastrzeżeń są zdefiniowane
    if (formData.specialAgreements === undefined) {
      formData.specialAgreements = '';
    }
    
    if (formData.reservations === undefined) {
      formData.reservations = '';
    }
    
    if (formData.notes === undefined) {
      formData.notes = '';
    }
    
    // Walidacja przedmiotów
    const itemErrors = [];
    formData.items.forEach((item, index) => {
      const itemError = {};
      if (!item.description) itemError.description = 'Opis jest wymagany';
      if (!item.quantity) itemError.quantity = 'Ilość jest wymagana';
      if (!item.unit) itemError.unit = 'Jednostka jest wymagana';
      
      if (Object.keys(itemError).length > 0) {
        itemErrors[index] = itemError;
      }
    });
    
    if (itemErrors.length > 0 && itemErrors.some(item => item !== undefined)) {
      errors.items = itemErrors;
    }
    
    console.log('Błędy walidacji formularza przed zapisaniem:', errors);
    console.log('Liczba błędów:', Object.keys(errors).length);
    
    setFormErrors(errors);
    const isValid = Object.keys(errors).length === 0;
    console.log('Formularz jest poprawny:', isValid);
    return isValid;
  };
  
  const handleSubmit = (e) => {
    e.preventDefault();
    console.log('Próba wysłania formularza CMR:', formData);
    
    // Upewnij się, że wszystkie pola są poprawnie uwzględnione przed wysłaniem formularza
    const dataToSubmit = {
      ...formData,
      // Upewnij się, że te pola są poprawnie przekazywane
      specialAgreements: formData.specialAgreements || '',
      reservations: formData.reservations || '',
      notes: formData.notes || ''
    };
    
    // Upewnij się, że vehicleInfo jest zdefiniowane
    if (!dataToSubmit.vehicleInfo) dataToSubmit.vehicleInfo = {};
    
    const isValid = validateForm();
    console.log('Wynik walidacji:', isValid);
    
    if (isValid) {
      console.log('Formularz jest poprawny, wysyłanie danych:', dataToSubmit);
      try {
        onSubmit(dataToSubmit);
      } catch (error) {
        console.error('Błąd podczas próby wywołania onSubmit:', error);
      }
    } else {
      console.log('Formularz zawiera błędy, nie można go wysłać');
    }
  };
  
  // Funkcja obsługująca zmianę opcji importu
  const handleImportOptionChange = (event) => {
    const { name, checked } = event.target;
    setImportOptions(prev => ({
      ...prev,
      [name]: checked
    }));
  };
  
  // Nowa funkcja do obsługi otwierania dialogu wyboru zamówienia klienta (CO)
  const handleOpenOrderDialog = () => {
    // Resetujemy stan i przywracamy domyślne opcje importu
    setOrderSearchQuery('');
    setSelectedOrderId('');
    setImportOptions({
      recipientData: true,
      deliveryPlace: true,
      deliveryDate: true,
      items: true,
      documents: true
    });
    setIsOrderDialogOpen(true);
  };
  
  // Nowa funkcja do obsługi zamykania dialogu wyboru zamówienia klienta (CO)
  const handleCloseOrderDialog = () => {
    setIsOrderDialogOpen(false);
  };
  
  // Nowa funkcja do obsługi wyboru zamówienia klienta (CO)
  const handleOrderSelect = async (orderId) => {
    if (!orderId) return;
    
    setIsLoadingOrder(true);
    
    try {
      // Pobierz dane zamówienia klienta na podstawie ID
      const order = await getOrderById(orderId);
      
      if (!order) {
        showMessage('Nie można znaleźć zamówienia o podanym ID', 'error');
        return;
      }
      
      // Jeśli zamówienie ma referencję do klienta, ale brakuje niektórych danych, spróbuj pobrać pełne dane klienta
      let customerData = order.customer || {};
      let customerDataSource = 'zamówienia';
      
      if (importOptions.recipientData && order.customer?.id && (!order.customer.postalCode || !order.customer.city || !order.customer.country)) {
        try {
          const fullCustomerData = await getCustomerById(order.customer.id);
          if (fullCustomerData) {
            customerData = {
              ...order.customer,
              ...fullCustomerData,
              // Zachowaj id z oryginalnych danych, na wypadek gdyby getCustomerById zwróciło inne id
              id: order.customer.id
            };
            customerDataSource = 'pełnych danych klienta';
          }
        } catch (customerError) {
          console.warn('Nie udało się pobrać pełnych danych klienta:', customerError);
          // Kontynuuj z dostępnymi danymi klienta
        }
      }
      
      // Przygotuj podsumowanie pobranych danych
      const importedDataSummary = [];
      
      // Uzupełnij formularz danymi z zamówienia
      setFormData(prev => {
        // Zachowujemy istniejące elementy formularza i nadpisujemy tylko te, które chcemy zaktualizować
        const updatedForm = { ...prev };
        
        // Zapisz powiązanie z zamówieniem
        updatedForm.linkedOrderId = orderId;
        updatedForm.linkedOrderNumber = order.orderNumber;
        
        // Dane odbiorcy (klient z zamówienia)
        if (importOptions.recipientData) {
          updatedForm.recipient = customerData.name || '';
          updatedForm.recipientAddress = customerData.address || '';
          updatedForm.recipientPostalCode = customerData.postalCode || '';
          updatedForm.recipientCity = customerData.city || '';
          updatedForm.recipientCountry = customerData.country || '';
          
          // Alternatywnie, jeśli dane adresowe są w innym formacie, możemy próbować je wyodrębnić
          if (!customerData.postalCode && !customerData.city && customerData.address) {
            const extractedData = extractAddressDetails(customerData.address);
            if (extractedData.recipientPostalCode) updatedForm.recipientPostalCode = extractedData.recipientPostalCode;
            if (extractedData.recipientCity) updatedForm.recipientCity = extractedData.recipientCity;
          }
          
          importedDataSummary.push('Dane odbiorcy');
        }
        
        // Miejsce dostawy
        if (importOptions.deliveryPlace) {
          updatedForm.deliveryPlace = order.shippingAddress || customerData.shippingAddress || customerData.address || '';
          importedDataSummary.push('Miejsce dostawy');
        }
        
        // Data dostawy (jeśli jest ustawiona w zamówieniu)
        if (importOptions.deliveryDate && order.expectedDeliveryDate) {
          updatedForm.deliveryDate = new Date(order.expectedDeliveryDate);
          importedDataSummary.push('Data dostawy');
        }
        
        // Dodajemy numer zamówienia jako dokument załączony
        if (importOptions.documents) {
          updatedForm.attachedDocuments = prev.attachedDocuments ? 
            `${prev.attachedDocuments}, Zamówienie nr ${order.orderNumber}` : 
            `Zamówienie nr ${order.orderNumber}`;
          importedDataSummary.push('Dokumenty');
        }
        
        // Produkty z zamówienia
        if (importOptions.items && order.items && order.items.length > 0) {
          updatedForm.items = order.items.map(item => ({
            description: item.name || '',
            quantity: item.quantity || '',
            unit: item.unit || 'szt.',
            weight: '', // Tych informacji może nie być w zamówieniu, więc zostawiamy puste
            volume: '', // Tych informacji może nie być w zamówieniu, więc zostawiamy puste
            notes: ''
          }));
          importedDataSummary.push(`${order.items.length} pozycji`);
        }
        
        return updatedForm;
      });
      
      // Wyświetl podsumowanie pobranych danych
      const summaryMessage = `Pomyślnie powiązano CMR z zamówieniem ${order.orderNumber}. 
Zaimportowano: ${importedDataSummary.join(', ')}.
${importOptions.recipientData ? `Źródło danych klienta: ${customerDataSource}.` : ''}`;
      
      showMessage(summaryMessage, 'success');
      setIsOrderDialogOpen(false);
    } catch (error) {
      console.error('Błąd podczas pobierania danych zamówienia:', error);
      showMessage('Wystąpił błąd podczas pobierania danych zamówienia', 'error');
    } finally {
      setIsLoadingOrder(false);
    }
  };
  
  // Pomocnicza funkcja do ekstrakcji szczegółów adresowych (jeśli potrzebna)
  const extractAddressDetails = (fullAddress) => {
    if (!fullAddress) return {};
    
    // Próba wyodrębnienia kodu pocztowego i miasta
    // Typowy format polskiego adresu: "ul. Przykładowa 123, 00-000 Miasto"
    const postalCodeMatch = fullAddress.match(/(\d{2}-\d{3})\s+([^,]+)/);
    if (postalCodeMatch) {
      return {
        recipientPostalCode: postalCodeMatch[1],
        recipientCity: postalCodeMatch[2]
      };
    }
    
    return {};
  };
  
  // Nowa funkcja do wyszukiwania zamówienia po numerze CO
  const handleFindOrderByNumber = async () => {
    if (!orderSearchQuery) {
      showMessage('Wprowadź numer zamówienia', 'warning');
      return;
    }
    
    setIsLoadingOrder(true);
    
    try {
      // Użyj nowej funkcji searchOrdersByNumber do wyszukiwania zamówień
      const foundOrders = await searchOrdersByNumber(orderSearchQuery, true);
      
      if (foundOrders.length > 0) {
        // Jeśli znaleziono dokładnie jedno pasujące zamówienie, wybierz je automatycznie
        if (foundOrders.length === 1) {
          handleOrderSelect(foundOrders[0].id);
        } else {
          // Jeśli znaleziono więcej niż jedno, pokaż je w dropdownie
          setAvailableOrders(foundOrders);
          showMessage(`Znaleziono ${foundOrders.length} zamówień. Wybierz jedno z listy.`, 'info');
        }
      } else {
        showMessage('Nie znaleziono zamówienia o podanym numerze', 'warning');
      }
    } catch (error) {
      console.error('Błąd podczas wyszukiwania zamówienia:', error);
      showMessage('Wystąpił błąd podczas wyszukiwania zamówienia', 'error');
    } finally {
      setIsLoadingOrder(false);
    }
  };
  
  // Nowa funkcja do obsługi odświeżania listy zamówień
  const handleRefreshOrders = async () => {
    setIsLoadingOrder(true);
    try {
      await loadAvailableOrders();
    } catch (error) {
      console.error('Błąd podczas odświeżania listy zamówień:', error);
      showMessage('Wystąpił błąd podczas odświeżania listy zamówień', 'error');
    } finally {
      setIsLoadingOrder(false);
    }
  };
  
  // Funkcja obsługująca zmianę opcji importu dla nadawcy
  const handleSenderImportOptionChange = (event) => {
    const { name, checked } = event.target;
    setSenderImportOptions(prev => ({
      ...prev,
      [name]: checked
    }));
  };
  
  // Funkcja otwierająca dialog wyboru pól nadawcy
  const handleOpenSenderDialog = () => {
    // Resetujemy opcje importu do domyślnych wartości
    setSenderImportOptions({
      name: true,
      address: true,
      postalCode: true,
      city: true,
      country: true
    });
    setIsSenderDialogOpen(true);
  };
  
  // Funkcja zamykająca dialog wyboru pól nadawcy
  const handleCloseSenderDialog = () => {
    setIsSenderDialogOpen(false);
  };
  
  // Funkcja do pobierania danych firmy z bazy danych
  const loadCompanyData = async (useDialog = false) => {
    if (useDialog) {
      handleOpenSenderDialog();
      return;
    }
    
    setIsLoadingSenderData(true);
    try {
      const companyData = await getCompanyData();
      
      if (companyData) {
        // Ekstrakcja kodu pocztowego i miasta z pola city (jeśli w formacie "00-000 Miasto")
        let postalCode = '';
        let city = '';
        
        if (companyData.city) {
          const cityParts = companyData.city.split(' ');
          // Sprawdź, czy pierwszy element wygląda jak kod pocztowy (XX-XXX)
          if (cityParts.length > 1 && /^\d{2}-\d{3}$/.test(cityParts[0])) {
            postalCode = cityParts[0];
            city = cityParts.slice(1).join(' ');
          } else {
            // Jeśli nie ma formatu kodu pocztowego, użyj całej wartości jako miasto
            city = companyData.city;
          }
        }
        
        setFormData(prev => ({
          ...prev,
          sender: companyData.name || '',
          senderAddress: companyData.address || '',
          senderPostalCode: postalCode || companyData.postalCode || '',
          senderCity: city || companyData.city || '',
          senderCountry: companyData.country || 'Polska' // Domyślnie ustawiamy Polska
        }));
        
        showMessage('Dane nadawcy zostały uzupełnione danymi firmy', 'success');
      } else {
        showMessage('Nie znaleziono danych firmy', 'warning');
      }
    } catch (error) {
      console.error('Błąd podczas pobierania danych firmy:', error);
      showMessage('Wystąpił błąd podczas pobierania danych firmy', 'error');
    } finally {
      setIsLoadingSenderData(false);
    }
  };
  
  // Funkcja do importu wybranych pól nadawcy z danych firmy
  const handleImportSenderData = async () => {
    setIsLoadingSenderData(true);
    try {
      const companyData = await getCompanyData();
      
      if (companyData) {
        // Ekstrakcja kodu pocztowego i miasta z pola city (jeśli w formacie "00-000 Miasto")
        let postalCode = '';
        let city = '';
        
        if (companyData.city) {
          const cityParts = companyData.city.split(' ');
          // Sprawdź, czy pierwszy element wygląda jak kod pocztowy (XX-XXX)
          if (cityParts.length > 1 && /^\d{2}-\d{3}$/.test(cityParts[0])) {
            postalCode = cityParts[0];
            city = cityParts.slice(1).join(' ');
          } else {
            // Jeśli nie ma formatu kodu pocztowego, użyj całej wartości jako miasto
            city = companyData.city;
          }
        }
        
        // Przygotuj podsumowanie importowanych danych
        const importedFields = [];
        
        setFormData(prev => {
          const updatedForm = { ...prev };
          
          // Uzupełnij tylko wybrane pola
          if (senderImportOptions.name) {
            updatedForm.sender = companyData.name || '';
            importedFields.push('Nazwa nadawcy');
          }
          
          if (senderImportOptions.address) {
            updatedForm.senderAddress = companyData.address || '';
            importedFields.push('Adres nadawcy');
          }
          
          if (senderImportOptions.postalCode) {
            updatedForm.senderPostalCode = postalCode || companyData.postalCode || '';
            importedFields.push('Kod pocztowy');
          }
          
          if (senderImportOptions.city) {
            updatedForm.senderCity = city || companyData.city || '';
            importedFields.push('Miasto');
          }
          
          if (senderImportOptions.country) {
            updatedForm.senderCountry = companyData.country || 'Polska';
            importedFields.push('Kraj');
          }
          
          return updatedForm;
        });
        
        showMessage(`Dane nadawcy zostały zaktualizowane. Zaimportowano: ${importedFields.join(', ')}`, 'success');
      } else {
        showMessage('Nie znaleziono danych firmy', 'warning');
      }
    } catch (error) {
      console.error('Błąd podczas pobierania danych firmy:', error);
      showMessage('Wystąpił błąd podczas pobierania danych firmy', 'error');
    } finally {
      setIsLoadingSenderData(false);
      setIsSenderDialogOpen(false);
    }
  };
  
  return (
    <form onSubmit={(e) => e.preventDefault()}>
      <Grid container spacing={3}>
        {/* Dane podstawowe */}
        <Grid item xs={12}>
          <Card>
            <CardHeader 
              title="Informacje podstawowe" 
              titleTypographyProps={{ variant: 'h6' }}
            />
            <Divider />
            <CardContent>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={3}>
                  <TextField
                    label="Numer CMR"
                    name="cmrNumber"
                    value={formData.cmrNumber}
                    onChange={handleChange}
                    fullWidth
                    disabled={true}
                    helperText="Numer zostanie wygenerowany automatycznie"
                  />
                </Grid>
                
                <Grid item xs={12} sm={3}>
                  <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={pl}>
                    <DatePicker
                      label="Data wystawienia"
                      value={formData.issueDate}
                      onChange={(newDate) => {
                        setFormData(prev => ({
                          ...prev,
                          issueDate: newDate
                        }));
                      }}
                      renderInput={(params) => <TextField {...params} fullWidth />}
                    />
                  </LocalizationProvider>
                </Grid>
                
                <Grid item xs={12} sm={3}>
                  <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={pl}>
                    <DatePicker
                      label="Data dostawy"
                      value={formData.deliveryDate}
                      onChange={(newDate) => {
                        setFormData(prev => ({
                          ...prev,
                          deliveryDate: newDate
                        }));
                      }}
                      renderInput={(params) => <TextField {...params} fullWidth />}
                    />
                  </LocalizationProvider>
                </Grid>
                
                <Grid item xs={12} sm={3}>
                  <FormControl fullWidth>
                    <InputLabel id="transport-type-label">Typ transportu</InputLabel>
                    <Select
                      labelId="transport-type-label"
                      id="transport-type"
                      name="transportType"
                      value={formData.transportType}
                      onChange={handleChange}
                      label="Typ transportu"
                    >
                      {Object.entries(TRANSPORT_TYPES).map(([key, value]) => (
                        <MenuItem key={key} value={value}>{value}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>
                
                {/* Przycisk do wyboru zamówienia klienta (CO) */}
                <Grid item xs={12}>
                  <Button
                    variant="outlined"
                    color="primary"
                    onClick={handleOpenOrderDialog}
                    sx={{ mt: 1 }}
                  >
                    Powiąż z CO
                  </Button>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>
        
        {/* Dialog wyboru zamówienia klienta (CO) */}
        <Dialog open={isOrderDialogOpen} onClose={handleCloseOrderDialog} maxWidth="md" fullWidth>
          <DialogTitle>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="h6">Wybierz zamówienie klienta (CO)</Typography>
              <IconButton onClick={handleRefreshOrders} disabled={isLoadingOrder} title="Odśwież listę">
                <RefreshIcon />
              </IconButton>
            </Box>
          </DialogTitle>
          <DialogContent>
            <Grid container spacing={2}>
              <Grid item xs={12} sx={{ mb: 2, mt: 1 }}>
                <TextField
                  fullWidth
                  label="Wyszukaj po numerze CO"
                  variant="outlined"
                  value={orderSearchQuery}
                  onChange={(e) => setOrderSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleFindOrderByNumber();
                    }
                  }}
                  InputProps={{
                    endAdornment: (
                      <Button 
                        onClick={handleFindOrderByNumber}
                        disabled={isLoadingOrder}
                        variant="contained"
                        size="small"
                        sx={{ ml: 1 }}
                        startIcon={<SearchIcon />}
                      >
                        Szukaj
                      </Button>
                    )
                  }}
                />
              </Grid>
              
              <Grid item xs={12}>
                {isLoadingOrder ? (
                  <Box sx={{ display: 'flex', justifyContent: 'center', my: 3 }}>
                    <CircularProgress />
                  </Box>
                ) : (
                  <Autocomplete
                    options={availableOrders}
                    getOptionLabel={(option) => `${option.orderNumber || ''} - ${option.customer?.name || ''}`}
                    onChange={(e, value) => {
                      if (value) {
                        setSelectedOrderId(value.id);
                      } else {
                        setSelectedOrderId('');
                      }
                    }}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        label="Wybierz zamówienie"
                        variant="outlined"
                        helperText={
                          availableOrders.length === 0 
                            ? "Brak zamówień. Użyj wyszukiwarki powyżej, aby znaleźć zamówienie." 
                            : "Wybierz zamówienie z listy"
                        }
                      />
                    )}
                  />
                )}
              </Grid>
              
              {/* Opcje importu danych */}
              {selectedOrderId && (
                <Grid item xs={12} sx={{ mt: 2 }}>
                  <Typography variant="subtitle2" gutterBottom>
                    Wybierz dane do zaimportowania:
                  </Typography>
                  <FormGroup>
                    <Grid container>
                      <Grid item xs={12} sm={6}>
                        <FormControlLabel 
                          control={
                            <Checkbox 
                              checked={importOptions.recipientData} 
                              onChange={handleImportOptionChange} 
                              name="recipientData" 
                            />
                          } 
                          label="Dane odbiorcy" 
                        />
                      </Grid>
                      <Grid item xs={12} sm={6}>
                        <FormControlLabel 
                          control={
                            <Checkbox 
                              checked={importOptions.deliveryPlace} 
                              onChange={handleImportOptionChange} 
                              name="deliveryPlace" 
                            />
                          } 
                          label="Miejsce dostawy" 
                        />
                      </Grid>
                      <Grid item xs={12} sm={6}>
                        <FormControlLabel 
                          control={
                            <Checkbox 
                              checked={importOptions.deliveryDate} 
                              onChange={handleImportOptionChange} 
                              name="deliveryDate" 
                            />
                          } 
                          label="Data dostawy" 
                        />
                      </Grid>
                      <Grid item xs={12} sm={6}>
                        <FormControlLabel 
                          control={
                            <Checkbox 
                              checked={importOptions.items} 
                              onChange={handleImportOptionChange} 
                              name="items" 
                            />
                          } 
                          label="Produkty" 
                        />
                      </Grid>
                      <Grid item xs={12} sm={6}>
                        <FormControlLabel 
                          control={
                            <Checkbox 
                              checked={importOptions.documents} 
                              onChange={handleImportOptionChange} 
                              name="documents" 
                            />
                          } 
                          label="Dokumenty" 
                        />
                      </Grid>
                    </Grid>
                  </FormGroup>
                </Grid>
              )}
            </Grid>
          </DialogContent>
          <DialogActions>
            <Button onClick={handleCloseOrderDialog} color="primary">
              Anuluj
            </Button>
            <Button 
              onClick={() => handleOrderSelect(selectedOrderId)} 
              color="primary" 
              variant="contained"
              disabled={!selectedOrderId || isLoadingOrder}
            >
              Uzupełnij dane
            </Button>
          </DialogActions>
        </Dialog>
        
        {/* Dialog wyboru pól nadawcy do zaimportowania */}
        <Dialog open={isSenderDialogOpen} onClose={handleCloseSenderDialog} maxWidth="sm" fullWidth>
          <DialogTitle>
            <Typography variant="h6">Wybierz dane do zaimportowania</Typography>
          </DialogTitle>
          <DialogContent>
            {isLoadingSenderData ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', my: 3 }}>
                <CircularProgress />
              </Box>
            ) : (
              <Box sx={{ mt: 2 }}>
                <Typography variant="body2" gutterBottom>
                  Wybierz, które dane nadawcy chcesz uzupełnić danymi firmy:
                </Typography>
                <FormGroup>
                  <FormControlLabel 
                    control={
                      <Checkbox 
                        checked={senderImportOptions.name} 
                        onChange={handleSenderImportOptionChange} 
                        name="name" 
                      />
                    } 
                    label="Nazwa nadawcy" 
                  />
                  <FormControlLabel 
                    control={
                      <Checkbox 
                        checked={senderImportOptions.address} 
                        onChange={handleSenderImportOptionChange} 
                        name="address" 
                      />
                    } 
                    label="Adres nadawcy" 
                  />
                  <FormControlLabel 
                    control={
                      <Checkbox 
                        checked={senderImportOptions.postalCode} 
                        onChange={handleSenderImportOptionChange} 
                        name="postalCode" 
                      />
                    } 
                    label="Kod pocztowy" 
                  />
                  <FormControlLabel 
                    control={
                      <Checkbox 
                        checked={senderImportOptions.city} 
                        onChange={handleSenderImportOptionChange} 
                        name="city" 
                      />
                    } 
                    label="Miasto" 
                  />
                  <FormControlLabel 
                    control={
                      <Checkbox 
                        checked={senderImportOptions.country} 
                        onChange={handleSenderImportOptionChange} 
                        name="country" 
                      />
                    } 
                    label="Kraj" 
                  />
                </FormGroup>
              </Box>
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={handleCloseSenderDialog} color="primary">
              Anuluj
            </Button>
            <Button 
              onClick={handleImportSenderData} 
              color="primary" 
              variant="contained"
              disabled={isLoadingSenderData}
            >
              Uzupełnij dane
            </Button>
          </DialogActions>
        </Dialog>
        
        {/* Snackbar do wyświetlania komunikatów */}
        <Snackbar 
          open={snackbarOpen} 
          autoHideDuration={6000} 
          onClose={handleCloseSnackbar}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        >
          <Alert onClose={handleCloseSnackbar} severity={snackbarSeverity} sx={{ width: '100%' }}>
            {snackbarMessage}
          </Alert>
        </Snackbar>
        
        {/* Strony */}
        <Grid item xs={12}>
          <Card>
            <CardHeader 
              title="Strony" 
              titleTypographyProps={{ variant: 'h6' }}
            />
            <Divider />
            <CardContent>
              <Grid container spacing={2}>
                {/* Nadawca */}
                <Grid item xs={12} sm={6} md={4}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                    <Typography variant="subtitle2" gutterBottom>
                      Nadawca
                    </Typography>
                    <Button 
                      variant="outlined" 
                      size="small" 
                      onClick={() => loadCompanyData(true)}
                      sx={{ ml: 1 }}
                    >
                      Uzupełnij danymi firmy
                    </Button>
                  </Box>
                  <TextField
                    label="Nazwa nadawcy"
                    name="sender"
                    value={formData.sender}
                    onChange={handleChange}
                    fullWidth
                    margin="normal"
                    error={!!formErrors.sender}
                    helperText={formErrors.sender}
                  />
                  <TextField
                    label="Adres nadawcy"
                    name="senderAddress"
                    value={formData.senderAddress}
                    onChange={handleChange}
                    fullWidth
                    margin="normal"
                    error={!!formErrors.senderAddress}
                    helperText={formErrors.senderAddress}
                  />
                  <Grid container spacing={2}>
                    <Grid item xs={6}>
                      <TextField
                        label="Kod pocztowy"
                        name="senderPostalCode"
                        value={formData.senderPostalCode}
                        onChange={handleChange}
                        fullWidth
                        margin="normal"
                      />
                    </Grid>
                    <Grid item xs={6}>
                      <TextField
                        label="Miasto"
                        name="senderCity"
                        value={formData.senderCity}
                        onChange={handleChange}
                        fullWidth
                        margin="normal"
                      />
                    </Grid>
                  </Grid>
                  <TextField
                    label="Kraj"
                    name="senderCountry"
                    value={formData.senderCountry}
                    onChange={handleChange}
                    fullWidth
                    margin="normal"
                  />
                </Grid>
                
                {/* Odbiorca */}
                <Grid item xs={12} sm={6} md={4}>
                  <Typography variant="subtitle2" gutterBottom>
                    Odbiorca
                  </Typography>
                  <TextField
                    label="Nazwa odbiorcy"
                    name="recipient"
                    value={formData.recipient}
                    onChange={handleChange}
                    fullWidth
                    margin="normal"
                    error={!!formErrors.recipient}
                    helperText={formErrors.recipient}
                  />
                  <TextField
                    label="Adres odbiorcy"
                    name="recipientAddress"
                    value={formData.recipientAddress}
                    onChange={handleChange}
                    fullWidth
                    margin="normal"
                    error={!!formErrors.recipientAddress}
                    helperText={formErrors.recipientAddress}
                  />
                  <Grid container spacing={2}>
                    <Grid item xs={6}>
                      <TextField
                        label="Kod pocztowy"
                        name="recipientPostalCode"
                        value={formData.recipientPostalCode}
                        onChange={handleChange}
                        fullWidth
                        margin="normal"
                      />
                    </Grid>
                    <Grid item xs={6}>
                      <TextField
                        label="Miasto"
                        name="recipientCity"
                        value={formData.recipientCity}
                        onChange={handleChange}
                        fullWidth
                        margin="normal"
                      />
                    </Grid>
                  </Grid>
                  <TextField
                    label="Kraj"
                    name="recipientCountry"
                    value={formData.recipientCountry}
                    onChange={handleChange}
                    fullWidth
                    margin="normal"
                  />
                </Grid>
                
                {/* Przewoźnik */}
                <Grid item xs={12} sm={6} md={4}>
                  <Typography variant="subtitle2" gutterBottom>
                    Przewoźnik
                  </Typography>
                  <TextField
                    label="Nazwa przewoźnika"
                    name="carrier"
                    value={formData.carrier}
                    onChange={handleChange}
                    fullWidth
                    margin="normal"
                    error={!!formErrors.carrier}
                    helperText={formErrors.carrier}
                  />
                  <TextField
                    label="Adres przewoźnika"
                    name="carrierAddress"
                    value={formData.carrierAddress}
                    onChange={handleChange}
                    fullWidth
                    margin="normal"
                    error={!!formErrors.carrierAddress}
                    helperText={formErrors.carrierAddress}
                  />
                  <Grid container spacing={2}>
                    <Grid item xs={6}>
                      <TextField
                        label="Kod pocztowy"
                        name="carrierPostalCode"
                        value={formData.carrierPostalCode}
                        onChange={handleChange}
                        fullWidth
                        margin="normal"
                      />
                    </Grid>
                    <Grid item xs={6}>
                      <TextField
                        label="Miasto"
                        name="carrierCity"
                        value={formData.carrierCity}
                        onChange={handleChange}
                        fullWidth
                        margin="normal"
                      />
                    </Grid>
                  </Grid>
                  <TextField
                    label="Kraj"
                    name="carrierCountry"
                    value={formData.carrierCountry}
                    onChange={handleChange}
                    fullWidth
                    margin="normal"
                  />
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>
        
        {/* Miejsce załadunku i rozładunku */}
        <Grid item xs={12}>
          <Card>
            <CardHeader 
              title="Miejsce załadunku i rozładunku" 
              titleTypographyProps={{ variant: 'h6' }}
            />
            <Divider />
            <CardContent>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                  <Typography variant="subtitle2" gutterBottom>
                    Miejsce i data załadunku
                  </Typography>
                  <TextField
                    label="Miejsce załadunku"
                    name="loadingPlace"
                    value={formData.loadingPlace}
                    onChange={handleChange}
                    fullWidth
                    margin="normal"
                  />
                  <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={pl}>
                    <DatePicker
                      label="Data załadunku"
                      value={formData.loadingDate}
                      onChange={(date) => handleDateChange('loadingDate', date)}
                      renderInput={(params) => (
                        <TextField
                          {...params}
                          fullWidth
                          margin="normal"
                        />
                      )}
                    />
                  </LocalizationProvider>
                </Grid>
                
                <Grid item xs={12} sm={6}>
                  <Typography variant="subtitle2" gutterBottom>
                    Miejsce przeznaczenia przesyłki
                  </Typography>
                  <TextField
                    label="Miejsce dostawy"
                    name="deliveryPlace"
                    value={formData.deliveryPlace}
                    onChange={handleChange}
                    fullWidth
                    margin="normal"
                  />
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>
        
        {/* Dokumenty i instrukcje */}
        <Grid item xs={12}>
          <Card>
            <CardHeader 
              title="Dokumenty i instrukcje" 
              titleTypographyProps={{ variant: 'h6' }}
            />
            <Divider />
            <CardContent>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                  <TextField
                    label="Załączone dokumenty"
                    name="attachedDocuments"
                    value={formData.attachedDocuments}
                    onChange={handleChange}
                    fullWidth
                    multiline
                    rows={3}
                    helperText="Wymień wszystkie dokumenty załączone do listu przewozowego"
                  />
                </Grid>
                
                <Grid item xs={12} sm={6}>
                  <TextField
                    label="Instrukcje nadawcy"
                    name="instructionsFromSender"
                    value={formData.instructionsFromSender}
                    onChange={handleChange}
                    fullWidth
                    multiline
                    rows={3}
                    helperText="Specjalne instrukcje od nadawcy"
                  />
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>
        
        {/* Informacje o pojeździe */}
        <Grid item xs={12}>
          <Card>
            <CardHeader 
              title="Informacje o pojeździe" 
              titleTypographyProps={{ variant: 'h6' }}
            />
            <Divider />
            <CardContent>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                  <TextField
                    label="Numer rejestracyjny pojazdu"
                    name="vehicleInfo.vehicleRegistration"
                    value={formData.vehicleInfo.vehicleRegistration}
                    onChange={(e) => {
                      setFormData(prev => ({
                        ...prev,
                        vehicleInfo: {
                          ...prev.vehicleInfo,
                          vehicleRegistration: e.target.value
                        }
                      }));
                    }}
                    fullWidth
                    margin="normal"
                  />
                </Grid>
                
                <Grid item xs={12} sm={6}>
                  <TextField
                    label="Numer rejestracyjny naczepy"
                    name="vehicleInfo.trailerRegistration"
                    value={formData.vehicleInfo.trailerRegistration}
                    onChange={(e) => {
                      setFormData(prev => ({
                        ...prev,
                        vehicleInfo: {
                          ...prev.vehicleInfo,
                          trailerRegistration: e.target.value
                        }
                      }));
                    }}
                    fullWidth
                    margin="normal"
                  />
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>
        
        {/* Elementy CMR */}
        <Grid item xs={12}>
          <Card>
            <CardHeader 
              title="Elementy dokumentu CMR" 
              titleTypographyProps={{ variant: 'h6' }}
              action={
                <Button
                  startIcon={<AddIcon />}
                  onClick={addItem}
                  color="primary"
                >
                  Dodaj pozycję
                </Button>
              }
            />
            <Divider />
            <CardContent>
              {formData.items.map((item, index) => (
                <Box key={index} sx={{ mb: 3, p: 2, borderRadius: 1, bgcolor: 'background.default' }}>
                  <Grid container spacing={2} alignItems="center">
                    <Grid item xs={12}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                        <Typography variant="subtitle2">
                          Pozycja {index + 1}
                        </Typography>
                        {formData.items.length > 1 && (
                          <IconButton 
                            color="error" 
                            onClick={() => removeItem(index)}
                            size="small"
                          >
                            <DeleteIcon />
                          </IconButton>
                        )}
                      </Box>
                    </Grid>
                    
                    <Grid item xs={12}>
                      <TextField
                        label="Opis towaru"
                        value={item.description}
                        onChange={(e) => handleItemChange(index, 'description', e.target.value)}
                        fullWidth
                        error={formErrors.items && formErrors.items[index]?.description}
                        helperText={formErrors.items && formErrors.items[index]?.description}
                      />
                    </Grid>
                    
                    <Grid item xs={12} sm={6} md={3}>
                      <TextField
                        label="Ilość"
                        value={item.quantity}
                        onChange={(e) => handleItemChange(index, 'quantity', e.target.value)}
                        fullWidth
                        type="number"
                        error={formErrors.items && formErrors.items[index]?.quantity}
                        helperText={formErrors.items && formErrors.items[index]?.quantity}
                      />
                    </Grid>
                    
                    <Grid item xs={12} sm={6} md={3}>
                      <TextField
                        label="Jednostka"
                        value={item.unit}
                        onChange={(e) => handleItemChange(index, 'unit', e.target.value)}
                        fullWidth
                        error={formErrors.items && formErrors.items[index]?.unit}
                        helperText={formErrors.items && formErrors.items[index]?.unit}
                      />
                    </Grid>
                    
                    <Grid item xs={12} sm={6} md={3}>
                      <TextField
                        label="Waga (kg)"
                        value={item.weight}
                        onChange={(e) => handleItemChange(index, 'weight', e.target.value)}
                        fullWidth
                        type="number"
                      />
                    </Grid>
                    
                    <Grid item xs={12} sm={6} md={3}>
                      <TextField
                        label="Objętość (m³)"
                        value={item.volume}
                        onChange={(e) => handleItemChange(index, 'volume', e.target.value)}
                        fullWidth
                        type="number"
                      />
                    </Grid>
                    
                    <Grid item xs={12}>
                      <TextField
                        label="Uwagi"
                        value={item.notes}
                        onChange={(e) => handleItemChange(index, 'notes', e.target.value)}
                        fullWidth
                        multiline
                        rows={2}
                      />
                    </Grid>
                  </Grid>
                </Box>
              ))}
            </CardContent>
          </Card>
        </Grid>
        
        {/* Opłaty i płatności */}
        <Grid item xs={12}>
          <Card>
            <CardHeader 
              title="Opłaty i ustalenia szczególne" 
              titleTypographyProps={{ variant: 'h6' }}
            />
            <Divider />
            <CardContent>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6} md={3}>
                  <TextField
                    label="Przewoźne"
                    name="freight"
                    value={formData.freight}
                    onChange={handleChange}
                    fullWidth
                    margin="normal"
                  />
                </Grid>
                
                <Grid item xs={12} sm={6} md={3}>
                  <TextField
                    label="Koszty dodatkowe"
                    name="carriage"
                    value={formData.carriage}
                    onChange={handleChange}
                    fullWidth
                    margin="normal"
                  />
                </Grid>
                
                <Grid item xs={12} sm={6} md={3}>
                  <TextField
                    label="Bonifikaty"
                    name="discounts"
                    value={formData.discounts}
                    onChange={handleChange}
                    fullWidth
                    margin="normal"
                  />
                </Grid>
                
                <Grid item xs={12} sm={6} md={3}>
                  <TextField
                    label="Saldo"
                    name="balance"
                    value={formData.balance}
                    onChange={handleChange}
                    fullWidth
                    margin="normal"
                  />
                </Grid>
                
                <Grid item xs={12}>
                  <FormControl fullWidth margin="normal">
                    <InputLabel>Płatność</InputLabel>
                    <Select
                      name="paymentMethod"
                      value={formData.paymentMethod}
                      onChange={handleChange}
                      label="Płatność"
                    >
                      <MenuItem value="sender">Płaci nadawca</MenuItem>
                      <MenuItem value="recipient">Płaci odbiorca</MenuItem>
                      <MenuItem value="other">Inny sposób płatności</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
                
                <Grid item xs={12}>
                  <TextField
                    label="Ustalenia szczególne"
                    name="specialAgreements"
                    value={formData.specialAgreements || ''}
                    onChange={handleChange}
                    fullWidth
                    multiline
                    rows={3}
                    margin="normal"
                  />
                </Grid>
                
                <Grid item xs={12}>
                  <TextField
                    label="Zastrzeżenia i uwagi przewoźnika"
                    name="reservations"
                    value={formData.reservations || ''}
                    onChange={handleChange}
                    fullWidth
                    multiline
                    rows={3}
                    margin="normal"
                  />
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>
        
        {/* Uwagi */}
        <Grid item xs={12}>
          <Card>
            <CardHeader 
              title="Uwagi i informacje dodatkowe" 
              titleTypographyProps={{ variant: 'h6' }}
            />
            <Divider />
            <CardContent>
              <TextField
                label="Uwagi"
                name="notes"
                value={formData.notes || ''}
                onChange={handleChange}
                fullWidth
                multiline
                rows={4}
              />
            </CardContent>
          </Card>
        </Grid>
        
        {/* Przyciski */}
        <Grid item xs={12}>
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 2 }}>
            <Button 
              variant="outlined" 
              onClick={onCancel}
            >
              Anuluj
            </Button>
            <Button 
              variant="contained" 
              color="primary" 
              type="submit"
              onClick={(e) => {
                console.log('Przycisk Zapisz kliknięty');
                handleSubmit(e);
              }}
            >
              Zapisz
            </Button>
          </Box>
        </Grid>
      </Grid>
    </form>
  );
};

export default CmrForm; 