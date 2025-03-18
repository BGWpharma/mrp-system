import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Container,
  Typography,
  Paper,
  Box,
  Grid,
  Card,
  CardContent,
  Divider,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Button,
  CircularProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  Tab,
  Alert,
  Chip
} from '@mui/material';
import {
  Assessment as ReportIcon,
  WarningAmber as WarningIcon,
  CheckCircle as CheckIcon,
  Timeline as TimelineIcon,
  PieChart as PieChartIcon,
  BarChart as BarChartIcon,
  Refresh as RefreshIcon,
  Download as DownloadIcon,
  Assessment as AssessmentOutlinedIcon,
  CheckCircle as CheckCircleIcon
} from '@mui/icons-material';
import { getQualityStats, getAllResults, getAllTests } from '../../services/qualityService';
import { useNotification } from '../../hooks/useNotification';
import { formatDate } from '../../utils/formatters';

// Komponenty wykresów (zastępcze)
const SimplePieChart = ({ data, colors = ['#4caf50', '#f44336'] }) => {
  return (
    <Box sx={{ 
      height: '200px', 
      display: 'flex', 
      flexDirection: 'column', 
      justifyContent: 'center', 
      alignItems: 'center', 
      border: '1px dashed #ccc',
      borderRadius: '4px'
    }}>
      <PieChartIcon sx={{ fontSize: '4rem', color: 'primary.main' }} />
      <Typography variant="body2" color="textSecondary">
        Wykres kołowy (podgląd)
      </Typography>
    </Box>
  );
};

const SimpleBarChart = ({ data }) => {
  return (
    <Box sx={{ 
      height: '200px', 
      display: 'flex', 
      flexDirection: 'column', 
      justifyContent: 'center', 
      alignItems: 'center', 
      border: '1px dashed #ccc',
      borderRadius: '4px'
    }}>
      <BarChartIcon sx={{ fontSize: '4rem', color: 'secondary.main' }} />
      <Typography variant="body2" color="textSecondary">
        Wykres słupkowy (podgląd)
      </Typography>
    </Box>
  );
};

const SimpleTimelineChart = ({ data }) => {
  return (
    <Box sx={{ 
      height: '200px', 
      display: 'flex', 
      flexDirection: 'column', 
      justifyContent: 'center', 
      alignItems: 'center', 
      border: '1px dashed #ccc',
      borderRadius: '4px'
    }}>
      <TimelineIcon sx={{ fontSize: '4rem', color: 'info.main' }} />
      <Typography variant="body2" color="textSecondary">
        Wykres liniowy (podgląd)
      </Typography>
    </Box>
  );
};

const QualityReportsPage = () => {
  const { showSuccess, showError } = useNotification();
  const navigate = useNavigate();
  
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);
  const [results, setResults] = useState([]);
  const [tests, setTests] = useState([]);
  const [selectedTab, setSelectedTab] = useState(0);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [categories, setCategories] = useState([]);
  
  // Pobieranie danych
  useEffect(() => {
    fetchData();
  }, []);
  
  const fetchData = async () => {
    try {
      setLoading(true);
      
      // Pobieranie danych równolegle
      const [statsData, resultsData, testsData] = await Promise.all([
        getQualityStats(),
        getAllResults(),
        getAllTests()
      ]);
      
      setStats(statsData);
      setResults(resultsData);
      setTests(testsData);
      
      // Wyodrębnij unikalne kategorie
      const uniqueCategories = [...new Set(testsData.map(test => test.category))].filter(Boolean);
      setCategories(uniqueCategories);
      
      setLoading(false);
    } catch (error) {
      console.error('Błąd podczas pobierania danych raportów jakościowych:', error);
      showError('Nie udało się pobrać danych raportów');
      setLoading(false);
    }
  };
  
  const handleTabChange = (event, newValue) => {
    setSelectedTab(newValue);
  };
  
  const handleCategoryChange = (event) => {
    setCategoryFilter(event.target.value);
  };
  
  const handleRefresh = () => {
    fetchData();
  };
  
  const handleGenerateReport = () => {
    // Funkcja do generowania raportu PDF lub CSV
    showSuccess('Funkcja generowania raportu zostanie zaimplementowana w przyszłości');
  };
  
  const filteredResults = categoryFilter === 'all' 
    ? results 
    : results.filter(result => {
        const test = tests.find(t => t.id === result.testId);
        return test && test.category === categoryFilter;
      });
  
  // Komponent podsumowania
  const SummaryTab = () => {
    if (!stats) return null;
    
    const passRate = stats.total > 0 ? ((stats.passed / stats.total) * 100).toFixed(1) : 0;
    const failRate = stats.total > 0 ? ((stats.failed / stats.total) * 100).toFixed(1) : 0;
    
    return (
      <Box>
        <Grid container spacing={3}>
          <Grid item xs={12} md={4}>
            <Card>
              <CardContent sx={{ textAlign: 'center' }}>
                <Typography color="textSecondary" gutterBottom>
                  Łączna liczba testów
                </Typography>
                <Typography variant="h3" component="div">
                  {stats.total}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          
          <Grid item xs={12} md={4}>
            <Card>
              <CardContent sx={{ textAlign: 'center' }}>
                <Typography color="textSecondary" gutterBottom>
                  Testy pozytywne
                </Typography>
                <Typography variant="h3" component="div" color="success.main">
                  {stats.passed} ({passRate}%)
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          
          <Grid item xs={12} md={4}>
            <Card>
              <CardContent sx={{ textAlign: 'center' }}>
                <Typography color="textSecondary" gutterBottom>
                  Testy negatywne
                </Typography>
                <Typography variant="h3" component="div" color="error.main">
                  {stats.failed} ({failRate}%)
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
        
        <Grid container spacing={3} sx={{ mt: 1 }}>
          <Grid item xs={12} md={6}>
            <Card sx={{ mt: 3 }}>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Rozkład wyników testów
                </Typography>
                <SimplePieChart 
                  data={[
                    { name: 'Pozytywne', value: stats.passed },
                    { name: 'Negatywne', value: stats.failed }
                  ]} 
                />
              </CardContent>
            </Card>
          </Grid>
          
          <Grid item xs={12} md={6}>
            <Card sx={{ mt: 3 }}>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Wyniki testów w czasie
                </Typography>
                <SimpleTimelineChart 
                  data={Object.entries(stats.byMonth || {}).map(([month, data]) => ({
                    month,
                    passed: data.passed,
                    failed: data.failed
                  }))} 
                />
              </CardContent>
            </Card>
          </Grid>
        </Grid>
        
        <Typography variant="h6" sx={{ mt: 4, mb: 2 }}>
          Wyniki według kategorii
        </Typography>
        
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Kategoria</TableCell>
                <TableCell align="right">Łącznie testów</TableCell>
                <TableCell align="right">Pozytywne</TableCell>
                <TableCell align="right">Negatywne</TableCell>
                <TableCell align="right">Wskaźnik sukcesu</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {Object.entries(stats.byCategory || {}).map(([category, data]) => {
                const successRate = data.total > 0 
                  ? ((data.passed / data.total) * 100).toFixed(1)
                  : 0;
                  
                return (
                  <TableRow key={category}>
                    <TableCell component="th" scope="row">{category}</TableCell>
                    <TableCell align="right">{data.total}</TableCell>
                    <TableCell align="right">{data.passed}</TableCell>
                    <TableCell align="right">{data.failed}</TableCell>
                    <TableCell align="right">
                      <Typography 
                        color={successRate > 90 ? 'success.main' : successRate > 70 ? 'warning.main' : 'error.main'}
                      >
                        {successRate}%
                      </Typography>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
        
        {stats.recentFailures && stats.recentFailures.length > 0 && (
          <>
            <Typography variant="h6" sx={{ mt: 4, mb: 2 }}>
              Ostatnie niepowodzenia testów
            </Typography>
            
            <TableContainer component={Paper}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Test</TableCell>
                    <TableCell>Produkt</TableCell>
                    <TableCell>Numer partii</TableCell>
                    <TableCell>Data</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {stats.recentFailures.map((failure) => (
                    <TableRow key={failure.id}>
                      <TableCell>{failure.testName}</TableCell>
                      <TableCell>{failure.productName || '-'}</TableCell>
                      <TableCell>{failure.batchNumber || '-'}</TableCell>
                      <TableCell>{formatDate(failure.date)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </>
        )}
      </Box>
    );
  };
  
  // Komponent listy wyników testów
  const ResultsTab = () => {
    if (filteredResults.length === 0) {
      return (
        <Alert severity="info" sx={{ mt: 2 }}>
          Brak wyników testów do wyświetlenia.
        </Alert>
      );
    }
    
    return (
      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Test</TableCell>
              <TableCell>Data</TableCell>
              <TableCell>Produkt</TableCell>
              <TableCell>Nr partii</TableCell>
              <TableCell>Wykonawca</TableCell>
              <TableCell>Status</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredResults.map((result) => {
              const testDetails = tests.find(test => test.id === result.testId);
              
              return (
                <TableRow key={result.id}>
                  <TableCell>{result.testName || (testDetails ? testDetails.name : '-')}</TableCell>
                  <TableCell>{formatDate(result.date)}</TableCell>
                  <TableCell>{result.productName || '-'}</TableCell>
                  <TableCell>{result.batchNumber || '-'}</TableCell>
                  <TableCell>{result.testerName || '-'}</TableCell>
                  <TableCell>
                    <Chip 
                      label={result.status} 
                      color={result.status === 'Pozytywny' ? 'success' : 'error'} 
                      size="small" 
                      icon={result.status === 'Pozytywny' ? <CheckIcon /> : <WarningIcon />}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
    );
  };
  
  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h5" sx={{ display: 'flex', alignItems: 'center' }}>
          <ReportIcon sx={{ mr: 1 }} />
          Raporty jakościowe
        </Typography>
        
        <Box>
          <Button 
            variant="outlined" 
            startIcon={<RefreshIcon />} 
            onClick={handleRefresh}
            sx={{ mr: 1 }}
          >
            Odśwież
          </Button>
          <Button 
            variant="outlined" 
            startIcon={<DownloadIcon />} 
            onClick={handleGenerateReport}
          >
            Eksportuj raport
          </Button>
        </Box>
      </Box>
      
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}>
          <CircularProgress />
        </Box>
      ) : (
        <>
          <Paper sx={{ p: 3, mb: 3 }}>
            <Grid container spacing={2} alignItems="center">
              <Grid item xs={12} md={6}>
                <FormControl fullWidth>
                  <InputLabel>Kategoria</InputLabel>
                  <Select
                    value={categoryFilter}
                    onChange={handleCategoryChange}
                    label="Kategoria"
                  >
                    <MenuItem value="all">Wszystkie kategorie</MenuItem>
                    {categories.map(category => (
                      <MenuItem key={category} value={category}>{category}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
            </Grid>
          </Paper>
          
          <Box sx={{ mb: 2 }}>
            <Tabs value={selectedTab} onChange={handleTabChange} aria-label="test-results-tabs">
              <Tab label="Podsumowanie" icon={<AssessmentOutlinedIcon />} iconPosition="start" />
              <Tab label="Wyniki testów" icon={<CheckCircleIcon />} iconPosition="start" />
            </Tabs>
          </Box>
          
          <Box sx={{ py: 3 }}>
            {selectedTab === 0 && <SummaryTab />}
            {selectedTab === 1 && <ResultsTab />}
          </Box>
        </>
      )}
    </Container>
  );
};

export default QualityReportsPage; 