import React from 'react';
import { Alert, Snackbar } from '@mui/material';
import { useNotification } from '../../hooks/useNotification';

/**
 * Komponent wyświetlający powiadomienia z kontekstu NotificationContext
 * 
 * Uwaga: Komponent ten nie jest potrzebny, ponieważ NotificationProvider
 * zawiera już własny komponent Snackbar do wyświetlania powiadomień.
 * Można go usunąć i polegać wyłącznie na NotificationContext.
 */
const Notifications = () => {
  // Ten komponent jest pusty, ponieważ NotificationContext już zawiera komponent Snackbar
  return null;
};

export default Notifications; 