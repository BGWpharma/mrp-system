// src/components/common/BackButton.js
// Uniwersalny komponent przycisku powrotu - spójna nawigacja w całej aplikacji
import React from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Button, IconButton, Tooltip } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useTranslation } from 'react-i18next';

/**
 * Uniwersalny przycisk nawigacji wstecz.
 * 
 * @param {string} [to] - Jawna ścieżka docelowa. Jeśli nie podana, użyje navigate(-1).
 * @param {string} [label] - Tekst przycisku. Domyślnie t('common.back').
 * @param {boolean} [iconOnly=false] - Jeśli true, wyświetla tylko ikonę (IconButton).
 * @param {string} [variant='outlined'] - Wariant MUI Button.
 * @param {object} [sx={}] - Dodatkowe style.
 * @param {string} [tooltip] - Tekst tooltip (używany tylko gdy iconOnly=true).
 */
const BackButton = ({ 
  to,
  label,
  variant = 'outlined',
  iconOnly = false,
  tooltip,
  sx = {},
  ...props 
}) => {
  const navigate = useNavigate();
  const { t } = useTranslation();

  const displayLabel = label || t('common.back');
  const tooltipText = tooltip || displayLabel;

  const handleClick = () => {
    navigate(-1);
  };

  // Wariant: sam icon (jak obecny GoBackButton)
  if (iconOnly) {
    if (to) {
      return (
        <Tooltip title={tooltipText}>
          <IconButton component={Link} to={to} sx={{ mr: 2, ...sx }} {...props}>
            <ArrowBackIcon />
          </IconButton>
        </Tooltip>
      );
    }
    return (
      <Tooltip title={tooltipText}>
        <IconButton onClick={handleClick} sx={{ mr: 2, ...sx }} {...props}>
          <ArrowBackIcon />
        </IconButton>
      </Tooltip>
    );
  }

  // Wariant: przycisk z tekstem i ikoną
  if (to) {
    return (
      <Button
        component={Link}
        to={to}
        variant={variant}
        startIcon={<ArrowBackIcon />}
        sx={sx}
        {...props}
      >
        {displayLabel}
      </Button>
    );
  }

  return (
    <Button
      variant={variant}
      startIcon={<ArrowBackIcon />}
      onClick={handleClick}
      sx={sx}
      {...props}
    >
      {displayLabel}
    </Button>
  );
};

export default BackButton;
