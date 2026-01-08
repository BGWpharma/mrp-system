// src/components/common/SentryErrorButton.js
import React from 'react';
import { Button } from '@mui/material';
import { BugReport as BugReportIcon } from '@mui/icons-material';
import * as Sentry from '@sentry/react';

/**
 * Komponent przycisku do testowania integracji z Sentry.io
 * Wyrzuca błąd JavaScript, który zostanie automatycznie przechwycony przez Sentry
 * 
 * @param {Object} props - Właściwości komponentu
 * @param {string} props.variant - Wariant przycisku MUI (default: 'outlined')
 * @param {string} props.color - Kolor przycisku MUI (default: 'warning')
 * @param {string} props.label - Tekst przycisku (default: 'Break the world')
 * @param {boolean} props.showIcon - Czy pokazać ikonę (default: true)
 */
const SentryErrorButton = ({ 
  variant = 'outlined', 
  color = 'warning',
  label = 'Break the world',
  showIcon = true,
  ...otherProps 
}) => {
  const handleClick = () => {
    // Wyrzuć błąd, który zostanie przechwycony przez Sentry
    throw new Error('This is your first error!');
  };

  return (
    <Button
      variant={variant}
      color={color}
      startIcon={showIcon ? <BugReportIcon /> : null}
      onClick={handleClick}
      {...otherProps}
    >
      {label}
    </Button>
  );
};

export default SentryErrorButton;

