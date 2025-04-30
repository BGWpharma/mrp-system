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
  Add as AddIcon
} from '@mui/icons-material';
import { getRecipeById, getRecipeVersions, getRecipeVersion, restoreRecipeVersion, deleteRecipe, updateRecipe } from '../../services/recipeService';
import { useNotification } from '../../hooks/useNotification';
import { formatDate } from '../../utils/formatters';
import { useAuth } from '../../hooks/useAuth';
import RecipeVersionComparison from '../../components/recipes/RecipeVersionComparison';
import { createInventoryItem, getAllInventoryItems } from '../../services/inventoryService';
import { db } from '../../services/firebase/config';
import { collection, query, where, limit, getDocs, doc, getDoc, updateDoc, orderBy } from 'firebase/firestore';
import { getAllWorkstations } from '../../services/workstationService';

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

  useEffect(() => {
    const fetchRecipeData = async () => {
      try {
        setLoading(true);
        await fetchRecipe();
        await fetchVersions();
        await fetchWorkstations();
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
      
      showSuccess(`Przywrócono recepturę do wersji ${versionToRestore.version}`);
      setRestoreDialogOpen(false);
      setVersionToRestore(null);
      setSelectedVersions([]);
    } catch (error) {
      showError('Błąd podczas przywracania wersji: ' + error.message);
      console.error('Error restoring version:', error);
    } finally {
      setRestoringVersion(false);
    }
  };

  // Funkcja do linkowania składników receptury z magazynem
  const linkIngredientsWithInventory = async (resetLinks = false) => {
    if (!recipe || !recipe.ingredients || recipe.ingredients.length === 0) {
      showWarning('Receptura nie zawiera składników do powiązania');
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
          showInfo(`Usunięto powiązania dla ${resetCount} składników`);
          
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
        
        showSuccess(`Powiązano ${linkedCount} składników z magazynem`);
      }
      
      if (notFoundCount > 0) {
        showWarning(`Dla ${notFoundCount} składników nie znaleziono odpowiedników w magazynie`);
      }
      
      if (linkedCount === 0 && notFoundCount === 0 && !resetLinks) {
        showInfo('Wszystkie składniki są już powiązane z magazynem lub nie można znaleźć dopasowań');
      }
      
    } catch (error) {
      showError('Błąd podczas linkowania składników: ' + error.message);
      console.error('Error linking ingredients:', error);
    } finally {
      setLinking(false);
    }
  };

  if (loading) {
    return <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>Ładowanie receptury...</Container>;
  }

  if (!recipe) {
    return (
      <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
        <Typography variant="h5">Receptura nie została znaleziona</Typography>
        <Button 
          variant="contained" 
          component={Link} 
          to="/recipes"
          startIcon={<ArrowBackIcon />}
          sx={{ mt: 2 }}
        >
          Powrót do listy receptur
        </Button>
      </Container>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Button 
          startIcon={<ArrowBackIcon />} 
          onClick={() => navigate('/recipes')}
        >
          Powrót
        </Button>
        <Typography variant="h5">
          Szczegóły receptury
        </Typography>
        <Box>
          <Button 
            variant="outlined" 
            startIcon={<PrintIcon />}
            sx={{ mr: 1 }}
            onClick={() => window.print()}
          >
            Drukuj
          </Button>
          <Button 
            variant="contained" 
            color="primary" 
            component={Link}
            to={`/recipes/${id}/edit`}
            startIcon={<EditIcon />}
          >
            Edytuj
          </Button>
          
          <Button
            startIcon={<AddIcon />}
            color="secondary"
            onClick={() => linkIngredientsWithInventory(false)}
            disabled={linking}
            sx={{ ml: 2 }}
          >
            {linking ? 'Powiązywanie...' : 'Powiąż składniki'}
          </Button>
          
          <Button
            startIcon={<RestoreIcon />}
            color="warning"
            onClick={() => linkIngredientsWithInventory(true)}
            disabled={linking}
            sx={{ ml: 2 }}
          >
            Resetuj powiązania
          </Button>
        </Box>
      </Box>

      <Paper sx={{ mb: 3 }}>
        <Box sx={{ p: 3 }}>
          <Typography variant="h4" gutterBottom>
            {recipe.name}
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
            <Chip 
              label={recipe.status || 'Robocza'} 
              color={recipe.status === 'Zatwierdzona' ? 'success' : 'default'} 
              sx={{ mr: 2 }}
            />
            <Typography variant="subtitle1" color="text.secondary">
              Wersja: {recipe.version || 1} | Ostatnia aktualizacja: {formatDate(recipe.updatedAt)}
            </Typography>
          </Box>
          {recipe.description && (
            <Typography variant="body1" paragraph>
              {recipe.description}
            </Typography>
          )}
          <Grid container spacing={3}>
            <Grid item xs={12} md={6}>
              <Typography variant="subtitle2" color="text.secondary">
                Domyślne stanowisko produkcyjne: {recipe.defaultWorkstationId ? 
                  workstations.find(w => w.id === recipe.defaultWorkstationId)?.name || 'Nieznane stanowisko' : 
                  'Nie określono'}
              </Typography>
            </Grid>
            <Grid item xs={12} md={6}>
              <Typography variant="subtitle2" color="text.secondary">
                Czas/sztuka: {recipe.productionTimePerUnit ? `${parseFloat(recipe.productionTimePerUnit).toFixed(2)} min` : 'Nie określono'}
              </Typography>
            </Grid>
            <Grid item xs={12} md={6}>
              <Typography variant="subtitle2" color="text.secondary">
                Koszt/sztuka: {recipe.processingCostPerUnit ? `${recipe.processingCostPerUnit.toFixed(2)} EUR` : 'Nie określono'}
              </Typography>
            </Grid>
          </Grid>
        </Box>

        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tabs value={tabValue} onChange={handleTabChange} aria-label="recipe tabs">
            <Tab label="Składniki i instrukcje" id="recipe-tab-0" />
            <Tab label="Historia wersji" id="recipe-tab-1" />
          </Tabs>
        </Box>

        <TabPanel value={tabValue} index={0}>
          <Grid container spacing={4}>
            <Grid item xs={12} md={5}>
              <Typography variant="h6" gutterBottom>Składniki</Typography>
              <TableContainer>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>Składnik</TableCell>
                      <TableCell align="right">Ilość</TableCell>
                      <TableCell>Jednostka</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {recipe.ingredients.map((ingredient, index) => (
                      <TableRow key={index}>
                        <TableCell component="th" scope="row">
                          {ingredient.name}
                        </TableCell>
                        <TableCell align="right">{ingredient.quantity}</TableCell>
                        <TableCell>{ingredient.unit}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Grid>
            <Grid item xs={12} md={7}>
              <Typography variant="h6" gutterBottom>Notatki dodatkowe</Typography>
              <Typography variant="body1" paragraph style={{ whiteSpace: 'pre-line' }}>
                {recipe.notes || 'Brak dodatkowych notatek'}
              </Typography>
            </Grid>
          </Grid>
        </TabPanel>

        <TabPanel value={tabValue} index={1}>
          <Typography variant="h6" gutterBottom>Historia wersji</Typography>
          
          {selectedVersions.length > 0 && (
            <Box sx={{ mb: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Box>
                <Typography variant="body2">
                  Wybrano {selectedVersions.length} {selectedVersions.length === 1 ? 'wersję' : 'wersje'}
                </Typography>
                {selectedVersions.map(v => (
                  <Chip 
                    key={v.id}
                    label={`Wersja ${v.version}`}
                    size="small"
                    onDelete={() => setSelectedVersions(selectedVersions.filter(sv => sv.id !== v.id))}
                    sx={{ mr: 1, mt: 1 }}
                  />
                ))}
              </Box>
              <Button
                variant="outlined"
                startIcon={<CompareIcon />}
                disabled={selectedVersions.length !== 2}
                onClick={handleCompareVersions}
              >
                Porównaj wersje
              </Button>
            </Box>
          )}
          
          <List>
            {versions.map((version) => (
              <React.Fragment key={version.id}>
                <ListItem
                  secondaryAction={
                    <Box>
                      <Tooltip title="Wybierz do porównania">
                        <IconButton 
                          edge="end" 
                          onClick={() => handleVersionSelect(version)}
                          color={selectedVersions.some(v => v.id === version.id) ? 'primary' : 'default'}
                        >
                          <CompareIcon />
                        </IconButton>
                      </Tooltip>
                      {version.version !== recipe.version && (
                        <Tooltip title="Przywróć tę wersję">
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
                          Wersja {version.version}
                        </Typography>
                        {version.restoredFrom && (
                          <Chip 
                            label={`Przywrócona z wersji ${version.restoredFrom}`}
                            size="small"
                            color="info"
                            sx={{ ml: 2 }}
                          />
                        )}
                        {version.version === recipe.version && (
                          <Chip 
                            label="Aktualna"
                            size="small"
                            color="success"
                            sx={{ ml: 2 }}
                          />
                        )}
                      </Box>
                    }
                    secondary={`Utworzona: ${formatDate(version.createdAt)} | Autor: ${version.createdBy}`}
                  />
                </ListItem>
                <Divider />
              </React.Fragment>
            ))}
          </List>
          
          {versions.length === 0 && (
            <Typography variant="body1">
              Brak historii wersji dla tej receptury.
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
          Porównanie wersji receptury
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
        <DialogTitle>Przywróć wersję receptury</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Czy na pewno chcesz przywrócić recepturę do wersji {versionToRestore?.version}?
            Ta operacja utworzy nową wersję receptury bazującą na wybranej wersji.
          </DialogContentText>
          <Alert severity="warning" sx={{ mt: 2 }}>
            Uwaga: Przywrócenie spowoduje nadpisanie aktualnej wersji receptury.
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button 
            onClick={() => setRestoreDialogOpen(false)} 
            disabled={restoringVersion}
          >
            Anuluj
          </Button>
          <Button 
            onClick={confirmRestoreVersion} 
            variant="contained" 
            color="primary"
            disabled={restoringVersion}
          >
            {restoringVersion ? 'Przywracanie...' : 'Przywróć'}
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default RecipeDetailsPage;