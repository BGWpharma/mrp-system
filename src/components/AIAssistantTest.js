// src/components/AIAssistantTest.js

import React, { useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  TextField,
  Button,
  Grid,
  Chip,
  Alert,
  CircularProgress,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper
} from '@mui/material';
import {
  ExpandMore as ExpandMoreIcon,
  Speed as SpeedIcon,
  Psychology as PsychologyIcon,
  Compare as CompareIcon,
  BugReport as BugReportIcon
} from '@mui/icons-material';
import { AIAssistantManager } from '../services/ai/AIAssistantManager.js';
import { AIAssistantV2 } from '../services/ai/AIAssistantV2.js';

/**
 * Komponent do testowania nowego systemu AI Assistant V2
 */
const AIAssistantTest = () => {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [healthStatus, setHealthStatus] = useState(null);
  const [selectedExample, setSelectedExample] = useState('');

  // Przykładowe zapytania do testowania
  const exampleQueries = [
    'Ile jest receptur w systemie?',
    'Ile receptur ma sumę składników ponad 900g?',
    'Które produkty mają niski stan magazynowy?',
    'Ile zamówień jest w systemie?',
    'Jaki jest status zadań produkcyjnych?',
    'Ile jest dostawców w systemie?',
    'Pokaż przegląd systemu MRP'
  ];

  const handleTestQuery = async () => {
    if (!query.trim()) return;
    
    setLoading(true);
    setResults(null);

    try {
      // Test porównawczy obu systemów
      const comparison = await AIAssistantManager.compareVersions(query, {
        userId: 'test-user',
        forceV1Comparison: true // Wymusza porównanie z V1
      });

      setResults(comparison);
    } catch (error) {
      console.error('Błąd podczas testowania:', error);
      setResults({
        error: error.message,
        query
      });
    } finally {
      setLoading(false);
    }
  };

  const handleHealthCheck = async () => {
    try {
      const health = await AIAssistantManager.healthCheck();
      setHealthStatus(health);
    } catch (error) {
      setHealthStatus({
        overall: 'error',
        error: error.message
      });
    }
  };

  const handleExampleClick = (example) => {
    setQuery(example);
    setSelectedExample(example);
  };

  const getSpeedIndicator = (time) => {
    if (time < 1000) return { color: 'success', label: 'Bardzo szybko' };
    if (time < 3000) return { color: 'info', label: 'Szybko' };
    if (time < 10000) return { color: 'warning', label: 'Średnio' };
    return { color: 'error', label: 'Wolno' };
  };

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom>
        🧪 Test Asystenta AI v2.0
      </Typography>
      
      <Typography variant="body1" color="text.secondary" paragraph>
        Ten panel umożliwia testowanie nowego zoptymalizowanego systemu asystenta AI 
        i porównanie z obecnym systemem.
      </Typography>

      {/* Health Check */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
            <Typography variant="h6">Status Systemu</Typography>
            <Button 
              variant="outlined" 
              startIcon={<BugReportIcon />}
              onClick={handleHealthCheck}
            >
              Sprawdź Status
            </Button>
          </Box>
          
          {healthStatus && (
            <Alert 
              severity={healthStatus.overall === 'healthy' ? 'success' : 'warning'}
              sx={{ mt: 2 }}
            >
              <Typography variant="body2">
                <strong>Status:</strong> {healthStatus.overall}
              </Typography>
              {healthStatus.recommendations && (
                <ul>
                  {healthStatus.recommendations.map((rec, index) => (
                    <li key={index}>{rec}</li>
                  ))}
                </ul>
              )}
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Query Input */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Testowanie Zapytania
          </Typography>
          
          <TextField
            fullWidth
            label="Wpisz zapytanie do przetestowania"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            multiline
            rows={2}
            sx={{ mb: 2 }}
            placeholder="np. Ile receptur ma sumę składników ponad 900g?"
          />
          
          <Button
            variant="contained"
            startIcon={loading ? <CircularProgress size={20} /> : <CompareIcon />}
            onClick={handleTestQuery}
            disabled={loading || !query.trim()}
            sx={{ mb: 2 }}
          >
            {loading ? 'Testowanie...' : 'Testuj Zapytanie'}
          </Button>
        </CardContent>
      </Card>

      {/* Example Queries */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Przykładowe Zapytania
          </Typography>
          <Typography variant="body2" color="text.secondary" paragraph>
            Kliknij na przykład aby przetestować
          </Typography>
          
          <Grid container spacing={1}>
            {exampleQueries.map((example, index) => (
              <Grid item key={index}>
                <Chip
                  label={example}
                  onClick={() => handleExampleClick(example)}
                  color={selectedExample === example ? 'primary' : 'default'}
                  variant={selectedExample === example ? 'filled' : 'outlined'}
                  sx={{ cursor: 'pointer' }}
                />
              </Grid>
            ))}
          </Grid>
        </CardContent>
      </Card>

      {/* Results */}
      {results && (
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Wyniki Testowania
            </Typography>
            
            {results.error ? (
              <Alert severity="error">
                <Typography variant="body2">
                  <strong>Błąd:</strong> {results.error}
                </Typography>
              </Alert>
            ) : (
              <>
                {/* Porównanie wydajności */}
                {results.comparison && (
                  <Accordion defaultExpanded>
                    <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                      <SpeedIcon sx={{ mr: 1 }} />
                      <Typography variant="h6">Porównanie Wydajności</Typography>
                    </AccordionSummary>
                    <AccordionDetails>
                      <TableContainer component={Paper} variant="outlined">
                        <Table size="small">
                          <TableHead>
                            <TableRow>
                              <TableCell>Metryka</TableCell>
                              <TableCell>Wartość</TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {results.comparison.speedImprovement && (
                              <TableRow>
                                <TableCell>Poprawa szybkości</TableCell>
                                <TableCell>
                                  <Chip 
                                    label={results.comparison.speedImprovement} 
                                    color="success" 
                                    size="small" 
                                  />
                                </TableCell>
                              </TableRow>
                            )}
                            {results.comparison.costSavings && (
                              <TableRow>
                                <TableCell>Oszczędności kosztów</TableCell>
                                <TableCell>
                                  <Chip 
                                    label={results.comparison.costSavings} 
                                    color="info" 
                                    size="small" 
                                  />
                                </TableCell>
                              </TableRow>
                            )}
                            {results.comparison.recommendation && (
                              <TableRow>
                                <TableCell>Rekomendacja</TableCell>
                                <TableCell>{results.comparison.recommendation}</TableCell>
                              </TableRow>
                            )}
                          </TableBody>
                        </Table>
                      </TableContainer>
                    </AccordionDetails>
                  </Accordion>
                )}

                {/* Wyniki V2 */}
                {results.v2 && (
                  <Accordion>
                    <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                      <PsychologyIcon sx={{ mr: 1 }} />
                      <Typography variant="h6">
                        Asystent V2.0 (Zoptymalizowany)
                      </Typography>
                      {results.v2.success && (
                        <Chip
                          label={`${(results.v2.processingTime || results.v2.actualProcessingTime).toFixed(0)}ms`}
                          {...getSpeedIndicator(results.v2.processingTime || results.v2.actualProcessingTime)}
                          size="small"
                          sx={{ ml: 2 }}
                        />
                      )}
                    </AccordionSummary>
                    <AccordionDetails>
                      {results.v2.success ? (
                        <Box>
                          <Typography variant="body2" paragraph>
                            <strong>Odpowiedź:</strong>
                          </Typography>
                          <Paper 
                            variant="outlined" 
                            sx={{ p: 2, mb: 2, backgroundColor: 'grey.50' }}
                          >
                            <Typography 
                              variant="body2" 
                              component="div"
                              sx={{ whiteSpace: 'pre-wrap' }}
                            >
                              {results.v2.response}
                            </Typography>
                          </Paper>
                          
                          <Grid container spacing={2}>
                            <Grid item xs={6}>
                              <Typography variant="caption" display="block">
                                <strong>Czas przetwarzania:</strong> {(results.v2.processingTime || results.v2.actualProcessingTime).toFixed(2)}ms
                              </Typography>
                            </Grid>
                            <Grid item xs={6}>
                              <Typography variant="caption" display="block">
                                <strong>Pewność:</strong> {(results.v2.confidence * 100).toFixed(1)}%
                              </Typography>
                            </Grid>
                            <Grid item xs={6}>
                              <Typography variant="caption" display="block">
                                <strong>Intencja:</strong> {results.v2.intent}
                              </Typography>
                            </Grid>
                            <Grid item xs={6}>
                              <Typography variant="caption" display="block">
                                <strong>Metoda:</strong> {results.v2.method}
                              </Typography>
                            </Grid>
                          </Grid>
                        </Box>
                      ) : (
                        <Alert severity="error">
                          <Typography variant="body2">
                            V2 nie obsłużył zapytania: {results.v2.error}
                          </Typography>
                        </Alert>
                      )}
                    </AccordionDetails>
                  </Accordion>
                )}

                {/* Wyniki V1 */}
                {results.v1 && (
                  <Accordion>
                    <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                      <Typography variant="h6">
                        Asystent V1.0 (Standardowy)
                      </Typography>
                      {results.v1.success && (
                        <Chip
                          label={`${results.v1.processingTime.toFixed(0)}ms`}
                          {...getSpeedIndicator(results.v1.processingTime)}
                          size="small"
                          sx={{ ml: 2 }}
                        />
                      )}
                    </AccordionSummary>
                    <AccordionDetails>
                      {results.v1.success ? (
                        <Box>
                          <Typography variant="body2" paragraph>
                            <strong>Odpowiedź:</strong>
                          </Typography>
                          <Paper 
                            variant="outlined" 
                            sx={{ p: 2, mb: 2, backgroundColor: 'grey.50' }}
                          >
                            <Typography 
                              variant="body2" 
                              component="div"
                              sx={{ whiteSpace: 'pre-wrap' }}
                            >
                              {results.v1.response}
                            </Typography>
                          </Paper>
                          
                          <Grid container spacing={2}>
                            <Grid item xs={6}>
                              <Typography variant="caption" display="block">
                                <strong>Czas przetwarzania:</strong> {results.v1.processingTime.toFixed(2)}ms
                              </Typography>
                            </Grid>
                            <Grid item xs={6}>
                              <Typography variant="caption" display="block">
                                <strong>Metoda:</strong> {results.v1.method}
                              </Typography>
                            </Grid>
                          </Grid>
                        </Box>
                      ) : (
                        <Alert severity="error">
                          <Typography variant="body2">
                            V1 nie obsłużył zapytania: {results.v1.error}
                          </Typography>
                        </Alert>
                      )}
                    </AccordionDetails>
                  </Accordion>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}
    </Box>
  );
};

export default AIAssistantTest;
