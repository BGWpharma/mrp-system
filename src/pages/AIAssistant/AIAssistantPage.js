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
  Collapse,
  LinearProgress,
  Tooltip
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
  Error as ErrorIcon,
  AttachFile as AttachFileIcon,
  Close as CloseIcon
} from '@mui/icons-material';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../services/firebase/config';
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
  saveOpenAIApiKey,
  uploadAttachment,
  deleteAttachment
} from '../../services/aiAssistantService';
import { checkAndUpdateAIMessageQuota } from '../../services/userService';
import { getSystemSettings } from '../../services/settingsService';
import ApiKeyInstructions from './ApiKeyInstructions';
import APIQuotaAlert from './APIQuotaAlert';
  import { useTranslation } from '../../hooks/useTranslation';

// Ten komponent będzie przyszłościowo używał API do komunikacji z modelem AI
// Na razie implementujemy podstawowy interfejs i strukturę
  const AIAssistantPage = () => {
  const { mode } = useTheme();
  const { currentUser } = useAuth();
  const { showSuccess, showError } = useNotification();
    const { t, formatDate: formatDateLocalized, currentLanguage } = useTranslation('aiAssistant');
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
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
  const [processingInBackground, setProcessingInBackground] = useState(false);
  const [aiMessageQuota, setAiMessageQuota] = useState({ remaining: 0, limit: 0 });
  const [useGlobalApiKey, setUseGlobalApiKey] = useState(false);
  const [attachments, setAttachments] = useState([]);
  const [uploadingAttachments, setUploadingAttachments] = useState(false);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);

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
        // Sprawdź ustawienia systemowe
        const systemSettings = await getSystemSettings();
        setUseGlobalApiKey(systemSettings.useGlobalApiKey || false);
        
        // Pobierz klucz API (funkcja getOpenAIApiKey już sprawdza zarówno globalny jak i indywidualny klucz)
        const apiKey = await getOpenAIApiKey(currentUser.uid);
        setHasApiKey(!!apiKey);
        
        // Jeśli nie ma klucza API i nie korzystamy z globalnego klucza, pokaż alert
        if (!apiKey && !systemSettings.useGlobalApiKey) {
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
      // Dodajemy małe opóźnienie, aby mieć pewność, że UI się zaktualizował
      setTimeout(() => {
        messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
      }, 100);
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
        setStatusMessage('');
      }
    };

    loadConversationMessages();
  }, [currentConversationId, showError]);

  const handleInputChange = (e) => {
    setInput(e.target.value);
  };

  // Obsługa wyboru plików
  const handleFileSelect = async (event) => {
    const files = Array.from(event.target.files);
    
    if (files.length === 0) return;
    
    if (!currentUser?.uid) {
      showError('Musisz być zalogowany, aby załączyć pliki');
      return;
    }

    try {
      setUploadingAttachments(true);
      
      // Sprawdź czy ma już konwersację, jeśli nie - utwórz nową
      let conversationId = currentConversationId;
      if (!conversationId) {
        conversationId = await createConversation(currentUser.uid);
        setCurrentConversationId(conversationId);
      }

      const uploadedAttachments = [];
      
      for (const file of files) {
        try {
          const attachmentInfo = await uploadAttachment(file, currentUser.uid, conversationId);
          uploadedAttachments.push(attachmentInfo);
        } catch (error) {
          console.error('Błąd podczas przesyłania pliku:', file.name, error);
          showError(`Nie udało się przesłać pliku ${file.name}: ${error.message}`);
        }
      }
      
      if (uploadedAttachments.length > 0) {
        setAttachments(prev => [...prev, ...uploadedAttachments]);
        showSuccess(`Przesłano ${uploadedAttachments.length} plik(ów)`);
      }
    } catch (error) {
      console.error('Błąd podczas przesyłania plików:', error);
      showError('Wystąpił błąd podczas przesyłania plików');
    } finally {
      setUploadingAttachments(false);
      // Wyczyść input pliku
      event.target.value = '';
    }
  };

  // Usuń załącznik
  const handleRemoveAttachment = async (attachmentIndex) => {
    try {
      const attachment = attachments[attachmentIndex];
      
      // Usuń plik z Firebase Storage
      await deleteAttachment(attachment.storagePath);
      
      // Usuń z lokalnej listy
      setAttachments(prev => prev.filter((_, index) => index !== attachmentIndex));
      
      showSuccess('Załącznik został usunięty');
    } catch (error) {
      console.error('Błąd podczas usuwania załącznika:', error);
      showError('Nie udało się usunąć załącznika');
    }
  };

  // Otwórz dialog wyboru plików
  const handleAttachFile = () => {
    fileInputRef.current?.click();
  };

  const handleSend = async () => {
    if (!input.trim()) return;
    if (!currentUser?.uid) {
      showError('Musisz być zalogowany, aby korzystać z asystenta AI');
      return;
    }

    try {
      // Sprawdź limit wiadomości dla użytkownika
      const quotaStatus = await checkAndUpdateAIMessageQuota(currentUser.uid);
      
      if (!quotaStatus.canSendMessage) {
        showError(`Przekroczono miesięczny limit ${quotaStatus.limit} wiadomości do asystenta AI. Limit odnowi się na początku kolejnego miesiąca.`);
        return;
      }
      
      // Aktualizuj informacje o limicie
      setAiMessageQuota({
        remaining: quotaStatus.remaining,
        limit: quotaStatus.limit
      });
      
      // Zapisz wartość aktualnego inputa przed wyczyszczeniem
      const currentInput = input.trim();
      
      // Wyczyść pole inputa i pokaż wskaźnik ładowania
      setInput('');
      setLoading(true);
      setStatusMessage('Przygotowywanie zapytania...');
      
      console.log('Wysyłanie wiadomości:', currentInput);

      // Jeśli nie ma aktualnej konwersacji, utwórz nową
      let conversationId = currentConversationId;
      if (!conversationId) {
        try {
          console.log('Tworzenie nowej konwersacji...');
          setStatusMessage('Tworzenie nowej konwersacji...');
          conversationId = await createConversation(currentUser.uid);
          setCurrentConversationId(conversationId);
        } catch (error) {
          console.error('Błąd podczas tworzenia nowej konwersacji:', error);
          showError('Nie udało się utworzyć nowej konwersacji');
          setLoading(false);
          setStatusMessage('');
          return;
        }
      }

      try {
        console.log('Konwersacja ID:', conversationId);
        
        // Dodaj wiadomość użytkownika do bazy danych
        console.log('Dodawanie wiadomości użytkownika do bazy danych...');
        setStatusMessage('Zapisywanie wiadomości...');
        const userMessageId = await addMessageToConversation(conversationId, 'user', currentInput, attachments);
        console.log('ID wiadomości użytkownika:', userMessageId);
        
        // Przygotuj wiadomość użytkownika do lokalnego wyświetlenia
        const userMessage = { 
          id: userMessageId,
          role: 'user', 
          content: currentInput, 
          timestamp: new Date().toISOString() 
        };
        
        // Dodaj wiadomość użytkownika do lokalnego stanu
        setMessages(prevMessages => {
          // Sprawdź, czy wiadomość już istnieje w stanie
          const isDuplicate = prevMessages.some(msg => 
            msg.content === currentInput && 
            msg.role === 'user' &&
            new Date(msg.timestamp).getTime() > Date.now() - 10000 // 10 sekund
          );
          
          if (isDuplicate) {
            console.log('Wykryto duplikat wiadomości - nie dodaję ponownie');
            return prevMessages;
          }
          
          return [...prevMessages, userMessage];
        });
        
        // 🔥 STREAMING: Przetwórz zapytanie z callbackiem do streamingu w czasie rzeczywistym
        console.log('Przetwarzanie zapytania przez AI ze streamingiem...');
        setStatusMessage('Pobieranie danych z bazy...');
        
        // Po chwili zmień na następny krok
        setTimeout(() => {
          setStatusMessage('GPT otrzymuje dane i generuje odpowiedź...');
        }, 2000);
        
        // 🔥 Utwórz tymczasowy placeholder dla wiadomości asystenta
        const tempAssistantId = `temp-${Date.now()}`;
        const tempAssistantMessage = {
          id: tempAssistantId,
          role: 'assistant',
          content: '',  // Zaczyna się pusta, będzie wypełniana w czasie rzeczywistym
          timestamp: new Date().toISOString(),
          isStreaming: true  // Flaga do animacji
        };
        
        // Dodaj placeholder do UI natychmiast
        setMessages(prevMessages => [...prevMessages, tempAssistantMessage]);
        
        // 🔥 Zmienne do zbierania streamed content i przechowania wyniku
        let streamedContent = '';
        let aiResponse = null;
        let assistantMessageId = null;
        let isDelayedResponse = false;
        
        try {
          // Wywołaj processAIQuery z callbackiem dla streamingu
          aiResponse = await processAIQuery(
            currentInput, 
            messages, 
            currentUser.uid, 
            attachments,
            // 🔥 STREAMING CALLBACK: Aktualizuj UI w czasie rzeczywistym
            (chunk, metadata) => {
              if (chunk) {
                streamedContent += chunk;
                
                // Aktualizuj wiadomość w UI z nowym chunkiem
                setMessages(prevMessages => 
                  prevMessages.map(msg => 
                    msg.id === tempAssistantId
                      ? { ...msg, content: streamedContent }
                      : msg
                  )
                );
              }
              
              // Gdy streaming się zakończy
              if (metadata.isComplete) {
                console.log('[STREAMING UI] Otrzymano kompletną odpowiedź:', streamedContent.length, 'znaków');
                setStatusMessage('Zapisywanie odpowiedzi...');
              }
            }
          );
          
          console.log('Uzyskano odpowiedź AI:', aiResponse ? 'tak' : 'nie');
          console.log('📝 Treść odpowiedzi AI:', aiResponse);
          console.log('📏 Długość odpowiedzi:', aiResponse?.length, 'znaków');
          console.log('🔍 Typ odpowiedzi:', typeof aiResponse);
          
          if (!aiResponse) {
            console.error('Otrzymano pustą odpowiedź od asystenta AI');
            // Usuń placeholder
            setMessages(prevMessages => prevMessages.filter(msg => msg.id !== tempAssistantId));
            showError('Nie otrzymano odpowiedzi od asystenta. Spróbuj ponownie później.');
            setLoading(false);
            setStatusMessage('');
            return;
          }
          
          // Sprawdź, czy odpowiedź to wiadomość o opóźnieniu
          isDelayedResponse = aiResponse.includes('Pracuję nad analizą danych') &&
                              aiResponse.includes('Proszę o cierpliwość');
          
          // Dodaj odpowiedź asystenta do bazy danych
          console.log('Dodawanie odpowiedzi asystenta do bazy danych...');
          assistantMessageId = await addMessageToConversation(conversationId, 'assistant', aiResponse);
          console.log('ID wiadomości asystenta:', assistantMessageId);
          
          // Zaktualizuj wiadomość z prawdziwym ID i usuń flagę streamingu
          setMessages(prevMessages => 
            prevMessages.map(msg => 
              msg.id === tempAssistantId
                ? { 
                    ...msg, 
                    id: assistantMessageId,
                    content: aiResponse,  // Upewnij się że mamy pełną odpowiedź
                    isStreaming: false 
                  }
                : msg
            )
          );
        } catch (streamError) {
          console.error('Błąd podczas streamingu:', streamError);
          // Usuń placeholder w przypadku błędu
          setMessages(prevMessages => prevMessages.filter(msg => msg.id !== tempAssistantId));
          throw streamError;  // Przekaż dalej do obsługi błędu
        }
        
        // Wyczyść status message
        setStatusMessage('');
        
        // 🔥 STREAMING: Obsługa delayed response - używamy ostatecznej wiadomości z ID
        const finalAssistantMessage = messages.find(msg => msg.id === assistantMessageId) || {
          id: assistantMessageId,
          role: 'assistant',
          content: aiResponse,
          timestamp: new Date().toISOString()
        };
        
        // Jeśli mamy wiadomość o opóźnieniu, uruchom drugi proces pobierania
        if (isDelayedResponse) {
          console.log('Wykryto wiadomość o opóźnieniu, kontynuuję pobieranie danych...');
          
          // Ustaw flagę ładowania, ale nie blokuj interfejsu
          setProcessingInBackground(true);
          
          // Uruchom pobieranie pełnej odpowiedzi w tle
          setTimeout(async () => {
            try {
              // Drugie zapytanie AI z dłuższym limitem czasu (bez streamingu dla delayed)
              const fullResponse = await processAIQuery(
                currentInput, 
                messages.concat([finalAssistantMessage]), 
                currentUser.uid,
                30000
              ); // Bez onChunk callback - nie streamujemy delayed response
              
              if (fullResponse && fullResponse !== aiResponse) {
                console.log('Otrzymano pełną odpowiedź AI po opóźnieniu');
                
                // Zaktualizuj odpowiedź w bazie danych
                const updatedMessageId = await addMessageToConversation(
                  conversationId, 
                  'assistant', 
                  fullResponse
                );
                
                // Zaktualizuj lokalny stan
                const updatedMessage = {
                  id: updatedMessageId,
                  role: 'assistant',
                  content: fullResponse,
                  timestamp: new Date().toISOString(),
                  updatedFromDelayed: true
                };
                
                setMessages(prevMessages => {
                  // Zastąp poprzednią odpowiedź z opóźnieniem
                  const filtered = prevMessages.filter(msg => 
                    msg.id !== assistantMessageId
                  );
                  return [...filtered, updatedMessage];
                });
              }
            } catch (error) {
              console.error('Błąd podczas pobierania pełnej odpowiedzi:', error);
            } finally {
              setProcessingInBackground(false);
            }
          }, 2000);
        }
        
        // Odśwież listę konwersacji
        console.log('Odświeżanie listy konwersacji...');
        const updatedConversations = await getUserConversations(currentUser.uid);
        setConversationHistory(updatedConversations);
        
        // Wyczyść załączniki po wysłaniu
        setAttachments([]);
        
      } catch (error) {
        console.error('Błąd podczas komunikacji z asystentem:', error);
        console.error('Szczegóły błędu:', error.message, error.stack);
        showError('Wystąpił błąd podczas komunikacji z asystentem. Spróbuj ponownie.');
      }
    } finally {
      setLoading(false);
      setStatusMessage('');
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
    setAttachments([]);
    showSuccess('Konwersacja została wyczyszczona');
  };

  const handleNewConversation = () => {
    clearConversation();
  };

  const handleLoadConversation = async (conversationId) => {
    if (conversationId === currentConversationId) return;
    
    setCurrentConversationId(conversationId);
    setMessages([]); // Wyczyść wiadomości przed załadowaniem nowych
    setAttachments([]); // Wyczyść załączniki przy zmianie konwersacji
    
    try {
      // OPTYMALIZACJA: Pobieramy wiadomości tylko wtedy, gdy są potrzebne
      // Dodajemy ograniczenie liczby pobieranych wiadomości
      const messagesLimit = 30; // Ograniczamy do 30 ostatnich wiadomości
      const conversationMessages = await getConversationMessages(conversationId);
      
      // Jeśli jest więcej niż messagesLimit wiadomości, pobieramy tylko ostatnie
      const limitedMessages = conversationMessages.length > messagesLimit 
        ? conversationMessages.slice(-messagesLimit) 
        : conversationMessages;
      
      console.log(`Zoptymalizowane pobieranie: ${limitedMessages.length} wiadomości z ${conversationMessages.length}`);
      
      setMessages(limitedMessages.map(msg => ({
        id: msg.id,
        role: msg.role,
        content: msg.content,
        timestamp: msg.timestamp
      })));
    } catch (error) {
      console.error('Błąd podczas pobierania wiadomości konwersacji:', error);
      showError('Nie udało się załadować wiadomości konwersacji');
    }
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
    return formatDateLocalized(dateString, {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Dodajmy indykator przetwarzania w tle
  const renderBackgroundProcessingIndicator = () => {
    if (!processingInBackground) return null;
    
    return (
      <div style={{ 
        position: 'fixed', 
        bottom: '20px', 
        right: '20px',
        display: 'flex',
        alignItems: 'center',
        backgroundColor: mode === 'dark' ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.02)',
        padding: '8px 16px',
        borderRadius: '20px',
        boxShadow: mode === 'dark' ? '0 2px 4px rgba(255, 255, 255, 0.1)' : '0 2px 4px rgba(0, 0, 0, 0.1)',
        zIndex: 1000
      }}>
        <CircularProgress size={20} style={{ marginRight: '8px' }} />
        <Typography variant="body2">Pobieranie danych...</Typography>
      </div>
    );
  };

  // Dodaj brakujący kod do renderowania interfejsu - linijka przed zwracaniem głównego kontenera JSX
  useEffect(() => {
    const checkMessageQuota = async () => {
      if (!currentUser?.uid) return;
      
      try {
        // Pobierz aktualny stan limitu bez zwiększania licznika
        const userRef = doc(db, 'users', currentUser.uid);
        const userDoc = await getDoc(userRef);
        
        if (userDoc.exists()) {
          const userData = userDoc.data();
          const isAdmin = userData.role === 'administrator';
          const defaultLimit = isAdmin ? 250 : 50;
          
          const aiMessagesLimit = userData.aiMessagesLimit || defaultLimit;
          const aiMessagesUsed = userData.aiMessagesUsed || 0;
          
          setAiMessageQuota({
            remaining: aiMessagesLimit - aiMessagesUsed,
            limit: aiMessagesLimit
          });
        }
      } catch (error) {
        console.error('Błąd podczas sprawdzania limitu wiadomości:', error);
      }
    };
    
    checkMessageQuota();
  }, [currentUser]);

  return (
    <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h4">
          {t('aiAssistant.title')}
        </Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          {!useGlobalApiKey && (
            <Button 
              variant="outlined" 
              startIcon={<SettingsIcon />}
              onClick={handleOpenSettings}
              color={hasApiKey ? 'primary' : 'warning'}
            >
              {hasApiKey ? t('aiAssistant.buttons.apiSettings') : t('aiAssistant.buttons.configureApi')}
            </Button>
          )}
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
            <Typography variant="h6">{t('aiAssistant.instructionsDialog.title')}</Typography>
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
            {t('common.close')}
          </Button>
          <Button 
            onClick={() => {
              handleCloseInstructions();
              handleOpenSettings();
            }} 
            variant="contained"
            startIcon={<KeyIcon />}
          >
            {t('aiAssistant.instructionsDialog.configureApiKey')}
          </Button>
        </DialogActions>
      </Dialog>
      
      {/* Dialog ustawień API */}
      <Dialog open={openSettingsDialog} onClose={handleCloseSettings}>
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <SettingsIcon color="primary" />
            <Typography variant="h6">{t('aiAssistant.settingsDialog.title')}</Typography>
          </Box>
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2 }}>
            {t('aiAssistant.settingsDialog.description')}
          </Typography>
          
          <TextField
            autoFocus
            margin="dense"
            label={t('aiAssistant.settingsDialog.apiKeyLabel')}
            type="text"
            fullWidth
            variant="outlined"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={t('aiAssistant.settingsDialog.apiKeyPlaceholder')}
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
              {showInstructions ? t('aiAssistant.buttons.hideInstructions') : t('aiAssistant.buttons.showInstructions')}
            </Button>
            
            <Button
              variant="outlined"
              color="primary"
              size="small"
              onClick={() => window.open('https://platform.openai.com/account/billing', '_blank')}
              startIcon={<PaymentsIcon />}
            >
              {t('aiAssistant.settingsDialog.manageOpenAIAccount')}
            </Button>
          </Box>
          
          <Collapse in={showInstructions}>
            <Box sx={{ mt: 1, mb: 1, p: 2, bgcolor: 'background.default', borderRadius: 1 }}>
              <Typography variant="subtitle2" gutterBottom>
                {t('aiAssistant.settingsDialog.howToGetKey.title')}
              </Typography>
              <Typography variant="body2" component="div">
                <ol>
                  <li>{t('aiAssistant.settingsDialog.howToGetKey.step1')}</li>
                  <li>{t('aiAssistant.settingsDialog.howToGetKey.step2')}</li>
                  <li>{t('aiAssistant.settingsDialog.howToGetKey.step3')}</li>
                  <li>{t('aiAssistant.settingsDialog.howToGetKey.step4')}</li>
                  <li>{t('aiAssistant.settingsDialog.howToGetKey.step5')}</li>
                </ol>
              </Typography>
              <Button 
                size="small" 
                onClick={handleOpenInstructions}
                sx={{ mt: 1 }}
              >
                {t('aiAssistant.settingsDialog.fullInstructions')}
              </Button>
            </Box>
          </Collapse>
          
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
            {t('aiAssistant.settingsDialog.apiKeysLinkLabel')}{' '}
            <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer">
              https://platform.openai.com/api-keys
            </a>
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseSettings}>{t('common.cancel')}</Button>
          <Button 
            onClick={handleSaveApiKey} 
            variant="contained" 
            disabled={saveApiKeyLoading}
            startIcon={saveApiKeyLoading ? <CircularProgress size={20} /> : null}
          >
            {t('common.save')}
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
            <Typography variant="h6">{t('aiAssistant.quotaDialog.title')}</Typography>
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
            {t('common.close')}
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
            {t('aiAssistant.quotaDialog.goToBilling')}
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
                {t('aiAssistant.buttons.configure')}
              </Button>
          }
        >
            {t('aiAssistant.snackbar.demoMode')}
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
                {t('aiAssistant.buttons.details')}
              </Button>
              <Button 
                color="inherit" 
                size="small" 
                onClick={() => {
                  setOpenQuotaAlert(false);
                  window.open('https://platform.openai.com/account/billing', '_blank');
                }}
              >
                {t('aiAssistant.buttons.topUpAccount')}
              </Button>
            </Box>
          }
        >
          {t('aiAssistant.snackbar.quotaExceeded')}
        </Alert>
      </Snackbar>
      
      {/* Wyświetlanie informacji o limicie wiadomości - dodaj przed polem inputa */}
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 1, mt: 2 }}>
        <Tooltip title={t('aiAssistant.quota.tooltip', { remaining: aiMessageQuota.remaining, limit: aiMessageQuota.limit })}>
          <Box sx={{ width: '100%', mr: 1 }}>
            <LinearProgress 
              variant="determinate" 
              value={(aiMessageQuota.remaining / aiMessageQuota.limit) * 100} 
              color={aiMessageQuota.remaining < 10 ? "error" : "primary"}
            />
          </Box>
        </Tooltip>
        <Typography variant="caption" color="text.secondary">
          {aiMessageQuota.remaining}/{aiMessageQuota.limit}
        </Typography>
      </Box>
      
      {/* Modyfikujemy alert dotyczący klucza API */}
      {!hasApiKey && !useGlobalApiKey && (
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
          {t('aiAssistant.alert.configureApiNotice')}
          <Button
            color="inherit"
            size="small"
            onClick={handleOpenInstructions}
            sx={{ mt: 1, display: 'block' }}
          >
            {t('aiAssistant.buttons.showInstructions')}
          </Button>
        </Alert>
      )}
      
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
            {t('aiAssistant.history.title')}
          </Typography>
          <Divider sx={{ mb: 2 }} />
          
          <Button 
            variant="contained" 
            startIcon={<AddIcon />} 
            onClick={handleNewConversation}
            sx={{ mb: 2 }}
            fullWidth
          >
            {t('aiAssistant.history.newConversation')}
          </Button>
          
          {loadingConversations ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}>
              <CircularProgress size={24} />
            </Box>
          ) : (
            <List sx={{ overflow: 'auto', maxHeight: '400px' }}>
              {conversationHistory.length === 0 ? (
                <Typography variant="body2" sx={{ textAlign: 'center', py: 2, color: 'text.secondary' }}>
                  {t('aiAssistant.history.empty')}
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
                        primary={conv.title || t('aiAssistant.history.newConversation')}
                        secondary={conv.updatedAt ? new Date(conv.updatedAt.toDate()).toLocaleDateString(currentLanguage === 'pl' ? 'pl-PL' : 'en-US') : t('aiAssistant.history.today')}
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
              {t('aiAssistant.history.clearConversation')}
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
            height: '70vh',
            maxHeight: '70vh',
            overflow: 'hidden'
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
              gap: 2,
              minHeight: 0,
              height: '100%'
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
                  {t('aiAssistant.welcome.title')}
                </Typography>
                <Typography variant="body2" sx={{ maxWidth: '600px', mt: 1 }}>
                  {t('aiAssistant.welcome.description')}
                </Typography>
                <Typography variant="body2" sx={{ maxWidth: '600px', mt: 1, fontStyle: 'italic' }}>
                  {t('aiAssistant.welcome.hint')}
                </Typography>
                
                <Alert 
                  severity="success" 
                  sx={{ mt: 3, maxWidth: '600px', width: '100%' }}
                >
                  <Typography variant="subtitle2">
                    {t('aiAssistant.welcome.dbAccessTitle')}
                  </Typography>
                  <Typography variant="body2">
                    {t('aiAssistant.welcome.dbAccessDescription')}
                  </Typography>
                </Alert>
                
                {!hasApiKey && !useGlobalApiKey && (
                  <Alert 
                    severity="info" 
                    sx={{ mt: 3, maxWidth: '600px', width: '100%' }}
                    action={
                      <Button 
                        color="inherit" 
                        size="small" 
                        onClick={handleOpenSettings}
                      >
                        {t('aiAssistant.buttons.configure')}
                      </Button>
                    }
                  >
                    {t('aiAssistant.alert.configureApiNotice')}
                    <Button
                      color="inherit"
                      size="small"
                      onClick={handleOpenInstructions}
                      sx={{ mt: 1, display: 'block' }}
                    >
                      {t('aiAssistant.buttons.showInstructions')}
                    </Button>
                  </Alert>
                )}
              </Box>
            ) : (
              <Box sx={{ 
                display: 'flex', 
                flexDirection: 'column', 
                gap: 2, 
                width: '100%',
                minHeight: 'min-content',
                flexGrow: 1
              }}>
                {messages
                  .filter((msg, index, self) => {
                    // Jeśli wiadomość ma ID, używamy ID jako klucza unikalności
                    if (msg.id) {
                      return index === self.findIndex(m => m.id === msg.id);
                    }
                    
                    // Dla wiadomości bez ID, sprawdzamy zawartość i czas
                    return index === self.findIndex(m => 
                      m.content === msg.content && 
                      m.role === msg.role &&
                      Math.abs(new Date(m.timestamp) - new Date(msg.timestamp)) < 1000
                    );
                  })
                  .map((message, index) => (
                  <Card 
                    key={message.id || index} 
                    sx={{ 
                      maxWidth: message.role === 'user' ? '80%' : '90%',
                      alignSelf: message.role === 'user' ? 'flex-end' : 'flex-start',
                      backgroundColor: message.role === 'user' 
                        ? (mode === 'dark' ? 'primary.dark' : 'primary.light') 
                        : (mode === 'dark' ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.02)'),
                      flex: '0 0 auto'
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
                          {message.role === 'user' ? t('aiAssistant.message.you') : t('aiAssistant.message.assistant')}
                        </Typography>
                      </Box>
                      
                      <Box sx={{ ml: 4 }}>
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          components={{
                            // Stylowanie dla różnych elementów Markdown
                            p: ({node, ...props}) => <Typography variant="body1" paragraph {...props} />,
                            h1: ({node, ...props}) => <Typography variant="h4" gutterBottom {...props} />,
                            h2: ({node, ...props}) => <Typography variant="h5" gutterBottom {...props} />,
                            h3: ({node, ...props}) => <Typography variant="h6" gutterBottom {...props} />,
                            li: ({node, ...props}) => (
                              <Typography component="li" variant="body2" sx={{ ml: 2 }} {...props} />
                            ),
                            blockquote: ({node, ...props}) => (
                              <Box
                                component="blockquote"
                                sx={{
                                  borderLeft: '4px solid',
                                  borderColor: 'primary.main',
                                  pl: 2,
                                  ml: 0,
                                  fontStyle: 'italic',
                                  color: 'text.secondary'
                                }}
                                {...props}
                              />
                            ),
                            code: ({node, inline, ...props}) => (
                              inline ? 
                                <Box
                                  component="code"
                                  sx={{
                                    backgroundColor: 'action.hover',
                                    px: 0.5,
                                    py: 0.25,
                                    borderRadius: 0.5,
                                    fontFamily: 'monospace',
                                    fontSize: '0.9em'
                                  }}
                                  {...props}
                                />
                              :
                                <Box
                                  component="pre"
                                  sx={{
                                    backgroundColor: 'action.hover',
                                    p: 2,
                                    borderRadius: 1,
                                    overflow: 'auto',
                                    '& code': {
                                      fontFamily: 'monospace',
                                      fontSize: '0.9em'
                                    }
                                  }}
                                >
                                  <code {...props} />
                                </Box>
                            ),
                            table: ({node, ...props}) => (
                              <Box sx={{ overflowX: 'auto', my: 2 }}>
                                <table
                                  style={{
                                    borderCollapse: 'collapse',
                                    width: '100%',
                                    border: '1px solid rgba(224, 224, 224, 1)'
                                  }}
                                  {...props}
                                />
                              </Box>
                            ),
                            th: ({node, ...props}) => (
                              <th
                                style={{
                                  border: '1px solid rgba(224, 224, 224, 1)',
                                  padding: '12px',
                                  backgroundColor: 'rgba(0, 0, 0, 0.04)',
                                  fontWeight: 'bold',
                                  textAlign: 'left'
                                }}
                                {...props}
                              />
                            ),
                            td: ({node, ...props}) => (
                              <td
                                style={{
                                  border: '1px solid rgba(224, 224, 224, 1)',
                                  padding: '12px'
                                }}
                                {...props}
                              />
                            ),
                            a: ({node, ...props}) => (
                              <a
                                style={{
                                  color: '#1976d2',
                                  textDecoration: 'none'
                                }}
                                target="_blank"
                                rel="noopener noreferrer"
                                {...props}
                              />
                            )
                          }}
                        >
                          {message.content}
                        </ReactMarkdown>
                        
                        {/* 🔥 STREAMING: Animowany kursor podczas streamingu */}
                        {message.isStreaming && (
                          <Box
                            component="span"
                            sx={{
                              display: 'inline-block',
                              ml: 0.5,
                              width: '2px',
                              height: '1em',
                              backgroundColor: 'primary.main',
                              animation: 'blink 1s infinite',
                              '@keyframes blink': {
                                '0%, 49%': { opacity: 1 },
                                '50%, 100%': { opacity: 0 }
                              }
                            }}
                          />
                        )}
                      </Box>
                      
                      {/* Wyświetlanie załączników w wiadomości */}
                      {message.attachments && message.attachments.length > 0 && (
                        <Box sx={{ ml: 4, mt: 1 }}>
                          <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
                            {t('aiAssistant.attachments.label')}
                          </Typography>
                          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                            {message.attachments.map((attachment, attachIndex) => (
                              <Card 
                                key={attachIndex} 
                                sx={{ 
                                  display: 'flex', 
                                  alignItems: 'center', 
                                  p: 0.5, 
                                  backgroundColor: 'rgba(0, 0, 0, 0.1)',
                                  maxWidth: '200px'
                                }}
                              >
                                <AttachFileIcon sx={{ mr: 0.5, fontSize: 14 }} />
                                <Typography 
                                  variant="caption" 
                                  sx={{ 
                                    overflow: 'hidden', 
                                    textOverflow: 'ellipsis', 
                                    whiteSpace: 'nowrap',
                                    fontSize: '0.7rem'
                                  }}
                                >
                                  {attachment.fileName}
                                </Typography>
                              </Card>
                            ))}
                          </Box>
                        </Box>
                      )}
                      
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
                ))}
              </Box>
            )}
            
            {/* 🔥 STARY LOADING INDICATOR: Pokaż TYLKO jeśli nie ma streaming placeholder */}
            {loading && !messages.some(msg => msg.isStreaming) && (
              <Card 
                sx={{ 
                  maxWidth: '90%',
                  alignSelf: 'flex-start',
                  backgroundColor: mode === 'dark' ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.02)',
                  flex: '0 0 auto'
                }}
              >
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, mb: 1 }}>
                    <Avatar 
                      sx={{ 
                        width: 28, 
                        height: 28,
                        bgcolor: 'primary.main'
                      }}
                    >
                      <BotIcon />
                    </Avatar>
                    <Typography variant="subtitle2">
                      {t('aiAssistant.message.assistant')}
                    </Typography>
                  </Box>
                  
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, ml: 4 }}>
                    <CircularProgress size={16} />
                    <Typography variant="body2" color="text.secondary">
                      {statusMessage || t('aiAssistant.loading.replying')}
                    </Typography>
                  </Box>
                </CardContent>
              </Card>
            )}
            
            <div ref={messagesEndRef} />
          </Box>
          
          {/* Wyświetlanie załączników */}
          {attachments.length > 0 && (
            <Box sx={{ mb: 2 }}>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                {t('aiAssistant.attachments.title', { count: attachments.length })}
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                {attachments.map((attachment, index) => (
                  <Card 
                    key={index} 
                    sx={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      p: 1, 
                      backgroundColor: mode === 'dark' ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.02)',
                      maxWidth: '300px'
                    }}
                  >
                    <AttachFileIcon sx={{ mr: 1, fontSize: 16 }} />
                    <Typography 
                      variant="caption" 
                      sx={{ 
                        flexGrow: 1, 
                        overflow: 'hidden', 
                        textOverflow: 'ellipsis', 
                        whiteSpace: 'nowrap' 
                      }}
                    >
                      {attachment.fileName}
                    </Typography>
                    <IconButton 
                      size="small" 
                      onClick={() => handleRemoveAttachment(index)}
                      sx={{ ml: 1, p: 0.5 }}
                    >
                      <CloseIcon fontSize="small" />
                    </IconButton>
                  </Card>
                ))}
              </Box>
            </Box>
          )}
          
          {/* Obszar wprowadzania tekstu */}
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Box sx={{ display: 'flex', flexDirection: 'column', flexGrow: 1 }}>
              <TextField
                fullWidth
                variant="outlined"
                placeholder={t('aiAssistant.input.placeholder')}
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
            </Box>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <IconButton 
                color="secondary" 
                onClick={handleAttachFile}
                disabled={loading || uploadingAttachments}
                sx={{ 
                  alignSelf: 'flex-end', 
                  p: 1
                }}
              >
                {uploadingAttachments ? <CircularProgress size={24} /> : <AttachFileIcon />}
              </IconButton>
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
          </Box>
        </Paper>
      </Box>
      
      {/* Dodajemy indykator przetwarzania w tle */}
      {renderBackgroundProcessingIndicator()}
      
      {/* Ukryty input dla plików */}
      <input
        type="file"
        ref={fileInputRef}
        style={{ display: 'none' }}
        multiple
        accept=".txt,.csv,.json,.pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.gif,.webp"
        onChange={handleFileSelect}
      />
    </Container>
  );
};

export default AIAssistantPage; 