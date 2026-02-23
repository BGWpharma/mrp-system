import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Box,
  Alert,
  CircularProgress,
  IconButton,
  Tooltip,
  Chip
} from '@mui/material';
import {
  Close as CloseIcon,
  Calculate as CalculateIcon,
  CheckCircle as CheckCircleIcon
} from '@mui/icons-material';
import {
  calculateCmrItemWeight,
  getInventoryDataFromBatches,
  getPackageData
} from '../../utils/cmrWeightCalculator';

/**
 * Dialog do obliczania i wyświetlania szczegółów wagi pozycji CMR
 */
const WeightCalculationDialog = ({ 
  open, 
  onClose, 
  onAcceptWeight,
  cmrItem 
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [calculationResult, setCalculationResult] = useState(null);
  const [inventoryData, setInventoryData] = useState(null);
  const [packageData, setPackageData] = useState(null);

  // Resetuj stan gdy dialog się otwiera
  useEffect(() => {
    let cancelled = false;

    if (open && cmrItem) {
      const doCalculateWeight = async () => {
        setLoading(true);
        setError('');
        
        try {
          if (!cmrItem.linkedBatches || cmrItem.linkedBatches.length === 0) {
            setError('Pozycja CMR nie ma powiązanych partii magazynowych. Aby obliczyć wagę, należy najpierw powiązać pozycję z partiami.');
            setLoading(false);
            return;
          }

          const inventoryItemData = await getInventoryDataFromBatches(cmrItem.linkedBatches);
          if (cancelled) return;
          
          if (!inventoryItemData) {
            setError('Nie udało się pobrać danych pozycji magazynowej. Sprawdź czy pozycja istnieje w magazynie.');
            setLoading(false);
            return;
          }

          setInventoryData(inventoryItemData);

          let packageItemData = null;
          if (inventoryItemData.parentPackageItemId) {
            packageItemData = await getPackageData(inventoryItemData.parentPackageItemId);
            if (cancelled) return;
            setPackageData(packageItemData);
          }

          const calculationParams = {
            quantity: parseFloat(cmrItem.quantity) || 0,
            unitWeight: parseFloat(inventoryItemData.weight) || 0,
            itemsPerBox: parseFloat(inventoryItemData.itemsPerBox) || 0,
            boxesPerPallet: parseFloat(inventoryItemData.boxesPerPallet) || 0,
            packageWeight: packageItemData ? parseFloat(packageItemData.weight) : 0.34,
            palletWeight: 25
          };

          const result = calculateCmrItemWeight(calculationParams);
          setCalculationResult(result);

        } catch (err) {
          if (cancelled) return;
          console.error('Błąd podczas obliczania wagi:', err);
          setError('Wystąpił błąd podczas obliczania wagi: ' + err.message);
        } finally {
          if (!cancelled) {
            setLoading(false);
          }
        }
      };
      doCalculateWeight();
    } else {
      setCalculationResult(null);
      setInventoryData(null);
      setPackageData(null);
      setError('');
    }

    return () => { cancelled = true; };
  }, [open, cmrItem]);

  const handleAcceptWeight = () => {
    if (calculationResult && onAcceptWeight) {
      onAcceptWeight(calculationResult.totalWeight);
    }
    onClose();
  };

  const formatWeight = (weight) => {
    return weight.toFixed(3);
  };

  return (
    <Dialog 
      open={open} 
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: { borderRadius: 2 }
      }}
    >
      <DialogTitle sx={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        pb: 1
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <CalculateIcon color="primary" />
          <Typography variant="h6">Kalkulator wagi CMR</Typography>
        </Box>
        <IconButton 
          onClick={onClose}
          sx={{ color: 'text.secondary' }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers>
        {/* Informacje o pozycji CMR */}
        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle1" fontWeight="medium" gutterBottom>
            Pozycja CMR
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <Chip 
              label={`${cmrItem?.description || 'Bez opisu'}`} 
              color="primary" 
              variant="outlined"
            />
            <Chip 
              label={`${cmrItem?.quantity || 0} ${cmrItem?.unit || 'szt.'}`} 
              color="secondary" 
              variant="outlined"
            />
          </Box>
        </Box>

        {loading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress />
          </Box>
        )}

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {calculationResult && !loading && (
          <>
            {/* Dane źródłowe */}
            <Box sx={{ mb: 3 }}>
              <Typography variant="subtitle1" fontWeight="medium" gutterBottom>
                Dane z magazynu
              </Typography>
              
              {inventoryData && (
                <TableContainer component={Paper} variant="outlined" sx={{ mb: 2 }}>
                  <Table size="small">
                    <TableBody>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 'medium' }}>Nazwa produktu</TableCell>
                        <TableCell>{inventoryData.name}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 'medium' }}>Waga jednostkowa</TableCell>
                        <TableCell>{inventoryData.weight ? `${inventoryData.weight} kg` : 'Nie określono'}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 'medium' }}>Produktu w kartonie</TableCell>
                        <TableCell>{inventoryData.itemsPerBox || 'Nie określono'}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 'medium' }}>Kartonów na palecie</TableCell>
                        <TableCell>{inventoryData.boxesPerPallet || 'Nie określono'}</TableCell>
                      </TableRow>
                      {packageData && (
                        <TableRow>
                          <TableCell sx={{ fontWeight: 'medium' }}>Waga kartonu</TableCell>
                          <TableCell>{packageData.weight} kg ({packageData.name})</TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </Box>

            {/* Wynik obliczeń */}
            <Box sx={{ mb: 3 }}>
              <Typography variant="subtitle1" fontWeight="medium" gutterBottom>
                Obliczenia wagi
              </Typography>
              
              <TableContainer component={Paper} variant="outlined">
                <Table>
                  <TableHead>
                    <TableRow sx={{ bgcolor: 'primary.50' }}>
                      <TableCell sx={{ fontWeight: 'bold' }}>Składnik</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 'bold' }}>Ilość</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 'bold' }}>Waga jednostkowa</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 'bold' }}>Waga całkowita</TableCell>
                      <TableCell sx={{ fontWeight: 'bold' }}>Obliczenie</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {calculationResult.calculations.map((calc, index) => (
                      <TableRow key={index}>
                        <TableCell sx={{ fontWeight: 'medium' }}>
                          {calc.description}
                        </TableCell>
                        <TableCell align="right">
                          {calc.quantity} {calc.unit}
                        </TableCell>
                        <TableCell align="right">
                          {formatWeight(calc.unitWeight)} kg
                        </TableCell>
                        <TableCell align="right" sx={{ fontWeight: 'medium' }}>
                          {formatWeight(calc.totalWeight)} kg
                        </TableCell>
                        <TableCell sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>
                          {calc.formula}
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow sx={{ bgcolor: 'success.50', '& td': { fontWeight: 'bold' } }}>
                      <TableCell>SUMA CAŁKOWITA</TableCell>
                      <TableCell align="right">-</TableCell>
                      <TableCell align="right">-</TableCell>
                      <TableCell align="right" sx={{ fontSize: '1.125rem' }}>
                        {formatWeight(calculationResult.totalWeight)} kg
                      </TableCell>
                      <TableCell>-</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>

            {/* Podsumowanie */}
            <Alert severity="success" icon={<CheckCircleIcon />}>
              <Typography sx={{ fontWeight: 'medium' }}>
                Obliczona waga: <strong>{formatWeight(calculationResult.totalWeight)} kg</strong>
              </Typography>
              <Typography variant="body2" sx={{ mt: 1 }}>
                Składa się z: {calculationResult.calculations.length > 1 ? calculationResult.calculations.map((calc, index) => 
                  `${calc.description.toLowerCase()}: ${formatWeight(calc.totalWeight)} kg`
                ).join(', ') : formatWeight(calculationResult.productWeight) + ' kg produktu'}
              </Typography>
              {(calculationResult.palletsCount > 0 || calculationResult.boxesCount > 0) && (
                <Typography variant="body2" sx={{ mt: 0.5, fontStyle: 'italic' }}>
                  Opakowanie: {calculationResult.boxesCount} kartonów, {calculationResult.palletsCount} palet
                </Typography>
              )}
            </Alert>
          </>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose}>
          Anuluj
        </Button>
        {calculationResult && !loading && (
          <Button 
            variant="contained" 
            onClick={handleAcceptWeight}
            startIcon={<CheckCircleIcon />}
          >
            Zastosuj wagę ({formatWeight(calculationResult.totalWeight)} kg)
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
};

export default WeightCalculationDialog; 