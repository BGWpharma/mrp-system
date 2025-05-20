import React, { useState, useEffect } from 'react';
import { 
  Container, 
  Paper, 
  Typography, 
  Button, 
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  IconButton,
  CircularProgress,
  Alert,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  TextField,
  Grid,
  MenuItem,
  FormControl,
  InputLabel,
  Select,
  FormControlLabel,
  Checkbox,
  Autocomplete,
  Switch
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import pl from 'date-fns/locale/pl';
import enUS from 'date-fns/locale/en-US';
import { useAuth } from '../../../hooks/useAuth';
import { useNotification } from '../../../hooks/useNotification';
import { 
  getAllCmrDocuments, 
  CMR_STATUSES,
  TRANSPORT_TYPES,
  deleteCmrDocument,
  generateCmrReport
} from '../../../services/cmrService';
import { getAllCustomers } from '../../../services/customerService';

// Ikony
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import VisibilityIcon from '@mui/icons-material/Visibility';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import NoteIcon from '@mui/icons-material/Note';
import AssessmentIcon from '@mui/icons-material/Assessment';
import GetAppIcon from '@mui/icons-material/GetApp';
import TranslateIcon from '@mui/icons-material/Translate';

// Słownik tłumaczeń dla raportów
const translations = {
  pl: {
    reportTitle: 'Raport CMR',
    cmrNumber: 'Numer CMR',
    issueDate: 'Data wystawienia',
    sender: 'Nadawca',
    recipient: 'Odbiorca',
    loadingPlace: 'Miejsce załadunku',
    deliveryPlace: 'Miejsce dostawy',
    status: 'Status',
    itemId: 'Lp.',
    itemDescription: 'Opis towaru',
    itemQuantity: 'Ilość',
    itemUnit: 'Jednostka',
    itemWeight: 'Waga (kg)',
    itemVolume: 'Objętość (m³)',
    summary: 'Podsumowanie',
    totalDocuments: 'Całkowita liczba dokumentów',
    reportPeriod: 'Okres raportu',
    includeItems: 'Uwzględniono pozycje',
    yes: 'Tak',
    no: 'Nie',
    statusStatistics: 'Statystyki według statusu',
    documentCount: 'Liczba dokumentów',
    documentsInReport: 'Dokumenty w raporcie',
    exportToCsv: 'Eksportuj do CSV',
    reportSummary: 'Podsumowanie raportu',
    by: 'według',
    statusReport: 'Statystyki według statusu'
  },
  en: {
    reportTitle: 'CMR Report',
    cmrNumber: 'CMR Number',
    issueDate: 'Issue Date',
    sender: 'Sender',
    recipient: 'Recipient',
    loadingPlace: 'Loading Place',
    deliveryPlace: 'Delivery Place',
    status: 'Status',
    itemId: 'No.',
    itemDescription: 'Item Description',
    itemQuantity: 'Quantity',
    itemUnit: 'Unit',
    itemWeight: 'Weight (kg)',
    itemVolume: 'Volume (m³)',
    summary: 'Summary',
    totalDocuments: 'Total Documents',
    reportPeriod: 'Report Period',
    includeItems: 'Items Included',
    yes: 'Yes',
    no: 'No',
    statusStatistics: 'Status Statistics',
    documentCount: 'Document Count',
    documentsInReport: 'Documents in Report',
    exportToCsv: 'Export to CSV',
    reportSummary: 'Report Summary',
    by: 'by',
    statusReport: 'Status Statistics'
  }
};

// Tłumaczenia statusów CMR
const statusTranslations = {
  [CMR_STATUSES.DRAFT]: { pl: 'Szkic', en: 'Draft' },
  [CMR_STATUSES.ISSUED]: { pl: 'Wystawiony', en: 'Issued' },
  [CMR_STATUSES.IN_TRANSIT]: { pl: 'W transporcie', en: 'In Transit' },
  [CMR_STATUSES.DELIVERED]: { pl: 'Dostarczony', en: 'Delivered' },
  [CMR_STATUSES.COMPLETED]: { pl: 'Zakończony', en: 'Completed' },
  [CMR_STATUSES.CANCELED]: { pl: 'Anulowany', en: 'Canceled' }
};

const CmrListPage = () => {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { showSuccess, showError } = useNotification();
  
  const [loading, setLoading] = useState(true);
  const [cmrDocuments, setCmrDocuments] = useState([]);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [documentToDelete, setDocumentToDelete] = useState(null);
  
  // Nowe stany dla generowania raportów
  const [reportDialogOpen, setReportDialogOpen] = useState(false);
  const [reportFilters, setReportFilters] = useState({
    startDate: format(new Date(new Date().setMonth(new Date().getMonth() - 1)), 'yyyy-MM-dd'),
    endDate: format(new Date(), 'yyyy-MM-dd'),
    sender: '',
    recipient: '',
    status: '',
    includeItems: true,
    language: 'pl' // Domyślny język - polski
  });
  const [reportData, setReportData] = useState(null);
  const [generatingReport, setGeneratingReport] = useState(false);
  const [customers, setCustomers] = useState([]);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  
  // Bieżący słownik tłumaczeń na podstawie wybranego języka
  const t = translations[reportFilters.language] || translations.pl;
  
  useEffect(() => {
    fetchCmrDocuments();
    fetchCustomers();
  }, []);
  
  const fetchCmrDocuments = async () => {
    try {
      setLoading(true);
      const data = await getAllCmrDocuments();
      setCmrDocuments(data);
    } catch (error) {
      console.error('Błąd podczas pobierania dokumentów CMR:', error);
      showError('Nie udało się pobrać listy dokumentów CMR');
    } finally {
      setLoading(false);
    }
  };
  
  const fetchCustomers = async () => {
    try {
      setLoadingCustomers(true);
      const data = await getAllCustomers();
      setCustomers(data);
    } catch (error) {
      console.error('Błąd podczas pobierania klientów:', error);
      showError('Nie udało się pobrać listy klientów');
    } finally {
      setLoadingCustomers(false);
    }
  };
  
  const handleCreateCmr = () => {
    navigate('/inventory/cmr/new');
  };
  
  const handleEditCmr = (id) => {
    navigate(`/inventory/cmr/${id}/edit`);
  };
  
  const handleViewCmr = (id) => {
    navigate(`/inventory/cmr/${id}`);
  };
  
  const handleDeleteClick = (document) => {
    setDocumentToDelete(document);
    setDeleteDialogOpen(true);
  };
  
  const handleDeleteCancel = () => {
    setDeleteDialogOpen(false);
    setDocumentToDelete(null);
  };
  
  const handleDeleteConfirm = async () => {
    if (!documentToDelete) return;
    
    try {
      await deleteCmrDocument(documentToDelete.id);
      showSuccess(`Dokument CMR ${documentToDelete.cmrNumber} został usunięty`);
      setDeleteDialogOpen(false);
      setDocumentToDelete(null);
      fetchCmrDocuments(); // Odśwież listę
    } catch (error) {
      console.error('Błąd podczas usuwania dokumentu CMR:', error);
      showError('Nie udało się usunąć dokumentu CMR');
    }
  };
  
  const formatDate = (date) => {
    if (!date) return '-';
    try {
      return format(date, 'dd.MM.yyyy', { locale: pl });
    } catch (e) {
      return String(date);
    }
  };
  
  const renderStatusChip = (status) => {
    let color;
    switch (status) {
      case CMR_STATUSES.DRAFT:
        color = 'default';
        break;
      case CMR_STATUSES.ISSUED:
        color = 'primary';
        break;
      case CMR_STATUSES.IN_TRANSIT:
        color = 'warning';
        break;
      case CMR_STATUSES.DELIVERED:
        color = 'success';
        break;
      case CMR_STATUSES.COMPLETED:
        color = 'info';
        break;
      case CMR_STATUSES.CANCELED:
        color = 'error';
        break;
      default:
        color = 'default';
    }
    
    return <Chip label={status} color={color} size="small" />;
  };
  
  // Funkcje do obsługi raportów
  const handleOpenReportDialog = () => {
    setReportDialogOpen(true);
  };
  
  const handleCloseReportDialog = () => {
    setReportDialogOpen(false);
    // Resetujemy dane raportu po zamknięciu
    if (reportData) {
      setReportData(null);
    }
  };
  
  const handleReportFilterChange = (e) => {
    const { name, value } = e.target;
    setReportFilters(prev => ({ ...prev, [name]: value }));
  };
  
  const handleReportCheckboxChange = (e) => {
    const { name, checked } = e.target;
    setReportFilters(prev => ({ ...prev, [name]: checked }));
  };
  
  const handleLanguageChange = (e) => {
    setReportFilters(prev => ({ ...prev, language: e.target.checked ? 'en' : 'pl' }));
  };
  
  const handleRecipientChange = (event, newValue) => {
    setReportFilters(prev => ({ 
      ...prev, 
      recipient: newValue ? newValue.name : '' 
    }));
  };
  
  // Funkcja do tłumaczenia statusu
  const translateStatus = (status) => {
    if (statusTranslations[status]) {
      return statusTranslations[status][reportFilters.language] || status;
    }
    return status;
  };
  
  const handleGenerateReport = async () => {
    try {
      setGeneratingReport(true);
      const report = await generateCmrReport(reportFilters);
      setReportData(report);
      showSuccess('Raport został wygenerowany pomyślnie');
    } catch (error) {
      console.error('Błąd podczas generowania raportu:', error);
      showError('Nie udało się wygenerować raportu');
    } finally {
      setGeneratingReport(false);
    }
  };
  
  const exportReportToCsv = () => {
    if (!reportData || !reportData.documents.length) return;
    
    // Tworzymy nagłówki CSV w wybranym języku
    const headers = [
      t.cmrNumber,
      t.issueDate,
      t.sender,
      t.recipient,
      t.loadingPlace,
      t.deliveryPlace,
      t.status
    ];
    
    // Tworzymy wiersze danych
    const rows = [];
    
    reportData.documents.forEach(doc => {
      // Dodaj główny wiersz dokumentu
      rows.push([
        doc.cmrNumber,
        doc.issueDate ? format(doc.issueDate, 'dd.MM.yyyy', { locale: reportFilters.language === 'en' ? enUS : pl }) : '',
        doc.sender,
        doc.recipient,
        doc.loadingPlace,
        doc.deliveryPlace,
        translateStatus(doc.status)
      ]);
      
      // Jeśli dokument ma pozycje i opcja includeItems jest włączona, dodaj je
      if (reportFilters.includeItems && doc.items && doc.items.length > 0) {
        // Dodaj nagłówki pozycji
        rows.push(['', '', t.itemId, t.itemDescription, t.itemQuantity, t.itemUnit, t.itemWeight, t.itemVolume]);
        
        // Dodaj wiersze dla każdej pozycji
        doc.items.forEach((item, index) => {
          rows.push([
            '', '', 
            (index + 1).toString(), 
            item.description, 
            item.numberOfPackages, 
            item.packagingMethod, 
            item.weight, 
            item.volume
          ]);
        });
        
        // Dodaj pustą linię po pozycjach
        rows.push([]);
      }
    });
    
    // Dodajemy podsumowanie raportu
    rows.push([]);
    rows.push([t.reportSummary]);
    rows.push([t.totalDocuments, reportData.statistics.totalDocuments]);
    
    // Dodajemy statystyki według statusu
    rows.push([]);
    rows.push([`${t.statusStatistics}`]);
    Object.entries(reportData.statistics.byStatus).forEach(([status, count]) => {
      rows.push([translateStatus(status), count]);
    });
    
    // Tworzymy zawartość pliku CSV
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell || ''}"`).join(','))
    ].join('\n');
    
    // Tworzymy link do pobrania
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    
    // Nazwa pliku w wybranym języku
    const reportName = reportFilters.language === 'en' 
      ? `CMR_Report_${format(new Date(), 'yyyy-MM-dd')}` 
      : `Raport_CMR_${format(new Date(), 'dd-MM-yyyy')}`;
    
    link.setAttribute('download', `${reportName}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };
  
  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Box sx={{ mb: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h5">
          Dokumenty CMR
        </Typography>
        <Box>
          <Button
            variant="outlined"
            color="primary"
            startIcon={<AssessmentIcon />}
            onClick={handleOpenReportDialog}
            sx={{ mr: 2 }}
          >
            Generuj raport
          </Button>
          <Button
            variant="contained"
            color="primary"
            startIcon={<AddIcon />}
            onClick={handleCreateCmr}
          >
            Nowy dokument CMR
          </Button>
        </Box>
      </Box>
      
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
          <CircularProgress />
        </Box>
      ) : cmrDocuments.length === 0 ? (
        <Alert severity="info">
          Brak dokumentów CMR w systemie. Kliknij "Nowy dokument CMR", aby dodać pierwszy.
        </Alert>
      ) : (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Numer CMR</TableCell>
                <TableCell>Data wystawienia</TableCell>
                <TableCell>Nadawca</TableCell>
                <TableCell>Odbiorca</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Akcje</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {cmrDocuments.map((cmr) => (
                <TableRow key={cmr.id}>
                  <TableCell>{cmr.cmrNumber}</TableCell>
                  <TableCell>{formatDate(cmr.issueDate)}</TableCell>
                  <TableCell>{cmr.sender}</TableCell>
                  <TableCell>{cmr.recipient}</TableCell>
                  <TableCell>{renderStatusChip(cmr.status)}</TableCell>
                  <TableCell>
                    <IconButton
                      size="small"
                      onClick={() => handleViewCmr(cmr.id)}
                      title="Podgląd"
                    >
                      <VisibilityIcon fontSize="small" />
                    </IconButton>
                    
                    {cmr.status !== CMR_STATUSES.COMPLETED && cmr.status !== CMR_STATUSES.CANCELED && (
                      <IconButton
                        size="small"
                        onClick={() => handleEditCmr(cmr.id)}
                        title="Edytuj"
                      >
                        <EditIcon fontSize="small" />
                      </IconButton>
                    )}
                    
                    {cmr.status === CMR_STATUSES.DRAFT && (
                      <IconButton
                        size="small"
                        onClick={() => handleDeleteClick(cmr)}
                        title="Usuń"
                        color="error"
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
      
      {/* Dialog potwierdzenia usunięcia */}
      <Dialog
        open={deleteDialogOpen}
        onClose={handleDeleteCancel}
      >
        <DialogTitle>Potwierdzenie usunięcia</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Czy na pewno chcesz usunąć dokument CMR {documentToDelete?.cmrNumber}?
            Ta operacja jest nieodwracalna.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleDeleteCancel} color="primary">
            Anuluj
          </Button>
          <Button onClick={handleDeleteConfirm} color="error" variant="contained">
            Usuń
          </Button>
        </DialogActions>
      </Dialog>
      
      {/* Dialog generowania raportu */}
      <Dialog
        open={reportDialogOpen}
        onClose={handleCloseReportDialog}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          {reportData 
            ? (reportFilters.language === 'en' ? 'Report Results' : 'Wyniki raportu') 
            : (reportFilters.language === 'en' ? 'Generate CMR Report' : 'Generuj raport z dokumentów CMR')
          }
          <Box sx={{ position: 'absolute', right: 16, top: 8, display: 'flex', alignItems: 'center' }}>
            PL
            <Switch 
              checked={reportFilters.language === 'en'} 
              onChange={handleLanguageChange} 
              color="primary"
              size="small"
            />
            EN
            <TranslateIcon sx={{ ml: 1 }} fontSize="small" />
          </Box>
        </DialogTitle>
        <DialogContent>
          {!reportData ? (
            <Grid container spacing={2} sx={{ mt: 1 }}>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label={reportFilters.language === 'en' ? 'Start Date' : 'Data od'}
                  type="date"
                  name="startDate"
                  value={reportFilters.startDate}
                  onChange={handleReportFilterChange}
                  InputLabelProps={{ shrink: true }}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label={reportFilters.language === 'en' ? 'End Date' : 'Data do'}
                  type="date"
                  name="endDate"
                  value={reportFilters.endDate}
                  onChange={handleReportFilterChange}
                  InputLabelProps={{ shrink: true }}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label={reportFilters.language === 'en' ? 'Sender' : 'Nadawca'}
                  name="sender"
                  value={reportFilters.sender}
                  onChange={handleReportFilterChange}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <Autocomplete
                  options={customers}
                  getOptionLabel={(option) => option.name || ''}
                  isOptionEqualToValue={(option, value) => option.id === value.id}
                  loading={loadingCustomers}
                  onChange={handleRecipientChange}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label={reportFilters.language === 'en' ? 'Recipient' : 'Odbiorca'}
                      InputProps={{
                        ...params.InputProps,
                        endAdornment: (
                          <>
                            {loadingCustomers ? <CircularProgress color="inherit" size={20} /> : null}
                            {params.InputProps.endAdornment}
                          </>
                        ),
                      }}
                    />
                  )}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth>
                  <InputLabel>{reportFilters.language === 'en' ? 'Status' : 'Status'}</InputLabel>
                  <Select
                    name="status"
                    value={reportFilters.status}
                    label={reportFilters.language === 'en' ? 'Status' : 'Status'}
                    onChange={handleReportFilterChange}
                  >
                    <MenuItem value="">{reportFilters.language === 'en' ? 'All' : 'Wszystkie'}</MenuItem>
                    {Object.entries(CMR_STATUSES).map(([key, status]) => (
                      <MenuItem key={status} value={status}>
                        {translateStatus(status)}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={6}>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={reportFilters.includeItems}
                      onChange={handleReportCheckboxChange}
                      name="includeItems"
                      color="primary"
                    />
                  }
                  label={reportFilters.language === 'en' ? 'Include CMR items in report' : 'Uwzględnij pozycje CMR w raporcie'}
                />
              </Grid>
            </Grid>
          ) : (
            <Box>
              <Typography variant="h6" gutterBottom>
                {reportFilters.language === 'en' ? 'CMR Report' : 'Raport CMR'} {format(new Date(), 'dd.MM.yyyy')}
              </Typography>
              
              <Typography variant="subtitle1" gutterBottom sx={{ mt: 2 }}>
                {t.summary}
              </Typography>
              
              <TableContainer component={Paper} sx={{ mb: 3 }}>
                <Table size="small">
                  <TableBody>
                    <TableRow>
                      <TableCell component="th">{t.totalDocuments}</TableCell>
                      <TableCell align="right">{reportData.statistics.totalDocuments}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell component="th">{t.reportPeriod}</TableCell>
                      <TableCell align="right">
                        {reportFilters.startDate} - {reportFilters.endDate}
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell component="th">{t.includeItems}</TableCell>
                      <TableCell align="right">{reportFilters.includeItems ? t.yes : t.no}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </TableContainer>
              
              <Typography variant="subtitle1" gutterBottom>
                {t.statusStatistics}
              </Typography>
              
              <TableContainer component={Paper} sx={{ mb: 3 }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>{t.status}</TableCell>
                      <TableCell align="right">{t.documentCount}</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {Object.entries(reportData.statistics.byStatus).map(([status, count]) => (
                      <TableRow key={status}>
                        <TableCell>{translateStatus(status)}</TableCell>
                        <TableCell align="right">{count}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
              
              <Typography variant="subtitle1" gutterBottom>
                {t.documentsInReport}
              </Typography>
              
              {reportData.documents.map((doc) => (
                <Box key={doc.id} sx={{ mb: 4 }}>
                  <TableContainer component={Paper} sx={{ mb: 1 }}>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>{t.cmrNumber}</TableCell>
                          <TableCell>{t.issueDate}</TableCell>
                          <TableCell>{t.sender}</TableCell>
                          <TableCell>{t.recipient}</TableCell>
                          <TableCell>{t.status}</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        <TableRow>
                          <TableCell>{doc.cmrNumber}</TableCell>
                          <TableCell>
                            {doc.issueDate 
                              ? format(doc.issueDate, 'dd.MM.yyyy', { locale: reportFilters.language === 'en' ? enUS : pl }) 
                              : '-'
                            }
                          </TableCell>
                          <TableCell>{doc.sender}</TableCell>
                          <TableCell>{doc.recipient}</TableCell>
                          <TableCell>{translateStatus(doc.status)}</TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </TableContainer>
                  
                  {reportFilters.includeItems && doc.items && doc.items.length > 0 && (
                    <TableContainer component={Paper} sx={{ ml: 4, mb: 2 }}>
                      <Table size="small">
                        <TableHead>
                          <TableRow>
                            <TableCell>{t.itemId}</TableCell>
                            <TableCell>{t.itemDescription}</TableCell>
                            <TableCell>{t.itemQuantity}</TableCell>
                            <TableCell>{t.itemUnit}</TableCell>
                            <TableCell>{t.itemWeight}</TableCell>
                            <TableCell>{t.itemVolume}</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {doc.items.map((item, index) => (
                            <TableRow key={item.id || index}>
                              <TableCell>{index + 1}</TableCell>
                              <TableCell>{item.description}</TableCell>
                              <TableCell>{item.numberOfPackages}</TableCell>
                              <TableCell>{item.packagingMethod}</TableCell>
                              <TableCell>{item.weight}</TableCell>
                              <TableCell>{item.volume}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  )}
                </Box>
              ))}
              
              <Box sx={{ mt: 3, display: 'flex', justifyContent: 'center' }}>
                <Button
                  variant="contained"
                  color="primary"
                  startIcon={<GetAppIcon />}
                  onClick={exportReportToCsv}
                >
                  {t.exportToCsv}
                </Button>
              </Box>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseReportDialog}>
            {reportData 
              ? (reportFilters.language === 'en' ? 'Close' : 'Zamknij') 
              : (reportFilters.language === 'en' ? 'Cancel' : 'Anuluj')
            }
          </Button>
          {!reportData && (
            <Button 
              onClick={handleGenerateReport} 
              color="primary" 
              variant="contained"
              disabled={generatingReport}
            >
              {generatingReport 
                ? <CircularProgress size={24} /> 
                : (reportFilters.language === 'en' ? 'Generate Report' : 'Generuj raport')
              }
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default CmrListPage; 