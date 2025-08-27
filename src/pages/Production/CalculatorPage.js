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
  IconButton,
  FormHelperText,
  Autocomplete,
  InputAdornment
} from '@mui/material';
import {
  Add as AddIcon,
  Remove as RemoveIcon,
  Download as DownloadIcon,
  Calculate as CalculateIcon,
  Info as InfoIcon,
  RestartAlt as ResetIcon,
  Assignment as AssignmentIcon,
  FileDownload as FileDownloadIcon,
  SaveAlt as SaveAltIcon,
  Search as SearchIcon
} from '@mui/icons-material';
import { useNotification } from '../../hooks/useNotification';
import { getAllRecipes, getRecipeById } from '../../services/recipeService';
import { useAuth } from '../../hooks/useAuth';
import { useTranslation } from '../../hooks/useTranslation';

const CalculatorPage = () => {
  const { showSuccess, showError, showInfo } = useNotification();
  const { currentUser } = useAuth();
  const { t } = useTranslation();
  
  // Główne stany kalkulatora
  const [mainIngredientQuantity, setMainIngredientQuantity] = useState(100);
  const [targetAmount, setTargetAmount] = useState(1000);
  const [selectedRecipeId, setSelectedRecipeId] = useState('');
  
  // Stany pomocnicze
  const [recipes, setRecipes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [calculationResult, setCalculationResult] = useState(null);
  const [mixings, setMixings] = useState([]);
  const [selectedRecipe, setSelectedRecipe] = useState(null);
  const [productionTasks, setProductionTasks] = useState([]);
  const [selectedTaskId, setSelectedTaskId] = useState('');
  
  // Stany dla wyszukiwania MO
  const [moSearchQuery, setMoSearchQuery] = useState('');
  const [filteredTasks, setFilteredTasks] = useState([]);
  
  // Funkcja do pobierania receptur
  const fetchRecipes = async () => {
    try {
      setLoading(true);
      const recipesData = await getAllRecipes();
      setRecipes(recipesData);
    } catch (error) {
      console.error('Błąd podczas pobierania receptur:', error);
      showError(t('calculator.errors.fetchRecipesFailed'));
    } finally {
      setLoading(false);
    }
  };
  
  // Pobranie wszystkich receptur przy ładowaniu komponentu
  useEffect(() => {
    fetchRecipes();
  }, [showError]);
  
  // Funkcja do pobrania zadań produkcyjnych
  const fetchProductionTasks = async () => {
    try {
      setLoading(true);
      // Importujemy funkcję do pobierania zadań produkcyjnych z poprawnego modułu
      const { getProductionTasks } = await import('../../services/aiDataService');
      
      // Pobieramy zadania produkcyjne o statusie "Zaplanowane", "W trakcie" oraz "Wstrzymane"
      const tasks = await getProductionTasks({
        filters: [
          { field: 'status', operator: 'in', value: ['Zaplanowane', 'W trakcie', 'Wstrzymane'] }
        ],
        orderBy: { field: 'createdAt', direction: 'desc' },
        limit: 100
      });
      
      setProductionTasks(tasks);
    } catch (error) {
      console.error('Błąd podczas pobierania zadań produkcyjnych:', error);
      showError(t('calculator.errors.fetchTasksFailed'));
    } finally {
      setLoading(false);
    }
  };
  
  // Rozszerzamy useEffect o pobieranie zadań produkcyjnych
  useEffect(() => {
    fetchRecipes();
    fetchProductionTasks(); // Dodano pobieranie zadań produkcyjnych
  }, []);
  
  // Aktualizacja filtrowanej listy zadań produkcyjnych
  useEffect(() => {
    if (!moSearchQuery.trim()) {
      setFilteredTasks(productionTasks);
    } else {
      const filtered = productionTasks.filter(task => {
        const searchLower = moSearchQuery.toLowerCase();
        return (
          task.moNumber?.toLowerCase().includes(searchLower) ||
          task.productName?.toLowerCase().includes(searchLower) ||
          task.id?.toLowerCase().includes(searchLower)
        );
      });
      setFilteredTasks(filtered);
    }
  }, [productionTasks, moSearchQuery]);
  
  // Funkcja do obsługi wyszukiwania MO
  const handleMoSearchChange = (event, newValue) => {
    if (typeof newValue === 'string') {
      setMoSearchQuery(newValue);
    } else if (newValue && newValue.inputValue) {
      // Utworzenie nowej wartości z inputValue
      setMoSearchQuery(newValue.inputValue);
    } else if (newValue) {
      // Wybrano istniejące zadanie
      setSelectedTaskId(newValue.id);
      setMoSearchQuery(newValue.moNumber || '');
    } else {
      // Wyczyszczono wyszukiwanie
      setSelectedTaskId('');
      setMoSearchQuery('');
    }
  };
  
  // Automatyczne generowanie planu po wybraniu zadania produkcyjnego (MO)
  useEffect(() => {
    if (selectedTaskId) {
      generatePlanFromMO();
    }
  }, [selectedTaskId]);
  
  // Sprawdzenie czy wybrana receptura i jej dane są dostępne
  useEffect(() => {
    if (selectedRecipeId) {
      setLoading(true);
      getRecipeById(selectedRecipeId)
        .then(recipeData => {
          if (recipeData && recipeData.ingredients && recipeData.ingredients.length > 0) {
            // A już mamy zmienną selectedRecipe w stanie, więc używamy jej
            setSelectedRecipe(recipeData);
          } else {
            setSelectedRecipe(null);
            showError(t('calculator.errors.selectedRecipeNoIngredients'));
          }
          setLoading(false);
        })
        .catch(error => {
          console.error('Błąd podczas pobierania receptury:', error);
          showError(t('calculator.errors.fetchRecipeDetailsFailed'));
          setLoading(false);
        });
    } else {
      setSelectedRecipe(null);
    }
  }, [selectedRecipeId, showError]);
  
  // Funkcja do obliczania planu mieszań
  const calculateMixings = () => {
    if (!selectedRecipe) {
      showError(t('calculator.errors.selectRecipe'));
      return;
    }
    
    if (mainIngredientQuantity <= 0) {
      showError(t('calculator.errors.mainIngredientQuantityPositive'));
      return;
    }
    
    if (targetAmount <= 0) {
      showError(t('calculator.errors.targetAmountPositive'));
      return;
    }

    // Znajdź główny składnik w recepturze
    const mainIngredient = findMainIngredient(selectedRecipe);
    if (!mainIngredient) {
      showError(t('calculator.errors.noMainIngredientFound'));
      return;
    }
    
    try {
      console.log(`[DEBUG] Rozpoczynam obliczenia dla receptury: ${selectedRecipe.name}`);
      console.log(`[DEBUG] Główny składnik: ${mainIngredient.name} (${mainIngredient.quantity} ${mainIngredient.unit})`);
      console.log(`[DEBUG] Ilość głównego składnika na mieszanie: ${mainIngredientQuantity} ${mainIngredient.unit}`);
      console.log(`[DEBUG] Docelowa ilość: ${targetAmount} szt.`);
      
      let mixingPlan = [];
      
      console.log(`[DEBUG] Tryb kalkulacji: Sztuki (jedyny dostępny tryb)`);
      
      // Logika oparta na ilości głównego składnika - tylko tryb sztuk
      // Oblicz współczynnik skalowania na podstawie głównego składnika
      const mainIngredientOriginalQuantity = parseFloat(mainIngredient.quantity);
      const scaleFactor = mainIngredientQuantity / mainIngredientOriginalQuantity;
      
      console.log(`[DEBUG] Oryginalana ilość głównego składnika w recepturze: ${mainIngredientOriginalQuantity} ${mainIngredient.unit}`);
      console.log(`[DEBUG] Współczynnik skalowania: ${scaleFactor.toFixed(6)}`);
      
      // Oblicz ile sztuk można wyprodukować z jednego mieszania
      const recipeYield = selectedRecipe.yield?.quantity || 1;
      const piecesPerMixing = scaleFactor * recipeYield;
      
      console.log(`[DEBUG] Wydajność receptury: ${recipeYield} szt.`);
      console.log(`[DEBUG] Sztuki z jednego mieszania: ${piecesPerMixing.toFixed(6)}`);
      
      // Oblicz liczbę mieszań potrzebnych do wyprodukowania docelowej ilości
      const totalMixingsNeeded = targetAmount / piecesPerMixing;
      const fullMixingsCount = Math.floor(totalMixingsNeeded);
      
      // Używamy precyzyjnej arytmetyki aby uniknąć błędów zmiennoprzecinkowych
      // Obliczamy dokładną liczbę sztuk które pozostały
      const piecesInFullMixings = fullMixingsCount * piecesPerMixing;
      const remainingPieces = Math.round((targetAmount - piecesInFullMixings) * 1000000) / 1000000; // Zaokrąglenie do 6 miejsc po przecinku
      
      console.log(`[DEBUG] Całkowita liczba mieszań potrzebnych: ${totalMixingsNeeded.toFixed(6)}`);
      console.log(`[DEBUG] Liczba pełnych mieszań: ${fullMixingsCount}`);
      console.log(`[DEBUG] Sztuki w pełnych mieszaniach: ${piecesInFullMixings.toFixed(6)}`);
      console.log(`[DEBUG] Pozostałe sztuki: ${remainingPieces.toFixed(6)}`);
      
      // Dodanie pełnych mieszań
      for (let i = 0; i < fullMixingsCount; i++) {
        const ingredients = calculateIngredientsForBatch(piecesPerMixing, selectedRecipe, true);
        const totalWeight = ingredients
          .filter(ing => ing.unit === 'kg')
          .reduce((sum, ing) => sum + ing.quantity, 0);
          
        mixingPlan.push({
          mixingNumber: i + 1,
          volumeToMix: totalWeight,
          calculatedWeight: totalWeight,
          piecesCount: piecesPerMixing,
          recipeName: selectedRecipe.name,
          mainIngredientName: mainIngredient.name,
          mainIngredientQuantity: mainIngredientQuantity,
          ingredients: ingredients
        });
      }
      
      // Dodanie mieszania dla pozostałych sztuk, jeśli istnieją
      if (remainingPieces > 0.000001) { // Precyzyjny próg
        const ingredients = calculateIngredientsForBatch(remainingPieces, selectedRecipe, true);
        const totalWeight = ingredients
          .filter(ing => ing.unit === 'kg')
          .reduce((sum, ing) => sum + ing.quantity, 0);
        
        // Oblicz proporcjonalną ilość głównego składnika dla ostatniego mieszania
        const lastMixingMainIngredientQuantity = (remainingPieces / piecesPerMixing) * mainIngredientQuantity;
          
        mixingPlan.push({
          mixingNumber: fullMixingsCount + 1,
          volumeToMix: totalWeight,
          calculatedWeight: totalWeight,
          piecesCount: remainingPieces,
          recipeName: selectedRecipe.name,
          mainIngredientName: mainIngredient.name,
          mainIngredientQuantity: lastMixingMainIngredientQuantity,
          ingredients: ingredients
        });
      }
      
      // Ustawienie wyniku obliczenia
      setCalculationResult({
        targetAmount,
        mainIngredientQuantity,
        mainIngredientName: mainIngredient.name,
        mainIngredientUnit: mainIngredient.unit,
        fullMixingsCount,
        remainingPieces,
        piecesPerMixing,
        totalMixings: remainingPieces > 0.000001 ? fullMixingsCount + 1 : fullMixingsCount,
        recipeName: selectedRecipe.name,
        isProductPieces: true
      });
      
      // Walidacja i korekta sumy sztuk
      let totalCalculatedPieces = 0;
      mixingPlan.forEach(mixing => {
        totalCalculatedPieces += mixing.piecesCount || 0;
      });
      
      console.log(`[DEBUG] Suma wyliczonych sztuk przed korektą: ${totalCalculatedPieces.toFixed(6)}`);
      console.log(`[DEBUG] Docelowa liczba sztuk: ${targetAmount}`);
      
      // Jeśli różnica jest minimalna (błąd zmiennoprzecinkowy), skoryguj ostatnie mieszanie
      const piecesDiscrepancy = targetAmount - totalCalculatedPieces;
      if (Math.abs(piecesDiscrepancy) > 0.000001 && Math.abs(piecesDiscrepancy) < 0.01) {
        console.log(`[DEBUG] Korygujemy różnicę w sztukach: ${piecesDiscrepancy.toFixed(6)}`);
        if (mixingPlan.length > 0) {
          const lastMixing = mixingPlan[mixingPlan.length - 1];
          lastMixing.piecesCount = (lastMixing.piecesCount || 0) + piecesDiscrepancy;
          console.log(`[DEBUG] Nowa liczba sztuk w ostatnim mieszaniu: ${lastMixing.piecesCount.toFixed(6)}`);
        }
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
      
      // Pokaż ostateczną sumę sztuk
      const finalTotalPieces = mixingPlan.reduce((sum, mixing) => sum + (mixing.piecesCount || 0), 0);
      console.log(`[DEBUG] Ostateczna suma sztuk: ${finalTotalPieces.toFixed(6)}`);
      
      showSuccess(t('calculator.success.planCalculated'));
    } catch (error) {
      console.error('Błąd podczas obliczania planu mieszań:', error);
      showError(t('calculator.errors.calculateFailed'));
    }
  };
  
  // Funkcja pomocnicza do znajdowania głównego składnika (o największym udziale w recepturze)
  const findMainIngredient = (recipe) => {
    if (!recipe || !recipe.ingredients || recipe.ingredients.length === 0) {
      return null;
    }

    // Przefiltruj składniki, pomijając opakowania
    const filteredIngredients = recipe.ingredients.filter(ingredient => {
      const categoryFromIngredient = ingredient.category;
      const categoryFromItem = ingredient.inventoryItem?.category;
      const categoryDirectly = ingredient.inventoryItemCategory;
      const effectiveCategory = categoryFromIngredient || categoryFromItem || categoryDirectly;
      const isPackaging = effectiveCategory === 'Opakowania';
      const isPackagingByName = ingredient.name && 
        (ingredient.name.startsWith('PACK') || ingredient.name.includes('PACK'));
      return !isPackaging && !isPackagingByName;
    });

    if (filteredIngredients.length === 0) {
      return null;
    }

    // Znajdź składnik o największej ilości (w kg)
    let mainIngredient = null;
    let maxQuantity = 0;

    filteredIngredients.forEach(ingredient => {
      const quantity = parseFloat(ingredient.quantity || 0);
      if (ingredient.unit === 'kg' && quantity > maxQuantity) {
        maxQuantity = quantity;
        mainIngredient = ingredient;
      }
    });

    // Jeśli nie znaleziono składnika w kg, znajdź największy w innych jednostkach
    if (!mainIngredient) {
      filteredIngredients.forEach(ingredient => {
        const quantity = parseFloat(ingredient.quantity || 0);
        if (quantity > maxQuantity) {
          maxQuantity = quantity;
          mainIngredient = ingredient;
        }
      });
    }

    console.log(`[DEBUG] Główny składnik w recepturze ${recipe.name}: ${mainIngredient?.name} (${maxQuantity} ${mainIngredient?.unit})`);
    return mainIngredient;
  };

  // Funkcja pomocnicza do przeliczania składników dla danej partii
  const calculateIngredientsForBatch = (batchSize, recipe, useProductPieces = false) => {
    if (!recipe || !recipe.ingredients || recipe.ingredients.length === 0) {
      return [];
    }
    
    console.log(`[DEBUG] Wywołanie calculateIngredientsForBatch dla receptury ${recipe.name}, batchSize=${batchSize}, useProductPieces=${useProductPieces}`);
    
    // Pobierz wydajność receptury (ilość produktu z jednej pełnej realizacji receptury)
    const recipeYield = recipe.yield?.quantity || 1;
    console.log(`[DEBUG] Wydajność receptury (yield): ${recipeYield}`);
    
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
    
    console.log(`[DEBUG] Ilość składników po filtrowaniu: ${filteredIngredients.length}`);
    
    // Oblicz współczynnik skalowania dla danej wielkości partii
    let scaleFactor;
    
    if (useProductPieces) {
      // Jeśli używamy sztuk, to batchSize to bezpośrednio liczba sztuk do wyprodukowania
      scaleFactor = batchSize;
      console.log(`[DEBUG] Tryb sztuki: scaleFactor = ${scaleFactor}`);
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
      
      console.log(`[DEBUG] Suma wag składników w oryginalnej recepturze: ${originalTotalWeight.toFixed(5)} kg`);
      
      if (originalTotalWeight <= 0) {
        console.warn('[DEBUG] Ostrzeżenie: Suma wag składników w recepturze wynosi 0 kg');
        // Używamy współczynnika równego objętości mieszania (dla bezpieczeństwa)
        scaleFactor = batchSize;
      } else {
        // Oblicz współczynnik, aby suma wag równała się docelowej objętości
        scaleFactor = batchSize / originalTotalWeight;
        console.log(`[DEBUG] Tryb wagi: współczynnik skalowania: ${scaleFactor.toFixed(6)}`);
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
    
    console.log(`[DEBUG] Sumaryczna waga wszystkich składników w kg: ${totalWeight.toFixed(6)}, oczekiwana objętość mieszania: ${batchSize}`);
    
    // Dla trybu wagi, jeśli suma wag różni się od oczekiwanej objętości,
    // dostosuj proporcjonalnie wszystkie składniki
    if (!useProductPieces && Math.abs(totalWeight - batchSize) > 0.001) { // Zwiększona precyzja
      console.log(`[DEBUG] Dostosowanie składników aby osiągnąć dokładną objętość ${batchSize} kg, różnica: ${(totalWeight - batchSize).toFixed(6)}`);
      const adjustmentFactor = batchSize / totalWeight;
      console.log(`[DEBUG] Współczynnik korekty: ${adjustmentFactor.toFixed(6)}`);
      
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
      
      console.log(`[DEBUG] Suma wag po korekcie: ${adjustedTotalWeight.toFixed(6)} kg`);
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
      showError(t('calculator.errors.noMixingPlanToExport'));
      return;
    }
    
    try {
      // Przygotowanie nagłówków CSV (zawsze z kolumną liczby sztuk)
      let csvContent = `${t('calculator.csv.volume')};${t('calculator.csv.piecesCount')};${t('calculator.csv.productName')};${t('calculator.csv.ingredient')};${t('calculator.csv.quantity')};${t('calculator.csv.unit')};${t('calculator.csv.checked')};${t('calculator.csv.addedToMixer')};${t('calculator.csv.completed')}\n`;
      
      // Przygotowanie sumy dla każdego surowca
      let ingredientTotals = {};
      
      // Dodanie wierszy dla każdego mieszania i jego składników
      mixings.forEach(mixing => {
        // Dodaj wyróżniony nagłówek dla każdego mieszania
        const headerColumns = 9; // Zawsze 9 kolumn (włącznie z liczbą sztuk)
        csvContent += `"${t('calculator.csv.mixing', { number: mixing.mixingNumber })}"${';'.repeat(headerColumns - 1)}\n`;
        
        // Dodaj wiersz z informacją o objętości mieszania i liczbie sztuk (jeśli w trybie sztuk)
        const formattedVolumeToMix = `="${Number(mixing.volumeToMix).toFixed(4)}"`;
        
        // Dodaj jednorazowo objętość i liczbę sztuk pod nagłówkiem mieszania
        const pieces = mixing.piecesCount || 0;
        const isRounded = Math.abs(pieces - Math.round(pieces)) > 0.001;
        const formattedPiecesCount = `="${isRounded ? '~' : ''}${pieces.toFixed(3)}"`;
        csvContent += `${formattedVolumeToMix};${formattedPiecesCount};${mixing.recipeName};;;;;\n`;
        
        // Używamy przefiltrowanych składników bez opakowań
        mixing.ingredients.forEach(ingredient => {
          // Sprawdzenie czy składnik nie jest opakowaniem (dodatkowo zabezpieczenie)
          if (ingredient.name && !ingredient.name.includes('PACK')) {
            // Formatujemy liczby, sprawdzając czy nie są NaN
            let formattedQuantity;
            if (typeof ingredient.quantity === 'number' && !isNaN(ingredient.quantity)) {
              formattedQuantity = `="${ingredient.quantity.toFixed(4)}"`; 
              
              // Dodaj wartość do sumy dla danego surowca
              if (!ingredientTotals[ingredient.name]) {
                ingredientTotals[ingredient.name] = {
                  quantity: 0,
                  unit: ingredient.unit
                };
              }
              ingredientTotals[ingredient.name].quantity += ingredient.quantity;
            } else {
              formattedQuantity = '="0.0000"';
            }
            
            // Format zawsze z miejscem na liczbę sztuk
            csvContent += `;;;${ingredient.name};${formattedQuantity};${ingredient.unit};;;\n`;
          }
        });
        
        // Dodaj pustą linię po każdym mieszaniu dla lepszej czytelności
        csvContent += `${';'.repeat(headerColumns - 1)}\n`;
      });
      
      // Dodaj podsumowanie na końcu pliku CSV
      if (calculationResult) {
        csvContent += `${';'.repeat(5)}\n`;
        
        // Dodaj podsumowanie dla każdego surowca
        csvContent += `"${t('calculator.csv.summary')}"${';'.repeat(8)}\n`;
        
        // Dodaj sumy dla każdego surowca
        csvContent += `"${t('calculator.csv.totalsPerIngredient')}"${';'.repeat(8)}\n`;
        Object.keys(ingredientTotals).forEach(ingredientName => {
          const ingredientData = ingredientTotals[ingredientName];
          const formattedQuantity = `="${ingredientData.quantity.toFixed(4)}"`;
          
          csvContent += `;;;${ingredientName};${formattedQuantity};${ingredientData.unit};;;\n`;
        });
        
        csvContent += `${';'.repeat(8)}\n`;
        
        // Podsumowanie zawsze z informacją o sztukach
        csvContent += `"${t('calculator.csv.targetQuantity')}";="${calculationResult.targetAmount}";${t('calculator.pieces')};;;;;\n`;
        csvContent += `"${t('calculator.csv.mainIngredient')}";="${calculationResult.mainIngredientName}";;;;;;\n`;
        csvContent += `"${t('calculator.csv.mainIngredientQuantity')}";="${calculationResult.mainIngredientQuantity}";${calculationResult.mainIngredientUnit};;;;;\n`;
        csvContent += `"${t('calculator.csv.numberOfMixings')}";="${calculationResult.totalMixings}";;;;;\n`;
        
        // Dodaj podsumowanie łącznych wartości
        const totalPieces = mixings.reduce((sum, mixing) => sum + (mixing.piecesCount || 0), 0);
        const isPiecesRounded = Math.abs(totalPieces - Math.round(totalPieces)) > 0.001;
        csvContent += `"${t('calculator.csv.totalPieces')}";="${isPiecesRounded ? '~' : ''}${totalPieces.toFixed(3)}";;;;;;\n`;
        
        const totalWeight = mixings.reduce((sum, mixing) => {
          const weight = mixing.totalIngredientsWeight || mixing.volumeToMix || 0;
          return sum + weight;
        }, 0);
        const isWeightRounded = Math.abs(totalWeight - Math.round(totalWeight)) > 0.001;
        csvContent += `"${t('calculator.csv.totalWeight')}";="${isWeightRounded ? '~' : ''}${totalWeight.toFixed(3)}";kg;;;;;\n`;
      }
      
      // Utworzenie i pobranie pliku CSV
      const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      
      const fileName = `plan_mieszan_${selectedRecipe.name.replace(/\s+/g, '_')}_sztuki_${new Date().toISOString().slice(0, 10)}.csv`;
      link.setAttribute('href', url);
      link.setAttribute('download', fileName);
      link.style.visibility = 'hidden';
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      showSuccess(t('calculator.success.csvExported'));
    } catch (error) {
      console.error('Błąd podczas generowania pliku CSV:', error);
      showError(t('calculator.errors.csvGenerationFailed'));
    }
  };
  
  // Resetowanie kalkulatora
  const resetCalculator = () => {
    setMainIngredientQuantity(100);
    setTargetAmount(1000);
    setSelectedRecipeId('');
    setSelectedTaskId('');
    setMoSearchQuery('');
    setCalculationResult(null);
    setMixings([]);
    showInfo(t('calculator.success.calculatorReset'));
  };

  // Funkcja do generowania planu mieszań na podstawie MO
  const generatePlanFromMO = async () => {
    if (!selectedTaskId) {
      showError(t('calculator.errors.selectTaskBeforeGenerate'));
      return;
    }
    
    try {
      setLoading(true);
      // Importujemy funkcję do pobierania szczegółów zadania
      const { getTaskById } = await import('../../services/productionService');
      
      // Pobieramy szczegóły wybranego zadania
      const task = await getTaskById(selectedTaskId);
      
      if (!task) {
        showError(t('calculator.errors.fetchTaskDetailsFailed'));
        return;
      }
      
      // Sprawdzamy czy zadanie ma przypisaną recepturę
      if (!task.recipeId) {
        showError(t('calculator.errors.taskNoRecipe'));
        return;
      }
      
      // Pobieramy recepturę
      const recipeDoc = await getRecipeById(task.recipeId);
      
      if (!recipeDoc) {
        showError(t('calculator.errors.fetchTaskRecipeFailed'));
        return;
      }
      
      // Ustawiamy wybraną recepturę
      setSelectedRecipe(recipeDoc);
      setSelectedRecipeId(recipeDoc.id);
      
      // Ustawiamy ilość docelową na podstawie ilości z zadania produkcyjnego
      setTargetAmount(task.quantity);
      
      // Wywołujemy funkcję do obliczenia planu mieszań
      calculateMixings();
      
      showSuccess(t('calculator.success.planGeneratedFromMo', { moNumber: task.moNumber }));
    } catch (error) {
      console.error('Błąd podczas generowania planu mieszań z MO:', error);
      showError(t('calculator.errors.generateFromMoFailed'));
    } finally {
      setLoading(false);
    }
  };

  // Funkcja do zapisywania planu mieszań jako checklisty w zadaniu produkcyjnym (MO)
  const saveMixingPlanToTask = async () => {
    if (!selectedTaskId) {
      showError(t('calculator.errors.selectTaskBeforeSave'));
      return;
    }
    
    if (!mixings || mixings.length === 0) {
      showError(t('calculator.errors.noMixingPlanToSave'));
      return;
    }
    
    try {
      setLoading(true);
      // Importujemy funkcję do zapisywania planu mieszań
      const { saveProductionMixingPlan } = await import('../../services/productionService');
      
      // Zapisujemy plan mieszań w zadaniu
      const result = await saveProductionMixingPlan(
        selectedTaskId,
        mixings,
        currentUser?.uid
      );
      
      if (result.success) {
        showSuccess(t('calculator.success.planSavedToTask'));
      } else {
        showError(t('calculator.errors.saveMixingPlanFailed'));
      }
    } catch (error) {
      console.error('Błąd podczas zapisywania planu mieszań w zadaniu:', error);
      showError(t('calculator.errors.saveMixingPlanError') + ' ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Paper sx={{ p: 3, mb: 4, borderRadius: 2 }}>
        <Typography variant="h5" gutterBottom>
          {t('calculator.title')}
        </Typography>
        <Typography variant="body2" color="text.secondary" paragraph>
          {t('calculator.description')}
        </Typography>
        
        <Alert severity="info" sx={{ mb: 3 }}>
          {t('calculator.warning')}
        </Alert>
        
        <Divider sx={{ my: 3 }} />
        
        <Grid container spacing={3}>
          {/* Wybór ilości głównego składnika na mieszanie */}
          <Grid item xs={12} md={4}>
            <TextField
              fullWidth
              type="number"
              label={t('calculator.mainIngredientQuantity')}
              value={mainIngredientQuantity}
              onChange={(e) => setMainIngredientQuantity(Number(e.target.value))}
              InputProps={{
                endAdornment: (
                  <Typography variant="caption" color="text.secondary">
                    {selectedRecipe && findMainIngredient(selectedRecipe) 
                      ? findMainIngredient(selectedRecipe).unit 
                      : 'kg'}
                  </Typography>
                )
              }}
              variant="outlined"
              helperText={selectedRecipe && findMainIngredient(selectedRecipe) 
                ? `Główny składnik: ${findMainIngredient(selectedRecipe).name}`
                : t('calculator.selectRecipeFirst')}
            />
          </Grid>
          
          {/* Podanie docelowej ilości produktu */}
          <Grid item xs={12} md={4}>
            <TextField
              fullWidth
              type="number"
              label={t('calculator.targetQuantity')}
              value={targetAmount}
              onChange={(e) => setTargetAmount(Number(e.target.value))}
              InputProps={{
                endAdornment: (
                  <Typography variant="caption" color="text.secondary">
                    {t('calculator.pieces')}
                  </Typography>
                )
              }}
              variant="outlined"
              helperText={t('calculator.piecesOnlyMode')}
            />
          </Grid>
          
          {/* Wybór receptury */}
          <Grid item xs={12} md={6}>
            <FormControl fullWidth>
              <InputLabel id="recipe-select-label">{t('calculator.selectRecipe')}</InputLabel>
              <Select
                labelId="recipe-select-label"
                value={selectedRecipeId}
                onChange={(e) => setSelectedRecipeId(e.target.value)}
                label={t('calculator.selectRecipe')}
                disabled={loading}
              >
                <MenuItem value="">
                  <em>{t('calculator.selectRecipePlaceholder')}</em>
                </MenuItem>
                {recipes.map((recipe) => (
                  <MenuItem key={recipe.id} value={recipe.id}>
                    {recipe.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          
          {/* Wybór zadania produkcyjnego (MO) */}
          <Grid item xs={12} md={6}>
            <Autocomplete
              options={filteredTasks}
              getOptionLabel={(option) => {
                if (typeof option === 'string') {
                  return option;
                }
                return `${option.moNumber || ''} - ${option.productName || ''} (${option.quantity || 0} ${option.unit || ''})`;
              }}
              value={selectedTaskId ? filteredTasks.find(task => task.id === selectedTaskId) || null : null}
              onChange={handleMoSearchChange}
              onInputChange={(event, newInputValue) => {
                setMoSearchQuery(newInputValue);
              }}
              inputValue={moSearchQuery}
              filterOptions={(options, { inputValue }) => {
                const filtered = options.filter(option => {
                  const searchLower = inputValue.toLowerCase();
                  return (
                    option.moNumber?.toLowerCase().includes(searchLower) ||
                    option.productName?.toLowerCase().includes(searchLower) ||
                    option.id?.toLowerCase().includes(searchLower)
                  );
                });
                return filtered;
              }}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label={t('calculator.searchTask')}
                  variant="outlined"
                  placeholder={t('calculator.searchTaskPlaceholder')}
                  disabled={loading}
                  InputProps={{
                    ...params.InputProps,
                    startAdornment: (
                      <InputAdornment position="start">
                        <SearchIcon color="action" />
                      </InputAdornment>
                    ),
                    endAdornment: (
                      <>
                        {loading ? <CircularProgress color="inherit" size={20} /> : null}
                        {params.InputProps.endAdornment}
                      </>
                    ),
                  }}
                  helperText={t('calculator.searchTaskHelper')}
                />
              )}
              renderOption={(props, option) => (
                <Box component="li" {...props}>
                  <Box>
                    <Typography variant="body1" sx={{ fontWeight: 'bold' }}>
                      {option.moNumber}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {option.productName} - {option.quantity} {option.unit}
                    </Typography>
                  </Box>
                </Box>
              )}
              freeSolo={false}
              clearOnBlur={false}
              selectOnFocus={true}
              handleHomeEndKeys={true}
              noOptionsText={t('calculator.noTasksFound')}
              loadingText={t('calculator.loadingTasks')}
              loading={loading}
            />
          </Grid>
          
          {/* Przyciski akcji */}
          <Grid item xs={12}>
            <Box sx={{ display: 'flex', gap: 2, mt: 2 }}>
              <Button
                variant="contained"
                color="primary"
                onClick={calculateMixings}
                disabled={loading || !selectedRecipeId || mainIngredientQuantity <= 0 || targetAmount <= 0}
                startIcon={<CalculateIcon />}
              >
                {t('calculator.calculate')}
              </Button>
              
              {mixings.length > 0 && (
                <Button
                  variant="outlined"
                  color="success"
                  onClick={generateCSV}
                  startIcon={<FileDownloadIcon />}
                >
                  {t('calculator.exportCsv')}
                </Button>
              )}
              
              {mixings.length > 0 && selectedTaskId && (
                <Button
                  variant="outlined"
                  color="primary"
                  onClick={saveMixingPlanToTask}
                  startIcon={<SaveAltIcon />}
                  disabled={loading}
                >
                  {t('calculator.saveToPlan')}
                </Button>
              )}
              
              <Button
                variant="outlined"
                color="error"
                onClick={resetCalculator}
                startIcon={<ResetIcon />}
              >
                {t('calculator.reset')}
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
              {t('calculator.result')}
            </Typography>
            <Button
              variant="contained"
              color="primary"
              startIcon={<DownloadIcon />}
              onClick={generateCSV}
            >
              {t('calculator.exportToCsv')}
            </Button>
          </Box>
          
          <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid item xs={6} md={3}>
              <Paper sx={{ 
                p: 2, 
                textAlign: 'center', 
                backgroundColor: theme => theme.palette.mode === 'dark' ? '#1e2a45' : '#f5f5f5',
                color: theme => theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.87)' : 'rgba(0, 0, 0, 0.87)'
              }}>
                <Typography variant="body2" color={theme => theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.6)' : 'text.secondary'}>
                  {t('calculator.product')}
                </Typography>
                <Typography variant="h6">
                  {calculationResult.recipeName}
                </Typography>
              </Paper>
            </Grid>
            <Grid item xs={6} md={3}>
              <Paper sx={{ 
                p: 2, 
                textAlign: 'center', 
                backgroundColor: theme => theme.palette.mode === 'dark' ? '#1e2a45' : '#f5f5f5',
                color: theme => theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.87)' : 'rgba(0, 0, 0, 0.87)'
              }}>
                <Typography variant="body2" color={theme => theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.6)' : 'text.secondary'}>
                  {t('calculator.targetAmount')}
                </Typography>
                <Typography variant="h6">
                  {calculationResult.targetAmount} {t('calculator.pieces')}
                </Typography>
              </Paper>
            </Grid>
            <Grid item xs={6} md={3}>
              <Paper sx={{ 
                p: 2, 
                textAlign: 'center', 
                backgroundColor: theme => theme.palette.mode === 'dark' ? '#1e2a45' : '#f5f5f5',
                color: theme => theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.87)' : 'rgba(0, 0, 0, 0.87)'
              }}>
                <Typography variant="body2" color={theme => theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.6)' : 'text.secondary'}>
                  {t('calculator.mainIngredientLabel')}
                </Typography>
                <Typography variant="h6">
                  {calculationResult.mainIngredientQuantity} {calculationResult.mainIngredientUnit}
                </Typography>
                <Typography variant="caption" display="block">
                  {calculationResult.mainIngredientName}
                </Typography>
              </Paper>
            </Grid>
            <Grid item xs={6} md={3}>
              <Paper sx={{ 
                p: 2, 
                textAlign: 'center', 
                backgroundColor: theme => theme.palette.mode === 'dark' ? '#1e2a45' : '#f5f5f5',
                color: theme => theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.87)' : 'rgba(0, 0, 0, 0.87)'
              }}>
                <Typography variant="body2" color={theme => theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.6)' : 'text.secondary'}>
                  {t('calculator.numberOfMixings')}
                </Typography>
                <Typography variant="h6">
                  {calculationResult.totalMixings}
                </Typography>
              </Paper>
            </Grid>
          </Grid>
          
          <Typography variant="subtitle1" gutterBottom>
            {t('calculator.detailedPlan')}
          </Typography>
          
          <TableContainer component={Paper} sx={{ 
            maxHeight: 440, 
            mb: 2,
            backgroundColor: theme => theme.palette.mode === 'dark' ? 'rgba(30, 42, 69, 0.9)' : 'inherit'
          }}>
            <Table stickyHeader size="small">
              <TableHead>
                <TableRow sx={{ 
                  "& th": { 
                    backgroundColor: theme => theme.palette.mode === 'dark' ? '#1e2a45' : '#f5f5f5', 
                    fontWeight: "bold",
                    color: theme => theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.87)' : 'rgba(0, 0, 0, 0.87)'
                  }
                }}>
                  <TableCell>{t('calculator.mixingNumber')}</TableCell>
                  <TableCell>{t('calculator.volume')}</TableCell>
                  <TableCell>{t('calculator.piecesCount')}</TableCell>
                  <TableCell>{t('calculator.ingredient')}</TableCell>
                  <TableCell align="right">{t('calculator.quantity')}</TableCell>
                  <TableCell>{t('calculator.unit')}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody sx={{
                "& tr": {
                  backgroundColor: theme => theme.palette.mode === 'dark' ? 'transparent' : 'inherit',
                  color: theme => theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.87)' : 'inherit'
                }
              }}>
                {mixings.map((mixing) => (
                  mixing.ingredients.map((ingredient, ingredientIndex) => (
                    <TableRow key={`ingredient-${ingredientIndex}`}>
                      {ingredientIndex === 0 && (
                        <>
                          <TableCell rowSpan={mixing.ingredients.length}>
                            {mixing.mixingNumber}
                          </TableCell>
                          <TableCell rowSpan={mixing.ingredients.length}>
                            {mixing.volumeToMix.toFixed(4)} {t('calculator.kg')}
                            {/* Dodajemy informację o rzeczywistej wadze składników */}
                            <Typography variant="caption" display="block" color={theme => 
                              theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.6)' : 'text.secondary'
                            }>
                              ({t('calculator.ingredientsSum')}: {mixing.totalIngredientsWeight ? mixing.totalIngredientsWeight.toFixed(4) : mixing.volumeToMix.toFixed(4)} {t('calculator.kg')})
                            </Typography>
                          </TableCell>
                          <TableCell rowSpan={mixing.ingredients.length}>
                            <Tooltip title={t('calculator.summary.roundingTooltip')} arrow>
                              <span style={{ cursor: 'help' }}>
                                {(() => {
                                  const pieces = mixing.piecesCount || 0;
                                  const isRounded = Math.abs(pieces - Math.round(pieces)) > 0.001;
                                  return `${isRounded ? '~' : ''}${pieces.toFixed(3)}`;
                                })()}
                              </span>
                            </Tooltip>
                          </TableCell>
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

          {/* Sekcja z sumą planu mieszań */}
          <Paper sx={{ 
            p: 2, 
            mt: 2, 
            backgroundColor: theme => theme.palette.mode === 'dark' ? '#2a3f5f' : '#e3f2fd',
            border: theme => `1px solid ${theme.palette.mode === 'dark' ? '#4a6fa5' : '#90caf9'}`
          }}>
            <Typography variant="h6" sx={{ mb: 2, fontWeight: 'bold' }}>
              {t('calculator.summary.title')}
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={6} md={3}>
                <Typography variant="body2" color="text.secondary">
                  {t('calculator.summary.totalMixings')}
                </Typography>
                <Typography variant="h6">
                  {calculationResult.totalMixings}
                </Typography>
              </Grid>
              <Grid item xs={6} md={3}>
                <Typography variant="body2" color="text.secondary">
                  {t('calculator.summary.totalPieces')}
                </Typography>
                <Tooltip title={t('calculator.summary.roundingTooltip')} arrow>
                  <Typography variant="h6" sx={{ cursor: 'help' }}>
                    {(() => {
                      const totalPieces = mixings.reduce((sum, mixing) => sum + (mixing.piecesCount || 0), 0);
                      const isRounded = Math.abs(totalPieces - Math.round(totalPieces)) > 0.001;
                      return `${isRounded ? '~' : ''}${totalPieces.toFixed(3)}`;
                    })()}
                  </Typography>
                </Tooltip>
              </Grid>
              <Grid item xs={6} md={3}>
                <Typography variant="body2" color="text.secondary">
                  {t('calculator.summary.totalWeight')}
                </Typography>
                <Typography variant="h6">
                  {(() => {
                    const totalWeight = mixings.reduce((sum, mixing) => {
                      const weight = mixing.totalIngredientsWeight || mixing.volumeToMix || 0;
                      return sum + weight;
                    }, 0);
                    const isRounded = Math.abs(totalWeight - Math.round(totalWeight)) > 0.001;
                    return `${isRounded ? '~' : ''}${totalWeight.toFixed(3)} kg`;
                  })()}
                </Typography>
              </Grid>
              <Grid item xs={6} md={3}>
                <Typography variant="body2" color="text.secondary">
                  {t('calculator.summary.mainIngredientTotal')}
                </Typography>
                <Typography variant="h6">
                  {(() => {
                    const totalMainIngredient = mixings.reduce((sum, mixing) => {
                      return sum + (mixing.mainIngredientQuantity || 0);
                    }, 0);
                    const isRounded = Math.abs(totalMainIngredient - Math.round(totalMainIngredient)) > 0.001;
                    return `${isRounded ? '~' : ''}${totalMainIngredient.toFixed(3)} ${calculationResult.mainIngredientUnit}`;
                  })()}
                </Typography>
              </Grid>
            </Grid>
          </Paper>
           
          <Alert severity="info" sx={{ mt: 2 }}>
            {t('calculator.alerts.piecesGenerated', {
              totalMixings: calculationResult.totalMixings,
              targetAmount: calculationResult.targetAmount,
              mainIngredientName: calculationResult.mainIngredientName,
              mainIngredientQuantity: calculationResult.mainIngredientQuantity,
              mainIngredientUnit: calculationResult.mainIngredientUnit,
              fullMixingsText: calculationResult.fullMixingsCount > 0 ? 
                t('calculator.alerts.fullMixingsText', { 
                  count: calculationResult.fullMixingsCount, 
                  pieces: calculationResult.piecesPerMixing?.toFixed(3) 
                }) : '',
              lastMixingText: calculationResult.remainingPieces > 0.000001 ? 
                t('calculator.alerts.lastMixingText', { 
                  pieces: calculationResult.remainingPieces?.toFixed(3) 
                }) : ''
            })}
          </Alert>
        </Paper>
      )}
    </Container>
  );
};

export default CalculatorPage;