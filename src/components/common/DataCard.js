import React from 'react';
import PropTypes from 'prop-types';
import { 
  Card, 
  CardContent, 
  Typography, 
  Box, 
  CardActions, 
  Button, 
  Divider, 
  CircularProgress,
  Skeleton,
  Tooltip,
  IconButton 
} from '@mui/material';
import { styled, alpha } from '@mui/material/styles';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';

// Stylizowana karta danych
const StyledDataCard = styled(Card)(({ theme, hoverable = false, bordered = false, coloraccent = 'primary' }) => {
  const getColor = () => {
    switch (coloraccent) {
      case 'success': return theme.palette.success;
      case 'error': return theme.palette.error;
      case 'warning': return theme.palette.warning;
      case 'info': return theme.palette.info;
      case 'secondary': return theme.palette.secondary;
      default: return theme.palette.primary;
    }
  };

  const color = getColor();

  return {
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    borderRadius: theme.shape.borderRadius,
    transition: 'transform 0.3s, box-shadow 0.3s',
    position: 'relative',
    overflow: 'hidden',
    border: bordered ? `1px solid ${theme.palette.divider}` : 'none',
    ...(bordered && {
      borderLeft: `3px solid ${color.main}`,
    }),
    '&::before': bordered ? {} : {
      content: '""',
      position: 'absolute',
      top: 0,
      left: 0,
      width: '100%',
      height: '4px',
      background: theme.palette.mode === 'dark' 
        ? color.dark 
        : color.main,
    },
    ...(hoverable && {
      '&:hover': {
        transform: 'translateY(-4px)',
        boxShadow: theme.palette.mode === 'dark' 
          ? '0 8px 24px rgba(0, 0, 0, 0.3)'
          : '0 8px 24px rgba(0, 0, 0, 0.1)',
      },
    }),
  };
});

// Stylizowana ikona w karcie
const IconContainer = styled(Box)(({ theme, coloraccent = 'primary' }) => {
  const getColor = () => {
    switch (coloraccent) {
      case 'success': return theme.palette.success;
      case 'error': return theme.palette.error;
      case 'warning': return theme.palette.warning;
      case 'info': return theme.palette.info;
      case 'secondary': return theme.palette.secondary;
      default: return theme.palette.primary;
    }
  };

  const color = getColor();

  return {
    backgroundColor: theme.palette.mode === 'dark' 
      ? alpha(color.main, 0.2)
      : alpha(color.main, 0.1),
    borderRadius: theme.shape.borderRadius,
    color: theme.palette.mode === 'dark' ? color.light : color.main,
    padding: theme.spacing(1.5),
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  };
});

// Komponent wartości w karcie
const Value = styled(Typography)(({ theme, issubvalue = 'false', coloraccent = 'default' }) => {
  const getColor = () => {
    if (coloraccent === 'default') {
      return theme.palette.text.primary;
    }
    switch (coloraccent) {
      case 'success': return theme.palette.success.main;
      case 'error': return theme.palette.error.main;
      case 'warning': return theme.palette.warning.main;
      case 'info': return theme.palette.info.main;
      case 'secondary': return theme.palette.secondary.main;
      case 'primary': return theme.palette.primary.main;
      default: return theme.palette.text.primary;
    }
  };

  return {
    fontSize: issubvalue === 'true' ? '1.25rem' : '2rem',
    fontWeight: issubvalue === 'true' ? 500 : 700,
    lineHeight: 1.2,
    marginBottom: theme.spacing(0.5),
    color: getColor(),
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  };
});

// Etykieta danych
const DataLabel = styled(Typography)(({ theme }) => ({
  fontSize: '0.875rem',
  color: theme.palette.text.secondary,
  marginBottom: theme.spacing(1),
  fontWeight: 500,
}));

/**
 * Komponent karty danych do prezentowania statystyk i innych informacji
 * @param {object} props Właściwości komponentu
 * @param {string} props.title Tytuł karty
 * @param {any} props.value Główna wartość do wyświetlenia
 * @param {any} props.subValue Dodatkowa wartość (opcjonalna)
 * @param {string} props.subValueLabel Etykieta dodatkowej wartości
 * @param {node} props.icon Ikona
 * @param {string} props.color Kolor akcentu (primary, secondary, success, error, warning, info)
 * @param {string} props.valueColor Kolor wartości (default, primary, secondary, success, error, warning, info)
 * @param {boolean} props.loading Czy dane są ładowane
 * @param {string} props.action Tekst linku akcji
 * @param {function} props.onActionClick Funkcja wywołana po kliknięciu akcji
 * @param {string} props.actionIcon Ikona dla akcji (domyślnie strzałka)
 * @param {boolean} props.hoverable Czy karta ma efekt hover
 * @param {boolean} props.bordered Czy karta ma być obramowana zamiast mieć górny pasek
 * @param {string} props.tooltip Podpowiedź
 * @param {string} props.className Dodatkowa klasa CSS
 */
const DataCard = ({
  title,
  value,
  subValue = null,
  subValueLabel = '',
  icon = null,
  color = 'primary',
  valueColor = 'default',
  loading = false,
  action = '',
  onActionClick = null,
  actionIcon = <ArrowForwardIcon />,
  hoverable = true,
  bordered = false,
  tooltip = '',
  className = '',
  ...props
}) => {
  const card = (
    <StyledDataCard hoverable={hoverable} bordered={bordered} coloraccent={color} className={className} {...props}>
      <CardContent sx={{ flexGrow: 1, pb: action ? 0 : 2 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
          <DataLabel variant="body2">{title}</DataLabel>
          {tooltip && (
            <Tooltip title={tooltip}>
              <IconButton size="small" sx={{ mr: -1, mt: -1 }}>
                <InfoOutlinedIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
        </Box>
  
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Box>
            {loading ? (
              <Skeleton variant="text" width={120} height={60} />
            ) : (
              <Value variant="h4" coloraccent={valueColor}>
                {value}
              </Value>
            )}
            
            {subValue !== null && (
              <>
                {loading ? (
                  <Skeleton variant="text" width={80} height={30} />
                ) : (
                  <>
                    {subValueLabel && (
                      <Typography variant="caption" color="text.secondary">
                        {subValueLabel}
                      </Typography>
                    )}
                    <Value variant="h6" issubvalue="true" coloraccent={valueColor}>
                      {subValue}
                    </Value>
                  </>
                )}
              </>
            )}
          </Box>
          
          {icon && (
            <IconContainer coloraccent={color}>
              {icon}
            </IconContainer>
          )}
        </Box>
      </CardContent>
      
      {action && (
        <>
          <Divider />
          <CardActions sx={{ justifyContent: 'flex-start', p: 1 }}>
            <Button 
              size="small" 
              endIcon={actionIcon}
              onClick={onActionClick}
              sx={{ textTransform: 'none', fontWeight: 500 }}
            >
              {action}
            </Button>
          </CardActions>
        </>
      )}
    </StyledDataCard>
  );

  return card;
};

DataCard.propTypes = {
  title: PropTypes.string.isRequired,
  value: PropTypes.node.isRequired,
  subValue: PropTypes.node,
  subValueLabel: PropTypes.string,
  icon: PropTypes.node,
  color: PropTypes.oneOf(['primary', 'secondary', 'success', 'error', 'warning', 'info']),
  valueColor: PropTypes.oneOf(['default', 'primary', 'secondary', 'success', 'error', 'warning', 'info']),
  loading: PropTypes.bool,
  action: PropTypes.string,
  onActionClick: PropTypes.func,
  actionIcon: PropTypes.node,
  hoverable: PropTypes.bool,
  bordered: PropTypes.bool,
  tooltip: PropTypes.string,
  className: PropTypes.string,
};

export default DataCard; 