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
  FormLabel,
  RadioGroup,
  FormControlLabel,
  Radio,
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

const CalculatorPage = () => {
  const { showSuccess, showError, showInfo } = useNotification();
  const { currentUser } = useAuth();
  
  // Główne stany kalkulatora
  const [mixerVolume, setMixerVolume] = useState(100);
  const [targetAmount, setTargetAmount] = useState(1000);
  const [usePieces, setUsePieces] = useState(false);
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
      showError('Nie udało się pobrać receptur');
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
      showError('Nie udało się pobrać zadań produkcyjnych');
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
            showError('Wybrana receptura nie zawiera składników');
          }
          setLoading(false);
        })
        .catch(error => {
          console.error('Błąd podczas pobierania receptury:', error);
          showError('Nie udało się pobrać szczegółów receptury');
          setLoading(false);
        });
    } else {
      setSelectedRecipe(null);
    }
  }, [selectedRecipeId, showError]);
  
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
      console.log(`[DEBUG] Rozpoczynam obliczenia dla receptury: ${selectedRecipe.name}`);
      console.log(`[DEBUG] Objętość mieszalnika: ${mixerVolume} kg, Docelowa ilość: ${targetAmount}`);
      console.log(`[DEBUG] Tryb kalkulacji: ${usePieces ? 'Sztuki' : 'Kilogramy'}`);
      
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
        
        console.log(`[DEBUG] Waga jednej sztuki produktu: ${singlePieceWeight.toFixed(6)} kg`);
        
        // Całkowita waga potrzebna do produkcji wszystkich sztuk
        const totalWeight = singlePieceWeight * targetAmount;
        console.log(`[DEBUG] Całkowita waga do wyprodukowania ${targetAmount} szt.: ${totalWeight.toFixed(6)} kg`);
        
        // Obliczenie liczby pełnych mieszań na podstawie całkowitej wagi
        const fullMixingsCount = Math.floor(totalWeight / mixerVolume);
        console.log(`[DEBUG] Liczba pełnych mieszań: ${fullMixingsCount}, totalWeight/mixerVolume = ${(totalWeight/mixerVolume).toFixed(6)}`);
        
        // Obliczenie wagi pozostałej po pełnych mieszaniach
        const remainingWeight = totalWeight % mixerVolume;
        console.log(`[DEBUG] Pozostała waga: ${remainingWeight.toFixed(6)} kg`);
        
        // Obliczenie liczby sztuk w każdym pełnym mieszaniu
        const piecesPerFullMixing = Math.round((mixerVolume / totalWeight) * targetAmount);
        console.log(`[DEBUG] Liczba sztuk w pełnym mieszaniu: ${piecesPerFullMixing}, wzór: (${mixerVolume}/${totalWeight.toFixed(6)})*${targetAmount} = ${((mixerVolume / totalWeight) * targetAmount).toFixed(6)}`);
        
        // Liczba sztuk w ostatnim, niepełnym mieszaniu
        const piecesInLastMixing = targetAmount - (piecesPerFullMixing * fullMixingsCount);
        console.log(`[DEBUG] Sztuki w ostatnim mieszaniu: ${piecesInLastMixing} (${targetAmount} - ${piecesPerFullMixing} * ${fullMixingsCount})`);
        
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
      showError('Brak planu mieszań do wyeksportowania');
      return;
    }
    
    try {
      // Przygotowanie nagłówków CSV
      let csvContent = usePieces ? 
        'Objętość;Liczba sztuk;Nazwa produktu;Składnik;Ilość;Jednostka;Sprawdzone;Wstawione w mieszalnik;Zrobione\n' : 
        'Objętość;Nazwa produktu;Składnik;Ilość;Jednostka;Sprawdzone;Wstawione w mieszalnik;Zrobione\n';
      
      // Przygotowanie sumy dla każdego surowca
      let ingredientTotals = {};
      
      // Dodanie wierszy dla każdego mieszania i jego składników
      mixings.forEach(mixing => {
        // Dodaj wyróżniony nagłówek dla każdego mieszania
        const headerColumns = usePieces ? 9 : 8; // Zwiększono liczbę kolumn
        csvContent += `"Mieszanie nr. ${mixing.mixingNumber}"${';'.repeat(headerColumns - 1)}\n`;
        
        // Dodaj wiersz z informacją o objętości mieszania i liczbie sztuk (jeśli w trybie sztuk)
        const formattedVolumeToMix = `="${Number(mixing.volumeToMix).toFixed(4)}"`;
        
        // Dodaj jednorazowo objętość i liczbę sztuk pod nagłówkiem mieszania
        if (usePieces) {
          const formattedPiecesCount = `="${mixing.piecesCount || 0}"`;
          csvContent += `${formattedVolumeToMix};${formattedPiecesCount};${mixing.recipeName};;;;;\n`;
        } else {
          csvContent += `${formattedVolumeToMix};${mixing.recipeName};;;;;\n`;
        }
        
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
            
            if (usePieces) {
              // Format dla trybu sztuk produktu - bez powtarzania objętości i liczby sztuk
              csvContent += `;;;${ingredient.name};${formattedQuantity};${ingredient.unit};;;\n`;
            } else {
              // Format dla trybu kilogramów - bez powtarzania objętości
              csvContent += `;;${ingredient.name};${formattedQuantity};${ingredient.unit};;;\n`;
            }
          }
        });
        
        // Dodaj pustą linię po każdym mieszaniu dla lepszej czytelności
        csvContent += `${';'.repeat(headerColumns - 1)}\n`;
      });
      
      // Dodaj podsumowanie na końcu pliku CSV
      if (calculationResult) {
        csvContent += `${';'.repeat(usePieces ? 5 : 4)}\n`;
        
        // Dodaj podsumowanie dla każdego surowca
        csvContent += `"Podsumowanie:"${';'.repeat(usePieces ? 8 : 7)}\n`;
        
        // Dodaj sumy dla każdego surowca
        csvContent += `"Sumy według surowców:"${';'.repeat(usePieces ? 8 : 7)}\n`;
        Object.keys(ingredientTotals).forEach(ingredientName => {
          const ingredientData = ingredientTotals[ingredientName];
          const formattedQuantity = `="${ingredientData.quantity.toFixed(4)}"`;
          
          if (usePieces) {
            csvContent += `;;;${ingredientName};${formattedQuantity};${ingredientData.unit};;;\n`;
          } else {
            csvContent += `;;${ingredientName};${formattedQuantity};${ingredientData.unit};;;\n`;
          }
        });
        
        csvContent += `${';'.repeat(usePieces ? 8 : 7)}\n`;
        
        if (usePieces) {
          // Podsumowanie dla trybu sztuk
          csvContent += `"Całkowita liczba sztuk:";="${calculationResult.targetAmount}";;;;;\n`;
          csvContent += `"Waga jednej sztuki:";="${calculationResult.singlePieceWeight?.toFixed(4)}";kg;;;\n`;
          csvContent += `"Całkowita waga:";="${calculationResult.totalWeight?.toFixed(4)}";kg;;;\n`;
          csvContent += `"Liczba mieszań:";="${calculationResult.totalMixings}";;;;;\n`;
        } else {
          // Podsumowanie dla trybu kilogramów
          csvContent += `"Docelowa ilość:";="${calculationResult.targetAmount}";kg;;;\n`;
          csvContent += `"Liczba mieszań:";="${calculationResult.totalMixings}";;;\n`;
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
    setSelectedTaskId('');
    setMoSearchQuery('');
    setCalculationResult(null);
    setMixings([]);
    setUsePieces(false);
    showInfo('Kalkulator został zresetowany');
  };

  // Funkcja do generowania planu mieszań na podstawie MO
  const generatePlanFromMO = async () => {
    if (!selectedTaskId) {
      showError('Wybierz zadanie produkcyjne (MO) przed wygenerowaniem planu');
      return;
    }
    
    try {
      setLoading(true);
      // Importujemy funkcję do pobierania szczegółów zadania
      const { getTaskById } = await import('../../services/productionService');
      
      // Pobieramy szczegóły wybranego zadania
      const task = await getTaskById(selectedTaskId);
      
      if (!task) {
        showError('Nie udało się pobrać szczegółów zadania produkcyjnego');
        return;
      }
      
      // Sprawdzamy czy zadanie ma przypisaną recepturę
      if (!task.recipeId) {
        showError('Wybrane zadanie produkcyjne nie ma przypisanej receptury');
        return;
      }
      
      // Pobieramy recepturę
      const recipeDoc = await getRecipeById(task.recipeId);
      
      if (!recipeDoc) {
        showError('Nie udało się pobrać receptury dla zadania produkcyjnego');
        return;
      }
      
      // Ustawiamy wybraną recepturę
      setSelectedRecipe(recipeDoc);
      setSelectedRecipeId(recipeDoc.id);
      
      // Ustawiamy ilość docelową na podstawie ilości z zadania produkcyjnego
      setTargetAmount(task.quantity);
      
      // Ustawiamy tryb kalkulacji na podstawie jednostki z zadania
      const isPiecesUnit = task.unit === 'szt.' || task.unit === 'pcs' || task.unit === 'ea';
      setUsePieces(isPiecesUnit);
      
      // Wywołujemy funkcję do obliczenia planu mieszań
      calculateMixings();
      
      showSuccess(`Plan mieszań wygenerowany na podstawie zadania produkcyjnego ${task.moNumber}`);
    } catch (error) {
      console.error('Błąd podczas generowania planu mieszań z MO:', error);
      showError('Wystąpił błąd podczas generowania planu mieszań z MO');
    } finally {
      setLoading(false);
    }
  };

  // Funkcja do zapisywania planu mieszań jako checklisty w zadaniu produkcyjnym (MO)
  const saveMixingPlanToTask = async () => {
    if (!selectedTaskId) {
      showError('Wybierz zadanie produkcyjne (MO) przed zapisaniem planu mieszań');
      return;
    }
    
    if (!mixings || mixings.length === 0) {
      showError('Brak planu mieszań do zapisania');
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
        showSuccess('Plan mieszań został zapisany jako checklista w zadaniu produkcyjnym');
      } else {
        showError('Nie udało się zapisać planu mieszań w zadaniu produkcyjnym');
      }
    } catch (error) {
      console.error('Błąd podczas zapisywania planu mieszań w zadaniu:', error);
      showError('Wystąpił błąd podczas zapisywania planu mieszań: ' + error.message);
    } finally {
      setLoading(false);
    }
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
              label="Docelowa ilość produktu"
              value={targetAmount}
              onChange={(e) => setTargetAmount(Number(e.target.value))}
              InputProps={{
                endAdornment: (
                  <Typography variant="caption" color="text.secondary">
                    {usePieces ? 'szt.' : 'kg'}
                  </Typography>
                )
              }}
              variant="outlined"
            />
          </Grid>
          
          {/* Wybór trybu kalkulacji */}
          <Grid item xs={12} md={4}>
            <FormControl fullWidth component="fieldset">
              <FormLabel component="legend">Tryb kalkulacji</FormLabel>
              <RadioGroup
                row
                value={usePieces ? 'pieces' : 'weight'}
                onChange={(e) => setUsePieces(e.target.value === 'pieces')}
              >
                <FormControlLabel
                  value="weight"
                  control={<Radio />}
                  label="Waga (kg)"
                />
                <FormControlLabel
                  value="pieces"
                  control={<Radio />}
                  label="Sztuki"
                />
              </RadioGroup>
            </FormControl>
          </Grid>
          
          {/* Wybór receptury */}
          <Grid item xs={12} md={6}>
            <FormControl fullWidth>
              <InputLabel id="recipe-select-label">Wybierz recepturę</InputLabel>
              <Select
                labelId="recipe-select-label"
                value={selectedRecipeId}
                onChange={(e) => setSelectedRecipeId(e.target.value)}
                label="Wybierz recepturę"
                disabled={loading}
              >
                <MenuItem value="">
                  <em>-- Wybierz recepturę --</em>
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
                  label="Wyszukaj zadanie produkcyjne (MO)"
                  variant="outlined"
                  placeholder="Wpisz numer MO, nazwę produktu..."
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
                  helperText="Wpisz numer MO, nazwę produktu lub ID zadania, aby wyszukać zadanie produkcyjne"
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
              noOptionsText="Brak zadań produkcyjnych spełniających kryteria wyszukiwania"
              loadingText="Ładowanie zadań produkcyjnych..."
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
                disabled={loading || !selectedRecipeId || mixerVolume <= 0 || targetAmount <= 0}
                startIcon={<CalculateIcon />}
              >
                Oblicz plan mieszań
              </Button>
              
              {mixings.length > 0 && (
                <Button
                  variant="outlined"
                  color="success"
                  onClick={generateCSV}
                  startIcon={<FileDownloadIcon />}
                >
                  Eksportuj CSV
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
                  Zapisz plan w MO
                </Button>
              )}
              
              <Button
                variant="outlined"
                color="error"
                onClick={resetCalculator}
                startIcon={<ResetIcon />}
              >
                Resetuj
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
              <Paper sx={{ 
                p: 2, 
                textAlign: 'center', 
                backgroundColor: theme => theme.palette.mode === 'dark' ? '#1e2a45' : '#f5f5f5',
                color: theme => theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.87)' : 'rgba(0, 0, 0, 0.87)'
              }}>
                <Typography variant="body2" color={theme => theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.6)' : 'text.secondary'}>
                  Produkt
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
                  Docelowa ilość
                </Typography>
                <Typography variant="h6">
                  {calculationResult.targetAmount} {usePieces ? "szt." : "kg"}
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
                  Objętość mieszalnika
                </Typography>
                <Typography variant="h6">
                  {calculationResult.mixerVolume} kg
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
                  <TableCell>Nr mieszania</TableCell>
                  <TableCell>Objętość</TableCell>
                  {usePieces && <TableCell>Liczba sztuk</TableCell>}
                  <TableCell>Składnik</TableCell>
                  <TableCell align="right">Ilość</TableCell>
                  <TableCell>Jednostka</TableCell>
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
                            {mixing.volumeToMix.toFixed(4)} kg
                            {/* Dodajemy informację o rzeczywistej wadze składników */}
                            <Typography variant="caption" display="block" color={theme => 
                              theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.6)' : 'text.secondary'
                            }>
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