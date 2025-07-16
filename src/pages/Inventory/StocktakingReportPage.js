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
  TableSortLabel
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  Print as PrintIcon,
  GetApp as DownloadIcon,
  Description as ReportIcon
} from '@mui/icons-material';
import {
  getStocktakingById,
  getStocktakingItems,
  generateStocktakingReport
} from '../../services/inventoryService';
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
  
  useEffect(() => {
    fetchData();
  }, [id]);
  
  const fetchData = async () => {
    try {
      setLoading(true);
      const stocktakingData = await getStocktakingById(id);
      setStocktaking(stocktakingData);
      
      const stocktakingItems = await getStocktakingItems(id);
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
  
  const sortedItems = React.useMemo(() => {
    if (!items || items.length === 0) return [];
    
    return [...items].sort((a, b) => {
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
  }, [items, order, orderBy]);
  
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
  
  const handlePrint = () => {
    window.print();
  };
  
  const handleExportPDF = async () => {
    try {
      const reportBlob = await generateStocktakingReport(id);
      const url = URL.createObjectURL(reportBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `inwentaryzacja_${id}_raport.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Błąd podczas generowania PDF:', error);
      setError('Nie udało się wygenerować raportu PDF');
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
            variant="outlined"
            startIcon={<PrintIcon />}
            onClick={handlePrint}
            sx={{ mr: 1 }}
          >
            {t('stocktaking.print')}
          </Button>
          <Button
            variant="contained"
            color="primary"
            startIcon={<DownloadIcon />}
            onClick={handleExportPDF}
          >
            {t('stocktaking.exportPDF')}
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
                <strong>ID:</strong> {stocktaking.id}
              </Typography>
              <Typography variant="body1">
                <strong>Nazwa:</strong> {stocktaking.name}
              </Typography>
              <Typography variant="body1">
                <strong>Lokalizacja:</strong> {stocktaking.location || 'Wszystkie lokalizacje'}
              </Typography>
              <Typography variant="body1">
                <strong>Status:</strong> {stocktaking.status}
              </Typography>
              <Typography variant="body1">
                <strong>Data planowana:</strong> {stocktaking.scheduledDate ? formatDate(stocktaking.scheduledDate) : '-'}
              </Typography>
            </Box>
          </Grid>
          <Grid item xs={12} md={6}>
            <Typography variant="subtitle1" gutterBottom>
              Daty inwentaryzacji
            </Typography>
            <Box sx={{ mb: 2 }}>
              <Typography variant="body1">
                <strong>Data utworzenia:</strong> {stocktaking.createdAt ? formatDate(stocktaking.createdAt) : '-'}
              </Typography>
              <Typography variant="body1">
                <strong>Utworzona przez:</strong> {stocktaking.createdBy || '-'}
              </Typography>
              {stocktaking.completedAt && (
                <Typography variant="body1">
                  <strong>Data zakończenia:</strong> {formatDate(stocktaking.completedAt)}
                </Typography>
              )}
              {stocktaking.notes && (
                <Typography variant="body1">
                  <strong>Uwagi:</strong> {stocktaking.notes}
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
                Wszystkie produkty
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
                Zgodne
              </Typography>
              <Typography variant="h4" color="success.main">
                {report.matchingItems}
              </Typography>
              <Typography variant="body2">
                {report.totalItems > 0 ? Math.round((report.matchingItems / report.totalItems) * 100) : 0}% produktów
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>
                Nadwyżki
              </Typography>
              <Typography variant="h4" color="primary.main">
                {report.surplusItems}
              </Typography>
              <Typography variant="body2">
                {report.totalItems > 0 ? Math.round((report.surplusItems / report.totalItems) * 100) : 0}% produktów
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>
                Braki
              </Typography>
              <Typography variant="h4" color="error.main">
                {report.deficitItems}
              </Typography>
              <Typography variant="body2">
                {report.totalItems > 0 ? Math.round((report.deficitItems / report.totalItems) * 100) : 0}% produktów
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
      
      {/* Podsumowanie wartości */}
      <Paper sx={{ p: 3, mb: 3 }} className="print-visible">
        <Typography variant="h6" gutterBottom>
          Podsumowanie wartości
        </Typography>
        <Grid container spacing={3}>
          <Grid item xs={12} md={4}>
            <Typography variant="subtitle2" color="textSecondary">
              Wartość systemowa
            </Typography>
            <Typography variant="h5">
              {formatCurrency(report.totalSystemValue)}
            </Typography>
          </Grid>
          <Grid item xs={12} md={4}>
            <Typography variant="subtitle2" color="textSecondary">
              Wartość rzeczywista
            </Typography>
            <Typography variant="h5">
              {formatCurrency(report.totalCountedValue)}
            </Typography>
          </Grid>
          <Grid item xs={12} md={4}>
            <Typography variant="subtitle2" color="textSecondary">
              Różnica wartości
            </Typography>
            <Typography variant="h5" color={report.totalDifferenceValue >= 0 ? 'primary.main' : 'error.main'}>
              {formatCurrency(report.totalDifferenceValue)}
            </Typography>
          </Grid>
        </Grid>
      </Paper>
      
      {/* Tabela z produktami */}
      <Paper sx={{ mb: 3 }} className="print-visible">
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                {renderSortableTableCell('Nazwa produktu', 'name')}
                {renderSortableTableCell('Kategoria', 'category')}
                {renderSortableTableCell('Stan systemowy', 'systemQuantity')}
                {renderSortableTableCell('Stan policzony', 'countedQuantity')}
                {renderSortableTableCell('Różnica', 'discrepancy')}
                {renderSortableTableCell('Różnica wartości', 'value')}
                <TableCell>Uwagi</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {sortedItems.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} align="center">
                    Brak produktów w inwentaryzacji
                  </TableCell>
                </TableRow>
              ) : (
                sortedItems.map((item) => (
                  <TableRow key={item.id} hover>
                    <TableCell>{item.name}</TableCell>
                    <TableCell>{item.category}</TableCell>
                    <TableCell align="right">{item.systemQuantity} {item.unit}</TableCell>
                    <TableCell align="right">{item.countedQuantity} {item.unit}</TableCell>
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
                    <TableCell>{item.notes || '-'}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
      
      <Box sx={{ mt: 4, textAlign: 'center' }} className="print-visible print-footer">
        <Typography variant="body2" color="textSecondary">
          Raport wygenerowany z systemu MRP • {formatDate(new Date())}
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