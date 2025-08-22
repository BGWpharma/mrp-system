import React, { useState } from 'react';
import {
  Container,
  Paper,
  Typography,
  Card,
  CardContent,
  CardActions,
  Button,
  Divider,
  Alert,
  Snackbar,
  Box,
  List,
  ListItem,
  ListItemText,
  CircularProgress,
  Grid,
  TextField
} from '@mui/material';
import {
  Settings as SettingsIcon,
  Refresh as RefreshIcon,
  CleaningServices as CleaningIcon,
  Search as SearchIcon
} from '@mui/icons-material';
import { useAuth } from '../../contexts/AuthContext';
import { useNotification } from '../../hooks/useNotification';
import { migrateAIMessageLimits, migrateNutritionalComponents, cleanupOrphanedProductionHistory } from '../../services/migrationService';
import APIKeySettings from '../../components/common/APIKeySettings';
import CounterEditor from '../../components/admin/CounterEditor';
import FormOptionsManager from '../../components/admin/FormOptionsManager';
import NutritionalComponentsManager from '../../components/admin/NutritionalComponentsManager';
import { 
  migrateInventoryItemsFromV1toV2, 
  checkInventoryIntegrityAndFix,
  bulkUpdateSupplierPricesFromCompletedPOs
} from '../../services/inventory';

/**
 * Strona dla administratorów z narzędziami do zarządzania systemem
 */
const SystemManagementPage = () => {
  const { currentUser } = useAuth();
  const { showSuccess, showError, showNotification } = useNotification();
  const [isLoading, setIsLoading] = useState(false);
  const [migrationResults, setMigrationResults] = useState(null);
  const [isLoadingComponents, setIsLoadingComponents] = useState(false);
  const [componentsMigrationResults, setComponentsMigrationResults] = useState(null);
  const [updatingPrices, setUpdatingPrices] = useState(false);
  const [priceUpdateDays, setPriceUpdateDays] = useState(30);
  
  // Nowe stany dla czyszczenia historii produkcji
  const [cleanupLoading, setCleanupLoading] = useState(false);
  const [cleanupResults, setCleanupResults] = useState(null);
  
  // Funkcja do uruchomienia migracji limitów wiadomości AI
  const handleRunAILimitsMigration = async () => {
    try {
      setIsLoading(true);
      const results = await migrateAIMessageLimits();
      
      if (results.success) {
        showSuccess(`Migracja zakończona. Zaktualizowano ${results.updated} użytkowników.`);
        setMigrationResults(results);
      } else {
        showError(`Błąd podczas migracji: ${results.error}`);
      }
    } catch (error) {
      console.error('Błąd podczas uruchamiania migracji:', error);
      showError('Wystąpił błąd podczas migracji. Sprawdź konsolę.');
    } finally {
      setIsLoading(false);
    }
  };

  // Funkcja do uruchomienia migracji składników odżywczych
  const handleRunComponentsMigration = async () => {
    try {
      setIsLoadingComponents(true);
      const results = await migrateNutritionalComponents();
      
      if (results.success) {
        showSuccess(`Migracja składników zakończona. Dodano ${results.added} składników, pominięto ${results.skipped}.`);
        setComponentsMigrationResults(results);
      } else {
        showError(`Błąd podczas migracji składników: ${results.error}`);
      }
    } catch (error) {
      console.error('Błąd podczas uruchamiania migracji składników:', error);
      showError('Wystąpił błąd podczas migracji składników. Sprawdź konsolę.');
    } finally {
      setIsLoadingComponents(false);
    }
  };

  const handleBulkUpdateSupplierPrices = async () => {
    if (!window.confirm(`Czy na pewno chcesz zaktualizować ceny dostawców na podstawie zamówień z ostatnich ${priceUpdateDays} dni? Ta operacja może trwać kilka minut.`)) {
      return;
    }

    try {
      setUpdatingPrices(true);
      showNotification('Rozpoczynam masową aktualizację cen dostawców...', 'info');

      const result = await bulkUpdateSupplierPricesFromCompletedPOs(currentUser.uid, priceUpdateDays);

      if (result.success) {
        showNotification(
          `Zakończono masową aktualizację cen dostawców. ${result.message}`,
          'success'
        );
      } else {
        showNotification('Błąd podczas masowej aktualizacji cen dostawców', 'error');
      }
    } catch (error) {
      console.error('Błąd podczas masowej aktualizacji cen dostawców:', error);
      showNotification('Błąd podczas masowej aktualizacji cen dostawców: ' + error.message, 'error');
    } finally {
      setUpdatingPrices(false);
    }
  };

  // Funkcja do sprawdzenia sierocych wpisów historii produkcji
  const handleCheckOrphanedHistory = async () => {
    try {
      setCleanupLoading(true);
      setCleanupResults(null);
      
      const results = await cleanupOrphanedProductionHistory(true); // dry run
      
      if (results.success) {
        setCleanupResults(results);
        if (results.orphanedCount > 0) {
          showNotification(`Znaleziono ${results.orphanedCount} sierocych wpisów historii produkcji. Sprawdź szczegóły w konsoli.`, 'warning');
        } else {
          showSuccess('Nie znaleziono sierocych wpisów historii produkcji. Baza danych jest czysta!');
        }
      } else {
        showError(`Błąd podczas sprawdzania: ${results.error}`);
      }
    } catch (error) {
      console.error('Błąd podczas sprawdzania sierocych wpisów:', error);
      showError('Wystąpił błąd podczas sprawdzania. Sprawdź konsolę.');
    } finally {
      setCleanupLoading(false);
    }
  };

  // Funkcja do usunięcia sierocych wpisów historii produkcji
  const handleCleanupOrphanedHistory = async () => {
    if (!cleanupResults || cleanupResults.orphanedCount === 0) {
      showError('Najpierw sprawdź sierocze wpisy!');
      return;
    }

    const confirmMessage = `Czy na pewno chcesz usunąć ${cleanupResults.orphanedCount} sierocych wpisów historii produkcji? Ta operacja jest nieodwracalna!`;
    
    if (!window.confirm(confirmMessage)) {
      return;
    }

    try {
      setCleanupLoading(true);
      
      const results = await cleanupOrphanedProductionHistory(false); // rzeczywiste usuwanie
      
      if (results.success) {
        showSuccess(`Pomyślnie usunięto ${results.deletedCount} sierocych wpisów historii produkcji.`);
        setCleanupResults(results);
      } else {
        showError(`Błąd podczas czyszczenia: ${results.error}`);
      }
    } catch (error) {
      console.error('Błąd podczas czyszczenia sierocych wpisów:', error);
      showError('Wystąpił błąd podczas czyszczenia. Sprawdź konsolę.');
    } finally {
      setCleanupLoading(false);
    }
  };

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
        <SettingsIcon sx={{ mr: 2, fontSize: 30 }} />
        <Typography variant="h4">Zarządzanie systemem</Typography>
      </Box>

      <Paper elevation={2} sx={{ p: 3, mb: 4 }}>
        <Typography variant="h5" gutterBottom>
          Narzędzia administracyjne
        </Typography>
        
        <Divider sx={{ my: 2 }} />
        
        {/* Sekcja konfiguracji Asystenta AI */}
        <APIKeySettings />
        
        {/* Edytor liczników systemowych */}
        <CounterEditor />
        
        {/* Zarządzanie opcjami formularzy */}
        <FormOptionsManager />
        
        {/* Zarządzanie składnikami odżywczymi */}
        <NutritionalComponentsManager />
        
        {/* NOWA SEKCJA: Czyszczenie sierocych wpisów historii produkcji */}
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              🧹 Czyszczenie historii produkcji
            </Typography>
            <Typography variant="body2" color="text.secondary">
              To narzędzie znajdzie i usunie wpisy z historii produkcji, które nie mają odpowiadających im zadań produkcyjnych.
              Takie "sierocze" wpisy mogą powstać gdy zadanie produkcyjne zostało usunięte, ale jego historia nie została oczyszczona.
              Wpisy te powodują wyświetlanie "Brak MO" w raportach czasu produkcji.
            </Typography>
            
            {cleanupResults && (
              <Box sx={{ mt: 2 }}>
                <Alert 
                  severity={
                    cleanupResults.orphanedCount === 0 ? "success" :
                    cleanupResults.dryRun ? "warning" : "info"
                  }
                >
                  {cleanupResults.dryRun ? 'Sprawdzanie zakończone' : 'Czyszczenie zakończone'}. Wyniki:
                </Alert>
                <List dense>
                  <ListItem>
                    <ListItemText 
                      primary={`Sierocze wpisy: ${cleanupResults.orphanedCount}`} 
                    />
                  </ListItem>
                  {!cleanupResults.dryRun && (
                    <ListItem>
                      <ListItemText 
                        primary={`Usunięto: ${cleanupResults.deletedCount} wpisów`} 
                      />
                    </ListItem>
                  )}
                  {cleanupResults.errors > 0 && (
                    <ListItem>
                      <ListItemText 
                        primary={`Błędy: ${cleanupResults.errors}`} 
                        secondary="Sprawdź konsolę dla szczegółów" 
                      />
                    </ListItem>
                  )}
                </List>
                {cleanupResults.dryRun && cleanupResults.orphanedCount > 0 && (
                  <Alert severity="info" sx={{ mt: 1 }}>
                    Szczegóły sierocych wpisów zostały wyświetlone w konsoli przeglądarki (F12).
                  </Alert>
                )}
              </Box>
            )}
          </CardContent>
          <CardActions>
            <Button 
              startIcon={cleanupLoading ? <CircularProgress size={20} /> : <SearchIcon />}
              variant="outlined" 
              color="primary"
              onClick={handleCheckOrphanedHistory}
              disabled={cleanupLoading}
              sx={{ mr: 1 }}
            >
              {cleanupLoading ? 'Sprawdzanie...' : 'Sprawdź sierocze wpisy'}
            </Button>
            
            <Button 
              startIcon={cleanupLoading ? <CircularProgress size={20} /> : <CleaningIcon />}
              variant="contained" 
              color="warning"
              onClick={handleCleanupOrphanedHistory}
              disabled={cleanupLoading || !cleanupResults || cleanupResults.orphanedCount === 0}
            >
              {cleanupLoading ? 'Usuwanie...' : `Usuń ${cleanupResults?.orphanedCount || 0} wpisów`}
            </Button>
          </CardActions>
        </Card>
        
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Migracja limitów wiadomości AI
            </Typography>
            <Typography variant="body2" color="text.secondary">
              To narzędzie zaktualizuje wszystkich istniejących użytkowników, dodając im limity wiadomości AI
              w zależności od ich roli (Administrator: 250, Pracownik: 50).
              Użyj tego narzędzia tylko raz po dodaniu funkcji limitów wiadomości.
            </Typography>
            
            {migrationResults && (
              <Box sx={{ mt: 2 }}>
                <Alert severity={migrationResults.errors > 0 ? "warning" : "success"}>
                  Migracja zakończona. Wyniki:
                </Alert>
                <List dense>
                  <ListItem>
                    <ListItemText 
                      primary={`Zaktualizowano: ${migrationResults.updated} użytkowników`} 
                    />
                  </ListItem>
                  <ListItem>
                    <ListItemText 
                      primary={`Błędy: ${migrationResults.errors}`} 
                      secondary={migrationResults.error || ''} 
                    />
                  </ListItem>
                </List>
              </Box>
            )}
          </CardContent>
          <CardActions>
            <Button 
              startIcon={isLoading ? <CircularProgress size={20} /> : <RefreshIcon />}
              variant="contained" 
              color="primary"
              onClick={handleRunAILimitsMigration}
              disabled={isLoading}
            >
              {isLoading ? 'Przetwarzanie...' : 'Uruchom migrację'}
            </Button>
          </CardActions>
        </Card>

        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Migracja składników odżywczych
            </Typography>
            <Typography variant="body2" color="text.secondary">
              To narzędzie przeniesie wszystkie składniki odżywcze z kodu do bazy danych. 
              Obejmuje to makroelementy, witaminy, minerały, składniki aktywne i wartości energetyczne.
              Po migracji składniki będą pobierane z bazy danych zamiast z pliku constants.js.
            </Typography>
            
            {componentsMigrationResults && (
              <Box sx={{ mt: 2 }}>
                <Alert severity={componentsMigrationResults.errors > 0 ? "warning" : "success"}>
                  Migracja składników odżywczych zakończona. Wyniki:
                </Alert>
                <List dense>
                  <ListItem>
                    <ListItemText 
                      primary={`Łącznie składników: ${componentsMigrationResults.total}`} 
                    />
                  </ListItem>
                  <ListItem>
                    <ListItemText 
                      primary={`Dodano: ${componentsMigrationResults.added} składników`} 
                    />
                  </ListItem>
                  <ListItem>
                    <ListItemText 
                      primary={`Pominięto (już istniały): ${componentsMigrationResults.skipped}`} 
                    />
                  </ListItem>
                  <ListItem>
                    <ListItemText 
                      primary={`Błędy: ${componentsMigrationResults.errors}`} 
                      secondary={componentsMigrationResults.error || ''} 
                    />
                  </ListItem>
                </List>
              </Box>
            )}
          </CardContent>
          <CardActions>
            <Button 
              startIcon={isLoadingComponents ? <CircularProgress size={20} /> : <RefreshIcon />}
              variant="contained" 
              color="secondary"
              onClick={handleRunComponentsMigration}
              disabled={isLoadingComponents}
            >
              {isLoadingComponents ? 'Przetwarzanie...' : 'Migruj składniki odżywcze'}
            </Button>
          </CardActions>
        </Card>
        
        {/* Sekcja zarządzania cenami dostawców */}
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Zarządzanie cenami dostawców
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              Narzędzia do automatycznej aktualizacji cen dostawców na podstawie zakończonych zamówień zakupu.
            </Typography>

            <Grid container spacing={3}>
              <Grid item xs={12} md={6}>
                <Card variant="outlined">
                  <CardContent>
                    <Typography variant="h6" gutterBottom>
                      Masowa aktualizacja cen dostawców
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                      Automatycznie aktualizuje ceny dostawców na podstawie najnowszych zakończonych zamówień zakupu.
                    </Typography>

                    <Box sx={{ mb: 2 }}>
                      <TextField
                        type="number"
                        label="Liczba dni wstecz"
                        value={priceUpdateDays}
                        onChange={(e) => setPriceUpdateDays(parseInt(e.target.value) || 30)}
                        InputProps={{
                          inputProps: { min: 1, max: 365 }
                        }}
                        helperText="Ile dni wstecz sprawdzać zakończone zamówienia"
                        size="small"
                        sx={{ mb: 2 }}
                      />
                    </Box>

                    <Button
                      variant="contained"
                      onClick={handleBulkUpdateSupplierPrices}
                      disabled={updatingPrices}
                      startIcon={updatingPrices ? <CircularProgress size={20} /> : <RefreshIcon />}
                    >
                      {updatingPrices ? 'Aktualizowanie...' : 'Aktualizuj ceny dostawców'}
                    </Button>
                  </CardContent>
                </Card>
              </Grid>

              <Grid item xs={12} md={6}>
                <Card variant="outlined">
                  <CardContent>
                    <Typography variant="h6" gutterBottom>
                      Jak to działa?
                    </Typography>
                    <Typography variant="body2" component="div">
                      <ul>
                        <li>System przeszukuje zamówienia zakupu ze statusem "zakończone" z wybranego okresu</li>
                        <li>Dla każdej pozycji w zamówieniu sprawdza czy dostawca ma już przypisaną cenę</li>
                        <li>Jeśli cena istnieje i różni się od ceny w zamówieniu - aktualizuje ją</li>
                        <li>Jeśli ceny nie ma - tworzy nową z danymi z zamówienia</li>
                        <li>Zachowuje historię zmian cen dla każdego dostawcy</li>
                      </ul>
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>
          </CardContent>
        </Card>
      </Paper>
    </Container>
  );
};

export default SystemManagementPage;