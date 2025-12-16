/**
 * WeeklyConsumptionReportTab - Komponent wyświetlający cotygodniowy raport AI konsumpcji MO
 * 
 * Wyświetla:
 * - Analizę AI wygenerowaną przez Cloud Function
 * - Statystyki konsumpcji
 * - Wykryte problemy
 * - Odchylenia od planu
 * - Partie wymagające uwagi
 */

import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  Grid,
  Card,
  CardContent,
  CircularProgress,
  Alert,
  Chip,
  Divider,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Button,
  Collapse,
  IconButton,
  useTheme
} from '@mui/material';
import {
  ExpandMore as ExpandMoreIcon,
  SmartToy as AIIcon,
  Warning as WarningIcon,
  Error as ErrorIcon,
  Info as InfoIcon,
  CheckCircle as CheckCircleIcon,
  Inventory as InventoryIcon,
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  Schedule as ScheduleIcon,
  Refresh as RefreshIcon,
  KeyboardArrowDown as KeyboardArrowDownIcon,
  KeyboardArrowUp as KeyboardArrowUpIcon
} from '@mui/icons-material';
import ReactMarkdown from 'react-markdown';
import {
  getWeeklyConsumptionReport,
  formatReportDate,
  formatReportPeriod,
  getReportAge,
  isReportCurrent,
  getSeverityColor,
  groupIssuesByType,
  translateIssueType
} from '../../services/weeklyReportService';

/**
 * Statystyka karta
 */
const StatCard = ({ title, value, subtitle, icon, color = 'primary' }) => {
  const theme = useTheme();
  
  return (
    <Card sx={{ 
      height: '100%',
      borderLeft: 4,
      borderColor: `${color}.main`
    }}>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
          {icon && (
            <Box sx={{ 
              mr: 1.5, 
              color: `${color}.main`,
              display: 'flex',
              alignItems: 'center'
            }}>
              {icon}
            </Box>
          )}
          <Typography variant="body2" color="text.secondary">
            {title}
          </Typography>
        </Box>
        <Typography variant="h4" fontWeight="bold" color={`${color}.main`}>
          {value}
        </Typography>
        {subtitle && (
          <Typography variant="caption" color="text.secondary">
            {subtitle}
          </Typography>
        )}
      </CardContent>
    </Card>
  );
};

/**
 * Sekcja problemów
 */
const IssuesSection = ({ issues }) => {
  if (!issues || issues.length === 0) {
    return (
      <Alert severity="success" sx={{ mb: 2 }}>
        <Typography variant="body2">
          Brak wykrytych problemów w tym tygodniu 🎉
        </Typography>
      </Alert>
    );
  }

  const groupedIssues = groupIssuesByType(issues);
  const highPriorityCount = issues.filter(i => i.severity === 'high').length;
  const mediumPriorityCount = issues.filter(i => i.severity === 'medium').length;

  return (
    <Paper sx={{ p: 2, mb: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
        <WarningIcon sx={{ mr: 1, color: 'warning.main' }} />
        <Typography variant="h6">
          Wykryte problemy ({issues.length})
        </Typography>
        {highPriorityCount > 0 && (
          <Chip 
            label={`${highPriorityCount} krytycznych`} 
            color="error" 
            size="small" 
            sx={{ ml: 1 }}
          />
        )}
        {mediumPriorityCount > 0 && (
          <Chip 
            label={`${mediumPriorityCount} średnich`} 
            color="warning" 
            size="small" 
            sx={{ ml: 1 }}
          />
        )}
      </Box>

      {Object.entries(groupedIssues).map(([type, typeIssues]) => (
        <Accordion key={type} defaultExpanded={typeIssues.some(i => i.severity === 'high')}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography fontWeight="medium">
              {translateIssueType(type)} ({typeIssues.length})
            </Typography>
          </AccordionSummary>
          <AccordionDetails>
            {typeIssues.slice(0, 10).map((issue, idx) => (
              <Alert 
                key={idx} 
                severity={getSeverityColor(issue.severity)}
                sx={{ mb: 1 }}
              >
                <Typography variant="body2">
                  {issue.message}
                </Typography>
                {issue.moNumber && (
                  <Typography variant="caption" color="text.secondary">
                    MO: {issue.moNumber}
                  </Typography>
                )}
              </Alert>
            ))}
            {typeIssues.length > 10 && (
              <Typography variant="caption" color="text.secondary">
                ... i {typeIssues.length - 10} więcej
              </Typography>
            )}
          </AccordionDetails>
        </Accordion>
      ))}
    </Paper>
  );
};

/**
 * Sekcja odchyleń konsumpcji
 */
const DeviationsSection = ({ deviations }) => {
  const [showAll, setShowAll] = useState(false);
  
  if (!deviations || deviations.length === 0) {
    return null;
  }

  const displayedDeviations = showAll ? deviations : deviations.slice(0, 5);

  return (
    <Paper sx={{ p: 2, mb: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
        <TrendingUpIcon sx={{ mr: 1, color: 'info.main' }} />
        <Typography variant="h6">
          Odchylenia od planu ({deviations.length})
        </Typography>
      </Box>

      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>MO</TableCell>
              <TableCell>Materiał</TableCell>
              <TableCell align="right">Plan</TableCell>
              <TableCell align="right">Faktycznie</TableCell>
              <TableCell align="right">Odchylenie</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {displayedDeviations.map((dev, idx) => (
              <TableRow key={idx}>
                <TableCell>{dev.moNumber || dev.taskId?.substring(0, 8)}</TableCell>
                <TableCell>{dev.materialName}</TableCell>
                <TableCell align="right">{dev.plannedQuantity?.toFixed(2)}</TableCell>
                <TableCell align="right">{dev.actualQuantity?.toFixed(2)}</TableCell>
                <TableCell align="right">
                  <Chip
                    size="small"
                    label={`${dev.deviationPercent > 0 ? '+' : ''}${dev.deviationPercent}%`}
                    color={dev.severity === 'high' ? 'error' : 'warning'}
                    icon={dev.deviationPercent > 0 ? <TrendingUpIcon /> : <TrendingDownIcon />}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {deviations.length > 5 && (
        <Button 
          size="small" 
          onClick={() => setShowAll(!showAll)}
          sx={{ mt: 1 }}
        >
          {showAll ? 'Pokaż mniej' : `Pokaż wszystkie (${deviations.length})`}
        </Button>
      )}
    </Paper>
  );
};

/**
 * Sekcja partii wymagających uwagi
 */
const BatchesAttentionSection = ({ unusedBatches, frozenBatches, dormantBatches }) => {
  const [expanded, setExpanded] = useState('unused');

  const handleChange = (panel) => (event, isExpanded) => {
    setExpanded(isExpanded ? panel : false);
  };

  const hasAnyBatches = 
    (unusedBatches?.length > 0) || 
    (frozenBatches?.length > 0) || 
    (dormantBatches?.length > 0);

  if (!hasAnyBatches) {
    return null;
  }

  return (
    <Paper sx={{ p: 2, mb: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
        <InventoryIcon sx={{ mr: 1, color: 'warning.main' }} />
        <Typography variant="h6">
          Partie wymagające uwagi
        </Typography>
      </Box>

      {unusedBatches?.length > 0 && (
        <Accordion 
          expanded={expanded === 'unused'} 
          onChange={handleChange('unused')}
        >
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography>
              Partie z niską ilością ({unusedBatches.length})
            </Typography>
            <Chip 
              label="Niska ilość" 
              size="small" 
              color="info" 
              sx={{ ml: 1 }}
            />
          </AccordionSummary>
          <AccordionDetails>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Partia</TableCell>
                    <TableCell>Materiał</TableCell>
                    <TableCell align="right">Ilość</TableCell>
                    <TableCell>Dni do wygaśnięcia</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {unusedBatches.slice(0, 10).map((batch, idx) => (
                    <TableRow key={idx}>
                      <TableCell>{batch.batchNumber}</TableCell>
                      <TableCell>{batch.materialName}</TableCell>
                      <TableCell align="right">
                        {batch.quantity} {batch.unit}
                      </TableCell>
                      <TableCell>
                        {batch.daysUntilExpiry !== null ? (
                          <Chip 
                            size="small"
                            label={batch.daysUntilExpiry < 0 
                              ? 'Przeterminowana!' 
                              : `${batch.daysUntilExpiry} dni`
                            }
                            color={batch.daysUntilExpiry < 0 
                              ? 'error' 
                              : batch.daysUntilExpiry < 30 
                                ? 'warning' 
                                : 'default'
                            }
                          />
                        ) : '-'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </AccordionDetails>
        </Accordion>
      )}

      {frozenBatches?.length > 0 && (
        <Accordion 
          expanded={expanded === 'frozen'} 
          onChange={handleChange('frozen')}
        >
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography>
              Partie zamrożone ({frozenBatches.length})
            </Typography>
            <Chip 
              label="Z rezerwacją bez konsumpcji" 
              size="small" 
              color="warning" 
              sx={{ ml: 1 }}
            />
          </AccordionSummary>
          <AccordionDetails>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Te partie mają aktywne rezerwacje, ale nie zostały skonsumowane w ostatnim tygodniu.
            </Typography>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Partia</TableCell>
                    <TableCell>Materiał</TableCell>
                    <TableCell align="right">Ilość</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {frozenBatches.slice(0, 10).map((batch, idx) => (
                    <TableRow key={idx}>
                      <TableCell>{batch.batchNumber}</TableCell>
                      <TableCell>{batch.materialName}</TableCell>
                      <TableCell align="right">
                        {batch.quantity} {batch.unit}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </AccordionDetails>
        </Accordion>
      )}

      {dormantBatches?.length > 0 && (
        <Accordion 
          expanded={expanded === 'dormant'} 
          onChange={handleChange('dormant')}
        >
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography>
              Partie bez ruchu ({dormantBatches.length})
            </Typography>
            <Chip 
              label="Brak aktywności 30 dni" 
              size="small" 
              color="error" 
              sx={{ ml: 1 }}
            />
          </AccordionSummary>
          <AccordionDetails>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Te partie nie miały żadnych transakcji przez ostatni miesiąc.
            </Typography>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Partia</TableCell>
                    <TableCell>Materiał</TableCell>
                    <TableCell align="right">Ilość</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {dormantBatches.slice(0, 10).map((batch, idx) => (
                    <TableRow key={idx}>
                      <TableCell>{batch.batchNumber}</TableCell>
                      <TableCell>{batch.materialName}</TableCell>
                      <TableCell align="right">
                        {batch.quantity} {batch.unit}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </AccordionDetails>
        </Accordion>
      )}
    </Paper>
  );
};

/**
 * Sekcja analizy AI
 */
const AIAnalysisSection = ({ aiAnalysis }) => {
  const theme = useTheme();
  
  if (!aiAnalysis || !aiAnalysis.content) {
    return null;
  }

  if (aiAnalysis.error) {
    return (
      <Alert severity="warning" sx={{ mb: 2 }}>
        <Typography variant="body2">
          Nie udało się wygenerować analizy AI: {aiAnalysis.content}
        </Typography>
      </Alert>
    );
  }

  return (
    <Paper sx={{ p: 3, mb: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
        <AIIcon sx={{ mr: 1, color: 'primary.main' }} />
        <Typography variant="h6">
          Analiza AI
        </Typography>
        <Chip 
          label={aiAnalysis.model || 'Gemini'} 
          size="small" 
          sx={{ ml: 1 }}
          variant="outlined"
        />
        {aiAnalysis.tokensUsed > 0 && (
          <Typography variant="caption" color="text.secondary" sx={{ ml: 2 }}>
            {aiAnalysis.tokensUsed.toLocaleString()} tokenów
          </Typography>
        )}
      </Box>

      <Box 
        sx={{ 
          '& h2': { 
            fontSize: '1.25rem', 
            fontWeight: 'bold',
            mt: 3,
            mb: 1,
            color: theme.palette.primary.main
          },
          '& h3': {
            fontSize: '1.1rem',
            fontWeight: 'medium',
            mt: 2,
            mb: 1
          },
          '& ul': { 
            pl: 2,
            mb: 2
          },
          '& li': {
            mb: 0.5
          },
          '& p': {
            mb: 1.5
          },
          '& strong': {
            color: theme.palette.text.primary
          }
        }}
      >
        <ReactMarkdown>{aiAnalysis.content}</ReactMarkdown>
      </Box>
    </Paper>
  );
};

/**
 * Główny komponent raportu
 */
const WeeklyConsumptionReportTab = ({ isMobile }) => {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchReport = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getWeeklyConsumptionReport();
      setReport(data);
    } catch (err) {
      console.error('Błąd pobierania raportu:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
  }, []);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 8 }}>
        <CircularProgress />
        <Typography sx={{ ml: 2 }}>Ładowanie raportu...</Typography>
      </Box>
    );
  }

  if (error) {
    return (
      <Alert severity="error" sx={{ m: 2 }}>
        <Typography variant="body1">
          Błąd podczas pobierania raportu: {error}
        </Typography>
        <Button 
          startIcon={<RefreshIcon />} 
          onClick={fetchReport}
          sx={{ mt: 1 }}
        >
          Spróbuj ponownie
        </Button>
      </Alert>
    );
  }

  if (!report) {
    return (
      <Paper sx={{ p: 4, textAlign: 'center' }}>
        <ScheduleIcon sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
        <Typography variant="h6" gutterBottom>
          Brak raportu tygodniowego
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Raport zostanie automatycznie wygenerowany w niedzielę o 06:00.
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
          Cloud Function: generateWeeklyConsumptionReport
        </Typography>
      </Paper>
    );
  }

  if (report.status === 'error') {
    return (
      <Alert severity="error" sx={{ m: 2 }}>
        <Typography variant="body1">
          Ostatnia próba generowania raportu zakończyła się błędem:
        </Typography>
        <Typography variant="body2" sx={{ mt: 1 }}>
          {report.error}
        </Typography>
      </Alert>
    );
  }

  const { statistics, issues, consumptionDeviations, 
          lowQuantityBatches, unusedBatches: legacyUnusedBatches,
          frozenBatches, dormantBatches, productionEfficiency, 
          inventorySummary, aiAnalysis } = report;
  // Kompatybilność wsteczna - używaj nowej nazwy jeśli dostępna, inaczej starej
  const unusedBatches = lowQuantityBatches || legacyUnusedBatches;

  return (
    <Box>
      {/* Nagłówek raportu */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Box sx={{ 
          display: 'flex', 
          flexDirection: isMobile ? 'column' : 'row',
          justifyContent: 'space-between', 
          alignItems: isMobile ? 'flex-start' : 'center',
          gap: 1
        }}>
          <Box>
            <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center' }}>
              <AIIcon sx={{ mr: 1 }} />
              Cotygodniowy Raport Konsumpcji MO
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Okres: {formatReportPeriod(report.periodStart, report.periodEnd)}
            </Typography>
          </Box>
          <Box sx={{ textAlign: isMobile ? 'left' : 'right' }}>
            <Chip 
              label={isReportCurrent(report.generatedAt) ? 'Aktualny' : 'Nieaktualny'}
              color={isReportCurrent(report.generatedAt) ? 'success' : 'warning'}
              size="small"
              sx={{ mb: 0.5 }}
            />
            <Typography variant="caption" color="text.secondary" display="block">
              Wygenerowano: {getReportAge(report.generatedAt)}
            </Typography>
          </Box>
        </Box>
      </Paper>

      {/* Statystyki */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={6} md={3}>
          <StatCard 
            title="Zadania" 
            value={statistics?.totalTasks || 0}
            subtitle={`${statistics?.tasksWithConsumption || 0} z konsumpcją`}
            icon={<ScheduleIcon />}
            color="primary"
          />
        </Grid>
        <Grid item xs={6} md={3}>
          <StatCard 
            title="Wartość konsumpcji" 
            value={`${(statistics?.totalConsumedValue || 0).toLocaleString('pl-PL')} €`}
            subtitle={`${statistics?.uniqueMaterialsConsumed || 0} materiałów`}
            icon={<InventoryIcon />}
            color="success"
          />
        </Grid>
        <Grid item xs={6} md={3}>
          <StatCard 
            title="Wykryte problemy" 
            value={issues?.length || 0}
            subtitle={issues?.filter(i => i.severity === 'high').length > 0 
              ? `${issues.filter(i => i.severity === 'high').length} krytycznych` 
              : 'Brak krytycznych'
            }
            icon={<WarningIcon />}
            color={issues?.length > 0 ? 'warning' : 'success'}
          />
        </Grid>
        <Grid item xs={6} md={3}>
          <StatCard 
            title="Wydajność produkcji" 
            value={productionEfficiency?.average != null ? `${productionEfficiency.average}%` : 'Brak danych'}
            subtitle={productionEfficiency?.tasksWithData != null 
              ? `${productionEfficiency.tasksWithData}/${productionEfficiency.tasksAnalyzed || 0} zadań z danymi`
              : `${productionEfficiency?.tasksAnalyzed || 0} zadań`
            }
            icon={<TrendingUpIcon />}
            color={productionEfficiency?.average != null 
              ? (productionEfficiency.average >= 95 ? 'success' : 'warning')
              : 'default'
            }
          />
        </Grid>
      </Grid>

      {/* Analiza AI */}
      <AIAnalysisSection aiAnalysis={aiAnalysis} />

      {/* Problemy */}
      <IssuesSection issues={issues} />

      {/* Odchylenia */}
      <DeviationsSection deviations={consumptionDeviations} />

      {/* Partie */}
      <BatchesAttentionSection 
        unusedBatches={unusedBatches}
        frozenBatches={frozenBatches}
        dormantBatches={dormantBatches}
      />

      {/* Podsumowanie magazynu */}
      {inventorySummary && (
        <Paper sx={{ p: 2 }}>
          <Typography variant="h6" sx={{ mb: 2 }}>
            📊 Podsumowanie magazynu
          </Typography>
          <Grid container spacing={2}>
            <Grid item xs={6} md={3}>
              <Typography variant="body2" color="text.secondary">
                Pozycje z ilością
              </Typography>
              <Typography variant="h6">
                {inventorySummary.totalItems}
              </Typography>
            </Grid>
            <Grid item xs={6} md={3}>
              <Typography variant="body2" color="text.secondary">
                Wartość magazynu
              </Typography>
              <Typography variant="h6">
                {inventorySummary.totalValue?.toLocaleString('pl-PL')} €
              </Typography>
            </Grid>
            <Grid item xs={6} md={3}>
              <Typography variant="body2" color="text.secondary">
                Niski stan
              </Typography>
              <Typography variant="h6" color={inventorySummary.lowStockItems > 0 ? 'warning.main' : 'text.primary'}>
                {inventorySummary.lowStockItems}
              </Typography>
            </Grid>
            <Grid item xs={6} md={3}>
              <Typography variant="body2" color="text.secondary">
                Wygasające partie
              </Typography>
              <Typography variant="h6" color={inventorySummary.expiringBatchesCount > 0 ? 'error.main' : 'text.primary'}>
                {inventorySummary.expiringBatchesCount}
              </Typography>
            </Grid>
          </Grid>
        </Paper>
      )}
    </Box>
  );
};

export default WeeklyConsumptionReportTab;

