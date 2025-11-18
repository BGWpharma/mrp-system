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
import { 
  getSystemSettings, 
  saveSystemSettings, 
  getGlobalOpenAIApiKey, 
  saveGlobalOpenAIApiKey,
  getGlobalGeminiApiKey,
  saveGlobalGeminiApiKey
} from '../../services/settingsService';

const APIKeySettings = () => {
  const { currentUser } = useAuth();
  const { showSuccess, showError } = useNotification();
  
  // Stany dla ustawień globalnego klucza API OpenAI
  const [apiKeyLoading, setApiKeyLoading] = useState(false);
  const [globalApiKey, setGlobalApiKey] = useState('');
  const [hasGlobalApiKey, setHasGlobalApiKey] = useState(false);
  const [useGlobalApiKey, setUseGlobalApiKey] = useState(false);
  const [saveSettingsLoading, setSaveSettingsLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // Stany dla ustawień globalnego klucza API Gemini
  const [geminiKeyLoading, setGeminiKeyLoading] = useState(false);
  const [globalGeminiKey, setGlobalGeminiKey] = useState('');
  const [hasGlobalGeminiKey, setHasGlobalGeminiKey] = useState(false);
  const [useGlobalGeminiKey, setUseGlobalGeminiKey] = useState(false);
  
  // Pobierz aktualne ustawienia
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        setError(null);
        // Pobierz ustawienia systemowe
        const settings = await getSystemSettings();
        setUseGlobalApiKey(settings.useGlobalApiKey || false);
        setUseGlobalGeminiKey(settings.useGlobalGeminiKey || false);
        
        // Sprawdź czy istnieje globalny klucz API OpenAI
        const apiKey = await getGlobalOpenAIApiKey();
        if (apiKey) {
          setGlobalApiKey('•'.repeat(apiKey.length > 10 ? 10 : apiKey.length)); // Maski dla bezpieczeństwa
          setHasGlobalApiKey(true);
        }
        
        // Sprawdź czy istnieje globalny klucz API Gemini
        const geminiKey = await getGlobalGeminiApiKey();
        if (geminiKey) {
          setGlobalGeminiKey('•'.repeat(geminiKey.length > 10 ? 10 : geminiKey.length)); // Maski dla bezpieczeństwa
          setHasGlobalGeminiKey(true);
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
      showSuccess(`${newValue ? 'Włączono' : 'Wyłączono'} używanie globalnego klucza API OpenAI`);
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
  
  // Obsługa zapisu globalnego klucza API Gemini
  const handleSaveGlobalGeminiKey = async () => {
    if (!currentUser?.uid) {
      showError('Musisz być zalogowany, aby zapisać klucz API');
      return;
    }
    
    if (!globalGeminiKey || globalGeminiKey.includes('•')) {
      return;
    }
    
    try {
      setError(null);
      setGeminiKeyLoading(true);
      await saveGlobalGeminiApiKey(globalGeminiKey, currentUser.uid);
      setHasGlobalGeminiKey(true);
      showSuccess('Globalny klucz API Gemini został zapisany');
      
      // Zastąp faktyczny klucz maskami dla bezpieczeństwa
      setGlobalGeminiKey('•'.repeat(globalGeminiKey.length > 10 ? 10 : globalGeminiKey.length));
    } catch (error) {
      console.error('Błąd podczas zapisywania globalnego klucza API Gemini:', error);
      setError('Nie udało się zapisać globalnego klucza API Gemini. Szczegóły: ' + error.message);
      showError('Nie udało się zapisać globalnego klucza API Gemini');
    } finally {
      setGeminiKeyLoading(false);
    }
  };
  
  // Obsługa zmiany przełącznika "Użyj globalnego klucza API Gemini"
  const handleToggleUseGlobalGeminiKey = async () => {
    const newValue = !useGlobalGeminiKey;
    setUseGlobalGeminiKey(newValue);
    
    try {
      setError(null);
      setSaveSettingsLoading(true);
      await saveSystemSettings({ useGlobalGeminiKey: newValue }, currentUser.uid);
      showSuccess(`${newValue ? 'Włączono' : 'Wyłączono'} używanie globalnego klucza API Gemini`);
    } catch (error) {
      console.error('Błąd podczas zapisywania ustawień systemowych:', error);
      setError('Nie udało się zapisać ustawień systemowych. Szczegóły: ' + error.message);
      showError('Nie udało się zapisać ustawień systemowych');
      // Przywróć poprzednią wartość w przypadku błędu
      setUseGlobalGeminiKey(!newValue);
    } finally {
      setSaveSettingsLoading(false);
    }
  };

  return (
    <>
      {/* OpenAI API Configuration */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Konfiguracja OpenAI API (Legacy)
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Skonfiguruj globalny klucz API OpenAI, który będzie używany przez wszystkich użytkowników systemu.
            <br />
            <strong>Uwaga:</strong> System obecnie używa Google Gemini. OpenAI jest dostępny jako fallback.
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
    
    {/* Gemini API Configuration */}
    <Card sx={{ mb: 3 }}>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          🧠 Konfiguracja Google Gemini API (Rekomendowane)
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Skonfiguruj globalny klucz API Google Gemini 2.5 Pro, który będzie używany przez wszystkich użytkowników systemu.
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          <strong>Zalety:</strong> 1M tokenów kontekstu, Thinking Mode, lepsze rozumowanie, darmowy model dla prostych zapytań.
          <br />
          📝 <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer">Uzyskaj klucz API Gemini</a>
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
                  checked={useGlobalGeminiKey}
                  onChange={handleToggleUseGlobalGeminiKey}
                  disabled={saveSettingsLoading}
                />
              }
              label="Użyj globalnego klucza API Gemini dla wszystkich użytkowników"
            />
          </Grid>
          
          <Grid item xs={12}>
            <TextField
              label="Globalny klucz API Google Gemini"
              variant="outlined"
              fullWidth
              value={globalGeminiKey}
              onChange={(e) => setGlobalGeminiKey(e.target.value)}
              placeholder="AIza..."
              disabled={geminiKeyLoading}
              helperText={hasGlobalGeminiKey ? "Klucz API Gemini jest już zapisany. Wprowadź nowy, aby go zmienić." : "Wprowadź klucz API zaczynający się od 'AIza...'"}
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
          startIcon={geminiKeyLoading ? <CircularProgress size={20} /> : <SaveIcon />}
          variant="contained"
          color="primary"
          onClick={handleSaveGlobalGeminiKey}
          disabled={geminiKeyLoading || !globalGeminiKey || globalGeminiKey.includes('•')}
        >
          {geminiKeyLoading ? 'Zapisywanie...' : 'Zapisz klucz API Gemini'}
        </Button>
      </CardActions>
    </Card>
    </>
  );
};

export default APIKeySettings; 