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
import { db } from '../../services/firebase/config';
import { collection, getDocs, query, doc, deleteDoc } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { Delete as DeleteIcon, Edit as EditIcon } from '@mui/icons-material';

// Komponent strony odpowiedzi formularzy magazynowych
const InventoryFormsResponsesPage = () => {
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
      }));
      setLoadingReportResponses(loadingReportData);

      // Przetwarzanie odpowiedzi "Rozładunek Towaru"
      const unloadingReportData = unloadingReportSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        fillDate: doc.data().fillDate?.toDate(),
        unloadingDate: doc.data().unloadingDate?.toDate()
      }));
      setUnloadingReportResponses(unloadingReportData);
      
      console.log('✅ Formularze magazynowe zostały załadowane równolegle');
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
  
  const formatDateTime = (date) => {
    if (!date) return '-';
    try {
      return format(date, 'dd.MM.yyyy HH:mm', { locale: pl });
    } catch (error) {
      console.error('Błąd formatowania daty:', error);
      return '-';
    }
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
      csvContent += "Data wypełnienia,Email,Pracownik,Stanowisko,Data rozładunku,Przewoźnik,Nr rejestracyjny,Stan techniczny,Higiena transportu,Dostawca,Numer PO,Opis towaru,Ilość palet,Ilość kartonów/tub,Waga,Ocena wizualna,Nr certyfikatu ekologicznego,Uwagi rozładunku,Uwagi towaru\n";
      data.forEach(row => {
        csvContent += `${formatDateTime(row.fillDate)},${row.email || ''},${row.employeeName || ''},${row.position || ''},${row.unloadingDate ? format(row.unloadingDate, 'dd.MM.yyyy') : ''},${row.carrierName || ''},${row.vehicleRegistration || ''},${row.vehicleTechnicalCondition || ''},${row.transportHygiene || ''},${row.supplierName || ''},${row.poNumber || ''},${row.goodsDescription || ''},${row.palletQuantity || ''},${row.cartonsTubsQuantity || ''},${row.weight || ''},${row.visualInspectionResult || ''},${row.ecoCertificateNumber || ''},${row.notes || ''},${row.goodsNotes || ''}\n`;
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
        <Typography variant="h6">Raporty załadunku towaru</Typography>
        <Box>
          <Button 
            variant="outlined" 
            onClick={() => handleExportToCSV(loadingReportResponses, 'raporty-zaladunku-towaru.csv')}
            disabled={loadingReportResponses.length === 0}
            sx={{ mr: 1 }}
          >
            Eksportuj do CSV
          </Button>
          <Button 
            variant="outlined"
            color="secondary"
            onClick={handleBack}
          >
            Powrót
          </Button>
        </Box>
      </Box>
      {loadingReportResponses.length === 0 ? (
        <Alert severity="info">Brak zapisanych odpowiedzi formularzy</Alert>
      ) : (
        <TableContainer component={Paper} sx={{ maxHeight: 600, overflowX: 'auto' }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow sx={{ backgroundColor: '#f5f5f5' }}>
                <TableCell>Data wypełnienia</TableCell>
                <TableCell>Godzina</TableCell>
                <TableCell>Email</TableCell>
                <TableCell>Pracownik</TableCell>
                <TableCell>Stanowisko</TableCell>
                <TableCell>Numer CMR</TableCell>
                <TableCell>Data załadunku</TableCell>
                <TableCell>Przewoźnik</TableCell>
                <TableCell>Nr rejestracyjny</TableCell>
                <TableCell>Stan techniczny</TableCell>
                <TableCell>Nazwa klienta</TableCell>
                <TableCell>Numer zamówienia</TableCell>
                <TableCell>Paleta/nazwa produktu</TableCell>
                <TableCell align="right">Ilość palet</TableCell>
                <TableCell align="right">Waga</TableCell>
                <TableCell>Uwagi załadunku</TableCell>
                <TableCell>Uwagi towaru</TableCell>
                <TableCell>Załączniki</TableCell>
                <TableCell align="center">Akcje</TableCell>
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
                  <TableCell>
                    {row.documentsUrl ? (
                      <Button 
                        size="small" 
                        href={row.documentsUrl} 
                        target="_blank" 
                        rel="noopener noreferrer"
                      >
                        {row.documentsName || 'Pobierz'}
                      </Button>
                    ) : '-'}
                  </TableCell>
                  <TableCell align="center">
                    <Tooltip title="Edytuj odpowiedź">
                      <IconButton 
                        size="small" 
                        color="primary"
                        onClick={() => handleEditClick(row, 'loadingReport')}
                      >
                        <EditIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Usuń odpowiedź">
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
        <Typography variant="h6">Raporty rozładunku towaru</Typography>
        <Box>
          <Button 
            variant="outlined" 
            onClick={() => handleExportToCSV(unloadingReportResponses, 'raporty-rozladunku-towaru.csv')}
            disabled={unloadingReportResponses.length === 0}
            sx={{ mr: 1 }}
          >
            Eksportuj do CSV
          </Button>
          <Button 
            variant="outlined"
            color="secondary"
            onClick={handleBack}
          >
            Powrót
          </Button>
        </Box>
      </Box>
      {unloadingReportResponses.length === 0 ? (
        <Alert severity="info">Brak zapisanych odpowiedzi formularzy</Alert>
      ) : (
        <TableContainer component={Paper} sx={{ maxHeight: 600, overflowX: 'auto' }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow sx={{ backgroundColor: '#f5f5f5' }}>
                <TableCell>Data wypełnienia</TableCell>
                <TableCell>Godzina</TableCell>
                <TableCell>Email</TableCell>
                <TableCell>Pracownik</TableCell>
                <TableCell>Stanowisko</TableCell>
                <TableCell>Data rozładunku</TableCell>
                <TableCell>Przewoźnik</TableCell>
                <TableCell>Nr rejestracyjny</TableCell>
                <TableCell>Stan techniczny</TableCell>
                <TableCell>Higiena transportu</TableCell>
                <TableCell>Dostawca</TableCell>
                <TableCell>Numer PO</TableCell>
                <TableCell>Opis towaru</TableCell>
                <TableCell align="right">Ilość palet</TableCell>
                <TableCell align="right">Ilość kartonów/tub</TableCell>
                <TableCell align="right">Waga</TableCell>
                <TableCell>Ocena wizualna</TableCell>
                <TableCell>Nr certyfikatu eko</TableCell>
                <TableCell>Uwagi rozładunku</TableCell>
                <TableCell>Uwagi towaru</TableCell>
                <TableCell>Załączniki</TableCell>
                <TableCell align="center">Akcje</TableCell>
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
                  <TableCell sx={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {row.goodsDescription}
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
                        {row.documentsName || 'Pobierz'}
                      </Button>
                    ) : '-'}
                  </TableCell>
                  <TableCell align="center">
                    <Tooltip title="Edytuj odpowiedź">
                      <IconButton 
                        size="small" 
                        color="primary"
                        onClick={() => handleEditClick(row, 'unloadingReport')}
                      >
                        <EditIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Usuń odpowiedź">
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
        <Typography variant="h5" gutterBottom>
          Odpowiedzi formularzy magazynowych
        </Typography>
        <Typography variant="body2" color="text.secondary" gutterBottom>
          Przeglądaj dane z wypełnionych formularzy magazynowych
        </Typography>
      </Box>
      
      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          Błąd podczas ładowania danych: {error}
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
          <Tab label="Raporty załadunku towaru" />
          <Tab label="Raporty rozładunku towaru" />
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
        <DialogTitle>Potwierdź usunięcie</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Czy na pewno chcesz usunąć tę odpowiedź formularza? Ta operacja jest nieodwracalna.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleDeleteCancel} color="primary">
            Anuluj
          </Button>
          <Button onClick={handleDeleteConfirm} color="error" autoFocus>
            Usuń
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default InventoryFormsResponsesPage; 