// src/pages/Dashboard/Dashboard.js
import React, { useState, useEffect, useCallback } from 'react';
import { 
  Container, 
  Paper, 
  Typography, 
  Box, 
  Button, 
  TextField,
  IconButton,
  Alert,
  Snackbar,
  useTheme,
  Fade
} from '@mui/material';
import {
  Edit as EditIcon,
  Save as SaveIcon,
  Cancel as CancelIcon,
  Announcement as AnnouncementIcon
} from '@mui/icons-material';
import { useAuth } from '../../hooks/useAuth';
import { formatTimestamp } from '../../utils/dateUtils';
import { useTranslation } from '../../hooks/useTranslation';
import { db } from '../../services/firebase/config';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { createRealtimeNotification } from '../../services/notificationService';
import { getAllActiveUsers } from '../../services/userService';

const Dashboard = () => {
  const { currentUser } = useAuth();
  const { t } = useTranslation();
  const theme = useTheme();
  const isDarkMode = theme.palette.mode === 'dark';
  
  // Stan dla systemu ogłoszeń
  const [announcement, setAnnouncement] = useState('');
  const [isEditingAnnouncement, setIsEditingAnnouncement] = useState(false);
  const [editedAnnouncement, setEditedAnnouncement] = useState('');
  const [announcementLoading, setAnnouncementLoading] = useState(false);
  const [announcementInitialized, setAnnouncementInitialized] = useState(false);
  const [announcementMeta, setAnnouncementMeta] = useState({ 
    updatedBy: '', 
    updatedAt: null,
    updatedByName: ''
  });
  
  // Stan dla notyfikacji
  const [notification, setNotification] = useState({
    open: false,
    message: '',
    severity: 'success'
  });

  // ⚡ OPTYMALIZACJA WYDAJNOŚCI: Pobieranie ogłoszenia z timeout 5s
  const fetchAnnouncement = useCallback(async () => {
    // Stwórz AbortController do anulowania zapytania przy timeout
    const controller = new AbortController();
    const TIMEOUT_MS = 5000; // 5 sekund timeout
    
    // Timeout - anuluj zapytanie jeśli trwa za długo
    const timeoutId = setTimeout(() => {
      controller.abort();
      console.warn('⚠️ fetchAnnouncement: Przekroczono timeout 5s');
    }, TIMEOUT_MS);
    
    try {
      setTimeout(() => setAnnouncementLoading(true), 100);
      
      // Firestore getDoc nie wspiera AbortSignal bezpośrednio,
      // ale używamy Promise.race dla implementacji timeout
      const fetchPromise = getDoc(doc(db, 'settings', 'dashboard'));
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('TIMEOUT')), TIMEOUT_MS);
      });
      
      const announcementDoc = await Promise.race([fetchPromise, timeoutPromise]);
      
      clearTimeout(timeoutId);
      
      if (announcementDoc.exists()) {
        const data = announcementDoc.data();
        
        if (data.updatedAt && data.updatedAt.toDate) {
          setAnnouncement(data.announcement || '');
          setAnnouncementMeta({
            updatedBy: data.updatedBy || '',
            updatedAt: data.updatedAt,
            updatedByName: data.updatedByName || ''
          });
          setAnnouncementLoading(false);
          setAnnouncementInitialized(true);
        } else {
          // Utwórz dokument tylko jeśli nie ma timeout
          try {
            await setDoc(doc(db, 'settings', 'dashboard'), {
              announcement: '',
              updatedBy: currentUser.uid,
              updatedByName: currentUser.displayName || currentUser.email,
              updatedAt: serverTimestamp()
            });
          } catch (setError) {
            console.warn('Nie udało się utworzyć dokumentu ogłoszenia:', setError);
          }
          setAnnouncement('');
          setAnnouncementMeta({
            updatedBy: currentUser.uid,
            updatedAt: null,
            updatedByName: currentUser.displayName || currentUser.email
          });
          setAnnouncementLoading(false);
          setAnnouncementInitialized(true);
        }
      } else {
        // Dokument nie istnieje - ustaw domyślne wartości
        setAnnouncement('');
        setAnnouncementLoading(false);
        setAnnouncementInitialized(true);
      }
    } catch (error) {
      clearTimeout(timeoutId);
      
      // Obsłuż timeout gracefully
      if (error.message === 'TIMEOUT' || error.name === 'AbortError') {
        console.warn('⚡ Dashboard: Timeout pobierania ogłoszenia - używam cache');
      } else {
        console.error('Błąd podczas pobierania ogłoszenia:', error);
      }
      
      // Fallback do localStorage
      const savedAnnouncement = localStorage.getItem('dashboardAnnouncement') || '';
      setAnnouncement(savedAnnouncement);
      setAnnouncementLoading(false);
      setAnnouncementInitialized(true);
    }
  }, [currentUser.uid, currentUser.displayName, currentUser.email]);

  // Zapisywanie ogłoszenia
  const saveAnnouncement = useCallback(async () => {
    try {
      await setDoc(doc(db, 'settings', 'dashboard'), {
        announcement: editedAnnouncement,
        updatedBy: currentUser.uid,
        updatedByName: currentUser.displayName || currentUser.email,
        updatedAt: serverTimestamp()
      });
      
      setAnnouncement(editedAnnouncement);
      setIsEditingAnnouncement(false);
      
      localStorage.setItem('dashboardAnnouncement', editedAnnouncement);
      
      showNotification('Ogłoszenie zostało pomyślnie zaktualizowane!');
      
      // Wysłanie powiadomienia do wszystkich użytkowników
      try {
        const activeUsers = await getAllActiveUsers();
        const userName = currentUser.displayName || currentUser.email || 'Administrator';
        
        if (activeUsers && activeUsers.length > 0) {
          await createRealtimeNotification({
            recipientIds: activeUsers.map(user => user.id || user.uid),
            title: 'Aktualizacja ogłoszenia w systemie',
            message: `${userName} zaktualizował ogłoszenie: ${editedAnnouncement.length > 80 
              ? `${editedAnnouncement.substring(0, 80)}...` 
              : editedAnnouncement}`,
            priority: 'normal',
            entityType: 'announcement',
            createdBy: currentUser.uid
          });
          console.log('Powiadomienie o aktualizacji ogłoszenia zostało utworzone');
        }
      } catch (notificationError) {
        console.error('Błąd podczas tworzenia powiadomienia o ogłoszeniu:', notificationError);
      }
    } catch (error) {
      console.error('Błąd podczas zapisywania ogłoszenia:', error);
      localStorage.setItem('dashboardAnnouncement', editedAnnouncement);
      setAnnouncement(editedAnnouncement);
      setIsEditingAnnouncement(false);
      showNotification('Wystąpił błąd podczas zapisywania ogłoszenia. Zapisano lokalnie.', 'error');
    }
  }, [editedAnnouncement, currentUser.uid, currentUser.displayName, currentUser.email]);

  // Obsługa klawiszy
  const handleKeyDown = useCallback((event) => {
    if (event.ctrlKey && event.key === 'Enter') {
      saveAnnouncement();
    }
  }, [saveAnnouncement]);

  // Rozpoczęcie edycji ogłoszenia
  const startEditingAnnouncement = useCallback(() => {
    setEditedAnnouncement(announcement);
    setIsEditingAnnouncement(true);
  }, [announcement]);

  // Anulowanie edycji ogłoszenia
  const cancelEditingAnnouncement = useCallback(() => {
    setIsEditingAnnouncement(false);
  }, []);

  // Wyświetlanie notyfikacji
  const showNotification = useCallback((message, severity = 'success') => {
    setNotification({
      open: true,
      message,
      severity
    });
  }, []);

  const handleCloseNotification = useCallback(() => {
    setNotification(prev => ({ ...prev, open: false }));
  }, []);

  // Formatowanie informacji o ostatniej aktualizacji
  const renderLastUpdatedInfo = () => {
    if (!announcementMeta.updatedAt) return null;

    const formattedDate = announcementMeta.updatedAt 
      ? formatTimestamp(announcementMeta.updatedAt, true) 
      : '';

    const authorText = announcementMeta.updatedByName 
      ? t('dashboard.by', { name: announcementMeta.updatedByName })
      : '';

    return (
      <Box sx={{ mt: 2, pt: 2, borderTop: '1px solid', borderColor: 'divider' }}>
        <Typography variant="caption" sx={{ color: 'text.secondary', fontStyle: 'italic' }}>
          {t('dashboard.lastUpdated')}: {formattedDate} {authorText}
        </Typography>
      </Box>
    );
  };

  // Pobieranie danych przy montowaniu
  useEffect(() => {
    fetchAnnouncement();
  }, [fetchAnnouncement]);

  return (
    <Box sx={{ 
      minHeight: '100vh'
    }}>
      <Container maxWidth="md" sx={{ pt: 4, pb: 4 }}>
        {/* Logo Animowane */}
        <Fade in timeout={1000}>
          <Box sx={{ 
            display: 'flex', 
            justifyContent: 'center', 
            mb: 6,
            mt: 4
          }}>
            <Box sx={{ 
              width: { xs: '280px', sm: '350px', md: '420px' },
              height: { xs: '280px', sm: '350px', md: '420px' },
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <img 
                src="/rotating_svg_logo.svg" 
                alt="BGW Pharma Logo"
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'contain',
                  filter: isDarkMode ? 'brightness(1.2)' : 'brightness(1)'
                }}
              />
            </Box>
          </Box>
        </Fade>

        {/* Powitanie */}
        <Fade in timeout={1200}>
          <Typography 
            variant="h4" 
            align="center"
            gutterBottom
            sx={{ 
              mb: 1,
              fontWeight: 500,
              color: 'text.primary'
            }}
          >
            {t('dashboard.title')}
          </Typography>
        </Fade>

        <Fade in timeout={1400}>
          <Typography 
            variant="subtitle1" 
            align="center"
            sx={{ 
              mb: 6,
              color: 'text.secondary'
            }}
          >
            {t('dashboard.welcome', { name: currentUser.displayName || currentUser.email })}
          </Typography>
        </Fade>

        {/* Sekcja Ogłoszeń - Clean Design */}
        <Fade in timeout={1600}>
          <Paper 
            elevation={0}
            sx={{ 
              p: 4, 
              bgcolor: 'background.paper',
              borderRadius: 2, 
              border: '1px solid',
              borderColor: 'divider',
              boxShadow: isDarkMode 
                ? '0 1px 3px rgba(0, 0, 0, 0.12)'
                : '0 1px 3px rgba(0, 0, 0, 0.06)',
              transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
              '&:hover': {
                borderColor: isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
                boxShadow: isDarkMode 
                  ? '0 4px 12px rgba(0, 0, 0, 0.15)'
                  : '0 4px 12px rgba(0, 0, 0, 0.08)',
              }
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
              <Box sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 40,
                height: 40,
                borderRadius: 1.5,
                bgcolor: isDarkMode ? 'rgba(59, 130, 246, 0.1)' : 'rgba(59, 130, 246, 0.08)',
                mr: 2,
              }}>
                <AnnouncementIcon sx={{ color: 'primary.main', fontSize: 22 }} />
              </Box>
              <Typography variant="h5" sx={{ fontWeight: 600, flex: 1 }}>
                {t('dashboard.announcements')}
              </Typography>
              {!isEditingAnnouncement && (
                <IconButton 
                  size="medium" 
                  onClick={startEditingAnnouncement}
                  sx={{ 
                    ml: 'auto',
                    bgcolor: isDarkMode ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.04)',
                    '&:hover': {
                      bgcolor: isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)',
                    }
                  }}
                  title={t('dashboard.editAnnouncement')}
                >
                  <EditIcon sx={{ fontSize: 20 }} />
                </IconButton>
              )}
            </Box>
            
            {!announcementInitialized ? (
              <Typography variant="body2" sx={{ mt: 2, fontStyle: 'italic', color: 'text.secondary' }}>
                {t('dashboard.loadingAnnouncements')}
              </Typography>
            ) : isEditingAnnouncement ? (
              <Box sx={{ mt: 2 }}>
                <TextField
                  fullWidth
                  multiline
                  rows={4}
                  variant="outlined"
                  placeholder={t('dashboard.announcementPlaceholder')}
                  value={editedAnnouncement}
                  onChange={(e) => setEditedAnnouncement(e.target.value)}
                  onKeyDown={handleKeyDown}
                  helperText={t('dashboard.announcementHelper')}
                />
                <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2, gap: 1.5 }}>
                  <Button 
                    variant="outlined" 
                    startIcon={<CancelIcon />}
                    onClick={cancelEditingAnnouncement}
                  >
                    {t('dashboard.cancel')}
                  </Button>
                  <Button 
                    variant="contained" 
                    startIcon={<SaveIcon />}
                    onClick={saveAnnouncement}
                  >
                    {t('dashboard.save')}
                  </Button>
                </Box>
              </Box>
            ) : announcement ? (
              <>
                <Box sx={{
                  mt: 2,
                  p: 3,
                  borderRadius: 1.5,
                  bgcolor: isDarkMode ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.02)',
                  border: '1px solid',
                  borderColor: 'divider',
                }}>
                  <Typography 
                    variant="body1" 
                    sx={{ 
                      whiteSpace: 'pre-wrap', 
                      lineHeight: 1.9,
                      fontSize: '1.05rem',
                      color: 'text.primary'
                    }}
                  >
                    {announcement}
                  </Typography>
                </Box>
                {renderLastUpdatedInfo()}
              </>
            ) : (
              <>
                <Box sx={{
                  mt: 2,
                  p: 3,
                  borderRadius: 1.5,
                  bgcolor: isDarkMode ? 'rgba(255, 255, 255, 0.02)' : 'rgba(0, 0, 0, 0.02)',
                  border: '1px dashed',
                  borderColor: 'divider',
                  textAlign: 'center'
                }}>
                  <Typography variant="body2" sx={{ fontStyle: 'italic', color: 'text.secondary' }}>
                    {t('dashboard.noAnnouncements')}
                  </Typography>
                </Box>
                {renderLastUpdatedInfo()}
              </>
            )}
          </Paper>
        </Fade>
      </Container>

      {/* Notyfikacja */}
      <Snackbar 
        open={notification.open} 
        autoHideDuration={6000} 
        onClose={handleCloseNotification}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <Alert 
          onClose={handleCloseNotification} 
          severity={notification.severity} 
          variant="filled"
          sx={{ width: '100%' }}
        >
          {notification.message}
        </Alert>
      </Snackbar>

    </Box>
  );
};

export default Dashboard;
