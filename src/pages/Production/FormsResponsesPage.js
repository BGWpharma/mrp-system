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
  Tooltip,
  TextField,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  InputAdornment,
  Grid,
  Link
} from '@mui/material';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';
import { db } from '../../services/firebase/config';
import { collection, getDocs, query, doc, deleteDoc } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { Delete as DeleteIcon, Edit as EditIcon, Search as SearchIcon, FilterList as FilterListIcon } from '@mui/icons-material';

// Komponent strony odpowiedzi formularzy
const FormsResponsesPage = () => {
  const [tabValue, setTabValue] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();
  
  const [completedMOResponses, setCompletedMOResponses] = useState([]);
  const [productionControlResponses, setProductionControlResponses] = useState([]);
  const [productionShiftResponses, setProductionShiftResponses] = useState([]);
  const [filteredShiftResponses, setFilteredShiftResponses] = useState([]);
  
  // Filtry dla tabeli zmian produkcyjnych
  const [shiftFilters, setShiftFilters] = useState({
    responsiblePerson: '',
    shiftType: '',
    product: '',
    moNumber: ''
  });
  
  // Stan dla dialogu potwierdzenia usunięcia
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteItemData, setDeleteItemData] = useState(null);
  
  // Stan dla panelu filtrów
  const [showFilters, setShowFilters] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      // ✅ OPTYMALIZACJA: Równoległe pobieranie wszystkich formularzy
      const [completedMOSnapshot, controlSnapshot, shiftSnapshot] = await Promise.all([
        getDocs(query(collection(db, 'Forms/SkonczoneMO/Odpowiedzi'))),
        getDocs(query(collection(db, 'Forms/KontrolaProdukcji/Odpowiedzi'))),
        getDocs(query(collection(db, 'Forms/ZmianaProdukcji/Odpowiedzi')))
      ]);

      // Przetwarzanie odpowiedzi "Skończone MO"
      const completedMOData = completedMOSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        date: doc.data().date?.toDate() // Konwersja Timestamp na Date
      }));
      setCompletedMOResponses(completedMOData);

      // Przetwarzanie odpowiedzi "Kontrola Produkcji"
      const controlData = controlSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        fillDate: doc.data().fillDate?.toDate(),
        productionStartDate: doc.data().productionStartDate?.toDate(),
        productionEndDate: doc.data().productionEndDate?.toDate(),
        readingDate: doc.data().readingDate?.toDate()
      }));
      setProductionControlResponses(controlData);

      // Przetwarzanie odpowiedzi "Zmiana Produkcji"
      const shiftData = shiftSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        fillDate: doc.data().fillDate?.toDate()
      }));
      setProductionShiftResponses(shiftData);
      setFilteredShiftResponses(shiftData);
      
      console.log('✅ Wszystkie formularze zostały załadowane równolegle');
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
  
  useEffect(() => {
    // Filtrowanie danych zmian produkcyjnych na podstawie filtrów
    if (productionShiftResponses.length > 0) {
      let filtered = [...productionShiftResponses];
      
      if (shiftFilters.responsiblePerson) {
        filtered = filtered.filter(item => 
          item.responsiblePerson && item.responsiblePerson.toLowerCase().includes(shiftFilters.responsiblePerson.toLowerCase())
        );
      }
      
      if (shiftFilters.shiftType) {
        filtered = filtered.filter(item => 
          item.shiftType === shiftFilters.shiftType
        );
      }
      
      if (shiftFilters.product) {
        filtered = filtered.filter(item => 
          item.product && item.product.toLowerCase().includes(shiftFilters.product.toLowerCase())
        );
      }
      
      if (shiftFilters.moNumber) {
        filtered = filtered.filter(item => 
          item.moNumber && item.moNumber.toLowerCase().includes(shiftFilters.moNumber.toLowerCase())
        );
      }
      
      setFilteredShiftResponses(filtered);
    }
  }, [productionShiftResponses, shiftFilters]);
  
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
    
    // Dodaj nagłówki w zależności od typu danych
    if (tabValue === 0) {
      csvContent += "Data,Email,Numer MO,Ilość produktu,Straty opakowania,Straty produktu,Straty surowca\n";
      data.forEach(row => {
        csvContent += `${formatDateTime(row.date)},${row.email || ''},${row.moNumber || ''},${row.productQuantity || ''},${row.packagingLoss || ''},${row.bulkLoss || ''},${row.rawMaterialLoss || ''}\n`;
      });
    } else if (tabValue === 1) {
      csvContent += "Data,Email,Imię i nazwisko,Stanowisko,Manufacturing Order,Customer Order,Nazwa produktu,Numer LOT,Temperatura,Wilgotność,Skan dokumentów,Zdjęcie produktu 1,Zdjęcie produktu 2,Zdjęcie produktu 3\n";
      data.forEach(row => {
        csvContent += `${formatDateTime(row.fillDate)},${row.email || ''},${row.name || ''},${row.position || ''},${row.manufacturingOrder || ''},${row.customerOrder || ''},${row.productName || ''},${row.lotNumber || ''},${row.temperature || ''},${row.humidity || ''},${row.documentScansUrl || ''},${row.productPhoto1Url || ''},${row.productPhoto2Url || ''},${row.productPhoto3Url || ''}\n`;
      });
    } else {
      csvContent += "Data,Email,Osoba odpowiedzialna,Rodzaj zmiany,Produkt,Numer MO,Ilość produkcji,Pracownicy,Straty surowca,Inne czynności\n";
      data.forEach(row => {
        const workers = Array.isArray(row.shiftWorkers) ? row.shiftWorkers.join(', ') : '';
        csvContent += `${formatDateTime(row.fillDate)},${row.email || ''},${row.responsiblePerson || ''},${row.shiftType || ''},${row.product || ''},${row.moNumber || ''},${row.productionQuantity || ''},"${workers}",${row.rawMaterialLoss || ''},${row.otherActivities || ''}\n`;
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
        case 'completedMO':
          collectionPath = 'Forms/SkonczoneMO/Odpowiedzi';
          break;
        case 'productionControl':
          collectionPath = 'Forms/KontrolaProdukcji/Odpowiedzi';
          break;
        case 'productionShift':
          collectionPath = 'Forms/ZmianaProdukcji/Odpowiedzi';
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
      shiftType: '',
      product: '',
      moNumber: ''
    });
  };
  
  const toggleFilters = () => {
    setShowFilters(!showFilters);
  };
  
  // Komponent tabeli dla raportu zakończonych MO
  const CompletedMOTable = () => (
    <>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
        <Typography variant="h6">Raporty zakończonych MO</Typography>
        <Box>
          <Button 
            variant="outlined" 
            onClick={() => handleExportToCSV(completedMOResponses, 'raport-zakonczonych-mo.csv')}
            disabled={completedMOResponses.length === 0}
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
      {completedMOResponses.length === 0 ? (
        <Alert severity="info">Brak zapisanych odpowiedzi formularzy</Alert>
      ) : (
        <TableContainer component={Paper} sx={{ maxHeight: 600, overflowX: 'auto' }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow sx={{ backgroundColor: '#f5f5f5' }}>
                <TableCell>Data</TableCell>
                <TableCell>Godzina</TableCell>
                <TableCell>Email</TableCell>
                <TableCell>Numer MO</TableCell>
                <TableCell align="right">Ilość produktu</TableCell>
                <TableCell align="right">Straty opakowania</TableCell>
                <TableCell align="right">Straty wieczka</TableCell>
                <TableCell align="right">Straty surowca</TableCell>
                <TableCell>Raport planu mieszań</TableCell>
                <TableCell align="center">Akcje</TableCell>
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
                  <TableCell>
                    {row.mixingPlanReportUrl ? (
                      <Button 
                        size="small" 
                        href={row.mixingPlanReportUrl} 
                        target="_blank" 
                        rel="noopener noreferrer"
                      >
                        {row.mixingPlanReportName || 'Pobierz'}
                      </Button>
                    ) : '-'}
                  </TableCell>
                  <TableCell align="center">
                    <Tooltip title="Edytuj odpowiedź">
                      <IconButton 
                        size="small" 
                        color="primary"
                        onClick={() => handleEditClick(row, 'completedMO')}
                      >
                        <EditIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Usuń odpowiedź">
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
      )}
    </>
  );
  
  // Komponent tabeli dla raportów kontroli produkcji
  const ProductionControlTable = () => (
    <>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
        <Typography variant="h6">Raporty kontroli produkcji</Typography>
        <Box>
          <Button 
            variant="outlined" 
            onClick={() => handleExportToCSV(productionControlResponses, 'raporty-kontroli-produkcji.csv')}
            disabled={productionControlResponses.length === 0}
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
      {productionControlResponses.length === 0 ? (
        <Alert severity="info">Brak zapisanych odpowiedzi formularzy</Alert>
      ) : (
        <TableContainer component={Paper} sx={{ maxHeight: 600, overflowX: 'auto' }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow sx={{ backgroundColor: '#f5f5f5' }}>
                <TableCell>Data wypełnienia</TableCell>
                <TableCell>Email</TableCell>
                <TableCell>Imię i nazwisko</TableCell>
                <TableCell>Stanowisko</TableCell>
                <TableCell>Manufacturing Order</TableCell>
                <TableCell>Customer Order</TableCell>
                <TableCell>Data rozpoczęcia</TableCell>
                <TableCell>Godzina rozpoczęcia</TableCell>
                <TableCell>Data zakończenia</TableCell>
                <TableCell>Godzina zakończenia</TableCell>
                <TableCell>Nazwa produktu</TableCell>
                <TableCell>Numer LOT</TableCell>
                <TableCell>Data ważności</TableCell>
                <TableCell>Ilość</TableCell>
                <TableCell>Numer zmiany</TableCell>
                <TableCell>Temperatura</TableCell>
                <TableCell>Wilgotność</TableCell>
                <TableCell>Stan surowca</TableCell>
                <TableCell>Stan opakowania</TableCell>
                <TableCell>Zamknięcie opakowania</TableCell>
                <TableCell>Ilość opakowań na palecie</TableCell>
                <TableCell>Skany dokumentów</TableCell>
                <TableCell>Zdjęcie produktu 1</TableCell>
                <TableCell>Zdjęcie produktu 2</TableCell>
                <TableCell>Zdjęcie produktu 3</TableCell>
                <TableCell align="center">Akcje</TableCell>
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
                        {row.documentScansName || 'Pokaż dokument'}
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
                          {row.productPhoto1Name || 'Powiększ'}
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
                          {row.productPhoto2Name || 'Powiększ'}
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
                          {row.productPhoto3Name || 'Powiększ'}
                        </Link>
                      </Box>
                    ) : '-'}
                  </TableCell>
                  <TableCell align="center">
                    <Tooltip title="Edytuj odpowiedź">
                      <IconButton 
                        size="small" 
                        color="primary"
                        onClick={() => handleEditClick(row, 'productionControl')}
                      >
                        <EditIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Usuń odpowiedź">
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
      )}
    </>
  );
  
  // Komponent tabeli dla raportów zmian produkcyjnych
  const ProductionShiftTable = () => {
    // Zbierz unikalne wartości dla filtrów
    const uniqueResponsiblePersons = [...new Set(productionShiftResponses.map(item => item.responsiblePerson))].filter(Boolean);
    const uniqueShiftTypes = [...new Set(productionShiftResponses.map(item => item.shiftType))].filter(Boolean);
    const uniqueProducts = [...new Set(productionShiftResponses.map(item => item.product))].filter(Boolean);
    
    return (
      <>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
          <Typography variant="h6">Raporty zmian produkcyjnych</Typography>
          <Box>
            <Button 
              variant="outlined" 
              onClick={() => handleExportToCSV(filteredShiftResponses, 'raporty-zmian-produkcyjnych.csv')}
              disabled={filteredShiftResponses.length === 0}
              sx={{ mr: 1 }}
            >
              Eksportuj do CSV
            </Button>
            <Button 
              variant="outlined"
              color="secondary"
              onClick={handleBack}
              sx={{ mr: 1 }}
            >
              Powrót
            </Button>
            <Button
              variant="outlined"
              color="info"
              onClick={toggleFilters}
              startIcon={<FilterListIcon />}
            >
              Filtry
            </Button>
          </Box>
        </Box>
        
        {showFilters && (
          <Paper sx={{ p: 2, mb: 2 }}>
            <Grid container spacing={2}>
              <Grid item xs={12}>
                <Typography variant="subtitle2" gutterBottom>
                  Filtry raportów zmian produkcyjnych
                </Typography>
              </Grid>
              
              <Grid item xs={12} sm={6} md={3}>
                <FormControl fullWidth size="small">
                  <InputLabel>Osoba odpowiedzialna</InputLabel>
                  <Select
                    name="responsiblePerson"
                    value={shiftFilters.responsiblePerson}
                    onChange={handleFilterChange}
                    label="Osoba odpowiedzialna"
                    displayEmpty
                  >
                    <MenuItem value="">Wszystkie</MenuItem>
                    {uniqueResponsiblePersons.map(person => (
                      <MenuItem key={person} value={person}>{person}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              
              <Grid item xs={12} sm={6} md={3}>
                <FormControl fullWidth size="small">
                  <InputLabel>Rodzaj zmiany</InputLabel>
                  <Select
                    name="shiftType"
                    value={shiftFilters.shiftType}
                    onChange={handleFilterChange}
                    label="Rodzaj zmiany"
                    displayEmpty
                  >
                    <MenuItem value="">Wszystkie</MenuItem>
                    {uniqueShiftTypes.map(type => (
                      <MenuItem key={type} value={type}>{type}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              
              <Grid item xs={12} sm={6} md={3}>
                <FormControl fullWidth size="small">
                  <InputLabel>Produkt</InputLabel>
                  <Select
                    name="product"
                    value={shiftFilters.product}
                    onChange={handleFilterChange}
                    label="Produkt"
                    displayEmpty
                  >
                    <MenuItem value="">Wszystkie</MenuItem>
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
                  label="Numer MO"
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
                    Wyczyść filtry
                  </Button>
                </Box>
              </Grid>
            </Grid>
          </Paper>
        )}
        
        <Box sx={{ mb: 2 }}>
          <Typography variant="body2" color="text.secondary">
            Znaleziono {filteredShiftResponses.length} z {productionShiftResponses.length} raportów
          </Typography>
        </Box>
        
        {filteredShiftResponses.length === 0 ? (
          <Alert severity="info">Brak zapisanych odpowiedzi formularzy lub brak wyników dla wybranych filtrów</Alert>
        ) : (
          <TableContainer component={Paper} sx={{ maxHeight: 600, overflowX: 'auto' }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow sx={{ backgroundColor: '#f5f5f5' }}>
                  <TableCell>Data</TableCell>
                  <TableCell>Godzina</TableCell>
                  <TableCell>Email</TableCell>
                  <TableCell>Osoba odpowiedzialna</TableCell>
                  <TableCell>Rodzaj zmiany</TableCell>
                  <TableCell>Produkt</TableCell>
                  <TableCell>Numer MO</TableCell>
                  <TableCell align="right">Ilość produkcji</TableCell>
                  <TableCell>Pracownicy</TableCell>
                  <TableCell>Nadruk doypack/tub 1</TableCell>
                  <TableCell align="right">Ilość nadruku 1</TableCell>
                  <TableCell align="right">Straty nadruku 1</TableCell>
                  <TableCell>Nadruk doypack/tub 2</TableCell>
                  <TableCell align="right">Ilość nadruku 2</TableCell>
                  <TableCell align="right">Straty nadruku 2</TableCell>
                  <TableCell>Nadruk doypack/tub 3</TableCell>
                  <TableCell align="right">Ilość nadruku 3</TableCell>
                  <TableCell align="right">Straty nadruku 3</TableCell>
                  <TableCell>Straty surowca</TableCell>
                  <TableCell>Inne czynności</TableCell>
                  <TableCell>Awarie maszyn</TableCell>
                  <TableCell align="center">Akcje</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredShiftResponses.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{row.fillDate ? format(row.fillDate, 'dd.MM.yyyy', { locale: pl }) : '-'}</TableCell>
                    <TableCell>{row.fillTime || '-'}</TableCell>
                    <TableCell>{row.email}</TableCell>
                    <TableCell>{row.responsiblePerson}</TableCell>
                    <TableCell>{row.shiftType}</TableCell>
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
                    <TableCell>{row.otherActivities}</TableCell>
                    <TableCell>{row.machineIssues}</TableCell>
                    <TableCell align="center">
                      <Tooltip title="Edytuj odpowiedź">
                        <IconButton 
                          size="small" 
                          color="primary"
                          onClick={() => handleEditClick(row, 'productionShift')}
                        >
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Usuń odpowiedź">
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
        )}
      </>
    );
  };
  
  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h5" gutterBottom>
          Odpowiedzi formularzy produkcyjnych
        </Typography>
        <Typography variant="body2" color="text.secondary" gutterBottom>
          Przeglądaj dane z wypełnionych formularzy produkcyjnych
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
          <Tab label="Raporty zakończonych MO" />
          <Tab label="Raporty kontroli produkcji" />
          <Tab label="Raporty zmian produkcyjnych" />
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

export default FormsResponsesPage; 