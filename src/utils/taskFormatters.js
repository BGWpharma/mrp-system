import React from 'react';
import {
  Description as DescriptionIcon,
  Image as ImageIcon,
  PictureAsPdf as PdfIcon,
  Print as PrintIcon,
} from '@mui/icons-material';
import { Box, Button } from '@mui/material';
import { iconPrimary, iconError, mobileButton } from '../styles/muiCommonStyles';

export const getAdaptiveBackgroundStyle = (theme, paletteColor, opacity = 0.8) => ({
  backgroundColor: theme.palette.mode === 'dark' 
    ? `rgba(${
        paletteColor === 'info' ? '33, 150, 243' :
        paletteColor === 'success' ? '76, 175, 80' :
        paletteColor === 'warning' ? '255, 152, 0' :
        paletteColor === 'secondary' ? '156, 39, 176' :
        '33, 150, 243'
      }, 0.15)` 
    : `${paletteColor}.light`,
  opacity: theme.palette.mode === 'dark' ? 1 : opacity
});

export const formatQuantityPrecision = (value, precision = 3) => {
  if (typeof value !== 'number' || isNaN(value)) return 0;
  return Math.round(value * Math.pow(10, precision)) / Math.pow(10, precision);
};

export const formatDateToLocal = (dateString) => {
  if (!dateString) return 'Nie określono';
  const date = new Date(dateString);
  return date.toLocaleDateString('pl-PL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
};

export const formatDateTime = (date) => {
  if (!date) return '—';
  
  if (typeof date === 'string' && !date.trim()) {
    return '—';
  }
  
  if (date === null || date === undefined) {
    return '—';
  }
  
  if (date && typeof date === 'object' && typeof date.toDate === 'function') {
    date = date.toDate();
  }
  
  try {
    if (typeof date === 'string') {
      date = new Date(date);
    }
    
    const dateObj = new Date(date);
    
    if (isNaN(dateObj.getTime())) {
      return '—';
    }
    
    return new Intl.DateTimeFormat('pl-PL', {
      dateStyle: 'medium',
      timeStyle: 'short'
    }).format(dateObj);
  } catch (error) {
    return '—';
  }
};

export const toLocalDateTimeString = (date) => {
  if (!date) return '';
  
  try {
    let dateObj;
    
    if (date instanceof Date) {
      dateObj = date;
    } else if (typeof date === 'string') {
      dateObj = new Date(date);
    } else if (date.toDate && typeof date.toDate === 'function') {
      dateObj = date.toDate();
    } else if (date.seconds) {
      dateObj = new Date(date.seconds * 1000);
    } else {
      dateObj = new Date(date);
    }
    
    if (isNaN(dateObj.getTime())) return '';
    
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const day = String(dateObj.getDate()).padStart(2, '0');
    const hours = String(dateObj.getHours()).padStart(2, '0');
    const minutes = String(dateObj.getMinutes()).padStart(2, '0');
    
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  } catch (error) {
    console.error('Błąd konwersji daty do datetime-local:', error, date);
    return '';
  }
};

export const fromLocalDateTimeString = (dateTimeString) => {
  if (!dateTimeString) return new Date();
  
  try {
    if (dateTimeString.includes('T')) {
      return new Date(dateTimeString);
    }
    
    if (dateTimeString.includes(' ')) {
      const [datePart, timePart] = dateTimeString.split(' ');
      const [day, month, year] = datePart.split('.');
      const [hours, minutes] = timePart.split(':');
      
      return new Date(year, month - 1, day, hours, minutes);
    }
    
    return new Date(dateTimeString);
  } catch (error) {
    console.error('Błąd parsowania datetime-local:', error, dateTimeString);
    return new Date();
  }
};

export const getClinicalFileIcon = (contentType) => {
  if (contentType.startsWith('image/')) {
    return <ImageIcon sx={iconPrimary} />;
  } else if (contentType === 'application/pdf') {
    return <PdfIcon sx={iconError} />;
  } else {
    return <DescriptionIcon sx={{ color: 'action.active' }} />;
  }
};

export const formatClinicalFileSize = (bytes) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

export const getStatusColor = (status) => {
  switch (status) {
    case 'Zaplanowane':
      return '#1976d2';
    case 'W trakcie':
      return '#ff9800';
    case 'Potwierdzenie zużycia':
      return '#2196f3';
    case 'Zakończone':
      return '#4caf50';
    case 'Anulowane':
      return '#f44336';
    case 'Wstrzymane':
      return '#757575';
    default:
      return '#757575';
  }
};

export const getStatusActions = ({ handlePrintMODetails, handlePrintMaterialsAndLots, isMobile, t }) => {
  const actions = [];

  actions.push(
    <Button
      key="print-mo"
      variant="outlined"
      startIcon={<PrintIcon />}
      onClick={handlePrintMODetails}
      sx={mobileButton(isMobile)}
    >
      {t('buttons.printMO')}
    </Button>
  );

  actions.push(
    <Button
      key="print-materials"
      variant="outlined"
      startIcon={<PrintIcon />}
      onClick={handlePrintMaterialsAndLots}
      sx={mobileButton(isMobile)}
    >
      {t('buttons.materialReport')}
    </Button>
  );

  return (
    <Box sx={{ 
      display: 'flex', 
      flexDirection: isMobile ? 'column' : 'row',
      alignItems: isMobile ? 'stretch' : 'center',
      gap: 1
    }}>
      {actions}
    </Box>
  );
};
