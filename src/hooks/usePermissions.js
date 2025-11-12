// src/hooks/usePermissions.js
import { useState, useEffect } from 'react';
import { getUserPermissions, hasPermission } from '../services/userService';
import { useAuth } from './useAuth';

/**
 * Hook do sprawdzania uprawnień użytkownika
 * Automatycznie pobiera uprawnienia zalogowanego użytkownika
 * @returns {Object} - Obiekt z uprawnieniami i funkcją sprawdzającą
 */
export const usePermissions = () => {
  const { currentUser } = useAuth();
  const [permissions, setPermissions] = useState({});
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const fetchPermissions = async () => {
      if (!currentUser) {
        setPermissions({});
        setIsAdmin(false);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const userPermissions = await getUserPermissions(currentUser.uid);
        setPermissions(userPermissions);
        
        // Sprawdź czy użytkownik jest administratorem
        // Administratorzy mają wszystkie uprawnienia
        const adminCheck = await hasPermission(currentUser.uid, 'admin');
        setIsAdmin(adminCheck);
      } catch (error) {
        console.error('Błąd podczas pobierania uprawnień użytkownika:', error);
        setPermissions({});
        setIsAdmin(false);
      } finally {
        setLoading(false);
      }
    };

    fetchPermissions();
  }, [currentUser]);

  /**
   * Sprawdza czy użytkownik ma określone uprawnienie
   * @param {string} permission - Nazwa uprawnienia
   * @returns {boolean} - Czy użytkownik ma uprawnienie
   */
  const checkPermission = (permission) => {
    // Administratorzy mają wszystkie uprawnienia
    if (isAdmin) return true;
    
    return permissions[permission] === true;
  };

  return {
    permissions,
    loading,
    isAdmin,
    hasPermission: checkPermission,
    // Eksportuj konkretne uprawnienia dla wygody
    canCompleteStocktaking: checkPermission('canCompleteStocktaking'),
  };
};

export default usePermissions;

