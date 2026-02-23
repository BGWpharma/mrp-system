// src/components/common/AIChatFAB.js
import React, { useState, useEffect, useRef } from 'react';
import {
  Fab,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Box,
  IconButton,
  TextField,
  Typography,
  Avatar,
  Card,
  CardContent,
  CircularProgress,
  Tooltip,
  Badge,
  Zoom,
  useTheme as useMuiTheme,
  alpha,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  ListItemSecondaryAction,
  Divider,
  Slide
} from '@mui/material';
import {
  SmartToy as BotIcon,
  Close as CloseIcon,
  Send as SendIcon,
  Person as PersonIcon,
  OpenInNew as OpenInNewIcon,
  History as HistoryIcon,
  ArrowBack as ArrowBackIcon,
  Add as AddIcon,
  Delete as DeleteIcon,
  Chat as ChatIcon,
  AttachFile as AttachFileIcon
} from '@mui/icons-material';
import { useNavigate, useLocation } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { useNotification } from '../../hooks/useNotification';
import { useTranslation } from '../../hooks/useTranslation';
import {
  createConversation,
  addMessageToConversation,
  processAIQuery,
  getOpenAIApiKey,
  getUserConversations,
  getConversationMessages,
  deleteConversation,
  uploadAttachment,
  deleteAttachment
} from '../../services/aiAssistantService';
import { checkAndUpdateAIMessageQuota } from '../../services/userService';
import { getSystemSettings } from '../../services/settingsService';

const AIChatFAB = () => {
  const { mode } = useTheme();
  const muiTheme = useMuiTheme();
  const { currentUser } = useAuth();
  const { showError, showSuccess } = useNotification();
  const { t, currentLanguage } = useTranslation('aiAssistant');
  const navigate = useNavigate();
  const location = useLocation();
  
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState(null);
  const [hasApiKey, setHasApiKey] = useState(false);
  const [hasUnread, setHasUnread] = useState(false);
  
  // Historia konwersacji
  const [showHistory, setShowHistory] = useState(false);
  const [conversationHistory, setConversationHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  
  // Załączniki
  const [attachments, setAttachments] = useState([]);
  const [uploadingAttachments, setUploadingAttachments] = useState(false);
  
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);

  // Ukryj FAB na stronie AI Assistant (pełna wersja)
  const isAIAssistantPage = location.pathname === '/ai-assistant';

  useEffect(() => {
    let cancelled = false;
    const checkApiKey = async () => {
      if (!currentUser?.uid) return;
      try {
        const systemSettings = await getSystemSettings();
        if (cancelled) return;
        const apiKey = await getOpenAIApiKey(currentUser.uid);
        if (cancelled) return;
        setHasApiKey(!!apiKey || systemSettings.useGlobalApiKey);
      } catch (error) {
        console.error('Błąd sprawdzania klucza API:', error);
      }
    };
    checkApiKey();
    return () => { cancelled = true; };
  }, [currentUser]);

  useEffect(() => {
    let cancelled = false;
    const fetchHistory = async () => {
      if (!currentUser?.uid || !open) return;
      try {
        setLoadingHistory(true);
        const history = await getUserConversations(currentUser.uid, 20);
        if (cancelled) return;
        setConversationHistory(history);
      } catch (error) {
        console.error('Błąd pobierania historii:', error);
      } finally {
        if (!cancelled) {
          setLoadingHistory(false);
        }
      }
    };
    fetchHistory();
    return () => { cancelled = true; };
  }, [currentUser, open]);

  // Auto-scroll do najnowszej wiadomości
  useEffect(() => {
    if (messagesEndRef.current && open && !showHistory) {
      setTimeout(() => {
        messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    }
  }, [messages, open, showHistory]);

  const handleOpen = () => {
    setOpen(true);
    setHasUnread(false);
  };

  const handleClose = () => {
    setOpen(false);
    setShowHistory(false);
  };

  const handleOpenFullPage = () => {
    setOpen(false);
    navigate('/ai-assistant');
  };

  const handleToggleHistory = () => {
    setShowHistory(!showHistory);
  };

  const handleNewConversation = () => {
    setMessages([]);
    setConversationId(null);
    setAttachments([]);
    setShowHistory(false);
  };

  // Obsługa wyboru plików
  const handleFileSelect = async (event) => {
    const files = Array.from(event.target.files);
    if (files.length === 0) return;
    
    if (!currentUser?.uid) {
      showError(t('aiAssistant.errors.notLoggedIn', 'Musisz być zalogowany'));
      return;
    }

    try {
      setUploadingAttachments(true);
      
      // Sprawdź czy ma już konwersację, jeśli nie - utwórz nową
      let convId = conversationId;
      if (!convId) {
        convId = await createConversation(currentUser.uid);
        setConversationId(convId);
      }

      const uploadedAttachments = [];
      
      for (const file of files) {
        try {
          const attachmentInfo = await uploadAttachment(file, currentUser.uid, convId);
          uploadedAttachments.push(attachmentInfo);
        } catch (error) {
          console.error('Błąd podczas przesyłania pliku:', file.name, error);
          showError(`${t('aiAssistant.fab.uploadError', 'Błąd przesyłania')}: ${file.name}`);
        }
      }
      
      if (uploadedAttachments.length > 0) {
        setAttachments(prev => [...prev, ...uploadedAttachments]);
        showSuccess(`${t('aiAssistant.fab.uploadSuccess', 'Przesłano')} ${uploadedAttachments.length} ${t('aiAssistant.fab.files', 'plik(ów)')}`);
      }
    } catch (error) {
      console.error('Błąd podczas przesyłania plików:', error);
      showError(t('aiAssistant.fab.uploadError', 'Błąd przesyłania plików'));
    } finally {
      setUploadingAttachments(false);
      event.target.value = '';
    }
  };

  // Usuń załącznik
  const handleRemoveAttachment = async (attachmentIndex) => {
    try {
      const attachment = attachments[attachmentIndex];
      await deleteAttachment(attachment.storagePath);
      setAttachments(prev => prev.filter((_, index) => index !== attachmentIndex));
    } catch (error) {
      console.error('Błąd podczas usuwania załącznika:', error);
      showError(t('aiAssistant.fab.deleteAttachmentError', 'Błąd usuwania załącznika'));
    }
  };

  // Otwórz dialog wyboru plików
  const handleAttachFile = () => {
    fileInputRef.current?.click();
  };

  const handleLoadConversation = async (convId) => {
    if (convId === conversationId) {
      setShowHistory(false);
      return;
    }
    
    try {
      setLoading(true);
      const conversationMessages = await getConversationMessages(convId);
      setMessages(conversationMessages.map(msg => ({
        id: msg.id,
        role: msg.role,
        content: msg.content,
        timestamp: msg.timestamp
      })));
      setConversationId(convId);
      setAttachments([]); // Wyczyść załączniki przy zmianie konwersacji
      setShowHistory(false);
    } catch (error) {
      console.error('Błąd ładowania konwersacji:', error);
      showError(t('aiAssistant.errors.loadError', 'Błąd ładowania konwersacji'));
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteConversation = async (convId, event) => {
    event.stopPropagation();
    try {
      await deleteConversation(convId);
      setConversationHistory(prev => prev.filter(c => c.id !== convId));
      if (convId === conversationId) {
        setMessages([]);
        setConversationId(null);
      }
      showSuccess(t('aiAssistant.history.deleted', 'Konwersacja usunięta'));
    } catch (error) {
      console.error('Błąd usuwania konwersacji:', error);
      showError(t('aiAssistant.errors.deleteError', 'Błąd usuwania konwersacji'));
    }
  };

  const handleSend = async () => {
    if (!input.trim() || loading) return;
    if (!currentUser?.uid) {
      showError(t('aiAssistant.errors.notLoggedIn', 'Musisz być zalogowany'));
      return;
    }

    const userMessage = input.trim();
    setInput('');
    setLoading(true);

    // Dodaj wiadomość użytkownika do UI (wraz z załącznikami)
    const newUserMessage = {
      id: Date.now(),
      role: 'user',
      content: userMessage,
      timestamp: new Date().toISOString(),
      attachments: attachments.length > 0 ? [...attachments] : undefined
    };
    setMessages(prev => [...prev, newUserMessage]);

    try {
      // Sprawdź limit
      const quotaStatus = await checkAndUpdateAIMessageQuota(currentUser.uid);
      if (!quotaStatus.canSendMessage) {
        showError(t('aiAssistant.errors.quotaExceeded', 'Przekroczono limit wiadomości'));
        setLoading(false);
        return;
      }

      // Utwórz konwersację jeśli nie istnieje
      let convId = conversationId;
      if (!convId) {
        convId = await createConversation(currentUser.uid);
        setConversationId(convId);
        // Odśwież historię po utworzeniu nowej konwersacji
        const history = await getUserConversations(currentUser.uid, 20);
        setConversationHistory(history);
      }

      // Dodaj do bazy
      await addMessageToConversation(convId, 'user', userMessage);

      // Placeholder dla odpowiedzi asystenta
      const tempId = `temp-${Date.now()}`;
      setMessages(prev => [...prev, {
        id: tempId,
        role: 'assistant',
        content: '',
        isStreaming: true,
        timestamp: new Date().toISOString()
      }]);

      let streamedContent = '';
      
      // Wywołaj AI z streamingiem (przekaż załączniki)
      const aiResponse = await processAIQuery(
        userMessage,
        messages,
        currentUser.uid,
        attachments,
        (chunk) => {
          if (chunk) {
            streamedContent += chunk;
            setMessages(prev =>
              prev.map(msg =>
                msg.id === tempId
                  ? { ...msg, content: streamedContent }
                  : msg
              )
            );
          }
        }
      );

      // Zapisz odpowiedź do bazy
      const assistantMsgId = await addMessageToConversation(convId, 'assistant', aiResponse);

      // Zaktualizuj wiadomość z prawdziwym ID
      setMessages(prev =>
        prev.map(msg =>
          msg.id === tempId
            ? { ...msg, id: assistantMsgId, content: aiResponse, isStreaming: false }
            : msg
        )
      );

      // Odśwież historię po odpowiedzi
      const history = await getUserConversations(currentUser.uid, 20);
      setConversationHistory(history);
      
      // Wyczyść załączniki po wysłaniu
      setAttachments([]);

    } catch (error) {
      console.error('Błąd wysyłania wiadomości:', error);
      showError(t('aiAssistant.errors.sendError', 'Błąd wysyłania wiadomości'));
      // Usuń placeholder w przypadku błędu
      setMessages(prev => prev.filter(msg => !msg.isStreaming));
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

  const formatDate = (date) => {
    if (!date) return '';
    const d = date.toDate ? date.toDate() : new Date(date);
    return d.toLocaleDateString(currentLanguage === 'pl' ? 'pl-PL' : 'en-US', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Nie pokazuj na stronie AI Assistant
  if (isAIAssistantPage) {
    return null;
  }

  // Gradient dla FAB
  const fabGradient = mode === 'dark'
    ? 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)'
    : 'linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)';

  return (
    <>
      {/* Floating Action Button */}
      <Zoom in={!open}>
        <Tooltip title={t('aiAssistant.fab.tooltip', 'Asystent AI')} placement="left">
          <Fab
            color="primary"
            onClick={handleOpen}
            sx={{
              position: 'fixed',
              bottom: 24,
              right: 24,
              zIndex: 1200,
              background: fabGradient,
              boxShadow: `0 8px 32px ${alpha(muiTheme.palette.primary.main, 0.4)}`,
              transition: 'all 0.3s ease',
              '&:hover': {
                transform: 'scale(1.1)',
                boxShadow: `0 12px 40px ${alpha(muiTheme.palette.primary.main, 0.5)}`,
              }
            }}
          >
            <Badge color="error" variant="dot" invisible={!hasUnread}>
              <BotIcon sx={{ fontSize: 28 }} />
            </Badge>
          </Fab>
        </Tooltip>
      </Zoom>

      {/* Chat Dialog/Modal */}
      <Dialog
        open={open}
        onClose={handleClose}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: {
            position: 'fixed',
            bottom: 16,
            right: 16,
            m: 0,
            width: { xs: '95vw', sm: 420 },
            maxWidth: 420,
            height: { xs: '70vh', sm: 550 },
            maxHeight: '80vh',
            borderRadius: 3,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            background: mode === 'dark'
              ? 'linear-gradient(180deg, rgba(30, 30, 46, 0.98) 0%, rgba(24, 24, 36, 0.98) 100%)'
              : 'linear-gradient(180deg, rgba(255, 255, 255, 0.98) 0%, rgba(248, 250, 252, 0.98) 100%)',
            backdropFilter: 'blur(20px)',
            border: `1px solid ${mode === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`,
          }
        }}
        BackdropProps={{
          sx: { backgroundColor: 'transparent' }
        }}
      >
        {/* Header */}
        <DialogTitle
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            py: 1.5,
            px: 2,
            flexShrink: 0,  // Nie kurczy się
            background: fabGradient,
            color: 'white'
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {showHistory ? (
              <>
                <IconButton size="small" onClick={handleToggleHistory} sx={{ color: 'white', mr: 0.5 }}>
                  <ArrowBackIcon fontSize="small" />
                </IconButton>
                <Typography variant="subtitle1" fontWeight={600}>
                  {t('aiAssistant.fab.historyTitle', 'Historia czatów')}
                </Typography>
              </>
            ) : (
              <>
                <BotIcon />
                <Typography variant="subtitle1" fontWeight={600}>
                  {t('aiAssistant.fab.title', 'Asystent AI')}
                </Typography>
              </>
            )}
          </Box>
          <Box>
            {!showHistory && (
              <Tooltip title={t('aiAssistant.fab.history', 'Historia')}>
                <IconButton size="small" onClick={handleToggleHistory} sx={{ color: 'white' }}>
                  <HistoryIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
            <Tooltip title={t('aiAssistant.fab.openFullPage', 'Otwórz pełną wersję')}>
              <IconButton size="small" onClick={handleOpenFullPage} sx={{ color: 'white' }}>
                <OpenInNewIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <IconButton size="small" onClick={handleClose} sx={{ color: 'white' }}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </Box>
        </DialogTitle>

        {/* Content - Chat lub Historia */}
        {showHistory ? (
          // Widok historii konwersacji
          <DialogContent
            sx={{
              flex: 1,
              overflow: 'auto',
              p: 0
            }}
          >
            {/* Przycisk nowej konwersacji */}
            <Box sx={{ p: 2, pb: 1 }}>
              <Card
                onClick={handleNewConversation}
                sx={{
                  cursor: 'pointer',
                  backgroundColor: alpha(muiTheme.palette.primary.main, 0.1),
                  border: `1px dashed ${muiTheme.palette.primary.main}`,
                  transition: 'all 0.2s',
                  '&:hover': {
                    backgroundColor: alpha(muiTheme.palette.primary.main, 0.2),
                  }
                }}
              >
                <CardContent sx={{ 
                  py: 1.5, 
                  px: 2,
                  '&:last-child': { pb: 1.5 },
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1.5
                }}>
                  <Avatar sx={{ bgcolor: 'primary.main', width: 32, height: 32 }}>
                    <AddIcon sx={{ fontSize: 18 }} />
                  </Avatar>
                  <Typography variant="body2" fontWeight={500} color="primary">
                    {t('aiAssistant.fab.newChat', 'Nowa konwersacja')}
                  </Typography>
                </CardContent>
              </Card>
            </Box>

            <Divider sx={{ mx: 2 }} />

            {loadingHistory ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
                <CircularProgress size={24} />
              </Box>
            ) : conversationHistory.length === 0 ? (
              <Box sx={{ 
                display: 'flex', 
                flexDirection: 'column',
                alignItems: 'center', 
                justifyContent: 'center',
                p: 4,
                color: 'text.secondary'
              }}>
                <HistoryIcon sx={{ fontSize: 40, mb: 1, opacity: 0.5 }} />
                <Typography variant="body2">
                  {t('aiAssistant.fab.noHistory', 'Brak historii konwersacji')}
                </Typography>
              </Box>
            ) : (
              <List sx={{ py: 1 }}>
                {conversationHistory.map((conv) => (
                  <ListItem
                    key={conv.id}
                    button
                    onClick={() => handleLoadConversation(conv.id)}
                    selected={conv.id === conversationId}
                    sx={{
                      py: 1,
                      px: 2,
                      borderLeft: conv.id === conversationId 
                        ? `3px solid ${muiTheme.palette.primary.main}` 
                        : '3px solid transparent',
                      '&:hover': {
                        backgroundColor: mode === 'dark' 
                          ? 'rgba(255,255,255,0.05)' 
                          : 'rgba(0,0,0,0.03)'
                      },
                      '&.Mui-selected': {
                        backgroundColor: mode === 'dark' 
                          ? 'rgba(255,255,255,0.08)' 
                          : 'rgba(0,0,0,0.05)'
                      }
                    }}
                  >
                    <ListItemAvatar sx={{ minWidth: 44 }}>
                      <Avatar sx={{ 
                        bgcolor: conv.id === conversationId ? 'primary.main' : 'action.selected',
                        width: 32, 
                        height: 32 
                      }}>
                        <ChatIcon sx={{ fontSize: 16 }} />
                      </Avatar>
                    </ListItemAvatar>
                    <ListItemText
                      primary={
                        <Typography 
                          variant="body2" 
                          fontWeight={conv.id === conversationId ? 600 : 400}
                          noWrap
                          sx={{ maxWidth: 200 }}
                        >
                          {conv.title || t('aiAssistant.history.newConversation', 'Nowa konwersacja')}
                        </Typography>
                      }
                      secondary={
                        <Typography variant="caption" color="text.secondary">
                          {formatDate(conv.updatedAt)}
                        </Typography>
                      }
                    />
                    <ListItemSecondaryAction>
                      <IconButton 
                        size="small" 
                        onClick={(e) => handleDeleteConversation(conv.id, e)}
                        sx={{ 
                          opacity: 0.5, 
                          '&:hover': { 
                            opacity: 1,
                            color: 'error.main'
                          } 
                        }}
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </ListItemSecondaryAction>
                  </ListItem>
                ))}
              </List>
            )}
          </DialogContent>
        ) : (
          // Widok czatu
          <>
            <DialogContent
              sx={{
                flex: '1 1 auto',
                overflow: 'auto',
                p: 2,
                display: 'flex',
                flexDirection: 'column',
                gap: 1.5,
                minWidth: 0,
                minHeight: 0  // Kluczowe dla prawidłowego scrollowania w flexbox
              }}
            >
              {messages.length === 0 ? (
                <Box
                  sx={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'text.secondary',
                    textAlign: 'center',
                    p: 2
                  }}
                >
                  <BotIcon sx={{ fontSize: 48, mb: 2, color: 'primary.main', opacity: 0.7 }} />
                  <Typography variant="body2">
                    {t('aiAssistant.fab.welcomeMessage', 'Cześć! Jak mogę Ci pomóc? Zadaj pytanie dotyczące systemu MRP.')}
                  </Typography>
                </Box>
              ) : (
                messages.map((message) => (
                  <Card
                    key={message.id}
                    sx={{
                      maxWidth: '85%',
                      minWidth: 0,
                      flexShrink: 0,  // Zapobiega ściskaniu kart wiadomości
                      alignSelf: message.role === 'user' ? 'flex-end' : 'flex-start',
                      backgroundColor: message.role === 'user'
                        ? alpha(muiTheme.palette.primary.main, mode === 'dark' ? 0.3 : 0.15)
                        : mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
                      border: 'none',
                      boxShadow: 'none',
                      overflow: 'hidden'
                    }}
                  >
                    <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 }, overflow: 'hidden' }}>
                      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, mb: 0.5 }}>
                        <Avatar
                          sx={{
                            width: 24,
                            height: 24,
                            flexShrink: 0,
                            bgcolor: message.role === 'user' ? 'secondary.main' : 'primary.main'
                          }}
                        >
                          {message.role === 'user' ? <PersonIcon sx={{ fontSize: 14 }} /> : <BotIcon sx={{ fontSize: 14 }} />}
                        </Avatar>
                        <Typography variant="caption" fontWeight={600}>
                          {message.role === 'user' ? t('aiAssistant.message.you', 'Ty') : t('aiAssistant.message.assistant', 'Asystent')}
                        </Typography>
                      </Box>
                      <Box sx={{ 
                        ml: 4,
                        overflow: 'hidden',
                        wordBreak: 'break-word',
                        overflowWrap: 'break-word',
                        '& p': { 
                          margin: 0, 
                          fontSize: '0.875rem',
                          lineHeight: 1.5,
                          wordBreak: 'break-word',
                          overflowWrap: 'break-word'
                        },
                        '& ul, & ol': {
                          margin: '0.5rem 0',
                          paddingLeft: '1.5rem',
                          fontSize: '0.875rem'
                        },
                        '& code': {
                          backgroundColor: mode === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
                          padding: '0.1rem 0.3rem',
                          borderRadius: '4px',
                          fontSize: '0.75rem',
                          wordBreak: 'break-all'
                        },
                        '& pre': {
                          backgroundColor: mode === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
                          padding: '0.5rem',
                          borderRadius: '4px',
                          overflow: 'auto',
                          fontSize: '0.75rem',
                          maxWidth: '100%',
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word'
                        },
                        '& h1, & h2, & h3, & h4, & h5, & h6': {
                          fontSize: '0.9rem',
                          fontWeight: 600,
                          margin: '0.5rem 0 0.25rem 0'
                        },
                        '& strong': {
                          fontWeight: 600
                        },
                        '& a': {
                          color: 'primary.main',
                          wordBreak: 'break-all'
                        },
                        '& blockquote': {
                          margin: '0.5rem 0',
                          paddingLeft: '0.75rem',
                          borderLeft: `3px solid ${muiTheme.palette.primary.main}`,
                          opacity: 0.8
                        }
                      }}>
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {message.content}
                        </ReactMarkdown>
                        {message.isStreaming && (
                          <Box
                            component="span"
                            sx={{
                              display: 'inline-block',
                              width: 2,
                              height: '1em',
                              backgroundColor: 'primary.main',
                              ml: 0.5,
                              animation: 'blink 1s infinite',
                              '@keyframes blink': {
                                '0%, 49%': { opacity: 1 },
                                '50%, 100%': { opacity: 0 }
                              }
                            }}
                          />
                        )}
                      </Box>
                      
                      {/* Wyświetlanie załączników przy wiadomości */}
                      {message.attachments && message.attachments.length > 0 && (
                        <Box sx={{ ml: 4, mt: 1 }}>
                          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                            {message.attachments.map((attachment, attachIndex) => (
                              <Box 
                                key={attachIndex} 
                                sx={{ 
                                  display: 'flex', 
                                  alignItems: 'center',
                                  py: 0.25,
                                  px: 0.75,
                                  backgroundColor: mode === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
                                  borderRadius: 1,
                                  maxWidth: '120px'
                                }}
                              >
                                <AttachFileIcon sx={{ fontSize: 12, mr: 0.5, opacity: 0.7 }} />
                                <Typography 
                                  variant="caption" 
                                  sx={{ 
                                    overflow: 'hidden', 
                                    textOverflow: 'ellipsis', 
                                    whiteSpace: 'nowrap',
                                    fontSize: '0.65rem',
                                    opacity: 0.8
                                  }}
                                >
                                  {attachment.fileName}
                                </Typography>
                              </Box>
                            ))}
                          </Box>
                        </Box>
                      )}
                    </CardContent>
                  </Card>
                ))
              )}
              <div ref={messagesEndRef} />
            </DialogContent>

            {/* Wyświetlanie załączników */}
            {attachments.length > 0 && (
              <Box sx={{ px: 2, pb: 1, flexShrink: 0 }}>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                  {attachments.map((attachment, index) => (
                    <Card 
                      key={index} 
                      sx={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        py: 0.5,
                        px: 1,
                        backgroundColor: mode === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
                        borderRadius: 1,
                        maxWidth: '150px'
                      }}
                    >
                      <AttachFileIcon sx={{ fontSize: 14, mr: 0.5, flexShrink: 0 }} />
                      <Typography 
                        variant="caption" 
                        sx={{ 
                          flexGrow: 1, 
                          overflow: 'hidden', 
                          textOverflow: 'ellipsis', 
                          whiteSpace: 'nowrap',
                          fontSize: '0.7rem'
                        }}
                      >
                        {attachment.fileName}
                      </Typography>
                      <IconButton 
                        size="small" 
                        onClick={() => handleRemoveAttachment(index)}
                        sx={{ p: 0.25, ml: 0.5 }}
                      >
                        <CloseIcon sx={{ fontSize: 14 }} />
                      </IconButton>
                    </Card>
                  ))}
                </Box>
              </Box>
            )}

            {/* Input Area */}
            <DialogActions sx={{ p: 2, pt: 1, flexShrink: 0 }}>
              <Box sx={{ display: 'flex', gap: 1, width: '100%', alignItems: 'flex-end' }}>
                <TextField
                  fullWidth
                  size="small"
                  placeholder={hasApiKey 
                    ? t('aiAssistant.input.placeholder', 'Napisz wiadomość...') 
                    : t('aiAssistant.fab.noApiKey', 'Skonfiguruj klucz API w ustawieniach')
                  }
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyPress={handleKeyPress}
                  disabled={loading || !hasApiKey}
                  multiline
                  maxRows={3}
                  sx={{
                    '& .MuiOutlinedInput-root': {
                      borderRadius: 2,
                      backgroundColor: mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.02)'
                    }
                  }}
                />
                {/* Przycisk załącznika */}
                <Tooltip title={t('aiAssistant.fab.attachFile', 'Załącz plik')}>
                  <IconButton
                    size="small"
                    onClick={handleAttachFile}
                    disabled={loading || uploadingAttachments || !hasApiKey}
                    sx={{
                      color: attachments.length > 0 ? 'primary.main' : 'text.secondary',
                      '&:hover': { color: 'primary.main' }
                    }}
                  >
                    {uploadingAttachments ? <CircularProgress size={20} /> : <AttachFileIcon />}
                  </IconButton>
                </Tooltip>
                {/* Przycisk wyślij */}
                <IconButton
                  color="primary"
                  onClick={handleSend}
                  disabled={(!input.trim() && attachments.length === 0) || loading || !hasApiKey}
                  sx={{
                    background: fabGradient,
                    color: 'white',
                    '&:hover': { 
                      background: fabGradient,
                      opacity: 0.9 
                    },
                    '&.Mui-disabled': { 
                      backgroundColor: 'action.disabledBackground',
                      color: 'action.disabled'
                    }
                  }}
                >
                  {loading ? <CircularProgress size={20} color="inherit" /> : <SendIcon />}
                </IconButton>
              </Box>
            </DialogActions>
          </>
        )}
      </Dialog>
      
      {/* Ukryty input dla plików */}
      <input
        type="file"
        ref={fileInputRef}
        style={{ display: 'none' }}
        multiple
        accept=".txt,.csv,.json,.pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.gif,.webp"
        onChange={handleFileSelect}
      />
    </>
  );
};

export default AIChatFAB;
