import React, { useState, useEffect, useRef } from 'react';
import { Box, Typography, CircularProgress } from '@mui/material';
import { PictureAsPdf as PdfIcon } from '@mui/icons-material';
import { useTranslation } from '../../hooks/useTranslation';

const PdfMiniaturePreview = ({ pdfUrl, fileName, onClick }) => {
  const { t } = useTranslation('common');
  const [previewImage, setPreviewImage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const canvasRef = useRef(null);

  // Obsługa klawiatury
  const handleKeyDown = (event) => {
    if (onClick && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      onClick();
    }
  };

  useEffect(() => {
    if (!pdfUrl) return;

    let mounted = true;

    const loadPdfPreview = async () => {
      try {
        setLoading(true);
        setError(false);

                 // Sprawdź czy PDF.js jest dostępny
        if (typeof window.pdfjsLib === 'undefined') {
          console.warn('PDF.js not available, falling back to iframe preview');
          setError(true);
          return;
        }

        // Załaduj dokument PDF z ustawieniami CORS
        const loadingTask = window.pdfjsLib.getDocument({
          url: pdfUrl,
          withCredentials: false,
          disableAutoFetch: true,
          disableStream: true
        });
        
        const pdf = await loadingTask.promise;
        
        if (!mounted) return;

        // Pobierz pierwszą stronę
        const page = await pdf.getPage(1);
        
        if (!mounted) return;

        // Przygotuj canvas do renderowania
        const canvas = canvasRef.current;
        if (!canvas) return;

        const context = canvas.getContext('2d');
        
        // Oblicz skalę dla miniaturki
        const containerWidth = 280; // Maksymalna szerokość
        const containerHeight = 220; // Maksymalna wysokość
        
        const viewport = page.getViewport({ scale: 1 });
        const scale = Math.min(
          containerWidth / viewport.width,
          containerHeight / viewport.height
        );
        
        const scaledViewport = page.getViewport({ scale });
        
        canvas.width = scaledViewport.width;
        canvas.height = scaledViewport.height;
        
        // Ustaw styl canvas
        canvas.style.width = scaledViewport.width + 'px';
        canvas.style.height = scaledViewport.height + 'px';

        // Renderuj stronę
        await page.render({
          canvasContext: context,
          viewport: scaledViewport
        }).promise;

        if (!mounted) return;

        // Konwertuj canvas na data URL
        const imageDataUrl = canvas.toDataURL('image/png', 0.8);
        setPreviewImage(imageDataUrl);
        setLoading(false);

      } catch (err) {
        console.error('Błąd podczas ładowania podglądu PDF:', err);
        if (mounted) {
          setError(true);
          setLoading(false);
        }
      }
    };

         // Opóźnienie dla lepszej wydajności i sprawdzenie czy PDF.js jest gotowy
    const timeoutId = setTimeout(() => {
      // Sprawdź ponownie czy PDF.js się załadował
      if (typeof window.pdfjsLib === 'undefined') {
        // Spróbuj poczekać jeszcze trochę na załadowanie PDF.js
        setTimeout(() => {
          if (typeof window.pdfjsLib === 'undefined') {
            console.warn('PDF.js still not available after waiting, using iframe fallback');
            setError(true);
            setLoading(false);
          } else {
            loadPdfPreview();
          }
        }, 1000);
      } else {
        loadPdfPreview();
      }
    }, 100);

    return () => {
      mounted = false;
      clearTimeout(timeoutId);
    };
  }, [pdfUrl]);

  // Fallback iframe jeśli PDF.js nie działa
  if (error) {
    return (
      <Box 
        sx={{ 
          height: 250, 
          display: 'flex', 
          flexDirection: 'column',
          overflow: 'hidden',
          position: 'relative',
          bgcolor: 'background.paper',
          cursor: onClick ? 'pointer' : 'default',
          transition: 'all 0.3s ease',
          '&:hover': onClick ? {
            transform: 'scale(1.02)',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
          } : {}
        }}
        onClick={onClick}
        onKeyDown={handleKeyDown}
        role={onClick ? "button" : undefined}
        aria-label={onClick ? t('recipes.details.clickToOpenPdf') : undefined}
        tabIndex={onClick ? 0 : undefined}
      >
        <Box sx={{ 
          flex: 1, 
          position: 'relative',
          overflow: 'hidden'
        }}>
          <iframe
            src={`${pdfUrl}#toolbar=0&navpanes=0&scrollbar=0&view=FitH&pagemode=none&zoom=page-width`}
            style={{ 
              width: '100%', 
              height: '350px',
              border: 'none',
              borderRadius: '4px',
              pointerEvents: 'none'
            }}
            title={`Podgląd ${fileName}`}
            loading="lazy"
            sandbox="allow-same-origin"
          />
          <Box sx={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            background: 'linear-gradient(transparent, rgba(0,0,0,0.7))',
            color: 'white',
            p: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Typography variant="caption" sx={{ 
              fontWeight: 'medium',
              textShadow: '1px 1px 2px rgba(0,0,0,0.8)'
            }}>
                              {onClick ? t('recipes.details.clickToOpenPdf') : t('recipes.details.clickForFullPreview')}
            </Typography>
          </Box>
        </Box>
      </Box>
    );
  }

  return (
    <Box 
      sx={{ 
        height: 250, 
        display: 'flex', 
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        bgcolor: 'background.paper',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'all 0.3s ease',
        '&:hover': onClick ? {
          transform: 'scale(1.02)',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
        } : {}
      }}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      role={onClick ? "button" : undefined}
      aria-label={onClick ? t('recipes.details.clickToOpenPdf') : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      {loading ? (
        <Box sx={{ 
          display: 'flex', 
          flexDirection: 'column', 
          alignItems: 'center', 
          gap: 2 
        }}>
          <CircularProgress size={40} />
          <Typography variant="caption" color="text.secondary">
            {t('recipes.designAttachments.loadingPreview')}
          </Typography>
        </Box>
      ) : previewImage ? (
        <Box sx={{ 
          position: 'relative',
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <img 
            src={previewImage}
            alt={`Podgląd ${fileName}`}
            style={{ 
              maxWidth: '100%',
              maxHeight: '100%',
              objectFit: 'contain',
              borderRadius: '4px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
            }}
          />
          <Box sx={{
            position: 'absolute',
            bottom: 8,
            left: 8,
            right: 8,
            background: 'linear-gradient(transparent, rgba(0,0,0,0.7))',
            color: 'white',
            p: 1,
            borderRadius: 1,
                         display: 'flex',
             alignItems: 'center',
             justifyContent: 'center'
           }}>
             <Typography variant="caption" sx={{ 
               fontWeight: 'medium',
               textShadow: '1px 1px 2px rgba(0,0,0,0.8)'
             }}>
               {onClick ? t('recipes.details.clickToOpenPdf') : t('recipes.details.clickForFullPreview')}
             </Typography>
           </Box>
         </Box>
       ) : (
        <Box sx={{ 
          display: 'flex', 
          flexDirection: 'column', 
          alignItems: 'center', 
          gap: 2 
        }}>
          <PdfIcon sx={{ fontSize: 48, color: 'error.main' }} />
          <Typography variant="caption" color="text.secondary">
            {t('recipes.designAttachments.cannotLoadPreview')}
          </Typography>
        </Box>
      )}
      
      {/* Ukryty canvas do renderowania */}
      <canvas
        ref={canvasRef}
        style={{ display: 'none' }}
      />
    </Box>
  );
};

export default PdfMiniaturePreview; 