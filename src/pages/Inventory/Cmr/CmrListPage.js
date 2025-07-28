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
  Switch,
  Tooltip
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import pl from 'date-fns/locale/pl';
import enUS from 'date-fns/locale/en-US';
import { useAuth } from '../../../hooks/useAuth';
import { useNotification } from '../../../hooks/useNotification';
import { 
  getAllCmrDocuments, 
  CMR_STATUSES,
  CMR_PAYMENT_STATUSES,
  deleteCmrDocument,
  generateCmrReport,
  translatePaymentStatus,
  updateCmrPaymentStatus
} from '../../../services/cmrService';
import { getAllCustomers } from '../../../services/customerService';
import { useTranslation } from 'react-i18next';

// Ikony
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import VisibilityIcon from '@mui/icons-material/Visibility';
import AssessmentIcon from '@mui/icons-material/Assessment';
import GetAppIcon from '@mui/icons-material/GetApp';
import TranslateIcon from '@mui/icons-material/Translate';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';

// Słownik tłumaczeń dla raportów
const translations = {
  pl: {
    reportTitle: 'Raport CMR',
    cmrNumber: 'Numer CMR',
    issueDate: 'Data wystawienia',
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
  [CMR_STATUSES.DELIVERED]: { pl: 'Dostarczone', en: 'Delivered' },
  [CMR_STATUSES.COMPLETED]: { pl: 'Zakończony', en: 'Completed' },
  [CMR_STATUSES.CANCELED]: { pl: 'Anulowany', en: 'Canceled' }
};

const CmrListPage = () => {
  const { t: translate } = useTranslation();
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { showSuccess, showError } = useNotification();
  
  const [loading, setLoading] = useState(true);
  const [cmrDocuments, setCmrDocuments] = useState([]);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [documentToDelete, setDocumentToDelete] = useState(null);
  const [paymentStatusDialogOpen, setPaymentStatusDialogOpen] = useState(false);
  const [cmrToUpdatePaymentStatus, setCmrToUpdatePaymentStatus] = useState(null);
  const [newPaymentStatus, setNewPaymentStatus] = useState('');
  
  // Stan sortowania
  const [sortOrder, setSortOrder] = useState('desc'); // 'asc' lub 'desc' - domyślnie od najnowszej
  
  // Nowe stany dla generowania raportów
  const [reportDialogOpen, setReportDialogOpen] = useState(false);
  const [reportFilters, setReportFilters] = useState({
    startDate: format(new Date(new Date().setMonth(new Date().getMonth() - 1)), 'yyyy-MM-dd'),
    endDate: format(new Date(), 'yyyy-MM-dd'),
    recipient: '',
    status: '',
    includeItems: true,
    language: 'pl', // Domyślny język - polski
    sort: 'asc' // Domyślna kolejność sortowania
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

  // Funkcja sortująca dokumenty CMR według daty wystawienia
  const sortCmrDocuments = (documents, order) => {
    return [...documents].sort((a, b) => {
      const dateA = a.issueDate ? new Date(a.issueDate) : new Date(0);
      const dateB = b.issueDate ? new Date(b.issueDate) : new Date(0);
      
      if (order === 'asc') {
        return dateA - dateB; // od najstarszej do najnowszej
      } else {
        return dateB - dateA; // od najnowszej do najstarszej
      }
    });
  };

  // Funkcja do przełączania kolejności sortowania
  const handleToggleSort = () => {
    setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
  };

  // Posortowane dokumenty na podstawie aktualnej kolejności sortowania
  const sortedCmrDocuments = sortCmrDocuments(cmrDocuments, sortOrder);
  
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
      let dateObj = date;
      
      // Obsługa timestampu Firestore
      if (date && typeof date === 'object' && typeof date.toDate === 'function') {
        dateObj = date.toDate();
      }
      // Obsługa stringów
      else if (typeof date === 'string') {
        dateObj = new Date(date);
      }
      // Obsługa obiektów z sekundami (Firestore Timestamp format)
      else if (date && typeof date === 'object' && date.seconds) {
        dateObj = new Date(date.seconds * 1000);
      }
      
      // Sprawdź czy data jest poprawna
      if (isNaN(dateObj.getTime())) {
        return String(date);
      }
      
      return format(dateObj, 'dd.MM.yyyy', { locale: pl });
    } catch (e) {
      console.warn('Błąd formatowania daty:', e, date);
      return String(date);
    }
  };
  
  const renderStatusChip = (status) => {
    let color;
    switch (status) {
      case CMR_STATUSES.DRAFT:
        color = '#757575'; // szary
        break;
      case CMR_STATUSES.ISSUED:
        color = '#2196f3'; // niebieski
        break;
      case CMR_STATUSES.IN_TRANSIT:
        color = '#ff9800'; // pomarańczowy
        break;
      case CMR_STATUSES.DELIVERED:
        color = '#4caf50'; // zielony
        break;
      case CMR_STATUSES.COMPLETED:
        color = '#9c27b0'; // fioletowy
        break;
      case CMR_STATUSES.CANCELED:
        color = '#f44336'; // czerwony
        break;
      default:
        color = '#757575'; // szary
    }
    
    return (
      <Chip 
        label={status} 
        size="small"
        sx={{
          backgroundColor: color,
          color: 'white',
          fontWeight: 'medium'
        }}
      />
    );
  };

  const getPaymentStatusChip = (paymentStatus, cmr) => {
    const status = paymentStatus || CMR_PAYMENT_STATUSES.UNPAID;
    const label = translatePaymentStatus(status);
    let color = '#f44336'; // czerwony domyślny dla nie opłacone
    
    switch (status) {
      case CMR_PAYMENT_STATUSES.PAID:
        color = '#4caf50'; // zielony - opłacone
        break;
      case CMR_PAYMENT_STATUSES.UNPAID:
      default:
        color = '#f44336'; // czerwony - nie opłacone
        break;
    }
    
    return (
      <Chip 
        label={label} 
        size="small" 
        variant="filled"
        clickable
        onClick={() => handlePaymentStatusClick(cmr)}
        sx={{ 
          fontWeight: 'medium',
          backgroundColor: color,
          color: 'white',
          cursor: 'pointer',
          '&:hover': {
            opacity: 0.8
          }
        }}
      />
    );
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
      recipient: newValue && newValue.id !== '' ? newValue.name : '' 
    }));
  };
  
  // Funkcja do tłumaczenia statusu
  const translateStatus = (status) => {
    if (statusTranslations[status]) {
      return statusTranslations[status][reportFilters.language] || status;
    }
    return status;
  };

  const handlePaymentStatusClick = (cmr) => {
    setCmrToUpdatePaymentStatus(cmr);
    setNewPaymentStatus(cmr.paymentStatus || CMR_PAYMENT_STATUSES.UNPAID);
    setPaymentStatusDialogOpen(true);
  };

  const handlePaymentStatusUpdate = async () => {
    try {
      await updateCmrPaymentStatus(cmrToUpdatePaymentStatus.id, newPaymentStatus, currentUser.uid);
      
      // Po aktualizacji odświeżamy listę
      fetchCmrDocuments();
      
      showSuccess('Status płatności został zaktualizowany');
      setPaymentStatusDialogOpen(false);
      setCmrToUpdatePaymentStatus(null);
    } catch (error) {
      console.error('Błąd podczas aktualizacji statusu płatności:', error);
      showError('Nie udało się zaktualizować statusu płatności');
    }
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
            item.quantity || item.numberOfPackages, 
            item.unit || item.packagingMethod, 
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
      <Box sx={{ mb: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexDirection: { xs: 'column', sm: 'row' } }}>
        <Box>
          <Typography variant="h5">
            {translate('cmr.title')}
          </Typography>
          {cmrDocuments.length > 0 && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              Sortowanie: {sortOrder === 'asc' ? translate('cmr.sorting.oldestToNewest') : translate('cmr.sorting.newestToOldest')} {translate('cmr.sorting.byIssueDate')}
            </Typography>
          )}
        </Box>
        <Box sx={{ 
          display: 'flex', 
          gap: 1, 
          mt: { xs: 2, sm: 0 },
          width: { xs: '100%', sm: 'auto' } 
        }}>
          <Button
            variant="outlined"
            color="primary"
            startIcon={<AssessmentIcon />}
            onClick={handleOpenReportDialog}
            sx={{ mr: { sm: 1 }, flex: { xs: 1, sm: 'auto' } }}
            size="small"
          >
            {translate('cmr.generateReport')}
          </Button>
          <Button
            variant="contained"
            color="primary"
            startIcon={<AddIcon />}
            onClick={handleCreateCmr}
            sx={{ flex: { xs: 1, sm: 'auto' } }}
            size="small"
          >
            {translate('cmr.newDocument')}
          </Button>
        </Box>
      </Box>
      
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
          <CircularProgress />
        </Box>
      ) : cmrDocuments.length === 0 ? (
        <Alert severity="info">
          {translate('cmr.noDocuments')}
        </Alert>
      ) : (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>{translate('cmr.table.cmrNumber')}</TableCell>
                <TableCell>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    {translate('cmr.table.issueDate')}
                    <Tooltip title={`${translate('cmr.sorting.sortBy')} ${sortOrder === 'asc' ? 'od najnowszej' : 'od najstarszej'}`}>
                      <IconButton 
                        size="small" 
                        onClick={handleToggleSort}
                        sx={{ ml: 1 }}
                      >
                        {sortOrder === 'asc' ? <ArrowUpwardIcon fontSize="small" /> : <ArrowDownwardIcon fontSize="small" />}
                      </IconButton>
                    </Tooltip>
                  </Box>
                </TableCell>
                <TableCell>{translate('cmr.table.sender')}</TableCell>
                <TableCell>{translate('cmr.table.recipient')}</TableCell>
                <TableCell>{translate('cmr.table.status')}</TableCell>
                <TableCell>{translate('cmr.table.paymentStatus')}</TableCell>
                <TableCell>{translate('cmr.table.actions')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {sortedCmrDocuments.map((cmr) => (
                <TableRow key={cmr.id}>
                  <TableCell>{cmr.cmrNumber}</TableCell>
                  <TableCell>{formatDate(cmr.issueDate)}</TableCell>
                  <TableCell>{cmr.sender}</TableCell>
                  <TableCell>{cmr.recipient}</TableCell>
                  <TableCell>{renderStatusChip(cmr.status)}</TableCell>
                  <TableCell>{getPaymentStatusChip(cmr.paymentStatus, cmr)}</TableCell>
                  <TableCell>
                    <IconButton
                      size="small"
                      onClick={() => handleViewCmr(cmr.id)}
                      title={translate('cmr.actions.view')}
                    >
                      <VisibilityIcon fontSize="small" />
                    </IconButton>
                    
                    {cmr.status !== CMR_STATUSES.COMPLETED && cmr.status !== CMR_STATUSES.CANCELED && (
                      <IconButton
                        size="small"
                        onClick={() => handleEditCmr(cmr.id)}
                        title={translate('cmr.actions.edit')}
                      >
                        <EditIcon fontSize="small" />
                      </IconButton>
                    )}
                    
                    <IconButton
                      size="small"
                      onClick={() => handleDeleteClick(cmr)}
                      title={translate('cmr.actions.delete')}
                      color="error"
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
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
        <DialogTitle>{translate('cmr.dialogs.deleteConfirmation')}</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {translate('cmr.dialogs.deleteMessage', { cmrNumber: documentToDelete?.cmrNumber })}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleDeleteCancel} color="primary">
            {translate('cmr.dialogs.cancel')}
          </Button>
          <Button onClick={handleDeleteConfirm} color="error" variant="contained">
            {translate('cmr.dialogs.delete')}
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
                <Autocomplete
                  options={[
                    { id: '', name: reportFilters.language === 'en' ? 'All recipients' : 'Wszyscy odbiorcy' },
                    ...customers
                  ]}
                  getOptionLabel={(option) => option.name || ''}
                  isOptionEqualToValue={(option, value) => option.id === value.id}
                  loading={loadingCustomers}
                  value={reportFilters.recipient ? customers.find(c => c.name === reportFilters.recipient) || null : { id: '', name: reportFilters.language === 'en' ? 'All recipients' : 'Wszyscy odbiorcy' }}
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
                  <InputLabel shrink={true}>{reportFilters.language === 'en' ? 'Status' : 'Status'}</InputLabel>
                  <Select
                    name="status"
                    value={reportFilters.status || ''}
                    label={reportFilters.language === 'en' ? 'Status' : 'Status'}
                    onChange={handleReportFilterChange}
                    displayEmpty
                    notched={true}
                  >
                    <MenuItem value="">{reportFilters.language === 'en' ? 'All statuses' : 'Wszystkie statusy'}</MenuItem>
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
                              <TableCell>{item.quantity || item.numberOfPackages}</TableCell>
                              <TableCell>{item.unit || item.packagingMethod}</TableCell>
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

      {/* Dialog zmiany statusu płatności */}
      <Dialog
        open={paymentStatusDialogOpen}
        onClose={() => setPaymentStatusDialogOpen(false)}
      >
        <DialogTitle>{translate('cmr.dialogs.changePaymentStatus')}</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            {translate('cmr.dialogs.selectNewPaymentStatus')}
            {cmrToUpdatePaymentStatus && (
              <>
                <br />
                Numer: {cmrToUpdatePaymentStatus.cmrNumber}
              </>
            )}
          </DialogContentText>
          <FormControl fullWidth>
            <InputLabel id="new-payment-status-label">{translate('cmr.table.paymentStatus')}</InputLabel>
            <Select
              labelId="new-payment-status-label"
              value={newPaymentStatus}
              onChange={(e) => setNewPaymentStatus(e.target.value)}
              label={translate('cmr.table.paymentStatus')}
            >
              <MenuItem value={CMR_PAYMENT_STATUSES.UNPAID}>
                {translatePaymentStatus(CMR_PAYMENT_STATUSES.UNPAID)}
              </MenuItem>
              <MenuItem value={CMR_PAYMENT_STATUSES.PAID}>
                {translatePaymentStatus(CMR_PAYMENT_STATUSES.PAID)}
              </MenuItem>
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPaymentStatusDialogOpen(false)}>{translate('cmr.dialogs.cancel')}</Button>
          <Button color="primary" onClick={handlePaymentStatusUpdate}>{translate('cmr.dialogs.update')}</Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default CmrListPage; 