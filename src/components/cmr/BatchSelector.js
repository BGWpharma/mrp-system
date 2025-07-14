import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Checkbox,
  Typography,
  Box,
  Chip,
  Alert,
  CircularProgress,
  Autocomplete,
  Grid
} from '@mui/material';
import { getItemBatches, getAllInventoryItems, getAllWarehouses, getInventoryItemByRecipeId } from '../../services/inventoryService';
import { getAllRecipes } from '../../services/recipeService';

/**
 * Komponent do wyboru partii magazynowych dla pozycji CMR
 */
const BatchSelector = ({ 
  open, 
  onClose, 
  onSelectBatches, 
  selectedBatches = [],
  itemDescription = '',
  itemMarks = '',
  itemCode = '',
  suggestedInventoryItem = null,
  matchedRecipe = null
}) => {
  const [inventoryItems, setInventoryItems] = useState([]);
  const [recipes, setRecipes] = useState([]);
  const [selectedItem, setSelectedItem] = useState(null);
  const [batches, setBatches] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [selectedBatchIds, setSelectedBatchIds] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingBatches, setLoadingBatches] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [recipeSearchResults, setRecipeSearchResults] = useState([]);

  // Ref do śledzenia czy automatyczne wyszukiwanie zostało już wykonane
  const autoSearchPerformedRef = useRef(false);

  // Funkcja znajdowania najlepszego dopasowania
  const findBestMatch = useCallback((items) => {
    if (!items || items.length === 0) return null;

    const searchTerms = [
      itemCode,           // Kod produktu ma najwyższy priorytet
      itemMarks,          // Znaki i numery
      itemDescription     // Opis
    ].filter(Boolean);

    if (searchTerms.length === 0) return null;

    // Szukaj dokładnego dopasowania w pozycjach magazynowych
    for (const term of searchTerms) {
      const exactMatch = items.find(item => 
        item.productCode?.toLowerCase() === term.toLowerCase() ||
        item.name?.toLowerCase() === term.toLowerCase() ||
        item.sku?.toLowerCase() === term.toLowerCase()
      );
      if (exactMatch) return exactMatch;
    }

    // Szukaj częściowego dopasowania w pozycjach magazynowych
    for (const term of searchTerms) {
      const partialMatch = items.find(item => {
        const searchTerm = term.toLowerCase();
        return (
          item.name?.toLowerCase().includes(searchTerm) ||
          item.productCode?.toLowerCase().includes(searchTerm) ||
          item.sku?.toLowerCase().includes(searchTerm) ||
          item.description?.toLowerCase().includes(searchTerm)
        );
      });
      if (partialMatch) return partialMatch;
    }

    // Szukaj dopasowania słów kluczowych w pozycjach magazynowych
    for (const term of searchTerms) {
      const words = term.toLowerCase().split(' ').filter(word => word.length > 2);
      const keywordMatch = items.find(item => {
        const itemText = `${item.name || ''} ${item.productCode || ''} ${item.description || ''}`.toLowerCase();
        return words.some(word => itemText.includes(word));
      });
      if (keywordMatch) return keywordMatch;
    }

    return null;
  }, [itemCode, itemMarks, itemDescription]);

  // Nowa funkcja wyszukiwania przez receptury
  const searchThroughRecipes = useCallback(async (searchTerm, autoSelect = false) => {
    if (!searchTerm || recipes.length === 0) {
      setRecipeSearchResults([]);
      return;
    }

    try {
      const matchingRecipes = recipes.filter(recipe => {
        const recipeName = recipe.name.toLowerCase();
        const search = searchTerm.toLowerCase();
        return recipeName.includes(search) || search.includes(recipeName);
      });

      const recipeResults = [];
      
      for (const recipe of matchingRecipes) {
        try {
          // Sprawdź czy receptura ma powiązaną pozycję magazynową
          const inventoryItem = await getInventoryItemByRecipeId(recipe.id);
          if (inventoryItem) {
            recipeResults.push({
              recipe: recipe,
              inventoryItem: inventoryItem,
              matchReason: `Receptura "${recipe.name}" ma powiązaną pozycję magazynową "${inventoryItem.name}"`
            });
          }
        } catch (error) {
          console.error(`Błąd podczas sprawdzania pozycji magazynowej dla receptury ${recipe.name}:`, error);
        }
      }

      setRecipeSearchResults(recipeResults);
      
      // Automatycznie wybierz tylko podczas automatycznego wyszukiwania (nie podczas wpisywania przez użytkownika)
      if (autoSelect && recipeResults.length === 1 && !autoSearchPerformedRef.current) {
        setSelectedItem(recipeResults[0].inventoryItem);
        setSearchTerm(recipeResults[0].inventoryItem.name);
        autoSearchPerformedRef.current = true;
      }
    } catch (error) {
      console.error('Błąd podczas wyszukiwania przez receptury:', error);
    }
  }, [recipes]);

  // Funkcja automatycznego wyszukiwania pozycji - stabilna referencja dzięki useCallback
  const autoSearchItem = useCallback(() => {
    // Sprawdź czy automatyczne wyszukiwanie nie zostało już wykonane
    if (autoSearchPerformedRef.current || inventoryItems.length === 0) {
      return;
    }

    // Priorytetowo użyj sugerowanej pozycji magazynowej jeśli jest dostępna
    if (suggestedInventoryItem && inventoryItems.length > 0) {
      const suggestedItem = inventoryItems.find(item => item.id === suggestedInventoryItem.id);
      if (suggestedItem) {
        setSelectedItem(suggestedItem);
        setSearchTerm(suggestedItem.name);
        autoSearchPerformedRef.current = true;
        return;
      }
    }

    if (inventoryItems.length > 0) {
      const matchedItem = findBestMatch(inventoryItems);
      if (matchedItem) {
        setSelectedItem(matchedItem);
        setSearchTerm(matchedItem.name);
        autoSearchPerformedRef.current = true;
      } else {
        // Ustaw wyszukiwanie na podstawie dostępnych danych
        const searchTerms = [itemDescription, itemMarks, itemCode].filter(Boolean);
        if (searchTerms.length > 0) {
          setSearchTerm(searchTerms[0]);
          // Spróbuj wyszukać przez receptury z automatycznym wyborem
          searchThroughRecipes(searchTerms[0], true);
          autoSearchPerformedRef.current = true;
        }
      }
    }
  }, [inventoryItems, suggestedInventoryItem, itemDescription, itemMarks, itemCode, findBestMatch, searchThroughRecipes]);

  // Reset flagi automatycznego wyszukiwania gdy dialog się otwiera
  useEffect(() => {
    if (open) {
      autoSearchPerformedRef.current = false;
      setSelectedItem(null);
      setSearchTerm('');
      setRecipeSearchResults([]);
    }
  }, [open]);

  // Ładowanie pozycji magazynowych przy otwarciu dialogu
  useEffect(() => {
    if (open) {
      loadInventoryItems();
      loadRecipes();
      loadWarehouses();
      // Ustawienie wybranych partii
      setSelectedBatchIds(selectedBatches.map(batch => batch.id) || []);
    }
  }, [open, selectedBatches]);

  // Automatyczne wyszukiwanie po załadowaniu danych
  useEffect(() => {
    if (open && inventoryItems.length > 0 && !autoSearchPerformedRef.current) {
      autoSearchItem();
    }
  }, [open, inventoryItems, autoSearchItem]);

  // Ładowanie partii po wyborze pozycji magazynowej lub załadowaniu magazynów
  useEffect(() => {
    if (selectedItem && warehouses.length > 0) {
      loadBatches(selectedItem.id);
    } else {
      setBatches([]);
    }
  }, [selectedItem, warehouses]);

  const loadInventoryItems = async () => {
    try {
      setLoading(true);
      const items = await getAllInventoryItems();
      setInventoryItems(items);
    } catch (error) {
      console.error('Błąd podczas ładowania pozycji magazynowych:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadRecipes = async () => {
    try {
      const recipesData = await getAllRecipes();
      setRecipes(recipesData);
    } catch (error) {
      console.error('Błąd podczas ładowania receptur:', error);
    }
  };

  const loadWarehouses = async () => {
    try {
      const warehousesData = await getAllWarehouses();
      setWarehouses(warehousesData);
    } catch (error) {
      console.error('Błąd podczas ładowania magazynów:', error);
    }
  };

  const loadBatches = async (itemId) => {
    try {
      setLoadingBatches(true);
      const batchesData = await getItemBatches(itemId);
      
      // Sprawdź czy wybrany produkt to gotowy produkt
      const isFinishedProduct = selectedItem && (
        selectedItem.category === 'Gotowe produkty' ||
        selectedItem.category === 'Produkty gotowe' ||
        selectedItem.type === 'finished' ||
        selectedItem.id?.startsWith('FIN') ||
        selectedItem.id?.startsWith('BWS')
      );
      
      // Filtruj partie w zależności od typu produktu
      const availableBatches = isFinishedProduct 
        ? batchesData // Dla gotowych produktów - pokaż wszystkie partie (w tym puste)
        : batchesData.filter(batch => batch.quantity > 0); // Dla innych produktów - tylko niepuste
      
      // Dodaj informacje o lokalizacji magazynu do każdej partii
      const enhancedBatches = availableBatches.map(batch => {
        const warehouse = warehouses.find(w => w.id === batch.warehouseId);
        return {
          ...batch,
          warehouseName: warehouse?.name || 'Magazyn podstawowy',
          warehouseAddress: warehouse?.address || '',
        };
      });
      
      setBatches(enhancedBatches);
    } catch (error) {
      console.error('Błąd podczas ładowania partii:', error);
      setBatches([]);
    } finally {
      setLoadingBatches(false);
    }
  };

  const handleBatchToggle = (batchId) => {
    setSelectedBatchIds(prev => {
      if (prev.includes(batchId)) {
        return prev.filter(id => id !== batchId);
      } else {
        return [...prev, batchId];
      }
    });
  };

  const handleSelectAll = () => {
    if (selectedBatchIds.length === batches.length) {
      setSelectedBatchIds([]);
    } else {
      setSelectedBatchIds(batches.map(batch => batch.id));
    }
  };

  const handleConfirm = () => {
    const selectedBatchesData = batches.filter(batch => 
      selectedBatchIds.includes(batch.id)
    ).map(batch => ({
      // Podstawowe dane partii
      id: batch.id || '',
      batchNumber: batch.batchNumber || batch.lotNumber || '',
      lotNumber: batch.lotNumber || batch.batchNumber || '',
      
      // Dane produktu
      itemId: batch.itemId || selectedItem?.id || '',
      itemName: batch.itemName || selectedItem?.name || '',
      
      // Kod kreskowy z pozycji magazynowej
      barcode: selectedItem?.barcode || batch.barcode || '',
      
      // Ilość i jednostka
      quantity: batch.quantity || 0,
      unit: batch.unit || selectedItem?.unit || 'szt.',
      
      // Daty
      expiryDate: batch.expiryDate || null,
      
      // Magazyn
      warehouseId: batch.warehouseId || '',
      warehouseName: batch.warehouseName || '',
      
      // Dodatkowe informacje
      status: batch.status || 'active'
    }));
    
    onSelectBatches(selectedBatchesData);
    onClose();
  };

  const handleCancel = () => {
    onClose();
  };

  const formatDate = (date) => {
    if (!date) return '-';
    if (date.toDate) {
      return date.toDate().toLocaleDateString('pl-PL');
    }
    return new Date(date).toLocaleDateString('pl-PL');
  };

  const getBatchStatusChip = (batch) => {
    const today = new Date();
    const expiryDate = batch.expiryDate?.toDate ? batch.expiryDate.toDate() : new Date(batch.expiryDate);
    
    if (!batch.expiryDate || expiryDate.getFullYear() <= 1970) {
      return <Chip label="Brak daty" size="small" color="default" />;
    }
    
    const daysToExpiry = Math.ceil((expiryDate - today) / (1000 * 60 * 60 * 24));
    
    if (daysToExpiry < 0) {
      return <Chip label="Przeterminowana" size="small" color="error" />;
    } else if (daysToExpiry <= 30) {
      return <Chip label={`${daysToExpiry} dni`} size="small" color="warning" />;
    } else {
      return <Chip label="Aktualna" size="small" color="success" />;
    }
  };

  return (
    <Dialog 
      open={open} 
      onClose={onClose} 
      maxWidth="lg" 
      fullWidth
      PaperProps={{
        sx: { height: '80vh' }
      }}
    >
      <DialogTitle sx={{ mt: 1}}>
        Wybór partii magazynowych
        {selectedItem && (
          <Typography variant="subtitle2" color="text.secondary" sx={{ mt: 1}}>
            Produkt: {selectedItem.name}
          </Typography>
        )}

      </DialogTitle>
      
      <DialogContent>
        <Box sx={{ mb: 3 }}>
          <Grid container spacing={2}>
            <Grid item xs={12}>
              {loading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}>
                  <CircularProgress />
                </Box>
              ) : (
                <Autocomplete
                  options={inventoryItems}
                  getOptionLabel={(option) => `${option.name} (${option.quantity} ${option.unit || 'szt.'})`}
                  value={selectedItem}
                  onChange={(event, newValue) => setSelectedItem(newValue)}
                  inputValue={searchTerm}
                  onInputChange={(event, newInputValue) => {
                    setSearchTerm(newInputValue);
                    // Resetuj flagę automatycznego wyszukiwania gdy użytkownik aktywnie wpisuje
                    if (event && event.type === 'input') {
                      autoSearchPerformedRef.current = true;
                    }
                    // Wyszukaj przez receptury gdy użytkownik wprowadza tekst
                    if (newInputValue && newInputValue.length > 2 && event && event.type === 'input') {
                      searchThroughRecipes(newInputValue);
                    } else if (!newInputValue) {
                      setRecipeSearchResults([]);
                    }
                  }}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label="Wybierz produkt z magazynu"
                      placeholder="Wpisz nazwę produktu..."
                      fullWidth
                    />
                  )}
                  noOptionsText="Brak produktów"
                  loading={loading}
                />
              )}
            </Grid>
          </Grid>
        </Box>

        {/* Wyniki wyszukiwania przez receptury */}
        {recipeSearchResults.length > 0 && !selectedItem && (
          <Alert severity="info" sx={{ mb: 2 }}>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              🔍 Znalezione pozycje magazynowe na podstawie receptur:
            </Typography>
            {recipeSearchResults.map((result, index) => (
              <Box key={index} sx={{ mb: 1 }}>
                <Button
                  variant="outlined"
                  size="small"
                  onClick={() => {
                    setSelectedItem(result.inventoryItem);
                    setSearchTerm(result.inventoryItem.name);
                  }}
                  sx={{ mr: 1, mb: 0.5 }}
                >
                  Wybierz: {result.inventoryItem.name}
                </Button>
                <Typography variant="caption" color="text.secondary">
                  {result.matchReason}
                </Typography>
              </Box>
            ))}
          </Alert>
        )}

        {/* Informacja gdy nie znaleziono automatycznego dopasowania */}
        {(itemDescription || itemMarks || itemCode) && !selectedItem && !loading && recipeSearchResults.length === 0 && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            ⚠️ Nie znaleziono automatycznego dopasowania dla pozycji CMR. Sprawdzono również receptury bez powodzenia. Wybierz produkt ręcznie z listy powyżej.
            <br />
            <Typography variant="caption">
              Szukano dla: 
              {itemCode && ` Kod: "${itemCode}"`}
              {itemMarks && ` Znaki: "${itemMarks}"`}
              {itemDescription && ` Opis: "${itemDescription}"`}
            </Typography>
          </Alert>
        )}

        {selectedItem && (
          <Box>
            {/* Informacja o automatycznym dopasowaniu */}
            {suggestedInventoryItem && matchedRecipe && selectedItem.id === suggestedInventoryItem.id && (
              <Alert severity="success" sx={{ mb: 2 }}>
                🎯 Automatycznie dopasowano pozycję magazynową "{selectedItem.name}" na podstawie receptury "{matchedRecipe.name}"
              </Alert>
            )}
            {/* Informacja o automatycznym dopasowaniu z danych CMR (gdy nie ma receptury) */}
            {(itemDescription || itemMarks || itemCode) && !suggestedInventoryItem && (
              <Alert severity="success" sx={{ mb: 2 }}>
                ✅ Automatycznie dopasowano produkt "{selectedItem.name}" na podstawie danych z pozycji CMR
              </Alert>
            )}
            
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Box>
                <Typography variant="h6">
                  Dostępne partie ({batches.length})
                </Typography>
                {selectedItem && (
                  selectedItem.category === 'Gotowe produkty' ||
                  selectedItem.category === 'Produkty gotowe' ||
                  selectedItem.type === 'finished' ||
                  selectedItem.id?.startsWith('FIN') ||
                  selectedItem.id?.startsWith('BWS')
                ) && (
                  <Typography variant="caption" color="info.main" sx={{ display: 'block' }}>
                    💡 Dla gotowych produktów pokazano wszystkie partie (w tym puste)
                  </Typography>
                )}
              </Box>
              {batches.length > 0 && (
                <Button
                  variant="outlined"
                  size="small"
                  onClick={handleSelectAll}
                >
                  {selectedBatchIds.length === batches.length ? 'Odznacz wszystkie' : 'Zaznacz wszystkie'}
                </Button>
              )}
            </Box>

            {loadingBatches ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
                <CircularProgress />
              </Box>
            ) : batches.length === 0 ? (
              <Alert severity="info">
                Brak dostępnych partii dla wybranego produktu
              </Alert>
            ) : (
              <TableContainer component={Paper} sx={{ maxHeight: 400 }}>
                <Table stickyHeader size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell padding="checkbox">
                        <Checkbox
                          indeterminate={selectedBatchIds.length > 0 && selectedBatchIds.length < batches.length}
                          checked={batches.length > 0 && selectedBatchIds.length === batches.length}
                          onChange={handleSelectAll}
                        />
                      </TableCell>
                      <TableCell>Numer partii/LOT</TableCell>
                      <TableCell>Ilość</TableCell>
                      <TableCell>Data ważności</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell>Magazyn</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {batches.map((batch) => (
                      <TableRow 
                        key={batch.id}
                        hover
                        onClick={(event) => {
                          // Pozwól checkbox'owi obsłużyć własne kliknięcia
                          if (event.target.type !== 'checkbox') {
                            handleBatchToggle(batch.id);
                          }
                        }}
                        sx={{ cursor: 'pointer' }}
                      >
                        <TableCell padding="checkbox" onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={selectedBatchIds.includes(batch.id)}
                            onChange={(e) => {
                              e.stopPropagation();
                              handleBatchToggle(batch.id);
                            }}
                          />
                        </TableCell>
                        <TableCell>
                          {batch.batchNumber || batch.lotNumber || 'Bez numeru'}
                        </TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            {batch.quantity} {selectedItem.unit || 'szt.'}
                            {batch.quantity <= 0 && (
                              <Chip 
                                label="Pusta" 
                                size="small" 
                                color="warning"
                                variant="outlined"
                              />
                            )}
                          </Box>
                        </TableCell>
                        <TableCell>
                          {formatDate(batch.expiryDate)}
                        </TableCell>
                        <TableCell>
                          {getBatchStatusChip(batch)}
                        </TableCell>
                        <TableCell>
                          {batch.warehouseName || '-'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Box>
        )}

        {selectedBatchIds.length > 0 && (
          <Box sx={{ mt: 2 }}>
            <Alert severity="success">
              Wybrano {selectedBatchIds.length} {selectedBatchIds.length === 1 ? 'partię' : 'partii'}
            </Alert>
          </Box>
        )}
      </DialogContent>
      
      <DialogActions>
        <Button onClick={handleCancel}>
          Anuluj
        </Button>
        <Button 
          onClick={handleConfirm} 
          variant="contained"
          disabled={selectedBatchIds.length === 0}
        >
          Potwierdź wybór ({selectedBatchIds.length})
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default BatchSelector; 