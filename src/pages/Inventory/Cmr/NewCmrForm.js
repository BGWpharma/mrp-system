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
  Paper,
  Chip,
  Collapse
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
import LinkIcon from '@mui/icons-material/Link';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import { Calculate as CalculateIcon } from '@mui/icons-material';
import { getOrderById, searchOrdersByNumber } from '../../../services/orderService';
import { getCustomerById } from '../../../services/customerService';
import { getCompanyData } from '../../../services/companyService';
import BatchSelector from '../../../components/cmr/BatchSelector';
import WeightCalculationDialog from '../../../components/cmr/WeightCalculationDialog';
import { useTranslation } from '../../../hooks/useTranslation';

/**
 * Nowy komponent formularza CMR oparty na oficjalnym dokumencie.
 * 
 * @param {Object} initialData - Początkowe dane formularza
 * @param {Function} onSubmit - Funkcja wywołana po zapisaniu formularza
 * @param {Function} onCancel - Funkcja wywołana po anulowaniu edycji
 * @returns {JSX.Element} Formularz CMR
 */
const NewCmrForm = ({ initialData, onSubmit, onCancel }) => {
  const { t } = useTranslation('cmr');
  const emptyItem = {
    marks: '',               // Pole 6 - Znaki i numery
    numberOfPackages: '',    // Pole 7 - Ilość sztuk
    packagingMethod: '',     // Pole 8 - Sposób pakowania 
    description: '',         // Pole 9 - Rodzaj towaru
    weight: '',              // Pole 11 - Waga brutto w kg
    volume: '',              // Pole 12 - Objętość w m³
    linkedBatches: []        // Powiązane partie magazynowe
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
    recipientAddress: '',    // Pełny adres odbiorcy
    
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
    senderInstructions: 'Towar stanowi żywność – suplementy diety i nie może być przewożony w jednym pojeździe z chemikaliami ani innymi substancjami mogącymi powodować skażenie.Pełną odpowiedzialność za dobór środka transportu, warunki przewozu oraz ewentualne pogorszenie jakości lub skażenie towaru ponosi przewoźnik / firma spedycyjna.',  // Instrukcje nadawcy
    
    // Pozycje dokumentu (pola 6-12)
    items: []
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
    documents: true
  });
  
  // Stan do zwijania/rozwijania opcji importu
  const [isImportOptionsExpanded, setIsImportOptionsExpanded] = useState(false);
  
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
  
  // Stany dla wyboru partii magazynowych
  const [batchSelectorOpen, setBatchSelectorOpen] = useState(false);
  const [currentItemIndex, setCurrentItemIndex] = useState(null);
  
  // Stany dla powiązanych zamówień i ich pozycji
  const [linkedOrders, setLinkedOrders] = useState([]);
  const [availableOrderItems, setAvailableOrderItems] = useState([]);
  const [orderItemsSelectorOpen, setOrderItemsSelectorOpen] = useState(false);
  const [orderItemsSearchQuery, setOrderItemsSearchQuery] = useState('');
  
  // Stany dla kalkulatora wagi
  const [weightCalculatorOpen, setWeightCalculatorOpen] = useState(false);
  const [currentWeightItemIndex, setCurrentWeightItemIndex] = useState(null);
  
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
      handleCloseBatchSelector();
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

  // Funkcje do obsługi kalkulatora wagi
  const handleOpenWeightCalculator = (itemIndex) => {
    setCurrentWeightItemIndex(itemIndex);
    setWeightCalculatorOpen(true);
  };

  const handleCloseWeightCalculator = () => {
    setWeightCalculatorOpen(false);
    setCurrentWeightItemIndex(null);
  };

  const handleAcceptWeight = (calculatedWeight) => {
    if (currentWeightItemIndex !== null) {
      setFormData(prev => {
        const updatedItems = [...prev.items];
        updatedItems[currentWeightItemIndex] = {
          ...updatedItems[currentWeightItemIndex],
          weight: calculatedWeight.toString()
        };
        return { ...prev, items: updatedItems };
      });
      
      showMessage(`Zastosowano obliczoną wagę: ${calculatedWeight} kg`, 'success');
    }
  };
  
  useEffect(() => {
    let cancelled = false;
    if (initialData) {
      const convertDate = (dateValue) => {
        if (!dateValue) return null;
        
        if (dateValue instanceof Date) {
          return dateValue;
        }
        
        if (dateValue && typeof dateValue === 'object' && typeof dateValue.toDate === 'function') {
          return dateValue.toDate();
        }
        
        if (dateValue && typeof dateValue === 'object' && dateValue.seconds) {
          return new Date(dateValue.seconds * 1000);
        }
        
        try {
          return new Date(dateValue);
        } catch (e) {
          console.warn('Nie można skonwertować daty:', dateValue);
          return null;
        }
      };
      
      const processedData = {
        ...initialData,
        issueDate: convertDate(initialData.issueDate) || new Date(),
        loadingDate: convertDate(initialData.loadingDate) || new Date(),
        items: initialData.items || []
      };
      
      setFormData(processedData);
    }
    
    loadCompanyData();
    return () => { cancelled = true; };
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
  
  // Nowa funkcja do dodawania pozycji z zamówienia - z automatycznym wyszukiwaniem przez receptury
  const addItemFromOrder = async (orderItem) => {
    const newItem = {
      marks: orderItem.productCode || '',
      numberOfPackages: orderItem.quantity || '',
      packagingMethod: orderItem.unit || 'szt.',
      description: orderItem.name || '',
      weight: orderItem.weight || '',
      volume: orderItem.volume || '',
      linkedBatches: [],
      orderItemId: orderItem.id,
      orderId: orderItem.orderId,
      orderNumber: orderItem.orderNumber,
      // Dodaj informacje o potencjalnej recepturze
      originalOrderItem: orderItem
    };

    // Spróbuj automatycznie znaleźć pozycję magazynową na podstawie receptury
    try {
      // Import potrzebnych funkcji
      const { getAllRecipes } = await import('../../services/recipeService');
      const { getInventoryItemByRecipeId } = await import('../../services/inventory');
      
      // Pobierz receptury
      const recipes = await getAllRecipes();
      
      // Znajdź recepturę odpowiadającą nazwie pozycji z zamówienia
      const matchingRecipe = recipes.find(recipe => {
        const recipeName = recipe.name.toLowerCase();
        const itemName = orderItem.name.toLowerCase();
        
        // Szukaj dokładnego dopasowania lub częściowego
        return recipeName === itemName || 
               recipeName.includes(itemName) || 
               itemName.includes(recipeName);
      });

      if (matchingRecipe) {
        // Sprawdź czy receptura ma powiązaną pozycję magazynową
        const inventoryItem = await getInventoryItemByRecipeId(matchingRecipe.id);
        
        if (inventoryItem) {
          newItem.suggestedInventoryItem = inventoryItem;
          newItem.matchedRecipe = matchingRecipe;
          
          console.log(`Automatycznie dopasowano pozycję magazynową "${inventoryItem.name}" dla pozycji CMR "${orderItem.name}" na podstawie receptury "${matchingRecipe.name}"`);
          showMessage(`Dodano pozycję "${orderItem.name}" z sugerowaną pozycją magazynową "${inventoryItem.name}" (z receptury)`, 'success');
        } else {
          showMessage(`Dodano pozycję "${orderItem.name}" z zamówienia. Znaleziono recepturę "${matchingRecipe.name}", ale brak powiązanej pozycji magazynowej`, 'info');
        }
      } else {
        showMessage(`Dodano pozycję "${orderItem.name}" z zamówienia`, 'success');
      }
    } catch (error) {
      console.error('Błąd podczas automatycznego dopasowywania pozycji magazynowej:', error);
      showMessage(`Dodano pozycję "${orderItem.name}" z zamówienia`, 'success');
    }
    
    setFormData(prev => ({
      ...prev,
      items: [...prev.items, newItem]
    }));
  };
  
  // Funkcja do usuwania powiązanego zamówienia
  const removeLinkedOrder = (orderId) => {
    setLinkedOrders(prev => prev.filter(order => order.id !== orderId));
    setAvailableOrderItems(prev => prev.filter(item => item.orderId !== orderId));
    
    // Zaktualizuj formData
    setFormData(prev => {
      const updatedForm = { ...prev };
      if (updatedForm.linkedOrderIds) {
        updatedForm.linkedOrderIds = updatedForm.linkedOrderIds.filter(id => id !== orderId);
      }
      if (updatedForm.linkedOrderNumbers) {
        const orderToRemove = linkedOrders.find(order => order.id === orderId);
        if (orderToRemove) {
          updatedForm.linkedOrderNumbers = updatedForm.linkedOrderNumbers.filter(
            num => num !== orderToRemove.orderNumber
          );
        }
      }
      return updatedForm;
    });
    
    showMessage('Usunięto powiązanie z zamówieniem', 'info');
  };
  
  const removeItem = (index) => {
    setFormData(prev => {
      const updatedItems = [...prev.items];
      updatedItems.splice(index, 1);
      return { ...prev, items: updatedItems };
    });
  };
  
  const validateForm = (skipBatchValidation = false) => {
    const errors = {};
    
    // Walidacja powiązania z CO
    if (linkedOrders.length === 0 && !formData.linkedOrderId) {
      errors.linkedOrderId = 'CMR musi być powiązany z co najmniej jednym zamówieniem klienta (CO)';
    }
    
    // Wymagane pola podstawowe zgodnie z dokumentem CMR
    if (!formData.sender) errors.sender = 'Nadawca jest wymagany';
    if (!formData.senderAddress) errors.senderAddress = 'Adres nadawcy jest wymagany';
    if (!formData.recipient) errors.recipient = 'Odbiorca jest wymagany';
    if (!formData.recipientAddress) errors.recipientAddress = 'Pełny adres odbiorcy jest wymagany';
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
      
      // Walidacja powiązania z partiami magazynowymi - pomijamy dla statusu 'Szkic'
      if (!skipBatchValidation && (!item.linkedBatches || item.linkedBatches.length === 0)) {
        itemError.linkedBatches = 'Każda pozycja musi być powiązana z przynajmniej jedną partią magazynową';
      }
      
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
    
    // Walidacja formularza - pomiń walidację partii dla nowych CMR (domyślnie są w stanie 'Szkic')
    const isValid = validateForm(true); // Nowe CMR są zawsze w stanie 'Szkic', więc pomijamy walidację partii
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
        
        // Zapisz powiązanie z zamówieniem (dodaj do istniejących)
        if (!updatedForm.linkedOrderIds) updatedForm.linkedOrderIds = [];
        if (!updatedForm.linkedOrderNumbers) updatedForm.linkedOrderNumbers = [];
        
        if (!updatedForm.linkedOrderIds.includes(orderId)) {
          updatedForm.linkedOrderIds.push(orderId);
          updatedForm.linkedOrderNumbers.push(order.orderNumber);
        }
        
        // Zachowaj kompatybilność z poprzednim formatem
        updatedForm.linkedOrderId = orderId;
        updatedForm.linkedOrderNumber = order.orderNumber;
        
        // Dane odbiorcy (klient z zamówienia)
        if (importOptions.recipientData) {
          updatedForm.recipient = customerData.name || '';
          
          // Użyj adresu do wysyłki jeśli dostępny, w przeciwnym razie adres do faktury, lub stary format adresu
          const recipientAddress = customerData.shippingAddress || 
                                  customerData.billingAddress || 
                                  customerData.address || '';
          
          updatedForm.recipientAddress = recipientAddress;
          
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
        
        // Usunęliśmy automatyczne dodawanie pozycji - użytkownik będzie mógł je dodać ręcznie
        
        return updatedForm;
      });
      
      // Zapisz dane zamówienia i jego pozycje dla późniejszego użycia
      setLinkedOrders(prev => {
        const existing = prev.find(o => o.id === order.id);
        if (existing) {
          return prev; // Zamówienie już jest na liście
        }
        return [...prev, order];
      });
      
      // Zaktualizuj listę dostępnych pozycji ze wszystkich zamówień
      setAvailableOrderItems(prev => {
        const existingItems = prev.filter(item => item.orderId !== order.id);
        const newItems = (order.items || []).map(item => ({
          ...item,
          orderId: order.id,
          orderNumber: order.orderNumber
        }));
        return [...existingItems, ...newItems];
      });
      
      // Wyświetl podsumowanie pobranych danych
      const summaryMessage = `Pomyślnie powiązano CMR z zamówieniem ${order.orderNumber}. 
Zaimportowano: ${importedDataSummary.join(', ')}.
${importOptions.recipientData ? `Źródło danych klienta: ${customerDataSource}.` : ''}
Pozycje z zamówienia będą dostępne do dodania w sekcji "Elementy dokumentu CMR".`;
      
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
  
  // Funkcja do odświeżania listy zamówień
  const handleRefreshOrders = async () => {
    setIsLoadingOrder(true);
    try {
      const { getAllOrders } = await import('../../../services/orderService');
      const orders = await getAllOrders();
      const customerOrders = orders.filter(order => order.type !== 'purchase');
      setAvailableOrders(customerOrders);
      
      if (customerOrders.length > 0) {
        showMessage(`Odświeżono listę zamówień (${customerOrders.length} pozycji)`, 'info');
      } else {
        showMessage('Nie znaleziono żadnych zamówień klienta', 'warning');
      }
    } catch (error) {
      console.error('Błąd podczas odświeżania zamówień:', error);
      showMessage('Wystąpił błąd podczas odświeżania zamówień', 'error');
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
        {/* Przyciski akcji - na górze */}
        <Grid item xs={12}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, mb: 2 }}>
            <Box>
              <Button 
                variant="outlined" 
                color="secondary"
                onClick={handleOpenPreview}
                startIcon={<VisibilityIcon />}
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
                
                {/* Status ukryty - automatycznie ustawiony na roboczy */}
                
                <Grid item xs={12}>
                  <Box sx={{ mb: 2 }}>
                    <Button
                      variant={formData.linkedOrderId ? "contained" : "outlined"}
                      color={formData.linkedOrderId ? "success" : "primary"}
                      onClick={handleOpenOrderDialog}
                      size="large"
                      fullWidth
                      sx={{ 
                        py: 1.5,
                        fontSize: '16px',
                        fontWeight: 'bold',
                        border: formErrors.linkedOrderId ? '2px solid #f44336' : undefined
                      }}
                    >
                      {linkedOrders.length > 0 
                        ? `✓ Powiązano z ${linkedOrders.length} CO` 
                        : 'Powiąż z CO (wymagane)'
                      }
                    </Button>
                    
                    {/* Sekcja z powiązanymi zamówieniami */}
                    {linkedOrders.length > 0 && (
                      <Box sx={{ mt: 2 }}>
                        <Typography variant="subtitle2" sx={{ mb: 1 }}>
                          Powiązane zamówienia klienta:
                        </Typography>
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                          {linkedOrders.map((order) => (
                            <Chip
                              key={order.id}
                              label={`CO ${order.orderNumber} - ${order.customer?.name || 'Nieznany klient'}`}
                              variant="outlined"
                              color="primary"
                              onDelete={() => removeLinkedOrder(order.id)}
                              deleteIcon={<DeleteIcon />}
                              sx={{ mb: 1 }}
                            />
                          ))}
                        </Box>
                      </Box>
                    )}
                    
                    {formErrors.linkedOrderId && (
                      <FormHelperText error sx={{ mt: 1 }}>
                        {formErrors.linkedOrderId}
                      </FormHelperText>
                    )}
                  </Box>
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
                    multiline
                    rows={4}
                    error={!!formErrors.recipientAddress}
                    helperText={formErrors.recipientAddress || "Pełny adres odbiorcy (ulica, kod pocztowy, miasto, kraj)"}
                    size="small"
                    placeholder={t('form.addressPlaceholder')}
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
              title={t('form.loadingUnloadingPlaces')} 
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
                    label={t('form.loadingAddress')}
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
                      label={t('form.loadingDate')}
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
                    {t('form.attachedDocuments')}
                  </Typography>
                  <TextField
                    label={t('form.attachedDocuments')}
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
                <Box sx={{ display: 'flex', gap: 1 }}>
                  {linkedOrders.length > 0 && availableOrderItems.length > 0 && (
                    <Button
                      startIcon={<LinkIcon />}
                      onClick={() => setOrderItemsSelectorOpen(true)}
                      color="secondary"
                      variant="outlined"
                      size="small"
                    >
                      Dodaj z zamówienia
                    </Button>
                  )}
                  <Button
                    startIcon={<AddIcon />}
                    onClick={addItem}
                    color="primary"
                    size="small"
                  >
                    Dodaj pozycję
                  </Button>
                </Box>
              }
            />
            <Divider />
            <CardContent>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell width="4%">LP</TableCell>
                      <TableCell width="12%">Znaki i numery (6)</TableCell>
                      <TableCell width="8%">Ilość sztuk (7)</TableCell>
                      <TableCell width="12%">Sposób pakowania (8)</TableCell>
                      <TableCell width="20%">Rodzaj towaru (9)</TableCell>
                      <TableCell width="8%">Waga brutto kg (11)</TableCell>
                      <TableCell width="8%">Objętość m³ (12)</TableCell>
                      <TableCell width="20%">Partie magazynowe</TableCell>
                      <TableCell width="8%">Akcje</TableCell>
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
                          <Box>
                            <TextField
                              value={item.description}
                              onChange={(e) => handleItemChange(index, 'description', e.target.value)}
                              fullWidth
                              size="small"
                              variant="outlined"
                              error={formErrors.items && formErrors.items[index]?.description}
                            />
                            {/* Informacja o sugerowanej pozycji magazynowej */}
                            {item.suggestedInventoryItem && item.matchedRecipe && (
                              <Chip 
                                label={`🎯 ${item.suggestedInventoryItem.name}`}
                                size="small"
                                color="primary"
                                variant="outlined"
                                title={`Sugerowana pozycja magazynowa na podstawie receptury: ${item.matchedRecipe.name}`}
                                sx={{ mt: 0.5, fontSize: '0.7rem' }}
                              />
                            )}
                          </Box>
                        </TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
                            <TextField
                              value={item.weight}
                              onChange={(e) => handleItemChange(index, 'weight', e.target.value)}
                              fullWidth
                              type="number"
                              size="small"
                              variant="outlined"
                            />
                            <IconButton
                              size="small"
                              onClick={() => handleOpenWeightCalculator(index)}
                              title={t('form.calculateWeightFromInventory')}
                              sx={{ 
                                color: 'primary.main',
                                '&:hover': { bgcolor: (theme) => theme.palette.mode === 'dark' ? 'primary.dark' : 'primary.light' },
                                minWidth: 32,
                                height: 32
                              }}
                            >
                              <CalculateIcon fontSize="small" />
                            </IconButton>
                          </Box>
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
                          {/* Powiązanie z partiami magazynowymi */}
                          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                            <Button
                              size="small"
                              variant="outlined"
                              startIcon={<LinkIcon />}
                              onClick={() => handleOpenBatchSelector(index)}
                              sx={{ fontSize: '10px', py: 0.5 }}
                            >
                              Partie
                            </Button>
                            
                            {/* Wyświetlanie powiązanych partii */}
                            {item.linkedBatches && item.linkedBatches.length > 0 ? (
                              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                                {item.linkedBatches.map((batch) => (
                                  <Chip
                                    key={batch.id}
                                    label={`${batch.batchNumber || batch.lotNumber || 'Bez numeru'}`}
                                    variant="outlined"
                                    size="small"
                                    onDelete={() => handleRemoveBatch(index, batch.id)}
                                    color="primary"
                                    sx={{ fontSize: '9px', height: '20px' }}
                                  />
                                ))}
                              </Box>
                            ) : (
                              <Typography 
                                variant="caption" 
                                color={formErrors.items && formErrors.items[index]?.linkedBatches ? "error" : "text.secondary"} 
                                sx={{ fontStyle: 'italic', fontSize: '9px' }}
                              >
                                {formErrors.items && formErrors.items[index]?.linkedBatches 
                                  ? t('common:common.required') 
                                  : 'Brak partii'
                                }
                              </Typography>
                            )}
                          </Box>
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
              title={t('form.feesAndSpecialArrangements')} 
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
              <Typography variant="h6">{t('form.selectCustomerOrder')}</Typography>
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
                  sx={{ mb: 1 }}
                />
                
                {/* Przyciski ułożone w poziomie */}
                <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
                  <Button
                    variant="outlined"
                    startIcon={<SearchIcon />}
                    onClick={handleFindOrderByNumber}
                    disabled={isLoadingOrder}
                  >
                    Szukaj
                  </Button>
                  <Button
                    variant="outlined"
                    startIcon={<RefreshIcon />}
                    onClick={handleRefreshOrders}
                    disabled={isLoadingOrder}
                  >
                    Odśwież
                  </Button>
                </Box>
              </Grid>
              
              <Grid item xs={12}>
                {isLoadingOrder ? (
                  <Box sx={{ display: 'flex', justifyContent: 'center', my: 3 }}>
                    <CircularProgress />
                  </Box>
                ) : (
                  <Autocomplete
                    options={availableOrders}
                    getOptionLabel={(option) => {
                      const orderNumber = option.orderNumber || `#${option.id.substring(0, 8)}`;
                      const customerName = option.customer?.name || option.customerName || 'Nieznany klient';
                      
                      // Bezpieczne formatowanie daty
                      let formattedDate = '';
                      if (option.orderDate) {
                        try {
                          let dateObj;
                          if (option.orderDate instanceof Date) {
                            dateObj = option.orderDate;
                          } else if (option.orderDate.toDate && typeof option.orderDate.toDate === 'function') {
                            dateObj = option.orderDate.toDate();
                          } else if (typeof option.orderDate === 'string' || typeof option.orderDate === 'number') {
                            dateObj = new Date(option.orderDate);
                          }
                          
                          if (dateObj && !isNaN(dateObj.getTime())) {
                            formattedDate = ` (${dateObj.toLocaleDateString('pl-PL')})`;
                          }
                        } catch (error) {
                          console.warn('Błąd formatowania daty zamówienia:', error);
                        }
                      }
                      
                      return `${orderNumber} - ${customerName}${formattedDate}`;
                    }}
                    onChange={(e, value) => {
                      if (value) {
                        setSelectedOrderId(value.id);
                      } else {
                        setSelectedOrderId('');
                      }
                    }}
                    sx={{
                      '& .MuiAutocomplete-option': {
                        '&:hover': {
                          bgcolor: (theme) => theme.palette.mode === 'dark' 
                            ? 'rgba(255, 255, 255, 0.08)' 
                            : 'rgba(0, 0, 0, 0.04) !important'
                        },
                        '&[aria-selected="true"]': {
                          bgcolor: (theme) => theme.palette.mode === 'dark'
                            ? 'rgba(255, 255, 255, 0.12)'
                            : 'rgba(0, 0, 0, 0.08) !important'
                        },
                        '&[aria-selected="true"]:hover': {
                          bgcolor: (theme) => theme.palette.mode === 'dark'
                            ? 'rgba(255, 255, 255, 0.16)'
                            : 'rgba(0, 0, 0, 0.12) !important'
                        }
                      }
                    }}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        label={t('form.selectOrder')}
                        variant="outlined"
                        helperText={
                          availableOrders.length === 0 
                            ? "Brak zamówień. Użyj wyszukiwarki powyżej, aby znaleźć zamówienie." 
                            : t('form.selectOrderPlaceholder')
                        }
                      />
                    )}
                  />
                )}
              </Grid>
              
              {/* Opcje importu danych - zwijane/rozwijane */}
              {selectedOrderId && (
                <Grid item xs={12} sx={{ mt: 2 }}>
                  <Button
                    variant="text"
                    onClick={() => setIsImportOptionsExpanded(!isImportOptionsExpanded)}
                    sx={{ 
                      textTransform: 'none', 
                      p: 1,
                      justifyContent: 'flex-start',
                      width: '100%'
                    }}
                    endIcon={isImportOptionsExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                  >
                    <Typography variant="subtitle2">
                      Wybierz dane do zaimportowania:
                    </Typography>
                  </Button>
                  
                  <Collapse in={isImportOptionsExpanded}>
                    <FormGroup sx={{ ml: 2 }}>
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
                  </Collapse>
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
        
        {/* Dialog wyboru pozycji z zamówienia */}
        <Dialog open={orderItemsSelectorOpen} onClose={() => setOrderItemsSelectorOpen(false)} maxWidth="md" fullWidth>
          <DialogTitle>
            Dodaj pozycje z powiązanych zamówień
            {linkedOrders.length > 0 && (
              <Typography variant="subtitle2" color="text.secondary">
                Powiązane CO: {linkedOrders.map(order => order.orderNumber).join(', ')}
              </Typography>
            )}
          </DialogTitle>
          <DialogContent>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Wybierz pozycje z zamówień klienta, które chcesz dodać do dokumentu CMR:
            </Typography>
            
            {/* Pole wyszukiwania */}
            <TextField
              fullWidth
              placeholder="Wyszukaj pozycje..."
              value={orderItemsSearchQuery}
              onChange={(e) => setOrderItemsSearchQuery(e.target.value)}
              InputProps={{
                startAdornment: <SearchIcon sx={{ color: 'text.secondary', mr: 1 }} />
              }}
              sx={{ mb: 2 }}
            />
            
            <Box sx={{ maxHeight: 400, overflow: 'auto' }}>
              {availableOrderItems.filter(orderItem => {
                if (!orderItemsSearchQuery.trim()) return true;
                const searchTerm = orderItemsSearchQuery.toLowerCase();
                return (
                  (orderItem.name || '').toLowerCase().includes(searchTerm) ||
                  (orderItem.description || '').toLowerCase().includes(searchTerm) ||
                  (orderItem.orderNumber || '').toLowerCase().includes(searchTerm) ||
                  (orderItem.unit || '').toLowerCase().includes(searchTerm)
                );
              }).map((orderItem, index) => (
                <Box 
                  key={index}
                  sx={{ 
                    p: 2, 
                    border: (theme) => `1px solid ${theme.palette.divider}`, 
                    borderRadius: 1, 
                    mb: 1,
                    bgcolor: 'background.paper'
                  }}
                >
                  <Grid container spacing={2} alignItems="center">
                    <Grid item xs={12} sm={5}>
                      <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                        {orderItem.name || 'Bez nazwy'}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Ilość: {orderItem.quantity} {orderItem.unit || 'szt.'}
                      </Typography>
                      <Typography variant="caption" color="primary" sx={{ fontWeight: 500 }}>
                        CO: {orderItem.orderNumber}
                      </Typography>
                    </Grid>
                    <Grid item xs={12} sm={5}>
                      {orderItem.description && (
                        <Typography variant="caption" color="text.secondary">
                          {orderItem.description}
                        </Typography>
                      )}
                    </Grid>
                    <Grid item xs={12} sm={2}>
                      <Button
                        variant="contained"
                        size="small"
                                                  onClick={() => {
                            addItemFromOrder(orderItem).catch(error => {
                              console.error('Błąd podczas dodawania pozycji z zamówienia:', error);
                              showMessage('Błąd podczas dodawania pozycji z zamówienia', 'error');
                            });
                          }}
                        sx={{ width: '100%' }}
                      >
                        Dodaj
                      </Button>
                    </Grid>
                  </Grid>
                </Box>
              ))}
              
              {availableOrderItems.filter(orderItem => {
                if (!orderItemsSearchQuery.trim()) return true;
                const searchTerm = orderItemsSearchQuery.toLowerCase();
                return (
                  (orderItem.name || '').toLowerCase().includes(searchTerm) ||
                  (orderItem.description || '').toLowerCase().includes(searchTerm) ||
                  (orderItem.orderNumber || '').toLowerCase().includes(searchTerm) ||
                  (orderItem.unit || '').toLowerCase().includes(searchTerm)
                );
              }).length === 0 && (
                <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
                  {orderItemsSearchQuery.trim() 
                    ? `Brak pozycji pasujących do wyszukiwania "${orderItemsSearchQuery}"`
                    : 'Brak dostępnych pozycji w zamówieniu'
                  }
                </Typography>
              )}
            </Box>
          </DialogContent>
          <DialogActions>
            {orderItemsSearchQuery.trim() && (
              <Button 
                onClick={() => setOrderItemsSearchQuery('')}
                color="inherit"
              >
                Wyczyść wyszukiwanie
              </Button>
            )}
            <Button onClick={() => {
              setOrderItemsSearchQuery('');
              setOrderItemsSelectorOpen(false);
            }}>
              Zamknij
            </Button>
          </DialogActions>
        </Dialog>

        {/* Dialog podglądu dokumentu */}
        <Dialog open={isPreviewOpen} onClose={handleClosePreview} maxWidth="lg" fullWidth>
          <DialogTitle>
            <Typography variant="h6">{t('form.cmrPreview')}</Typography>
          </DialogTitle>
          <DialogContent>
            <Box sx={{ mt: 2, textAlign: 'center' }}>
              <iframe
                src={`/assets/cmr-template.svg?${new Date().getTime()}`}
                style={{ width: '100%', height: '80vh', border: 'none' }}
                title={t('form.cmrPreview')}
              />
            </Box>
          </DialogContent>
          <DialogActions>
            <Button onClick={handleClosePreview} color="primary">
              Zamknij
            </Button>
          </DialogActions>
        </Dialog>
        
        {/* Dialog wyboru partii magazynowych */}
        <BatchSelector
          open={batchSelectorOpen}
          onClose={handleCloseBatchSelector}
          onSelectBatches={handleSelectBatches}
          selectedBatches={currentItemIndex !== null ? formData.items[currentItemIndex]?.linkedBatches || [] : []}
          itemDescription={currentItemIndex !== null ? formData.items[currentItemIndex]?.description || '' : ''}
          itemMarks={currentItemIndex !== null ? formData.items[currentItemIndex]?.marks || '' : ''}
          itemCode={currentItemIndex !== null ? formData.items[currentItemIndex]?.marks || formData.items[currentItemIndex]?.productCode || '' : ''}
          suggestedInventoryItem={currentItemIndex !== null ? formData.items[currentItemIndex]?.suggestedInventoryItem || null : null}
          matchedRecipe={currentItemIndex !== null ? formData.items[currentItemIndex]?.matchedRecipe || null : null}
        />

        {/* Dialog kalkulatora wagi */}
        <WeightCalculationDialog
          open={weightCalculatorOpen}
          onClose={handleCloseWeightCalculator}
          onAcceptWeight={handleAcceptWeight}
          cmrItem={currentWeightItemIndex !== null ? formData.items[currentWeightItemIndex] : null}
        />
        
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