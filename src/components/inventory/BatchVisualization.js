import React from 'react';
import { Box, Typography, Tooltip } from '@mui/material';

const BatchVisualization = ({ 
  batch, 
  reservations = [], 
  unit = 'szt.',
  height = 60,
  showLabels = true,
  selectedSource = '',
  onSourceSelect = null 
}) => {
  const totalQuantity = batch?.quantity || 0;
  
  // Oblicz całkowitą ilość zarezerwowaną
  const totalReserved = reservations.reduce((sum, reservation) => {
    return sum + (parseFloat(reservation.quantity) || 0);
  }, 0);
  
  const freeQuantity = Math.max(0, totalQuantity - totalReserved);
  
  // Kolory dla różnych MO - generujemy paletę kolorów
  const moColors = [
    '#ff9800', // pomarańczowy
    '#e91e63', // różowy  
    '#9c27b0', // fioletowy
    '#3f51b5', // indygo
    '#2196f3', // niebieski
    '#00bcd4', // cyan
    '#009688', // teal
    '#8bc34a', // jasny zielony
    '#ffeb3b', // żółty
    '#ff5722', // głęboki pomarańczowy
    '#795548', // brązowy
    '#607d8b'  // niebieski szary
  ];

  const colors = {
    free: '#4caf50',     // zielony dla części wolnej
    border: '#e0e0e0'    // szary dla obramowania
  };

  // Oblicz procenty dla każdego MO i części wolnej
  const sections = [];
  
  // Dodaj każde MO jako osobną sekcję
  reservations.forEach((reservation, index) => {
    const quantity = parseFloat(reservation.quantity) || 0;
    const percentage = totalQuantity > 0 ? (quantity / totalQuantity) * 100 : 0;
    const color = moColors[index % moColors.length];
    
    if (percentage > 0) {
      sections.push({
        type: 'reservation',
        reservation,
        quantity,
        percentage,
        color,
        index
      });
    }
  });

  // Dodaj część wolną na końcu
  const freePercentage = totalQuantity > 0 ? (freeQuantity / totalQuantity) * 100 : 100;
  if (freePercentage > 0) {
    sections.push({
      type: 'free',
      quantity: freeQuantity,
      percentage: freePercentage,
      color: colors.free
    });
  }

  return (
    <Box sx={{ width: '100%', mb: 2 }}>
      {showLabels && (
        <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 'bold' }}>
          Wizualizacja partii {onSourceSelect && '(kliknij sekcję aby wybrać źródło transferu)'}
        </Typography>
      )}
      
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {/* Główny prostokąt z podziałem na każde MO osobno */}
        <Box
          sx={{
            display: 'flex',
            height: height,
            border: `2px solid ${colors.border}`,
            borderRadius: 1,
            overflow: 'hidden',
            backgroundColor: '#f5f5f5'
          }}
        >
          {sections.map((section, index) => (
            <Tooltip 
              key={index}
              title={
                section.type === 'reservation' 
                  ? `MO: ${section.reservation.moNumber || 'N/A'} | Ilość: ${section.quantity.toFixed(3)} ${unit} (${section.percentage.toFixed(1)}%) | Klient: ${section.reservation.taskDetails?.customerName || 'N/A'}`
                  : `Wolne: ${section.quantity.toFixed(3)} ${unit} (${section.percentage.toFixed(1)}%)`
              }
              arrow
            >
              <Box
                sx={{
                  width: `${section.percentage}%`,
                  backgroundColor: section.color,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: onSourceSelect ? 'pointer' : 'default',
                  position: 'relative',
                  border: selectedSource === (section.type === 'reservation' ? section.reservation.id : 'free') 
                    ? '3px solid #1976d2' 
                    : '1px solid transparent',
                  boxSizing: 'border-box',
                  '&:hover': {
                    filter: onSourceSelect ? 'brightness(0.9)' : 'none'
                  },
                  borderRight: index < sections.length - 1 ? `1px solid ${colors.border}` : 'none'
                }}
                onClick={() => {
                  if (onSourceSelect) {
                    const sourceId = section.type === 'reservation' ? section.reservation.id : 'free';
                    onSourceSelect(sourceId);
                  }
                }}
              >
                {section.percentage > 15 && (
                  <Typography 
                    variant="caption" 
                    sx={{ 
                      color: 'white', 
                      fontWeight: 'bold',
                      textShadow: '1px 1px 2px rgba(0,0,0,0.7)',
                      fontSize: '0.7rem',
                      textAlign: 'center',
                      px: 0.5
                    }}
                  >
                    {section.type === 'reservation' 
                      ? (section.reservation.moNumber || `MO${section.index + 1}`)
                      : 'Wolne'
                    }
                    <br />
                    {section.quantity.toFixed(1)}
                  </Typography>
                )}
              </Box>
            </Tooltip>
          ))}
        </Box>

                 {/* Legenda z każdym MO osobno */}
         <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'center', justifyContent: 'center' }}>
          {sections.map((section, index) => (
            <Box key={index} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Box 
                sx={{ 
                  width: 16, 
                  height: 16, 
                  backgroundColor: section.color,
                  borderRadius: 0.5,
                  border: `1px solid ${colors.border}`
                }} 
              />
                             <Typography variant="body2" sx={{ fontSize: '0.85rem' }}>
                 {section.type === 'reservation' 
                   ? `${section.reservation.moNumber || `MO${section.index + 1}`} (${section.quantity.toFixed(1)} ${unit})`
                   : `Wolne (${section.quantity.toFixed(1)} ${unit})`
                 }
               </Typography>
            </Box>
          ))}
        </Box>

        {/* Szczegóły rezerwacji jako lista */}
        {reservations.length > 0 && (
          <Box sx={{ mt: 1 }}>
            <Typography variant="caption" color="text.secondary" gutterBottom>
              Szczegóły rezerwacji MO:
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, mt: 0.5 }}>
              {reservations.map((reservation, index) => {
                const sectionColor = moColors[index % moColors.length];
                return (
                  <Box
                    key={index}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1,
                      px: 1,
                      py: 0.5,
                      backgroundColor: 'background.paper',
                      borderRadius: 1,
                      border: `2px solid ${sectionColor}`,
                      fontSize: '0.75rem'
                    }}
                  >
                    <Box
                      sx={{
                        width: 12,
                        height: 12,
                        backgroundColor: sectionColor,
                        borderRadius: 0.5,
                        flexShrink: 0
                      }}
                    />
                    <Typography variant="caption" sx={{ fontWeight: 'bold' }}>
                      {reservation.moNumber || `MO ${index + 1}`}:
                    </Typography>
                    <Typography variant="caption">
                      {parseFloat(reservation.quantity || 0).toFixed(1)} {unit}
                    </Typography>
                    {reservation.taskDetails?.customerName && (
                      <Typography variant="caption" color="text.secondary">
                        | {reservation.taskDetails.customerName}
                      </Typography>
                    )}
                  </Box>
                );
              })}
            </Box>
          </Box>
        )}

        {/* Informacja o wybranym źródle */}
        {selectedSource && (
          <Box sx={{ 
            mt: 1, 
            p: 1, 
            backgroundColor: '#e3f2fd', 
            borderRadius: 1, 
            border: '1px solid #1976d2' 
          }}>
            <Typography variant="body2" sx={{ fontWeight: 'bold', color: '#1976d2' }}>
              Wybrane źródło transferu: {
                selectedSource === 'free' 
                  ? `Część wolna (${freeQuantity.toFixed(3)} ${unit})`
                  : (() => {
                      const reservation = reservations.find(res => res.id === selectedSource);
                      return reservation 
                        ? `${reservation.moNumber || 'MO'} (${parseFloat(reservation.quantity || 0).toFixed(3)} ${unit})`
                        : 'Nieznane źródło';
                    })()
              }
            </Typography>
          </Box>
        )}

        {/* Informacje o całkowitej ilości */}
        <Typography variant="caption" color="text.secondary" align="center">
          Całkowita ilość partii: {totalQuantity.toFixed(3)} {unit}
          {totalReserved > 0 && (
            <> | Razem zarezerwowane: {totalReserved.toFixed(3)} {unit}</>
          )}
        </Typography>
      </Box>
    </Box>
  );
};

export default BatchVisualization; 