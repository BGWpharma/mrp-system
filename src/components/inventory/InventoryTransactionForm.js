// src/components/inventory/InventoryTransactionForm.js
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  TextField,
  Typography,
  Paper,
  Grid,
  FormControl,
  FormHelperText,
  Radio,
  RadioGroup,
  FormControlLabel,
  Divider,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  MenuItem,
  Select,
  InputLabel,
  InputAdornment,
  Checkbox,
  FormGroup,
  Switch,
  IconButton,
  Chip
} from '@mui/material';
import {
  Save as SaveIcon,
  ArrowBack as ArrowBackIcon,
  ArrowUpward as ReceiveIcon,
  ArrowDownward as IssueIcon,
  ExpandMore as ExpandMoreIcon,
  AccessTime as AccessTimeIcon,
  Calculate as CalculateIcon,
  Inventory as InventoryIcon,
  FileUpload as FileUploadIcon,
  Add as AddIcon,
  Delete as DeleteIcon,
  Label as LabelIcon
} from '@mui/icons-material';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { LocalizationProvider, DatePicker } from '@mui/x-date-pickers';
import { pl } from 'date-fns/locale';
import { getInventoryItemById, receiveInventory, issueInventory, getItemBatches, getAllWarehouses, getExistingBatchForPOItem, recalculateItemQuantity } from '../../services/inventory';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';
import { Timestamp } from 'firebase/firestore';
import ConfirmDialog from '../common/ConfirmDialog';
import { formatDate } from '../../utils/formatting';

const InventoryTransactionForm = ({ itemId, transactionType, initialData }) => {
  const [item, setItem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [batches, setBatches] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const { currentUser } = useAuth();
  const { showSuccess, showError } = useNotification();
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  
  const isReceive = transactionType === 'receive';
  
  const [transactionData, setTransactionData] = useState({
    quantity: '',
    reason: '',
    reference: '',
    notes: '',
    unitPrice: '',
    warehouseId: '',
    moNumber: '',
    orderNumber: '',
    orderId: '',
    source: '',
    sourceId: '',
    itemPOId: ''
  });

  const [batchData, setBatchData] = useState({
    useBatch: isReceive, // Domyślnie włączone dla przyjęcia
    batchNumber: '',
    expiryDate: null,
    batchNotes: '',
    batchId: '', // Dla wydania - ID wybranej partii
    noExpiryDate: false // Nowe pole do oznaczenia braku terminu ważności
  });

  // NOWE: Tablica partii dla przyjęcia wielu partii jednocześnie
  const [batchesData, setBatchesData] = useState([{
    id: `batch_${Date.now()}`,
    batchNumber: '',
    quantity: '',
    expiryDate: null,
    batchNotes: '',
    noExpiryDate: false
  }]);

  // Wymuś włączone informacje o partii dla przyjęcia (nie pozwalaj wyłączyć)
  useEffect(() => {
    if (isReceive) {
      setBatchData(prev => ({ ...prev, useBatch: true }));
    }
  }, [isReceive]);

  // Funkcje do zarządzania wieloma partiami
  const handleAddBatch = () => {
    setBatchesData(prev => [...prev, {
      id: `batch_${Date.now()}`,
      batchNumber: '',
      quantity: '',
      expiryDate: null,
      batchNotes: '',
      noExpiryDate: false
    }]);
  };

  const handleRemoveBatch = (batchId) => {
    if (batchesData.length <= 1) return; // Nie usuwaj ostatniej partii
    setBatchesData(prev => prev.filter(b => b.id !== batchId));
  };

  const handleBatchFieldChange = (batchId, field, value) => {
    setBatchesData(prev => prev.map(batch => 
      batch.id === batchId ? { ...batch, [field]: value } : batch
    ));
  };

  // Dodanie stanu dla certyfikatu
  const [certificateFile, setCertificateFile] = useState(null);
  const [certificatePreviewUrl, setCertificatePreviewUrl] = useState(null);

  // Stan dla dialogu wyboru partii
  const [batchChoiceDialog, setBatchChoiceDialog] = useState({
    open: false,
    existingBatch: null,
    pendingTransaction: null
  });

  useEffect(() => {
    if (initialData) {
      setTransactionData(prev => ({
        ...prev,
        quantity: initialData.quantity || '',
        reason: initialData.reason || (isReceive ? 'purchase' : 'use'),
        reference: initialData.reference || '',
        unitPrice: initialData.unitPrice !== undefined ? initialData.unitPrice : '',
        notes: initialData.notes || '',
        moNumber: initialData.moNumber || '',
        orderNumber: initialData.orderNumber || initialData.reference || '',
        orderId: initialData.orderId || '',
        source: initialData.source || 'purchase',
        sourceId: initialData.sourceId || '',
        itemPOId: initialData.itemPOId || initialData.id || ''
      }));
      
      // NOWY FORMAT: Obsługa wielu partii z raportu rozładunku
      if (initialData.batches && initialData.batches.length > 0) {
        console.log('📦 Inicjalizacja wielu partii z raportu rozładunku:', initialData.batches);
        
        setBatchesData(initialData.batches.map((batch, index) => ({
          id: `batch_${Date.now()}_${index}`,
          batchNumber: batch.batchNumber || '',
          quantity: batch.quantity || '',
          expiryDate: batch.expiryDate ? new Date(batch.expiryDate) : null,
          noExpiryDate: batch.noExpiryDate || false,
          batchNotes: ''
        })));
        
        // Dla kompatybilności: ustaw też pojedynczy batchData z pierwszą partią
        const firstBatch = initialData.batches[0];
        setBatchData(prev => ({
          ...prev,
          useBatch: true,
          batchNumber: firstBatch.batchNumber || '',
          expiryDate: firstBatch.expiryDate ? new Date(firstBatch.expiryDate) : null,
          noExpiryDate: firstBatch.noExpiryDate || false
        }));
      } else {
        // STARY FORMAT: Pojedyncza partia (kompatybilność wsteczna)
        setBatchData(prev => {
          const newBatchData = {
            ...prev,
            useBatch: true,
            batchNumber: initialData.lotNumber || initialData.batchNumber || ''
          };
          
          if (initialData.noExpiryDate === true) {
            console.log('Znaleziono "brak terminu ważności" w initialData');
            newBatchData.expiryDate = null;
            newBatchData.noExpiryDate = true;
          } else if (initialData.expiryDate) {
            console.log('Znaleziono datę ważności w initialData:', initialData.expiryDate);
            newBatchData.expiryDate = new Date(initialData.expiryDate);
            newBatchData.noExpiryDate = false;
          }
          
          return newBatchData;
        });
        
        // Ustaw pojedynczą partię w tablicy
        setBatchesData([{
          id: `batch_${Date.now()}`,
          batchNumber: initialData.lotNumber || initialData.batchNumber || '',
          quantity: initialData.quantity || '',
          expiryDate: initialData.expiryDate ? new Date(initialData.expiryDate) : null,
          noExpiryDate: initialData.noExpiryDate || false,
          batchNotes: ''
        }]);
      }
      
      // Dodaj logowanie dla debugowania
      console.log('Dane początkowe z formularza:', initialData);
    }
    
    let cancelled = false;

    const fetchData = async () => {
      try {
        setLoading(true);
        
        await recalculateItemQuantity(itemId);
        
        const inventoryItem = await getInventoryItemById(itemId);
        if (cancelled) return;
        setItem(inventoryItem);
        
        const availableWarehouses = await getAllWarehouses();
        if (cancelled) return;
        setWarehouses(availableWarehouses);
        
        if (availableWarehouses.length === 1) {
          setTransactionData(prev => ({
            ...prev,
            warehouseId: availableWarehouses[0].id
          }));
        }
        
        if (!isReceive && transactionData.warehouseId) {
          const fetchedBatches = await getItemBatches(itemId, transactionData.warehouseId);
          if (cancelled) return;
          setBatches(fetchedBatches.filter(batch => batch.quantity > 0));
        }
      } catch (error) {
        if (cancelled) return;
        showError('Błąd podczas pobierania danych: ' + error.message);
        console.error('Error fetching data:', error);
        navigate('/inventory');
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };
    
    fetchData();

    return () => { cancelled = true; };
  }, [itemId, navigate, showError, isReceive, transactionData.warehouseId, initialData]);

  // Obsługa zmiany pliku certyfikatu
  const handleCertificateFileChange = (event) => {
    if (event.target.files && event.target.files.length > 0) {
      const file = event.target.files[0];
      setCertificateFile(file);
      
      // Tworzenie URL dla podglądu
      if (file.type === 'application/pdf' || 
          file.type.startsWith('image/') || 
          file.type === 'application/msword' || 
          file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
        const previewUrl = URL.createObjectURL(file);
        setCertificatePreviewUrl(previewUrl);
      } else {
        setCertificatePreviewUrl(null);
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setProcessing(true);
    
    try {
      if (!transactionData.quantity || parseFloat(transactionData.quantity) <= 0) {
        throw new Error('Ilość musi być większa od zera');
      }
      
      if (!transactionData.warehouseId) {
        throw new Error('Należy wybrać magazyn');
      }
      
      // Przygotuj dane transakcji
      const transactionPayload = {
        reason: transactionData.reason,
        reference: transactionData.reference,
        notes: transactionData.notes,
        warehouseId: transactionData.warehouseId,
        unitPrice: isReceive ? parseFloat(transactionData.unitPrice) || 0 : undefined
      };
      
      // Dodaj dodatkowe informacje o pochodzeniu jeśli dostępne
      if (transactionData.moNumber) {
        transactionPayload.moNumber = transactionData.moNumber;
      }
      
      if (transactionData.orderNumber) {
        transactionPayload.orderNumber = transactionData.orderNumber;
      }
      
      if (transactionData.orderId) {
        transactionPayload.orderId = transactionData.orderId;
      }
      
      if (transactionData.source) {
        transactionPayload.source = transactionData.source;
      }
      
      if (transactionData.sourceId) {
        transactionPayload.sourceId = transactionData.sourceId;
      }
      
      if (transactionData.itemPOId) {
        transactionPayload.itemPOId = transactionData.itemPOId;
      }
      
      // Jeśli to przyjęcie z zakupu, upewnij się że ustawiliśmy source jako 'purchase'
      if (isReceive && transactionData.orderNumber && !transactionPayload.source) {
        transactionPayload.source = 'purchase';
      }
      
      // Dodaj informacje o partii, jeśli używamy partii
      // UWAGA: Dla przyjęcia z wieloma partiami, dane partii są dodawane osobno w pętli poniżej
      const useMultipleBatches = isReceive && batchesData.length > 0 && batchesData.some(b => b.quantity);
      
      if (batchData.useBatch && !useMultipleBatches) {
        if (isReceive) {
          // Dla przyjęcia z pojedynczą partią (stara ścieżka - kompatybilność wsteczna)
          transactionPayload.lotNumber = batchData.batchNumber;
          transactionPayload.batchNotes = batchData.batchNotes;
          
          // Obsługa daty ważności
          if (batchData.noExpiryDate) {
            transactionPayload.noExpiryDate = true;
          } else if (batchData.expiryDate) {
            const expiryDate = new Date(batchData.expiryDate);
            transactionPayload.expiryDate = Timestamp.fromDate(expiryDate);
          }
          
          // Dodaj certyfikat, jeśli został wybrany
          if (certificateFile) {
            transactionPayload.certificateFile = certificateFile;
          }
        } else {
          // Dla wydania - ID istniejącej partii
          if (!batchData.batchId) {
            throw new Error('Należy wybrać partię do wydania');
          }
          transactionPayload.batchId = batchData.batchId;
        }
      }
      
      // Wykonaj odpowiednią operację w zależności od typu transakcji
      let result;
      if (isReceive) {
        // NOWA LOGIKA: Obsługa wielu partii
        // Użyj nowej ścieżki jeśli mamy partie z wypełnionymi ilościami
        if (useMultipleBatches) {
          // Przyjęcie wielu partii
          console.log('📦 Przyjmowanie wielu partii:', batchesData);
          
          let totalQuantityReceived = 0;
          let batchesReceived = 0;
          
          for (const batch of batchesData) {
            const batchQuantity = parseFloat(batch.quantity);
            if (!batchQuantity || batchQuantity <= 0) continue;
            
            // Przygotuj payload dla tej partii
            // forceCreateNew: true wymusza utworzenie osobnej partii dla każdego LOT
            // (bez tego system łączyłby partie z tego samego PO/pozycji)
            const batchPayload = {
              ...transactionPayload,
              lotNumber: batch.batchNumber || '',
              batchNotes: batch.batchNotes || '',
              noExpiryDate: batch.noExpiryDate || false,
              forceCreateNew: true
            };
            
            // Obsługa daty ważności dla tej partii
            if (!batch.noExpiryDate && batch.expiryDate) {
              const expiryDate = new Date(batch.expiryDate);
              batchPayload.expiryDate = Timestamp.fromDate(expiryDate);
            }
            
            // Dodaj certyfikat tylko do pierwszej partii
            if (batchesReceived === 0 && certificateFile) {
              batchPayload.certificateFile = certificateFile;
            }
            
            console.log(`📦 Przyjmowanie partii ${batchesReceived + 1}: ${batchQuantity} ${item.unit}, LOT: ${batch.batchNumber || 'auto'}`);
            
            await receiveInventory(
              itemId,
              batchQuantity,
              batchPayload,
              currentUser.uid
            );
            
            totalQuantityReceived += batchQuantity;
            batchesReceived++;
          }
          
          if (batchesReceived > 0) {
            showSuccess(`Przyjęto ${totalQuantityReceived} ${item.unit} w ${batchesReceived} ${batchesReceived === 1 ? 'partii' : 'partiach'}`);
          } else {
            throw new Error('Nie podano ilości dla żadnej partii');
          }
        } else {
          // STARA LOGIKA: Pojedyncza partia (kompatybilność wsteczna)
          // Sprawdź czy istnieje już partia dla tej pozycji PO
          if (transactionData.source === 'purchase' && transactionData.orderId && transactionData.itemPOId && transactionData.warehouseId) {
            console.log('Sprawdzam czy istnieje partia dla PO:', {
              itemId,
              orderId: transactionData.orderId,
              itemPOId: transactionData.itemPOId,
              warehouseId: transactionData.warehouseId
            });
            
            const existingBatch = await getExistingBatchForPOItem(
              itemId,
              transactionData.orderId,
              transactionData.itemPOId,
              transactionData.warehouseId
            );
            
            if (existingBatch) {
              console.log('Znaleziono istniejącą partię:', existingBatch);
              // Zapisz dane transakcji i pokaż dialog wyboru
              setBatchChoiceDialog({
                open: true,
                existingBatch,
                pendingTransaction: {
                  itemId,
                  quantity: transactionData.quantity,
                  transactionPayload,
                  userId: currentUser.uid
                }
              });
              setProcessing(false);
              return; // Przerwij wykonanie - czekamy na wybór użytkownika
            }
          }
          
          // Jeśli nie ma istniejącej partii, wykonaj normalne przyjęcie
          result = await receiveInventory(
            itemId, 
            transactionData.quantity, 
            transactionPayload,
            currentUser.uid
          );
          // Pokazuj odpowiedni komunikat w zależności od tego czy partia została zaktualizowana czy utworzona nowa
          if (result.isNewBatch !== undefined) {
            if (result.isNewBatch) {
              showSuccess(`Przyjęto ${transactionData.quantity} ${item.unit} na stan magazynu - utworzono nową partię`);
            } else {
              showSuccess(`Przyjęto ${transactionData.quantity} ${item.unit} na stan magazynu - dodano do istniejącej partii`);
            }
          } else {
            // Fallback dla przypadku gdy nie mamy informacji o partii
            showSuccess(`Przyjęto ${transactionData.quantity} ${item.unit} na stan magazynu`);
          }
        }
      } else {
        result = await issueInventory(
          itemId, 
          transactionData.quantity, 
          transactionPayload,
          currentUser.uid
        );
        showSuccess(`Wydano ${transactionData.quantity} ${item.unit} ze stanu magazynu`);
      }
      
      // Sprawdź, czy jest parametr returnTo w URL
      const urlParams = new URLSearchParams(window.location.search);
      const returnTo = urlParams.get('returnTo');
      
      if (returnTo) {
        // Jeśli jest, przekieruj tam
        navigate(returnTo);
      } else {
        // Przekieruj do strony magazynu (domyślnie)
        navigate('/inventory');
      }
    } catch (error) {
      showError('Błąd podczas przetwarzania transakcji: ' + error.message);
      console.error('Transaction error:', error);
      setProcessing(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setTransactionData(prev => ({ ...prev, [name]: value }));
  };

  const handleBatchChange = (e) => {
    const { name, value, checked, type } = e.target;
    // Dla przyjęcia nie pozwalamy wyłączyć sekcji partii
    if (isReceive && name === 'useBatch') return;
    setBatchData(prev => ({ 
      ...prev, 
      [name]: type === 'checkbox' ? checked : value 
    }));
  };

  const handleDateChange = (date) => {
    setBatchData(prev => ({ ...prev, expiryDate: date }));
  };

  // Funkcje obsługi dialogu wyboru partii
  const handleBatchChoiceConfirm = async (addToExisting) => {
    setProcessing(true);
    try {
      const { pendingTransaction } = batchChoiceDialog;
      let result;
      
      if (addToExisting) {
        // Dodaj flagę do transactionPayload informującą że ma być dodane do istniejącej partii
        pendingTransaction.transactionPayload.forceAddToExisting = true;
        result = await receiveInventory(
          pendingTransaction.itemId,
          pendingTransaction.quantity,
          pendingTransaction.transactionPayload,
          pendingTransaction.userId
        );
        showSuccess(`Przyjęto ${pendingTransaction.quantity} ${item.unit} - dodano do istniejącej partii`);
      } else {
        // Utwórz nową partię - dodaj flagę informującą że ma być utworzona nowa partia
        pendingTransaction.transactionPayload.forceCreateNew = true;
        result = await receiveInventory(
          pendingTransaction.itemId,
          pendingTransaction.quantity,
          pendingTransaction.transactionPayload,
          pendingTransaction.userId
        );
        showSuccess(`Przyjęto ${pendingTransaction.quantity} ${item.unit} - utworzono nową partię`);
      }
      
      // Zamknij dialog
      setBatchChoiceDialog({ open: false, existingBatch: null, pendingTransaction: null });
      
      // Przekieruj użytkownika
      const urlParams = new URLSearchParams(window.location.search);
      const returnTo = urlParams.get('returnTo');
      navigate(returnTo || '/inventory');
      
    } catch (error) {
      showError('Błąd podczas przetwarzania transakcji: ' + error.message);
      setProcessing(false);
    }
  };

  const handleBatchChoiceCancel = () => {
    setBatchChoiceDialog({ open: false, existingBatch: null, pendingTransaction: null });
    setProcessing(false);
  };

  // Usuń podgląd przy odmontowaniu komponentu
  useEffect(() => {
    return () => {
      if (certificatePreviewUrl) {
        URL.revokeObjectURL(certificatePreviewUrl);
      }
    };
  }, [certificatePreviewUrl]);

  if (loading) {
    return <div>Ładowanie danych...</div>;
  }

  if (!item) {
    return <div>Nie znaleziono pozycji magazynowej</div>;
  }

  return (
    <Box component="form" onSubmit={handleSubmit} noValidate>
      <Paper 
        elevation={2} 
        sx={{ 
          p: 2, 
          mb: 3, 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          background: theme => theme.palette.mode === 'dark' 
            ? 'linear-gradient(to right, rgba(40,50,80,1), rgba(30,40,70,1))' 
            : 'linear-gradient(to right, #f5f7fa, #e4eaf0)'
        }}
      >
        <Button 
          variant="outlined"
          startIcon={<ArrowBackIcon />} 
          onClick={() => navigate('/inventory')}
          sx={{ 
            borderRadius: '8px', 
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
          }}
        >
          Powrót
        </Button>
        <Typography variant="h5" sx={{ fontWeight: 'medium' }}>
          {isReceive ? 'Przyjęcie towaru' : 'Wydanie towaru'}
        </Typography>
        <Button 
          variant="contained" 
          color={isReceive ? 'success' : 'warning'} 
          type="submit"
          startIcon={isReceive ? <ReceiveIcon /> : <IssueIcon />}
          disabled={processing}
          sx={{ 
            borderRadius: '8px', 
            boxShadow: '0 4px 6px rgba(0,0,0,0.15)',
            px: 3
          }}
        >
          {processing ? 'Przetwarzanie...' : (isReceive ? 'Przyjmij' : 'Wydaj')}
        </Button>
      </Paper>

      <Paper 
        elevation={3} 
        sx={{ 
          p: 0, 
          mb: 3, 
          borderRadius: '12px', 
          overflow: 'hidden'
        }}
      >
        <Box 
          sx={{ 
            p: 2, 
            display: 'flex', 
            alignItems: 'center', 
            gap: 1,
            borderBottom: '1px solid',
            borderColor: 'divider',
            bgcolor: theme => theme.palette.mode === 'dark' 
              ? 'rgba(25, 35, 55, 0.5)' 
              : 'rgba(245, 247, 250, 0.8)'
          }}
        >
          <InventoryIcon color="primary" />
          <Typography variant="h6" fontWeight="500">Informacje o pozycji</Typography>
        </Box>
        
        <Box sx={{ p: 3 }}>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
              <Typography variant="body1">
                <strong>Nazwa:</strong> {item.name}
              </Typography>
            </Grid>
            <Grid item xs={12} sm={6}>
              <Typography variant="body1">
                <strong>Kategoria:</strong> {item.category || 'Brak kategorii'}
              </Typography>
            </Grid>
            <Grid item xs={12} sm={6}>
              <Typography variant="body1">
                <strong>Aktualny stan:</strong> {item.quantity} {item.unit}
              </Typography>
            </Grid>
            <Grid item xs={12} sm={6}>
              <Typography variant="body1">
                <strong>Lokalizacja:</strong> {item.location || 'Nie określono'}
              </Typography>
            </Grid>
            {item.description && (
              <Grid item xs={12}>
                <Typography variant="body1">
                  <strong>Opis:</strong> {item.description}
                </Typography>
              </Grid>
            )}
          </Grid>
        </Box>
      </Paper>

      <Paper 
        elevation={3} 
        sx={{ 
          p: 0, 
          mb: 3, 
          borderRadius: '12px', 
          overflow: 'hidden'
        }}
      >
        <Box 
          sx={{ 
            p: 2, 
            display: 'flex', 
            alignItems: 'center', 
            gap: 1,
            borderBottom: '1px solid',
            borderColor: 'divider',
            bgcolor: theme => theme.palette.mode === 'dark' 
              ? 'rgba(25, 35, 55, 0.5)' 
              : 'rgba(245, 247, 250, 0.8)'
          }}
        >
          <CalculateIcon color="primary" />
          <Typography variant="h6" fontWeight="500">Szczegóły transakcji</Typography>
        </Box>
        
        <Box sx={{ p: 3 }}>
          <Grid container spacing={3}>
            <Grid item xs={12} sm={6} md={4}>
              <FormControl fullWidth required sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}>
                <InputLabel id="warehouse-label">Magazyn</InputLabel>
                <Select
                  labelId="warehouse-label"
                  name="warehouseId"
                  value={transactionData.warehouseId}
                  onChange={handleChange}
                  label="Magazyn"
                  size="small"
                  error={!transactionData.warehouseId}
                >
                  <MenuItem value="">
                    <em>Wybierz magazyn</em>
                  </MenuItem>
                  {warehouses.map((warehouse) => (
                    <MenuItem key={warehouse.id} value={warehouse.id}>
                      {warehouse.name}
                    </MenuItem>
                  ))}
                </Select>
                {!transactionData.warehouseId && (
                  <FormHelperText error>Wybór magazynu jest wymagany</FormHelperText>
                )}
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6} md={4}>
              <TextField
                required
                label="Ilość"
                name="quantity"
                type="number"
                value={transactionData.quantity}
                onChange={handleChange}
                fullWidth
                size="small"
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
                inputProps={{ 
                  min: 0.01, 
                  step: "0.01" 
                }}
                error={isReceive ? false : (parseFloat(transactionData.quantity || 0) > item.quantity)}
                helperText={isReceive ? 'Wprowadź ilość do przyjęcia' : (parseFloat(transactionData.quantity || 0) > item.quantity ? 'Ilość do wydania przekracza dostępny stan magazynowy' : undefined)}
              />
            </Grid>
            {isReceive && (
              <Grid item xs={12} sm={6} md={4}>
                <TextField
                  fullWidth
                  label="Cena jednostkowa (EUR)"
                  name="unitPrice"
                  type="number"
                  value={transactionData.unitPrice}
                  onChange={handleChange}
                  inputProps={{ min: 0, step: 0.01 }}
                  helperText="Używana do kalkulacji kosztów (receptury/produkcja)"
                  required
                  size="small"
                  sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
                />
              </Grid>
            )}
            <Grid item xs={12}>
              <FormControl component="fieldset">
                <Typography variant="subtitle2" gutterBottom>Powód</Typography>
                <RadioGroup
                  name="reason"
                  value={transactionData.reason}
                  onChange={handleChange}
                  row
                >
                  {isReceive ? (
                    <>
                      <FormControlLabel value="purchase" control={<Radio />} label="Zakup" />
                      <FormControlLabel value="return" control={<Radio />} label="Zwrot" />
                      <FormControlLabel value="production" control={<Radio />} label="Z produkcji" />
                      <FormControlLabel value="other" control={<Radio />} label="Inny" />
                    </>
                  ) : (
                    <>
                      <FormControlLabel value="production" control={<Radio />} label="Do produkcji" />
                      <FormControlLabel value="sale" control={<Radio />} label="Sprzedaż" />
                      <FormControlLabel value="defect" control={<Radio />} label="Wada/Zniszczenie" />
                      <FormControlLabel value="other" control={<Radio />} label="Inny" />
                    </>
                  )}
                </RadioGroup>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6} md={6}>
              <TextField
                label="Numer referencyjny"
                name="reference"
                value={transactionData.reference || ''}
                onChange={handleChange}
                fullWidth
                size="small"
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
                placeholder={isReceive ? "Nr faktury, zamówienia, itp." : "Nr zlecenia produkcyjnego, itp."}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="Notatki"
                name="notes"
                value={transactionData.notes || ''}
                onChange={handleChange}
                fullWidth
                multiline
                rows={3}
                size="small"
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
                placeholder={isReceive ? 'Np. numer dostawy, dodatkowe instrukcje...' : 'Dodatkowe informacje dotyczące transakcji...'}
              />
            </Grid>
          </Grid>
        </Box>
      </Paper>

      <Paper 
        elevation={3} 
        sx={{ 
          p: 0, 
          mb: 3, 
          borderRadius: '12px', 
          overflow: 'hidden'
        }}
      >
        <Box 
          sx={{ 
            p: 2, 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center', 
            borderBottom: '1px solid',
            borderColor: 'divider',
            bgcolor: theme => theme.palette.mode === 'dark' 
              ? 'rgba(25, 35, 55, 0.5)' 
              : 'rgba(245, 247, 250, 0.8)'
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <AccessTimeIcon color="primary" />
            <Typography variant="h6" fontWeight="500">
              {isReceive ? 'Informacje o partii' : 'Wybór partii'}
            </Typography>
          </Box>
          {isReceive ? (
            <Typography variant="body2" color="text.secondary">
              Informacje o partii (wymagane)
            </Typography>
          ) : (
            <FormControlLabel 
              control={
                <Switch 
                  checked={batchData.useBatch} 
                  onChange={handleBatchChange}
                  name="useBatch"
                  color="primary"
                  size="small"
                />
              } 
              label={
                <Typography variant="body2" color="text.secondary">
                  {"Wybierz konkretną partię"}
                </Typography>
              }
            />
          )}
        </Box>

        <Box sx={{ p: 3 }}>
          {batchData.useBatch && (
            <Grid container spacing={3}>
              {isReceive ? (
                // Formularz dla przyjęcia - obsługa WIELU PARTII
                <>
                  {/* Nagłówek z przyciskiem dodawania partii */}
                  <Grid item xs={12}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                      <Typography variant="subtitle2" color="primary" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <LabelIcon fontSize="small" />
                        Partie do przyjęcia ({batchesData.length})
                      </Typography>
                      <Button
                        size="small"
                        variant="outlined"
                        startIcon={<AddIcon />}
                        onClick={handleAddBatch}
                      >
                        Dodaj partię
                      </Button>
                    </Box>
                  </Grid>
                  
                  {/* Lista partii */}
                  {batchesData.map((batch, index) => (
                    <Grid item xs={12} key={batch.id}>
                      <Paper 
                        variant="outlined" 
                        sx={{ 
                          p: 2, 
                          borderRadius: 2,
                          borderColor: batch.batchNumber ? 'primary.main' : 'divider',
                          borderWidth: batch.batchNumber ? 2 : 1,
                          backgroundColor: theme => theme.palette.mode === 'dark' 
                            ? 'rgba(25, 35, 55, 0.3)' 
                            : 'rgba(245, 247, 250, 0.5)'
                        }}
                      >
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Typography variant="subtitle2" fontWeight={600}>
                              Partia {index + 1}
                            </Typography>
                            {batch.batchNumber && (
                              <Chip 
                                label={`LOT: ${batch.batchNumber}`} 
                                size="small" 
                                color="primary" 
                                variant="outlined"
                              />
                            )}
                          </Box>
                          {batchesData.length > 1 && (
                            <IconButton 
                              size="small" 
                              color="error" 
                              onClick={() => handleRemoveBatch(batch.id)}
                              title="Usuń partię"
                            >
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          )}
                        </Box>
                        
                        <Grid container spacing={2}>
                          <Grid item xs={12} sm={6} md={3}>
                            <TextField
                              label="Numer LOT"
                              value={batch.batchNumber}
                              onChange={(e) => handleBatchFieldChange(batch.id, 'batchNumber', e.target.value)}
                              fullWidth
                              size="small"
                              placeholder="Nr partii dostawcy"
                              helperText="Puste = auto LOT"
                            />
                          </Grid>
                          <Grid item xs={12} sm={6} md={2}>
                            <TextField
                              label="Ilość"
                              type="number"
                              value={batch.quantity}
                              onChange={(e) => handleBatchFieldChange(batch.id, 'quantity', e.target.value)}
                              fullWidth
                              size="small"
                              required
                              inputProps={{ min: 0.01, step: "0.01" }}
                              InputProps={{
                                endAdornment: item?.unit ? <InputAdornment position="end">{item.unit}</InputAdornment> : null
                              }}
                              error={!batch.quantity || parseFloat(batch.quantity) <= 0}
                            />
                          </Grid>
                          <Grid item xs={12} sm={6} md={4}>
                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                              <FormControlLabel
                                control={
                                  <Checkbox
                                    checked={batch.noExpiryDate}
                                    onChange={(e) => {
                                      handleBatchFieldChange(batch.id, 'noExpiryDate', e.target.checked);
                                      if (e.target.checked) {
                                        handleBatchFieldChange(batch.id, 'expiryDate', null);
                                      }
                                    }}
                                    size="small"
                                  />
                                }
                                label={<Typography variant="body2">Bez daty ważności</Typography>}
                              />
                              {!batch.noExpiryDate && (
                                <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={pl}>
                                  <DatePicker
                                    label="Data ważności"
                                    value={batch.expiryDate}
                                    onChange={(date) => handleBatchFieldChange(batch.id, 'expiryDate', date)}
                                    renderInput={(params) => 
                                      <TextField 
                                        {...params} 
                                        fullWidth
                                        size="small"
                                      />
                                    }
                                    disablePast
                                  />
                                </LocalizationProvider>
                              )}
                            </Box>
                          </Grid>
                          <Grid item xs={12} sm={6} md={3}>
                            <TextField
                              label="Uwagi"
                              value={batch.batchNotes || ''}
                              onChange={(e) => handleBatchFieldChange(batch.id, 'batchNotes', e.target.value)}
                              fullWidth
                              size="small"
                              placeholder="Np. numer CoA"
                            />
                          </Grid>
                        </Grid>
                      </Paper>
                    </Grid>
                  ))}
                  
                  {/* Podsumowanie ilości */}
                  {batchesData.length > 0 && (
                    <Grid item xs={12}>
                      <Box sx={{ 
                        display: 'flex', 
                        justifyContent: 'flex-end', 
                        alignItems: 'center', 
                        gap: 2,
                        p: 1,
                        backgroundColor: theme => theme.palette.mode === 'dark' 
                          ? 'rgba(25, 118, 210, 0.1)' 
                          : 'rgba(25, 118, 210, 0.05)',
                        borderRadius: 1
                      }}>
                        <Typography variant="body2" color="text.secondary">
                          Suma ilości ze wszystkich partii:
                        </Typography>
                        <Typography variant="h6" color="primary" fontWeight={600}>
                          {batchesData.reduce((sum, b) => sum + (parseFloat(b.quantity) || 0), 0).toFixed(2)} {item?.unit || ''}
                        </Typography>
                      </Box>
                    </Grid>
                  )}
                  
                  {/* Certyfikat produktu (opcjonalnie) w akordeonie dla mniejszego hałasu wizualnego */}
                  <Grid item xs={12}>
                    <Accordion>
                      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                        <Typography variant="subtitle2">Certyfikat produktu (opcjonalnie)</Typography>
                      </AccordionSummary>
                      <AccordionDetails>
                        <Box>
                          <input
                            accept="application/pdf,image/*,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                            style={{ display: 'none' }}
                            id="certificate-file-upload"
                            type="file"
                            onChange={handleCertificateFileChange}
                            ref={fileInputRef}
                          />
                          <label htmlFor="certificate-file-upload">
                            <Button
                              variant="outlined"
                              component="span"
                              startIcon={<FileUploadIcon />}
                              fullWidth
                              sx={{ mb: 2 }}
                            >
                              Wybierz plik certyfikatu
                            </Button>
                          </label>
                          {certificateFile && (
                            <Box sx={{ mb: 2 }}>
                              <Typography variant="body2" gutterBottom>
                                Wybrany plik: {certificateFile.name}
                              </Typography>
                              {certificatePreviewUrl && (
                                <Box sx={{ mt: 2, border: '1px solid #e0e0e0', borderRadius: 1, p: 2 }}>
                                  <Typography variant="subtitle2" gutterBottom>
                                    Podgląd dokumentu:
                                  </Typography>
                                  {certificateFile.type.startsWith('image/') ? (
                                    <Box sx={{ mt: 1, textAlign: 'center' }}>
                                      <img 
                                        src={certificatePreviewUrl} 
                                        alt="Podgląd certyfikatu" 
                                        style={{ maxWidth: '100%', maxHeight: '300px', objectFit: 'contain' }} 
                                      />
                                    </Box>
                                  ) : certificateFile.type === 'application/pdf' ? (
                                    <Box sx={{ mt: 1, textAlign: 'center', height: '300px' }}>
                                      <iframe 
                                        src={certificatePreviewUrl} 
                                        title="Podgląd PDF" 
                                        width="100%" 
                                        height="100%" 
                                        style={{ border: 'none' }}
                                      />
                                    </Box>
                                  ) : (
                                    <Typography variant="body2" color="text.secondary">
                                      Podgląd dla tego typu pliku nie jest dostępny. Dokument zostanie zapisany w systemie.
                                    </Typography>
                                  )}
                                </Box>
                              )}
                            </Box>
                          )}
                        </Box>
                      </AccordionDetails>
                    </Accordion>
                  </Grid>
                </>
              ) : (
                // Formularz dla wydania
                <Grid item xs={12}>
                  <FormControl fullWidth required error={batchData.useBatch && !batchData.batchId} sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}>
                    <InputLabel>Wybierz partię</InputLabel>
                    <Select
                      name="batchId"
                      value={batchData.batchId}
                      onChange={handleBatchChange}
                      label="Wybierz partię"
                    >
                      {batches.length === 0 ? (
                        <MenuItem value="" disabled>Brak dostępnych partii</MenuItem>
                      ) : (
                        batches.map(batch => {
                          // Sprawdź czy partia ma datę ważności
                          if (!batch.expiryDate) {
                            // Dla partii bez daty ważności
                            return (
                              <MenuItem 
                                key={batch.id} 
                                value={batch.id}
                                disabled={batch.quantity < parseFloat(transactionData.quantity || 0)}
                              >
                                {batch.batchNumber ? `${batch.batchNumber} - ` : ''}
                                Ilość: {batch.quantity} {item.unit} | 
                                Bez daty ważności
                              </MenuItem>
                            );
                          }
                          
                          const expiryDate = batch.expiryDate instanceof Timestamp 
                            ? batch.expiryDate.toDate() 
                            : new Date(batch.expiryDate);
                          
                          const isExpired = expiryDate < new Date();
                          const expiryDateFormatted = expiryDate.toLocaleDateString('pl-PL');
                          
                          return (
                            <MenuItem 
                              key={batch.id} 
                              value={batch.id}
                              disabled={batch.quantity < parseFloat(transactionData.quantity || 0)}
                            >
                              {batch.batchNumber ? `${batch.batchNumber} - ` : ''}
                              Ilość: {batch.quantity} {item.unit} | 
                              Ważne do: {expiryDateFormatted}
                              {isExpired ? ' (PRZETERMINOWANE)' : ''}
                            </MenuItem>
                          );
                        })
                      )}
                    </Select>
                    {batchData.useBatch && !batchData.batchId && (
                      <FormHelperText>Wybierz partię do wydania</FormHelperText>
                    )}
                  </FormControl>
                  {batches.length > 0 && !batchData.batchId && (
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                      Partie są sortowane według daty ważności (FEFO - First Expired, First Out)
                    </Typography>
                  )}
                </Grid>
              )}
            </Grid>
          )}
          
          {!batchData.useBatch && !isReceive && (
            <Typography variant="body2" color="text.secondary">
              Towar zostanie wydany automatycznie według zasady FEFO (First Expired, First Out) - 
              najpierw wydawane są partie z najkrótszym terminem ważności.
            </Typography>
          )}
        </Box>
      </Paper>

      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
        <Button 
          variant="outlined"
          onClick={() => navigate('/inventory')}
          sx={{ 
            mr: 2,
            borderRadius: '8px'
          }}
        >
          Anuluj
        </Button>
        <Button 
          variant="contained" 
          color={isReceive ? 'success' : 'warning'} 
          type="submit"
          startIcon={isReceive ? <ReceiveIcon /> : <IssueIcon />}
          disabled={processing}
          sx={{ 
            borderRadius: '8px', 
            boxShadow: '0 4px 6px rgba(0,0,0,0.15)',
            px: 3
          }}
        >
          {processing ? 'Przetwarzanie...' : (isReceive ? 'Przyjmij' : 'Wydaj')}
        </Button>
      </Box>

      {/* Dialog wyboru partii */}
      <ConfirmDialog
        open={batchChoiceDialog.open}
        title="Wykryto istniejącą partię dla tej pozycji PO"
        content={
          <Box>
            <Box sx={{ 
              display: 'flex', 
              alignItems: 'center', 
              mb: 2, 
              p: 2, 
              bgcolor: theme => theme.palette.mode === 'dark' ? 'rgba(33, 150, 243, 0.2)' : 'info.light',
              borderRadius: 1,
              border: theme => theme.palette.mode === 'dark' ? '1px solid rgba(33, 150, 243, 0.3)' : 'none'
            }}>
              <InventoryIcon sx={{ mr: 1, color: 'info.main' }} />
              <Typography variant="body1" sx={{ 
                color: theme => theme.palette.mode === 'dark' ? 'info.light' : 'info.contrastText'
              }}>
                Dla tej pozycji zamówienia zakupowego już istnieje partia w systemie
              </Typography>
            </Box>
            
            {batchChoiceDialog.existingBatch && (
              <Box sx={{ 
                mt: 2, 
                p: 3, 
                bgcolor: theme => theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.05)' : 'grey.50',
                borderRadius: 2, 
                border: '1px solid', 
                borderColor: theme => theme.palette.mode === 'dark' ? 'grey.700' : 'grey.300'
              }}>
                <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 'bold', color: 'primary.main' }}>
                  📦 Szczegóły istniejącej partii:
                </Typography>
                <Box sx={{ ml: 2 }}>
                  <Typography variant="body2" sx={{ mb: 0.5 }}>
                    <strong>Numer LOT:</strong> {batchChoiceDialog.existingBatch.lotNumber}
                  </Typography>
                  <Typography variant="body2" sx={{ mb: 0.5 }}>
                    <strong>Obecna ilość:</strong> {batchChoiceDialog.existingBatch.quantity} {item?.unit}
                  </Typography>
                  {batchChoiceDialog.existingBatch.expiryDate && (
                    <Typography variant="body2" sx={{ mb: 0.5 }}>
                      <strong>Data ważności:</strong> {formatDate(batchChoiceDialog.existingBatch.expiryDate)}
                    </Typography>
                  )}
                  {batchChoiceDialog.existingBatch.receivedDate && (
                    <Typography variant="body2" sx={{ mb: 0.5 }}>
                      <strong>Data pierwszego przyjęcia:</strong> {formatDate(batchChoiceDialog.existingBatch.receivedDate)}
                    </Typography>
                  )}
                </Box>
              </Box>
            )}
            
            <Box sx={{ 
              mt: 3, 
              p: 2, 
              bgcolor: theme => theme.palette.mode === 'dark' ? 'rgba(255, 152, 0, 0.2)' : 'warning.light',
              borderRadius: 1,
              border: theme => theme.palette.mode === 'dark' ? '1px solid rgba(255, 152, 0, 0.3)' : 'none'
            }}>
              <Typography variant="body1" sx={{ 
                fontWeight: 'medium',
                color: theme => theme.palette.mode === 'dark' ? 'warning.light' : 'inherit'
              }}>
                <strong>Do przyjęcia:</strong> {batchChoiceDialog.pendingTransaction?.quantity} {item?.unit}
              </Typography>
              {batchChoiceDialog.existingBatch && (
                <Typography variant="body2" sx={{ 
                  mt: 1,
                  color: theme => theme.palette.mode === 'dark' ? 'text.primary' : 'text.secondary'
                }}>
                  Po przyjęciu łączna ilość w partii wyniesie: <strong>
                    {(parseFloat(batchChoiceDialog.existingBatch.quantity) + parseFloat(batchChoiceDialog.pendingTransaction?.quantity || 0)).toFixed(2)} {item?.unit}
                  </strong>
                </Typography>
              )}
            </Box>
            
            <Typography variant="body1" sx={{ mt: 3, mb: 2, textAlign: 'center', fontWeight: 'medium' }}>
              Wybierz sposób przyjęcia towaru:
            </Typography>
          </Box>
        }
        confirmText={`✅ Dodaj do istniejącej partii (LOT: ${batchChoiceDialog.existingBatch?.lotNumber || ''})`}
        cancelText="📦 Utwórz nową oddzielną partię"
        onConfirm={() => handleBatchChoiceConfirm(true)}
        onCancel={() => handleBatchChoiceConfirm(false)}
        onClose={handleBatchChoiceCancel}
        showCloseButton={true}
        maxWidth="md"
      />
    </Box>
  );
};

export default InventoryTransactionForm;