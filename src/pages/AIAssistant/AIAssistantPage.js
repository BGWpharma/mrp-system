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
  ListItemAvatar
} from '@mui/material';
import { 
  Send as SendIcon, 
  SmartToy as BotIcon,
  Person as PersonIcon,
  Clear as ClearIcon,
  Add as AddIcon
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
  deleteConversation
} from '../../services/aiAssistantService';

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
  const messagesEndRef = useRef(null);

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
      const aiResponse = await processAIQuery(input, messages);
      
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
      <Typography variant="h4" gutterBottom>
        Asystent AI
      </Typography>
      
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
                  z bazy Firebase i dostarczy odpowiedzi na podstawie aktualnych informacji.
                </Typography>
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