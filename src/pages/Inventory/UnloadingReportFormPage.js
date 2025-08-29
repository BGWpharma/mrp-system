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
  Checkbox,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  InputAdornment,
  CircularProgress
} from '@mui/material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { pl } from 'date-fns/locale';
import { Save as SaveIcon, ArrowBack as ArrowBackIcon, CloudUpload as CloudUploadIcon, Search as SearchIcon, AttachFile as AttachFileIcon, Delete as DeleteIcon, Visibility as VisibilityIcon, CheckBox, CheckBoxOutlineBlank, Refresh as RefreshIcon } from '@mui/icons-material';
import { useTheme } from '@mui/material/styles';
import { useNavigate, useLocation } from 'react-router-dom';
import { useInventoryEmployeeOptions, useInventoryPositionOptions } from '../../hooks/useFormOptions';
import { getAllPurchaseOrders, getPurchaseOrderById, searchPurchaseOrdersQuick, getRecentPurchaseOrders } from '../../services/purchaseOrderService';
import { useDebounce } from '../../hooks/useDebounce';
import { db, storage } from '../../services/firebase/config';
import { collection, addDoc, serverTimestamp, doc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useAuth } from '../../hooks/useAuth';

const UnloadingReportFormPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser } = useAuth();
  const theme = useTheme();
  
  // Sprawdź czy jesteśmy w trybie edycji
  const isEditMode = new URLSearchParams(location.search).get('edit') === 'true';
  
  // Pobieranie opcji z bazy danych
  const { options: employeeOptions, loading: employeeLoading } = useInventoryEmployeeOptions();
  const { options: positionOptions, loading: positionLoading } = useInventoryPositionOptions();
  
  // Stany dla wyszukiwarki PO
  const [searchResults, setSearchResults] = useState([]);
  const [poSearchQuery, setPoSearchQuery] = useState('');
  const [poLoading, setPoLoading] = useState(false);
  const [autoFillNotification, setAutoFillNotification] = useState(false);
  
  // Debounce dla wyszukiwania PO
  const debouncedSearchQuery = useDebounce(poSearchQuery, 500);
  
  // Stany dla pozycji PO
  const [poItems, setPoItems] = useState([]);
  const [selectedPoItems, setSelectedPoItems] = useState([]);
  
  const [formData, setFormData] = useState({
    // Informacje użytkownika
    email: '',
    
    // Sekcja 1: Identyfikacja
    employeeName: '',
    position: '',
    fillDate: new Date(),
    fillTime: new Date().toLocaleTimeString('pl', { hour: '2-digit', minute: '2-digit' }),
    
    // Sekcja 2: Informacje o rozładunku
    unloadingDate: new Date(),
    unloadingTime: '',
    carrierName: '',
    vehicleRegistration: '',
    vehicleTechnicalCondition: '',
    transportHygiene: '',
    notes: '',
    
    // Sekcja 3: Informacje o towarze
    supplierName: '',
    poNumber: '',
    selectedItems: [],
    palletQuantity: '',
    cartonsTubsQuantity: '',
    weight: '',
    visualInspectionResult: '',
    ecoCertificateNumber: '',
    goodsNotes: '',
    
    // Załączniki
    documentsFile: null,
    documentsUrl: '',
    documentsName: ''
  });
  
  const [showSuccess, setShowSuccess] = useState(false);
  const [errors, setErrors] = useState({});
  const [editId, setEditId] = useState(null);

  // Wyszukiwanie PO na podstawie zapytania z debounce
  useEffect(() => {
    const searchPOs = async () => {
      if (!debouncedSearchQuery || debouncedSearchQuery.trim().length < 2) {
        // Dla pustego wyszukiwania pokaż najnowsze zamówienia
        try {
          setPoLoading(true);
          const recentOrders = await getRecentPurchaseOrders(15);
          setSearchResults(recentOrders);
          console.log(`✅ Załadowano ${recentOrders.length} najnowszych PO`);
        } catch (error) {
          console.error('Błąd podczas pobierania najnowszych PO:', error);
          setSearchResults([]);
        } finally {
          setPoLoading(false);
        }
        return;
      }

      try {
        setPoLoading(true);
        console.log(`🔍 Wyszukuję PO dla: "${debouncedSearchQuery}"`);
        const results = await searchPurchaseOrdersQuick(debouncedSearchQuery, 15);
        setSearchResults(results);
        console.log(`✅ Znaleziono ${results.length} PO`);
      } catch (error) {
        console.error('Błąd podczas wyszukiwania PO:', error);
        setSearchResults([]);
      } finally {
        setPoLoading(false);
      }
    };

    searchPOs();
  }, [debouncedSearchQuery]);

  // Automatyczne ładowanie pozycji PO po wpisaniu dokładnego numeru
  useEffect(() => {
    const loadPoItemsByNumber = async () => {
      if (!poSearchQuery.trim() || poItems.length > 0) return;
      
      // Szukaj dokładnego dopasowania numeru PO w wynikach wyszukiwania
      const exactMatch = searchResults.find(po => 
        po.number?.toLowerCase() === poSearchQuery.toLowerCase() ||
        po.id?.toLowerCase() === poSearchQuery.toLowerCase()
      );
      
      if (exactMatch) {
        console.log('Znaleziono dokładne dopasowanie PO:', exactMatch.number);
        await handlePoSelectionWithDetails(exactMatch, false);
      }
    };

    // Dodaj opóźnienie żeby nie wywoływać za często
    const timeoutId = setTimeout(loadPoItemsByNumber, 500);
    return () => clearTimeout(timeoutId);
  }, [poSearchQuery, searchResults, poItems.length]);

  // Ładowanie pozycji PO w trybie edycji
  useEffect(() => {
    if (isEditMode && formData.poNumber && poItems.length === 0) {
      const loadPoForEdit = async () => {
        try {
          console.log('📝 Ładowanie PO w trybie edycji:', formData.poNumber);
          
          // Wyszukaj PO po numerze
          const searchResults = await searchPurchaseOrdersQuick(formData.poNumber, 5);
          const matchingPo = searchResults.find(po => 
            po.number?.toLowerCase() === formData.poNumber.toLowerCase() ||
            po.id?.toLowerCase() === formData.poNumber.toLowerCase()
          );
          
          if (matchingPo) {
            console.log('✅ Znaleziono PO w trybie edycji:', matchingPo.number);
            await handlePoSelectionWithDetails(matchingPo, true);
          } else {
            console.log('⚠️ Nie znaleziono PO w trybie edycji dla:', formData.poNumber);
          }
        } catch (error) {
          console.error('Błąd podczas ładowania PO w trybie edycji:', error);
        }
      };
      
      loadPoForEdit();
    }
  }, [isEditMode, formData.poNumber, poItems.length]);



  // Sprawdź czy istnieją dane do edycji w sessionStorage
  useEffect(() => {
    if (isEditMode) {
      const editData = JSON.parse(sessionStorage.getItem('editFormData'));
      if (editData) {
        // Konwersja dat z Timestamp na Date
        const fillDate = editData.fillDate ? 
          (editData.fillDate.toDate ? editData.fillDate.toDate() : new Date(editData.fillDate)) : 
          new Date();
        
        const unloadingDate = editData.unloadingDate ? 
          (editData.unloadingDate.toDate ? editData.unloadingDate.toDate() : new Date(editData.unloadingDate)) : 
          new Date();
        
        setFormData({
          email: editData.email || '',
          employeeName: editData.employeeName || '',
          position: editData.position || '',
          fillDate: fillDate,
          fillTime: editData.fillTime || '',
          unloadingDate: unloadingDate,
          unloadingTime: editData.unloadingTime || '',
          carrierName: editData.carrierName || '',
          vehicleRegistration: editData.vehicleRegistration || '',
          vehicleTechnicalCondition: editData.vehicleTechnicalCondition || '',
          transportHygiene: editData.transportHygiene || '',
          notes: editData.notes || '',
          supplierName: editData.supplierName || '',
          poNumber: editData.poNumber || '',
          selectedItems: editData.selectedItems || [],
          palletQuantity: editData.palletQuantity || '',
          cartonsTubsQuantity: editData.cartonsTubsQuantity || '',
          weight: editData.weight || '',
          visualInspectionResult: editData.visualInspectionResult || '',
          ecoCertificateNumber: editData.ecoCertificateNumber || '',
          goodsNotes: editData.goodsNotes || '',
          documentsFile: null,
          documentsUrl: editData.documentsUrl || '',
          documentsName: editData.documentsName || ''
        });
        
        // Ustaw wybrane pozycje dla selektora (z kompatybilnością wsteczną)
        const items = editData.selectedItems || [];
        const normalizedItems = items.map(item => ({
          ...item,
          unloadedQuantity: item.unloadedQuantity || '',
          expiryDate: item.expiryDate ? 
            (item.expiryDate.toDate ? item.expiryDate.toDate() : new Date(item.expiryDate)) : 
            null,
          noExpiryDate: item.noExpiryDate || false
        }));
        setSelectedPoItems(normalizedItems);
        setPoSearchQuery(editData.poNumber || '');
        

        
        setEditId(editData.id);
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

  const handleFileChange = (event) => {
    const file = event.target.files[0];
    setFormData(prev => ({
      ...prev,
      documentsFile: file
    }));
  };

  // Funkcja pomocnicza do pobierania pełnych danych PO
  const handlePoSelectionWithDetails = async (basicPoData, preserveSelectedItems = false) => {
    try {
      setPoLoading(true);
      console.log('📦 Pobieranie szczegółów PO...', basicPoData);
      
      // Zachowaj aktualne wybrane pozycje jeśli to tryb edycji
      const currentSelectedItems = preserveSelectedItems ? formData.selectedItems : [];
      const currentSelectedPoItems = preserveSelectedItems ? selectedPoItems : [];
      
      // Pobierz pełne dane PO
      const fullPoData = await getPurchaseOrderById(basicPoData.id);
      console.log('📋 Pełne dane PO:', fullPoData);
      console.log('🛍️ Pozycje w PO:', fullPoData.items);
      
      // Przygotuj pozycje PO do wyboru
      const items = fullPoData.items?.map((item, index) => ({
        id: `${fullPoData.id}_${index}`,
        poItemId: item.id, // ⭐ ID oryginalnej pozycji z PO dla precyzyjnego dopasowania
        productName: item.productName || item.name || '',
        quantity: item.quantity || '',
        unit: item.unit || 'szt.',
        weight: parseFloat(item.weight) || 0,
        description: item.description || '',
        originalItem: item
      })) || [];
      
      console.log('🔄 Przetworzone pozycje:', items);
      
      // Oblicz całkowitą wagę jeśli dostępna
      const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
      console.log('⚖️ Całkowita waga:', totalWeight);
      
      setPoItems(items);
      
      // W trybie edycji/odświeżania zachowaj poprzednie wybory, w przeciwnym razie wyczyść
      if (preserveSelectedItems && currentSelectedItems.length > 0) {
        console.log('🔄 Przywracanie wybranych pozycji w trybie edycji:', currentSelectedItems);
        setSelectedPoItems(currentSelectedPoItems);
        setFormData(prev => ({
          ...prev,
          poNumber: fullPoData.number,
          supplierName: fullPoData.supplier?.name || prev.supplierName,
          selectedItems: currentSelectedItems,
          weight: prev.weight || (totalWeight > 0 ? `${totalWeight} kg` : '')
        }));
      } else {
        setSelectedPoItems([]); // Wyczyść poprzednie wybory
        setFormData(prev => ({
          ...prev,
          poNumber: fullPoData.number, // Tylko numer PO
          supplierName: fullPoData.supplier?.name || '',
          selectedItems: [],
          weight: totalWeight > 0 ? `${totalWeight} kg` : ''
        }));
      }
      setPoSearchQuery(fullPoData.number); // Tylko numer PO
      
      console.log('✅ Pozycje PO załadowane:', items.length);
      
      // Komunikat o automatycznym uzupełnieniu
      const filledFields = [];
      if (fullPoData.supplier?.name) filledFields.push('dostawca');
      if (items.length > 0) filledFields.push('dostępne pozycje');
      if (totalWeight > 0) filledFields.push('waga');
      
      if (filledFields.length > 0) {
        setAutoFillNotification(true);
        setTimeout(() => setAutoFillNotification(false), 4000);
        console.log('Automatycznie uzupełniono dane z PO:', {
          dostawca: fullPoData.supplier?.name,
          dostępnePozycje: items.length,
          waga: `${totalWeight} kg`,
          pozycjePO: items,
          szczegółyPozycji: items.map(item => ({
            id: item.id,
            nazwa: item.productName,
            ilość: item.quantity,
            jednostka: item.unit,
            waga: item.weight
          }))
        });
      }
      
    } catch (error) {
      console.error('Błąd podczas pobierania szczegółów PO:', error);
    } finally {
      setPoLoading(false);
    }
  };



  // Funkcja do obsługi zaznaczania pozycji PO
  const handleItemSelection = (item, isSelected) => {
    console.log('📦 Zaznaczanie pozycji:', item.productName, isSelected);
    
    if (isSelected) {
      // Dodaj pozycję z domyślnymi wartościami
      const newItem = {
        ...item,
        poItemId: item.poItemId || item.originalItem?.id, // ⭐ Zachowaj oryginalne ID pozycji PO
        unloadedQuantity: '',
        expiryDate: null,
        noExpiryDate: false
      };
      
      setSelectedPoItems(prev => [...prev, newItem]);
      setFormData(prev => ({
        ...prev,
        selectedItems: [...prev.selectedItems, newItem]
      }));
    } else {
      // Usuń pozycję
      setSelectedPoItems(prev => prev.filter(selected => selected.id !== item.id));
      setFormData(prev => ({
        ...prev,
        selectedItems: prev.selectedItems.filter(selected => selected.id !== item.id)
      }));
    }
    
    // Usuń błąd po poprawieniu pola
    if (errors.selectedItems) {
      setErrors(prev => ({
        ...prev,
        selectedItems: undefined
      }));
    }
  };

  // Funkcja do aktualizacji ilości rozładowanej
  const handleUnloadedQuantityChange = (itemId, quantity) => {
    setSelectedPoItems(prev => 
      prev.map(item => 
        item.id === itemId ? { ...item, unloadedQuantity: quantity } : item
      )
    );
    setFormData(prev => ({
      ...prev,
      selectedItems: prev.selectedItems.map(item => 
        item.id === itemId ? { ...item, unloadedQuantity: quantity } : item
      )
    }));
  };

  // Funkcja do aktualizacji daty ważności
  const handleExpiryDateChange = (itemId, date) => {
    setSelectedPoItems(prev => 
      prev.map(item => 
        item.id === itemId ? { ...item, expiryDate: date } : item
      )
    );
    setFormData(prev => ({
      ...prev,
      selectedItems: prev.selectedItems.map(item => 
        item.id === itemId ? { ...item, expiryDate: date } : item
      )
    }));
  };

  // Funkcja do obsługi checkbox "nie dotyczy" dla daty ważności
  const handleNoExpiryDateChange = (itemId, checked) => {
    setSelectedPoItems(prev => 
      prev.map(item => 
        item.id === itemId ? { 
          ...item, 
          noExpiryDate: checked,
          expiryDate: checked ? null : item.expiryDate // Wyczyść datę gdy zaznaczono "nie dotyczy"
        } : item
      )
    );
    setFormData(prev => ({
      ...prev,
      selectedItems: prev.selectedItems.map(item => 
        item.id === itemId ? { 
          ...item, 
          noExpiryDate: checked,
          expiryDate: checked ? null : item.expiryDate // Wyczyść datę gdy zaznaczono "nie dotyczy"
        } : item
      )
    }));
  };

  // Funkcja do ręcznego odświeżania pozycji PO
  const handleRefreshPoItems = async () => {
    console.log('🔄 Odświeżanie pozycji PO...');
    console.log('📋 Numer PO do wyszukania:', formData.poNumber);
    
    if (!formData.poNumber.trim()) {
      console.log('❌ Brak numeru PO');
      return;
    }
    
    // W trybie edycji zachowaj wybrane pozycje
    const currentSelectedItems = isEditMode ? formData.selectedItems : [];
    const currentSelectedPoItems = isEditMode ? selectedPoItems : [];
    
    // Wyczyść poprzednie pozycje PO (ale zachowaj wybrane w trybie edycji)
    setPoItems([]);
    if (!isEditMode) {
      setSelectedPoItems([]);
      setFormData(prev => ({
        ...prev,
        selectedItems: []
      }));
    }
    
    try {
      // Wyszukaj PO po numerze
      console.log('🔍 Wyszukiwanie PO...');
      const searchResults = await searchPurchaseOrdersQuick(formData.poNumber, 5);
      const matchingPo = searchResults.find(po => {
        const matchByNumber = po.number?.toLowerCase() === formData.poNumber.toLowerCase();
        const matchById = po.id?.toLowerCase() === formData.poNumber.toLowerCase();
        const match = matchByNumber || matchById;
        console.log(`🔍 Sprawdzam PO: number="${po.number}" id="${po.id}" vs "${formData.poNumber}"`);
        console.log(`   ↳ matchByNumber=${matchByNumber}, matchById=${matchById}, finalMatch=${match}`);
        return match;
      });
      
      if (matchingPo) {
        console.log('✅ Znaleziono PO:', matchingPo);
        await handlePoSelectionWithDetails(matchingPo, isEditMode);
      } else {
        console.log('❌ Nie znaleziono PO o numerze:', formData.poNumber);
        console.log('📋 Wyniki wyszukiwania:', searchResults.map(po => po.number));
      }
    } catch (error) {
      console.error('Błąd podczas odświeżania pozycji PO:', error);
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
    
    // Walidacja przewoźnika
    if (!formData.carrierName.trim()) {
      newErrors.carrierName = 'Nazwa przewoźnika jest wymagana';
    }
    if (!formData.vehicleRegistration.trim()) {
      newErrors.vehicleRegistration = 'Nr rejestracyjny samochodu jest wymagany';
    }
    if (!formData.vehicleTechnicalCondition) {
      newErrors.vehicleTechnicalCondition = 'Stan techniczny samochodu jest wymagany';
    }
    if (!formData.transportHygiene) {
      newErrors.transportHygiene = 'Higiena środka transportu i kierowcy jest wymagana';
    }
    
    // Walidacja informacji o towarze
    if (!formData.supplierName.trim()) {
      newErrors.supplierName = 'Nazwa dostawcy jest wymagana';
    }
    if (!formData.poNumber.trim()) {
      newErrors.poNumber = 'Numer zamówienia (PO) jest wymagany';
    }
    if (!formData.selectedItems || formData.selectedItems.length === 0) {
      newErrors.selectedItems = 'Wybierz co najmniej jedną pozycję z PO';
    } else {
      // Sprawdź czy dla każdej wybranej pozycji podano ilość rozładowaną
      const missingQuantities = formData.selectedItems.filter(item => !item.unloadedQuantity?.trim());
      if (missingQuantities.length > 0) {
        newErrors.selectedItems = 'Podaj ilość rozładowaną dla wszystkich wybranych pozycji';
      }
    }
    if (!formData.palletQuantity.trim()) {
      newErrors.palletQuantity = 'Ilość palet jest wymagana';
    }
    if (!formData.cartonsTubsQuantity.trim()) {
      newErrors.cartonsTubsQuantity = 'Ilość kartonów/tub jest wymagana';
    }
    if (!formData.weight.trim()) {
      newErrors.weight = 'Waga jest wymagana';
    }
    if (!formData.visualInspectionResult) {
      newErrors.visualInspectionResult = 'Wynik oceny wizualnej jest wymagany';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    try {
      // Przygotuj dane do zapisania
      const odpowiedzData = {
        email: formData.email,
        employeeName: formData.employeeName,
        position: formData.position,
        fillDate: formData.fillDate,
        fillTime: formData.fillTime,
        unloadingDate: formData.unloadingDate,
        unloadingTime: formData.unloadingTime,
        carrierName: formData.carrierName,
        vehicleRegistration: formData.vehicleRegistration,
        vehicleTechnicalCondition: formData.vehicleTechnicalCondition,
        transportHygiene: formData.transportHygiene,
        notes: formData.notes,
        supplierName: formData.supplierName,
        poNumber: formData.poNumber,
        selectedItems: formData.selectedItems.map(item => ({
          ...item,
          expiryDate: item.expiryDate ? item.expiryDate : null, // Zachowaj datę jako Date object
          noExpiryDate: item.noExpiryDate || false // Zachowaj stan checkbox "nie dotyczy"
        })),
        palletQuantity: formData.palletQuantity,
        cartonsTubsQuantity: formData.cartonsTubsQuantity,
        weight: formData.weight,
        visualInspectionResult: formData.visualInspectionResult,
        ecoCertificateNumber: formData.ecoCertificateNumber,
        goodsNotes: formData.goodsNotes,
        type: 'unloading-report'
      };

      // Obsługa załączników
      if (formData.documentsFile) {
        const poNumber = formData.poNumber || 'brak-po';
        const sanitizedPoNumber = poNumber.replace(/[^a-zA-Z0-9-_]/g, '_');
        const storageRef = ref(storage, `forms/rozladunek-towaru/${sanitizedPoNumber}/${Date.now()}-${formData.documentsFile.name}`);
        await uploadBytes(storageRef, formData.documentsFile);
        const fileUrl = await getDownloadURL(storageRef);
        odpowiedzData.documentsUrl = fileUrl;
        odpowiedzData.documentsName = formData.documentsFile.name;
      } else if (formData.documentsUrl) {
        // Zachowaj istniejące załączniki w trybie edycji
        odpowiedzData.documentsUrl = formData.documentsUrl;
        odpowiedzData.documentsName = formData.documentsName;
      }

      if (isEditMode && editId) {
        // Aktualizuj istniejący dokument
        odpowiedzData.updatedAt = serverTimestamp();
        const docRef = doc(db, 'Forms/RozladunekTowaru/Odpowiedzi', editId);
        await updateDoc(docRef, odpowiedzData);
        console.log('Formularz rozładunku towaru zaktualizowany z danymi:', odpowiedzData);
      } else {
        // Utwórz nowy dokument
        odpowiedzData.createdAt = serverTimestamp();
        const odpowiedziRef = collection(db, 'Forms/RozladunekTowaru/Odpowiedzi');
        await addDoc(odpowiedziRef, odpowiedzData);
        console.log('Formularz rozładunku towaru wysłany z danymi:', odpowiedzData);
      }
      
      setShowSuccess(true);
      
      // Reset formularza po pomyślnym wysłaniu (tylko w trybie tworzenia)
      if (!isEditMode) {
        setFormData({
          email: currentUser?.email || '',
          employeeName: '',
          position: '',
          fillDate: new Date(),
          fillTime: new Date().toLocaleTimeString('pl', { hour: '2-digit', minute: '2-digit' }),
          unloadingDate: new Date(),
          unloadingTime: '',
          carrierName: '',
          vehicleRegistration: '',
          vehicleTechnicalCondition: '',
          transportHygiene: '',
          notes: '',
          supplierName: '',
                  poNumber: '',
        selectedItems: [],
        palletQuantity: '',
          cartonsTubsQuantity: '',
          weight: '',
          visualInspectionResult: '',
          ecoCertificateNumber: '',
          goodsNotes: '',
          documentsFile: null,
          documentsUrl: '',
          documentsName: ''
        });
      }
      
      // Przekierowanie po 2 sekundach
      setTimeout(() => {
        navigate('/inventory/forms/responses');
      }, 2000);
      
    } catch (error) {
      console.error('Błąd podczas zapisywania formularza:', error);
      alert(`Wystąpił błąd podczas zapisywania formularza: ${error.message}`);
    }
  };

  const handleBack = () => {
    navigate('/inventory/forms');
  };

  return (
    <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={pl}>
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
          {/* Nagłówek formularza */}
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
              {isEditMode ? 'EDYCJA RAPORTU - ROZŁADUNEK TOWARU' : 'RAPORT - ROZŁADUNEK TOWARU'}
            </Typography>
            <Typography variant="body2" align="center" color="text.secondary" sx={{
              fontSize: { xs: '0.75rem', sm: '0.875rem' },
              mb: 2
            }}>
              {isEditMode ? 'Edytuj wypełniony formularz rozładunku towaru' : 'Formularz dokumentujący proces rozładunku towaru'}
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
            >
              Powrót
            </Button>
          </Box>

                  <Box component="form" onSubmit={handleSubmit} sx={{ px: { xs: 1, sm: 0 } }}>
            <Grid container spacing={{ xs: 2, sm: 3 }}>
            {/* Email użytkownika */}
            <Grid item xs={12}>
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
              />
            </Grid>
            
            {/* Sekcja 1: Identyfikacja */}
            <Grid item xs={12}>
              <Box sx={{ 
                mt: 2, 
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
                  fontWeight: 'bold'
                }}>
                  👤 Sekcja: Identyfikacja
                </Typography>
              </Box>
            </Grid>
            
            <Grid item xs={12}>
              <FormControl component="fieldset" required error={!!errors.employeeName}>
                <FormLabel component="legend">Imię i nazwisko: *</FormLabel>
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
                <FormLabel component="legend">Stanowisko: *</FormLabel>
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
                label="Data wypełnienia *"
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

            <Grid item xs={12} sm={6}>
                                              <Autocomplete
                 freeSolo
                 options={searchResults}
                 getOptionLabel={(option) => {
                   if (typeof option === 'string') return option;
                   return `${option.number || ''} - ${option.supplier?.name || 'Brak dostawcy'}`;
                 }}
                 groupBy={(option) => {
                   if (typeof option === 'string') return 'Historia wyszukiwania';
                   if (option.searchScore && option.searchScore >= 50) return 'Dokładne dopasowania';
                   return 'Inne wyniki';
                 }}
                 inputValue={poSearchQuery}
                 onInputChange={(event, newInputValue) => {
                   console.log('📝 Input zmieniony na:', newInputValue);
                   setPoSearchQuery(newInputValue);
                   setFormData(prev => ({
                     ...prev,
                     poNumber: newInputValue
                   }));
                   // Wyczyść pozycje jeśli tekst się zmienił
                   if (newInputValue !== formData.poNumber) {
                     setPoItems([]);
                     setSelectedPoItems([]);
                   }
                 }}
                 onChange={(event, newValue) => {
                   console.log('🎯 Wybór z listy:', newValue);
                   if (newValue && typeof newValue === 'object') {
                     // Użytkownik wybrał opcję z listy
                     console.log('✅ Wybrano PO:', newValue.number);
                     setPoSearchQuery(newValue.number);
                     setFormData(prev => ({
                       ...prev,
                       poNumber: newValue.number
                     }));
                     handlePoSelectionWithDetails(newValue, false);
                   }
                 }}
                 loading={poLoading}
                 renderInput={(params) => (
                   <TextField
                     {...params}
                     label="Numer zamówienia (PO) *"
                     required
                     error={!!errors.poNumber}
                     helperText={errors.poNumber || "Wpisz min. 2 znaki aby wyszukać PO (numer lub dostawca)"}
                     InputProps={{
                       ...params.InputProps,
                       startAdornment: (
                         <InputAdornment position="start">
                           <SearchIcon />
                         </InputAdornment>
                       ),
                       endAdornment: (
                         <>
                           {poLoading ? <CircularProgress color="inherit" size={20} /> : null}
                           {params.InputProps.endAdornment}
                         </>
                       ),
                     }}
                   />
                 )}
                 renderOption={(props, option) => (
                   <Box component="li" {...props}>
                     <Box>
                       <Typography variant="body2" fontWeight="bold">
                         {option.number}
                       </Typography>
                       <Typography variant="caption" color="text.secondary">
                         {option.supplier?.name || 'Brak dostawcy'} • {option.status || 'Brak statusu'}
                       </Typography>
                     </Box>
                   </Box>
                 )}
                 noOptionsText={
                   poSearchQuery && poSearchQuery.length >= 2 
                     ? `Nie znaleziono PO dla "${poSearchQuery}"` 
                     : "Wpisz min. 2 znaki aby wyszukać"
                 }
                 loadingText="Wyszukiwanie PO..."
               />
            </Grid>

            {/* Sekcja 2: Informacje o rozładunku */}
            <Grid item xs={12}>
              <Box sx={{ 
                mt: 2, 
                mb: 2, 
                p: 2, 
                borderRadius: 2, 
                background: theme.palette.mode === 'dark'
                  ? 'linear-gradient(45deg, rgba(255,152,0,0.1) 30%, rgba(76,175,80,0.1) 90%)'
                  : 'linear-gradient(45deg, #fff3e0 30%, #e8f5e8 90%)',
                border: '1px solid',
                borderColor: 'primary.light'
              }}>
                <Typography variant="h6" gutterBottom sx={{ 
                  color: 'primary.main',
                  fontWeight: 'bold'
                }}>
                  🚛 Sekcja: Informacje o rozładunku
                </Typography>
              </Box>
            </Grid>
            
            <Grid item xs={12} sm={6}>
              <DatePicker
                label="Data rozładunku *"
                value={formData.unloadingDate}
                onChange={handleDateChange('unloadingDate')}
                renderInput={(params) => <TextField {...params} fullWidth required />}
              />
            </Grid>
            
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Godzina rozładunku"
                name="unloadingTime"
                type="time"
                value={formData.unloadingTime}
                onChange={handleInputChange('unloadingTime')}
                InputLabelProps={{
                  shrink: true,
                }}
              />
            </Grid>
            
            <Grid item xs={12} sm={6}>
              <TextField
                label="Nazwa przewoźnika *"
                value={formData.carrierName}
                onChange={handleInputChange('carrierName')}
                fullWidth
                required
                error={!!errors.carrierName}
                helperText={errors.carrierName || "Tekst krótkiej odpowiedzi"}
              />
            </Grid>
            
            <Grid item xs={12} sm={6}>
              <TextField
                label="Nr rejestracyjny samochodu *"
                value={formData.vehicleRegistration}
                onChange={handleInputChange('vehicleRegistration')}
                fullWidth
                required
                error={!!errors.vehicleRegistration}
                helperText={errors.vehicleRegistration || "Tekst krótkiej odpowiedzi"}
              />
            </Grid>
            
            <Grid item xs={12}>
              <FormControl component="fieldset" required error={!!errors.vehicleTechnicalCondition}>
                <FormLabel component="legend">Stan techniczny samochodu: *</FormLabel>
                <RadioGroup
                  value={formData.vehicleTechnicalCondition}
                  onChange={handleInputChange('vehicleTechnicalCondition')}
                  row
                >
                  <FormControlLabel 
                    value="Bez uszkodzeń" 
                    control={<Radio />} 
                    label="Bez uszkodzeń" 
                  />
                  <FormControlLabel 
                    value="Uszkodzony" 
                    control={<Radio />} 
                    label="Uszkodzony" 
                  />
                  <FormControlLabel 
                    value="Inna odpowiedź" 
                    control={<Radio />} 
                    label="Inna odpowiedź" 
                  />
                </RadioGroup>
              </FormControl>
            </Grid>
            
            <Grid item xs={12}>
              <FormControl component="fieldset" required error={!!errors.transportHygiene}>
                <FormLabel component="legend">Higiena środka transportu i kierowcy: *</FormLabel>
                <RadioGroup
                  value={formData.transportHygiene}
                  onChange={handleInputChange('transportHygiene')}
                  row
                >
                  <FormControlLabel 
                    value="Prawidłowa" 
                    control={<Radio />} 
                    label="Prawidłowa" 
                  />
                  <FormControlLabel 
                    value="Nieprawidłowa" 
                    control={<Radio />} 
                    label="Nieprawidłowa" 
                  />
                  <FormControlLabel 
                    value="Inna odpowiedź" 
                    control={<Radio />} 
                    label="Inna odpowiedź" 
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
                placeholder="Ewentualne uwagi do stanu technicznego samochodu lub higieny"
                helperText="Tekst długiej odpowiedzi"
              />
            </Grid>

            {/* Sekcja 3: Informacje o towarze */}
            <Grid item xs={12}>
              <Box sx={{ 
                mt: 2, 
                mb: 2, 
                p: 2, 
                borderRadius: 2, 
                background: theme.palette.mode === 'dark'
                  ? 'linear-gradient(45deg, rgba(156,39,176,0.1) 30%, rgba(76,175,80,0.1) 90%)'
                  : 'linear-gradient(45deg, #f3e5f5 30%, #e8f5e8 90%)',
                border: '1px solid',
                borderColor: 'primary.light'
              }}>
                <Typography variant="h6" gutterBottom sx={{ 
                  color: 'primary.main',
                  fontWeight: 'bold'
                }}>
                  📦 Sekcja: Informacje o towarze
                </Typography>
              </Box>
            </Grid>
            
            <Grid item xs={12} sm={6}>
              <TextField
                label="Nazwa dostawcy *"
                value={formData.supplierName}
                onChange={handleInputChange('supplierName')}
                fullWidth
                required
                error={!!errors.supplierName}
                helperText={errors.supplierName || "Tekst krótkiej odpowiedzi"}
              />
            </Grid>
            
            <Grid item xs={12}>
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', mb: 2 }}>
                <Typography variant="h6" sx={{ flexGrow: 1 }}>
                  Pozycje dostarczonego towaru *
                </Typography>
                {formData.poNumber && (
                  <Button
                    variant="outlined"
                    size="small"
                    startIcon={<RefreshIcon />}
                    onClick={handleRefreshPoItems}
                    disabled={poLoading}
                    sx={{ minWidth: 'auto', flexShrink: 0 }}
                    title="Odśwież pozycje z PO"
                  >
                    Odśwież
                  </Button>
                )}
              </Box>
              
              {errors.selectedItems && (
                <Alert severity="error" sx={{ mb: 2 }}>
                  {errors.selectedItems}
                </Alert>
              )}
              
              {poItems.length === 0 ? (
                <Alert severity="info">
                  {formData.poNumber ? 'Ładowanie pozycji z PO...' : 'Najpierw wybierz numer PO'}
                </Alert>
              ) : (
                <TableContainer component={Paper} variant="outlined">
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell padding="checkbox">Dostarczone</TableCell>
                        <TableCell>Nazwa produktu</TableCell>
                        <TableCell>Ilość w PO</TableCell>
                        <TableCell>Waga</TableCell>
                        <TableCell>Ilość rozładowana *</TableCell>
                        <TableCell>Data ważności</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {poItems.map((item) => {
                        const isSelected = selectedPoItems.some(selected => selected.id === item.id);
                        const selectedItem = selectedPoItems.find(selected => selected.id === item.id);
                        
                        return (
                          <TableRow key={item.id}>
                            <TableCell padding="checkbox">
                              <Checkbox
                                checked={isSelected}
                                onChange={(e) => handleItemSelection(item, e.target.checked)}
                              />
                            </TableCell>
                            <TableCell>
                              <Typography variant="body2" fontWeight="bold">
                                {item.productName || 'Brak nazwy'}
                              </Typography>
                              {item.description && (
                                <Typography variant="caption" color="text.secondary">
                                  {item.description}
                                </Typography>
                              )}
                            </TableCell>
                            <TableCell>
                              {item.quantity ? `${item.quantity} ${item.unit}` : 'Brak danych'}
                            </TableCell>
                            <TableCell>
                              {item.weight > 0 ? `${item.weight} kg` : '-'}
                            </TableCell>
                            <TableCell>
                              <TextField
                                size="small"
                                placeholder="Ilość"
                                value={selectedItem?.unloadedQuantity || ''}
                                onChange={(e) => handleUnloadedQuantityChange(item.id, e.target.value)}
                                disabled={!isSelected}
                                sx={{ minWidth: 120 }}
                                error={isSelected && !selectedItem?.unloadedQuantity?.trim()}
                              />
                            </TableCell>
                            <TableCell>
                              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 160 }}>
                                <DatePicker
                                  value={selectedItem?.expiryDate || null}
                                  onChange={(date) => handleExpiryDateChange(item.id, date)}
                                  disabled={!isSelected || selectedItem?.noExpiryDate}
                                  renderInput={(params) => (
                                    <TextField
                                      {...params}
                                      size="small"
                                      placeholder="Data ważności"
                                      sx={{ minWidth: 140 }}
                                    />
                                  )}
                                />
                                {isSelected && (
                                  <FormControlLabel
                                    control={
                                      <Checkbox
                                        size="small"
                                        checked={selectedItem?.noExpiryDate || false}
                                        onChange={(e) => handleNoExpiryDateChange(item.id, e.target.checked)}
                                      />
                                    }
                                    label="Nie dotyczy"
                                    sx={{ 
                                      margin: 0,
                                      '& .MuiFormControlLabel-label': {
                                        fontSize: '0.75rem',
                                        color: 'text.secondary'
                                      }
                                    }}
                                  />
                                )}
                              </Box>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </Grid>
            
            <Grid item xs={12} sm={6}>
              <TextField
                label="Ilość palet *"
                value={formData.palletQuantity}
                onChange={handleInputChange('palletQuantity')}
                fullWidth
                required
                error={!!errors.palletQuantity}
                helperText={errors.palletQuantity || "Tekst krótkiej odpowiedzi"}
              />
            </Grid>
            
            <Grid item xs={12} sm={6}>
              <TextField
                label="Ilość kartonów/tub *"
                value={formData.cartonsTubsQuantity}
                onChange={handleInputChange('cartonsTubsQuantity')}
                fullWidth
                required
                error={!!errors.cartonsTubsQuantity}
                helperText={errors.cartonsTubsQuantity || "Tekst krótkiej odpowiedzi"}
              />
            </Grid>
            
            <Grid item xs={12} sm={6}>
              <TextField
                label="Waga *"
                value={formData.weight}
                onChange={handleInputChange('weight')}
                fullWidth
                required
                error={!!errors.weight}
                helperText={errors.weight || "Tekst krótkiej odpowiedzi"}
              />
            </Grid>
            
            <Grid item xs={12}>
              <FormControl component="fieldset" required error={!!errors.visualInspectionResult}>
                <FormLabel component="legend">Wynik oceny wizualnej (wygląd, zapach, opakowanie): *</FormLabel>
                <RadioGroup
                  value={formData.visualInspectionResult}
                  onChange={handleInputChange('visualInspectionResult')}
                  row
                >
                  <FormControlLabel 
                    value="Prawidłowy" 
                    control={<Radio />} 
                    label="Prawidłowy" 
                  />
                  <FormControlLabel 
                    value="Nieprawidłowy" 
                    control={<Radio />} 
                    label="Nieprawidłowy" 
                  />
                  <FormControlLabel 
                    value="Inna odpowiedź" 
                    control={<Radio />} 
                    label="Inna odpowiedź" 
                  />
                </RadioGroup>
              </FormControl>
            </Grid>
            
            <Grid item xs={12} sm={6}>
              <TextField
                label="Nr certyfikatu ekologicznego oraz jego data ważności"
                value={formData.ecoCertificateNumber}
                onChange={handleInputChange('ecoCertificateNumber')}
                fullWidth
                helperText="Tekst krótkiej odpowiedzi"
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
            
            <Grid item xs={12}>
              <Typography variant="body1" gutterBottom>
                Skan dokumentów dostawy:
              </Typography>
              <Button
                variant="outlined"
                component="label"
                startIcon={<CloudUploadIcon />}
                sx={{ mb: 1 }}
                fullWidth
              >
                {formData.documentsFile ? 'Zmień załącznik' : 'Dodaj plik'}
                <input
                  type="file"
                  hidden
                  accept=".pdf,.jpg,.jpeg,.png"
                  onChange={handleFileChange}
                />
              </Button>
              {formData.documentsFile && (
                <Box sx={{ 
                  mt: 2, 
                  p: 2, 
                  border: '1px solid #e0e0e0', 
                  borderRadius: 1, 
                  backgroundColor: 'rgba(0, 0, 0, 0.02)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 2
                }}>
                  <AttachFileIcon color="action" />
                  <Box sx={{ flexGrow: 1 }}>
                    <Typography variant="body2" color="text.primary">
                      {formData.documentsFile.name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {(formData.documentsFile.size / 1024 / 1024).toFixed(2)} MB
                    </Typography>
                  </Box>
                  <Button
                    size="small"
                    variant="outlined"
                    color="error"
                    startIcon={<DeleteIcon />}
                    onClick={() => setFormData(prev => ({ ...prev, documentsFile: null }))}
                  >
                    Usuń
                  </Button>
                </Box>
              )}
              
              {/* Wyświetl istniejące załączniki z serwera (tryb edycji) */}
              {!formData.documentsFile && formData.documentsUrl && (
                <Box sx={{ 
                  mt: 2, 
                  p: 2, 
                  border: '1px solid #e0e0e0', 
                  borderRadius: 1, 
                  backgroundColor: 'rgba(0, 0, 0, 0.02)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 2
                }}>
                  <AttachFileIcon color="action" />
                  <Box sx={{ flexGrow: 1 }}>
                    <Typography variant="body2" color="text.primary">
                      {formData.documentsName || 'Załącznik'}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Istniejący plik
                    </Typography>
                  </Box>
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<VisibilityIcon />}
                    onClick={() => window.open(formData.documentsUrl, '_blank')}
                  >
                    Zobacz
                  </Button>
                  <Button
                    size="small"
                    variant="outlined"
                    color="error"
                    startIcon={<DeleteIcon />}
                    onClick={() => setFormData(prev => ({ ...prev, documentsUrl: '', documentsName: '' }))}
                  >
                    Usuń
                  </Button>
                </Box>
              )}
              <Typography variant="caption" display="block" color="text.secondary" sx={{ mt: 1 }}>
                Dodaj plik PDF, JPG lub PNG zawierający skan dokumentów dostawy
              </Typography>
            </Grid>

            <Grid item xs={12}>
              <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end', mt: 3 }}>
                <Button
                  variant="outlined"
                  onClick={handleBack}
                >
                  Anuluj
                </Button>
                <Button
                  type="submit"
                  variant="contained"
                  startIcon={<SaveIcon />}
                >
                  {isEditMode ? 'Zapisz zmiany' : 'Prześlij raport'}
                </Button>
              </Box>
            </Grid>
          </Grid>
          </Box>

        <Snackbar
          open={showSuccess}
          autoHideDuration={6000}
          onClose={() => setShowSuccess(false)}
        >
          <Alert onClose={() => setShowSuccess(false)} severity="success" sx={{ width: '100%' }}>
            {isEditMode ? 'Raport rozładunku towaru został zaktualizowany pomyślnie!' : 'Raport rozładunku towaru został przesłany pomyślnie!'}
          </Alert>
        </Snackbar>

        {/* Powiadomienie o automatycznym uzupełnieniu */}
        <Snackbar 
          open={autoFillNotification} 
          autoHideDuration={4000} 
          onClose={() => setAutoFillNotification(false)}
          anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
        >
          <Alert 
            onClose={() => setAutoFillNotification(false)} 
            severity="info" 
            sx={{ width: '100%' }}
          >
            Automatycznie uzupełniono dane na podstawie wybranego PO
          </Alert>
        </Snackbar>
        </Paper>
      </Container>
    </LocalizationProvider>
  );
};

export default UnloadingReportFormPage; 