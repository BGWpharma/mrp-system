import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Typography,
  Box,
  Divider,
  CircularProgress,
  Alert,
  FormControlLabel,
  Checkbox,
  IconButton,
  Paper,
  styled
} from '@mui/material';
import {
  BugReport as BugIcon,
  Upload as UploadIcon,
  Delete as DeleteIcon,
  Screenshot as ScreenshotIcon,
  ContentPaste as ContentPasteIcon,
  Crop as CropIcon,
  Close as CloseIcon
} from '@mui/icons-material';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';
import { useTranslation } from '../../hooks/useTranslation';
import { addBugReportWithScreenshot } from '../../services/bugReportService';
import { 
  getCapturedLogs, 
  addLogListener, 
  removeLogListener,
  clearCapturedLogs
} from '../../services/logsCaptureService';
import { alpha } from '@mui/material/styles';

// Styled components
const PreviewImage = styled('img')({
  width: '100%',
  maxHeight: '200px',
  objectFit: 'contain',
  borderRadius: '4px',
  marginTop: '8px'
});

const UploadButton = styled(Button)({
  position: 'relative',
  overflow: 'hidden',
  '& input': {
    position: 'absolute',
    top: 0,
    right: 0,
    margin: 0,
    padding: 0,
    fontSize: '20px',
    cursor: 'pointer',
    opacity: 0,
    filter: 'alpha(opacity=0)'
  }
});

const ConsoleLogBox = styled(Paper)(({ theme }) => ({
  padding: theme.spacing(1),
  marginTop: theme.spacing(1),
  backgroundColor: theme.palette.mode === 'dark' ? '#2d2d2d' : '#f5f5f5',
  maxHeight: '150px',
  overflowY: 'auto',
  whiteSpace: 'pre-wrap',
  fontSize: '0.75rem',
  fontFamily: 'monospace'
}));

// Dodaję styled component dla obszaru docelowego przeciągania plików
const DropZone = styled(Paper)(({ theme }) => ({
  border: `2px dashed ${theme.palette.divider}`,
  borderRadius: theme.shape.borderRadius,
  padding: theme.spacing(3),
  textAlign: 'center',
  cursor: 'pointer',
  marginTop: theme.spacing(2),
  backgroundColor: theme.palette.background.default,
  transition: 'border-color 0.2s, background-color 0.2s',
  '&:hover': {
    borderColor: theme.palette.primary.main,
    backgroundColor: alpha(theme.palette.primary.main, 0.04),
  },
  '&.drag-over': {
    borderColor: theme.palette.primary.main,
    backgroundColor: alpha(theme.palette.primary.main, 0.08),
  }
}));

/**
 * Dialog do zgłaszania błędów w aplikacji
 * @param {boolean} open - Czy dialog jest otwarty
 * @param {function} onClose - Funkcja wywoływana przy zamknięciu dialogu
 */
const BugReportDialog = ({ open, onClose }) => {
  const { currentUser } = useAuth();
  const { showSuccess, showError, showWarning, showInfo } = useNotification();
  const { t } = useTranslation();
  
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    includeConsoleLogs: true,
    priority: 'średni'
  });
  
  const [screenshot, setScreenshot] = useState(null);
  const [screenshotPreview, setScreenshotPreview] = useState('');
  const [consoleLogs, setConsoleLogs] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [reopenDialog, setReopenDialog] = useState(false);
  
  // Dodaję stan do obsługi edycji/kadrowania zrzutu ekranu
  const [isEditingScreenshot, setIsEditingScreenshot] = useState(false);
  const [editedScreenshotData, setEditedScreenshotData] = useState(null);
  
  // Nasłuchujemy na zmiany w logach konsoli
  useEffect(() => {
    // Funkcja aktualizująca nasze logi
    const updateLogs = (logs) => {
      setConsoleLogs(logs);
    };
    
    // Jeśli dialog jest otwarty, pobieramy aktualne logi i zaczynamy nasłuchiwać na zmiany
    if (open) {
      // Dodajemy nasłuchiwanie (automatycznie otrzymamy aktualne logi)
      addLogListener(updateLogs);
    }
    
    // Sprzątamy po sobie
    return () => {
      if (open) {
        removeLogListener(updateLogs);
      }
    };
  }, [open]);
  
  // Efekt obsługujący ponowne otwarcie dialogu
  useEffect(() => {
    if (reopenDialog && !open) {
      const timer = setTimeout(() => {
        // Po opóźnieniu, sygnalizujemy potrzebę ponownego otwarcia dialogu
        onClose(); // Wywołujemy onClose bez argumentów, aby zresetować wewnętrzny stan rodzica
        setReopenDialog(false);
      }, 1000);
      
      return () => clearTimeout(timer);
    }
  }, [reopenDialog, open, onClose]);
  
  // Funkcja robienia zrzutu ekranu
  const takeScreenshot = useCallback(async () => {
    try {
      // Zaznaczamy, że dialog powinien zostać ponownie otwarty
      setReopenDialog(true);
      
      // Tymczasowo zamykamy dialog przed zrzutem
      onClose();
      
      // Znacznie zwiększamy czas oczekiwania przed wykonaniem zrzutu, aby dać czas na zamknięcie dialogu
      // i zniknięcie wszelkich elementów UI przeglądarki (np. menu kontekstowe)
      showInfo(t('common.bugReport.screenshotPreparing'));
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Próba użycia API Screenshot (dostępne tylko w niektórych przeglądarkach)
      if (navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) {
        const stream = await navigator.mediaDevices.getDisplayMedia({ 
          video: { mediaSource: 'screen' } 
        });
        
        // Tworzymy element video i czekamy na załadowanie strumienia
        const video = document.createElement('video');
        video.srcObject = stream;
        
        // Czekamy na załadowanie metadanych wideo
        await new Promise(resolve => {
          video.onloadedmetadata = () => {
            video.play();
            resolve();
          };
        });
        
        // Dajemy dodatkowy czas na stabilizację obrazu
        await new Promise(resolve => setTimeout(resolve, 300));
        
        // Tworzymy canvas do zrzutu
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        
        // Rysujemy klatkę wideo na canvas
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        // Zatrzymujemy wszystkie ścieżki strumienia
        stream.getTracks().forEach(track => track.stop());
        
        // Konwertujemy canvas do Blob
        const blob = await new Promise(resolve => 
          canvas.toBlob(resolve, 'image/png')
        );
        
        // Tworzymy plik z Blob
        const file = new File([blob], 'screenshot.png', { type: 'image/png' });
        
        // Ustawiamy zrzut ekranu
        setScreenshot(file);
        setScreenshotPreview(URL.createObjectURL(file));
        
        // Pokazujemy powiadomienie o sukcesie
        showSuccess(t('common.bugReport.screenshotSuccess'));
      } else {
        throw new Error('API Screenshot nie jest obsługiwane przez tę przeglądarkę');
      }
    } catch (error) {
      console.error('Błąd podczas robienia zrzutu ekranu:', error);
      showError(t('common.bugReport.screenshotError'));
    }
  }, [onClose, showError, showSuccess, showInfo, t]);
  
  // Obsługa zmiany pliku zrzutu ekranu
  const handleScreenshotChange = (event) => {
    const file = event.target.files[0];
    if (file) {
      setScreenshot(file);
      setScreenshotPreview(URL.createObjectURL(file));
    }
  };
  
  // Usunięcie zrzutu ekranu
  const handleRemoveScreenshot = () => {
    setScreenshot(null);
    if (screenshotPreview) {
      URL.revokeObjectURL(screenshotPreview);
      setScreenshotPreview('');
    }
  };
  
  // Zmiana wartości pól formularza
  const handleChange = (e) => {
    const { name, value, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: name === 'includeConsoleLogs' ? checked : value
    }));
  };
  
  // Dodaję funkcję czyszczenia logów
  const handleClearLogs = () => {
    clearCapturedLogs();
    showInfo(t('common.bugReport.logsClearedInfo'));
  };
  
  // Dodaję funkcję do obsługi wklejania ze schowka
  const handlePaste = useCallback((event) => {
    const items = (event.clipboardData || event.originalEvent.clipboardData).items;
    
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const blob = items[i].getAsFile();
        
        // Konwertujemy Blob na File
        const file = new File([blob], "pasted-image.png", { type: "image/png" });
        
        // Aktualizujemy stan zrzutu ekranu
        setScreenshot(file);
        setScreenshotPreview(URL.createObjectURL(file));
        
        // Pokazujemy powiadomienie
        showSuccess(t('common.bugReport.screenshotPasted'));
        
        // Przerywamy pętlę po znalezieniu obrazu
        break;
      }
    }
  }, [showSuccess, t]);
  
  // Dodajemy efekt do nasłuchiwania zdarzeń wklejania
  useEffect(() => {
    if (open) {
      // Dodajemy nasłuchiwanie zdarzenia paste na dokumencie
      document.addEventListener('paste', handlePaste);
      
      // Sprzątamy po sobie
      return () => {
        document.removeEventListener('paste', handlePaste);
      };
    }
  }, [open, handlePaste]);
  
  // Dodajemy funkcję do obsługi upuszczania plików (drag & drop)
  const handleDrop = useCallback((event) => {
    event.preventDefault();
    event.stopPropagation();
    
    if (event.dataTransfer.files && event.dataTransfer.files.length > 0) {
      const file = event.dataTransfer.files[0];
      
      // Sprawdzamy czy to obraz
      if (file.type.startsWith('image/')) {
        setScreenshot(file);
        setScreenshotPreview(URL.createObjectURL(file));
        showSuccess(t('common.bugReport.screenshotAdded'));
      } else {
        showWarning(t('common.bugReport.invalidFile'));
      }
    }
  }, [showSuccess, showWarning, t]);

  // Funkcje do obsługi przeciągania (dla wizualnego feedbacku)
  const handleDragOver = useCallback((event) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.classList.add('drag-over');
  }, []);

  const handleDragLeave = useCallback((event) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.classList.remove('drag-over');
  }, []);

  // Dodajemy efekt do obsługi zdarzeń drag & drop
  useEffect(() => {
    if (open) {
      const dialogContent = document.querySelector('.MuiDialogContent-root');
      
      if (dialogContent) {
        dialogContent.addEventListener('drop', handleDrop);
        dialogContent.addEventListener('dragover', handleDragOver);
        dialogContent.addEventListener('dragleave', handleDragLeave);
        
        // Dodajemy style do .MuiDialogContent-root dla drag & drop
        const style = document.createElement('style');
        style.innerHTML = `
          .MuiDialogContent-root.drag-over {
            background-color: rgba(25, 118, 210, 0.08);
            border: 2px dashed #1976d2;
          }
        `;
        document.head.appendChild(style);
        
        return () => {
          dialogContent.removeEventListener('drop', handleDrop);
          dialogContent.removeEventListener('dragover', handleDragOver);
          dialogContent.removeEventListener('dragleave', handleDragLeave);
          document.head.removeChild(style);
        };
      }
    }
  }, [open, handleDrop, handleDragOver, handleDragLeave]);
  
  // Dodaję obsługę kliknięcia w drop zone, która otwiera okno wyboru pliku
  const handleDropZoneClick = () => {
    // Symulujemy kliknięcie w ukryty input file
    const fileInput = document.getElementById('screenshot-file-input');
    if (fileInput) {
      fileInput.click();
    }
  };
  
  // Wysłanie zgłoszenia
  const handleSubmit = async () => {
    // Sprawdzamy czy tytuł i opis są wprowadzone
    if (!formData.title.trim()) {
      setError(t('common.bugReport.validation.titleRequired'));
      return;
    }
    
    if (!formData.description.trim()) {
      setError(t('common.bugReport.validation.descriptionRequired'));
      return;
    }
    
    setLoading(true);
    setError('');
    
    try {
      // Pobieramy aktualne logi z serwisu
      const currentLogs = getCapturedLogs();
      
      // Przygotowujemy dane zgłoszenia
      const reportData = {
        ...formData,
        browserInfo: {
          userAgent: navigator.userAgent,
          language: navigator.language,
          platform: navigator.platform,
          screenWidth: window.screen.width,
          screenHeight: window.screen.height
        },
        consoleLogs: formData.includeConsoleLogs ? currentLogs : null,
        path: window.location.pathname
      };
      
      // Używamy funkcji do przesyłania zrzutu ekranu do Firebase Storage
      await addBugReportWithScreenshot(reportData, screenshot, currentUser.uid);
      
      // Informujemy o sukcesie
      showSuccess(t('common.bugReport.success'));
      
      // Resetujemy formularz i zamykamy dialog
      setFormData({
        title: '',
        description: '',
        includeConsoleLogs: true,
        priority: 'średni'
      });
      handleRemoveScreenshot();
      onClose();
    } catch (error) {
      console.error('Błąd podczas wysyłania zgłoszenia:', error);
      setError(`Wystąpił błąd podczas wysyłania zgłoszenia: ${error.message}`);
      showError(t('common.bugReport.error'));
    } finally {
      setLoading(false);
    }
  };
  
  // Zamknięcie i reset
  const handleClose = () => {
    // Resetujemy stan formularza
    setFormData({
      title: '',
      description: '',
      includeConsoleLogs: true,
      priority: 'średni'
    });
    setError('');
    handleRemoveScreenshot();
    onClose();
  };
  
  // Funkcja do rozpoczęcia edycji zrzutu ekranu
  const handleStartEditing = () => {
    if (screenshotPreview) {
      setIsEditingScreenshot(true);
    } else {
      showWarning(t('common.bugReport.editing.editWarning'));
    }
  };

  // Funkcja do zakończenia edycji i zastosowania zmian
  const handleFinishEditing = (editedImageDataUrl) => {
    // Konwertujemy dataURL do Blob, a następnie do File
    fetch(editedImageDataUrl)
      .then(res => res.blob())
      .then(blob => {
        const file = new File([blob], "edited-screenshot.png", { type: "image/png" });
        
        // Aktualizujemy stan zrzutu ekranu
        setScreenshot(file);
        setScreenshotPreview(URL.createObjectURL(file));
        setIsEditingScreenshot(false);
        
        showSuccess(t('common.bugReport.editing.croppedSuccess'));
      });
  };

  // Funkcja do anulowania edycji
  const handleCancelEditing = () => {
    setIsEditingScreenshot(false);
  };

  // Komponenty dla trybu edycji zrzutu ekranu
  const ScreenshotEditor = () => {
    const [cropArea, setCropArea] = useState({ x: 0, y: 0, width: 0, height: 0 });
    const canvasRef = useRef(null);
    const imageRef = useRef(null);
    const [isDragging, setIsDragging] = useState(false);
    const [startPos, setStartPos] = useState({ x: 0, y: 0 });
    
    useEffect(() => {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      const image = imageRef.current;
      
      image.onload = () => {
        // Dopasowujemy rozmiar canvas do obrazu
        canvas.width = image.width;
        canvas.height = image.height;
        
        // Rysujemy obraz
        ctx.drawImage(image, 0, 0);
        
        // Inicjalizujemy obszar przycinania jako cały obraz
        setCropArea({ x: 0, y: 0, width: image.width, height: image.height });
      };
    }, []);
    
    // Funkcja do rysowania obszaru zaznaczenia
    const drawCropOverlay = () => {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      const image = imageRef.current;
      
      // Czyścimy canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // Rysujemy obraz
      ctx.drawImage(image, 0, 0);
      
      // Dodajemy półprzezroczystą nakładkę
      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      // Wycinamy obszar zaznaczenia
      ctx.clearRect(cropArea.x, cropArea.y, cropArea.width, cropArea.height);
      
      // Rysujemy ramkę wokół zaznaczenia
      ctx.strokeStyle = '#1976d2';
      ctx.lineWidth = 2;
      ctx.strokeRect(cropArea.x, cropArea.y, cropArea.width, cropArea.height);
      
      // Rysujemy uchwyty do zmiany rozmiaru
      const handleSize = 8;
      ctx.fillStyle = '#1976d2';
      
      // Narożniki
      ctx.fillRect(cropArea.x - handleSize/2, cropArea.y - handleSize/2, handleSize, handleSize); // Lewy górny
      ctx.fillRect(cropArea.x + cropArea.width - handleSize/2, cropArea.y - handleSize/2, handleSize, handleSize); // Prawy górny
      ctx.fillRect(cropArea.x - handleSize/2, cropArea.y + cropArea.height - handleSize/2, handleSize, handleSize); // Lewy dolny
      ctx.fillRect(cropArea.x + cropArea.width - handleSize/2, cropArea.y + cropArea.height - handleSize/2, handleSize, handleSize); // Prawy dolny
    };
    
    // Efekt do rysowania obszaru zaznaczenia
    useEffect(() => {
      if (canvasRef.current && imageRef.current) {
        drawCropOverlay();
      }
    }, [cropArea]);
    
    // Obsługa rozpoczęcia zaznaczania
    const handleMouseDown = (e) => {
      const canvas = canvasRef.current;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      
      setIsDragging(true);
      setStartPos({ x, y });
    };
    
    // Obsługa ruchu myszy podczas zaznaczania
    const handleMouseMove = (e) => {
      if (!isDragging) return;
      
      const canvas = canvasRef.current;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      
      // Obliczamy nowy obszar zaznaczenia
      const newCropArea = {
        x: Math.min(startPos.x, x),
        y: Math.min(startPos.y, y),
        width: Math.abs(x - startPos.x),
        height: Math.abs(y - startPos.y)
      };
      
      setCropArea(newCropArea);
    };
    
    // Obsługa zakończenia zaznaczania
    const handleMouseUp = () => {
      setIsDragging(false);
    };
    
    // Funkcja do przycinania obrazu
    const handleCrop = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      // Ustawiamy rozmiar canvas na rozmiar przycięcia
      canvas.width = cropArea.width;
      canvas.height = cropArea.height;
      
      // Kopiujemy wybrany fragment obrazu
      ctx.drawImage(
        imageRef.current,
        cropArea.x, cropArea.y, cropArea.width, cropArea.height,
        0, 0, cropArea.width, cropArea.height
      );
      
      // Pobieramy dataURL i wysyłamy do funkcji rodzica
      const dataUrl = canvas.toDataURL('image/png');
      handleFinishEditing(dataUrl);
    };
    
    return (
      <Box sx={{ position: 'relative' }}>
        <Box sx={{ overflow: 'auto', maxHeight: '60vh' }}>
          <Box sx={{ position: 'relative' }}>
            <img 
              ref={imageRef} 
              src={screenshotPreview} 
              alt={t('common.bugReport.editing.editingAlt')} 
              style={{ display: 'none' }} 
            />
            <canvas
              ref={canvasRef}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              style={{ cursor: 'crosshair', maxWidth: '100%', display: 'block' }}
            />
          </Box>
        </Box>
        
        <Box sx={{ mt: 2, display: 'flex', justifyContent: 'space-between' }}>
          <Button onClick={handleCancelEditing} color="inherit">
            {t('common.bugReport.editing.cancel')}
          </Button>
          <Box>
            <Button 
              onClick={() => setCropArea({ x: 0, y: 0, width: imageRef.current.width, height: imageRef.current.height })} 
              color="inherit" 
              sx={{ mr: 1 }}
            >
              {t('common.bugReport.editing.resetSelection')}
            </Button>
            <Button onClick={handleCrop} variant="contained" color="primary">
              {t('common.bugReport.editing.crop')}
            </Button>
          </Box>
        </Box>
      </Box>
    );
  };

  return (
    <>
      <Dialog 
        open={open} 
        onClose={handleClose} 
        maxWidth="md" 
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: '8px',
            overflow: 'hidden'
          }
        }}
      >
        <DialogTitle sx={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: 1,
          bgcolor: theme => theme.palette.mode === 'dark' ? 'rgba(25, 35, 55, 0.8)' : 'rgba(240, 245, 250, 0.8)',
          borderBottom: '1px solid',
          borderColor: 'divider',
          padding: '16px 24px'
        }}>
          <BugIcon color="error" />
          <Typography component="span" variant="h6">{t('common.bugReport.title')}</Typography>
        </DialogTitle>
        
        <DialogContent sx={{ p: 3, mt: 1 }}>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}
          
          <TextField
            name="title"
            label={t('common.bugReport.titleField')}
            value={formData.title}
            onChange={handleChange}
            fullWidth
            required
            margin="dense"
            placeholder={t('common.bugReport.titlePlaceholder')}
          />
          
          <TextField
            name="description"
            label={t('common.bugReport.descriptionField')}
            value={formData.description}
            onChange={handleChange}
            fullWidth
            required
            multiline
            rows={4}
            margin="dense"
            placeholder={t('common.bugReport.descriptionPlaceholder')}
            sx={{ mt: 2 }}
          />
          
          <Box sx={{ mt: 3 }}>
            <Typography variant="subtitle1" gutterBottom>
              {t('common.bugReport.screenshot')}
            </Typography>
            
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 1 }}>
              <UploadButton 
                variant="outlined" 
                startIcon={<UploadIcon />}
                component="label"
              >
{t('common.bugReport.selectFile')}
                <input
                  id="screenshot-file-input"
                  type="file"
                  accept="image/*"
                  onChange={handleScreenshotChange}
                  hidden
                />
              </UploadButton>
              
              <Button
                variant="outlined"
                color="secondary"
                startIcon={<ContentPasteIcon />}
                onClick={() => showInfo(t('common.bugReport.pasteInfo'))}
              >
                {t('common.bugReport.pasteFromClipboard')}
              </Button>
              
              <Button
                variant="outlined"
                color="primary"
                startIcon={<ScreenshotIcon />}
                onClick={takeScreenshot}
              >
                {t('common.bugReport.takeScreenshot')}
              </Button>
              
              {screenshot && (
                <IconButton 
                  color="error" 
                  onClick={handleRemoveScreenshot}
                  size="small"
                >
                  <DeleteIcon />
                </IconButton>
              )}
            </Box>
            
            {screenshotPreview ? (
              <Box sx={{ mt: 2, position: 'relative' }}>
                <Paper elevation={2} sx={{ p: 1 }}>
                  <PreviewImage src={screenshotPreview} alt={t('common.bugReport.screenshotPreview')} />
                  <Box sx={{ position: 'absolute', top: 8, right: 8, display: 'flex', gap: 1 }}>
                    <IconButton
                      size="small"
                      color="primary"
                      onClick={handleStartEditing}
                      sx={{ bgcolor: 'rgba(255, 255, 255, 0.7)', '&:hover': { bgcolor: 'rgba(255, 255, 255, 0.9)' } }}
                    >
                      <CropIcon fontSize="small" />
                    </IconButton>
                    <IconButton
                      size="small"
                      color="error"
                      onClick={handleRemoveScreenshot}
                      sx={{ bgcolor: 'rgba(255, 255, 255, 0.7)', '&:hover': { bgcolor: 'rgba(255, 255, 255, 0.9)' } }}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Box>
                </Paper>
              </Box>
            ) : (
              <DropZone 
                onClick={handleDropZoneClick}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <UploadIcon color="action" sx={{ fontSize: 40, mb: 1, opacity: 0.7 }} />
                <Typography variant="body1" gutterBottom>
                  {t('common.bugReport.dragDropText')}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {t('common.bugReport.dragDropSubtext')}
                </Typography>
              </DropZone>
            )}
          </Box>
          
          <Box sx={{ mt: 3 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="subtitle1" gutterBottom>
                {t('common.bugReport.consoleLogs')}
              </Typography>
              <Button 
                size="small"
                variant="outlined" 
                color="primary"
                onClick={handleClearLogs}
              >
                {t('common.bugReport.clearLogs')}
              </Button>
            </Box>
            
            <FormControlLabel
              control={
                <Checkbox
                  name="includeConsoleLogs"
                  checked={formData.includeConsoleLogs}
                  onChange={handleChange}
                />
              }
              label={t('common.bugReport.includeConsoleLogs')}
            />
            
            {formData.includeConsoleLogs && (
              <ConsoleLogBox elevation={0}>
                {consoleLogs || t('common.bugReport.noLogsMessage')}
              </ConsoleLogBox>
            )}
          </Box>
        </DialogContent>
        
        <DialogActions sx={{ p: 2, borderTop: '1px solid', borderColor: 'divider' }}>
          <Button onClick={handleClose} disabled={loading}>
            {t('common.bugReport.cancel')}
          </Button>
          <Button 
            variant="contained" 
            color="primary" 
            onClick={handleSubmit}
            disabled={loading || !formData.title.trim() || !formData.description.trim()}
            startIcon={loading ? <CircularProgress size={20} /> : null}
          >
            {loading ? t('common.bugReport.submitting') : t('common.bugReport.submit')}
          </Button>
        </DialogActions>
      </Dialog>
      
      <Dialog
        open={isEditingScreenshot}
        onClose={handleCancelEditing}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          {t('common.bugReport.editing.cropTitle')}
          <IconButton
            aria-label="close"
            onClick={handleCancelEditing}
            sx={{ position: 'absolute', right: 8, top: 8 }}
          >
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          <ScreenshotEditor />
        </DialogContent>
      </Dialog>
    </>
  );
};

export default BugReportDialog; 