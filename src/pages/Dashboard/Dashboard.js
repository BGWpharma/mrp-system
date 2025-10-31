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

  // Pobieranie ogłoszenia
  const fetchAnnouncement = useCallback(async () => {
    try {
      setTimeout(() => setAnnouncementLoading(true), 100);
      
      const announcementDoc = await getDoc(doc(db, 'settings', 'dashboard'));
      
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
          await setDoc(doc(db, 'settings', 'dashboard'), {
            announcement: '',
            updatedBy: currentUser.uid,
            updatedByName: currentUser.displayName || currentUser.email,
            updatedAt: serverTimestamp()
          });
          setAnnouncement('');
          setAnnouncementMeta({
            updatedBy: currentUser.uid,
            updatedAt: null,
            updatedByName: currentUser.displayName || currentUser.email
          });
          setAnnouncementLoading(false);
          setAnnouncementInitialized(true);
        }
      }
    } catch (error) {
      console.error('Błąd podczas pobierania ogłoszenia:', error);
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
      minHeight: '100vh',
      bgcolor: 'background.default',
      position: 'relative',
      overflow: 'hidden'
    }}>
      {/* Animowane tło */}
      <Box sx={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 0,
        pointerEvents: 'none'
      }}>
        <Box sx={{
          position: 'absolute',
          top: '20%',
          left: '10%',
          width: '400px',
          height: '400px',
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #667eea, #764ba2)',
          filter: 'blur(120px)',
          opacity: 0.08,
          animation: 'float 15s ease-in-out infinite'
        }} />
        <Box sx={{
          position: 'absolute',
          top: '60%',
          right: '10%',
          width: '350px',
          height: '350px',
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #f093fb, #f5576c)',
          filter: 'blur(120px)',
          opacity: 0.06,
          animation: 'float 18s ease-in-out infinite',
          animationDelay: '-7s'
        }} />
      </Box>

      <Container maxWidth="md" sx={{ pt: 4, pb: 4, position: 'relative', zIndex: 1 }}>
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

        {/* Sekcja Ogłoszeń */}
        <Fade in timeout={1600}>
          <Paper 
            elevation={0}
            sx={{ 
              p: 4, 
              background: isDarkMode 
                ? 'linear-gradient(135deg, rgba(139, 92, 246, 0.08) 0%, rgba(236, 72, 153, 0.05) 100%)'
                : 'linear-gradient(135deg, rgba(139, 92, 246, 0.05) 0%, rgba(236, 72, 153, 0.03) 100%)',
              borderRadius: 4, 
              border: '2px solid',
              borderColor: isDarkMode ? 'rgba(139, 92, 246, 0.3)' : 'rgba(139, 92, 246, 0.2)',
              boxShadow: isDarkMode 
                ? '0 8px 32px rgba(139, 92, 246, 0.15)'
                : '0 8px 24px rgba(139, 92, 246, 0.1)',
              transition: 'all 0.3s ease',
              backdropFilter: 'blur(10px)',
              '&:hover': {
                transform: 'translateY(-2px)',
                boxShadow: isDarkMode 
                  ? '0 12px 40px rgba(139, 92, 246, 0.2)'
                  : '0 12px 32px rgba(139, 92, 246, 0.15)',
              }
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
              <Box sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 48,
                height: 48,
                borderRadius: 2,
                background: isDarkMode 
                  ? 'linear-gradient(135deg, rgba(139, 92, 246, 0.2) 0%, rgba(236, 72, 153, 0.15) 100%)'
                  : 'linear-gradient(135deg, rgba(139, 92, 246, 0.15) 0%, rgba(236, 72, 153, 0.1) 100%)',
                mr: 2,
                border: '1px solid',
                borderColor: isDarkMode ? 'rgba(139, 92, 246, 0.3)' : 'rgba(139, 92, 246, 0.2)',
              }}>
                <AnnouncementIcon sx={{ color: 'primary.main', fontSize: 26 }} />
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
                    bgcolor: isDarkMode ? 'rgba(139, 92, 246, 0.1)' : 'rgba(139, 92, 246, 0.08)',
                    '&:hover': {
                      bgcolor: isDarkMode ? 'rgba(139, 92, 246, 0.2)' : 'rgba(139, 92, 246, 0.15)',
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
                    sx={{
                      borderColor: isDarkMode ? 'rgba(139, 92, 246, 0.3)' : 'rgba(139, 92, 246, 0.4)',
                      color: 'primary.main',
                      '&:hover': {
                        borderColor: 'primary.main',
                        bgcolor: isDarkMode ? 'rgba(139, 92, 246, 0.1)' : 'rgba(139, 92, 246, 0.08)',
                      }
                    }}
                  >
                    {t('dashboard.cancel')}
                  </Button>
                  <Button 
                    variant="contained" 
                    startIcon={<SaveIcon />}
                    onClick={saveAnnouncement}
                    sx={{
                      background: 'linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)',
                      boxShadow: '0 4px 15px rgba(139, 92, 246, 0.3)',
                      '&:hover': {
                        background: 'linear-gradient(135deg, #7c3aed 0%, #db2777 100%)',
                        boxShadow: '0 6px 20px rgba(139, 92, 246, 0.4)',
                        transform: 'translateY(-1px)',
                      }
                    }}
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
                  borderRadius: 2,
                  bgcolor: isDarkMode ? 'rgba(0, 0, 0, 0.2)' : 'rgba(255, 255, 255, 0.6)',
                  border: '1px solid',
                  borderColor: isDarkMode ? 'rgba(139, 92, 246, 0.15)' : 'rgba(139, 92, 246, 0.1)',
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
                  borderRadius: 2,
                  bgcolor: isDarkMode ? 'rgba(0, 0, 0, 0.15)' : 'rgba(255, 255, 255, 0.5)',
                  border: '1px dashed',
                  borderColor: isDarkMode ? 'rgba(139, 92, 246, 0.2)' : 'rgba(139, 92, 246, 0.15)',
                  textAlign: 'center'
                }}>
                  <Typography variant="body2" sx={{ fontStyle: 'italic', color: 'text.secondary', opacity: 0.7 }}>
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

      {/* Animacja float */}
      <style>
        {`
          @keyframes float {
            0%, 100% {
              transform: translateY(0) translateX(0);
            }
            33% {
              transform: translateY(-20px) translateX(10px);
            }
            66% {
              transform: translateY(10px) translateX(-10px);
            }
          }
        `}
      </style>
    </Box>
  );
};

export default Dashboard;
