import { useContext } from 'react';
import { NotificationContext } from '../contexts/NotificationContext';

/**
 * Hook zapewniający dostęp do funkcji wyświetlania powiadomień
 *
 * @returns {Object} Obiekt zawierający funkcje do wyświetlania powiadomień
 */
export const useNotification = () => {
  return useContext(NotificationContext);
}; 