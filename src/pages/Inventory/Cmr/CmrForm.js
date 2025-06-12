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
  FormGroup,
  Chip
} from '@mui/material';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { LocalizationProvider, DatePicker } from '@mui/x-date-pickers';
import pl from 'date-fns/locale/pl';
import { format } from 'date-fns';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import RefreshIcon from '@mui/icons-material/Refresh';
import SearchIcon from '@mui/icons-material/Search';
import LinkIcon from '@mui/icons-material/Link';
import { 
  CMR_STATUSES, 
  CMR_PAYMENT_STATUSES, 
  TRANSPORT_TYPES,
  translatePaymentStatus 
} from '../../../services/cmrService';
import { getOrderById, getAllOrders, searchOrdersByNumber } from '../../../services/orderService';
import { getCustomerById } from '../../../services/customerService';
import { getCompanyData } from '../../../services/companyService';
import BatchSelector from '../../../components/cmr/BatchSelector';

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
    notes: '',
    linkedBatches: []
  };
  
  const emptyFormData = {
    cmrNumber: '',
    issueDate: new Date(),
    deliveryDate: null,
    status: CMR_STATUSES.DRAFT,
    paymentStatus: CMR_PAYMENT_STATUSES.UNPAID,
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
  
  // Stany dla wyboru partii magazynowych
  const [batchSelectorOpen, setBatchSelectorOpen] = useState(false);
  const [currentItemIndex, setCurrentItemIndex] = useState(null);
  
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
  
  // Funkcje do obsługi wyboru partii magazynowych
  const handleOpenBatchSelector = (itemIndex) => {
    setCurrentItemIndex(itemIndex);
    setBatchSelectorOpen(true);
  };
  
  const handleCloseBatchSelector = () => {
    setBatchSelectorOpen(false);
    setCurrentItemIndex(null);
  };
  
  const handleSelectBatches = (selectedBatches) => {
    if (currentItemIndex !== null) {
      setFormData(prev => {
        const updatedItems = [...prev.items];
        updatedItems[currentItemIndex] = {
          ...updatedItems[currentItemIndex],
          linkedBatches: selectedBatches
        };
        return { ...prev, items: updatedItems };
      });
      
      showMessage(`Powiązano ${selectedBatches.length} partii z pozycją ${currentItemIndex + 1}`, 'success');
    }
  };
  
  const handleRemoveBatch = (itemIndex, batchId) => {
    setFormData(prev => {
      const updatedItems = [...prev.items];
      updatedItems[itemIndex] = {
        ...updatedItems[itemIndex],
        linkedBatches: updatedItems[itemIndex].linkedBatches.filter(batch => batch.id !== batchId)
      };
      return { ...prev, items: updatedItems };
    });
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
      // Funkcja pomocnicza do konwersji dat
      const convertDate = (dateValue) => {
        console.log('CmrForm convertDate - wejście:', dateValue, 'typ:', typeof dateValue);
        
        if (!dateValue) {
          console.log('CmrForm convertDate - brak wartości, zwracam null');
          return null;
        }
        
        // Jeśli to już obiekt Date
        if (dateValue instanceof Date) {
          console.log('CmrForm convertDate - już obiekt Date:', dateValue);
          return dateValue;
        }
        
        // Obsługa timestampu Firestore
        if (dateValue && typeof dateValue === 'object' && typeof dateValue.toDate === 'function') {
          const converted = dateValue.toDate();
          console.log('CmrForm convertDate - skonwertowano Firestore Timestamp:', converted);
          return converted;
        }
        
        // Obsługa obiektów z sekundami (Firestore Timestamp format)
        if (dateValue && typeof dateValue === 'object' && dateValue.seconds) {
          const converted = new Date(dateValue.seconds * 1000);
          console.log('CmrForm convertDate - skonwertowano obiekt z sekundami:', converted);
          return converted;
        }
        
        // Obsługa stringów i innych formatów
        try {
          const converted = new Date(dateValue);
          console.log('CmrForm convertDate - skonwertowano string/inne:', converted);
          return converted;
        } catch (e) {
          console.warn('CmrForm convertDate - Nie można skonwertować daty:', dateValue, e);
          return null;
        }
      };
      
      console.log('CmrForm - initialData:', initialData);
      
      // Konwertuj daty z różnych formatów na obiekty Date
      const processedData = {
        ...initialData,
        issueDate: convertDate(initialData.issueDate) || new Date(),
        deliveryDate: convertDate(initialData.deliveryDate),
        loadingDate: convertDate(initialData.loadingDate),
        items: initialData.items && initialData.items.length > 0 
          ? initialData.items 
          : [{ ...emptyItem }]
      };
      
      console.log('CmrForm - processedData po konwersji dat:', processedData);
      
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
    console.log('CmrForm handleDateChange - pole:', name, 'nowa wartość:', date, 'typ:', typeof date);
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
    console.log('CmrForm handleSubmit - daty w formData:', {
      issueDate: formData.issueDate,
      deliveryDate: formData.deliveryDate,
      loadingDate: formData.loadingDate
    });
    
    // Upewnij się, że wszystkie pola są poprawnie uwzględnione przed wysłaniem formularza
    const dataToSubmit = {
      ...formData,
      // Upewnij się, że te pola są poprawnie przekazywane
      specialAgreements: formData.specialAgreements || '',
      reservations: formData.reservations || '',
      notes: formData.notes || ''
    };
    
    console.log('CmrForm handleSubmit - daty w dataToSubmit:', {
      issueDate: dataToSubmit.issueDate,
      deliveryDate: dataToSubmit.deliveryDate,
      loadingDate: dataToSubmit.loadingDate
    });
    
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
    <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={pl}>
      <Grid container spacing={3}>
        
        {/* Dialog wyboru zamówienia klienta (CO) */}
        <Dialog open={isOrderDialogOpen} onClose={handleCloseOrderDialog} maxWidth="md" fullWidth>
          <DialogTitle>Wybierz zamówienie klienta (CO)</DialogTitle>
          <DialogContent>
            <Box sx={{ mb: 2 }}>
                <TextField
                label="Szukaj po numerze zamówienia"
                  value={orderSearchQuery}
                  onChange={(e) => setOrderSearchQuery(e.target.value)}
                fullWidth
                  InputProps={{
                    endAdornment: (
                    <Box>
                      <IconButton onClick={handleFindOrderByNumber}>
                        <SearchIcon />
                      </IconButton>
                      <IconButton onClick={handleRefreshOrders}>
                        <RefreshIcon />
                      </IconButton>
                    </Box>
                    )
                  }}
                />
                  </Box>
            
            {/* Opcje importu */}
                  <FormGroup>
              <Typography variant="h6" sx={{ mb: 1 }}>
                Wybierz dane do importu:
              </Typography>
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
                        <FormControlLabel 
                          control={
                            <Checkbox 
                              checked={importOptions.items} 
                              onChange={handleImportOptionChange} 
                              name="items" 
                            />
                          } 
                label="Pozycje zamówienia"
                        />
                        <FormControlLabel 
                          control={
                            <Checkbox 
                              checked={importOptions.documents} 
                              onChange={handleImportOptionChange} 
                              name="documents" 
                            />
                          } 
                label="Informacje o dokumentach"
                        />
                  </FormGroup>
            
            {isLoadingOrder ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', my: 4 }}>
                <CircularProgress />
              </Box>
            ) : (
              <Box sx={{ maxHeight: 300, overflow: 'auto', mt: 2 }}>
                {availableOrders.map(order => (
                  <Box 
                    key={order.id}
                    sx={{ 
                      p: 2, 
                      border: '1px solid #ddd', 
                      borderRadius: 1, 
                      mb: 1,
                      cursor: 'pointer',
                      '&:hover': { bgcolor: 'grey.100' }
                    }}
                    onClick={() => handleOrderSelect(order.id)}
                  >
                    <Typography variant="subtitle2">
                      Zamówienie: {order.orderNumber}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Klient: {order.customerName}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Data: {order.orderDate?.toDate?.()?.toLocaleDateString?.('pl-PL') || 'Brak daty'}
                    </Typography>
                  </Box>
                ))}
              </Box>
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={handleCloseOrderDialog}>Anuluj</Button>
          </DialogActions>
        </Dialog>
        
        {/* Dialog wyboru danych nadawcy */}
        <Dialog open={isSenderDialogOpen} onClose={handleCloseSenderDialog} maxWidth="sm" fullWidth>
          <DialogTitle>Importuj dane firmy</DialogTitle>
          <DialogContent>
                <FormGroup>
              <Typography variant="h6" sx={{ mb: 1 }}>
                Wybierz dane do importu:
              </Typography>
                  <FormControlLabel 
                    control={
                      <Checkbox 
                        checked={senderImportOptions.name} 
                        onChange={handleSenderImportOptionChange} 
                        name="name" 
                      />
                    } 
                label="Nazwa firmy"
                  />
                  <FormControlLabel 
                    control={
                      <Checkbox 
                        checked={senderImportOptions.address} 
                        onChange={handleSenderImportOptionChange} 
                        name="address" 
                      />
                    } 
                label="Adres"
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
          </DialogContent>
          <DialogActions>
            <Button onClick={handleCloseSenderDialog}>Anuluj</Button>
            <Button 
              onClick={handleImportSenderData} 
              variant="contained"
              disabled={isLoadingSenderData}
            >
              {isLoadingSenderData ? <CircularProgress size={20} /> : 'Importuj dane'}
            </Button>
          </DialogActions>
        </Dialog>
        
        <form onSubmit={handleSubmit} style={{ width: '100%' }}>
          <Grid container spacing={3}>
        
            {/* Status i podstawowe informacje */}
        <Grid item xs={12}>
          <Card>
            <CardHeader 
                  title="Podstawowe informacje" 
              titleTypographyProps={{ variant: 'h6' }}
            />
            <Divider />
            <CardContent>
              <Grid container spacing={2}>
                    <Grid item xs={12} sm={6}>
                      <TextField
                        label="Numer CMR"
                        name="cmrNumber"
                        value={formData.cmrNumber}
                        onChange={handleChange}
                        fullWidth
                        margin="normal"
                        error={formErrors.cmrNumber}
                        helperText={formErrors.cmrNumber}
                      />
                    </Grid>
                    
                    <Grid item xs={12} sm={6}>
                      <FormControl fullWidth margin="normal">
                        <InputLabel>Status</InputLabel>
                        <Select
                          name="status"
                          value={formData.status}
                          onChange={handleChange}
                          label="Status"
                        >
                          {Object.entries(CMR_STATUSES).map(([key, value]) => (
                            <MenuItem key={key} value={value}>{value}</MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    </Grid>
                    
                    <Grid item xs={12} sm={6}>
                      <FormControl fullWidth margin="normal">
                        <InputLabel>Status płatności</InputLabel>
                        <Select
                          name="paymentStatus"
                          value={formData.paymentStatus}
                          onChange={handleChange}
                          label="Status płatności"
                        >
                          <MenuItem value={CMR_PAYMENT_STATUSES.UNPAID}>
                            {translatePaymentStatus(CMR_PAYMENT_STATUSES.UNPAID)}
                          </MenuItem>
                          <MenuItem value={CMR_PAYMENT_STATUSES.PAID}>
                            {translatePaymentStatus(CMR_PAYMENT_STATUSES.PAID)}
                          </MenuItem>
                        </Select>
                      </FormControl>
                    </Grid>
                    
                    <Grid item xs={12} sm={6}>
                      <DatePicker
                        label="Data wystawienia"
                        value={formData.issueDate}
                        onChange={(date) => handleDateChange('issueDate', date)}
                        slots={{
                          textField: TextField
                        }}
                        slotProps={{
                          textField: {
                            fullWidth: true,
                            margin: "normal",
                            error: !!formErrors.issueDate,
                            helperText: formErrors.issueDate
                          }
                        }}
                      />
                    </Grid>
                    
                    <Grid item xs={12} sm={6}>
                      <DatePicker
                        label="Data dostawy"
                        value={formData.deliveryDate}
                        onChange={(date) => handleDateChange('deliveryDate', date)}
                        slots={{
                          textField: TextField
                        }}
                        slotProps={{
                          textField: {
                            fullWidth: true,
                            margin: "normal"
                          }
                        }}
                      />
                    </Grid>
                    
                    <Grid item xs={12} sm={6}>
                      <FormControl fullWidth margin="normal">
                        <InputLabel>Typ transportu</InputLabel>
                        <Select
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
                    
                    <Grid item xs={12} sm={6}>
                      <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button 
                      variant="outlined" 
                      size="small" 
                          onClick={handleOpenOrderDialog}
                        >
                          Użyj danych z CO
                        </Button>
                        
                        <Button 
                          variant="outlined" 
                          size="small"
                          onClick={handleOpenSenderDialog}
                    >
                          Użyj danych firmy
                    </Button>
                  </Box>
                    </Grid>
                  </Grid>
                </CardContent>
              </Card>
            </Grid>
            
            {/* Dane nadawcy */}
            <Grid item xs={12}>
              <Card>
                <CardHeader 
                  title="Dane nadawcy" 
                  titleTypographyProps={{ variant: 'h6' }}
                />
                <Divider />
                <CardContent>
                  <Grid container spacing={2}>
                    <Grid item xs={12}>
                  <TextField
                    label="Nazwa nadawcy"
                    name="sender"
                    value={formData.sender}
                    onChange={handleChange}
                    fullWidth
                    margin="normal"
                        error={formErrors.sender}
                    helperText={formErrors.sender}
                  />
                    </Grid>
                    
                    <Grid item xs={12}>
                  <TextField
                    label="Adres nadawcy"
                    name="senderAddress"
                    value={formData.senderAddress}
                    onChange={handleChange}
                    fullWidth
                    margin="normal"
                  />
                    </Grid>
                    
                    <Grid item xs={12} sm={4}>
                      <TextField
                        label="Kod pocztowy nadawcy"
                        name="senderPostalCode"
                        value={formData.senderPostalCode}
                        onChange={handleChange}
                        fullWidth
                        margin="normal"
                      />
                    </Grid>
                    
                    <Grid item xs={12} sm={4}>
                      <TextField
                        label="Miasto nadawcy"
                        name="senderCity"
                        value={formData.senderCity}
                        onChange={handleChange}
                        fullWidth
                        margin="normal"
                      />
                    </Grid>
                    
                    <Grid item xs={12} sm={4}>
                  <TextField
                        label="Kraj nadawcy"
                    name="senderCountry"
                    value={formData.senderCountry}
                    onChange={handleChange}
                    fullWidth
                    margin="normal"
                  />
                    </Grid>
                  </Grid>
                </CardContent>
              </Card>
                </Grid>
                
            {/* Dane odbiorcy */}
            <Grid item xs={12}>
              <Card>
                <CardHeader 
                  title="Dane odbiorcy" 
                  titleTypographyProps={{ variant: 'h6' }}
                />
                <Divider />
                <CardContent>
                  <Grid container spacing={2}>
                    <Grid item xs={12}>
                  <TextField
                    label="Nazwa odbiorcy"
                    name="recipient"
                    value={formData.recipient}
                    onChange={handleChange}
                    fullWidth
                    margin="normal"
                        error={formErrors.recipient}
                    helperText={formErrors.recipient}
                  />
                    </Grid>
                    
                    <Grid item xs={12}>
                  <TextField
                    label="Adres odbiorcy"
                    name="recipientAddress"
                    value={formData.recipientAddress}
                    onChange={handleChange}
                    fullWidth
                    margin="normal"
                  />
                    </Grid>
                    
                    <Grid item xs={12} sm={4}>
                      <TextField
                        label="Kod pocztowy odbiorcy"
                        name="recipientPostalCode"
                        value={formData.recipientPostalCode}
                        onChange={handleChange}
                        fullWidth
                        margin="normal"
                      />
                    </Grid>
                    
                    <Grid item xs={12} sm={4}>
                      <TextField
                        label="Miasto odbiorcy"
                        name="recipientCity"
                        value={formData.recipientCity}
                        onChange={handleChange}
                        fullWidth
                        margin="normal"
                      />
                    </Grid>
                    
                    <Grid item xs={12} sm={4}>
                  <TextField
                        label="Kraj odbiorcy"
                    name="recipientCountry"
                    value={formData.recipientCountry}
                    onChange={handleChange}
                    fullWidth
                    margin="normal"
                  />
                    </Grid>
                  </Grid>
                </CardContent>
              </Card>
                </Grid>
                
            {/* Dane przewoźnika */}
            <Grid item xs={12}>
              <Card>
                <CardHeader 
                  title="Dane przewoźnika" 
                  titleTypographyProps={{ variant: 'h6' }}
                />
                <Divider />
                <CardContent>
                  <Grid container spacing={2}>
                    <Grid item xs={12}>
                  <TextField
                    label="Nazwa przewoźnika"
                    name="carrier"
                    value={formData.carrier}
                    onChange={handleChange}
                    fullWidth
                    margin="normal"
                  />
                    </Grid>
                    
                    <Grid item xs={12}>
                  <TextField
                    label="Adres przewoźnika"
                    name="carrierAddress"
                    value={formData.carrierAddress}
                    onChange={handleChange}
                    fullWidth
                    margin="normal"
                  />
                    </Grid>
                    
                    <Grid item xs={12} sm={4}>
                      <TextField
                        label="Kod pocztowy przewoźnika"
                        name="carrierPostalCode"
                        value={formData.carrierPostalCode}
                        onChange={handleChange}
                        fullWidth
                        margin="normal"
                      />
                    </Grid>
                    
                    <Grid item xs={12} sm={4}>
                      <TextField
                        label="Miasto przewoźnika"
                        name="carrierCity"
                        value={formData.carrierCity}
                        onChange={handleChange}
                        fullWidth
                        margin="normal"
                      />
                    </Grid>
                    
                    <Grid item xs={12} sm={4}>
                  <TextField
                        label="Kraj przewoźnika"
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
                  <TextField
                    label="Miejsce załadunku"
                    name="loadingPlace"
                    value={formData.loadingPlace}
                    onChange={handleChange}
                    fullWidth
                    margin="normal"
                  />
                    </Grid>
                    
                    <Grid item xs={12} sm={6}>
                    <DatePicker
                      label="Data załadunku"
                      value={formData.loadingDate}
                      onChange={(date) => handleDateChange('loadingDate', date)}
                      slots={{
                        textField: TextField
                      }}
                      slotProps={{
                        textField: {
                          fullWidth: true,
                          margin: "normal"
                        }
                      }}
                    />
                </Grid>
                
                    <Grid item xs={12}>
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
                        
                        {/* Powiązanie z partiami magazynowymi */}
                        <Grid item xs={12}>
                          <Box sx={{ mt: 2 }}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                              <Typography variant="subtitle2" color="text.secondary">
                                Powiązane partie magazynowe
                              </Typography>
                              <Button
                                size="small"
                                variant="outlined"
                                startIcon={<LinkIcon />}
                                onClick={() => handleOpenBatchSelector(index)}
                              >
                                Wybierz partie
                              </Button>
                            </Box>
                            
                            {/* Wyświetlanie powiązanych partii */}
                            {item.linkedBatches && item.linkedBatches.length > 0 ? (
                              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1 }}>
                                {item.linkedBatches.map((batch) => (
                                  <Chip
                                    key={batch.id}
                                    label={`${batch.batchNumber || batch.lotNumber || 'Bez numeru'} (${batch.quantity} ${batch.unit || 'szt.'})`}
                                    variant="outlined"
                                    size="small"
                                    onDelete={() => handleRemoveBatch(index, batch.id)}
                                    color="primary"
                                  />
                                ))}
                              </Box>
                            ) : (
                              <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                                Brak powiązanych partii
                              </Typography>
                            )}
                          </Box>
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
        
        {/* Dialog wyboru partii magazynowych */}
        <BatchSelector
          open={batchSelectorOpen}
          onClose={handleCloseBatchSelector}
          onSelectBatches={handleSelectBatches}
          selectedBatches={currentItemIndex !== null ? formData.items[currentItemIndex]?.linkedBatches || [] : []}
          itemDescription={currentItemIndex !== null ? formData.items[currentItemIndex]?.description || '' : ''}
        />
        
        {/* Snackbar dla komunikatów */}
        <Snackbar
          open={snackbarOpen}
          autoHideDuration={6000}
          onClose={handleCloseSnackbar}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        >
          <Alert onClose={handleCloseSnackbar} severity={snackbarSeverity} sx={{ width: '100%' }}>
            {snackbarMessage}
          </Alert>
        </Snackbar>
      </Grid>
    </LocalizationProvider>
  );
};

export default CmrForm; 