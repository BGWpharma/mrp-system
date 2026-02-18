import React, { useState, useEffect, useRef } from 'react';
import { 
  Container, 
  Typography, 
  Box, 
  Paper, 
  Tab, 
  Tabs, 
  Table, 
  TableBody, 
  TableCell, 
  TableContainer, 
  TableHead, 
  TableRow,
  Button,
  Alert,
  CircularProgress,
  IconButton,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Tooltip,
  TextField,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  InputAdornment,
  Grid,
  Link,
  TablePagination,
  Chip
} from '@mui/material';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';
import { useNavigate, useLocation } from 'react-router-dom';
import { Delete as DeleteIcon, Edit as EditIcon, Search as SearchIcon, FilterList as FilterListIcon, CheckCircle as CheckIcon } from '@mui/icons-material';
import { useTheme } from '@mui/material/styles';
import { useTranslation } from '../../hooks/useTranslation';
import { useNotification } from '../../hooks/useNotification';
import { 
  getFormResponsesWithPagination, 
  deleteFormResponse, 
  getAllProductionFormsCounts,
  FORM_TYPES 
} from '../../services/productionFormsService';

// Komponent strony odpowiedzi formularzy
const FormsResponsesPage = () => {
  const theme = useTheme();
  const { t } = useTranslation('forms');
  const { showError } = useNotification();
  const location = useLocation();
  const navigate = useNavigate();
  
  // Odczytaj parametr tab z URL (0 = completedMO, 1 = productionControl, 2 = productionShift)
  const getInitialTab = () => {
    const searchParams = new URLSearchParams(location.search);
    const tabParam = searchParams.get('tab');
    if (tabParam === 'completedMO' || tabParam === '0') return 0;
    if (tabParam === 'productionControl' || tabParam === '1') return 1;
    if (tabParam === 'productionShift' || tabParam === '2') return 2;
    return 0;
  };
  
  const [tabValue, setTabValue] = useState(getInitialTab);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // ✅ FIX: Cache kursorów dla każdej strony - umożliwia cofanie się
  const cursorsRef = useRef({
    completedMO: new Map(), // Map<pageNumber, cursor>
    productionControl: new Map(), // Map<pageNumber, cursor>
    productionShift: new Map() // Map<pageNumber, cursor>
  });

  // Stany dla paginacji
  const [page, setPage] = useState(0); // MUI używa 0-based indexing
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  
  // Stany dla danych
  const [completedMOResponses, setCompletedMOResponses] = useState([]);
  const [productionControlResponses, setProductionControlResponses] = useState([]);
  const [productionShiftResponses, setProductionShiftResponses] = useState([]);
  const [filteredShiftResponses, setFilteredShiftResponses] = useState([]);
  
  // Stan dla liczby odpowiedzi w każdej zakładce (pobierane na starcie)
  const [tabCounts, setTabCounts] = useState({
    completedMO: null,
    productionControl: null,
    productionShift: null
  });
  
  // Filtry dla tabeli zmian produkcyjnych
  const [shiftFilters, setShiftFilters] = useState({
    responsiblePerson: '',
    product: '',
    moNumber: ''
  });
  
  // Stan dla dialogu potwierdzenia usunięcia
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteItemData, setDeleteItemData] = useState(null);
  
  // Stan dla panelu filtrów
  const [showFilters, setShowFilters] = useState(false);
  
  // Stan dla dialogu wyboru zakresu dat eksportu
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportDateRange, setExportDateRange] = useState({
    fromDate: '',
    toDate: ''
  });
  const [exportFilename, setExportFilename] = useState('');
  const [exportFormType, setExportFormType] = useState('');

  // ✅ FALLBACK: Funkcja do sekwencyjnego ładowania stron gdy brakuje kursorów
  const loadSequentiallyToPage = async (targetPage, formType) => {
    try {
      console.log(`🔄 Rozpoczynam sekwencyjne ładowanie ${formType} do strony ${targetPage}`);
      
      let cursor = null;
      
      // Ładuj strony sekwencyjnie od 1 do targetPage-1
      for (let p = 1; p < targetPage; p++) {
        // Sprawdź czy już mamy kursor dla tej strony
        if (cursorsRef.current[formType].has(p)) {
          cursor = cursorsRef.current[formType].get(p);
          console.log(`📦 Użyto cached kursor dla strony ${p}`);
          continue;
        }
        
        console.log(`📄 Ładowanie strony ${p} z kursorem:`, cursor ? 'JEST' : 'BRAK');
        
        const result = await getFormResponsesWithPagination(
          formType,
          p,
          rowsPerPage,
          {},
          cursor
        );
        
        // Zapisz kursor tej strony
        if (result.lastVisible) {
          cursorsRef.current[formType].set(p, result.lastVisible);
          cursor = result.lastVisible;
          console.log(`💾 Zapisano kursor dla strony ${p}`);
        }
      }
      
      console.log(`✅ Zakończono sekwencyjne ładowanie do strony ${targetPage}`);
    } catch (error) {
      console.error('Błąd podczas sekwencyjnego ładowania:', error);
    }
  };

  // ✅ ZOPTYMALIZOWANA funkcja ładowania danych z kursorami
  const loadFormResponses = async (formType, pageNum = 1, perPage = rowsPerPage, filters = {}) => {
    try {
      setLoading(true);
      
      // ✅ FIX: Pobierz kursor dla danej strony z cache lub użyj fallback
      let currentCursor = null;
      if (pageNum > 1) {
        currentCursor = cursorsRef.current[formType].get(pageNum - 1);
        
        console.log(`📍 Pobieranie strony ${pageNum} formularza ${formType}, kursor z strony ${pageNum - 1}:`, currentCursor ? 'ZNALEZIONY' : 'BRAK');
        
        // ✅ FALLBACK: Jeśli nie ma kursora, załaduj sekwencyjnie od strony 1
        if (!currentCursor && pageNum > 1) {
          console.log(`🔄 FALLBACK: Ładowanie sekwencyjne do strony ${pageNum}`);
          await loadSequentiallyToPage(pageNum, formType);
          currentCursor = cursorsRef.current[formType].get(pageNum - 1);
        }
      }
      
      const result = await getFormResponsesWithPagination(
        formType,
        pageNum,
        perPage,
        filters,
        currentCursor
      );
      
      // ✅ FIX: Zapisz kursor dla aktualnej strony w cache
      if (result.lastVisible) {
        cursorsRef.current[formType].set(pageNum, result.lastVisible);
        console.log(`💾 Zapisano kursor dla ${formType} strony ${pageNum}`);
      }
      
      setTotalCount(result.totalCount);
      setTotalPages(result.totalPages);
      
      return result.data;
      
    } catch (error) {
      console.error('Błąd podczas ładowania odpowiedzi:', error);
      setError(error.message);
      return [];
    } finally {
      setLoading(false);
    }
  };
  
  // Funkcja ładowania aktualnie wybranej zakładki
  const loadCurrentTabData = async () => {
    const pageNum = page + 1; // Konwersja z 0-based na 1-based
    
    try {
      switch (tabValue) {
        case 0:
          const completedData = await loadFormResponses(FORM_TYPES.COMPLETED_MO, pageNum);
          setCompletedMOResponses(completedData);
          break;
        case 1:
          const controlData = await loadFormResponses(FORM_TYPES.PRODUCTION_CONTROL, pageNum);
          setProductionControlResponses(controlData);
          break;
        case 2:
          const shiftData = await loadFormResponses(FORM_TYPES.PRODUCTION_SHIFT, pageNum);
          setProductionShiftResponses(shiftData);
          setFilteredShiftResponses(shiftData); // Inicjalizuj filtry
          break;
      }
    } catch (error) {
      console.error('Błąd podczas ładowania danych:', error);
      setError(error.message);
    }
  };

  // Obsługa zmiany strony
  const handleChangePage = (event, newPage) => {
    setPage(newPage);
  };

  // ✅ OPTYMALIZACJA: Reset kursorów przy zmianie rozmiaru strony
  const handleChangeRowsPerPage = (event) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0); // Reset do pierwszej strony
    
    // ✅ FIX: Wyczyść cache kursorów przy zmianie rozmiaru strony
    cursorsRef.current = {
      completedMO: new Map(),
      productionControl: new Map(),
      productionShift: new Map()
    };
  };

  // ✅ OPTYMALIZACJA: Reset kursorów przy zmianie zakładki
  const handleTabChange = (event, newValue) => {
    setTabValue(newValue);
    setPage(0); // Reset paginacji przy zmianie zakładki
    
    // ✅ FIX: Wyczyść cache kursorów przy zmianie zakładki
    cursorsRef.current = {
      completedMO: new Map(),
      productionControl: new Map(),
      productionShift: new Map()
    };
  };

  // useEffect do ładowania danych
  useEffect(() => {
    loadCurrentTabData();
  }, [tabValue, page, rowsPerPage]);
  
  // Pobierz liczby odpowiedzi dla wszystkich zakładek na starcie
  useEffect(() => {
    const loadAllCounts = async () => {
      try {
        const counts = await getAllProductionFormsCounts();
        setTabCounts(counts);
      } catch (error) {
        console.error('Błąd podczas pobierania liczby odpowiedzi:', error);
      }
    };
    loadAllCounts();
  }, []);
  
  // Funkcja ładowania z filtrami dla Production Shift
  const loadShiftDataWithFilters = async () => {
    if (tabValue !== 2) return; // Filtry tylko dla zakładki Production Shift
    
    const pageNum = page + 1;
    const filters = {};
    
    // Konwertuj filtry na format service
    if (shiftFilters.responsiblePerson) {
      filters.author = shiftFilters.responsiblePerson;
    }
    if (shiftFilters.moNumber) {
      filters.taskNumber = shiftFilters.moNumber;
    }
    
    const shiftData = await loadFormResponses(FORM_TYPES.PRODUCTION_SHIFT, pageNum, rowsPerPage, filters);
    
    // Filtrowanie lokalnie dla pól, które nie są obsługiwane przez service
    let filtered = [...shiftData];
    
    if (shiftFilters.product) {
      filtered = filtered.filter(item => 
        item.product && item.product.toLowerCase().includes(shiftFilters.product.toLowerCase())
      );
    }
    
    setProductionShiftResponses(shiftData);
    setFilteredShiftResponses(filtered);
  };

  // useEffect do obsługi filtrów Production Shift
  useEffect(() => {
    if (tabValue === 2) {
      loadShiftDataWithFilters();
    }
  }, [shiftFilters]);

  // Funkcja do wyodrębniania ścieżki pliku z URL Firebase Storage
  const extractStoragePathFromUrl = (url) => {
    if (!url || !url.includes('firebase')) return null;
    
    try {
      // Format URL: https://firebasestorage.googleapis.com/v0/b/{bucket}/o/{encodedPath}?alt=media
      const pathStart = url.indexOf('/o/') + 3;
      const pathEnd = url.indexOf('?');
      
      if (pathStart > 2 && pathEnd > pathStart) {
        const encodedPath = url.substring(pathStart, pathEnd);
        return decodeURIComponent(encodedPath);
      }
      return null;
    } catch (error) {
      console.error('Błąd podczas wyodrębniania ścieżki z URL:', error);
      return null;
    }
  };
  
  const formatDateTime = (date) => {
    if (!date) return '-';
    try {
      return format(date, 'dd.MM.yyyy HH:mm', { locale: pl });
    } catch (error) {
      console.error('Błąd formatowania daty:', error);
      return '-';
    }
  };
  
  // Funkcja pomocnicza do formatowania wartości CSV
  const formatCSVValue = (value) => {
    if (value === null || value === undefined) {
      return '""';
    }
    
    const stringValue = String(value);
    
    // Jeśli wartość zawiera przecinki, cudzysłowy lub znaki nowej linii, lub spacje, owijamy w cudzysłowy
    if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n') || stringValue.includes('\r') || stringValue.includes(' ')) {
      // Eskapeuj cudzysłowy przez podwojenie
      const escapedValue = stringValue.replace(/"/g, '""');
      return `"${escapedValue}"`;
    }
    
    // Dla bezpieczeństwa owijamy wszystkie wartości w cudzysłowy
    return `"${stringValue}"`;
  };
  
  // Funkcja otwierania dialogu wyboru zakresu dat
  const handleOpenExportDialog = (defaultFilename, formType) => {
    setExportFilename(defaultFilename);
    setExportFormType(formType);
    // Ustaw domyślny zakres - ostatnie 30 dni
    const today = new Date();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(today.getDate() - 30);
    
    setExportDateRange({
      fromDate: thirtyDaysAgo.toISOString().split('T')[0],
      toDate: today.toISOString().split('T')[0]
    });
    setExportDialogOpen(true);
  };

  // Funkcja zamykania dialogu eksportu
  const handleCloseExportDialog = () => {
    setExportDialogOpen(false);
    setExportDateRange({ fromDate: '', toDate: '' });
    setExportFilename('');
    setExportFormType('');
  };

  // Funkcja obsługi eksportu z dialogu
  const handleConfirmExport = async () => {
    if (!exportDateRange.fromDate || !exportDateRange.toDate) {
      showError(t('common:common.selectDateRange'));
      return;
    }
    
    if (new Date(exportDateRange.fromDate) > new Date(exportDateRange.toDate)) {
      showError(t('common:common.startDateCannotBeAfterEndDate'));
      return;
    }
    
    // Zamknij dialog
    setExportDialogOpen(false);
    
    // Wykonaj eksport z wybranym zakresem dat
    await handleExportToCSVWithDateRange(exportFilename, exportFormType, exportDateRange);
    
    // Wyczyść stan
    handleCloseExportDialog();
  };

  // Nowa funkcja eksportu z filtrowaniem po datach
  const handleExportToCSVWithDateRange = async (filename, formType, dateRange) => {
    try {
      setLoading(true);
      
      // Przygotuj filtry
      const filters = {};
      if (dateRange && dateRange.fromDate) {
        filters.fromDate = dateRange.fromDate;
      }
      if (dateRange && dateRange.toDate) {
        filters.toDate = dateRange.toDate;
      }
      
      // Pobierz dane z serwisu z filtrowaniem po datach
      const result = await getFormResponsesWithPagination(
        formType,
        1, // First page
        10000, // Large limit to get all data
        filters
      );
      
      // Użyj istniejącej funkcji eksportu z pobranymi danymi
      handleExportToCSV(result.data, filename);
      
    } catch (error) {
      console.error('Błąd podczas eksportu do CSV:', error);
      setError(`Błąd podczas eksportu: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleExportToCSV = (data, filename) => {
    // Funkcja do eksportu danych do pliku CSV
    let csvContent = "data:text/csv;charset=utf-8,";
    
    // Dodaj nagłówki w zależności od typu danych
    if (tabValue === 0) {
      csvContent += "Data,Email,Numer MO,Ilość produktu,Straty opakowania,Straty produktu,Straty surowca,Waga netto kapsułek\n";
      data.forEach(row => {
        csvContent += `${formatCSVValue(formatDateTime(row.date))},${formatCSVValue(row.email || '')},${formatCSVValue(row.moNumber || '')},${formatCSVValue(row.productQuantity || '')},${formatCSVValue(row.packagingLoss || '')},${formatCSVValue(row.bulkLoss || '')},${formatCSVValue(row.rawMaterialLoss || '')},${formatCSVValue(row.netCapsuleWeight || '')}\n`;
      });
    } else if (tabValue === 1) {
      csvContent += "Data,Email,Imię i nazwisko,Stanowisko,Manufacturing Order,Customer Order,Nazwa produktu,Numer LOT,Temperatura,Wilgotność,Skan dokumentów,Zdjęcie produktu 1,Zdjęcie produktu 2,Zdjęcie produktu 3\n";
      data.forEach(row => {
        csvContent += `${formatCSVValue(formatDateTime(row.fillDate))},${formatCSVValue(row.email || '')},${formatCSVValue(row.name || '')},${formatCSVValue(row.position || '')},${formatCSVValue(row.manufacturingOrder || '')},${formatCSVValue(row.customerOrder || '')},${formatCSVValue(row.productName || '')},${formatCSVValue(row.lotNumber || '')},${formatCSVValue(row.temperature || '')},${formatCSVValue(row.humidity || '')},${formatCSVValue(row.documentScansUrl || '')},${formatCSVValue(row.productPhoto1Url || '')},${formatCSVValue(row.productPhoto2Url || '')},${formatCSVValue(row.productPhoto3Url || '')}\n`;
      });
    } else {
      csvContent += "Data,Email,Osoba odpowiedzialna,Rodzaj zmiany,Produkt,Numer MO,Ilość produkcji,Pracownicy,Straty surowca,Inne czynności\n";
      data.forEach(row => {
        const workers = Array.isArray(row.shiftWorkers) ? row.shiftWorkers.join(', ') : '';
        const shiftInfo = row.shiftType || (row.shiftStartTime && row.shiftEndTime ? `${row.shiftStartTime} - ${row.shiftEndTime}` : '');
        csvContent += `${formatCSVValue(formatDateTime(row.fillDate))},${formatCSVValue(row.email || '')},${formatCSVValue(row.responsiblePerson || '')},${formatCSVValue(shiftInfo)},${formatCSVValue(row.product || '')},${formatCSVValue(row.moNumber || '')},${formatCSVValue(row.productionQuantity || '')},${formatCSVValue(workers)},${formatCSVValue(row.rawMaterialLoss || '')},${formatCSVValue(row.otherActivities || '')}\n`;
      });
    }
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Funkcje do obsługi dialogu potwierdzenia usunięcia
  const handleDeleteClick = (item, formType) => {
    setDeleteItemData({ item, formType });
    setDeleteConfirmOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteItemData) return;
    
    try {
      const { item, formType } = deleteItemData;
      
      // Przygotuj załączniki do usunięcia
      const attachments = [];
      
      switch (formType) {
        case 'completedMO':
          if (item.mixingPlanReportUrl) {
            attachments.push({ url: extractStoragePathFromUrl(item.mixingPlanReportUrl) });
          }
          break;
        case 'productionControl':
          if (item.documentScansUrl) {
            attachments.push({ url: extractStoragePathFromUrl(item.documentScansUrl) });
          }
          if (item.productPhoto1Url) {
            attachments.push({ url: extractStoragePathFromUrl(item.productPhoto1Url) });
          }
          if (item.productPhoto2Url) {
            attachments.push({ url: extractStoragePathFromUrl(item.productPhoto2Url) });
          }
          if (item.productPhoto3Url) {
            attachments.push({ url: extractStoragePathFromUrl(item.productPhoto3Url) });
          }
          break;
        case 'productionShift':
          // Formularz zmian produkcji nie ma załączników
          break;
      }
      
      // Użyj nowego service do usunięcia
      await deleteFormResponse(formType, item.id, attachments);
      
      // Odśwież dane po usunięciu
      loadCurrentTabData();
      
      // Zamknij dialog
      setDeleteConfirmOpen(false);
      setDeleteItemData(null);
      
    } catch (error) {
      console.error('Błąd podczas usuwania dokumentu:', error);
      alert(`Wystąpił błąd podczas usuwania dokumentu: ${error.message}`);
    }
  };

  const handleDeleteCancel = () => {
    setDeleteConfirmOpen(false);
    setDeleteItemData(null);
  };

  // Funkcja do obsługi edycji (przekierowanie do formularza z wypełnionymi danymi)
  const handleEditClick = (item, formType) => {
    // Zapisz dane do edycji w sessionStorage
    sessionStorage.setItem('editFormData', JSON.stringify(item));
    
    // Przekieruj do odpowiedniego formularza
    switch (formType) {
      case 'completedMO':
        navigate('/production/forms/completed-mo?edit=true');
        break;
      case 'productionControl':
        navigate('/production/forms/production-control?edit=true');
        break;
      case 'productionShift':
        navigate('/production/forms/production-shift?edit=true');
        break;
      default:
        console.error('Nieznany typ formularza');
    }
  };

  // Funkcja do powrotu na stronę formularzy
  const handleBack = () => {
    navigate('/production/forms');
  };
  
  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setShiftFilters(prev => ({
      ...prev,
      [name]: value
    }));
  };
  
  const clearFilters = () => {
    setShiftFilters({
      responsiblePerson: '',
      product: '',
      moNumber: ''
    });
    setPage(0); // Reset paginacji po wyczyszczeniu filtrów
  };
  
  const toggleFilters = () => {
    setShowFilters(!showFilters);
  };
  
  // Komponent tabeli dla raportu zakończonych MO
  const CompletedMOTable = () => (
    <>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
        <Typography variant="h6">{t('productionForms.completedMO.title')}</Typography>
        <Box>
          <Button 
            variant="outlined" 
            onClick={() => handleOpenExportDialog('raport-zakonczonych-mo.csv', FORM_TYPES.COMPLETED_MO)}
            disabled={completedMOResponses.length === 0}
            sx={{ mr: 1 }}
          >
            {t('exportToCSV')}
          </Button>
          <Button 
            variant="outlined"
            color="secondary"
            onClick={handleBack}
          >
            {t('back')}
          </Button>
        </Box>
      </Box>
      {completedMOResponses.length === 0 ? (
        <Alert severity="info">{t('noCompletedMOResponses')}</Alert>
      ) : (
        <>
          <TableContainer component={Paper} sx={{ overflowX: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ 
                  backgroundColor: theme.palette.mode === 'dark' 
                    ? 'rgba(255, 255, 255, 0.05)' 
                    : '#f5f5f5' 
                }}>
                  <TableCell>{t('date')}</TableCell>
                  <TableCell>{t('time')}</TableCell>
                  <TableCell>{t('email')}</TableCell>
                  <TableCell>{t('moNumber')}</TableCell>
                  <TableCell align="right">{t('productQuantity')}</TableCell>
                  <TableCell align="right">{t('packagingLoss')}</TableCell>
                  <TableCell align="right">{t('bulkLoss')}</TableCell>
                  <TableCell align="right">{t('rawMaterialLoss')}</TableCell>
                  <TableCell align="right">{t('netCapsuleWeight')}</TableCell>
                  <TableCell>{t('mixingPlanReport')}</TableCell>
                  <TableCell align="center">{t('actions')}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {completedMOResponses.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{row.date ? format(row.date, 'dd.MM.yyyy', { locale: pl }) : '-'}</TableCell>
                    <TableCell>{row.time || '-'}</TableCell>
                    <TableCell>{row.email}</TableCell>
                    <TableCell>{row.moNumber}</TableCell>
                    <TableCell align="right">{row.productQuantity}</TableCell>
                    <TableCell align="right">{row.packagingLoss || '-'}</TableCell>
                    <TableCell align="right">{row.bulkLoss || '-'}</TableCell>
                    <TableCell align="right">{row.rawMaterialLoss || '-'}</TableCell>
                    <TableCell align="right">{row.netCapsuleWeight || '-'}</TableCell>
                    <TableCell>
                      {row.mixingPlanReportUrl ? (
                        <Button 
                          size="small" 
                          href={row.mixingPlanReportUrl} 
                          target="_blank" 
                          rel="noopener noreferrer"
                        >
                          {row.mixingPlanReportName || t('download')}
                        </Button>
                      ) : '-'}
                    </TableCell>
                    <TableCell align="center">
                      <Tooltip title={t('editResponse')}>
                        <IconButton 
                          size="small" 
                          color="primary"
                          onClick={() => handleEditClick(row, 'completedMO')}
                        >
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title={t('deleteResponse')}>
                        <IconButton 
                          size="small" 
                          color="error"
                          onClick={() => handleDeleteClick(row, 'completedMO')}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          
          {/* Paginacja dla CompletedMO */}
          <TablePagination
            component="div"
            count={totalCount}
            page={page}
            onPageChange={handleChangePage}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={handleChangeRowsPerPage}
            rowsPerPageOptions={[5, 10, 25, 50]}
            labelRowsPerPage="Wierszy na stronę:"
            labelDisplayedRows={({ from, to, count }) => 
              `${from}-${to} z ${count !== -1 ? count : `więcej niż ${to}`}`
            }
          />
        </>
      )}
    </>
  );
  
  // Komponent tabeli dla raportów kontroli produkcji
  const ProductionControlTable = () => (
    <>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
        <Typography variant="h6">{t('productionForms.productionControl.title')}</Typography>
        <Box>
          <Button 
            variant="outlined" 
            onClick={() => handleOpenExportDialog('raporty-kontroli-produkcji.csv', FORM_TYPES.PRODUCTION_CONTROL)}
            disabled={productionControlResponses.length === 0}
            sx={{ mr: 1 }}
          >
            {t('exportToCSV')}
          </Button>
          <Button 
            variant="outlined"
            color="secondary"
            onClick={handleBack}
          >
            {t('back')}
          </Button>
        </Box>
      </Box>
      {productionControlResponses.length === 0 ? (
        <Alert severity="info">{t('noProductionControlResponses')}</Alert>
      ) : (
        <>
          <TableContainer component={Paper} sx={{ overflowX: 'auto' }}>
            <Table size="small">
            <TableHead>
              <TableRow sx={{ 
                backgroundColor: theme.palette.mode === 'dark' 
                  ? 'rgba(255, 255, 255, 0.05)' 
                  : '#f5f5f5' 
              }}>
                <TableCell>{t('fillDate')}</TableCell>
                <TableCell>{t('email')}</TableCell>
                <TableCell>{t('name')}</TableCell>
                <TableCell>{t('position')}</TableCell>
                <TableCell>{t('manufacturingOrder')}</TableCell>
                <TableCell>{t('customerOrder')}</TableCell>
                <TableCell>{t('productionStartDate')}</TableCell>
                <TableCell>{t('productionStartTime')}</TableCell>
                <TableCell>{t('productionEndDate')}</TableCell>
                <TableCell>{t('productionEndTime')}</TableCell>
                <TableCell>{t('productName')}</TableCell>
                <TableCell>{t('lotNumber')}</TableCell>
                <TableCell>{t('expiryDate')}</TableCell>
                <TableCell>{t('quantity')}</TableCell>
                <TableCell>{t('shiftNumber')}</TableCell>
                <TableCell>{t('temperature')}</TableCell>
                <TableCell>{t('humidity')}</TableCell>
                <TableCell>{t('rawMaterialPurity')}</TableCell>
                <TableCell>{t('packagingPurity')}</TableCell>
                <TableCell>{t('packagingClosure')}</TableCell>
                <TableCell>{t('packagingQuantity')}</TableCell>
                <TableCell>{t('documentScansUrl')}</TableCell>
                <TableCell>{t('productPhoto1Url')}</TableCell>
                <TableCell>{t('productPhoto2Url')}</TableCell>
                <TableCell>{t('productPhoto3Url')}</TableCell>
                <TableCell align="center">{t('actions')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {productionControlResponses.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>{row.fillDate ? format(row.fillDate, 'dd.MM.yyyy', { locale: pl }) : '-'}</TableCell>
                  <TableCell>{row.email}</TableCell>
                  <TableCell>{row.name}</TableCell>
                  <TableCell>{row.position}</TableCell>
                  <TableCell>{row.manufacturingOrder}</TableCell>
                  <TableCell>{row.customerOrder || '-'}</TableCell>
                  <TableCell>{row.productionStartDate ? format(row.productionStartDate, 'dd.MM.yyyy', { locale: pl }) : '-'}</TableCell>
                  <TableCell>{row.productionStartTime || '-'}</TableCell>
                  <TableCell>{row.productionEndDate ? format(row.productionEndDate, 'dd.MM.yyyy', { locale: pl }) : '-'}</TableCell>
                  <TableCell>{row.productionEndTime || '-'}</TableCell>
                  <TableCell>{row.productName}</TableCell>
                  <TableCell>{row.lotNumber}</TableCell>
                  <TableCell>{row.expiryDate}</TableCell>
                  <TableCell>{row.quantity}</TableCell>
                  <TableCell>{Array.isArray(row.shiftNumber) ? row.shiftNumber.join(', ') : '-'}</TableCell>
                  <TableCell>{row.temperature}</TableCell>
                  <TableCell>{row.humidity}</TableCell>
                  <TableCell>{row.rawMaterialPurity}</TableCell>
                  <TableCell>{row.packagingPurity}</TableCell>
                  <TableCell>{row.packagingClosure}</TableCell>
                  <TableCell>{row.packagingQuantity}</TableCell>
                  <TableCell>
                    {row.documentScansUrl ? (
                      <Link href={row.documentScansUrl} target="_blank" rel="noopener noreferrer">
                        {row.documentScansName || t('showDocument')}
                      </Link>
                    ) : '-'}
                  </TableCell>
                  <TableCell>
                    {row.productPhoto1Url ? (
                      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <img 
                          src={row.productPhoto1Url} 
                          alt="Zdjęcie 1" 
                          style={{ maxWidth: '60px', maxHeight: '60px', marginBottom: '4px', cursor: 'pointer' }}
                          onClick={() => window.open(row.productPhoto1Url, '_blank')}
                        />
                        <Link href={row.productPhoto1Url} target="_blank" rel="noopener noreferrer" sx={{ fontSize: '12px' }}>
                          {row.productPhoto1Name || t('zoom')}
                        </Link>
                      </Box>
                    ) : '-'}
                  </TableCell>
                  <TableCell>
                    {row.productPhoto2Url ? (
                      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <img 
                          src={row.productPhoto2Url} 
                          alt="Zdjęcie 2" 
                          style={{ maxWidth: '60px', maxHeight: '60px', marginBottom: '4px', cursor: 'pointer' }}
                          onClick={() => window.open(row.productPhoto2Url, '_blank')}
                        />
                        <Link href={row.productPhoto2Url} target="_blank" rel="noopener noreferrer" sx={{ fontSize: '12px' }}>
                          {row.productPhoto2Name || t('zoom')}
                        </Link>
                      </Box>
                    ) : '-'}
                  </TableCell>
                  <TableCell>
                    {row.productPhoto3Url ? (
                      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <img 
                          src={row.productPhoto3Url} 
                          alt="Zdjęcie 3" 
                          style={{ maxWidth: '60px', maxHeight: '60px', marginBottom: '4px', cursor: 'pointer' }}
                          onClick={() => window.open(row.productPhoto3Url, '_blank')}
                        />
                        <Link href={row.productPhoto3Url} target="_blank" rel="noopener noreferrer" sx={{ fontSize: '12px' }}>
                          {row.productPhoto3Name || t('zoom')}
                        </Link>
                      </Box>
                    ) : '-'}
                  </TableCell>
                  <TableCell align="center">
                    <Tooltip title={t('editResponse')}>
                      <IconButton 
                        size="small" 
                        color="primary"
                        onClick={() => handleEditClick(row, 'productionControl')}
                      >
                        <EditIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title={t('deleteResponse')}>
                      <IconButton 
                        size="small" 
                        color="error"
                        onClick={() => handleDeleteClick(row, 'productionControl')}
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
        
        {/* Paginacja dla ProductionControl */}
        <TablePagination
          component="div"
          count={totalCount}
          page={page}
          onPageChange={handleChangePage}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={handleChangeRowsPerPage}
          rowsPerPageOptions={[5, 10, 25, 50]}
          labelRowsPerPage="Wierszy na stronę:"
          labelDisplayedRows={({ from, to, count }) => 
            `${from}-${to} z ${count !== -1 ? count : `więcej niż ${to}`}`
          }
        />
        </>
      )}
    </>
  );
  
  // Komponent tabeli dla raportów zmian produkcyjnych
  const ProductionShiftTable = () => {
    // Zbierz unikalne wartości dla filtrów
    const uniqueResponsiblePersons = [...new Set(productionShiftResponses.map(item => item.responsiblePerson))].filter(Boolean);
    const uniqueProducts = [...new Set(productionShiftResponses.map(item => item.product))].filter(Boolean);
    
    return (
      <>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
          <Typography variant="h6">{t('productionForms.productionShift.title')}</Typography>
          <Box>
            <Button 
              variant="outlined" 
              onClick={() => handleOpenExportDialog('raporty-zmian-produkcyjnych.csv', FORM_TYPES.PRODUCTION_SHIFT)}
              disabled={filteredShiftResponses.length === 0}
              sx={{ mr: 1 }}
            >
              {t('exportToCSV')}
            </Button>
            <Button 
              variant="outlined"
              color="secondary"
              onClick={handleBack}
              sx={{ mr: 1 }}
            >
              {t('back')}
            </Button>
            <Button
              variant="outlined"
              color="info"
              onClick={toggleFilters}
              startIcon={<FilterListIcon />}
            >
              {t('filters')}
            </Button>
          </Box>
        </Box>
        
        {showFilters && (
          <Paper sx={{ p: 2, mb: 2 }}>
            <Grid container spacing={2}>
              <Grid item xs={12}>
                <Typography variant="subtitle2" gutterBottom>
                  {t('productionShiftFilters')}
                </Typography>
              </Grid>
              
              <Grid item xs={12} sm={6} md={3}>
                <FormControl fullWidth size="small">
                  <InputLabel>{t('responsiblePerson')}</InputLabel>
                  <Select
                    name="responsiblePerson"
                    value={shiftFilters.responsiblePerson}
                    onChange={handleFilterChange}
                    label={t('responsiblePerson')}
                    displayEmpty
                  >
                    <MenuItem value="">{t('all')}</MenuItem>
                    {uniqueResponsiblePersons.map(person => (
                      <MenuItem key={person} value={person}>{person}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              
              <Grid item xs={12} sm={6} md={3}>
                <FormControl fullWidth size="small">
                  <InputLabel>{t('product')}</InputLabel>
                  <Select
                    name="product"
                    value={shiftFilters.product}
                    onChange={handleFilterChange}
                    label={t('product')}
                    displayEmpty
                  >
                    <MenuItem value="">{t('all')}</MenuItem>
                    {uniqueProducts.map(product => (
                      <MenuItem key={product} value={product}>{product}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              
              <Grid item xs={12} sm={6} md={3}>
                <TextField
                  fullWidth
                  size="small"
                  label={t('moNumber')}
                  name="moNumber"
                  value={shiftFilters.moNumber}
                  onChange={handleFilterChange}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <SearchIcon fontSize="small" />
                      </InputAdornment>
                    ),
                  }}
                />
              </Grid>
              
              <Grid item xs={12}>
                <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <Button 
                    variant="outlined" 
                    color="secondary" 
                    onClick={clearFilters}
                    size="small"
                  >
                    {t('clearFilters')}
                  </Button>
                </Box>
              </Grid>
            </Grid>
          </Paper>
        )}
        
        <Box sx={{ mb: 2 }}>
          <Typography variant="body2" color="text.secondary">
            {t('found')} {filteredShiftResponses.length} {t('of')} {productionShiftResponses.length} {t('reports')}
          </Typography>
        </Box>
        
        {filteredShiftResponses.length === 0 ? (
          <Alert severity="info">{t('noProductionShiftResponses')}</Alert>
        ) : (
          <>
            <TableContainer component={Paper} sx={{ overflowX: 'auto' }}>
              <Table size="small">
              <TableHead>
                <TableRow sx={{ 
                  backgroundColor: theme.palette.mode === 'dark' 
                    ? 'rgba(255, 255, 255, 0.05)' 
                    : '#f5f5f5' 
                }}>
                  <TableCell>{t('date')}</TableCell>
                  <TableCell>{t('time')}</TableCell>
                  <TableCell>{t('email')}</TableCell>
                  <TableCell>{t('responsiblePerson')}</TableCell>
                  <TableCell>{t('shiftType')}</TableCell>
                  <TableCell>{t('product')}</TableCell>
                  <TableCell>{t('moNumber')}</TableCell>
                  <TableCell align="right">{t('productionQuantity')}</TableCell>
                  <TableCell>{t('shiftWorkers')}</TableCell>
                  <TableCell>{t('firstProduct')}</TableCell>
                  <TableCell align="right">{t('firstProductQuantity')}</TableCell>
                  <TableCell align="right">{t('firstProductLoss')}</TableCell>
                  <TableCell>{t('secondProduct')}</TableCell>
                  <TableCell align="right">{t('secondProductQuantity')}</TableCell>
                  <TableCell align="right">{t('secondProductLoss')}</TableCell>
                  <TableCell>{t('thirdProduct')}</TableCell>
                  <TableCell align="right">{t('thirdProductQuantity')}</TableCell>
                  <TableCell align="right">{t('thirdProductLoss')}</TableCell>
                  <TableCell>{t('rawMaterialLoss')}</TableCell>
                  <TableCell>{t('finishedProductLoss')}</TableCell>
                  <TableCell>{t('lidLoss')}</TableCell>
                  <TableCell>{t('otherActivities')}</TableCell>
                  <TableCell>{t('machineIssues')}</TableCell>
                  <TableCell align="center">Status historii</TableCell>
                  <TableCell align="center">{t('actions')}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredShiftResponses.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{row.fillDate ? format(row.fillDate, 'dd.MM.yyyy', { locale: pl }) : '-'}</TableCell>
                    <TableCell>{row.fillTime || '-'}</TableCell>
                    <TableCell>{row.email}</TableCell>
                    <TableCell>{row.responsiblePerson}</TableCell>
                    <TableCell>
                      {row.shiftType || (row.shiftStartTime && row.shiftEndTime ? `${row.shiftStartTime} - ${row.shiftEndTime}` : '-')}
                    </TableCell>
                    <TableCell>{row.product}</TableCell>
                    <TableCell>{row.moNumber}</TableCell>
                    <TableCell align="right">{row.productionQuantity}</TableCell>
                    <TableCell>{Array.isArray(row.shiftWorkers) ? row.shiftWorkers.join(', ') : ''}</TableCell>
                    <TableCell>{row.firstProduct !== 'BRAK' ? row.firstProduct : '-'}</TableCell>
                    <TableCell align="right">{row.firstProduct !== 'BRAK' ? row.firstProductQuantity : '-'}</TableCell>
                    <TableCell align="right">{row.firstProduct !== 'BRAK' ? (row.firstProductLoss || '0') : '-'}</TableCell>
                    <TableCell>{row.secondProduct !== 'BRAK' ? row.secondProduct : '-'}</TableCell>
                    <TableCell align="right">{row.secondProduct !== 'BRAK' ? row.secondProductQuantity : '-'}</TableCell>
                    <TableCell align="right">{row.secondProduct !== 'BRAK' ? (row.secondProductLoss || '0') : '-'}</TableCell>
                    <TableCell>{row.thirdProduct !== 'BRAK' ? row.thirdProduct : '-'}</TableCell>
                    <TableCell align="right">{row.thirdProduct !== 'BRAK' ? row.thirdProductQuantity : '-'}</TableCell>
                    <TableCell align="right">{row.thirdProduct !== 'BRAK' ? (row.thirdProductLoss || '0') : '-'}</TableCell>
                    <TableCell>{row.rawMaterialLoss || '-'}</TableCell>
                    <TableCell align="right">{row.finishedProductLoss || '-'}</TableCell>
                    <TableCell align="right">{row.lidLoss || '-'}</TableCell>
                    <TableCell>{row.otherActivities}</TableCell>
                    <TableCell>{row.machineIssues}</TableCell>
                    <TableCell align="center">
                      {row.addedToHistory ? (
                        <Tooltip title={`Dodano do historii${row.productionTaskName ? `: ${row.productionTaskName}` : ''}`}>
                          <Chip 
                            label="Dodano" 
                            color="success" 
                            size="small" 
                            icon={<CheckIcon />}
                          />
                        </Tooltip>
                      ) : (
                        <Chip 
                          label="Nie dodano" 
                          color="default" 
                          size="small"
                          variant="outlined"
                        />
                      )}
                    </TableCell>
                    <TableCell align="center">
                      <Tooltip title={t('editResponse')}>
                        <IconButton 
                          size="small" 
                          color="primary"
                          onClick={() => handleEditClick(row, 'productionShift')}
                        >
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title={t('deleteResponse')}>
                        <IconButton 
                          size="small" 
                          color="error"
                          onClick={() => handleDeleteClick(row, 'productionShift')}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          
          {/* Paginacja dla ProductionShift */}
          <TablePagination
            component="div"
            count={totalCount}
            page={page}
            onPageChange={handleChangePage}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={handleChangeRowsPerPage}
            rowsPerPageOptions={[5, 10, 25, 50]}
            labelRowsPerPage="Wierszy na stronę:"
            labelDisplayedRows={({ from, to, count }) => 
              `${from}-${to} z ${count !== -1 ? count : `więcej niż ${to}`}`
            }
          />
          </>
        )}
      </>
    );
  };
  
  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h5" gutterBottom>
          {t('formsResponsesTitle')}
        </Typography>
        <Typography variant="body2" color="text.secondary" gutterBottom>
          {t('formsResponsesDescription')}
        </Typography>
      </Box>
      
      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {t('errorLoadingData')}: {error}
        </Alert>
      )}
      
      <Paper sx={{ mb: 4 }}>
        <Tabs 
          value={tabValue} 
          onChange={handleTabChange} 
          indicatorColor="primary"
          textColor="primary"
          variant="fullWidth"
        >
          <Tab label={`${t('productionForms.completedMO.tab')} (${tabCounts.completedMO !== null ? tabCounts.completedMO : '...'})`} />
          <Tab label={`${t('productionForms.productionControl.tab')} (${tabCounts.productionControl !== null ? tabCounts.productionControl : '...'})`} />
          <Tab label={`${t('productionForms.productionShift.tab')} (${tabCounts.productionShift !== null ? tabCounts.productionShift : '...'})`} />
        </Tabs>
      </Paper>
      
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
          <CircularProgress />
        </Box>
      ) : (
        <Box>
          {tabValue === 0 && <CompletedMOTable />}
          {tabValue === 1 && <ProductionControlTable />}
          {tabValue === 2 && <ProductionShiftTable />}
        </Box>
      )}

      {/* Dialog potwierdzenia usunięcia */}
      <Dialog
        open={deleteConfirmOpen}
        onClose={handleDeleteCancel}
      >
        <DialogTitle>{t('confirmDeleteTitle')}</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {t('confirmDeleteMessage')}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleDeleteCancel} color="primary">
            {t('cancel')}
          </Button>
          <Button onClick={handleDeleteConfirm} color="error" autoFocus>
            {t('delete')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog wyboru zakresu dat dla eksportu */}
      <Dialog open={exportDialogOpen} onClose={handleCloseExportDialog} maxWidth="sm" fullWidth>
        <DialogTitle>
          Eksport do CSV - Wybór zakresu dat
        </DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            Wybierz zakres dat dla eksportowanych danych. Domyślnie pokazane są ostatnie 30 dni.
          </DialogContentText>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={6}>
              <TextField
                fullWidth
                label="Data od"
                type="date"
                value={exportDateRange.fromDate}
                onChange={(e) => setExportDateRange(prev => ({ ...prev, fromDate: e.target.value }))}
                InputLabelProps={{
                  shrink: true,
                }}
                variant="outlined"
              />
            </Grid>
            <Grid item xs={6}>
              <TextField
                fullWidth
                label="Data do"
                type="date"
                value={exportDateRange.toDate}
                onChange={(e) => setExportDateRange(prev => ({ ...prev, toDate: e.target.value }))}
                InputLabelProps={{
                  shrink: true,
                }}
                variant="outlined"
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseExportDialog} color="secondary">
            Anuluj
          </Button>
          <Button 
            onClick={handleConfirmExport} 
            color="primary" 
            variant="contained"
            disabled={!exportDateRange.fromDate || !exportDateRange.toDate}
          >
            Eksportuj CSV
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default FormsResponsesPage; 