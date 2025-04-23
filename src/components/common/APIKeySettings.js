import React, { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  CardActions,
  Button,
  Typography,
  TextField,
  FormControlLabel,
  Switch,
  InputAdornment,
  Grid,
  CircularProgress,
  Box,
  Alert
} from '@mui/material';
import {
  Key as KeyIcon,
  Save as SaveIcon
} from '@mui/icons-material';
import { useAuth } from '../../contexts/AuthContext';
import { useNotification } from '../../hooks/useNotification';
import { getSystemSettings, saveSystemSettings, getGlobalOpenAIApiKey, saveGlobalOpenAIApiKey } from '../../services/settingsService';

const APIKeySettings = () => {
  const { currentUser } = useAuth();
  const { showSuccess, showError } = useNotification();
  
  // Stany dla ustawień globalnego klucza API
  const [apiKeyLoading, setApiKeyLoading] = useState(false);
  const [globalApiKey, setGlobalApiKey] = useState('');
  const [hasGlobalApiKey, setHasGlobalApiKey] = useState(false);
  const [useGlobalApiKey, setUseGlobalApiKey] = useState(false);
  const [saveSettingsLoading, setSaveSettingsLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // Pobierz aktualne ustawienia
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        setError(null);
        // Pobierz ustawienia systemowe
        const settings = await getSystemSettings();
        setUseGlobalApiKey(settings.useGlobalApiKey || false);
        
        // Sprawdź czy istnieje globalny klucz API
        const apiKey = await getGlobalOpenAIApiKey();
        if (apiKey) {
          setGlobalApiKey('•'.repeat(apiKey.length > 10 ? 10 : apiKey.length)); // Maski dla bezpieczeństwa
          setHasGlobalApiKey(true);
        }
      } catch (error) {
        console.error('Błąd podczas pobierania ustawień:', error);
        setError('Nie udało się pobrać ustawień systemowych. Szczegóły: ' + error.message);
        showError('Nie udało się pobrać ustawień systemowych');
      }
    };
    
    fetchSettings();
  }, [showError]);
  
  // Obsługa zapisu globalnego klucza API
  const handleSaveGlobalApiKey = async () => {
    if (!currentUser?.uid) {
      showError('Musisz być zalogowany, aby zapisać klucz API');
      return;
    }
    
    if (!globalApiKey || globalApiKey.includes('•')) {
      return;
    }
    
    try {
      setError(null);
      setApiKeyLoading(true);
      await saveGlobalOpenAIApiKey(globalApiKey, currentUser.uid);
      setHasGlobalApiKey(true);
      showSuccess('Globalny klucz API został zapisany');
      
      // Zastąp faktyczny klucz maskami dla bezpieczeństwa
      setGlobalApiKey('•'.repeat(globalApiKey.length > 10 ? 10 : globalApiKey.length));
    } catch (error) {
      console.error('Błąd podczas zapisywania globalnego klucza API:', error);
      setError('Nie udało się zapisać globalnego klucza API. Szczegóły: ' + error.message);
      showError('Nie udało się zapisać globalnego klucza API');
    } finally {
      setApiKeyLoading(false);
    }
  };
  
  // Obsługa zmiany przełącznika "Użyj globalnego klucza API"
  const handleToggleUseGlobalApiKey = async () => {
    const newValue = !useGlobalApiKey;
    setUseGlobalApiKey(newValue);
    
    try {
      setError(null);
      setSaveSettingsLoading(true);
      await saveSystemSettings({ useGlobalApiKey: newValue }, currentUser.uid);
      showSuccess(`${newValue ? 'Włączono' : 'Wyłączono'} używanie globalnego klucza API`);
    } catch (error) {
      console.error('Błąd podczas zapisywania ustawień systemowych:', error);
      setError('Nie udało się zapisać ustawień systemowych. Szczegóły: ' + error.message);
      showError('Nie udało się zapisać ustawień systemowych');
      // Przywróć poprzednią wartość w przypadku błędu
      setUseGlobalApiKey(!newValue);
    } finally {
      setSaveSettingsLoading(false);
    }
  };

  return (
    <Card sx={{ mb: 3 }}>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          Konfiguracja Asystenta AI
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Skonfiguruj globalny klucz API OpenAI, który będzie używany przez wszystkich użytkowników systemu.
          Użytkownicy nie będą musieli podawać własnych kluczy API.
        </Typography>
        
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        
        <Grid container spacing={2}>
          <Grid item xs={12}>
            <FormControlLabel
              control={
                <Switch
                  checked={useGlobalApiKey}
                  onChange={handleToggleUseGlobalApiKey}
                  disabled={saveSettingsLoading}
                />
              }
              label="Użyj globalnego klucza API dla wszystkich użytkowników"
            />
          </Grid>
          
          <Grid item xs={12}>
            <TextField
              label="Globalny klucz API OpenAI"
              variant="outlined"
              fullWidth
              value={globalApiKey}
              onChange={(e) => setGlobalApiKey(e.target.value)}
              placeholder="sk-..."
              disabled={apiKeyLoading}
              helperText={hasGlobalApiKey ? "Klucz API jest już zapisany. Wprowadź nowy, aby go zmienić." : ""}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <KeyIcon />
                  </InputAdornment>
                ),
              }}
            />
          </Grid>
        </Grid>
      </CardContent>
      <CardActions>
        <Button
          startIcon={apiKeyLoading ? <CircularProgress size={20} /> : <SaveIcon />}
          variant="contained"
          color="primary"
          onClick={handleSaveGlobalApiKey}
          disabled={apiKeyLoading || !globalApiKey || globalApiKey.includes('•')}
        >
          {apiKeyLoading ? 'Zapisywanie...' : 'Zapisz klucz API'}
        </Button>
      </CardActions>
    </Card>
  );
};

export default APIKeySettings; 