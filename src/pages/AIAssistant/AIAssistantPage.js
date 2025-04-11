import React, { useState, useEffect, useRef } from 'react';
import { 
  Container, 
  Paper, 
  Typography, 
  TextField, 
  Button, 
  Box, 
  CircularProgress, 
  Divider, 
  Card, 
  CardContent,
  IconButton,
  Avatar,
  List,
  ListItem,
  ListItemText,
  ListItemAvatar,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  Snackbar,
  InputAdornment,
  Collapse
} from '@mui/material';
import { 
  Send as SendIcon, 
  SmartToy as BotIcon,
  Person as PersonIcon,
  Clear as ClearIcon,
  Add as AddIcon,
  Settings as SettingsIcon,
  Key as KeyIcon,
  HelpOutline as HelpIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  Payments as PaymentsIcon,
  Error as ErrorIcon
} from '@mui/icons-material';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { useNotification } from '../../hooks/useNotification';
import { 
  getUserConversations, 
  getConversationMessages, 
  createConversation, 
  addMessageToConversation, 
  processAIQuery,
  deleteConversation,
  getOpenAIApiKey,
  saveOpenAIApiKey
} from '../../services/aiAssistantService';
import ApiKeyInstructions from './ApiKeyInstructions';
import APIQuotaAlert from './APIQuotaAlert';

// Ten komponent będzie przyszłościowo używał API do komunikacji z modelem AI
// Na razie implementujemy podstawowy interfejs i strukturę
const AIAssistantPage = () => {
  const { mode } = useTheme();
  const { currentUser } = useAuth();
  const { showSuccess, showError } = useNotification();
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [conversationHistory, setConversationHistory] = useState([]);
  const [currentConversationId, setCurrentConversationId] = useState(null);
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [openSettingsDialog, setOpenSettingsDialog] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [saveApiKeyLoading, setSaveApiKeyLoading] = useState(false);
  const [hasApiKey, setHasApiKey] = useState(false);
  const [openAlert, setOpenAlert] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const [openInstructionsDialog, setOpenInstructionsDialog] = useState(false);
  const [openQuotaAlert, setOpenQuotaAlert] = useState(false);
  const [openQuotaDialog, setOpenQuotaDialog] = useState(false);
  const messagesEndRef = useRef(null);

  // Otwórz dialog z informacjami o przekroczeniu limitu
  const handleOpenQuotaDialog = () => {
    setOpenQuotaDialog(true);
    setOpenQuotaAlert(false);
  };

  // Zamknij dialog z informacjami o przekroczeniu limitu
  const handleCloseQuotaDialog = () => {
    setOpenQuotaDialog(false);
  };

  // Pobierz historię konwersacji użytkownika
  useEffect(() => {
    const fetchConversations = async () => {
      if (!currentUser?.uid) return;
      
      try {
        setLoadingConversations(true);
        const conversations = await getUserConversations(currentUser.uid);
        setConversationHistory(conversations);
      } catch (error) {
        console.error('Błąd podczas pobierania historii konwersacji:', error);
        showError('Nie udało się pobrać historii konwersacji');
      } finally {
        setLoadingConversations(false);
      }
    };

    fetchConversations();
  }, [currentUser, showError]);

  // Sprawdź czy użytkownik ma skonfigurowany klucz API
  useEffect(() => {
    const checkApiKey = async () => {
      if (!currentUser?.uid) return;
      
      try {
        const apiKey = await getOpenAIApiKey(currentUser.uid);
        setHasApiKey(!!apiKey);
        
        // Jeśli nie ma klucza API, pokaż alert
        if (!apiKey) {
          setOpenAlert(true);
        }
      } catch (error) {
        console.error('Błąd podczas sprawdzania klucza API:', error);
      }
    };
    
    checkApiKey();
  }, [currentUser]);

  // Automatyczne przewijanie do najnowszej wiadomości
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // Załaduj wiadomości z wybranej konwersacji
  useEffect(() => {
    const loadConversationMessages = async () => {
      if (!currentConversationId) return;
      
      try {
        setLoading(true);
        const messages = await getConversationMessages(currentConversationId);
        setMessages(messages);
      } catch (error) {
        console.error('Błąd podczas pobierania wiadomości konwersacji:', error);
        showError('Nie udało się pobrać wiadomości z wybranej konwersacji');
      } finally {
        setLoading(false);
      }
    };

    loadConversationMessages();
  }, [currentConversationId, showError]);

  const handleInputChange = (e) => {
    setInput(e.target.value);
  };

  const handleSend = async () => {
    if (!input.trim()) return;
    if (!currentUser?.uid) {
      showError('Musisz być zalogowany, aby korzystać z asystenta AI');
      return;
    }

    // Jeśli nie ma aktualnej konwersacji, utwórz nową
    let conversationId = currentConversationId;
    if (!conversationId) {
      try {
        conversationId = await createConversation(currentUser.uid);
        setCurrentConversationId(conversationId);
      } catch (error) {
        console.error('Błąd podczas tworzenia nowej konwersacji:', error);
        showError('Nie udało się utworzyć nowej konwersacji');
        return;
      }
    }

    // Dodaj wiadomość użytkownika
    const userMessage = { 
      role: 'user', 
      content: input, 
      timestamp: new Date().toISOString() 
    };
    
    try {
      // Dodaj wiadomość użytkownika do bazy danych
      await addMessageToConversation(conversationId, 'user', input);
      
      // Zaktualizuj lokalny stan
      setMessages(prevMessages => [...prevMessages, userMessage]);
      setInput('');
      setLoading(true);
      
      // Przetwórz zapytanie i uzyskaj odpowiedź asystenta
      const aiResponse = await processAIQuery(input, messages, currentUser.uid);
      
      // Sprawdź, czy odpowiedź zawiera informację o błędzie limitów OpenAI
      const isQuotaError = aiResponse.includes('Przekroczono limit dostępnych środków') || 
                           aiResponse.includes('quota') || 
                           aiResponse.includes('billing');
      
      // Jeśli wystąpił błąd przekroczenia limitów, pokaż alert
      if (isQuotaError) {
        setOpenQuotaAlert(true);
      }
      
      // Dodaj odpowiedź asystenta do bazy danych
      await addMessageToConversation(conversationId, 'assistant', aiResponse);
      
      // Zaktualizuj lokalny stan
      const assistantMessage = { 
        role: 'assistant', 
        content: aiResponse, 
        timestamp: new Date().toISOString() 
      };
      setMessages(prevMessages => [...prevMessages, assistantMessage]);
      
      // Odśwież listę konwersacji
      const updatedConversations = await getUserConversations(currentUser.uid);
      setConversationHistory(updatedConversations);
      
    } catch (error) {
      console.error('Błąd podczas komunikacji z asystentem:', error);
      showError('Wystąpił błąd podczas komunikacji z asystentem. Spróbuj ponownie.');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const clearConversation = () => {
    setMessages([]);
    setCurrentConversationId(null);
    showSuccess('Konwersacja została wyczyszczona');
  };

  const handleNewConversation = () => {
    clearConversation();
  };

  const handleLoadConversation = async (conversationId) => {
    if (conversationId === currentConversationId) return;
    
    setCurrentConversationId(conversationId);
    setMessages([]); // Wyczyść wiadomości przed załadowaniem nowych
  };

  const handleDeleteConversation = async (conversationId, event) => {
    event.stopPropagation(); // Zapobiegaj kliknięciu elementu listy
    
    try {
      await deleteConversation(conversationId);
      
      // Aktualizuj lokalny stan
      setConversationHistory(prevHistory => 
        prevHistory.filter(conv => conv.id !== conversationId)
      );
      
      // Jeśli usuniętą konwersację była aktualnie wyświetlana, wyczyść widok
      if (conversationId === currentConversationId) {
        setMessages([]);
        setCurrentConversationId(null);
      }
      
      showSuccess('Konwersacja została usunięta');
    } catch (error) {
      console.error('Błąd podczas usuwania konwersacji:', error);
      showError('Nie udało się usunąć konwersacji');
    }
  };

  // Otwórz dialog ustawień
  const handleOpenSettings = async () => {
    try {
      // Pobierz aktualny klucz API (jeśli istnieje)
      if (currentUser?.uid) {
        const savedApiKey = await getOpenAIApiKey(currentUser.uid);
        if (savedApiKey) {
          // Maskujemy klucz, pokazując tylko kilka znaków
          setApiKey('••••••••••••••••••••••' + savedApiKey.substr(savedApiKey.length - 5));
        } else {
          setApiKey('');
        }
      }
    } catch (error) {
      console.error('Błąd podczas pobierania klucza API:', error);
    }
    
    setOpenSettingsDialog(true);
  };

  // Zamknij dialog ustawień
  const handleCloseSettings = () => {
    setOpenSettingsDialog(false);
  };

  // Zapisz klucz API
  const handleSaveApiKey = async () => {
    if (!currentUser?.uid) {
      showError('Musisz być zalogowany, aby zapisać klucz API');
      return;
    }
    
    if (!apiKey || apiKey.includes('•')) {
      handleCloseSettings();
      return;
    }
    
    try {
      setSaveApiKeyLoading(true);
      await saveOpenAIApiKey(currentUser.uid, apiKey);
      setHasApiKey(true);
      showSuccess('Klucz API został zapisany');
      handleCloseSettings();
    } catch (error) {
      console.error('Błąd podczas zapisywania klucza API:', error);
      showError('Nie udało się zapisać klucza API');
    } finally {
      setSaveApiKeyLoading(false);
    }
  };

  // Otwórz dialog z instrukcjami
  const handleOpenInstructions = () => {
    setOpenInstructionsDialog(true);
  };

  // Zamknij dialog z instrukcjami
  const handleCloseInstructions = () => {
    setOpenInstructionsDialog(false);
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleString('pl-PL', { 
      day: '2-digit', 
      month: '2-digit', 
      year: 'numeric', 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h4">
          Asystent AI
        </Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button 
            variant="outlined" 
            startIcon={<HelpIcon />}
            onClick={handleOpenInstructions}
          >
            Instrukcje API
          </Button>
          <Button 
            variant="outlined" 
            startIcon={<SettingsIcon />}
            onClick={handleOpenSettings}
            color={hasApiKey ? "primary" : "warning"}
          >
            {hasApiKey ? "Ustawienia API" : "Skonfiguruj API"}
          </Button>
        </Box>
      </Box>
      
      {/* Dialog instrukcji API */}
      <Dialog 
        open={openInstructionsDialog} 
        onClose={handleCloseInstructions}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <KeyIcon color="primary" />
            <Typography variant="h6">Instrukcje uzyskania klucza API OpenAI</Typography>
          </Box>
        </DialogTitle>
        <DialogContent>
          <ApiKeyInstructions />
        </DialogContent>
        <DialogActions>
          <Button 
            onClick={handleCloseInstructions}
            variant="outlined"
          >
            Zamknij
          </Button>
          <Button 
            onClick={() => {
              handleCloseInstructions();
              handleOpenSettings();
            }} 
            variant="contained"
            startIcon={<KeyIcon />}
          >
            Konfiguruj klucz API
          </Button>
        </DialogActions>
      </Dialog>
      
      {/* Dialog ustawień API */}
      <Dialog open={openSettingsDialog} onClose={handleCloseSettings}>
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <SettingsIcon color="primary" />
            <Typography variant="h6">Konfiguracja API OpenAI</Typography>
          </Box>
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2 }}>
            Aby korzystać z GPT-4o, potrzebujesz klucza API OpenAI. Klucz będzie przechowywany w bazie danych Firebase
            i używany tylko do komunikacji z API OpenAI w kontekście tego asystenta.
          </Typography>
          
          <TextField
            autoFocus
            margin="dense"
            label="Klucz API OpenAI"
            type="text"
            fullWidth
            variant="outlined"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-..."
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <KeyIcon />
                </InputAdornment>
              ),
            }}
          />
          
          <Box sx={{ mt: 2, display: 'flex', justifyContent: 'space-between' }}>
            <Button 
              onClick={() => setShowInstructions(!showInstructions)}
              startIcon={showInstructions ? <ExpandLessIcon /> : <ExpandMoreIcon />}
              sx={{ textTransform: 'none' }}
            >
              {showInstructions ? "Ukryj instrukcje" : "Pokaż instrukcje"}
            </Button>
            
            <Button
              variant="outlined"
              color="primary"
              size="small"
              onClick={() => window.open('https://platform.openai.com/account/billing', '_blank')}
              startIcon={<PaymentsIcon />}
            >
              Zarządzaj kontem OpenAI
            </Button>
          </Box>
          
          <Collapse in={showInstructions}>
            <Box sx={{ mt: 1, mb: 1, p: 2, bgcolor: 'background.default', borderRadius: 1 }}>
              <Typography variant="subtitle2" gutterBottom>
                Jak uzyskać klucz API:
              </Typography>
              <Typography variant="body2" component="div">
                <ol>
                  <li>Odwiedź stronę <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer">OpenAI API Keys</a></li>
                  <li>Zaloguj się lub utwórz konto</li>
                  <li>Kliknij "Create new secret key"</li>
                  <li>Skopiuj wygenerowany klucz (zaczyna się od "sk-")</li>
                  <li>Wklej klucz w pole powyżej</li>
                </ol>
              </Typography>
              <Button 
                size="small" 
                onClick={handleOpenInstructions}
                sx={{ mt: 1 }}
              >
                Pełne instrukcje
              </Button>
            </Box>
          </Collapse>
          
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
            Klucz API można uzyskać na stronie{' '}
            <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer">
              https://platform.openai.com/api-keys
            </a>
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseSettings}>Anuluj</Button>
          <Button 
            onClick={handleSaveApiKey} 
            variant="contained" 
            disabled={saveApiKeyLoading}
            startIcon={saveApiKeyLoading ? <CircularProgress size={20} /> : null}
          >
            Zapisz
          </Button>
        </DialogActions>
      </Dialog>
      
      {/* Dialog informacji o przekroczeniu limitu API */}
      <Dialog 
        open={openQuotaDialog} 
        onClose={handleCloseQuotaDialog}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <ErrorIcon color="error" />
            <Typography variant="h6">Problem z limitem API OpenAI</Typography>
          </Box>
        </DialogTitle>
        <DialogContent>
          <APIQuotaAlert />
        </DialogContent>
        <DialogActions>
          <Button 
            onClick={handleCloseQuotaDialog}
            variant="outlined"
          >
            Zamknij
          </Button>
          <Button 
            onClick={() => {
              handleCloseQuotaDialog();
              window.open('https://platform.openai.com/account/billing', '_blank');
            }} 
            variant="contained"
            color="primary"
            startIcon={<PaymentsIcon />}
          >
            Przejdź do rozliczeń OpenAI
          </Button>
        </DialogActions>
      </Dialog>
      
      {/* Alert o braku klucza API */}
      <Snackbar 
        open={openAlert} 
        autoHideDuration={10000} 
        onClose={() => setOpenAlert(false)}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <Alert 
          onClose={() => setOpenAlert(false)} 
          severity="info" 
          variant="filled"
          action={
            <Button 
              color="inherit" 
              size="small" 
              onClick={() => {
                setOpenAlert(false);
                handleOpenSettings();
              }}
            >
              Konfiguruj
            </Button>
          }
        >
          Asystent działa w trybie demo - skonfiguruj klucz API OpenAI, aby używać GPT-4o
        </Alert>
      </Snackbar>
      
      {/* Alert o przekroczeniu limitu API */}
      <Snackbar 
        open={openQuotaAlert} 
        autoHideDuration={10000} 
        onClose={() => setOpenQuotaAlert(false)}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <Alert 
          onClose={() => setOpenQuotaAlert(false)} 
          severity="error" 
          variant="filled"
          action={
            <Box>
              <Button 
                color="inherit" 
                size="small" 
                onClick={handleOpenQuotaDialog}
                sx={{ mr: 1 }}
              >
                Szczegóły
              </Button>
              <Button 
                color="inherit" 
                size="small" 
                onClick={() => {
                  setOpenQuotaAlert(false);
                  window.open('https://platform.openai.com/account/billing', '_blank');
                }}
              >
                Uzupełnij konto
              </Button>
            </Box>
          }
        >
          Przekroczono limit dostępnych środków. Uzupełnij konto OpenAI, aby kontynuować korzystanie z asystenta AI.
        </Alert>
      </Snackbar>
      
      <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: 2 }}>
        {/* Panel boczny z historią konwersacji */}
        <Paper 
          sx={{ 
            width: { xs: '100%', md: '250px' }, 
            p: 2, 
            display: 'flex', 
            flexDirection: 'column',
            backgroundColor: mode === 'dark' ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.02)',
          }}
        >
          <Typography variant="h6" gutterBottom>
            Historia konwersacji
          </Typography>
          <Divider sx={{ mb: 2 }} />
          
          <Button 
            variant="contained" 
            startIcon={<AddIcon />} 
            onClick={handleNewConversation}
            sx={{ mb: 2 }}
            fullWidth
          >
            Nowa konwersacja
          </Button>
          
          {loadingConversations ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}>
              <CircularProgress size={24} />
            </Box>
          ) : (
            <List sx={{ overflow: 'auto', maxHeight: '400px' }}>
              {conversationHistory.length === 0 ? (
                <Typography variant="body2" sx={{ textAlign: 'center', py: 2, color: 'text.secondary' }}>
                  Brak historii konwersacji
                </Typography>
              ) : (
                conversationHistory.map((conv) => (
                  <ListItem 
                    button 
                    key={conv.id}
                    onClick={() => handleLoadConversation(conv.id)}
                    selected={currentConversationId === conv.id}
                    sx={{ 
                      borderRadius: 1,
                      mb: 1,
                      backgroundColor: currentConversationId === conv.id 
                        ? (mode === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)')
                        : 'transparent',
                      '&:hover': {
                        backgroundColor: mode === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)',
                      }
                    }}
                  >
                    <ListItemAvatar>
                      <Avatar sx={{ bgcolor: 'primary.main' }}>
                        <BotIcon />
                      </Avatar>
                    </ListItemAvatar>
                    <ListItemText 
                      primary={conv.title || 'Nowa konwersacja'}
                      secondary={conv.updatedAt ? new Date(conv.updatedAt.toDate()).toLocaleDateString('pl-PL') : 'Dzisiaj'}
                      primaryTypographyProps={{ 
                        variant: 'body2', 
                        fontWeight: 'medium',
                        noWrap: true,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        width: '120px'
                      }}
                      secondaryTypographyProps={{ variant: 'caption' }}
                    />
                    <IconButton 
                      size="small" 
                      onClick={(e) => handleDeleteConversation(conv.id, e)}
                      sx={{ opacity: 0.5, '&:hover': { opacity: 1 } }}
                    >
                      <ClearIcon fontSize="small" />
                    </IconButton>
                  </ListItem>
                ))
              )}
            </List>
          )}
          
          <Box sx={{ mt: 'auto', pt: 2 }}>
            <Button 
              startIcon={<ClearIcon />} 
              variant="outlined" 
              onClick={clearConversation}
              fullWidth
              disabled={messages.length === 0}
            >
              Wyczyść konwersację
            </Button>
          </Box>
        </Paper>
        
        {/* Główny obszar konwersacji */}
        <Paper 
          sx={{ 
            flexGrow: 1, 
            p: 2, 
            display: 'flex', 
            flexDirection: 'column',
            height: '70vh'
          }}
        >
          {/* Obszar wiadomości */}
          <Box 
            sx={{ 
              flexGrow: 1, 
              overflow: 'auto',
              mb: 2,
              display: 'flex',
              flexDirection: 'column',
              gap: 2
            }}
          >
            {messages.length === 0 ? (
              <Box 
                sx={{ 
                  display: 'flex', 
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: '100%',
                  color: 'text.secondary',
                  textAlign: 'center',
                  p: 4
                }}
              >
                <BotIcon sx={{ fontSize: 60, mb: 2, color: 'primary.main' }} />
                <Typography variant="h6">
                  Witaj w Asystencie AI dla systemu MRP
                </Typography>
                <Typography variant="body2" sx={{ maxWidth: '600px', mt: 1 }}>
                  Zadaj pytanie dotyczące danych w systemie, zamówień, stanów magazynowych
                  lub innych aspektów działania Twojej firmy. Asystent przeanalizuje dane
                  i udzieli odpowiedzi na podstawie aktualnych informacji.
                </Typography>
                
                {!hasApiKey && (
                  <Alert 
                    severity="info" 
                    sx={{ mt: 3, maxWidth: '600px', width: '100%' }}
                    action={
                      <Button 
                        color="inherit" 
                        size="small" 
                        onClick={handleOpenSettings}
                      >
                        Konfiguruj
                      </Button>
                    }
                  >
                    Dla pełnej funkcjonalności asystenta AI, skonfiguruj klucz API OpenAI.
                    <Button
                      color="inherit"
                      size="small"
                      onClick={handleOpenInstructions}
                      sx={{ mt: 1, display: 'block' }}
                    >
                      Pokaż instrukcje
                    </Button>
                  </Alert>
                )}
              </Box>
            ) : (
              messages.map((message, index) => (
                <Card 
                  key={index} 
                  sx={{ 
                    maxWidth: message.role === 'user' ? '80%' : '90%',
                    alignSelf: message.role === 'user' ? 'flex-end' : 'flex-start',
                    backgroundColor: message.role === 'user' 
                      ? (mode === 'dark' ? 'primary.dark' : 'primary.light') 
                      : (mode === 'dark' ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.02)'),
                  }}
                >
                  <CardContent>
                    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, mb: 1 }}>
                      <Avatar 
                        sx={{ 
                          width: 28, 
                          height: 28,
                          bgcolor: message.role === 'user' ? 'secondary.main' : 'primary.main'
                        }}
                      >
                        {message.role === 'user' ? <PersonIcon /> : <BotIcon />}
                      </Avatar>
                      <Typography variant="subtitle2">
                        {message.role === 'user' ? 'Ty' : 'Asystent AI'}
                      </Typography>
                    </Box>
                    
                    <Typography variant="body1" sx={{ ml: 4, whiteSpace: 'pre-wrap' }}>
                      {message.content}
                    </Typography>
                    
                    <Typography 
                      variant="caption" 
                      sx={{ 
                        display: 'block', 
                        textAlign: 'right',
                        mt: 1,
                        color: 'text.secondary'
                      }}
                    >
                      {formatDate(message.timestamp)}
                    </Typography>
                  </CardContent>
                </Card>
              ))
            )}
            
            {loading && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, ml: 2 }}>
                <CircularProgress size={20} />
                <Typography variant="body2" color="text.secondary">
                  Asystent odpowiada...
                </Typography>
              </Box>
            )}
            
            <div ref={messagesEndRef} />
          </Box>
          
          {/* Obszar wprowadzania tekstu */}
          <Box sx={{ display: 'flex', gap: 1 }}>
            <TextField
              fullWidth
              variant="outlined"
              placeholder="Zadaj pytanie do asystenta AI..."
              value={input}
              onChange={handleInputChange}
              onKeyPress={handleKeyPress}
              multiline
              maxRows={4}
              disabled={loading}
              sx={{ 
                '& .MuiOutlinedInput-root': {
                  borderRadius: 2
                }
              }}
            />
            <IconButton 
              color="primary" 
              onClick={handleSend}
              disabled={!input.trim() || loading}
              sx={{ 
                alignSelf: 'flex-end', 
                p: 1, 
                backgroundColor: 'primary.main',
                color: 'white',
                '&:hover': {
                  backgroundColor: 'primary.dark',
                },
                '&.Mui-disabled': {
                  backgroundColor: 'action.disabledBackground',
                  color: 'action.disabled',
                }
              }}
            >
              {loading ? <CircularProgress size={24} color="inherit" /> : <SendIcon />}
            </IconButton>
          </Box>
        </Paper>
      </Box>
    </Container>
  );
};

export default AIAssistantPage; 