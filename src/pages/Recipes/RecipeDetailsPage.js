// src/pages/Recipes/RecipeDetailsPage.js
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  Container,
  Paper,
  Typography,
  Grid,
  Button,
  Divider,
  Box,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  List,
  ListItem,
  ListItemText,
  Tab,
  Tabs,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  IconButton,
  Tooltip,
  Alert,
  CircularProgress
} from '@mui/material';
import {
  Edit as EditIcon,
  ArrowBack as ArrowBackIcon,
  Delete as DeleteIcon,
  History as HistoryIcon,
  Print as PrintIcon,
  Compare as CompareIcon,
  Restore as RestoreIcon,
  Add as AddIcon,
  Download as DownloadIcon
} from '@mui/icons-material';
import { getRecipeById, getRecipeVersions, getRecipeVersion, restoreRecipeVersion, deleteRecipe, updateRecipe, sortIngredientsByQuantity } from '../../services/recipeService';
import { useNotification } from '../../hooks/useNotification';
import { formatDate } from '../../utils/formatters';
import { useAuth } from '../../hooks/useAuth';
import { useTranslation } from '../../hooks/useTranslation';
import RecipeVersionComparison from '../../components/recipes/RecipeVersionComparison';
import RecipeDesignAttachments from '../../components/recipes/RecipeDesignAttachments';
import PdfMiniaturePreview from '../../components/common/PdfMiniaturePreview';
import { createInventoryItem, getAllInventoryItems, getInventoryItemByRecipeId } from '../../services/inventoryService';
import { db } from '../../services/firebase/config';
import { collection, query, where, limit, getDocs, doc, getDoc, updateDoc, orderBy } from 'firebase/firestore';
import { getAllWorkstations } from '../../services/workstationService';
import { getPriceListsContainingRecipe } from '../../services/priceListService';

// TabPanel component for recipe detail tabs
function TabPanel(props) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`recipe-tabpanel-${index}`}
      aria-labelledby={`recipe-tab-${index}`}
      {...other}
    >
      {value === index && (
        <Box sx={{ p: 3 }}>
          {children}
        </Box>
      )}
    </div>
  );
}

const RecipeDetailsPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { showError, showSuccess, showWarning, showInfo } = useNotification();
  const { currentUser } = useAuth();
  const { t } = useTranslation();
  const [recipe, setRecipe] = useState(null);
  const [versions, setVersions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tabValue, setTabValue] = useState(0);
  const [selectedVersions, setSelectedVersions] = useState([]);
  const [comparisonOpen, setComparisonOpen] = useState(false);
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);
  const [versionToRestore, setVersionToRestore] = useState(null);
  const [restoringVersion, setRestoringVersion] = useState(false);
  const [linking, setLinking] = useState(false);
  const [workstations, setWorkstations] = useState([]);
  const [inventoryProduct, setInventoryProduct] = useState(null);
  const [priceLists, setPriceLists] = useState([]);

  useEffect(() => {
    const fetchRecipeData = async () => {
      try {
        setLoading(true);
        await fetchRecipe();
        await fetchVersions();
        await fetchWorkstations();
        await fetchInventoryProduct();
        await fetchPriceLists();
      } catch (error) {
        console.error('Error fetching recipe data:', error);
        showError('Błąd podczas pobierania danych receptury');
      } finally {
        setLoading(false);
      }
    };
    
    fetchRecipeData();
  }, [id]);

  const fetchRecipe = async () => {
    try {
      const recipeData = await getRecipeById(id);
      setRecipe(recipeData);
    } catch (error) {
      console.error('Error fetching recipe:', error);
      showError('Błąd podczas pobierania receptury');
    }
  };

  const fetchVersions = async () => {
    try {
      const versionsData = await getRecipeVersions(id);
      setVersions(versionsData);
    } catch (error) {
      console.error('Error fetching versions:', error);
      showError('Błąd podczas pobierania historii wersji receptury');
    }
  };

  const fetchWorkstations = async () => {
    try {
      const workstationsData = await getAllWorkstations();
      setWorkstations(workstationsData);
    } catch (error) {
      console.error('Błąd podczas pobierania stanowisk produkcyjnych:', error);
    }
  };

  const fetchInventoryProduct = async () => {
    try {
      const inventoryItem = await getInventoryItemByRecipeId(id);
      setInventoryProduct(inventoryItem);
    } catch (error) {
      console.error('Błąd podczas pobierania pozycji magazynowej:', error);
    }
  };

  const fetchPriceLists = async () => {
    try {
      const priceListsData = await getPriceListsContainingRecipe(id);
      setPriceLists(priceListsData);
    } catch (error) {
      console.error('Błąd podczas pobierania list cenowych:', error);
    }
  };

  const handleTabChange = (event, newValue) => {
    setTabValue(newValue);
  };

  const handleVersionSelect = (version) => {
    // Jeśli wersja jest już wybrana, usuń ją z listy
    if (selectedVersions.some(v => v.id === version.id)) {
      setSelectedVersions(selectedVersions.filter(v => v.id !== version.id));
    } else {
      // Dodaj wersję do listy (maksymalnie 2)
      if (selectedVersions.length < 2) {
        setSelectedVersions([...selectedVersions, version]);
      } else {
        // Jeśli już są 2 wersje, zastąp najstarszą
        const newSelected = [...selectedVersions];
        newSelected.shift();
        setSelectedVersions([...newSelected, version]);
      }
    }
  };

  const handleCompareVersions = () => {
    if (selectedVersions.length === 2) {
      setComparisonOpen(true);
    } else {
      showError('Wybierz dokładnie 2 wersje do porównania');
    }
  };

  const handleRestoreVersion = (version) => {
    setVersionToRestore(version);
    setRestoreDialogOpen(true);
  };

  const confirmRestoreVersion = async () => {
    if (!versionToRestore) return;
    
    setRestoringVersion(true);
    try {
      const restoredRecipe = await restoreRecipeVersion(
        id, 
        versionToRestore.version,
        currentUser.uid
      );
      
      // Odśwież dane
      setRecipe(restoredRecipe);
      const versionsData = await getRecipeVersions(id);
      setVersions(versionsData);
      
      showSuccess(t('recipes.details.messages.versionRestored', { version: versionToRestore.version }));
      setRestoreDialogOpen(false);
      setVersionToRestore(null);
      setSelectedVersions([]);
    } catch (error) {
      showError(t('recipes.details.messages.restoreError', { error: error.message }));
      console.error('Error restoring version:', error);
    } finally {
      setRestoringVersion(false);
    }
  };

  // Funkcja eksportu receptury do CSV (w języku angielskim)
  const handleExportCSV = () => {
    try {
      // Znajdź stanowisko produkcyjne
      const workstation = workstations.find(w => w.id === recipe.defaultWorkstationId);
      
      // Sprawdź różne możliwe pola dla czasu produkcji
      let timePerPiece = 0;
      if (recipe.productionTimePerUnit) {
        timePerPiece = parseFloat(recipe.productionTimePerUnit);
      } else if (recipe.prepTime) {
        timePerPiece = parseFloat(recipe.prepTime);
      } else if (recipe.preparationTime) {
        timePerPiece = parseFloat(recipe.preparationTime);
      }

      // Tłumaczenie statusu na język angielski
      const translateStatus = (status) => {
        const statusMap = {
          'Robocza': 'Draft',
          'Zatwierdzona': 'Approved',
          'Archiwalna': 'Archived',
          'W trakcie': 'In Progress',
          'Wstrzymana': 'On Hold'
        };
        return statusMap[status] || status || 'Draft';
      };

      // Przygotuj dane podstawowe receptury
      const recipeData = {
        SKU: recipe.name || '',
        Description: recipe.description || '',
        'Time/piece (min)': timePerPiece.toFixed(2),
        'Cost/piece (EUR)': recipe.processingCostPerUnit ? recipe.processingCostPerUnit.toFixed(2) : '0.00',
        Workstation: workstation ? workstation.name : '',
        Status: translateStatus(recipe.status)
      };

      // Przygotuj dane składników
      const ingredientsData = recipe.ingredients ? recipe.ingredients.map(ingredient => ({
        'Ingredient Name': ingredient.name || '',
        Quantity: ingredient.quantity || '0',
        Unit: ingredient.unit || '',
        'CAS Number': ingredient.casNumber || '',
        Notes: ingredient.notes || ''
      })) : [];

      // Utwórz nagłówki dla podstawowych danych receptury
      const recipeHeaders = ['SKU', 'Description', 'Time/piece (min)', 'Cost/piece (EUR)', 'Workstation', 'Status'];
      
      // Utwórz nagłówki dla składników
      const ingredientHeaders = ['Ingredient Name', 'Quantity', 'Unit', 'CAS Number', 'Notes'];

      // Utwórz zawartość CSV - używamy apostrofu przed "===" aby uniknąć interpretacji jako formuła
      const csvContent = [
        // Sekcja 1: Informacje o recepturze
        '"RECIPE INFORMATION"',
        recipeHeaders.map(header => `"${header}"`).join(','),
        recipeHeaders.map(header => `"${recipeData[header] || ''}"`).join(','),
        '',
        // Sekcja 2: Składniki
        '"INGREDIENTS"',
        ingredientHeaders.map(header => `"${header}"`).join(','),
        ...ingredientsData.map(row => 
          ingredientHeaders.map(header => `"${row[header] || ''}"`).join(',')
        )
      ].join('\n');

      // Utwórz i pobierz plik
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `recipe_${recipe.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      showSuccess(t('recipes.details.messages.exportSuccess'));
    } catch (error) {
      console.error('Error exporting recipe to CSV:', error);
      showError(t('recipes.details.messages.exportError'));
    }
  };

  // Funkcja do linkowania składników receptury z magazynem
  const linkIngredientsWithInventory = async (resetLinks = false) => {
    if (!recipe || !recipe.ingredients || recipe.ingredients.length === 0) {
      showWarning(t('recipes.details.messages.noIngredientsToLink'));
      return;
    }
    
    try {
      setLinking(true);
      let linkedCount = 0;
      let notFoundCount = 0;
      let resetCount = 0;
      
      // Pobierz wszystkie składniki z magazynu
      const allInventoryItems = await getAllInventoryItems();
      
      // Kopia składników do aktualizacji
      const updatedIngredients = [...recipe.ingredients];
      
      // Jeśli resetujemy powiązania, usuń wszystkie ID składników
      if (resetLinks) {
        updatedIngredients.forEach((ingredient, index) => {
          if (ingredient.id) {
            updatedIngredients[index] = {
              ...ingredient,
              id: null // Usuwamy ID
            };
            resetCount++;
          }
        });
        
        if (resetCount > 0) {
          showInfo(t('recipes.details.messages.linksReset', { count: resetCount }));
          
          // Zaktualizuj recepturę w stanie lokalnym i w bazie danych
          const updatedRecipe = {
            ...recipe,
            ingredients: updatedIngredients
          };
          setRecipe(updatedRecipe);
          
          await updateRecipe(id, updatedRecipe, currentUser.uid);
        }
      }
      
      // Przeszukaj wszystkie niezlinkowane składniki
      for (let i = 0; i < updatedIngredients.length; i++) {
        const ingredient = updatedIngredients[i];
        
        if (!ingredient.id && ingredient.name) {
          // Znajdź w magazynie składnik o takiej samej nazwie
          const matchingItem = allInventoryItems.find(
            item => item.name.toLowerCase() === ingredient.name.toLowerCase()
          );
          
          if (matchingItem) {
            // Zaktualizuj składnik z ID z magazynu
            updatedIngredients[i] = {
              ...ingredient,
              id: matchingItem.id,
              unit: ingredient.unit || matchingItem.unit
            };
            linkedCount++;
          } else {
            notFoundCount++;
          }
        }
      }
      
      if (linkedCount > 0) {
        // Zaktualizuj recepturę w stanie lokalnym
        const updatedRecipe = {
          ...recipe,
          ingredients: updatedIngredients
        };
        setRecipe(updatedRecipe);
        
        // Zapisz zmiany w bazie danych
        await updateRecipe(id, updatedRecipe, currentUser.uid);
        
        showSuccess(t('recipes.details.messages.ingredientsLinked', { count: linkedCount }));
      }
      
      if (notFoundCount > 0) {
        showWarning(t('recipes.details.messages.ingredientsNotFound', { count: notFoundCount }));
      }
      
      if (linkedCount === 0 && notFoundCount === 0 && !resetLinks) {
        showInfo(t('recipes.details.messages.allLinked'));
      }
      
    } catch (error) {
      showError(t('recipes.details.messages.linkError', { error: error.message }));
      console.error('Error linking ingredients:', error);
    } finally {
      setLinking(false);
    }
  };

  if (loading) {
    return <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>{t('recipes.details.loading')}</Container>;
  }

  if (!recipe) {
    return (
      <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
        <Typography variant="h5">{t('recipes.details.notFound')}</Typography>
        <Button 
          variant="contained" 
          component={Link} 
          to="/recipes"
          startIcon={<ArrowBackIcon />}
          sx={{ mt: 2 }}
        >
          {t('recipes.details.backToList')}
        </Button>
      </Container>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexDirection: { xs: 'column', sm: 'row' } }}>
        <Button 
          startIcon={<ArrowBackIcon />} 
          onClick={() => navigate('/recipes')}
          sx={{ mb: { xs: 2, sm: 0 } }}
        >
          {t('recipes.details.back')}
        </Button>
        <Typography variant="h5" sx={{ mb: { xs: 2, sm: 0 } }}>
          {t('recipes.details.title')}
        </Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, justifyContent: 'center' }}>
          <Button 
            variant="outlined" 
            startIcon={<PrintIcon />}
            onClick={() => window.print()}
          >
            {t('recipes.details.print')}
          </Button>
          <Button 
            variant="outlined" 
            startIcon={<DownloadIcon />}
            onClick={handleExportCSV}
          >
            {t('recipes.details.exportCSV')}
          </Button>
          <Button 
            variant="contained" 
            color="primary" 
            component={Link}
            to={`/recipes/${id}/edit`}
            startIcon={<EditIcon />}
          >
            {t('recipes.details.edit')}
          </Button>
          
          <Button
            startIcon={<AddIcon />}
            color="secondary"
            onClick={() => linkIngredientsWithInventory(false)}
            disabled={linking}
          >
            {linking ? t('recipes.details.linking') : t('recipes.details.linkIngredients')}
          </Button>
          
          <Button
            startIcon={<RestoreIcon />}
            color="warning"
            onClick={() => linkIngredientsWithInventory(true)}
            disabled={linking}
          >
            {t('recipes.details.resetLinks')}
          </Button>
        </Box>
      </Box>

      <Paper sx={{ mb: 3 }}>
        <Box sx={{ p: 3 }}>
          <Grid container spacing={3}>
            {/* Lewa kolumna - główne informacje */}
            <Grid item xs={12} md={8}>
              <Typography variant="h4" gutterBottom>
                {recipe.name}
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2, flexDirection: { xs: 'column', sm: 'row' }, alignItems: { xs: 'flex-start', sm: 'center' } }}>
                <Chip 
                  label={recipe.status || 'Robocza'} 
                  color={recipe.status === 'Zatwierdzona' ? 'success' : 'default'} 
                  sx={{ mr: { sm: 2 }, mb: { xs: 1, sm: 0 } }}
                />
                <Typography variant="subtitle1" color="text.secondary">
                  {t('recipes.details.version', { version: recipe.version || 1 })} | {t('recipes.details.lastUpdate', { date: formatDate(recipe.updatedAt) })}
                </Typography>
              </Box>
              {recipe.description && (
                <Typography variant="body1" paragraph>
                  {recipe.description}
                </Typography>
              )}
              <Grid container spacing={2}>
                <Grid item xs={12} md={6}>
                  <Typography variant="subtitle2" color="text.secondary">
                    {t('recipes.details.defaultWorkstation', { 
                      workstation: recipe.defaultWorkstationId ? 
                        workstations.find(w => w.id === recipe.defaultWorkstationId)?.name || t('recipes.details.unknownWorkstation') : 
                        t('recipes.details.notSpecified')
                    })}
                  </Typography>
                </Grid>
                <Grid item xs={12} md={6}>
                  <Typography variant="subtitle2" color="text.secondary">
                    {recipe.productionTimePerUnit ? 
                      t('recipes.details.timePerUnit', { time: parseFloat(recipe.productionTimePerUnit).toFixed(2) }) : 
                      t('recipes.details.notSpecified')}
                  </Typography>
                </Grid>
                <Grid item xs={12} md={6}>
                  <Typography variant="subtitle2" color="text.secondary">
                    {recipe.processingCostPerUnit ? 
                      t('recipes.details.costPerUnit', { cost: recipe.processingCostPerUnit.toFixed(2) }) : 
                      t('recipes.details.notSpecified')}
                  </Typography>
                </Grid>
                <Grid item xs={12}>
                  <Typography variant="subtitle2" color="text.secondary">
                    {t('recipes.details.inventoryPosition')} {inventoryProduct ? 
                      <Link 
                        to={`/inventory/${inventoryProduct.id}`} 
                        style={{ textDecoration: 'none', color: 'inherit' }}
                      >
                        <Chip 
                          label={`${inventoryProduct.name} (${inventoryProduct.quantity || 0} ${inventoryProduct.unit || 'szt.'})`}
                          size="small"
                          color="primary"
                          variant="outlined"
                          sx={{ ml: 1, cursor: 'pointer' }}
                        />
                      </Link>
                      : t('recipes.details.noInventoryPosition')}
                  </Typography>
                </Grid>
                <Grid item xs={12}>
                  <Typography variant="subtitle2" color="text.secondary">
                    {t('recipes.details.priceLists')} {priceLists.length > 0 ? (
                      <Box component="span" sx={{ ml: 1 }}>
                        {priceLists.map((priceListInfo, index) => (
                          <Chip
                            key={priceListInfo.priceList.id}
                                                      label={`${priceListInfo.customerName} - ${priceListInfo.price.toFixed(2)} EUR/${priceListInfo.unit} ${!priceListInfo.isActive ? t('recipes.details.inactive') : ''}`}
                            size="small"
                            color={priceListInfo.isActive ? 'success' : 'default'}
                            variant="outlined"
                            sx={{ 
                              ml: index > 0 ? 1 : 0, 
                              mr: 1, 
                              mb: 0.5,
                              cursor: 'pointer'
                            }}
                            component={Link}
                            to={`/sales/price-lists/${priceListInfo.priceList.id}`}
                            style={{ textDecoration: 'none' }}
                            title={`Lista cenowa: ${priceListInfo.priceList.name}${priceListInfo.notes ? '\nUwagi: ' + priceListInfo.notes : ''}`}
                          />
                        ))}
                      </Box>
                    ) : t('recipes.details.noPriceLists')}
                  </Typography>
                </Grid>
              </Grid>
            </Grid>

            {/* Prawa kolumna - podgląd najnowszego designu */}
            <Grid item xs={12} md={4}>
              {(() => {
                // Znajdź najnowszy załącznik designu
                const designAttachments = recipe.designAttachments || [];
                if (designAttachments.length === 0) return null;
                
                // Sortuj załączniki według daty przesłania (najnowsze pierwsze)
                const sortedAttachments = [...designAttachments].sort((a, b) => 
                  new Date(b.uploadedAt) - new Date(a.uploadedAt)
                );
                
                // Weź najnowszy załącznik
                const latestAttachment = sortedAttachments[0];
                
                if (!latestAttachment) return null;
                
                // Sprawdź czy to obraz czy PDF
                const isImage = latestAttachment.contentType && latestAttachment.contentType.startsWith('image/');
                const isPdf = latestAttachment.contentType && latestAttachment.contentType === 'application/pdf';
                
                return (
                  <Box sx={{ 
                    display: 'flex', 
                    flexDirection: 'column', 
                    alignItems: 'center',
                    height: '100%'
                  }}>
                    <Typography variant="subtitle2" color="text.secondary" gutterBottom sx={{ textAlign: 'center' }}>
                      {t('recipes.details.latestDesign')}
                    </Typography>
                    <Paper
                      elevation={2}
                      sx={{
                        width: '100%',
                        maxWidth: 300,
                        overflow: 'hidden',
                        borderRadius: 2
                      }}
                    >
                      {isImage ? (
                        <Box
                          component="img"
                          src={latestAttachment.downloadURL}
                          alt={latestAttachment.fileName}
                          sx={{
                            width: '100%',
                            height: 'auto',
                            maxHeight: 250,
                            objectFit: 'cover',
                            display: 'block'
                          }}
                        />
                      ) : isPdf ? (
                        <PdfMiniaturePreview 
                          pdfUrl={latestAttachment.downloadURL}
                          fileName={latestAttachment.fileName}
                          onClick={() => window.open(latestAttachment.downloadURL, '_blank')}
                        />
                      ) : (
                        <Box sx={{ 
                          height: 250, 
                          display: 'flex', 
                          alignItems: 'center', 
                          justifyContent: 'center',
                          bgcolor: 'action.hover' 
                        }}>
                          <Typography variant="body2" color="text.secondary">
                            Nieobsługiwany format pliku
                          </Typography>
                        </Box>
                      )}
                      <Box sx={{ p: 1 }}>
                        <Typography variant="caption" color="text.secondary" sx={{ 
                          display: 'block',
                          textAlign: 'center',
                          fontSize: '0.75rem'
                        }}>
                          {latestAttachment.fileName}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ 
                          display: 'block',
                          textAlign: 'center',
                          fontSize: '0.7rem'
                        }}>
                          Przesłano: {new Date(latestAttachment.uploadedAt).toLocaleDateString('pl-PL')}
                        </Typography>
                      </Box>
                    </Paper>
                    <Typography variant="caption" color="primary" sx={{ 
                      mt: 1, 
                      textAlign: 'center',
                      fontSize: '0.75rem'
                    }}>
                      {t('recipes.designAttachments.clickToSeeAllAttachments')}
                    </Typography>
                  </Box>
                );
              })()}
            </Grid>
          </Grid>
        </Box>

        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tabs value={tabValue} onChange={handleTabChange} aria-label="recipe tabs">
            <Tab label={t('recipes.tabs.ingredientsAndInstructions')} id="recipe-tab-0" />
            <Tab label={t('recipes.tabs.designAttachments')} id="recipe-tab-1" />
            <Tab label={t('recipes.tabs.versionHistory')} id="recipe-tab-2" />
          </Tabs>
        </Box>

        <TabPanel value={tabValue} index={0}>
          <Grid container spacing={4}>
            <Grid item xs={12} md={12}>
              <Typography variant="h6" gutterBottom>{t('recipes.details.ingredients.title')}</Typography>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>{t('recipes.details.ingredients.ingredient')}</TableCell>
                      <TableCell align="right">{t('recipes.details.ingredients.quantity')}</TableCell>
                      <TableCell>{t('recipes.details.ingredients.unit')}</TableCell>
                      <TableCell>{t('recipes.details.ingredients.casNumber')}</TableCell>
                      <TableCell>{t('recipes.details.ingredients.notes')}</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {sortIngredientsByQuantity(recipe.ingredients).map((ingredient, index) => (
                      <TableRow key={index}>
                        <TableCell component="th" scope="row" sx={{ wordBreak: 'break-word' }}>
                          {ingredient.name}
                        </TableCell>
                        <TableCell align="right">{ingredient.quantity}</TableCell>
                        <TableCell>{ingredient.unit}</TableCell>
                        <TableCell>{ingredient.casNumber || '-'}</TableCell>
                        <TableCell sx={{ wordBreak: 'break-word' }}>
                          {ingredient.notes || '-'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
              
              {/* Sekcja składników odżywczych */}
              {recipe.micronutrients && recipe.micronutrients.length > 0 && (
                <Box sx={{ mt: 3 }}>
                  <Typography variant="h6" gutterBottom>{t('recipes.details.nutrients.title')}</Typography>
                  <TableContainer>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>{t('recipes.details.nutrients.code')}</TableCell>
                          <TableCell>{t('recipes.details.nutrients.name')}</TableCell>
                          <TableCell align="right">{t('recipes.details.nutrients.quantity')}</TableCell>
                          <TableCell>{t('recipes.details.nutrients.unit')}</TableCell>
                          <TableCell>{t('recipes.details.nutrients.category')}</TableCell>
                          <TableCell>{t('recipes.details.nutrients.notes')}</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {recipe.micronutrients.map((micronutrient, index) => (
                          <TableRow key={index}>
                            <TableCell sx={{ 
                              fontWeight: 'bold', 
                              color: micronutrient.category === 'Witaminy' ? 'success.main' : 
                                     micronutrient.category === 'Minerały' ? 'info.main' :
                                     micronutrient.category === 'Makroelementy' ? 'primary.main' :
                                     micronutrient.category === 'Energia' ? 'warning.main' :
                                     'text.primary'
                            }}>
                              {micronutrient.code}
                            </TableCell>
                            <TableCell component="th" scope="row" sx={{ wordBreak: 'break-word' }}>
                              {micronutrient.name}
                            </TableCell>
                            <TableCell align="right">{micronutrient.quantity}</TableCell>
                            <TableCell>{micronutrient.unit}</TableCell>
                            <TableCell>
                              <Chip 
                                size="small" 
                                color={
                                  micronutrient.category === 'Witaminy' ? 'success' :
                                  micronutrient.category === 'Minerały' ? 'info' :
                                  micronutrient.category === 'Makroelementy' ? 'primary' :
                                  micronutrient.category === 'Energia' ? 'warning' :
                                  'default'
                                } 
                                label={micronutrient.category} 
                                sx={{ borderRadius: '16px' }}
                              />
                            </TableCell>
                            <TableCell sx={{ wordBreak: 'break-word' }}>
                              {micronutrient.notes || '-'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Box>
              )}
            </Grid>
            <Grid item xs={12} md={7}>
              <Typography variant="h6" gutterBottom>{t('recipes.details.additionalNotes')}</Typography>
              <Typography variant="body1" paragraph style={{ whiteSpace: 'pre-line' }}>
                                  {recipe.notes || t('recipes.details.noAdditionalNotes')}
              </Typography>
            </Grid>
          </Grid>
        </TabPanel>

        <TabPanel value={tabValue} index={1}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h6">{t('recipes.designAttachments.productDesignTitle')}</Typography>
            <Button
              variant="outlined"
              startIcon={<EditIcon />}
              component={Link}
              to={`/recipes/${id}/edit`}
              size="small"
            >
              {t('recipes.editRecipe')}
            </Button>
          </Box>
          
          {recipe.designAttachments && recipe.designAttachments.length > 0 && (
            <Alert severity="info" sx={{ mb: 2 }}>
              {t('recipes.designAttachments.editToManageAttachments')}
            </Alert>
          )}
          
          <RecipeDesignAttachments
            recipeId={id}
            attachments={recipe.designAttachments || []}
            onAttachmentsChange={() => {
              // Odśwież dane receptury po zmianie załączników
              fetchRecipe();
            }}
            disabled={true}
            showTitle={false}
            viewOnly={true}
          />
        </TabPanel>

        <TabPanel value={tabValue} index={2}>
          <Typography variant="h6" gutterBottom>{t('recipes.details.versionHistory.title')}</Typography>
          
          {selectedVersions.length > 0 && (
            <Box sx={{ mb: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexDirection: { xs: 'column', sm: 'row' } }}>
              <Box sx={{ mb: { xs: 2, sm: 0 }, width: { xs: '100%', sm: 'auto' } }}>
                <Typography variant="body2">
                  {t('recipes.details.versionHistory.selected', { 
                    count: selectedVersions.length, 
                    type: selectedVersions.length === 1 ? t('recipes.details.versionHistory.version') : t('recipes.details.versionHistory.versions')
                  })}
                </Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', mt: 1 }}>
                  {selectedVersions.map(v => (
                    <Chip 
                      key={v.id}
                      label={t('recipes.details.versionHistory.versionLabel', { version: v.version })}
                      size="small"
                      onDelete={() => setSelectedVersions(selectedVersions.filter(sv => sv.id !== v.id))}
                      sx={{ mr: 1, mb: 1 }}
                    />
                  ))}
                </Box>
              </Box>
              <Button
                variant="outlined"
                startIcon={<CompareIcon />}
                disabled={selectedVersions.length !== 2}
                onClick={handleCompareVersions}
                fullWidth={false}
                sx={{ width: { xs: '100%', sm: 'auto' } }}
              >
                {t('recipes.details.versionHistory.compareVersions')}
              </Button>
            </Box>
          )}
          
          <List>
            {versions.map((version) => (
              <React.Fragment key={version.id}>
                <ListItem
                  secondaryAction={
                    <Box>
                      <Tooltip title={t('recipes.details.versionHistory.selectToCompare')}>
                        <IconButton 
                          edge="end" 
                          onClick={() => handleVersionSelect(version)}
                          color={selectedVersions.some(v => v.id === version.id) ? 'primary' : 'default'}
                        >
                          <CompareIcon />
                        </IconButton>
                      </Tooltip>
                      {version.version !== recipe.version && (
                        <Tooltip title={t('recipes.details.versionHistory.restoreVersion')}>
                          <IconButton 
                            edge="end" 
                            onClick={() => handleRestoreVersion(version)}
                            sx={{ ml: 1 }}
                          >
                            <RestoreIcon />
                          </IconButton>
                        </Tooltip>
                      )}
                    </Box>
                  }
                >
                  <ListItemText
                    primary={
                      <Box sx={{ display: 'flex', alignItems: 'center' }}>
                        <Typography variant="subtitle1">
                          {t('recipes.details.versionHistory.versionLabel', { version: version.version })}
                        </Typography>
                        {version.restoredFrom && (
                          <Chip 
                            label={t('recipes.details.versionHistory.restoredFrom', { version: version.restoredFrom })}
                            size="small"
                            color="info"
                            sx={{ ml: 2 }}
                          />
                        )}
                        {version.version === recipe.version && (
                          <Chip 
                            label={t('recipes.details.versionHistory.current')}
                            size="small"
                            color="success"
                            sx={{ ml: 2 }}
                          />
                        )}
                      </Box>
                    }
                    secondary={t('recipes.details.versionHistory.created', { date: formatDate(version.createdAt), author: version.createdBy })}
                  />
                </ListItem>
                <Divider />
              </React.Fragment>
            ))}
          </List>
          
          {versions.length === 0 && (
            <Typography variant="body1">
              {t('recipes.details.versionHistory.noHistory')}
            </Typography>
          )}
        </TabPanel>
      </Paper>

      {/* Dialog porównania wersji */}
      <Dialog
        open={comparisonOpen}
        onClose={() => setComparisonOpen(false)}
        maxWidth="lg"
        fullWidth
      >
        <DialogTitle>
          {t('recipes.details.comparison.title')}
          <IconButton
            aria-label="close"
            onClick={() => setComparisonOpen(false)}
            sx={{
              position: 'absolute',
              right: 8,
              top: 8,
            }}
          >
            <ArrowBackIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          {selectedVersions.length === 2 && (
            <RecipeVersionComparison
              currentVersion={selectedVersions[1].version > selectedVersions[0].version ? selectedVersions[1] : selectedVersions[0]}
              previousVersion={selectedVersions[1].version > selectedVersions[0].version ? selectedVersions[0] : selectedVersions[1]}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog potwierdzenia przywrócenia wersji */}
      <Dialog
        open={restoreDialogOpen}
        onClose={() => !restoringVersion && setRestoreDialogOpen(false)}
      >
        <DialogTitle>{t('recipes.details.restore.title')}</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {t('recipes.details.restore.confirm', { version: versionToRestore?.version })}
            {t('recipes.details.restore.description')}
          </DialogContentText>
          <Alert severity="warning" sx={{ mt: 2 }}>
            {t('recipes.details.restore.warning')}
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button 
            onClick={() => setRestoreDialogOpen(false)} 
            disabled={restoringVersion}
          >
            {t('recipes.details.restore.cancel')}
          </Button>
          <Button 
            onClick={confirmRestoreVersion} 
            variant="contained" 
            color="primary"
            disabled={restoringVersion}
          >
            {restoringVersion ? t('recipes.details.restore.restoring') : t('recipes.details.restore.restore')}
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default RecipeDetailsPage;