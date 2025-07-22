/**
 * Dialog do tworzenia rezerwacji z pozycji PO
 * 
 * Funkcjonalności:
 * - Wybór materiału z listy potrzebnych w zadaniu
 * - Wyświetlanie dostępnych pozycji PO dla wybranego materiału
 * - Walidacja ilości do zarezerwowania
 * - Podgląd szczegółów PO i dostawcy
 */

import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Grid,
  TextField,
  Autocomplete,
  Typography,
  Box,
  Card,
  CardContent,
  CardActions,
  Chip,
  Alert,
  AlertTitle,
  List,
  ListItem,
  ListItemText,
  ListItemButton,
  ListItemIcon,
  Divider,
  CircularProgress,
  Tooltip,
  FormControlLabel,
  Checkbox,
  Collapse
} from '@mui/material';
import {
  ShoppingCart as POIcon,
  Business as SupplierIcon,
  LocalShipping as DeliveryIcon,
  Euro as PriceIcon,
  Inventory as MaterialIcon,
  CheckCircle as AvailableIcon,
  Warning as WarningIcon,
  ExpandMore as ExpandIcon,
  ExpandLess as CollapseIcon,
  Info as InfoIcon
} from '@mui/icons-material';
import { formatDateTime, formatCurrency } from '../../utils/formatters';
import { getAvailablePOItems } from '../../services/poReservationService';

const POReservationDialog = ({ 
  open, 
  onClose, 
  materials = [], 
  onReservationCreate,
  taskId 
}) => {
  // Stan komponentu
  const [selectedMaterial, setSelectedMaterial] = useState(null);
  const [availablePOItems, setAvailablePOItems] = useState([]);
  const [selectedPOItem, setSelectedPOItem] = useState(null);
  const [reservationQuantity, setReservationQuantity] = useState('');
  const [loading, setLoading] = useState(false);
  const [expandedPO, setExpandedPO] = useState(null);
  const [showOnlyAvailable, setShowOnlyAvailable] = useState(true);
  
  // Reset stanu przy otwieraniu dialogu
  useEffect(() => {
    if (open) {
      setSelectedMaterial(null);
      setAvailablePOItems([]);
      setSelectedPOItem(null);
      setReservationQuantity('');
      setExpandedPO(null);
    }
  }, [open]);
  
  // Obsługa wyboru materiału
  const handleMaterialSelect = async (material) => {
    setSelectedMaterial(material);
    setSelectedPOItem(null);
    setReservationQuantity('');
    setAvailablePOItems([]);
    
    if (material) {
      setLoading(true);
      try {
        const materialId = material.inventoryItemId || material.id;
        const items = await getAvailablePOItems(materialId);
        setAvailablePOItems(items);
        
        if (items.length === 0) {
          console.log(`Brak dostępnych pozycji w PO dla materiału: ${material.name}`);
        }
      } catch (error) {
        console.error('Błąd podczas pobierania pozycji PO:', error);
      } finally {
        setLoading(false);
      }
    }
  };
  
  // Obsługa wyboru pozycji PO
  const handlePOItemSelect = (poItem) => {
    setSelectedPOItem(poItem);
    
    // Ustaw domyślną ilość
    const maxFromPO = poItem.availableQuantity;
    const neededQuantity = selectedMaterial?.quantity || 0;
    const defaultQuantity = Math.min(maxFromPO, neededQuantity);
    
    setReservationQuantity(defaultQuantity > 0 ? defaultQuantity.toString() : '');
  };
  
  // Walidacja formularza
  const isFormValid = () => {
    if (!selectedMaterial || !selectedPOItem || !reservationQuantity) {
      return false;
    }
    
    const quantity = parseFloat(reservationQuantity);
    return !isNaN(quantity) && quantity > 0 && quantity <= selectedPOItem.availableQuantity;
  };
  
  // Obsługa tworzenia rezerwacji
  const handleCreateReservation = () => {
    if (!isFormValid()) return;
    
    const reservationData = {
      materialId: selectedMaterial.inventoryItemId || selectedMaterial.id,
      materialName: selectedMaterial.name,
      poId: selectedPOItem.poId,
      poNumber: selectedPOItem.poNumber,
      poItemId: selectedPOItem.poItemId,
      quantity: parseFloat(reservationQuantity),
      unit: selectedMaterial.unit,
      unitPrice: selectedPOItem.unitPrice,
      currency: selectedPOItem.currency,
      supplier: selectedPOItem.supplier,
      expectedDeliveryDate: selectedPOItem.expectedDeliveryDate
    };
    
    onReservationCreate(reservationData);
  };
  
  // Filtrowane pozycje PO
  const filteredPOItems = showOnlyAvailable 
    ? availablePOItems.filter(item => item.availableQuantity > 0)
    : availablePOItems;
  
  // Grupowanie według PO
  const groupedPOItems = filteredPOItems.reduce((groups, item) => {
    const key = item.poId;
    if (!groups[key]) {
      groups[key] = {
        poId: item.poId,
        poNumber: item.poNumber,
        supplier: item.supplier,
        status: item.status,
        expectedDeliveryDate: item.expectedDeliveryDate,
        items: []
      };
    }
    groups[key].items.push(item);
    return groups;
  }, {});
  
  // Renderuj status PO
  const renderPOStatus = (status) => {
    const statusConfig = {
      draft: { color: 'default', label: 'Szkic' },
      pending: { color: 'default', label: 'Oczekujące' },
      approved: { color: 'warning', label: 'Zatwierdzone' },
      ordered: { color: 'primary', label: 'Zamówione' },
      partial: { color: 'warning', label: 'Częściowo' },
      shipped: { color: 'info', label: 'Wysłane' },
      delivered: { color: 'success', label: 'Dostarczone' }
    };
    
    const config = statusConfig[status] || statusConfig.draft;
    return <Chip label={config.label} color={config.color} size="small" />;
  };
  
  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle>
        <Box display="flex" alignItems="center" gap={1}>
          <POIcon />
          Dodaj rezerwację z zamówienia zakupowego
        </Box>
      </DialogTitle>
      
      <DialogContent>
        <Grid container spacing={3} sx={{ mt: 1 }}>
          {/* Wybór materiału */}
          <Grid item xs={12}>
            <Autocomplete
              value={selectedMaterial}
              onChange={(event, newValue) => handleMaterialSelect(newValue)}
              options={materials}
              getOptionLabel={(option) => option.name || ''}
              renderInput={(params) => (
                <TextField 
                  {...params} 
                  label="Wybierz materiał potrzebny w zadaniu" 
                  fullWidth 
                  variant="outlined"
                />
              )}
              renderOption={(props, option) => (
                <li {...props}>
                  <Box>
                    <Typography variant="body1">{option.name}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      Potrzebne: {option.quantity} {option.unit}
                      {option.inventoryItemId && (
                        <> • ID: {option.inventoryItemId}</>
                      )}
                    </Typography>
                  </Box>
                </li>
              )}
              disabled={loading}
            />
          </Grid>
          
          {/* Informacje o wybranym materiale */}
          {selectedMaterial && (
            <Grid item xs={12}>
              <Alert severity="info" icon={<MaterialIcon />}>
                <AlertTitle>Wybrany materiał: {selectedMaterial.name}</AlertTitle>
                Potrzebna ilość w zadaniu: <strong>{selectedMaterial.quantity} {selectedMaterial.unit}</strong>
                {selectedMaterial.missing && (
                  <Typography variant="body2" color="error" sx={{ mt: 1 }}>
                    ⚠️ Materiał oznaczony jako brakujący
                  </Typography>
                )}
              </Alert>
            </Grid>
          )}
          
          {/* Ładowanie */}
          {loading && (
            <Grid item xs={12}>
              <Box display="flex" justifyContent="center" alignItems="center" p={3}>
                <CircularProgress size={24} sx={{ mr: 1 }} />
                <Typography>Szukam dostępnych pozycji w zamówieniach...</Typography>
              </Box>
            </Grid>
          )}
          
          {/* Filtry i opcje */}
          {selectedMaterial && !loading && (
            <Grid item xs={12}>
              <Box display="flex" justifyContent="space-between" alignItems="center">
                <Typography variant="h6">
                  Dostępne pozycje w zamówieniach zakupowych ({filteredPOItems.length})
                </Typography>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={showOnlyAvailable}
                      onChange={(e) => setShowOnlyAvailable(e.target.checked)}
                    />
                  }
                  label="Pokaż tylko dostępne"
                />
              </Box>
            </Grid>
          )}
          
          {/* Lista dostępnych pozycji PO */}
          {selectedMaterial && !loading && (
            <Grid item xs={12}>
              {Object.keys(groupedPOItems).length === 0 ? (
                <Alert severity="warning">
                  <AlertTitle>Brak dostępnych pozycji</AlertTitle>
                  Nie znaleziono pozycji w zamówieniach zakupowych dla materiału: <strong>{selectedMaterial.name}</strong>
                  <Box sx={{ mt: 1 }}>
                    <Typography variant="body2">
                      Sprawdź czy:
                    </Typography>
                    <Typography variant="body2" component="ul" sx={{ ml: 2 }}>
                      <li>Material ma przypisaną pozycję magazynową (inventoryItemId)</li>
                      <li>Istnieją aktywne zamówienia zakupowe zawierające ten materiał</li>
                      <li>Pozycje nie są już w pełni zarezerwowane</li>
                    </Typography>
                  </Box>
                </Alert>
              ) : (
                <Box>
                  {Object.values(groupedPOItems).map((poGroup) => (
                    <Card key={poGroup.poId} sx={{ mb: 2 }} variant="outlined">
                      <CardContent sx={{ pb: 1 }}>
                        {/* Nagłówek PO */}
                        <Box 
                          display="flex" 
                          justifyContent="space-between" 
                          alignItems="center"
                          sx={{ cursor: 'pointer' }}
                          onClick={() => setExpandedPO(
                            expandedPO === poGroup.poId ? null : poGroup.poId
                          )}
                        >
                          <Box display="flex" alignItems="center" gap={1}>
                            <POIcon color="primary" />
                            <Typography variant="h6">{poGroup.poNumber}</Typography>
                            {renderPOStatus(poGroup.status)}
                          </Box>
                          <Box display="flex" alignItems="center" gap={1}>
                            <Typography variant="body2" color="text.secondary">
                              {poGroup.items.length} pozycja/e
                            </Typography>
                            {expandedPO === poGroup.poId ? <CollapseIcon /> : <ExpandIcon />}
                          </Box>
                        </Box>
                        
                        {/* Informacje o dostawcy */}
                        <Box display="flex" alignItems="center" gap={2} sx={{ mt: 1 }}>
                          <Box display="flex" alignItems="center" gap={0.5}>
                            <SupplierIcon fontSize="small" color="action" />
                            <Typography variant="body2">
                              {poGroup.supplier?.name || 'Nieznany dostawca'}
                            </Typography>
                          </Box>
                          {poGroup.expectedDeliveryDate && (
                            <Box display="flex" alignItems="center" gap={0.5}>
                              <DeliveryIcon fontSize="small" color="action" />
                              <Typography variant="body2">
                                {formatDateTime(poGroup.expectedDeliveryDate).split(',')[0]}
                              </Typography>
                            </Box>
                          )}
                        </Box>
                      </CardContent>
                      
                      {/* Rozwijana lista pozycji */}
                      <Collapse in={expandedPO === poGroup.poId}>
                        <CardContent sx={{ pt: 0 }}>
                          <List dense>
                            {poGroup.items.map((item, index) => (
                              <React.Fragment key={`${item.poId}-${item.poItemId}`}>
                                <Box>
                                  <ListItemButton
                                    selected={selectedPOItem?.poId === item.poId && 
                                             selectedPOItem?.poItemId === item.poItemId}
                                    onClick={() => handlePOItemSelect(item)}
                                    disabled={item.availableQuantity <= 0}
                                  >
                                    <ListItemIcon>
                                      {item.availableQuantity > 0 ? (
                                        <AvailableIcon color="success" />
                                      ) : (
                                        <WarningIcon color="warning" />
                                      )}
                                    </ListItemIcon>
                                    <ListItemText
                                      primary={
                                        <Box display="flex" justifyContent="space-between" alignItems="center">
                                          <Typography variant="body1">
                                            {item.materialName}
                                          </Typography>
                                          <Box display="flex" alignItems="center" gap={1}>
                                            <Chip 
                                              label={`${item.availableQuantity} / ${item.totalQuantity} ${item.unit}`}
                                              size="small"
                                              color={item.availableQuantity > 0 ? 'success' : 'warning'}
                                              variant="outlined"
                                            />
                                            <Typography variant="body2" fontWeight="bold">
                                              {formatCurrency(item.unitPrice, item.currency)} / {item.unit}
                                            </Typography>
                                          </Box>
                                        </Box>
                                      }
                                      secondary={
                                        <Box>
                                          <Typography variant="caption">
                                            Dostępne: {item.availableQuantity} {item.unit} z {item.totalQuantity} {item.unit}
                                            {item.reservedQuantity > 0 && (
                                              <> • Zarezerwowane: {item.reservedQuantity} {item.unit}</>
                                            )}
                                          </Typography>
                                        </Box>
                                      }
                                    />
                                  </ListItemButton>
                                  
                                  {/* Formularz ilości dla wybranej pozycji */}
                                  {selectedPOItem?.poId === item.poId && selectedPOItem?.poItemId === item.poItemId && (
                                    <Box sx={{ px: 2, pb: 2, bgcolor: 'action.hover', borderRadius: 1, mx: 1, mb: 1 }}>
                                      <Typography variant="subtitle2" sx={{ pt: 2, pb: 1, fontWeight: 'bold' }}>
                                        Ilość do zarezerwowania:
                                      </Typography>
                                      
                                      <TextField
                                        label="Ilość"
                                        type="number"
                                        value={reservationQuantity}
                                        onChange={(e) => setReservationQuantity(e.target.value)}
                                        fullWidth
                                        size="small"
                                        variant="outlined"
                                        inputProps={{ 
                                          min: 0, 
                                          max: item.availableQuantity,
                                          step: 'any'
                                        }}
                                        helperText={`Dostępne: ${item.availableQuantity} ${item.unit} • Potrzebne: ${selectedMaterial.quantity} ${selectedMaterial.unit}`}
                                      />
                                      
                                      {reservationQuantity && (
                                        <Box sx={{ mt: 1 }}>
                                          <Typography variant="body2" color="primary" fontWeight="bold">
                                            Wartość rezerwacji: {formatCurrency(
                                              parseFloat(reservationQuantity) * item.unitPrice, 
                                              item.currency
                                            )}
                                          </Typography>
                                        </Box>
                                      )}
                                    </Box>
                                  )}
                                </Box>
                                {index < poGroup.items.length - 1 && <Divider />}
                              </React.Fragment>
                            ))}
                          </List>
                        </CardContent>
                      </Collapse>
                    </Card>
                  ))}
                </Box>
              )}
            </Grid>
          )}
          

        </Grid>
      </DialogContent>
      
      <DialogActions>
        <Button onClick={onClose}>
          Anuluj
        </Button>
        <Button 
          onClick={handleCreateReservation} 
          variant="contained"
          disabled={!isFormValid()}
          startIcon={<POIcon />}
        >
          Utwórz rezerwację
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default POReservationDialog; 