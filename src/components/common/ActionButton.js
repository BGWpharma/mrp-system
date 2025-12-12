import React from 'react';
import PropTypes from 'prop-types';
import { Button, IconButton, Tooltip, CircularProgress, Box } from '@mui/material';
import { styled, alpha } from '@mui/material/styles';

// Stylizowany przycisk akcji z efektem hover i transition
const StyledActionButton = styled(Button)(({ theme, colorvariant = 'primary', importance = 'medium' }) => {
  // Określenie koloru na podstawie przekazanej wartości
  const getColor = () => {
    switch (colorvariant) {
      case 'success': return theme.palette.success;
      case 'error': return theme.palette.error;
      case 'warning': return theme.palette.warning;
      case 'info': return theme.palette.info;
      case 'secondary': return theme.palette.secondary;
      default: return theme.palette.primary;
    }
  };

  const color = getColor();
  const isLight = importance === 'low';
  const isHigh = importance === 'high';

  return {
    position: 'relative',
    borderRadius: theme.shape.borderRadius,
    textTransform: 'none',
    fontWeight: isHigh ? 600 : 500,
    letterSpacing: isHigh ? '0.5px' : 'inherit',
    boxShadow: isHigh ? theme.shadows[2] : 'none',
    padding: isHigh ? '10px 24px' : '8px 16px',
    overflow: 'hidden',
    transition: theme.transitions.create([
      'background-color', 
      'box-shadow', 
      'transform', 
      'opacity'
    ], {
      duration: theme.transitions.duration.short,
    }),
    // Dla przycisku o niskiej ważności używamy jaśniejszego koloru
    backgroundColor: isLight ? alpha(color.main, 0.1) : color.main,
    color: isLight ? color.main : color.contrastText,
    border: isLight ? `1px solid ${alpha(color.main, 0.5)}` : 'none',
    // Clean Design - bez transform
    '&:hover': {
      backgroundColor: isLight ? alpha(color.main, 0.15) : color.dark,
      boxShadow: isHigh ? theme.shadows[2] : 'none',
      border: isLight ? `1px solid ${color.main}` : 'none',
    },
    '&:active': {
      boxShadow: 'none',
    },
    '&.Mui-disabled': {
      backgroundColor: isLight 
        ? theme.palette.mode === 'dark' 
          ? alpha(theme.palette.action.disabled, 0.1) 
          : alpha(theme.palette.action.disabled, 0.05)
        : theme.palette.action.disabledBackground,
      color: theme.palette.action.disabled,
      border: isLight ? `1px solid ${theme.palette.action.disabled}` : 'none',
    },
  };
});

// Stylizowany przycisk ikonowy
const StyledIconButton = styled(IconButton)(({ theme, colorvariant = 'primary', sizevalue = 'medium' }) => {
  // Określenie koloru na podstawie przekazanej wartości
  const getColor = () => {
    switch (colorvariant) {
      case 'success': return theme.palette.success;
      case 'error': return theme.palette.error;
      case 'warning': return theme.palette.warning;
      case 'info': return theme.palette.info;
      case 'secondary': return theme.palette.secondary;
      default: return theme.palette.primary;
    }
  };

  const color = getColor();
  const padding = sizevalue === 'small' ? 6 : sizevalue === 'large' ? 12 : 8;

  return {
    color: theme.palette.mode === 'dark' ? color.light : color.main,
    borderRadius: theme.shape.borderRadius,
    padding: padding,
    transition: theme.transitions.create([
      'background-color', 
      'transform'
    ], {
      duration: 150,
    }),
    // Clean Design - bez transform
    '&:hover': {
      backgroundColor: alpha(color.main, 0.08),
    },
  };
});

/**
 * Uniwersalny komponent przycisku akcji używany w całej aplikacji.
 * Zapewnia spójny wygląd i zachowanie.
 */
const ActionButton = ({
  children,
  variant = 'contained', // contained, outlined, text
  color = 'primary',     // primary, secondary, success, error, warning, info
  importance = 'medium', // low, medium, high
  size = 'medium',       // small, medium, large
  loading = false,       // stan ładowania
  disabled = false,      // wyłączenie przycisku
  startIcon = null,      // ikona na początku
  endIcon = null,        // ikona na końcu
  tooltip = '',          // podpowiedź
  onClick,               // funkcja kliknięcia
  fullWidth = false,     // czy przycisk ma zajmować pełną szerokość
  iconButton = false,    // czy to jest przycisk ikonowy
  icon = null,           // ikona dla przycisku ikonowego
  className = '',        // dodatkowa klasa CSS
  ...props               // inne właściwości
}) => {
  const buttonContent = (
    <>
      {loading && (
        <CircularProgress
          size={24}
          color="inherit"
          sx={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            marginTop: '-12px',
            marginLeft: '-12px',
          }}
        />
      )}
      <Box sx={{ visibility: loading ? 'hidden' : 'visible' }}>
        {iconButton ? icon : children}
      </Box>
    </>
  );

  // Dla przycisku ikonowego używamy innego komponentu
  if (iconButton) {
    const button = (
      <StyledIconButton
        disabled={disabled || loading}
        onClick={onClick}
        colorvariant={color}
        sizevalue={size}
        aria-label={tooltip || 'action'}
        className={className}
        {...props}
      >
        {buttonContent}
      </StyledIconButton>
    );

    return tooltip ? (
      <Tooltip title={tooltip}>
        {button}
      </Tooltip>
    ) : button;
  }

  // Dla standardowego przycisku
  const button = (
    <StyledActionButton
      variant={variant}
      disabled={disabled || loading}
      startIcon={startIcon}
      endIcon={endIcon}
      onClick={onClick}
      colorvariant={color}
      importance={importance}
      size={size}
      fullWidth={fullWidth}
      className={className}
      {...props}
    >
      {buttonContent}
    </StyledActionButton>
  );

  return tooltip ? (
    <Tooltip title={tooltip}>
      {button}
    </Tooltip>
  ) : button;
};

ActionButton.propTypes = {
  children: PropTypes.node,
  variant: PropTypes.oneOf(['contained', 'outlined', 'text']),
  color: PropTypes.oneOf(['primary', 'secondary', 'success', 'error', 'warning', 'info']),
  importance: PropTypes.oneOf(['low', 'medium', 'high']),
  size: PropTypes.oneOf(['small', 'medium', 'large']),
  loading: PropTypes.bool,
  disabled: PropTypes.bool,
  startIcon: PropTypes.node,
  endIcon: PropTypes.node,
  tooltip: PropTypes.string,
  onClick: PropTypes.func,
  fullWidth: PropTypes.bool,
  iconButton: PropTypes.bool,
  icon: PropTypes.node,
  className: PropTypes.string,
};

export default ActionButton; 