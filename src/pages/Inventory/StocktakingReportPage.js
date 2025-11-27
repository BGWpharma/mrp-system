import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  Container,
  Typography,
  Box,
  Paper,
  Button,
  Grid,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  CircularProgress,
  Alert,
  Divider,
  Card,
  CardContent,
  TableSortLabel,
  FormControl,
  InputLabel,
  Select,
  MenuItem
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  GetApp as DownloadIcon,
  Description as ReportIcon,
  CheckCircle as CheckCircleIcon,
  Cancel as CancelIcon
} from '@mui/icons-material';
import {
  getStocktakingById,
  getStocktakingItems,
  generateStocktakingReport
} from '../../services/inventory';
import { getAllWarehouses } from '../../services/inventory/warehouseService';
import { useTranslation } from '../../hooks/useTranslation';
import { formatDate, formatCurrency } from '../../utils/formatters';

const StocktakingReportPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  
  const [stocktaking, setStocktaking] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [warehouseNames, setWarehouseNames] = useState({});
  const [report, setReport] = useState({
    totalItems: 0,
    matchingItems: 0,
    surplusItems: 0,
    deficitItems: 0,
    totalDiscrepancy: 0,
    totalSystemValue: 0,
    totalCountedValue: 0,
    totalDifferenceValue: 0
  });
  
  const [orderBy, setOrderBy] = useState('discrepancy');
  const [order, setOrder] = useState('desc');
  const [acceptanceFilter, setAcceptanceFilter] = useState('all'); // 'all', 'accepted', 'pending'
  
  useEffect(() => {
    fetchData();
  }, [id]);
  
  const fetchData = async () => {
    try {
      setLoading(true);
      const stocktakingData = await getStocktakingById(id);
      setStocktaking(stocktakingData);
      
      const stocktakingItems = await getStocktakingItems(id);
      
      // Pobierz wszystkie magazyny i utwórz mapę ID -> Nazwa
      const warehouses = await getAllWarehouses();
      const warehouseMap = {};
      warehouses.forEach(warehouse => {
        warehouseMap[warehouse.id] = warehouse.name;
      });
      setWarehouseNames(warehouseMap);
      
      setItems(stocktakingItems);
      
      // Generate report summary
      calculateReportSummary(stocktakingItems);
    } catch (error) {
      console.error('Błąd podczas pobierania danych inwentaryzacji:', error);
      setError('Nie udało się pobrać danych inwentaryzacji');
    } finally {
      setLoading(false);
    }
  };
  
  const calculateReportSummary = (items) => {
    if (!items || items.length === 0) return;
    
    let matchingItems = 0;
    let surplusItems = 0;
    let deficitItems = 0;
    let totalSystemValue = 0;
    let totalCountedValue = 0;
    let totalDifferenceValue = 0;
    
    items.forEach(item => {
      const itemValue = item.unitPrice || 0;
      const systemValue = item.systemQuantity * itemValue;
      const countedValue = item.countedQuantity * itemValue;
      const differenceValue = countedValue - systemValue;
      
      totalSystemValue += systemValue;
      totalCountedValue += countedValue;
      
      if (item.discrepancy === 0) {
        matchingItems++;
      } else if (item.discrepancy > 0) {
        surplusItems++;
        totalDifferenceValue += differenceValue;
      } else {
        deficitItems++;
        totalDifferenceValue += differenceValue;
      }
    });
    
    setReport({
      totalItems: items.length,
      matchingItems,
      surplusItems,
      deficitItems,
      totalDiscrepancy: surplusItems + deficitItems,
      totalSystemValue,
      totalCountedValue,
      totalDifferenceValue
    });
  };
  
  const handleRequestSort = (property) => {
    const isAsc = orderBy === property && order === 'asc';
    setOrder(isAsc ? 'desc' : 'asc');
    setOrderBy(property);
  };
  
  // Filtrowane elementy według statusu akceptacji
  const filteredItems = React.useMemo(() => {
    if (!items || items.length === 0) return [];
    
    if (acceptanceFilter === 'all') return items;
    if (acceptanceFilter === 'accepted') return items.filter(item => item.accepted);
    if (acceptanceFilter === 'pending') return items.filter(item => !item.accepted);
    
    return items;
  }, [items, acceptanceFilter]);

  const sortedItems = React.useMemo(() => {
    if (!filteredItems || filteredItems.length === 0) return [];
    
    return [...filteredItems].sort((a, b) => {
      let aValue, bValue;
      
      switch (orderBy) {
        case 'name':
          aValue = a.name || '';
          bValue = b.name || '';
          break;
        case 'category':
          aValue = a.category || '';
          bValue = b.category || '';
          break;
        case 'systemQuantity':
          aValue = a.systemQuantity || 0;
          bValue = b.systemQuantity || 0;
          break;
        case 'countedQuantity':
          aValue = a.countedQuantity || 0;
          bValue = b.countedQuantity || 0;
          break;
        case 'discrepancy':
          aValue = a.discrepancy || 0;
          bValue = b.discrepancy || 0;
          break;
        case 'value':
          aValue = (a.discrepancy || 0) * (a.unitPrice || 0);
          bValue = (b.discrepancy || 0) * (b.unitPrice || 0);
          break;
        default:
          aValue = a.discrepancy || 0;
          bValue = b.discrepancy || 0;
      }
      
      if (typeof aValue === 'string' && typeof bValue === 'string') {
        return order === 'asc'
          ? aValue.localeCompare(bValue)
          : bValue.localeCompare(aValue);
      }
      
      return order === 'asc' ? aValue - bValue : bValue - aValue;
    });
  }, [filteredItems, order, orderBy]);
  
  const getDiscrepancyColor = (discrepancy) => {
    if (discrepancy === 0) return 'success';
    if (discrepancy > 0) return 'primary';
    return 'error';
  };
  
  const renderSortableTableCell = (label, property) => (
    <TableCell
      sortDirection={orderBy === property ? order : false}
      align={property === 'name' || property === 'category' ? 'left' : 'right'}
    >
      <TableSortLabel
        active={orderBy === property}
        direction={orderBy === property ? order : 'asc'}
        onClick={() => handleRequestSort(property)}
      >
        {label}
      </TableSortLabel>
    </TableCell>
  );
  
  const handleExportCSV = async () => {
    try {
      const reportData = await generateStocktakingReport(id, { format: 'csv' });
      
      // Dla CSV reportData.content to string, nie blob
      const csvContent = reportData.content;
      const fileName = reportData.filename || `inwentaryzacja_${id}_raport.csv`;
      
      // Utwórz blob dla CSV
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Błąd podczas generowania CSV:', error);
      setError('Nie udało się wygenerować raportu CSV');
    }
  };
  
  if (loading) {
    return (
      <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
          <CircularProgress />
        </Box>
      </Container>
    );
  }
  
  if (error) {
    return (
      <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
        <Alert severity="error">{error}</Alert>
        <Box sx={{ mt: 2 }}>
          <Button
            variant="outlined"
            startIcon={<ArrowBackIcon />}
            component={Link}
            to="/inventory/stocktaking"
          >
            Powrót do listy inwentaryzacji
          </Button>
        </Box>
      </Container>
    );
  }
  
  if (!stocktaking) {
    return (
      <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
        <Alert severity="error">Nie znaleziono inwentaryzacji</Alert>
        <Box sx={{ mt: 2 }}>
          <Button
            variant="outlined"
            startIcon={<ArrowBackIcon />}
            component={Link}
            to="/inventory/stocktaking"
          >
            Powrót do listy inwentaryzacji
          </Button>
        </Box>
      </Container>
    );
  }
  
  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }} className="print-container">
      {/* Nagłówek - ukrywany przy druku */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }} className="no-print">
        <Button
          variant="outlined"
          startIcon={<ArrowBackIcon />}
          component={Link}
          to={`/inventory/stocktaking/${id}`}
        >
          {t('stocktaking.back')}
        </Button>
        <Typography variant="h4" component="h1">
          {t('stocktaking.reportTitle')}
        </Typography>
        <Box>
          <Button
            variant="contained"
            color="primary"
            startIcon={<DownloadIcon />}
            onClick={handleExportCSV}
          >
            {t('stocktaking.exportCSV') || 'Eksportuj CSV'}
          </Button>
        </Box>
      </Box>
      
      {/* Nagłówek raportu - widoczny zawsze */}
      <Paper sx={{ p: 3, mb: 3 }} className="print-visible">
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h5">{t('stocktaking.reportFor', { name: stocktaking.name })}</Typography>
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <ReportIcon sx={{ mr: 1 }} />
            <Typography variant="body2">
              {t('stocktaking.generatedOn', { date: formatDate(new Date()) })}
            </Typography>
          </Box>
        </Box>
        
        <Divider sx={{ mb: 2 }} />
        
        <Grid container spacing={3}>
          <Grid item xs={12} md={6}>
            <Typography variant="subtitle1" gutterBottom>
              {t('stocktaking.stocktakingInfo')}
            </Typography>
            <Box sx={{ mb: 2 }}>
              <Typography variant="body1">
                <strong>{t('stocktaking.reportLabels.id')}:</strong> {stocktaking.id}
              </Typography>
              <Typography variant="body1">
                <strong>{t('stocktaking.reportLabels.name')}:</strong> {stocktaking.name}
              </Typography>
              <Typography variant="body1">
                <strong>{t('stocktaking.reportLabels.location')}:</strong> {
                  stocktaking.location 
                    ? (warehouseNames[stocktaking.location] || stocktaking.location)
                    : t('stocktaking.reportLabels.allLocations')
                }
              </Typography>
              <Typography variant="body1">
                <strong>{t('stocktaking.reportLabels.status')}:</strong> {stocktaking.status}
              </Typography>
              <Typography variant="body1">
                <strong>{t('stocktaking.reportLabels.scheduledDate')}:</strong> {stocktaking.scheduledDate ? formatDate(stocktaking.scheduledDate) : '-'}
              </Typography>
            </Box>
          </Grid>
          <Grid item xs={12} md={6}>
            <Typography variant="subtitle1" gutterBottom>
              {t('stocktaking.reportSections.stocktakingDates')}
            </Typography>
            <Box sx={{ mb: 2 }}>
              <Typography variant="body1">
                <strong>{t('stocktaking.reportLabels.createdAt')}:</strong> {stocktaking.createdAt ? formatDate(stocktaking.createdAt) : '-'}
              </Typography>
              <Typography variant="body1">
                <strong>{t('stocktaking.reportLabels.createdBy')}:</strong> {stocktaking.createdBy || '-'}
              </Typography>
              {stocktaking.completedAt && (
                <Typography variant="body1">
                  <strong>{t('stocktaking.reportLabels.completedAt')}:</strong> {formatDate(stocktaking.completedAt)}
                </Typography>
              )}
              {stocktaking.notes && (
                <Typography variant="body1">
                  <strong>{t('stocktaking.reportLabels.notes')}:</strong> {stocktaking.notes}
                </Typography>
              )}
            </Box>
          </Grid>
        </Grid>
      </Paper>
      
      {/* Karty podsumowania */}
      <Grid container spacing={3} sx={{ mb: 3 }} className="print-visible">
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>
                {t('stocktaking.reportSections.allProducts')}
              </Typography>
              <Typography variant="h4">
                {report.totalItems}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>
                {t('stocktaking.reportSections.matching')}
              </Typography>
              <Typography variant="h4" color="success.main">
                {report.matchingItems}
              </Typography>
              <Typography variant="body2">
                {t('stocktaking.reportSections.percentageProducts', { 
                  percent: report.totalItems > 0 ? Math.round((report.matchingItems / report.totalItems) * 100) : 0 
                })}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>
                {t('stocktaking.reportSections.surplus')}
              </Typography>
              <Typography variant="h4" color="primary.main">
                {report.surplusItems}
              </Typography>
              <Typography variant="body2">
                {t('stocktaking.reportSections.percentageProducts', { 
                  percent: report.totalItems > 0 ? Math.round((report.surplusItems / report.totalItems) * 100) : 0 
                })}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>
                {t('stocktaking.reportSections.deficit')}
              </Typography>
              <Typography variant="h4" color="error.main">
                {report.deficitItems}
              </Typography>
              <Typography variant="body2">
                {t('stocktaking.reportSections.percentageProducts', { 
                  percent: report.totalItems > 0 ? Math.round((report.deficitItems / report.totalItems) * 100) : 0 
                })}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
      
      {/* Podsumowanie wartości */}
      <Paper sx={{ p: 3, mb: 3 }} className="print-visible">
        <Typography variant="h6" gutterBottom>
          {t('stocktaking.reportSections.valueSummary')}
        </Typography>
        <Grid container spacing={3}>
          <Grid item xs={12} md={4}>
            <Typography variant="subtitle2" color="textSecondary">
              {t('stocktaking.reportSections.systemValue')}
            </Typography>
            <Typography variant="h5">
              {formatCurrency(report.totalSystemValue)}
            </Typography>
          </Grid>
          <Grid item xs={12} md={4}>
            <Typography variant="subtitle2" color="textSecondary">
              {t('stocktaking.reportSections.actualValue')}
            </Typography>
            <Typography variant="h5">
              {formatCurrency(report.totalCountedValue)}
            </Typography>
          </Grid>
          <Grid item xs={12} md={4}>
            <Typography variant="subtitle2" color="textSecondary">
              {t('stocktaking.reportSections.valueDifference')}
            </Typography>
            <Typography variant="h5" color={report.totalDifferenceValue >= 0 ? 'primary.main' : 'error.main'}>
              {formatCurrency(report.totalDifferenceValue)}
            </Typography>
          </Grid>
        </Grid>
      </Paper>
      
      {/* Filtr statusu akceptacji */}
      <Paper sx={{ p: 2, mb: 2, display: 'flex', alignItems: 'center', gap: 2 }} className="no-print">
        <Typography variant="subtitle1">
          Filtruj pozycje:
        </Typography>
        <FormControl size="small" sx={{ minWidth: 200 }}>
          <InputLabel>Status akceptacji</InputLabel>
          <Select
            value={acceptanceFilter}
            onChange={(e) => setAcceptanceFilter(e.target.value)}
            label="Status akceptacji"
          >
            <MenuItem value="all">Wszystkie ({items.length})</MenuItem>
            <MenuItem value="accepted">
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <CheckCircleIcon fontSize="small" color="success" />
                Zaakceptowane ({items.filter(i => i.accepted).length})
              </Box>
            </MenuItem>
            <MenuItem value="pending">
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <CancelIcon fontSize="small" color="default" />
                Oczekujące ({items.filter(i => !i.accepted).length})
              </Box>
            </MenuItem>
          </Select>
        </FormControl>
        {acceptanceFilter !== 'all' && (
          <Chip 
            label={`Wyświetlono: ${filteredItems.length} z ${items.length}`}
            color="info"
            size="small"
          />
        )}
      </Paper>

      {/* Tabela z produktami */}
      <Paper sx={{ mb: 3 }} className="print-visible">
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                {renderSortableTableCell(t('stocktaking.tableHeaders.productName'), 'name')}
                {renderSortableTableCell(t('stocktaking.tableHeaders.category'), 'category')}
                <TableCell>{t('stocktaking.tableHeaders.lotBatch')}</TableCell>
                <TableCell>{t('common.expiryDate')}</TableCell>
                <TableCell>{t('stocktaking.location')}</TableCell>
                {renderSortableTableCell(t('stocktaking.tableHeaders.systemQuantity'), 'systemQuantity')}
                {renderSortableTableCell(t('stocktaking.tableHeaders.countedQuantity'), 'countedQuantity')}
                {renderSortableTableCell(t('stocktaking.tableHeaders.difference'), 'discrepancy')}
                {renderSortableTableCell(t('stocktaking.tableHeaders.valueDifference'), 'value')}
                <TableCell align="center">Status</TableCell>
                <TableCell>{t('stocktaking.tableHeaders.notes')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {sortedItems.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={11} align="center">
                    {acceptanceFilter !== 'all' 
                      ? `Brak pozycji o statusie "${acceptanceFilter === 'accepted' ? 'Zaakceptowane' : 'Oczekujące'}"`
                      : t('stocktaking.reportSections.noProductsInStocktaking')
                    }
                  </TableCell>
                </TableRow>
              ) : (
                sortedItems.map((item) => (
                  <TableRow key={item.id} hover>
                    <TableCell>{item.name}</TableCell>
                    <TableCell>{item.category}</TableCell>
                    <TableCell>{item.batchNumber || item.lotNumber || '-'}</TableCell>
                    <TableCell>{item.expiryDate ? formatDate(item.expiryDate) : '-'}</TableCell>
                    <TableCell>{item.location ? (warehouseNames[item.location] || item.location) : '-'}</TableCell>
                    <TableCell align="right">{item.systemQuantity} {item.unit}</TableCell>
                    <TableCell align="right">{item.countedQuantity !== null && item.countedQuantity !== undefined ? `${item.countedQuantity} ${item.unit}` : '-'}</TableCell>
                    <TableCell align="right">
                      <Chip 
                        label={item.discrepancy} 
                        color={getDiscrepancyColor(item.discrepancy)}
                        size="small"
                      />
                    </TableCell>
                    <TableCell align="right">
                      {formatCurrency(item.discrepancy * (item.unitPrice || 0))}
                    </TableCell>
                    <TableCell align="center">
                      {item.accepted ? (
                        <Chip 
                          icon={<CheckCircleIcon />}
                          label="Zaakceptowana" 
                          color="success" 
                          size="small"
                        />
                      ) : (
                        <Chip 
                          label="Oczekuje" 
                          color="default" 
                          size="small"
                        />
                      )}
                    </TableCell>
                    <TableCell>{item.notes || '-'}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
      
      {/* Sekcja anulowanych rezerwacji */}
      {stocktaking.cancelledReservations && stocktaking.cancelledReservations.length > 0 && (
        <Paper sx={{ mb: 3, border: '2px solid', borderColor: 'error.main' }} className="print-visible">
          <Box sx={{ 
            bgcolor: 'error.main', 
            color: 'white', 
            p: 2, 
            display: 'flex', 
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <Typography variant="h6">
              ⚠️ {t('stocktaking.reportSections.cancelledReservations') || 'Anulowane rezerwacje z powodu inwentaryzacji'}
            </Typography>
            <Chip 
              label={`${stocktaking.cancelledReservations.length} ${t('stocktaking.reportSections.reservations') || 'rezerwacji'}`}
              sx={{ bgcolor: 'white', color: 'error.main', fontWeight: 'bold' }}
            />
          </Box>
          <Alert severity="warning" sx={{ borderRadius: 0 }}>
            {t('stocktaking.reportSections.cancelledReservationsInfo') || 'Poniższe rezerwacje zostały automatycznie anulowane, ponieważ inwentaryzacja wykazała niewystarczającą ilość na partiach.'}
          </Alert>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: 'error.light' }}>
                  <TableCell sx={{ fontWeight: 'bold', color: 'error.contrastText' }}>
                    {t('stocktaking.tableHeaders.batchNumber') || 'Nr partii'}
                  </TableCell>
                  <TableCell sx={{ fontWeight: 'bold', color: 'error.contrastText' }}>
                    {t('stocktaking.tableHeaders.taskNumber') || 'Nr zadania'}
                  </TableCell>
                  <TableCell sx={{ fontWeight: 'bold', color: 'error.contrastText' }}>
                    {t('stocktaking.tableHeaders.materialName') || 'Materiał'}
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 'bold', color: 'error.contrastText' }}>
                    {t('stocktaking.tableHeaders.quantity') || 'Ilość'}
                  </TableCell>
                  <TableCell sx={{ fontWeight: 'bold', color: 'error.contrastText' }}>
                    {t('stocktaking.tableHeaders.unit') || 'Jedn.'}
                  </TableCell>
                  <TableCell sx={{ fontWeight: 'bold', color: 'error.contrastText' }}>
                    {t('stocktaking.tableHeaders.client') || 'Klient'}
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {stocktaking.cancelledReservations.map((reservation, index) => (
                  <TableRow 
                    key={index} 
                    hover
                    sx={{ '&:nth-of-type(odd)': { bgcolor: 'error.lighter' || '#ffebee' } }}
                  >
                    <TableCell>{reservation.batchNumber || '-'}</TableCell>
                    <TableCell>
                      <Chip 
                        label={reservation.taskNumber || 'Nieznane'} 
                        size="small" 
                        color="warning"
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell>{reservation.materialName || '-'}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 'bold' }}>
                      {reservation.quantity || 0}
                    </TableCell>
                    <TableCell>{reservation.unit || 'szt.'}</TableCell>
                    <TableCell>{reservation.clientName !== 'N/A' ? reservation.clientName : '-'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}
      
      <Box sx={{ mt: 4, textAlign: 'center' }} className="print-visible print-footer">
        <Typography variant="body2" color="textSecondary">
          {t('stocktaking.reportSections.reportGenerated')} • {formatDate(new Date())}
        </Typography>
      </Box>
      
      {/* Style dla drukowania */}
      <style jsx global>{`
        @media print {
          .no-print {
            display: none !important;
          }
          
          .print-container {
            margin: 0 !important;
            padding: 0 !important;
            max-width: 100% !important;
          }
          
          .print-visible {
            break-inside: avoid;
            page-break-inside: avoid;
            margin-bottom: 20px !important;
          }
          
          .print-footer {
            position: fixed;
            bottom: 20px;
            width: 100%;
            text-align: center;
          }
        }
      `}</style>
    </Container>
  );
};

export default StocktakingReportPage; 