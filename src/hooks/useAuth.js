// src/hooks/useAuth.js
import { useContext } from 'react';
import { AuthContext } from '../contexts/AuthContext';

/**
 * Hook zapewniający dostęp do funkcji i danych związanych z autoryzacją
 * 
 * @returns {Object} Obiekt zawierający dane i funkcje autoryzacji
 */
export const useAuth = () => {
  return useContext(AuthContext);
};