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
  CircularProgress
} from '@mui/material';
import {
  Settings as SettingsIcon,
  Refresh as RefreshIcon
} from '@mui/icons-material';
import { useAuth } from '../../contexts/AuthContext';
import { useNotification } from '../../hooks/useNotification';
import { migrateAIMessageLimits, migrateNutritionalComponents } from '../../services/migrationService';
import APIKeySettings from '../../components/common/APIKeySettings';
import CounterEditor from '../../components/admin/CounterEditor';
import FormOptionsManager from '../../components/admin/FormOptionsManager';
import NutritionalComponentsManager from '../../components/admin/NutritionalComponentsManager';

/**
 * Strona dla administratorów z narzędziami do zarządzania systemem
 */
const SystemManagementPage = () => {
  const { currentUser } = useAuth();
  const { showSuccess, showError } = useNotification();
  const [isLoading, setIsLoading] = useState(false);
  const [migrationResults, setMigrationResults] = useState(null);
  const [isLoadingComponents, setIsLoadingComponents] = useState(false);
  const [componentsMigrationResults, setComponentsMigrationResults] = useState(null);
  
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
        
        {/* Tutaj można dodać więcej narzędzi administracyjnych */}
        
      </Paper>
    </Container>
  );
};

export default SystemManagementPage; 