import React, { useState, useEffect } from 'react';
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
  Tooltip
} from '@mui/material';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';
import { db, storage } from '../../services/firebase/config';
import { collection, getDocs, query, doc, deleteDoc } from 'firebase/firestore';
import { ref, deleteObject } from 'firebase/storage';
import { useNavigate } from 'react-router-dom';
import { Delete as DeleteIcon, Edit as EditIcon } from '@mui/icons-material';
import { useTheme } from '@mui/material/styles';
import { useTranslation } from '../../hooks/useTranslation';

// Komponent strony odpowiedzi formularzy magazynowych
const InventoryFormsResponsesPage = () => {
  const theme = useTheme();
  const { t } = useTranslation();
  const [tabValue, setTabValue] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();
  
  const [loadingReportResponses, setLoadingReportResponses] = useState([]);
  const [unloadingReportResponses, setUnloadingReportResponses] = useState([]);
  
  // Stan dla dialogu potwierdzenia usunięcia
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteItemData, setDeleteItemData] = useState(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      // ✅ OPTYMALIZACJA: Równoległe pobieranie wszystkich formularzy
      const [loadingReportSnapshot, unloadingReportSnapshot] = await Promise.all([
        getDocs(query(collection(db, 'Forms/ZaladunekTowaru/Odpowiedzi'))),
        getDocs(query(collection(db, 'Forms/RozladunekTowaru/Odpowiedzi')))
      ]);

      // Przetwarzanie odpowiedzi "Załadunek Towaru"
      const loadingReportData = loadingReportSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        fillDate: doc.data().fillDate?.toDate(),
        loadingDate: doc.data().loadingDate?.toDate()
      }))
      // Sortowanie od najnowszych (domyślnie)
      .sort((a, b) => {
        const dateA = a.fillDate || new Date(0);
        const dateB = b.fillDate || new Date(0);
        return dateB - dateA; // Od najnowszych do najstarszych
      });
      setLoadingReportResponses(loadingReportData);

      // Przetwarzanie odpowiedzi "Rozładunek Towaru"
      const unloadingReportData = unloadingReportSnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          fillDate: data.fillDate?.toDate(),
          unloadingDate: data.unloadingDate?.toDate(),
          // Obsługa selectedItems z konwersją dat ważności
          selectedItems: data.selectedItems?.map(item => ({
            ...item,
            expiryDate: item.expiryDate?.toDate ? item.expiryDate.toDate() : item.expiryDate
          })) || []
        };
      })
      // Sortowanie od najnowszych (domyślnie)
      .sort((a, b) => {
        const dateA = a.fillDate || new Date(0);
        const dateB = b.fillDate || new Date(0);
        return dateB - dateA; // Od najnowszych do najstarszych
      });
      setUnloadingReportResponses(unloadingReportData);
      
      console.log('✅ Formularze magazynowe zostały załadowane równolegle');
      console.log('📦 Raporty rozładunku towaru:', unloadingReportData);
      console.log('🔍 Przykładowe selectedItems:', unloadingReportData[0]?.selectedItems);
    } catch (err) {
      console.error('Błąd podczas pobierania danych:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };
  
  useEffect(() => {
    fetchData();
  }, []);
  
  const handleTabChange = (event, newValue) => {
    setTabValue(newValue);
  };

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

  // Funkcja do formatowania pozycji dostarczonych
  const formatDeliveredItems = (row) => {
    // Nowy format z selectedItems (tablica obiektów)
    if (row.selectedItems && Array.isArray(row.selectedItems) && row.selectedItems.length > 0) {
      return (
        <Box>
          {row.selectedItems.map((item, index) => (
            <Box key={index} sx={{ mb: 1, fontSize: '0.875rem' }}>
              <Typography variant="body2" fontWeight="bold" sx={{ fontSize: '0.8rem' }}>
                {item.productName || 'Brak nazwy'}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
                Zamówiono: {item.quantity ? `${item.quantity} ${item.unit || 'szt.'}` : 'Brak danych'}
              </Typography>
              {item.unloadedQuantity && (
                <Typography variant="caption" color="primary" sx={{ fontSize: '0.75rem', display: 'block' }}>
                  Rozładowano: {item.unloadedQuantity}
                </Typography>
              )}
              {item.expiryDate && (
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.75rem', display: 'block' }}>
                  Ważność: {(() => {
                    try {
                      const date = item.expiryDate.toDate ? item.expiryDate.toDate() : new Date(item.expiryDate);
                      return format(date, 'dd.MM.yyyy');
                    } catch (error) {
                      return 'Nieprawidłowa data';
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
  
  const handleExportToCSV = (data, filename) => {
    // Funkcja do eksportu danych do pliku CSV
    let csvContent = "data:text/csv;charset=utf-8,";
    
    if (tabValue === 0) {
      csvContent += "Data wypełnienia,Email,Pracownik,Stanowisko,Numer CMR,Data załadunku,Przewoźnik,Nr rejestracyjny,Stan techniczny,Nazwa klienta,Numer zamówienia,Paleta/nazwa produktu,Ilość palet,Waga,Uwagi załadunku,Uwagi towaru\n";
      data.forEach(row => {
        csvContent += `${formatDateTime(row.fillDate)},${row.email || ''},${row.employeeName || ''},${row.position || ''},${row.cmrNumber || ''},${row.loadingDate ? format(row.loadingDate, 'dd.MM.yyyy') : ''},${row.carrierName || ''},${row.vehicleRegistration || ''},${row.vehicleTechnicalCondition || ''},${row.clientName || ''},${row.orderNumber || ''},${row.palletProductName || ''},${row.palletQuantity || ''},${row.weight || ''},${row.notes || ''},${row.goodsNotes || ''}\n`;
      });
    } else if (tabValue === 1) {
      csvContent += "Data wypełnienia,Email,Pracownik,Stanowisko,Data rozładunku,Przewoźnik,Nr rejestracyjny,Stan techniczny,Higiena transportu,Dostawca,Numer PO,Pozycje dostarczone,Ilość palet,Ilość kartonów/tub,Waga,Ocena wizualna,Nr certyfikatu ekologicznego,Uwagi rozładunku,Uwagi towaru\n";
      data.forEach(row => {
        // Formatuj pozycje dostarczone dla CSV
        let itemsText = '';
        if (row.selectedItems && Array.isArray(row.selectedItems) && row.selectedItems.length > 0) {
          itemsText = row.selectedItems.map(item => {
            let itemText = item.productName || 'Brak nazwy';
            if (item.quantity) itemText += ` (zamówiono: ${item.quantity} ${item.unit || 'szt.'})`;
            if (item.unloadedQuantity) itemText += ` (rozładowano: ${item.unloadedQuantity})`;
            if (item.expiryDate) {
              try {
                const date = item.expiryDate.toDate ? item.expiryDate.toDate() : new Date(item.expiryDate);
                itemText += ` (ważność: ${format(date, 'dd.MM.yyyy')})`;
              } catch (error) {
                itemText += ` (ważność: nieprawidłowa data)`;
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
      let collectionPath = '';
      
      switch (formType) {
        case 'loadingReport':
          collectionPath = 'Forms/ZaladunekTowaru/Odpowiedzi';
          break;
        case 'unloadingReport':
          collectionPath = 'Forms/RozladunekTowaru/Odpowiedzi';
          break;
        default:
          throw new Error('Nieznany typ formularza');
      }
      
      // Usuń załączniki z Firebase Storage jeśli istnieją (tylko dla raportów rozładunku)
      if (item.documentsUrl && formType !== 'loadingReport') {
        try {
          const storagePath = extractStoragePathFromUrl(item.documentsUrl);
          if (storagePath) {
            const fileRef = ref(storage, storagePath);
            await deleteObject(fileRef);
            console.log(`Usunięto załącznik z Storage: ${storagePath}`);
          }
        } catch (storageError) {
          console.warn('Nie można usunąć załącznika z Storage:', storageError);
          // Kontynuuj mimo błędu usuwania załącznika
        }
      }
      
      // Usuń dokument z Firestore
      const docRef = doc(db, collectionPath, item.id);
      await deleteDoc(docRef);
      
      // Odśwież dane po usunięciu
      fetchData();
      
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
            onClick={() => handleExportToCSV(loadingReportResponses, 'raporty-zaladunku-towaru.csv')}
            disabled={loadingReportResponses.length === 0}
            sx={{ mr: 1 }}
          >
            {t('inventory.forms.exportToCSV')}
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
      {loadingReportResponses.length === 0 ? (
        <Alert severity="info">{t('inventory.forms.noResponses')}</Alert>
      ) : (
        <TableContainer component={Paper} sx={{ maxHeight: 600, overflowX: 'auto' }}>
          <Table size="small" stickyHeader>
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
            onClick={() => handleExportToCSV(unloadingReportResponses, 'raporty-rozladunku-towaru.csv')}
            disabled={unloadingReportResponses.length === 0}
            sx={{ mr: 1 }}
          >
            {t('inventory.forms.exportToCSV')}
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
      {unloadingReportResponses.length === 0 ? (
        <Alert severity="info">{t('inventory.forms.noResponses')}</Alert>
      ) : (
        <TableContainer component={Paper} sx={{ maxHeight: 600, overflowX: 'auto' }}>
          <Table size="small" stickyHeader>
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