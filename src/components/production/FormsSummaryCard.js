import React from 'react';
import {
  Card,
  CardContent,
  Typography,
  Grid,
  Box,
  Divider,
  Chip
} from '@mui/material';
import {
  Summarize as SummarizeIcon,
  Inventory as InventoryIcon,
  Thermostat as ThermostatIcon,
  Opacity as OpacityIcon,
  PrecisionManufacturing as ProductionQuantityLimitsIcon
} from '@mui/icons-material';
import { useTheme } from '@mui/material/styles';
import { useTranslation } from '../../hooks/useTranslation';

const FormsSummaryCard = ({ formResponses }) => {
  const theme = useTheme();
  const { t } = useTranslation('production');

  // Funkcja pomocnicza do analizy wartości tekstowych/liczbowych
  const analyzeRawMaterialLossData = (forms) => {
    let numericTotal = 0;
    let numericCount = 0;
    const textualEntries = [];
    
    forms.forEach(form => {
      if (form.rawMaterialLoss) {
        const value = form.rawMaterialLoss.toString().trim();
        const numericValue = parseFloat(value);
        
        // Sprawdz czy to liczba (nie NaN i nie zawiera liter)
        if (!isNaN(numericValue) && !/[a-zA-Ząćęłńóśźż]/i.test(value)) {
          numericTotal += numericValue;
          numericCount++;
        } else if (value.toLowerCase() !== 'brak' && value !== '0' && value !== '') {
          // Dodaj tekstowe opisy (pomijając 'brak', '0' i puste)
          textualEntries.push(value);
        }
      }
    });
    
    return {
      numericTotal,
      numericCount,
      textualEntries,
      hasNumeric: numericCount > 0,
      hasTextual: textualEntries.length > 0
    };
  };

  // Funkcje obliczające podsumowania
  const calculateCompletedMOSummary = () => {
    const { completedMO } = formResponses;
    
    const summary = {
      totalProductQuantity: 0,
      totalPackagingLoss: 0,
      totalBulkLoss: 0,
      rawMaterialLossAnalysis: analyzeRawMaterialLossData(completedMO),
      totalNetCapsuleWeight: 0,
      count: completedMO.length
    };

    completedMO.forEach(form => {
      summary.totalProductQuantity += parseFloat(form.productQuantity) || 0;
      summary.totalPackagingLoss += parseFloat(form.packagingLoss) || 0;
      summary.totalBulkLoss += parseFloat(form.bulkLoss) || 0;
      summary.totalNetCapsuleWeight += parseFloat(form.netCapsuleWeight) || 0;
    });

    return summary;
  };

  const calculateProductionControlSummary = () => {
    const { productionControl } = formResponses;
    
    if (productionControl.length === 0) {
      return {
        averageTemperature: 0,
        averageHumidity: 0,
        count: 0
      };
    }

    let totalTemperature = 0;
    let totalHumidity = 0;
    let tempCount = 0;
    let humidityCount = 0;

    productionControl.forEach(form => {
      if (form.temperature) {
        totalTemperature += parseFloat(form.temperature) || 0;
        tempCount++;
      }
      if (form.humidity) {
        totalHumidity += parseFloat(form.humidity) || 0;
        humidityCount++;
      }
    });

    return {
      averageTemperature: tempCount > 0 ? (totalTemperature / tempCount) : 0,
      averageHumidity: humidityCount > 0 ? (totalHumidity / humidityCount) : 0,
      count: productionControl.length
    };
  };

  const calculateProductionShiftSummary = () => {
    const { productionShift } = formResponses;
    
    const summary = {
      totalProductionQuantity: 0,
      rawMaterialLossAnalysis: analyzeRawMaterialLossData(productionShift),
      totalFinishedProductLoss: 0,
      totalLidLoss: 0,
      count: productionShift.length
    };

    productionShift.forEach(form => {
      summary.totalProductionQuantity += parseFloat(form.productionQuantity) || 0;
      summary.totalFinishedProductLoss += parseFloat(form.finishedProductLoss) || 0;
      summary.totalLidLoss += parseFloat(form.lidLoss) || 0;
    });

    return summary;
  };

  // Oblicz podsumowania
  const completedMOSummary = calculateCompletedMOSummary();
  const productionControlSummary = calculateProductionControlSummary();
  const productionShiftSummary = calculateProductionShiftSummary();

  // Sprawdź czy są jakiekolwiek dane
  const hasAnyData = completedMOSummary.count > 0 || 
                     productionControlSummary.count > 0 || 
                     productionShiftSummary.count > 0;

  if (!hasAnyData) {
    return null; // Nie wyświetlaj karty jeśli brak danych
  }

  const formatNumber = (value, decimals = 2) => {
    return value.toFixed(decimals).replace('.', ',');
  };

  // Komponent do wyświetlania analizy strat surowca
  const RawMaterialLossDisplay = ({ analysis, label }) => {
    if (!analysis.hasNumeric && !analysis.hasTextual) {
      return (
        <Typography variant="body2">
          <strong>{label}:</strong> Brak danych
        </Typography>
      );
    }

    return (
      <Box>
        {analysis.hasNumeric && (
          <Typography variant="body2">
            <strong>{label} (suma liczbowa):</strong> {formatNumber(analysis.numericTotal)} ({analysis.numericCount} wpisów)
          </Typography>
        )}
        {analysis.hasTextual && (
          <Typography variant="body2" sx={{ mt: 0.5 }}>
            <strong>{label} (opisy):</strong>
            <Box component="span" sx={{ ml: 0.5, fontStyle: 'italic', fontSize: '0.875em' }}>
              {analysis.textualEntries.length} tekstowy(ch) opis(y)
            </Box>
          </Typography>
        )}
      </Box>
    );
  };

  return (
    <Card sx={{ 
      mb: 3,
      background: theme.palette.mode === 'dark' 
        ? 'rgba(255,255,255,0.02)'
        : '#fafafa',
      border: '1px solid',
      borderColor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'
    }}>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
          <SummarizeIcon sx={{ mr: 1, color: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.7)' : 'primary.main' }} />
          <Typography variant="h6" sx={{ color: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.9)' : 'primary.main', fontWeight: 'bold' }}>
            {t('formsSummary.title', 'Podsumowanie formularzy')}
          </Typography>
        </Box>

        <Grid container spacing={3}>
          {/* Skończone MO */}
          {completedMOSummary.count > 0 && (
            <Grid item xs={12} md={4}>
              <Box sx={{ 
                p: 2, 
                borderRadius: 2, 
                background: theme.palette.mode === 'dark' 
                  ? 'rgba(76,175,80,0.05)' 
                  : 'rgba(76,175,80,0.05)',
                border: '1px solid',
                borderColor: theme.palette.mode === 'dark' ? 'rgba(76,175,80,0.2)' : 'rgba(76,175,80,0.3)'
              }}>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                  <InventoryIcon sx={{ mr: 1, color: theme.palette.mode === 'dark' ? 'rgba(76,175,80,0.8)' : 'success.main', fontSize: '1.2rem' }} />
                  <Typography variant="subtitle1" sx={{ fontWeight: 'bold', color: theme.palette.mode === 'dark' ? 'rgba(76,175,80,0.9)' : 'success.main' }}>
                    {t('formsSummary.completedMO', 'Skończone MO')}
                  </Typography>
                  <Chip label={completedMOSummary.count} size="small" sx={{ ml: 1 }} />
                </Box>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                  <Typography variant="body2">
                    <strong>{t('formsSummary.totalProductQuantity', 'Suma ilości produktu')}:</strong> {formatNumber(completedMOSummary.totalProductQuantity)}
                  </Typography>
                  <Typography variant="body2">
                    <strong>{t('formsSummary.totalPackagingLoss', 'Suma strat opakowania')}:</strong> {formatNumber(completedMOSummary.totalPackagingLoss)}
                  </Typography>
                  <Typography variant="body2">
                    <strong>{t('formsSummary.totalBulkLoss', 'Suma strat wieczka')}:</strong> {formatNumber(completedMOSummary.totalBulkLoss)}
                  </Typography>
                  <RawMaterialLossDisplay 
                    analysis={completedMOSummary.rawMaterialLossAnalysis}
                    label={t('formsSummary.totalRawMaterialLossCompletedMO', 'Straty surowca')}
                  />
                  <Typography variant="body2">
                    <strong>{t('formsSummary.totalNetCapsuleWeight', 'Suma wagi netto kapsułek')}:</strong> {formatNumber(completedMOSummary.totalNetCapsuleWeight)}
                  </Typography>
                </Box>
              </Box>
            </Grid>
          )}

          {/* Kontrola produkcji */}
          {productionControlSummary.count > 0 && (
            <Grid item xs={12} md={4}>
              <Box sx={{ 
                p: 2, 
                borderRadius: 2, 
                background: theme.palette.mode === 'dark' 
                  ? 'rgba(33,150,243,0.05)' 
                  : 'rgba(33,150,243,0.05)',
                border: '1px solid',
                borderColor: theme.palette.mode === 'dark' ? 'rgba(33,150,243,0.2)' : 'rgba(33,150,243,0.3)'
              }}>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                  <ThermostatIcon sx={{ mr: 1, color: theme.palette.mode === 'dark' ? 'rgba(33,150,243,0.8)' : 'primary.main', fontSize: '1.2rem' }} />
                  <Typography variant="subtitle1" sx={{ fontWeight: 'bold', color: theme.palette.mode === 'dark' ? 'rgba(33,150,243,0.9)' : 'primary.main' }}>
                    {t('formsSummary.productionControl', 'Kontrola produkcji')}
                  </Typography>
                  <Chip label={productionControlSummary.count} size="small" sx={{ ml: 1 }} />
                </Box>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                  <Typography variant="body2" sx={{ display: 'flex', alignItems: 'center' }}>
                    <ThermostatIcon sx={{ mr: 0.5, fontSize: '1rem' }} />
                    <strong>{t('formsSummary.averageTemperature', 'Średnia temperatura')}:</strong> 
                    <Box component="span" sx={{ ml: 0.5 }}>
                      {formatNumber(productionControlSummary.averageTemperature, 1)}°C
                    </Box>
                  </Typography>
                  <Typography variant="body2" sx={{ display: 'flex', alignItems: 'center' }}>
                    <OpacityIcon sx={{ mr: 0.5, fontSize: '1rem' }} />
                    <strong>{t('formsSummary.averageHumidity', 'Średnia wilgotność')}:</strong>
                    <Box component="span" sx={{ ml: 0.5 }}>
                      {formatNumber(productionControlSummary.averageHumidity, 1)}%
                    </Box>
                  </Typography>
                </Box>
              </Box>
            </Grid>
          )}

          {/* Zmiany produkcyjne */}
          {productionShiftSummary.count > 0 && (
            <Grid item xs={12} md={4}>
              <Box sx={{ 
                p: 2, 
                borderRadius: 2, 
                background: theme.palette.mode === 'dark' 
                  ? 'rgba(255,152,0,0.05)' 
                  : 'rgba(255,152,0,0.05)',
                border: '1px solid',
                borderColor: theme.palette.mode === 'dark' ? 'rgba(255,152,0,0.2)' : 'rgba(255,152,0,0.3)'
              }}>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                  <ProductionQuantityLimitsIcon sx={{ mr: 1, color: theme.palette.mode === 'dark' ? 'rgba(255,152,0,0.8)' : 'warning.main', fontSize: '1.2rem' }} />
                  <Typography variant="subtitle1" sx={{ fontWeight: 'bold', color: theme.palette.mode === 'dark' ? 'rgba(255,152,0,0.9)' : 'warning.main' }}>
                    {t('formsSummary.productionShift', 'Zmiany produkcyjne')}
                  </Typography>
                  <Chip label={productionShiftSummary.count} size="small" sx={{ ml: 1 }} />
                </Box>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                  <Typography variant="body2">
                    <strong>{t('formsSummary.totalProductionQuantity', 'Suma ilości produkcji')}:</strong> {formatNumber(productionShiftSummary.totalProductionQuantity)}
                  </Typography>
                  <RawMaterialLossDisplay 
                    analysis={productionShiftSummary.rawMaterialLossAnalysis}
                    label={t('formsSummary.totalRawMaterialLossShift', 'Straty surowca')}
                  />
                  <Typography variant="body2">
                    <strong>{t('formsSummary.totalFinishedProductLoss', 'Suma strat produktu gotowego')}:</strong> {formatNumber(productionShiftSummary.totalFinishedProductLoss)}
                  </Typography>
                  <Typography variant="body2">
                    <strong>{t('formsSummary.totalLidLoss', 'Suma strat wieczek')}:</strong> {formatNumber(productionShiftSummary.totalLidLoss)}
                  </Typography>
                </Box>
              </Box>
            </Grid>
          )}
        </Grid>
      </CardContent>
    </Card>
  );
};

export default FormsSummaryCard;
