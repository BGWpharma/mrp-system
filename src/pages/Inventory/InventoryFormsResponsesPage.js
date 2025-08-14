import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  TablePagination,
  Chip
} from '@mui/material';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';
import { useNavigate } from 'react-router-dom';
import { Delete as DeleteIcon, Edit as EditIcon } from '@mui/icons-material';
import { useTheme } from '@mui/material/styles';
import { useTranslation } from '../../hooks/useTranslation';
import { 
  getInventoryFormResponsesWithPagination,
  deleteInventoryFormResponse,
  INVENTORY_FORM_TYPES
} from '../../services/inventoryFormsService';

// Komponent strony odpowiedzi formularzy magazynowych z optymalizacjami
const InventoryFormsResponsesPage = () => {
  const theme = useTheme();
  const { t } = useTranslation();
  const [tabValue, setTabValue] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const navigate = useNavigate();
  
  // ✅ FIX: Cache kursorów dla każdej strony - umożliwia cofanie się
  const cursorsRef = useRef({
    loadingReport: new Map(), // Map<pageNumber, cursor>
    unloadingReport: new Map() // Map<pageNumber, cursor>
  });

  // ✅ OPTYMALIZACJA: Separate state for each tab
  const [loadingReportResponses, setLoadingReportResponses] = useState([]);
  const [unloadingReportResponses, setUnloadingReportResponses] = useState([]);
  
  // ✅ OPTYMALIZACJA: Pagination state
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  
  // ✅ OPTYMALIZACJA: Track loaded tabs to implement lazy loading
  const [loadedTabs, setLoadedTabs] = useState({
    loadingReport: false,
    unloadingReport: false
  });
  
  // Stan dla dialogu potwierdzenia usunięcia
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteItemData, setDeleteItemData] = useState(null);

  // ✅ FALLBACK: Funkcja do sekwencyjnego ładowania stron gdy brakuje kursorów
  const loadSequentiallyToPage = async (targetPage, formType) => {
    try {
      console.log(`🔄 Rozpoczynam sekwencyjne ładowanie ${formType} do strony ${targetPage}`);
      
      let cursor = null;
      const inventoryFormType = formType === 'loadingReport' 
        ? INVENTORY_FORM_TYPES.LOADING_REPORT 
        : INVENTORY_FORM_TYPES.UNLOADING_REPORT;
      
      // Ładuj strony sekwencyjnie od 1 do targetPage-1
      for (let p = 1; p < targetPage; p++) {
        // Sprawdź czy już mamy kursor dla tej strony
        if (cursorsRef.current[formType].has(p)) {
          cursor = cursorsRef.current[formType].get(p);
          console.log(`📦 Użyto cached kursor dla strony ${p}`);
          continue;
        }
        
        console.log(`📄 Ładowanie strony ${p} z kursorem:`, cursor ? 'JEST' : 'BRAK');
        
        const result = await getInventoryFormResponsesWithPagination(
          inventoryFormType,
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

  // ✅ OPTYMALIZACJA: Lazy loading functions for each tab
  const loadLoadingReportData = useCallback(async () => {
    if (loadedTabs.loadingReport) return;
    
    try {
      console.log('🔄 Loading Loading Report data...');
      const pageNum = page + 1; // Convert from 0-based to 1-based
      const result = await getInventoryFormResponsesWithPagination(
        INVENTORY_FORM_TYPES.LOADING_REPORT,
        pageNum,
        rowsPerPage
      );
      
      setLoadingReportResponses(result.data);
      setTotalCount(result.totalCount);
      setTotalPages(result.totalPages);
      setLoadedTabs(prev => ({ ...prev, loadingReport: true }));
      
      console.log('✅ Loading Report data loaded');
    } catch (error) {
      console.error('❌ Error loading Loading Report data:', error);
      setError(error.message);
    }
  }, [loadedTabs.loadingReport, page, rowsPerPage]);

  const loadUnloadingReportData = useCallback(async () => {
    if (loadedTabs.unloadingReport) return;
    
    try {
      console.log('🔄 Loading Unloading Report data...');
      const pageNum = page + 1; // Convert from 0-based to 1-based
      const result = await getInventoryFormResponsesWithPagination(
        INVENTORY_FORM_TYPES.UNLOADING_REPORT,
        pageNum,
        rowsPerPage
      );
      
      setUnloadingReportResponses(result.data);
      setTotalCount(result.totalCount);
      setTotalPages(result.totalPages);
      setLoadedTabs(prev => ({ ...prev, unloadingReport: true }));
      
      console.log('✅ Unloading Report data loaded');
    } catch (error) {
      console.error('❌ Error loading Unloading Report data:', error);
      setError(error.message);
    }
  }, [loadedTabs.unloadingReport, page, rowsPerPage]);

  // ✅ ZOPTYMALIZOWANA: Load data for current tab with cursors
  const loadCurrentTabData = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      const pageNum = page + 1;
      
      // ✅ FIX: Pobierz kursor dla danej strony z cache lub użyj fallback
      let currentCursor = null;
      if (pageNum > 1) {
        const currentFormType = tabValue === 0 ? 'loadingReport' : 'unloadingReport';
        currentCursor = cursorsRef.current[currentFormType].get(pageNum - 1);
        
        console.log(`📍 Pobieranie strony ${pageNum}, kursor z strony ${pageNum - 1}:`, currentCursor ? 'ZNALEZIONY' : 'BRAK');
        
        // ✅ FALLBACK: Jeśli nie ma kursora, załaduj sekwencyjnie od strony 1
        if (!currentCursor && pageNum > 1) {
          console.log(`🔄 FALLBACK: Ładowanie sekwencyjne do strony ${pageNum}`);
          await loadSequentiallyToPage(pageNum, currentFormType);
          currentCursor = cursorsRef.current[currentFormType].get(pageNum - 1);
        }
      }
      
      switch (tabValue) {
        case 0: // Loading Reports
          const loadingResult = await getInventoryFormResponsesWithPagination(
            INVENTORY_FORM_TYPES.LOADING_REPORT,
            pageNum,
            rowsPerPage,
            {},
            currentCursor
          );
          setLoadingReportResponses(loadingResult.data);
          setTotalCount(loadingResult.totalCount);
          setTotalPages(loadingResult.totalPages);
          
          // ✅ FIX: Zapisz kursor dla aktualnej strony w cache
          if (loadingResult.lastVisible) {
            cursorsRef.current.loadingReport.set(pageNum, loadingResult.lastVisible);
            console.log(`💾 Zapisano kursor dla loadingReport strony ${pageNum}`);
          }
          break;
          
        case 1: // Unloading Reports
          const unloadingResult = await getInventoryFormResponsesWithPagination(
            INVENTORY_FORM_TYPES.UNLOADING_REPORT,
            pageNum,
            rowsPerPage,
            {},
            currentCursor
          );
          setUnloadingReportResponses(unloadingResult.data);
          setTotalCount(unloadingResult.totalCount);
          setTotalPages(unloadingResult.totalPages);
          
          // ✅ FIX: Zapisz kursor dla aktualnej strony w cache
          if (unloadingResult.lastVisible) {
            cursorsRef.current.unloadingReport.set(pageNum, unloadingResult.lastVisible);
            console.log(`💾 Zapisano kursor dla unloadingReport strony ${pageNum}`);
          }
          break;
          
        default:
          break;
      }
    } catch (error) {
      console.error('Błąd podczas ładowania danych zakładki:', error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  }, [tabValue, page, rowsPerPage]);
  
  // ✅ OPTYMALIZACJA: Load data when tab, page, or rowsPerPage changes
  useEffect(() => {
    loadCurrentTabData();
  }, [loadCurrentTabData]);
  
  // ✅ OPTYMALIZACJA: Reset pagination and cursors when changing tabs
  const handleTabChange = (event, newValue) => {
    setTabValue(newValue);
    setPage(0); // Reset to first page when changing tabs
    setError(null); // Clear any previous errors
    
    // ✅ FIX: Wyczyść cache kursorów przy zmianie zakładki
    cursorsRef.current = {
      loadingReport: new Map(),
      unloadingReport: new Map()
    };
  };

  // ✅ OPTYMALIZACJA: Pagination handlers
  const handleChangePage = (event, newPage) => {
    setPage(newPage);
  };

  // ✅ OPTYMALIZACJA: Reset kursorów przy zmianie rozmiaru strony
  const handleChangeRowsPerPage = (event) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0); // Reset to first page when changing rows per page
    
    // ✅ FIX: Wyczyść cache kursorów przy zmianie rozmiaru strony
    cursorsRef.current = {
      loadingReport: new Map(),
      unloadingReport: new Map()
    };
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

  // Funkcja do formatowania pozycji dostarczonych
  const formatDeliveredItems = (row) => {
    // Nowy format z selectedItems (tablica obiektów)
    if (row.selectedItems && Array.isArray(row.selectedItems) && row.selectedItems.length > 0) {
      return (
        <Box>
          {row.selectedItems.map((item, index) => (
            <Box key={index} sx={{ mb: 1, fontSize: '0.875rem' }}>
              <Typography variant="body2" fontWeight="bold" sx={{ fontSize: '0.8rem' }}>
                {item.productName || t('inventory.forms.noName')}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
                {t('inventory.forms.ordered')}: {item.quantity ? `${item.quantity} ${item.unit || 'szt.'}` : t('inventory.forms.noData')}
              </Typography>
              {item.unloadedQuantity && (
                <Typography variant="caption" color="primary" sx={{ fontSize: '0.75rem', display: 'block' }}>
                  {t('inventory.forms.unloaded')}: {item.unloadedQuantity}
                </Typography>
              )}
              {item.expiryDate && (
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.75rem', display: 'block' }}>
                  {t('inventory.forms.expiry')}: {(() => {
                    try {
                      const date = item.expiryDate.toDate ? item.expiryDate.toDate() : new Date(item.expiryDate);
                      return format(date, 'dd.MM.yyyy');
                    } catch (error) {
                      return t('inventory.forms.invalidDate');
                    }
                  })()}
                </Typography>
              )}
            </Box>
          ))}
        </Box>
      );
    }
    
    // Kompatybilność wsteczna ze starym formatem (goodsDescription)
    if (row.goodsDescription) {
      return (
        <Typography variant="body2" sx={{ fontSize: '0.875rem' }}>
          {row.goodsDescription}
        </Typography>
      );
    }
    
    return '-';
  };
  
  // ✅ OPTYMALIZACJA: Export all data (not just current page)
  const handleExportToCSV = async (filename) => {
    try {
      setLoading(true);
      
      // Pobierz wszystkie dane dla eksportu (bez paginacji)
      const formType = tabValue === 0 ? INVENTORY_FORM_TYPES.LOADING_REPORT : INVENTORY_FORM_TYPES.UNLOADING_REPORT;
      const result = await getInventoryFormResponsesWithPagination(
        formType,
        1, // First page
        1000, // Large limit to get all data
        {} // No filters
      );
      
      let csvContent = "data:text/csv;charset=utf-8,";
      
      if (tabValue === 0) {
        csvContent += `${t('inventory.forms.fillDate')},${t('inventory.forms.email')},${t('inventory.forms.employeeName')},${t('inventory.forms.position')},${t('inventory.forms.cmrNumber')},${t('inventory.forms.loadingDate')},${t('inventory.forms.carrierName')},${t('inventory.forms.vehicleRegistration')},${t('inventory.forms.vehicleTechnicalCondition')},${t('inventory.forms.clientName')},${t('inventory.forms.orderNumber')},${t('inventory.forms.palletProductName')},${t('inventory.forms.palletQuantity')},${t('inventory.forms.weight')},${t('inventory.forms.loadingNotes')},${t('inventory.forms.goodsNotes')}\n`;
        result.data.forEach(row => {
          csvContent += `${formatDateTime(row.fillDate)},${row.email || ''},${row.employeeName || ''},${row.position || ''},${row.cmrNumber || ''},${row.loadingDate ? format(row.loadingDate, 'dd.MM.yyyy') : ''},${row.carrierName || ''},${row.vehicleRegistration || ''},${row.vehicleTechnicalCondition || ''},${row.clientName || ''},${row.orderNumber || ''},${row.palletProductName || ''},${row.palletQuantity || ''},${row.weight || ''},${row.notes || ''},${row.goodsNotes || ''}\n`;
        });
      } else if (tabValue === 1) {
        csvContent += `${t('inventory.forms.fillDate')},${t('inventory.forms.email')},${t('inventory.forms.employeeName')},${t('inventory.forms.position')},${t('inventory.forms.unloadingDate')},${t('inventory.forms.carrierName')},${t('inventory.forms.vehicleRegistration')},${t('inventory.forms.vehicleTechnicalCondition')},${t('inventory.forms.transportHygiene')},${t('inventory.forms.supplierName')},${t('inventory.forms.poNumber')},${t('inventory.forms.deliveredItems')},${t('inventory.forms.palletQuantity')},${t('inventory.forms.cartonsTubsQuantity')},${t('inventory.forms.weight')},${t('inventory.forms.visualInspectionResult')},${t('inventory.forms.ecoCertificateNumber')},${t('inventory.forms.unloadingNotes')},${t('inventory.forms.goodsNotes')}\n`;
        result.data.forEach(row => {
          // Formatuj pozycje dostarczone dla CSV
          let itemsText = '';
          if (row.selectedItems && Array.isArray(row.selectedItems) && row.selectedItems.length > 0) {
            itemsText = row.selectedItems.map(item => {
              let itemText = item.productName || t('inventory.forms.noName');
              if (item.quantity) itemText += ` (${t('inventory.forms.ordered')}: ${item.quantity} ${item.unit || 'szt.'})`;
              if (item.unloadedQuantity) itemText += ` (${t('inventory.forms.unloaded')}: ${item.unloadedQuantity})`;
              if (item.expiryDate) {
                try {
                  const date = item.expiryDate.toDate ? item.expiryDate.toDate() : new Date(item.expiryDate);
                  itemText += ` (${t('inventory.forms.expiry')}: ${format(date, 'dd.MM.yyyy')})`;
                } catch (error) {
                  itemText += ` (${t('inventory.forms.expiry')}: ${t('inventory.forms.invalidDate')})`;
                }
              }
              return itemText;
            }).join('; ');
          } else if (row.goodsDescription) {
            // Kompatybilność wsteczna
            itemsText = row.goodsDescription;
          }
          
          csvContent += `${formatDateTime(row.fillDate)},${row.email || ''},${row.employeeName || ''},${row.position || ''},${row.unloadingDate ? format(row.unloadingDate, 'dd.MM.yyyy') : ''},${row.carrierName || ''},${row.vehicleRegistration || ''},${row.vehicleTechnicalCondition || ''},${row.transportHygiene || ''},${row.supplierName || ''},${row.poNumber || ''},${itemsText},${row.palletQuantity || ''},${row.cartonsTubsQuantity || ''},${row.weight || ''},${row.visualInspectionResult || ''},${row.ecoCertificateNumber || ''},${row.notes || ''},${row.goodsNotes || ''}\n`;
        });
      }
      
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
    } catch (error) {
      console.error('Błąd podczas eksportu do CSV:', error);
      setError(`Błąd podczas eksportu: ${error.message}`);
    } finally {
      setLoading(false);
    }
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
      
      // Mapuj formType na INVENTORY_FORM_TYPES
      let serviceFormType;
      switch (formType) {
        case 'loadingReport':
          serviceFormType = INVENTORY_FORM_TYPES.LOADING_REPORT;
          break;
        case 'unloadingReport':
          serviceFormType = INVENTORY_FORM_TYPES.UNLOADING_REPORT;
          break;
        default:
          throw new Error('Nieznany typ formularza');
      }
      
      // ✅ OPTYMALIZACJA: Use service method for deletion
      await deleteInventoryFormResponse(serviceFormType, item.id, item);
      
      // ✅ OPTYMALIZACJA: Refresh only current tab data instead of all data
      await loadCurrentTabData();
      
      // Zamknij dialog
      setDeleteConfirmOpen(false);
      setDeleteItemData(null);
      
    } catch (error) {
      console.error('Błąd podczas usuwania dokumentu:', error);
      setError(`Wystąpił błąd podczas usuwania dokumentu: ${error.message}`);
    }
  };

  const handleDeleteCancel = () => {
    setDeleteConfirmOpen(false);
    setDeleteItemData(null);
  };

  // Funkcja do obsługi edycji (przekierowanie do formularza z wypełnionymi danymi)
  const handleEditClick = (item, formType) => {
    console.log('📝 Edycja odpowiedzi:', item);
    console.log('🔍 selectedItems do edycji:', item.selectedItems);
    
    // Zapisz dane do edycji w sessionStorage
    sessionStorage.setItem('editFormData', JSON.stringify(item));
    
    // Przekieruj do odpowiedniego formularza
    switch (formType) {
      case 'loadingReport':
        navigate('/inventory/forms/loading-report?edit=true');
        break;
      case 'unloadingReport':
        navigate('/inventory/forms/unloading-report?edit=true');
        break;
      default:
        console.error('Nieznany typ formularza');
    }
  };

  // Funkcja do powrotu na stronę formularzy
  const handleBack = () => {
    navigate('/inventory/forms');
  };
  
  // Komponent tabeli dla raportów załadunku towaru
  const LoadingReportTable = () => (
    <>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
        <Typography variant="h6">{t('inventory.forms.loadingReport.title')}</Typography>
        <Box>
          <Button 
            variant="outlined" 
            onClick={() => handleExportToCSV('raporty-zaladunku-towaru.csv')}
            disabled={loading || totalCount === 0}
            sx={{ mr: 1 }}
          >
            {loading ? t('inventory.forms.exporting') : t('inventory.forms.exportToCSV')}
          </Button>
          <Button 
            variant="outlined"
            color="secondary"
            onClick={handleBack}
          >
            {t('inventory.forms.back')}
          </Button>
        </Box>
      </Box>
      {/* ✅ OPTYMALIZACJA: Show loading state and pagination info */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="body2" color="text.secondary">
          {loading ? t('inventory.forms.loading') : `${t('inventory.forms.results')}: ${totalCount}`}
        </Typography>
        {totalCount > 0 && (
          <Chip 
            size="small" 
            label={`${t('inventory.forms.page')} ${page + 1} ${t('inventory.forms.of')} ${totalPages}`} 
            variant="outlined" 
          />
        )}
      </Box>
      
      {tabValue === 0 && loadingReportResponses.length === 0 && !loading ? (
        <Alert severity="info">{t('inventory.forms.noResponses')}</Alert>
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
                  <TableCell>{t('inventory.forms.fillDate')}</TableCell>
                  <TableCell>{t('inventory.forms.fillTime')}</TableCell>
                  <TableCell>{t('inventory.forms.email')}</TableCell>
                  <TableCell>{t('inventory.forms.employeeName')}</TableCell>
                  <TableCell>{t('inventory.forms.position')}</TableCell>
                  <TableCell>{t('inventory.forms.cmrNumber')}</TableCell>
                  <TableCell>{t('inventory.forms.loadingDate')}</TableCell>
                  <TableCell>{t('inventory.forms.carrierName')}</TableCell>
                  <TableCell>{t('inventory.forms.vehicleRegistration')}</TableCell>
                  <TableCell>{t('inventory.forms.vehicleTechnicalCondition')}</TableCell>
                  <TableCell>{t('inventory.forms.clientName')}</TableCell>
                  <TableCell>{t('inventory.forms.orderNumber')}</TableCell>
                  <TableCell>{t('inventory.forms.palletProductName')}</TableCell>
                  <TableCell align="right">{t('inventory.forms.palletQuantity')}</TableCell>
                  <TableCell align="right">{t('inventory.forms.weight')}</TableCell>
                  <TableCell>{t('inventory.forms.loadingNotes')}</TableCell>
                  <TableCell>{t('inventory.forms.goodsNotes')}</TableCell>
                  <TableCell align="center">{t('inventory.forms.actions')}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {loadingReportResponses.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{row.fillDate ? format(row.fillDate, 'dd.MM.yyyy', { locale: pl }) : '-'}</TableCell>
                    <TableCell>{row.fillTime || '-'}</TableCell>
                    <TableCell>{row.email}</TableCell>
                    <TableCell>{row.employeeName}</TableCell>
                    <TableCell>{row.position}</TableCell>
                    <TableCell>{row.cmrNumber || '-'}</TableCell>
                    <TableCell>{row.loadingDate ? format(row.loadingDate, 'dd.MM.yyyy', { locale: pl }) : '-'}</TableCell>
                    <TableCell>{row.carrierName}</TableCell>
                    <TableCell>{row.vehicleRegistration}</TableCell>
                    <TableCell>{row.vehicleTechnicalCondition}</TableCell>
                    <TableCell>{row.clientName}</TableCell>
                    <TableCell>{row.orderNumber}</TableCell>
                    <TableCell>{row.palletProductName}</TableCell>
                    <TableCell align="right">{row.palletQuantity}</TableCell>
                    <TableCell align="right">{row.weight}</TableCell>
                    <TableCell>{row.notes || '-'}</TableCell>
                    <TableCell>{row.goodsNotes || '-'}</TableCell>
                    <TableCell align="center">
                      <Tooltip title={t('inventory.forms.editResponse')}>
                        <IconButton 
                          size="small" 
                          color="primary"
                          onClick={() => handleEditClick(row, 'loadingReport')}
                        >
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title={t('inventory.forms.deleteResponse')}>
                        <IconButton 
                          size="small" 
                          color="error"
                          onClick={() => handleDeleteClick(row, 'loadingReport')}
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
          
          {/* ✅ OPTYMALIZACJA: Pagination component for Loading Reports */}
          {totalCount > 0 && (
            <TablePagination
              rowsPerPageOptions={[5, 10, 25, 50]}
              component="div"
              count={totalCount}
              rowsPerPage={rowsPerPage}
              page={page}
              onPageChange={handleChangePage}
              onRowsPerPageChange={handleChangeRowsPerPage}
              labelRowsPerPage={t('inventory.forms.rowsPerPage')}
              labelDisplayedRows={({ from, to, count }) => 
                `${from}-${to} ${t('inventory.forms.of')} ${count !== -1 ? count : `${t('inventory.forms.moreThan')} ${to}`}`
              }
            />
          )}
        </>
      )}
    </>
  );
  
  // Komponent tabeli dla raportów rozładunku towaru
  const UnloadingReportTable = () => (
    <>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
        <Typography variant="h6">{t('inventory.forms.unloadingReport.title')}</Typography>
        <Box>
          <Button 
            variant="outlined" 
            onClick={() => handleExportToCSV('raporty-rozladunku-towaru.csv')}
            disabled={loading || totalCount === 0}
            sx={{ mr: 1 }}
          >
            {loading ? t('inventory.forms.exporting') : t('inventory.forms.exportToCSV')}
          </Button>
          <Button 
            variant="outlined"
            color="secondary"
            onClick={handleBack}
          >
            {t('inventory.forms.back')}
          </Button>
        </Box>
      </Box>
      {/* ✅ OPTYMALIZACJA: Show loading state and pagination info */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="body2" color="text.secondary">
          {loading ? t('inventory.forms.loading') : `${t('inventory.forms.results')}: ${totalCount}`}
        </Typography>
        {totalCount > 0 && (
          <Chip 
            size="small" 
            label={`${t('inventory.forms.page')} ${page + 1} ${t('inventory.forms.of')} ${totalPages}`} 
            variant="outlined" 
          />
        )}
      </Box>
      
      {tabValue === 1 && unloadingReportResponses.length === 0 && !loading ? (
        <Alert severity="info">{t('inventory.forms.noResponses')}</Alert>
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
                  <TableCell>{t('inventory.forms.fillDate')}</TableCell>
                  <TableCell>{t('inventory.forms.fillTime')}</TableCell>
                  <TableCell>{t('inventory.forms.email')}</TableCell>
                  <TableCell>{t('inventory.forms.employeeName')}</TableCell>
                  <TableCell>{t('inventory.forms.position')}</TableCell>
                  <TableCell>{t('inventory.forms.unloadingDate')}</TableCell>
                  <TableCell>{t('inventory.forms.carrierName')}</TableCell>
                  <TableCell>{t('inventory.forms.vehicleRegistration')}</TableCell>
                  <TableCell>{t('inventory.forms.vehicleTechnicalCondition')}</TableCell>
                  <TableCell>{t('inventory.forms.transportHygiene')}</TableCell>
                  <TableCell>{t('inventory.forms.supplierName')}</TableCell>
                  <TableCell>{t('inventory.forms.poNumber')}</TableCell>
                  <TableCell>{t('inventory.forms.deliveredItems')}</TableCell>
                  <TableCell align="right">{t('inventory.forms.palletQuantity')}</TableCell>
                  <TableCell align="right">{t('inventory.forms.cartonsTubsQuantity')}</TableCell>
                  <TableCell align="right">{t('inventory.forms.weight')}</TableCell>
                  <TableCell>{t('inventory.forms.visualInspectionResult')}</TableCell>
                  <TableCell>{t('inventory.forms.ecoCertificateNumber')}</TableCell>
                  <TableCell>{t('inventory.forms.unloadingNotes')}</TableCell>
                  <TableCell>{t('inventory.forms.goodsNotes')}</TableCell>
                  <TableCell>{t('inventory.forms.documents')}</TableCell>
                  <TableCell align="center">{t('inventory.forms.actions')}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {unloadingReportResponses.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{row.fillDate ? format(row.fillDate, 'dd.MM.yyyy', { locale: pl }) : '-'}</TableCell>
                    <TableCell>{row.fillTime || '-'}</TableCell>
                    <TableCell>{row.email}</TableCell>
                    <TableCell>{row.employeeName}</TableCell>
                    <TableCell>{row.position}</TableCell>
                    <TableCell>{row.unloadingDate ? format(row.unloadingDate, 'dd.MM.yyyy', { locale: pl }) : '-'}</TableCell>
                    <TableCell>{row.carrierName}</TableCell>
                    <TableCell>{row.vehicleRegistration}</TableCell>
                    <TableCell>{row.vehicleTechnicalCondition}</TableCell>
                    <TableCell>{row.transportHygiene}</TableCell>
                    <TableCell>{row.supplierName}</TableCell>
                    <TableCell>{row.poNumber}</TableCell>
                    <TableCell sx={{ maxWidth: 300, minWidth: 200 }}>
                      {formatDeliveredItems(row)}
                    </TableCell>
                    <TableCell align="right">{row.palletQuantity}</TableCell>
                    <TableCell align="right">{row.cartonsTubsQuantity}</TableCell>
                    <TableCell align="right">{row.weight}</TableCell>
                    <TableCell>{row.visualInspectionResult}</TableCell>
                    <TableCell>{row.ecoCertificateNumber || '-'}</TableCell>
                    <TableCell>{row.notes || '-'}</TableCell>
                    <TableCell>{row.goodsNotes || '-'}</TableCell>
                    <TableCell>
                      {row.documentsUrl ? (
                        <Button 
                          size="small" 
                          href={row.documentsUrl} 
                          target="_blank" 
                          rel="noopener noreferrer"
                        >
                          {row.documentsName || t('inventory.forms.download')}
                        </Button>
                      ) : '-'}
                    </TableCell>
                    <TableCell align="center">
                      <Tooltip title={t('inventory.forms.editResponse')}>
                        <IconButton 
                          size="small" 
                          color="primary"
                          onClick={() => handleEditClick(row, 'unloadingReport')}
                        >
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title={t('inventory.forms.deleteResponse')}>
                        <IconButton 
                          size="small" 
                          color="error"
                          onClick={() => handleDeleteClick(row, 'unloadingReport')}
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
          
          {/* ✅ OPTYMALIZACJA: Pagination component for Unloading Reports */}
          {totalCount > 0 && (
            <TablePagination
              rowsPerPageOptions={[5, 10, 25, 50]}
              component="div"
              count={totalCount}
              rowsPerPage={rowsPerPage}
              page={page}
              onPageChange={handleChangePage}
              onRowsPerPageChange={handleChangeRowsPerPage}
              labelRowsPerPage={t('inventory.forms.rowsPerPage')}
              labelDisplayedRows={({ from, to, count }) => 
                `${from}-${to} ${t('inventory.forms.of')} ${count !== -1 ? count : `${t('inventory.forms.moreThan')} ${to}`}`
              }
            />
          )}
        </>
      )}
    </>
  );
  
  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h5" gutterBottom>{t('inventory.forms.responses.title')}</Typography>
        <Typography variant="body2" color="text.secondary" gutterBottom>{t('inventory.forms.responses.description')}</Typography>
      </Box>
      
      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>{t('inventory.forms.errorLoadingData')}: {error}</Alert>
      )}
      
      <Paper sx={{ mb: 4 }}>
        <Tabs 
          value={tabValue} 
          onChange={handleTabChange} 
          indicatorColor="primary"
          textColor="primary"
          variant="fullWidth"
        >
          <Tab label={t('inventory.forms.loadingReport.title')} />
          <Tab label={t('inventory.forms.unloadingReport.title')} />
        </Tabs>
      </Paper>
      
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
          <CircularProgress />
        </Box>
      ) : (
        <Box>
          {tabValue === 0 && <LoadingReportTable />}
          {tabValue === 1 && <UnloadingReportTable />}
        </Box>
      )}

      {/* Dialog potwierdzenia usunięcia */}
      <Dialog
        open={deleteConfirmOpen}
        onClose={handleDeleteCancel}
      >
        <DialogTitle>{t('inventory.forms.deleteConfirm.title')}</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {t('inventory.forms.deleteConfirm.message')}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleDeleteCancel} color="primary">{t('inventory.forms.deleteConfirm.cancel')}</Button>
          <Button onClick={handleDeleteConfirm} color="error" autoFocus>{t('inventory.forms.deleteConfirm.delete')}</Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default InventoryFormsResponsesPage; 