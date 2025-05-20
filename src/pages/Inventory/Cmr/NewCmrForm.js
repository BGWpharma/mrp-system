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
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper
} from '@mui/material';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { LocalizationProvider, DatePicker } from '@mui/x-date-pickers';
import pl from 'date-fns/locale/pl';
import { format } from 'date-fns';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import RefreshIcon from '@mui/icons-material/Refresh';
import SearchIcon from '@mui/icons-material/Search';
import VisibilityIcon from '@mui/icons-material/Visibility';
import { getOrderById, searchOrdersByNumber } from '../../../services/orderService';
import { getCustomerById } from '../../../services/customerService';
import { getCompanyData } from '../../../services/companyService';

/**
 * Nowy komponent formularza CMR oparty na oficjalnym dokumencie.
 * 
 * @param {Object} initialData - Początkowe dane formularza
 * @param {Function} onSubmit - Funkcja wywołana po zapisaniu formularza
 * @param {Function} onCancel - Funkcja wywołana po anulowaniu edycji
 * @returns {JSX.Element} Formularz CMR
 */
const NewCmrForm = ({ initialData, onSubmit, onCancel }) => {
  const emptyItem = {
    marks: '',               // Pole 6 - Znaki i numery
    numberOfPackages: '',    // Pole 7 - Ilość sztuk
    packagingMethod: '',     // Pole 8 - Sposób pakowania 
    description: '',         // Pole 9 - Rodzaj towaru
    weight: '',              // Pole 11 - Waga brutto w kg
    volume: ''               // Pole 12 - Objętość w m³
  };
  
  const emptyFormData = {
    cmrNumber: '',           // Numer CMR (generowany automatycznie)
    issueDate: new Date(),   // Data wystawienia (pole 21)
    copies: '',              // Liczba egzemplarzy
    
    // Pole 1 - Nadawca
    sender: '',              // Nazwa nadawcy
    senderAddress: '',       // Adres nadawcy
    senderPostalCode: '',    // Kod pocztowy nadawcy
    senderCity: '',          // Miasto nadawcy
    senderCountry: '',       // Kraj nadawcy
    
    // Pole 2 - Odbiorca
    recipient: '',           // Nazwa odbiorcy
    recipientAddress: '',    // Adres odbiorcy
    recipientPostalCode: '', // Kod pocztowy odbiorcy
    recipientCity: '',       // Miasto odbiorcy
    recipientCountry: '',    // Kraj odbiorcy
    
    // Pole 3 - Miejsce przeznaczenia
    deliveryPlace: '',       // Miejsce dostawy
    deliveryPostalCode: '',  // Kod pocztowy miejsca dostawy
    deliveryCity: '',        // Miasto dostawy
    deliveryCountry: '',     // Kraj dostawy
    
    // Pole 4 - Miejsce i data załadunku
    loadingPlace: '',        // Miejsce załadunku
    loadingDate: new Date(), // Data załadunku
    
    // Pole 5 - Dokumenty załączone
    attachedDocuments: '',   // Załączone dokumenty
    
    // Pole 13 - Instrukcje nadawcy
    senderInstructions: '',  // Instrukcje nadawcy
    
    // Pozycje dokumentu (pola 6-12)
    items: [{ ...emptyItem }]
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
  
  // Dodane stany dla podglądu dokumentu
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  
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
  
  useEffect(() => {
    if (initialData) {
      // Konwertuj daty z ISO String (jeśli są) na obiekty Date
      const processedData = {
        ...initialData,
        issueDate: initialData.issueDate ? new Date(initialData.issueDate) : new Date(),
        loadingDate: initialData.loadingDate ? new Date(initialData.loadingDate) : new Date(),
        items: initialData.items && initialData.items.length > 0 
          ? initialData.items 
          : [{ ...emptyItem }]
      };
      
      setFormData(processedData);
    }
    
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
    
    // Wymagane pola podstawowe zgodnie z dokumentem CMR
    if (!formData.sender) errors.sender = 'Nadawca jest wymagany';
    if (!formData.senderAddress) errors.senderAddress = 'Adres nadawcy jest wymagany';
    if (!formData.recipient) errors.recipient = 'Odbiorca jest wymagany';
    if (!formData.recipientAddress) errors.recipientAddress = 'Adres odbiorcy jest wymagany';
    if (!formData.deliveryPlace) errors.deliveryPlace = 'Miejsce dostawy jest wymagane';
    if (!formData.loadingPlace) errors.loadingPlace = 'Miejsce załadunku jest wymagane';
    
    // Walidacja dat
    if (!formData.issueDate) errors.issueDate = 'Data wystawienia jest wymagana';
    if (!formData.loadingDate) errors.loadingDate = 'Data załadunku jest wymagana';
    
    // Walidacja przedmiotów
    const itemErrors = [];
    formData.items.forEach((item, index) => {
      const itemError = {};
      if (!item.description) itemError.description = 'Opis towaru jest wymagany';
      if (!item.numberOfPackages) itemError.numberOfPackages = 'Ilość sztuk jest wymagana';
      if (!item.packagingMethod) itemError.packagingMethod = 'Sposób pakowania jest wymagany';
      
      if (Object.keys(itemError).length > 0) {
        itemErrors[index] = itemError;
      }
    });
    
    if (itemErrors.length > 0 && itemErrors.some(item => item !== undefined)) {
      errors.items = itemErrors;
    }
    
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };
  
  const handleSubmit = (e) => {
    e.preventDefault();
    console.log('Próba wysłania formularza CMR:', formData);
    
    // Walidacja formularza
    const isValid = validateForm();
    if (!isValid) {
      showMessage('Formularz zawiera błędy. Popraw zaznaczone pola.', 'error');
      return;
    }
    
    try {
      onSubmit(formData);
      showMessage('Dokument CMR został zapisany pomyślnie', 'success');
    } catch (error) {
      console.error('Błąd podczas próby zapisania dokumentu CMR:', error);
      showMessage('Wystąpił błąd podczas zapisywania dokumentu CMR', 'error');
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
            if (extractedData.postalCode) updatedForm.recipientPostalCode = extractedData.postalCode;
            if (extractedData.city) updatedForm.recipientCity = extractedData.city;
          }
          
          importedDataSummary.push('Dane odbiorcy');
        }
        
        // Miejsce dostawy
        if (importOptions.deliveryPlace) {
          // Dane miejsca dostawy
          updatedForm.deliveryPlace = order.shippingAddress || customerData.shippingAddress || customerData.address || '';
          updatedForm.deliveryPostalCode = customerData.postalCode || '';
          updatedForm.deliveryCity = customerData.city || '';
          updatedForm.deliveryCountry = customerData.country || '';
          
          importedDataSummary.push('Miejsce dostawy');
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
            marks: item.productCode || '',
            numberOfPackages: item.quantity || '',
            packagingMethod: 'szt.',
            description: item.name || '',
            weight: item.weight || '',
            volume: item.volume || ''
          }));
          importedDataSummary.push(`${order.items.length} pozycji`);
        }
        
        return updatedForm;
      });
      
      // Wyświetl podsumowanie pobranych danych
      const summaryMessage = `Pomyślnie uzupełniono dane z zamówienia ${order.orderNumber}. 
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
  
  // Pomocnicza funkcja do ekstrakcji szczegółów adresowych
  const extractAddressDetails = (fullAddress) => {
    if (!fullAddress) return {};
    
    // Próba wyodrębnienia kodu pocztowego i miasta
    // Typowy format polskiego adresu: "ul. Przykładowa 123, 00-000 Miasto"
    const postalCodeMatch = fullAddress.match(/(\d{2}-\d{3})\s+([^,]+)/);
    if (postalCodeMatch) {
      return {
        postalCode: postalCodeMatch[1],
        city: postalCodeMatch[2]
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
      // Wyszukaj zamówienia po numerze
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
          senderCountry: companyData.country || 'Polska', // Domyślnie ustawiamy Polska
          
          // Domyślnie możemy też ustawić miejsce załadunku jako adres firmy
          loadingPlace: companyData.address || '',
          loadingPostalCode: postalCode || companyData.postalCode || '',
          loadingCity: city || companyData.city || '',
          loadingCountry: companyData.country || 'Polska'
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
  
  // Funkcja do obsługi podglądu dokumentu
  const handleOpenPreview = () => {
    setIsPreviewOpen(true);
  };
  
  // Funkcja do zamykania podglądu dokumentu
  const handleClosePreview = () => {
    setIsPreviewOpen(false);
  };
  
  return (
    <form onSubmit={(e) => e.preventDefault()}>
      <Grid container spacing={3}>
        {/* Informacje podstawowe */}
        <Grid item xs={12}>
          <Card>
            <CardHeader 
              title="Informacje podstawowe" 
              titleTypographyProps={{ variant: 'h6' }}
            />
            <Divider />
            <CardContent>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={4}>
                  <TextField
                    label="Numer CMR"
                    name="cmrNumber"
                    value={formData.cmrNumber}
                    onChange={handleChange}
                    fullWidth
                    disabled={true}
                    helperText="Numer zostanie wygenerowany automatycznie"
                    size="small"
                  />
                </Grid>
                
                <Grid item xs={12} sm={4}>
                  <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={pl}>
                    <DatePicker
                      label="Data wystawienia"
                      value={formData.issueDate}
                      onChange={(newDate) => handleDateChange('issueDate', newDate)}
                      renderInput={(params) => <TextField {...params} fullWidth size="small" />}
                    />
                  </LocalizationProvider>
                </Grid>
                
                <Grid item xs={12} sm={4}>
                  <FormControl fullWidth size="small">
                    <InputLabel id="status-label">Status</InputLabel>
                    <Select
                      labelId="status-label"
                      id="status"
                      value="roboczy"
                      label="Status"
                      disabled
                    >
                      <MenuItem value="roboczy">Roboczy</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
                
                <Grid item xs={12}>
                  <Button
                    variant="outlined"
                    color="primary"
                    onClick={handleOpenOrderDialog}
                    size="small"
                  >
                    Uzupełnij na podstawie CO
                  </Button>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>
        
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
                {/* Pole 1 - Nadawca */}
                <Grid item xs={12} md={6}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                    <Typography variant="subtitle2">
                      Nadawca
                    </Typography>
                    <Button 
                      variant="outlined" 
                      size="small" 
                      onClick={() => loadCompanyData(true)}
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
                    margin="dense"
                    error={!!formErrors.sender}
                    helperText={formErrors.sender}
                    size="small"
                  />
                  <TextField
                    label="Adres nadawcy"
                    name="senderAddress"
                    value={formData.senderAddress}
                    onChange={handleChange}
                    fullWidth
                    margin="dense"
                    error={!!formErrors.senderAddress}
                    helperText={formErrors.senderAddress}
                    size="small"
                  />
                  <Grid container spacing={2}>
                    <Grid item xs={6}>
                      <TextField
                        label="Kod pocztowy"
                        name="senderPostalCode"
                        value={formData.senderPostalCode}
                        onChange={handleChange}
                        fullWidth
                        margin="dense"
                        size="small"
                      />
                    </Grid>
                    <Grid item xs={6}>
                      <TextField
                        label="Miasto"
                        name="senderCity"
                        value={formData.senderCity}
                        onChange={handleChange}
                        fullWidth
                        margin="dense"
                        size="small"
                      />
                    </Grid>
                  </Grid>
                  <TextField
                    label="Kraj"
                    name="senderCountry"
                    value={formData.senderCountry}
                    onChange={handleChange}
                    fullWidth
                    margin="dense"
                    size="small"
                  />
                </Grid>
                
                {/* Pole 2 - Odbiorca */}
                <Grid item xs={12} md={6}>
                  <Typography variant="subtitle2" gutterBottom>
                    Odbiorca
                  </Typography>
                  <TextField
                    label="Nazwa odbiorcy"
                    name="recipient"
                    value={formData.recipient}
                    onChange={handleChange}
                    fullWidth
                    margin="dense"
                    error={!!formErrors.recipient}
                    helperText={formErrors.recipient}
                    size="small"
                  />
                  <TextField
                    label="Adres odbiorcy"
                    name="recipientAddress"
                    value={formData.recipientAddress}
                    onChange={handleChange}
                    fullWidth
                    margin="dense"
                    error={!!formErrors.recipientAddress}
                    helperText={formErrors.recipientAddress}
                    size="small"
                  />
                  <Grid container spacing={2}>
                    <Grid item xs={6}>
                      <TextField
                        label="Kod pocztowy"
                        name="recipientPostalCode"
                        value={formData.recipientPostalCode}
                        onChange={handleChange}
                        fullWidth
                        margin="dense"
                        size="small"
                      />
                    </Grid>
                    <Grid item xs={6}>
                      <TextField
                        label="Miasto"
                        name="recipientCity"
                        value={formData.recipientCity}
                        onChange={handleChange}
                        fullWidth
                        margin="dense"
                        size="small"
                      />
                    </Grid>
                  </Grid>
                  <TextField
                    label="Kraj"
                    name="recipientCountry"
                    value={formData.recipientCountry}
                    onChange={handleChange}
                    fullWidth
                    margin="dense"
                    size="small"
                  />
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>
        
        {/* Miejsca załadunku i rozładunku */}
        <Grid item xs={12}>
          <Card>
            <CardHeader 
              title="Miejsca załadunku i rozładunku" 
              titleTypographyProps={{ variant: 'h6' }}
            />
            <Divider />
            <CardContent>
              <Grid container spacing={2}>
                {/* Pole 3 - Miejsce przeznaczenia */}
                <Grid item xs={12} md={6}>
                  <Typography variant="subtitle2" gutterBottom>
                    Miejsce przeznaczenia
                  </Typography>
                  <TextField
                    label="Adres dostawy"
                    name="deliveryPlace"
                    value={formData.deliveryPlace}
                    onChange={handleChange}
                    fullWidth
                    margin="dense"
                    error={!!formErrors.deliveryPlace}
                    helperText={formErrors.deliveryPlace}
                    size="small"
                  />
                  <Grid container spacing={2}>
                    <Grid item xs={6}>
                      <TextField
                        label="Kod pocztowy"
                        name="deliveryPostalCode"
                        value={formData.deliveryPostalCode}
                        onChange={handleChange}
                        fullWidth
                        margin="dense"
                        size="small"
                      />
                    </Grid>
                    <Grid item xs={6}>
                      <TextField
                        label="Miasto"
                        name="deliveryCity"
                        value={formData.deliveryCity}
                        onChange={handleChange}
                        fullWidth
                        margin="dense"
                        size="small"
                      />
                    </Grid>
                  </Grid>
                  <TextField
                    label="Kraj"
                    name="deliveryCountry"
                    value={formData.deliveryCountry}
                    onChange={handleChange}
                    fullWidth
                    margin="dense"
                    size="small"
                  />
                </Grid>
                
                {/* Pole 4 - Miejsce i data załadunku */}
                <Grid item xs={12} md={6}>
                  <Typography variant="subtitle2" gutterBottom>
                    Miejsce i data załadunku
                  </Typography>
                  <TextField
                    label="Adres załadunku"
                    name="loadingPlace"
                    value={formData.loadingPlace}
                    onChange={handleChange}
                    fullWidth
                    margin="dense"
                    error={!!formErrors.loadingPlace}
                    helperText={formErrors.loadingPlace}
                    size="small"
                  />
                  <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={pl}>
                    <DatePicker
                      label="Data załadunku"
                      value={formData.loadingDate}
                      onChange={(newDate) => handleDateChange('loadingDate', newDate)}
                      renderInput={(params) => <TextField 
                        {...params} 
                        fullWidth 
                        margin="dense"
                        error={!!formErrors.loadingDate}
                        helperText={formErrors.loadingDate}
                        size="small"
                      />}
                    />
                  </LocalizationProvider>
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
                {/* Pole 5 - Dokumenty załączone */}
                <Grid item xs={12} md={6}>
                  <Typography variant="subtitle2" gutterBottom>
                    Załączone dokumenty
                  </Typography>
                  <TextField
                    label="Załączone dokumenty"
                    name="attachedDocuments"
                    value={formData.attachedDocuments}
                    onChange={handleChange}
                    fullWidth
                    multiline
                    rows={2}
                    margin="dense"
                    helperText="Wymień wszystkie dokumenty załączone do listu przewozowego"
                    size="small"
                  />
                </Grid>
                
                {/* Pole 13 - Instrukcje nadawcy */}
                <Grid item xs={12} md={6}>
                  <Typography variant="subtitle2" gutterBottom>
                    Instrukcje nadawcy
                  </Typography>
                  <TextField
                    label="Instrukcje nadawcy"
                    name="senderInstructions"
                    value={formData.senderInstructions}
                    onChange={handleChange}
                    fullWidth
                    multiline
                    rows={2}
                    margin="dense"
                    helperText="Specjalne instrukcje od nadawcy"
                    size="small"
                  />
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>
        
        {/* Towary - pola 6-12 */}
        <Grid item xs={12}>
          <Card>
            <CardHeader 
              title="Towary - dokumenty CMR pola 6-12" 
              titleTypographyProps={{ variant: 'h6' }}
              action={
                <Button
                  startIcon={<AddIcon />}
                  onClick={addItem}
                  color="primary"
                  size="small"
                >
                  Dodaj pozycję
                </Button>
              }
            />
            <Divider />
            <CardContent>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell width="5%">LP</TableCell>
                      <TableCell width="15%">Znaki i numery (6)</TableCell>
                      <TableCell width="10%">Ilość sztuk (7)</TableCell>
                      <TableCell width="15%">Sposób pakowania (8)</TableCell>
                      <TableCell width="25%">Rodzaj towaru (9)</TableCell>
                      <TableCell width="10%">Waga brutto kg (11)</TableCell>
                      <TableCell width="10%">Objętość m³ (12)</TableCell>
                      <TableCell width="10%">Akcje</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {formData.items.map((item, index) => (
                      <TableRow key={index}>
                        <TableCell>{index + 1}</TableCell>
                        <TableCell>
                          <TextField
                            value={item.marks}
                            onChange={(e) => handleItemChange(index, 'marks', e.target.value)}
                            fullWidth
                            size="small"
                            variant="outlined"
                          />
                        </TableCell>
                        <TableCell>
                          <TextField
                            value={item.numberOfPackages}
                            onChange={(e) => handleItemChange(index, 'numberOfPackages', e.target.value)}
                            fullWidth
                            type="number"
                            size="small"
                            variant="outlined"
                            error={formErrors.items && formErrors.items[index]?.numberOfPackages}
                          />
                        </TableCell>
                        <TableCell>
                          <TextField
                            value={item.packagingMethod}
                            onChange={(e) => handleItemChange(index, 'packagingMethod', e.target.value)}
                            fullWidth
                            size="small"
                            variant="outlined"
                            error={formErrors.items && formErrors.items[index]?.packagingMethod}
                          />
                        </TableCell>
                        <TableCell>
                          <TextField
                            value={item.description}
                            onChange={(e) => handleItemChange(index, 'description', e.target.value)}
                            fullWidth
                            size="small"
                            variant="outlined"
                            error={formErrors.items && formErrors.items[index]?.description}
                          />
                        </TableCell>
                        <TableCell>
                          <TextField
                            value={item.weight}
                            onChange={(e) => handleItemChange(index, 'weight', e.target.value)}
                            fullWidth
                            type="number"
                            size="small"
                            variant="outlined"
                          />
                        </TableCell>
                        <TableCell>
                          <TextField
                            value={item.volume}
                            onChange={(e) => handleItemChange(index, 'volume', e.target.value)}
                            fullWidth
                            type="number"
                            size="small"
                            variant="outlined"
                          />
                        </TableCell>
                        <TableCell>
                          {formData.items.length > 1 && (
                            <IconButton 
                              color="error" 
                              onClick={() => removeItem(index)}
                              size="small"
                            >
                              <DeleteIcon />
                            </IconButton>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </CardContent>
          </Card>
        </Grid>
        
        {/* Opłaty i ustalenia szczególne */}
        <Grid item xs={12}>
          <Card>
            <CardHeader 
              title="Opłaty i ustalenia szczególne" 
              titleTypographyProps={{ variant: 'h6' }}
            />
            <Divider />
            <CardContent>
              <Grid container spacing={2}>
                <Grid item xs={12}>
                  <TextField
                    label="Ustalenia szczególne"
                    multiline
                    rows={3}
                    fullWidth
                    size="small"
                  />
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>
        
        {/* Pole 21 - Wystawiono w */}
        <Grid item xs={12}>
          <Card>
            <CardHeader 
              title="Wystawiono w (pole 21)" 
              titleTypographyProps={{ variant: 'h6' }}
            />
            <Divider />
            <CardContent>
              <Grid container spacing={2}>
                <Grid item xs={12} md={6}>
                  <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={pl}>
                    <DatePicker
                      label="Data wystawienia"
                      value={formData.issueDate}
                      onChange={(newDate) => handleDateChange('issueDate', newDate)}
                      renderInput={(params) => <TextField {...params} fullWidth size="small" />}
                    />
                  </LocalizationProvider>
                </Grid>
                <Grid item xs={12} md={6}>
                  <TextField
                    label="Miejsce wystawienia"
                    name="issuePlace"
                    value={formData.issuePlace}
                    onChange={handleChange}
                    fullWidth
                    size="small"
                  />
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>
        
        {/* Dialogi */}
        
        {/* Dialog wyboru zamówienia klienta (CO) */}
        <Dialog open={isOrderDialogOpen} onClose={handleCloseOrderDialog} maxWidth="md" fullWidth>
          <DialogTitle>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="h6">Wybierz zamówienie klienta (CO)</Typography>
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
        
        {/* Dialog podglądu dokumentu */}
        <Dialog open={isPreviewOpen} onClose={handleClosePreview} maxWidth="lg" fullWidth>
          <DialogTitle>
            <Typography variant="h6">Podgląd dokumentu CMR</Typography>
          </DialogTitle>
          <DialogContent>
            <Box sx={{ mt: 2, textAlign: 'center' }}>
              <iframe
                src={`/assets/cmr-template.svg?${new Date().getTime()}`}
                style={{ width: '100%', height: '80vh', border: 'none' }}
                title="Podgląd CMR"
              />
            </Box>
          </DialogContent>
          <DialogActions>
            <Button onClick={handleClosePreview} color="primary">
              Zamknij
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
        
        {/* Przyciski akcji */}
        <Grid item xs={12}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, mt: 2 }}>
            <Box>
              <Button 
                variant="outlined" 
                color="secondary"
                onClick={handleOpenPreview}
                startIcon={<VisibilityIcon />}
                sx={{ mr: 1 }}
              >
                Podgląd
              </Button>
            </Box>
            <Box sx={{ display: 'flex', gap: 2 }}>
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
                onClick={(e) => handleSubmit(e)}
              >
                Zapisz
              </Button>
            </Box>
          </Box>
        </Grid>
      </Grid>
    </form>
  );
};

export default NewCmrForm; 