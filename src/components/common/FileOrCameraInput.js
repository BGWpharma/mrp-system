import React, { useState, useRef } from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Typography,
  Grid,
  IconButton
} from '@mui/material';
import {
  PhotoCamera as CameraIcon,
  AttachFile as FileIcon,
  Close as CloseIcon,
  CameraAlt as CameraAltIcon,
  Flip as FlipIcon
} from '@mui/icons-material';
import { useTranslation } from '../../hooks/useTranslation';

const FileOrCameraInput = ({ 
  onChange, 
  accept = "image/*", 
  label = "Wybierz plik lub zrób zdjęcie",
  showCamera = true,
  maxWidth = "md",
  maxHeight = "80vh",
  ...inputProps 
}) => {
  const { t } = useTranslation();
  const [cameraOpen, setCameraOpen] = useState(false);
  const [stream, setStream] = useState(null);
  const [facingMode, setFacingMode] = useState('environment'); // 'user' dla przedniej, 'environment' dla tylnej
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);

  // Funkcja do otwierania aparatu
  const openCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { 
          facingMode: facingMode,
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        }
      });
      
      setStream(mediaStream);
      setCameraOpen(true);
      
      // Ustaw stream w elemencie video po renderowaniu
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
        }
      }, 100);
    } catch (error) {
      console.error('Błąd podczas dostępu do aparatu:', error);
      alert('Nie można uzyskać dostępu do aparatu. Sprawdź uprawnienia w przeglądarce.');
    }
  };

  // Funkcja do zamykania aparatu
  const closeCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    setCameraOpen(false);
  };

  // Funkcja do przełączania między przednim a tylnym aparatem
  const switchCamera = async () => {
    const newFacingMode = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(newFacingMode);
    
    // Zamknij obecny stream
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }
    
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { 
          facingMode: newFacingMode,
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        }
      });
      
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (error) {
      console.error('Błąd podczas przełączania aparatu:', error);
      alert('Nie można przełączyć aparatu.');
    }
  };

  // Funkcja do robienia zdjęcia
  const takePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');
      
      // Ustaw rozmiar canvas zgodnie z video
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      
      // Narysuj obraz z video na canvas
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      // Konwertuj canvas do blob
      canvas.toBlob((blob) => {
        if (blob) {
          // Stwórz obiekt File z blob
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
          const file = new File([blob], `zdjecie-${timestamp}.jpg`, {
            type: 'image/jpeg',
            lastModified: Date.now()
          });
          
          // Wywołaj funkcję onChange z plikiem
          const syntheticEvent = {
            target: {
              files: [file]
            }
          };
          onChange(syntheticEvent);
          
          closeCamera();
        }
      }, 'image/jpeg');
    }
  };

  // Funkcja do otwierania file picker
  const openFilePicker = () => {
    fileInputRef.current?.click();
  };

  return (
    <Box>
      {/* Ukryty input file */}
      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        onChange={onChange}
        style={{ display: 'none' }}
        {...inputProps}
      />
      
      {/* Przyciski wyboru */}
      {showCamera ? (
        <Grid container spacing={1}>
          <Grid item xs={6}>
            <Button
              variant="outlined"
              fullWidth
              startIcon={<FileIcon />}
              onClick={openFilePicker}
              size="small"
            >
              {t('common.selectFile')}
            </Button>
          </Grid>
          <Grid item xs={6}>
            <Button
              variant="outlined"
              fullWidth
              startIcon={<CameraIcon />}
              onClick={openCamera}
              size="small"
              color="secondary"
            >
              {t('common.takePhoto')}
            </Button>
          </Grid>
        </Grid>
      ) : (
        <Button
          variant="outlined"
          fullWidth
          startIcon={<FileIcon />}
          onClick={openFilePicker}
          size="small"
        >
          {t('common.selectFile')}
        </Button>
      )}

      {/* Dialog aparatu */}
      <Dialog
        open={cameraOpen}
        onClose={closeCamera}
        maxWidth={maxWidth}
        fullWidth
        PaperProps={{
          sx: { height: maxHeight }
        }}
      >
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h6">{t('common.takePhoto')}</Typography>
          <Box>
            <IconButton onClick={switchCamera} color="primary">
              <FlipIcon />
            </IconButton>
            <IconButton onClick={closeCamera}>
              <CloseIcon />
            </IconButton>
          </Box>
        </DialogTitle>
        
        <DialogContent sx={{ p: 0, position: 'relative' }}>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover'
            }}
          />
          <canvas
            ref={canvasRef}
            style={{ display: 'none' }}
          />
        </DialogContent>
        
        <DialogActions sx={{ justifyContent: 'center', p: 2 }}>
          <Button
            variant="contained"
            size="large"
            startIcon={<CameraAltIcon />}
            onClick={takePhoto}
            sx={{
              borderRadius: '50px',
              px: 4,
              py: 1.5,
              fontSize: '1.1rem'
            }}
          >
            {t('common.takePhoto')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default FileOrCameraInput; 