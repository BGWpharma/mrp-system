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
import { Save as SaveIcon, ArrowBack as ArrowBackIcon, CloudUpload as CloudUploadIcon, Search as SearchIcon, AttachFile as AttachFileIcon, Delete as DeleteIcon, Visibility as VisibilityIcon, CheckBox, CheckBoxOutlineBlank, Refresh as RefreshIcon, LocalShipping as LocalShippingIcon, Person as PersonIcon, Inventory as InventoryIcon } from '@mui/icons-material';
import { useTheme } from '@mui/material/styles';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from '../../hooks/useTranslation';
import { useInventoryEmployeeOptions, useInventoryPositionOptions } from '../../hooks/useFormOptions';
import { getAllPurchaseOrders, getPurchaseOrderById, searchPurchaseOrdersQuick, getRecentPurchaseOrders } from '../../services/purchaseOrderService';
import { useDebounce } from '../../hooks/useDebounce';
import { db, storage } from '../../services/firebase/config';
import { collection, addDoc, serverTimestamp, doc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useAuth } from '../../hooks/useAuth';
import { 
  getFormHeaderStyles, 
  getFormSectionStyles, 
  getFormContainerStyles, 
  getFormPaperStyles, 
  getFormButtonStyles,
  getFormActionsStyles 
} from '../../styles/formStyles';

const UnloadingReportFormPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser } = useAuth();
  const theme = useTheme();
  const { t } = useTranslation('forms');
  
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
    invoiceNumber: '',
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
  const [saving, setSaving] = useState(false);
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
          invoiceNumber: editData.invoiceNumber || '',
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
        const normalizedItems = items.map(item => {
          // Sprawdź czy to nowy format (z partiami) czy stary (bez partii)
          if (item.batches && Array.isArray(item.batches)) {
            // Nowy format - normalizuj daty w partiach
            return {
              ...item,
              batches: item.batches.map(batch => ({
                ...batch,
                expiryDate: batch.expiryDate ? 
                  (batch.expiryDate.toDate ? batch.expiryDate.toDate() : new Date(batch.expiryDate)) : 
                  null,
                noExpiryDate: batch.noExpiryDate || false
              }))
            };
          } else {
            // Stary format - przekonwertuj na nowy format z jedną partią
            return {
              ...item,
              batches: [{
                id: `${item.id}_batch_${Date.now()}`,
                batchNumber: '',
                unloadedQuantity: item.unloadedQuantity || '',
                expiryDate: item.expiryDate ? 
                  (item.expiryDate.toDate ? item.expiryDate.toDate() : new Date(item.expiryDate)) : 
                  null,
                noExpiryDate: item.noExpiryDate || false
              }]
            };
          }
        });
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
      // Dodaj pozycję z domyślnymi wartościami + pierwszą partią
      const newItem = {
        ...item,
        poItemId: item.poItemId || item.originalItem?.id, // ⭐ Zachowaj oryginalne ID pozycji PO
        batches: [{
          id: `${item.id}_batch_${Date.now()}`,
          batchNumber: '',
          unloadedQuantity: '',
          expiryDate: null,
          noExpiryDate: false
        }]
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

  // Nowe funkcje do zarządzania partiami
  const handleAddBatch = (itemId) => {
    const newBatch = {
      id: `${itemId}_batch_${Date.now()}`,
      batchNumber: '',
      unloadedQuantity: '',
      expiryDate: null,
      noExpiryDate: false
    };
    
    setSelectedPoItems(prev =>
      prev.map(item =>
        item.id === itemId
          ? { ...item, batches: [...(item.batches || []), newBatch] }
          : item
      )
    );
    setFormData(prev => ({
      ...prev,
      selectedItems: prev.selectedItems.map(item =>
        item.id === itemId
          ? { ...item, batches: [...(item.batches || []), newBatch] }
          : item
      )
    }));
  };

  const handleRemoveBatch = (itemId, batchId) => {
    setSelectedPoItems(prev =>
      prev.map(item =>
        item.id === itemId
          ? { ...item, batches: (item.batches || []).filter(b => b.id !== batchId) }
          : item
      )
    );
    setFormData(prev => ({
      ...prev,
      selectedItems: prev.selectedItems.map(item =>
        item.id === itemId
          ? { ...item, batches: (item.batches || []).filter(b => b.id !== batchId) }
          : item
      )
    }));
  };

  const handleBatchFieldChange = (itemId, batchId, field, value) => {
    setSelectedPoItems(prev =>
      prev.map(item =>
        item.id === itemId
          ? {
              ...item,
              batches: (item.batches || []).map(batch =>
                batch.id === batchId ? { ...batch, [field]: value } : batch
              )
            }
          : item
      )
    );
    setFormData(prev => ({
      ...prev,
      selectedItems: prev.selectedItems.map(item =>
        item.id === itemId
          ? {
              ...item,
              batches: (item.batches || []).map(batch =>
                batch.id === batchId ? { ...batch, [field]: value } : batch
              )
            }
          : item
      )
    }));
  };

  // LEGACY: Funkcje do obsługi starych danych (kompatybilność wsteczna)
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

  const handleNoExpiryDateChange = (itemId, checked) => {
    setSelectedPoItems(prev => 
      prev.map(item => 
        item.id === itemId ? { 
          ...item, 
          noExpiryDate: checked,
          expiryDate: checked ? null : item.expiryDate
        } : item
      )
    );
    setFormData(prev => ({
      ...prev,
      selectedItems: prev.selectedItems.map(item => 
        item.id === itemId ? { 
          ...item, 
          noExpiryDate: checked,
          expiryDate: checked ? null : item.expiryDate
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
      // Sprawdź czy dla każdej wybranej pozycji istnieją partie i czy są poprawnie wypełnione
      for (const item of formData.selectedItems) {
        const batches = item.batches || [];
        
        if (batches.length === 0) {
          newErrors.selectedItems = 'Każda pozycja musi mieć co najmniej jedną partię';
          break;
        }
        
        // Sprawdź czy wszystkie partie mają wypełnioną ilość
        const missingQuantities = batches.filter(batch => !batch.unloadedQuantity?.trim());
        if (missingQuantities.length > 0) {
          newErrors.selectedItems = 'Podaj ilość rozładowaną dla wszystkich partii';
          break;
        }
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
        invoiceNumber: formData.invoiceNumber,
        selectedItems: formData.selectedItems.map(item => ({
          ...item,
          batches: (item.batches || []).map(batch => ({
            ...batch,
            expiryDate: batch.expiryDate ? batch.expiryDate : null, // Zachowaj datę jako Date object
            noExpiryDate: batch.noExpiryDate || false // Zachowaj stan checkbox "nie dotyczy"
          }))
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
          invoiceNumber: '',
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
      
      // Przekierowanie po 1.2 sekundach
      setTimeout(() => {
        navigate('/inventory/forms/responses?tab=unloadingReport');
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
              {isEditMode ? t('inventoryForms.unloadingReport.editTitle') : t('inventoryForms.unloadingReport.formTitle')}
            </Typography>
            <Typography variant="body2" align="center" color="text.secondary" sx={{
              fontSize: { xs: '0.75rem', sm: '0.875rem' },
              mb: 2
            }}>
              {t('inventoryForms.unloadingReport.description')}
            </Typography>
            <Typography variant="body2" align="center" color="text.secondary" sx={{
              fontSize: { xs: '0.75rem', sm: '0.875rem' },
              mb: 0
            }}>
              {t('common.emergencyContact')} mateusz@bgwpharma.com
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
              {t('common.back')}
            </Button>
          </Box>

                  <Box component="form" onSubmit={handleSubmit} sx={{ px: { xs: 1, sm: 0 } }}>
            {/* Email użytkownika */}
            <TextField
              required
              fullWidth
              label={t('common.email')}
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
                {t('common.section', { current: 1, total: 3 })}
              </Typography>
              <Typography variant="h6" gutterBottom sx={{ fontWeight: 'bold', color: 'primary.main', display: 'flex', alignItems: 'center', gap: 1 }}>
                <PersonIcon className="section-icon" />
                {t('sections.identification')}
              </Typography>
              <Divider sx={{ mb: 3 }} />
              
              <Grid container spacing={{ xs: 2, sm: 3 }}>
                <Grid item xs={12}>
                  <FormControl component="fieldset" required error={!!errors.employeeName}>
                    <FormLabel component="legend">{t('inventoryForms.unloadingReport.employeeNameLabel')}</FormLabel>
                    <RadioGroup
                      value={formData.employeeName}
                      onChange={handleInputChange('employeeName')}
                    >
                      {employeeLoading ? (
                        <Typography variant="body2" color="text.secondary">{t('common.loadingOptions')}</Typography>
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
                    <FormLabel component="legend">{t('inventoryForms.unloadingReport.positionLabel')}</FormLabel>
                    <RadioGroup
                      value={formData.position}
                      onChange={handleInputChange('position')}
                    >
                      {positionLoading ? (
                        <Typography variant="body2" color="text.secondary">{t('common.loadingOptions')}</Typography>
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
                    label={t('inventoryForms.unloadingReport.fillDateLabel')}
                    value={formData.fillDate}
                    onChange={handleDateChange('fillDate')}
                    renderInput={(params) => <TextField {...params} fullWidth required />}
                  />
                </Grid>
                
                <Grid item xs={12} sm={6}>
                  <TextField
                    required
                    fullWidth
                    label={t('inventoryForms.unloadingReport.fillTimeLabel')}
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
                   return `${option.number || ''} - ${option.supplier?.name || t('common.noSupplier')}`;
                 }}
                 groupBy={(option) => {
                   if (typeof option === 'string') return t('inventoryForms.unloadingReport.searchHistory');
                   if (option.searchScore && option.searchScore >= 50) return t('inventoryForms.unloadingReport.exactMatches');
                   return t('inventoryForms.unloadingReport.otherResults');
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
                     label={t('inventoryForms.unloadingReport.poNumberLabel')}
                     required
                     error={!!errors.poNumber}
                     helperText={errors.poNumber || t('inventoryForms.unloadingReport.poSearchHelperText')}
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
                         {option.supplier?.name || t('common.noSupplier')} • {option.status || t('common.noStatus')}
                       </Typography>
                     </Box>
                   </Box>
                 )}
                 noOptionsText={
                   poSearchQuery && poSearchQuery.length >= 2 
                     ? t('inventoryForms.unloadingReport.noPoFoundFor', { query: poSearchQuery })
                     : t('inventoryForms.unloadingReport.typeMinChars')
                 }
                 loadingText={t('inventoryForms.unloadingReport.searchingPo')}
               />
            </Grid>

                <Grid item xs={12} sm={6}>
                  <TextField
                    label={t('inventoryForms.unloadingReport.invoiceNumberLabel')}
                    value={formData.invoiceNumber}
                    onChange={handleInputChange('invoiceNumber')}
                    fullWidth
                    helperText={t('inventoryForms.unloadingReport.invoiceNumberHelperText')}
                  />
                </Grid>
              </Grid>
            </Box>

            {/* SEKCJA 2 z 3 - INFORMACJE O ROZŁADUNKU */}
            <Box sx={getFormSectionStyles(theme, 'warning')}>
              <Typography variant="subtitle2" sx={{ mb: 1, color: 'warning.main', fontWeight: 'bold' }}>
                {t('common.section', { current: 2, total: 3 })}
              </Typography>
              <Typography variant="h6" gutterBottom sx={{ fontWeight: 'bold', color: 'warning.main', display: 'flex', alignItems: 'center', gap: 1 }}>
                <LocalShippingIcon className="section-icon" />
                {t('inventoryForms.unloadingReport.section2Title')}
              </Typography>
              <Divider sx={{ mb: 3 }} />
              
              <Grid container spacing={{ xs: 2, sm: 3 }}>
                <Grid item xs={12} sm={6}>
              <DatePicker
                label={t('inventoryForms.unloadingReport.unloadingDateLabel')}
                value={formData.unloadingDate}
                onChange={handleDateChange('unloadingDate')}
                renderInput={(params) => <TextField {...params} fullWidth required />}
              />
            </Grid>
            
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label={t('inventoryForms.unloadingReport.unloadingTimeLabel')}
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
                label={t('inventoryForms.unloadingReport.carrierNameLabel')}
                value={formData.carrierName}
                onChange={handleInputChange('carrierName')}
                fullWidth
                required
                error={!!errors.carrierName}
                helperText={errors.carrierName || t('common.shortAnswerText')}
              />
            </Grid>
            
            <Grid item xs={12} sm={6}>
              <TextField
                label={t('inventoryForms.unloadingReport.vehicleRegistrationLabel')}
                value={formData.vehicleRegistration}
                onChange={handleInputChange('vehicleRegistration')}
                fullWidth
                required
                error={!!errors.vehicleRegistration}
                helperText={errors.vehicleRegistration || t('common.shortAnswerText')}
              />
            </Grid>
            
            <Grid item xs={12}>
              <FormControl component="fieldset" required error={!!errors.vehicleTechnicalCondition}>
                <FormLabel component="legend">{t('inventoryForms.unloadingReport.vehicleTechnicalConditionLabel')}</FormLabel>
                <RadioGroup
                  value={formData.vehicleTechnicalCondition}
                  onChange={handleInputChange('vehicleTechnicalCondition')}
                  row
                >
                  <FormControlLabel 
                    value="Bez uszkodzeń" 
                    control={<Radio />} 
                    label={t('inventoryForms.unloadingReport.conditionNoDamage')} 
                  />
                  <FormControlLabel 
                    value="Uszkodzony" 
                    control={<Radio />} 
                    label={t('inventoryForms.unloadingReport.conditionDamaged')} 
                  />
                  <FormControlLabel 
                    value="Inna odpowiedź" 
                    control={<Radio />} 
                    label={t('common.otherAnswer')} 
                  />
                </RadioGroup>
              </FormControl>
            </Grid>
            
            <Grid item xs={12}>
              <FormControl component="fieldset" required error={!!errors.transportHygiene}>
                <FormLabel component="legend">{t('inventoryForms.unloadingReport.transportHygieneLabel')}</FormLabel>
                <RadioGroup
                  value={formData.transportHygiene}
                  onChange={handleInputChange('transportHygiene')}
                  row
                >
                  <FormControlLabel 
                    value="Prawidłowa" 
                    control={<Radio />} 
                    label={t('common.correct')} 
                  />
                  <FormControlLabel 
                    value="Nieprawidłowa" 
                    control={<Radio />} 
                    label={t('common.incorrect')} 
                  />
                  <FormControlLabel 
                    value="Inna odpowiedź" 
                    control={<Radio />} 
                    label={t('common.otherAnswer')} 
                  />
                </RadioGroup>
              </FormControl>
            </Grid>
            
            <Grid item xs={12}>
              <TextField
                label={t('common.notes')}
                value={formData.notes}
                onChange={handleInputChange('notes')}
                fullWidth
                multiline
                rows={4}
                placeholder={t('inventoryForms.unloadingReport.notesPlaceholder')}
                helperText={t('common.longAnswerText')}
              />
                </Grid>
              </Grid>
            </Box>

            {/* SEKCJA 3 z 3 - INFORMACJE O TOWARZE */}
            <Box sx={getFormSectionStyles(theme, 'success')}>
              <Typography variant="subtitle2" sx={{ mb: 1, color: 'success.main', fontWeight: 'bold' }}>
                {t('common.section', { current: 3, total: 3 })}
              </Typography>
              <Typography variant="h6" gutterBottom sx={{ fontWeight: 'bold', color: 'success.main', display: 'flex', alignItems: 'center', gap: 1 }}>
                <InventoryIcon className="section-icon" />
                {t('inventoryForms.unloadingReport.section3Title')}
              </Typography>
              <Divider sx={{ mb: 3 }} />
              
              <Grid container spacing={{ xs: 2, sm: 3 }}>
                <Grid item xs={12} sm={6}>
                  <TextField
                    label={t('inventoryForms.unloadingReport.supplierNameLabel')}
                    value={formData.supplierName}
                    onChange={handleInputChange('supplierName')}
                    fullWidth
                    required
                    error={!!errors.supplierName}
                    helperText={errors.supplierName || t('common.shortAnswerText')}
                  />
                </Grid>
                
                <Grid item xs={12}>
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', mb: 2 }}>
                <Typography variant="h6" sx={{ flexGrow: 1 }}>
                  {t('inventoryForms.unloadingReport.deliveredItemsTitle')}
                </Typography>
                {formData.poNumber && (
                  <Button
                    variant="outlined"
                    size="small"
                    startIcon={<RefreshIcon />}
                    onClick={handleRefreshPoItems}
                    disabled={poLoading}
                    sx={{ minWidth: 'auto', flexShrink: 0 }}
                    title={t('common.refresh')}
                  >
                    {t('common.refresh')}
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
                  {formData.poNumber ? t('inventoryForms.unloadingReport.loadingPoItems') : t('inventoryForms.unloadingReport.selectPoFirst')}
                </Alert>
              ) : (
                <TableContainer component={Paper} variant="outlined">
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell padding="checkbox">{t('inventoryForms.unloadingReport.tableDelivered')}</TableCell>
                        <TableCell>{t('inventoryForms.unloadingReport.tableProductName')}</TableCell>
                        <TableCell>{t('inventoryForms.unloadingReport.tableQuantityInPo')}</TableCell>
                        <TableCell>{t('inventoryForms.unloadingReport.tableWeight')}</TableCell>
                        <TableCell>{t('inventoryForms.unloadingReport.tableBatchNumber')}</TableCell>
                        <TableCell>{t('inventoryForms.unloadingReport.tableUnloadedQuantity')}</TableCell>
                        <TableCell>{t('inventoryForms.unloadingReport.tableExpiryDate')}</TableCell>
                        <TableCell align="center">{t('common.actions')}</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {poItems.map((item) => {
                        const isSelected = selectedPoItems.some(selected => selected.id === item.id);
                        const selectedItem = selectedPoItems.find(selected => selected.id === item.id);
                        const batches = selectedItem?.batches || [];
                        
                        return (
                          <React.Fragment key={item.id}>
                            {/* Pierwszy wiersz - informacje o produkcie + pierwsza partia */}
                            <TableRow>
                              <TableCell padding="checkbox" rowSpan={isSelected ? batches.length : 1}>
                                <Checkbox
                                  checked={isSelected}
                                  onChange={(e) => handleItemSelection(item, e.target.checked)}
                                />
                              </TableCell>
                              <TableCell rowSpan={isSelected ? batches.length : 1}>
                                <Typography variant="body2" fontWeight="bold">
                                  {item.productName || t('common.noName')}
                                </Typography>
                                {item.description && (
                                  <Typography variant="caption" color="text.secondary">
                                    {item.description}
                                  </Typography>
                                )}
                              </TableCell>
                              <TableCell rowSpan={isSelected ? batches.length : 1}>
                                {item.quantity ? `${item.quantity} ${item.unit}` : t('common.noData')}
                              </TableCell>
                              <TableCell rowSpan={isSelected ? batches.length : 1}>
                                {item.weight > 0 ? `${item.weight} kg` : '-'}
                              </TableCell>
                              
                              {/* Jeśli zaznaczone - pokaż pierwszą partię */}
                              {isSelected && batches.length > 0 ? (
                                <>
                                  <TableCell>
                                    <TextField
                                      size="small"
                                      placeholder={t('inventoryForms.unloadingReport.batchNumberPlaceholder')}
                                      value={batches[0]?.batchNumber || ''}
                                      onChange={(e) => handleBatchFieldChange(item.id, batches[0].id, 'batchNumber', e.target.value)}
                                      sx={{ minWidth: 100 }}
                                    />
                                  </TableCell>
                                  <TableCell>
                                    <TextField
                                      size="small"
                                      placeholder={t('common.quantity')}
                                      value={batches[0]?.unloadedQuantity || ''}
                                      onChange={(e) => handleBatchFieldChange(item.id, batches[0].id, 'unloadedQuantity', e.target.value)}
                                      sx={{ minWidth: 100 }}
                                      error={!batches[0]?.unloadedQuantity?.trim()}
                                    />
                                  </TableCell>
                                  <TableCell>
                                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 160 }}>
                                      <DatePicker
                                        value={batches[0]?.expiryDate || null}
                                        onChange={(date) => handleBatchFieldChange(item.id, batches[0].id, 'expiryDate', date)}
                                        disabled={batches[0]?.noExpiryDate}
                                        renderInput={(params) => (
                                          <TextField
                                            {...params}
                                            size="small"
                                            placeholder={t('inventoryForms.unloadingReport.expiryDatePlaceholder')}
                                            sx={{ minWidth: 140 }}
                                          />
                                        )}
                                      />
                                      <FormControlLabel
                                        control={
                                          <Checkbox
                                            size="small"
                                            checked={batches[0]?.noExpiryDate || false}
                                            onChange={(e) => handleBatchFieldChange(item.id, batches[0].id, 'noExpiryDate', e.target.checked)}
                                          />
                                        }
                                        label={t('common.notApplicable')}
                                        sx={{ 
                                          margin: 0,
                                          '& .MuiFormControlLabel-label': {
                                            fontSize: '0.75rem',
                                            color: 'text.secondary'
                                          }
                                        }}
                                      />
                                    </Box>
                                  </TableCell>
                                  <TableCell align="center">
                                    <Button
                                      size="small"
                                      variant="outlined"
                                      color="primary"
                                      onClick={() => handleAddBatch(item.id)}
                                      sx={{ minWidth: 'auto', px: 1 }}
                                    >
                                      + {t('inventoryForms.unloadingReport.batch')}
                                    </Button>
                                  </TableCell>
                                </>
                              ) : (
                                <>
                                  <TableCell>-</TableCell>
                                  <TableCell>-</TableCell>
                                  <TableCell>-</TableCell>
                                  <TableCell>-</TableCell>
                                </>
                              )}
                            </TableRow>
                            
                            {/* Dodatkowe wiersze dla kolejnych partii */}
                            {isSelected && batches.slice(1).map((batch, batchIndex) => (
                              <TableRow key={batch.id}>
                                <TableCell>
                                  <TextField
                                    size="small"
                                    placeholder={t('inventoryForms.unloadingReport.batchNumberPlaceholder')}
                                    value={batch.batchNumber || ''}
                                    onChange={(e) => handleBatchFieldChange(item.id, batch.id, 'batchNumber', e.target.value)}
                                    sx={{ minWidth: 100 }}
                                  />
                                </TableCell>
                                <TableCell>
                                  <TextField
                                    size="small"
                                    placeholder={t('common.quantity')}
                                    value={batch.unloadedQuantity || ''}
                                    onChange={(e) => handleBatchFieldChange(item.id, batch.id, 'unloadedQuantity', e.target.value)}
                                    sx={{ minWidth: 100 }}
                                    error={!batch.unloadedQuantity?.trim()}
                                  />
                                </TableCell>
                                <TableCell>
                                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 160 }}>
                                    <DatePicker
                                      value={batch.expiryDate || null}
                                      onChange={(date) => handleBatchFieldChange(item.id, batch.id, 'expiryDate', date)}
                                      disabled={batch.noExpiryDate}
                                      renderInput={(params) => (
                                        <TextField
                                          {...params}
                                          size="small"
                                          placeholder={t('inventoryForms.unloadingReport.expiryDatePlaceholder')}
                                          sx={{ minWidth: 140 }}
                                        />
                                      )}
                                    />
                                    <FormControlLabel
                                      control={
                                        <Checkbox
                                          size="small"
                                          checked={batch.noExpiryDate || false}
                                          onChange={(e) => handleBatchFieldChange(item.id, batch.id, 'noExpiryDate', e.target.checked)}
                                        />
                                      }
                                      label={t('common.notApplicable')}
                                      sx={{ 
                                        margin: 0,
                                        '& .MuiFormControlLabel-label': {
                                          fontSize: '0.75rem',
                                          color: 'text.secondary'
                                        }
                                      }}
                                    />
                                  </Box>
                                </TableCell>
                                <TableCell align="center">
                                  <Button
                                    size="small"
                                    variant="outlined"
                                    color="error"
                                    onClick={() => handleRemoveBatch(item.id, batch.id)}
                                    sx={{ minWidth: 'auto', px: 1 }}
                                  >
                                    {t('common.delete')}
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))}
                          </React.Fragment>
                        );
                      })}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </Grid>
            
            <Grid item xs={12} sm={6}>
              <TextField
                label={t('inventoryForms.unloadingReport.palletQuantityLabel')}
                value={formData.palletQuantity}
                onChange={handleInputChange('palletQuantity')}
                fullWidth
                error={!!errors.palletQuantity}
                helperText={errors.palletQuantity || t('common.shortAnswerText')}
              />
            </Grid>
            
            <Grid item xs={12} sm={6}>
              <TextField
                label={t('inventoryForms.unloadingReport.cartonsTubsQuantityLabel')}
                value={formData.cartonsTubsQuantity}
                onChange={handleInputChange('cartonsTubsQuantity')}
                fullWidth
                error={!!errors.cartonsTubsQuantity}
                helperText={errors.cartonsTubsQuantity || t('common.shortAnswerText')}
              />
            </Grid>
            
            <Grid item xs={12} sm={6}>
              <TextField
                label={t('inventoryForms.unloadingReport.weightLabel')}
                value={formData.weight}
                onChange={handleInputChange('weight')}
                fullWidth
                error={!!errors.weight}
                helperText={errors.weight || t('common.shortAnswerText')}
              />
            </Grid>
            
            <Grid item xs={12}>
              <FormControl component="fieldset" required error={!!errors.visualInspectionResult}>
                <FormLabel component="legend">{t('inventoryForms.unloadingReport.visualInspectionLabel')}</FormLabel>
                <RadioGroup
                  value={formData.visualInspectionResult}
                  onChange={handleInputChange('visualInspectionResult')}
                  row
                >
                  <FormControlLabel 
                    value="Prawidłowy" 
                    control={<Radio />} 
                    label={t('common.correct')} 
                  />
                  <FormControlLabel 
                    value="Nieprawidłowy" 
                    control={<Radio />} 
                    label={t('common.incorrect')} 
                  />
                  <FormControlLabel 
                    value="Inna odpowiedź" 
                    control={<Radio />} 
                    label={t('common.otherAnswer')} 
                  />
                </RadioGroup>
              </FormControl>
            </Grid>
            
            <Grid item xs={12} sm={6}>
              <TextField
                label={t('inventoryForms.unloadingReport.ecoCertificateLabel')}
                value={formData.ecoCertificateNumber}
                onChange={handleInputChange('ecoCertificateNumber')}
                fullWidth
                helperText={t('common.shortAnswerText')}
              />
            </Grid>
            
            <Grid item xs={12} sm={6}>
              <TextField
                label={t('common.notes')}
                value={formData.goodsNotes}
                onChange={handleInputChange('goodsNotes')}
                fullWidth
                helperText={t('common.shortAnswerText')}
              />
            </Grid>
            
            <Grid item xs={12}>
              <Typography variant="body1" gutterBottom>
                {t('inventoryForms.unloadingReport.documentScanLabel')}
              </Typography>
              <Button
                variant="outlined"
                component="label"
                startIcon={<CloudUploadIcon />}
                sx={{ mb: 1 }}
                fullWidth
              >
                {formData.documentsFile ? t('common.changeAttachment') : t('common.addFile')}
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
                    {t('common.delete')}
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
                      {formData.documentsName || t('common.attachment')}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {t('common.existingFile')}
                    </Typography>
                  </Box>
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<VisibilityIcon />}
                    onClick={() => window.open(formData.documentsUrl, '_blank')}
                  >
                    {t('common.view')}
                  </Button>
                  <Button
                    size="small"
                    variant="outlined"
                    color="error"
                    startIcon={<DeleteIcon />}
                    onClick={() => setFormData(prev => ({ ...prev, documentsUrl: '', documentsName: '' }))}
                  >
                    {t('common.delete')}
                  </Button>
                </Box>
              )}
              <Typography variant="caption" display="block" color="text.secondary" sx={{ mt: 1 }}>
                {t('inventoryForms.unloadingReport.documentScanHelperText')}
              </Typography>
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
                {t('common.cancel')}
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
                {saving ? t('common.saving') : (isEditMode ? t('common.saveChanges') : t('common.submitReport'))}
              </Button>
            </Box>
          </Box>

        <Snackbar
          open={showSuccess}
          autoHideDuration={6000}
          onClose={() => setShowSuccess(false)}
        >
          <Alert onClose={() => setShowSuccess(false)} severity="success" sx={{ width: '100%' }}>
            {isEditMode ? t('inventoryForms.unloadingReport.successMessageEdit') : t('inventoryForms.unloadingReport.successMessage')}
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
            {t('inventoryForms.unloadingReport.autoFillNotification')}
          </Alert>
        </Snackbar>
        </Paper>
      </Container>
    </LocalizationProvider>
  );
};

export default UnloadingReportFormPage; 