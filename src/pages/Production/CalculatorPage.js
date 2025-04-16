import React, { useState, useEffect } from 'react';
import {
  Container,
  Paper,
  Typography,
  Grid,
  TextField,
  Button,
  Box,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  CircularProgress,
  Alert,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Divider,
  Tooltip,
  IconButton
} from '@mui/material';
import {
  Add as AddIcon,
  Remove as RemoveIcon,
  Download as DownloadIcon,
  Calculate as CalculateIcon,
  Info as InfoIcon,
  RestartAlt as ResetIcon
} from '@mui/icons-material';
import { useNotification } from '../../hooks/useNotification';
import { getAllRecipes } from '../../services/recipeService';

const CalculatorPage = () => {
  const { showSuccess, showError, showInfo } = useNotification();
  
  // Główne stany kalkulatora
  const [mixerVolume, setMixerVolume] = useState(100);
  const [targetAmount, setTargetAmount] = useState(1000);
  const [selectedRecipeId, setSelectedRecipeId] = useState('');
  const [usePieces, setUsePieces] = useState(false);
  
  // Stany pomocnicze
  const [recipes, setRecipes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [calculationResult, setCalculationResult] = useState(null);
  const [mixings, setMixings] = useState([]);
  
  // Pobranie wszystkich receptur przy ładowaniu komponentu
  useEffect(() => {
    const fetchRecipes = async () => {
      try {
        setLoading(true);
        const recipesData = await getAllRecipes();
        setRecipes(recipesData);
      } catch (error) {
        console.error('Błąd podczas pobierania receptur:', error);
        showError('Nie udało się pobrać receptur');
      } finally {
        setLoading(false);
      }
    };
    
    fetchRecipes();
  }, [showError]);
  
  // Sprawdzenie czy wybrana receptura i jej dane są dostępne
  const selectedRecipe = recipes.find(recipe => recipe.id === selectedRecipeId);
  
  // Funkcja do obliczania planu mieszań
  const calculateMixings = () => {
    if (!selectedRecipe) {
      showError('Wybierz recepturę przed obliczeniem');
      return;
    }
    
    if (mixerVolume <= 0) {
      showError('Objętość mieszalnika musi być większa od zera');
      return;
    }
    
    if (targetAmount <= 0) {
      showError('Docelowa ilość musi być większa od zera');
      return;
    }
    
    try {
      let mixingPlan = [];
      
      // Sprawdź, czy używamy trybu sztuk czy kilogramów
      // true = sztuki, false = kilogramy
      console.log(`Tryb kalkulacji: ${usePieces ? 'Sztuki' : 'Kilogramy'}`);
      
      // Najpierw obliczamy przybliżoną wagę jednej sztuki produktu na podstawie składników
      // (tylko gdy używamy trybu sztuk)
      if (usePieces) {
        // Pobierz składniki dla 1 sztuki
        const testIngredients = calculateIngredientsForBatch(1, selectedRecipe, true);
        
        // Oblicz sumę wag składników na 1 sztukę
        const singlePieceWeight = testIngredients
          .filter(ing => ing.unit === 'kg')
          .reduce((sum, ing) => sum + ing.quantity, 0);
        
        console.log(`Waga jednej sztuki produktu: ${singlePieceWeight.toFixed(2)} kg`);
        
        // Całkowita waga potrzebna do produkcji wszystkich sztuk
        const totalWeight = singlePieceWeight * targetAmount;
        console.log(`Całkowita waga do wyprodukowania ${targetAmount} szt.: ${totalWeight.toFixed(2)} kg`);
        
        // Obliczenie liczby pełnych mieszań na podstawie całkowitej wagi
        const fullMixingsCount = Math.floor(totalWeight / mixerVolume);
        
        // Obliczenie wagi pozostałej po pełnych mieszaniach
        const remainingWeight = totalWeight % mixerVolume;
        
        // Obliczenie liczby sztuk w każdym pełnym mieszaniu
        const piecesPerFullMixing = Math.floor((mixerVolume / totalWeight) * targetAmount);
        
        // Liczba sztuk w ostatnim, niepełnym mieszaniu
        const piecesInLastMixing = targetAmount - (piecesPerFullMixing * fullMixingsCount);
        
        console.log(`Liczba pełnych mieszań: ${fullMixingsCount}, po ${piecesPerFullMixing} szt. w każdym`);
        if (piecesInLastMixing > 0) {
          console.log(`Ostatnie mieszanie: ${piecesInLastMixing} szt. (ok. ${remainingWeight.toFixed(2)} kg)`);
        }
        
        // Dodanie pełnych mieszań
        for (let i = 0; i < fullMixingsCount; i++) {
          mixingPlan.push({
            mixingNumber: i + 1,
            volumeToMix: mixerVolume,
            calculatedWeight: mixerVolume,
            piecesCount: piecesPerFullMixing,
            recipeName: selectedRecipe.name,
            ingredients: calculateIngredientsForBatch(piecesPerFullMixing, selectedRecipe, true)
          });
        }
        
        // Dodanie mieszania dla pozostałych sztuk, jeśli istnieją
        if (piecesInLastMixing > 0) {
          mixingPlan.push({
            mixingNumber: fullMixingsCount + 1,
            volumeToMix: remainingWeight,
            calculatedWeight: remainingWeight,
            piecesCount: piecesInLastMixing,
            recipeName: selectedRecipe.name,
            ingredients: calculateIngredientsForBatch(piecesInLastMixing, selectedRecipe, true)
          });
        }
        
        // Ustawienie wyniku obliczenia
        setCalculationResult({
          targetAmount,
          mixerVolume,
          fullMixingsCount,
          remainingWeight,
          singlePieceWeight, 
          totalWeight,
          piecesPerFullMixing,
          piecesInLastMixing,
          totalMixings: remainingWeight > 0 ? fullMixingsCount + 1 : fullMixingsCount,
          recipeName: selectedRecipe.name,
          isProductPieces: usePieces
        });
      } else {
        // Tradycyjny tryb wg objętości (kg)
        // Obliczenie liczby pełnych mieszań
        const fullMixingsCount = Math.floor(targetAmount / mixerVolume);
        console.log(`Tryb kilogramy: Docelowa ilość ${targetAmount} kg, objętość mieszalnika ${mixerVolume} kg`);
        console.log(`Liczba pełnych mieszań: ${fullMixingsCount}, każde po ${mixerVolume} kg`);
        
        // Obliczenie ilości pozostałej po pełnych mieszaniach
        const remainingAmount = targetAmount % mixerVolume;
        if (remainingAmount > 0) {
          console.log(`Pozostała ilość: ${remainingAmount} kg`);
        }
        
        // Dodanie pełnych mieszań
        for (let i = 0; i < fullMixingsCount; i++) {
          const ingredients = calculateIngredientsForBatch(mixerVolume, selectedRecipe, false);
          mixingPlan.push({
            mixingNumber: i + 1,
            volumeToMix: mixerVolume,
            calculatedWeight: mixerVolume,
            recipeName: selectedRecipe.name,
            ingredients: ingredients
          });
        }
        
        // Dodanie mieszania dla pozostałej ilości, jeśli istnieje
        if (remainingAmount > 0) {
          const ingredients = calculateIngredientsForBatch(remainingAmount, selectedRecipe, false);
          mixingPlan.push({
            mixingNumber: fullMixingsCount + 1,
            volumeToMix: remainingAmount,
            calculatedWeight: remainingAmount,
            recipeName: selectedRecipe.name,
            ingredients: ingredients
          });
        }
        
        // Ustawienie wyniku obliczenia
        setCalculationResult({
          targetAmount,
          mixerVolume,
          fullMixingsCount,
          remainingAmount,
          totalMixings: remainingAmount > 0 ? fullMixingsCount + 1 : fullMixingsCount,
          recipeName: selectedRecipe.name,
          isProductPieces: usePieces
        });
      }
      
      setMixings(mixingPlan);
      
      // Diagnostyka - sprawdź sumy wag dla każdego mieszania
      console.log('Szczegóły obliczonych mieszań:');
      let totalCalculatedWeight = 0;
      mixingPlan.forEach(mixing => {
        // Sprawdź czy mixing.ingredients istnieje i ma poprawną strukturę
        if (!mixing.ingredients || !Array.isArray(mixing.ingredients)) {
          console.warn(`Mieszanie ${mixing.mixingNumber} ma nieprawidłową strukturę składników`);
          mixing.totalIngredientsWeight = 0;
          return;
        }
        
        const totalWeight = mixing.ingredients
          .filter(ing => ing.unit === 'kg')
          .reduce((sum, ing) => {
            // Upewniamy się, że wartość jest liczbą
            const quantity = parseFloat(ing.quantity || 0);
            return isNaN(quantity) ? sum : sum + quantity;
          }, 0);
        
        totalCalculatedWeight += totalWeight;
        
        console.log(`Mieszanie ${mixing.mixingNumber}, objętość: ${mixing.volumeToMix} kg, suma składników: ${totalWeight.toFixed(2)} kg`);
        
        // Zapisz sumę wag składników w mieszaniu (do późniejszego wyświetlenia)
        mixing.totalIngredientsWeight = totalWeight;
      });
      
      console.log(`Całkowita suma wag wszystkich mieszań: ${totalCalculatedWeight.toFixed(2)} kg`);
      
      showSuccess('Plan mieszań obliczony pomyślnie');
    } catch (error) {
      console.error('Błąd podczas obliczania planu mieszań:', error);
      showError('Nie udało się obliczyć planu mieszań');
    }
  };
  
  // Funkcja pomocnicza do przeliczania składników dla danej partii
  const calculateIngredientsForBatch = (batchSize, recipe, useProductPieces = false) => {
    if (!recipe || !recipe.ingredients || recipe.ingredients.length === 0) {
      return [];
    }
    
    console.log(`Wywołanie calculateIngredientsForBatch dla batchSize=${batchSize}, useProductPieces=${useProductPieces}`);
    
    // Pobierz wydajność receptury (ilość produktu z jednej pełnej realizacji receptury)
    const recipeYield = recipe.yield?.quantity || 1;
    console.log(`Wydajność receptury (yield): ${recipeYield}`);
    
    // Przefiltruj składniki, pomijając te z kategorią "Opakowania" lub 
    // których nazwy wskazują na opakowania (zawierają "PACK")
    const filteredIngredients = recipe.ingredients.filter(ingredient => {
      // Sprawdź różne możliwe lokalizacje kategorii opakowania
      const categoryFromIngredient = ingredient.category;
      const categoryFromItem = ingredient.inventoryItem?.category;
      const categoryDirectly = ingredient.inventoryItemCategory;
      
      // Połącz wszystkie możliwe źródła kategorii
      const effectiveCategory = categoryFromIngredient || categoryFromItem || categoryDirectly;
      
      // Sprawdź, czy składnik jest opakowaniem na podstawie kategorii
      const isPackaging = effectiveCategory === 'Opakowania';
      
      // Dodatkowe sprawdzenie dla nazw zaczynających się od "PACK"
      const isPackagingByName = ingredient.name && 
        (ingredient.name.startsWith('PACK') || ingredient.name.includes('PACK'));
      
      // Zatrzymaj tylko nieopakowania
      return !isPackaging && !isPackagingByName;
    });
    
    // Oblicz współczynnik skalowania dla danej wielkości partii
    let scaleFactor;
    
    if (useProductPieces) {
      // Jeśli używamy sztuk, to batchSize to bezpośrednio liczba sztuk do wyprodukowania
      scaleFactor = batchSize;
    } else {
      // W trybie wagi (kg) obliczamy proporcję docelowej wagi do sumy wag składników
      // Najpierw obliczamy sumę wag składników w oryginalnej recepturze
      const originalTotalWeight = filteredIngredients
        .filter(ing => ing.unit === 'kg')
        .reduce((sum, ing) => {
          // Upewniamy się, że suma i wartość składnika są liczbami
          const quantity = parseFloat(ing.quantity || 0);
          return sum + quantity;
        }, 0);
      
      console.log(`Suma wag składników w oryginalnej recepturze: ${originalTotalWeight.toFixed(5)} kg`);
      
      if (originalTotalWeight <= 0) {
        console.warn('Ostrzeżenie: Suma wag składników w recepturze wynosi 0 kg');
        // Używamy współczynnika równego objętości mieszania (dla bezpieczeństwa)
        scaleFactor = batchSize;
      } else {
        // Oblicz współczynnik, aby suma wag równała się docelowej objętości
        scaleFactor = batchSize / originalTotalWeight;
        console.log(`Tryb wagi: współczynnik skalowania: ${scaleFactor.toFixed(4)}`);
      }
    }
    
    console.log(`Obliczony współczynnik skalowania: ${scaleFactor}`);
    
    // Przelicz ilości składników
    const calculatedIngredients = filteredIngredients.map(ingredient => {
      const originalQuantity = parseFloat(ingredient.quantity || 0);
      // Usuwam zaokrąglenie do 2 miejsc po przecinku, zachowuję pełną precyzję obliczeń
      let calculatedQuantity = originalQuantity * scaleFactor;
      
      // Sprawdzenie czy wartość nie jest NaN
      if (isNaN(calculatedQuantity)) {
        console.warn(`Uwaga: Nieprawidłowa wartość dla składnika ${ingredient.name}. Używam wartości 0.`);
        calculatedQuantity = 0;
      }
      
      console.log(`Składnik: ${ingredient.name}, ilość oryginalna: ${originalQuantity}, współczynnik: ${scaleFactor}, ilość przeliczona: ${calculatedQuantity}`);
      
      return {
        id: ingredient.id,
        name: ingredient.name,
        quantity: calculatedQuantity, // Zachowujemy pełną precyzję
        unit: ingredient.unit
      };
    });
    
    // Oblicz sumę wszystkich składników (tylko dla składników z jednostką 'kg')
    const totalWeight = calculatedIngredients
      .filter(ing => ing.unit === 'kg')
      .reduce((sum, ing) => sum + ing.quantity, 0);
    
    console.log(`Sumaryczna waga składników w kg: ${totalWeight}, oczekiwana objętość mieszania: ${batchSize}`);
    
    // Dla trybu wagi, jeśli suma wag różni się od oczekiwanej objętości,
    // dostosuj proporcjonalnie wszystkie składniki
    if (!useProductPieces && Math.abs(totalWeight - batchSize) > 0.001) { // Zwiększona precyzja
      console.log(`Dostosowanie składników aby osiągnąć dokładną objętość ${batchSize} kg`);
      const adjustmentFactor = batchSize / totalWeight;
      
      // Zastosuj korektę do wszystkich składników
      calculatedIngredients.forEach(ing => {
        if (ing.unit === 'kg') {
          ing.quantity = ing.quantity * adjustmentFactor; // Zachowujemy pełną precyzję
        }
      });
      
      // Sprawdź ponownie sumę po korekcie
      const adjustedTotalWeight = calculatedIngredients
        .filter(ing => ing.unit === 'kg')
        .reduce((sum, ing) => sum + ing.quantity, 0);
      
      console.log(`Suma wag po korekcie: ${adjustedTotalWeight} kg`);
    }
    
    // Zaokrąglanie do wyświetlania dopiero na końcu procesu obliczeń
    calculatedIngredients.forEach(ing => {
      // Używamy właściwości displayQuantity do wyświetlania zaokrąglonych wartości
      ing.displayQuantity = ing.quantity.toFixed(4);
    });

    return calculatedIngredients;
  };
  
  // Generowanie pliku CSV z planem mieszań
  const generateCSV = () => {
    if (!mixings || mixings.length === 0) {
      showError('Brak planu mieszań do wyeksportowania');
      return;
    }
    
    try {
      // Przygotowanie nagłówków CSV
      let csvContent = usePieces ? 
        'Objętość;Liczba sztuk;Nazwa produktu;Składnik;Ilość;Jednostka;Sprawdzone;Wstawione w mieszalnik;Zrobione\n' : 
        'Objętość;Nazwa produktu;Składnik;Ilość;Jednostka;Sprawdzone;Wstawione w mieszalnik;Zrobione\n';
      
      // Dodanie wierszy dla każdego mieszania i jego składników
      mixings.forEach(mixing => {
        // Dodaj wyróżniony nagłówek dla każdego mieszania
        const headerColumns = usePieces ? 9 : 8; // Zwiększono liczbę kolumn
        csvContent += `"Mieszanie nr. ${mixing.mixingNumber}"${';'.repeat(headerColumns - 1)}\n`;
        
        // Dodaj wiersz z informacją o objętości mieszania i liczbie sztuk (jeśli w trybie sztuk)
        const formattedVolumeToMix = `="${Number(mixing.volumeToMix).toFixed(4)}"`;
        
        // Używamy przefiltrowanych składników bez opakowań
        mixing.ingredients.forEach(ingredient => {
          // Sprawdzenie czy składnik nie jest opakowaniem (dodatkowo zabezpieczenie)
          if (ingredient.name && !ingredient.name.includes('PACK')) {
            // Formatujemy liczby, sprawdzając czy nie są NaN
            let formattedQuantity;
            if (typeof ingredient.quantity === 'number' && !isNaN(ingredient.quantity)) {
              formattedQuantity = `="${ingredient.quantity.toFixed(4)}"`; 
            } else {
              formattedQuantity = '="0.0000"';
            }
            
            if (usePieces) {
              // Format dla trybu sztuk produktu
              const formattedPiecesCount = `="${mixing.piecesCount || 0}"`;
              // Dodajemy puste kolumny na końcu
              csvContent += `${formattedVolumeToMix};${formattedPiecesCount};${mixing.recipeName};${ingredient.name};${formattedQuantity};${ingredient.unit};;;\n`;
            } else {
              // Format dla trybu kilogramów
              // Dodajemy puste kolumny na końcu
              csvContent += `${formattedVolumeToMix};${mixing.recipeName};${ingredient.name};${formattedQuantity};${ingredient.unit};;;\n`;
            }
          }
        });
        
        // Dodaj pustą linię po każdym mieszaniu dla lepszej czytelności
        csvContent += `${';'.repeat(headerColumns - 1)}\n`;
      });
      
      // Dodaj podsumowanie na końcu pliku CSV
      if (calculationResult) {
        csvContent += `${';'.repeat(usePieces ? 5 : 4)}\n`;
        
        if (usePieces) {
          // Podsumowanie dla trybu sztuk
          csvContent += `"Podsumowanie:";;;;;
"Całkowita liczba sztuk:";="${calculationResult.targetAmount}";;;;
"Waga jednej sztuki:";="${calculationResult.singlePieceWeight?.toFixed(4)}";kg;;;
"Całkowita waga:";="${calculationResult.totalWeight?.toFixed(4)}";kg;;;
"Liczba mieszań:";="${calculationResult.totalMixings}";;;;
${';'.repeat(5)}\n`;
        } else {
          // Podsumowanie dla trybu kilogramów
          csvContent += `"Podsumowanie:";;;;;
"Docelowa ilość:";="${calculationResult.targetAmount}";kg;;;
"Liczba mieszań:";="${calculationResult.totalMixings}";;;;
${';'.repeat(4)}\n`;
        }
      }
      
      // Utworzenie i pobranie pliku CSV
      const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      
      const fileName = `plan_mieszan_${selectedRecipe.name.replace(/\s+/g, '_')}_${usePieces ? 'sztuki' : 'kg'}_${new Date().toISOString().slice(0, 10)}.csv`;
      link.setAttribute('href', url);
      link.setAttribute('download', fileName);
      link.style.visibility = 'hidden';
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      showSuccess('Plan mieszań wyeksportowany do pliku CSV');
    } catch (error) {
      console.error('Błąd podczas generowania pliku CSV:', error);
      showError('Nie udało się wygenerować pliku CSV');
    }
  };
  
  // Resetowanie kalkulatora
  const resetCalculator = () => {
    setMixerVolume(100);
    setTargetAmount(1000);
    setSelectedRecipeId('');
    setCalculationResult(null);
    setMixings([]);
    setUsePieces(false);
    showInfo('Kalkulator został zresetowany');
  };

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Paper sx={{ p: 3, mb: 4, borderRadius: 2 }}>
        <Typography variant="h5" gutterBottom>
          Kalkulator mieszań produkcyjnych
        </Typography>
        <Typography variant="body2" color="text.secondary" paragraph>
          Narzędzie pomaga w planowaniu mieszań produkcyjnych, obliczając optymalną liczbę mieszań oraz ilości składników dla każdego mieszania.
        </Typography>
        
        <Alert severity="info" sx={{ mb: 3 }}>
          Uwaga: Kalkulator automatycznie pomija składniki z kategorii "Opakowania" oraz te, których nazwa zawiera "PACK" podczas obliczeń.
        </Alert>
        
        <Divider sx={{ my: 3 }} />
        
        <Grid container spacing={3}>
          {/* Wybór objętości mieszalnika */}
          <Grid item xs={12} md={4}>
            <TextField
              fullWidth
              type="number"
              label="Objętość mieszalnika (max weight per mixing)"
              value={mixerVolume}
              onChange={(e) => setMixerVolume(Number(e.target.value))}
              InputProps={{
                endAdornment: (
                  <Typography variant="caption" color="text.secondary">
                    kg
                  </Typography>
                )
              }}
              variant="outlined"
            />
          </Grid>
          
          {/* Podanie docelowej ilości produktu */}
          <Grid item xs={12} md={4}>
            <TextField
              fullWidth
              type="number"
              label={usePieces ? "Docelowa ilość produktu (sztuki)" : "Docelowa ilość produktu końcowego"}
              value={targetAmount}
              onChange={(e) => setTargetAmount(Number(e.target.value))}
              InputProps={{
                endAdornment: (
                  <Typography variant="caption" color="text.secondary">
                    {usePieces ? "szt." : "kg"}
                  </Typography>
                )
              }}
              variant="outlined"
            />
          </Grid>
          
          {/* Przełącznik trybu kg/sztuki */}
          <Grid item xs={12} md={4}>
            <FormControl fullWidth>
              <InputLabel>Tryb kalkulacji</InputLabel>
              <Select
                value={usePieces}
                onChange={(e) => setUsePieces(e.target.value)}
                label="Tryb kalkulacji"
              >
                <MenuItem value={false}>Kilogramy (wg wagi)</MenuItem>
                <MenuItem value={true}>Sztuki produktu</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          
          {/* Wybór receptury */}
          <Grid item xs={12} md={4}>
            <FormControl fullWidth>
              <InputLabel>Wybierz produkt (recepturę)</InputLabel>
              <Select
                value={selectedRecipeId}
                onChange={(e) => setSelectedRecipeId(e.target.value)}
                label="Wybierz produkt (recepturę)"
                disabled={loading}
              >
                {recipes.map((recipe) => (
                  <MenuItem key={recipe.id} value={recipe.id}>
                    {recipe.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          
          {/* Przyciski akcji */}
          <Grid item xs={12}>
            <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
              <Button
                variant="outlined"
                color="secondary"
                onClick={resetCalculator}
                startIcon={<ResetIcon />}
              >
                Resetuj
              </Button>
              <Button
                variant="contained"
                onClick={calculateMixings}
                startIcon={<CalculateIcon />}
                disabled={!selectedRecipeId || mixerVolume <= 0 || targetAmount <= 0}
              >
                Oblicz plan mieszań
              </Button>
            </Box>
          </Grid>
        </Grid>
      </Paper>
      
      {/* Wyświetlanie wyników obliczeń */}
      {calculationResult && (
        <Paper sx={{ p: 3, mb: 4, borderRadius: 2 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h6">
              Wynik obliczenia planu mieszań
            </Typography>
            <Button
              variant="contained"
              color="primary"
              startIcon={<DownloadIcon />}
              onClick={generateCSV}
            >
              Eksportuj do CSV
            </Button>
          </Box>
          
          <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid item xs={6} md={3}>
              <Paper sx={{ p: 2, textAlign: 'center', backgroundColor: '#f5f5f5' }}>
                <Typography variant="body2" color="text.secondary">
                  Produkt
                </Typography>
                <Typography variant="h6">
                  {calculationResult.recipeName}
                </Typography>
              </Paper>
            </Grid>
            <Grid item xs={6} md={3}>
              <Paper sx={{ p: 2, textAlign: 'center', backgroundColor: '#f5f5f5' }}>
                <Typography variant="body2" color="text.secondary">
                  Docelowa ilość
                </Typography>
                <Typography variant="h6">
                  {calculationResult.targetAmount} {usePieces ? "szt." : "kg"}
                </Typography>
              </Paper>
            </Grid>
            <Grid item xs={6} md={3}>
              <Paper sx={{ p: 2, textAlign: 'center', backgroundColor: '#f5f5f5' }}>
                <Typography variant="body2" color="text.secondary">
                  Objętość mieszalnika
                </Typography>
                <Typography variant="h6">
                  {calculationResult.mixerVolume} kg
                </Typography>
              </Paper>
            </Grid>
            <Grid item xs={6} md={3}>
              <Paper sx={{ p: 2, textAlign: 'center', backgroundColor: '#f5f5f5' }}>
                <Typography variant="body2" color="text.secondary">
                  Liczba mieszań
                </Typography>
                <Typography variant="h6">
                  {calculationResult.totalMixings}
                </Typography>
              </Paper>
            </Grid>
          </Grid>
          
          <Typography variant="subtitle1" gutterBottom>
            Szczegółowy plan mieszań:
          </Typography>
          
          <TableContainer component={Paper} sx={{ maxHeight: 440, mb: 2 }}>
            <Table stickyHeader size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Nr mieszania</TableCell>
                  <TableCell>Objętość</TableCell>
                  {usePieces && <TableCell>Liczba sztuk</TableCell>}
                  <TableCell>Składnik</TableCell>
                  <TableCell align="right">Ilość</TableCell>
                  <TableCell>Jednostka</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {mixings.map((mixing) => (
                  mixing.ingredients.map((ingredient, ingredientIndex) => (
                    <TableRow key={`ingredient-${ingredientIndex}`}>
                      {ingredientIndex === 0 && (
                        <>
                          <TableCell rowSpan={mixing.ingredients.length}>
                            {mixing.mixingNumber}
                          </TableCell>
                          <TableCell rowSpan={mixing.ingredients.length}>
                            {mixing.volumeToMix.toFixed(4)} kg
                            {/* Dodajemy informację o rzeczywistej wadze składników */}
                            <Typography variant="caption" display="block" color="text.secondary">
                              (suma składników: {mixing.totalIngredientsWeight.toFixed(4)} kg)
                            </Typography>
                          </TableCell>
                          {usePieces && (
                            <TableCell rowSpan={mixing.ingredients.length}>
                              {mixing.piecesCount}
                            </TableCell>
                          )}
                        </>
                      )}
                      <TableCell>{ingredient.name}</TableCell>
                      <TableCell align="right">{ingredient.quantity.toFixed(4)}</TableCell>
                      <TableCell>{ingredient.unit}</TableCell>
                    </TableRow>
                  ))
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          
          <Alert severity="info" sx={{ mt: 2 }}>
            {calculationResult.isProductPieces ? (
              <>
                Wygenerowano plan {calculationResult.totalMixings} mieszań dla {calculationResult.targetAmount} sztuk produktu 
                (waga 1 szt. ≈ {calculationResult.singlePieceWeight?.toFixed(4)} kg, łączna waga {calculationResult.totalWeight?.toFixed(4)} kg).
                {calculationResult.fullMixingsCount > 0 && ` ${calculationResult.fullMixingsCount} pełnych mieszań po ${calculationResult.piecesPerFullMixing} szt.`}
                {calculationResult.piecesInLastMixing > 0 && ` oraz 1 mieszanie zawierające ${calculationResult.piecesInLastMixing} szt.`}
              </>
            ) : (
              <>
                Wygenerowano plan {calculationResult.totalMixings} mieszań: {calculationResult.fullMixingsCount} pełnych mieszań po {calculationResult.mixerVolume} kg
                {calculationResult.remainingAmount > 0 ? ` oraz 1 mieszanie o objętości ${calculationResult.remainingAmount.toFixed(4)} kg` : ''}.
              </>
            )}
          </Alert>
        </Paper>
      )}
    </Container>
  );
};

export default CalculatorPage; 