import React from 'react';
import PropTypes from 'prop-types';
import { Chip, Typography, Box, Tooltip } from '@mui/material';
import { styled, alpha } from '@mui/material/styles';
import { getStatusColor } from '../../styles/colorConfig';

// Stylizowany chip statusu
const StyledStatusChip = styled(Chip)(({ theme, statuscolor = 'default', variant = 'filled', size = 'small' }) => {
  const color = statuscolor === 'default' 
    ? { main: theme.palette.grey[500], light: theme.palette.grey[300] } 
    : statuscolor;
    
  return {
    borderRadius: variant === 'rounded' ? 16 : 4,
    fontWeight: 500,
    height: size === 'small' ? 24 : 32,
    fontSize: size === 'small' ? '0.75rem' : '0.875rem',
    backgroundColor: variant === 'filled' 
      ? alpha(color.main, theme.palette.mode === 'dark' ? 0.2 : 0.1)
      : 'transparent',
    color: theme.palette.mode === 'dark' ? color.light : color.main,
    border: variant === 'outlined' 
      ? `1px solid ${alpha(color.main, theme.palette.mode === 'dark' ? 0.5 : 0.3)}`
      : variant === 'filled' ? 'none' : `1px solid ${alpha(color.main, 0.1)}`,
    '& .MuiChip-label': {
      padding: size === 'small' ? '0 8px' : '0 12px',
    },
    '&::before': variant === 'dot' ? {
      content: '""',
      display: 'block',
      width: size === 'small' ? 8 : 10,
      height: size === 'small' ? 8 : 10,
      borderRadius: '50%',
      backgroundColor: color.main,
      marginRight: theme.spacing(0.5),
      marginLeft: theme.spacing(0.5),
    } : {},
  };
});

// Komponent do wyświetlania tekstu statusu (bez chipa)
const StatusText = styled(Typography)(({ theme, statuscolor = 'default', weight = 'medium' }) => {
  const color = statuscolor === 'default' 
    ? { main: theme.palette.grey[500], light: theme.palette.grey[300] } 
    : statuscolor;
  
  return {
    color: theme.palette.mode === 'dark' ? color.light : color.main,
    fontWeight: weight === 'bold' ? 600 : 500,
    fontSize: '0.875rem',
    display: 'flex',
    alignItems: 'center',
    '&::before': {
      content: '""',
      display: 'inline-block',
      width: 8,
      height: 8,
      borderRadius: '50%',
      backgroundColor: color.main,
      marginRight: theme.spacing(1),
    },
  };
});

/**
 * Komponent etykiety statusu
 * @param {object} props Właściwości komponentu
 * @param {string} props.status Tekst statusu
 * @param {string} props.variant Wariant wyglądu (filled, outlined, dot, text)
 * @param {string} props.color Kolor (primary, secondary, success, error, warning, info, default)
 * @param {string} props.size Rozmiar (small, medium)
 * @param {node} props.icon Ikona
 * @param {string} props.tooltip Podpowiedź
 * @param {function} props.onClick Funkcja wywoływana po kliknięciu
 * @param {string} props.className Dodatkowa klasa CSS
 */
const StatusLabel = ({
  status,
  variant = 'filled',
  color = 'default',
  size = 'small',
  icon = null,
  tooltip = '',
  onClick = null,
  className = '',
  ...props
}) => {
  // Pobierz kolor na podstawie statusu, jeśli nie został jawnie określony
  const statusColorObj = color === 'default' && status
    ? getStatusColor(status)
    : color !== 'default'
      ? {
          main: props.theme?.palette[color]?.main || '#757575',
          light: props.theme?.palette[color]?.light || '#bdbdbd',
        }
      : {
          main: '#757575',
          light: '#bdbdbd',
        };

  // Dla wariantu text używamy komponentu Typography
  if (variant === 'text') {
    const textComponent = (
      <StatusText 
        statuscolor={statusColorObj}
        weight={size === 'medium' ? 'bold' : 'medium'}
        className={className}
      >
        {status}
      </StatusText>
    );

    return tooltip ? (
      <Tooltip title={tooltip}>
        {textComponent}
      </Tooltip>
    ) : textComponent;
  }

  // Dla pozostałych wariantów używamy komponentu Chip
  const chipComponent = (
    <StyledStatusChip
      label={status}
      statuscolor={statusColorObj}
      variant={variant}
      size={size}
      icon={icon}
      onClick={onClick}
      className={className}
      clickable={!!onClick}
      {...props}
    />
  );

  return tooltip ? (
    <Tooltip title={tooltip}>
      {chipComponent}
    </Tooltip>
  ) : chipComponent;
};

StatusLabel.propTypes = {
  status: PropTypes.string.isRequired,
  variant: PropTypes.oneOf(['filled', 'outlined', 'dot', 'text']),
  color: PropTypes.oneOf(['default', 'primary', 'secondary', 'success', 'error', 'warning', 'info']),
  size: PropTypes.oneOf(['small', 'medium']),
  icon: PropTypes.node,
  tooltip: PropTypes.string,
  onClick: PropTypes.func,
  className: PropTypes.string,
  theme: PropTypes.object,
};

export default StatusLabel; 