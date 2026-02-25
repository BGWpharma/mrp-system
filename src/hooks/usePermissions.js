// src/hooks/usePermissions.js
import { useState, useEffect, useCallback } from 'react';
import { getRawUserPermissions, hasPermission, clearUserCache } from '../services/userService';
import { useAuth } from './useAuth';

const TEST_MODE_KEY = 'mrp_permissions_test_mode';

/**
 * Hook do sprawdzania uprawnień użytkownika.
 * Pobiera surowe uprawnienia z Firestore i sprawdza rolę admina.
 * W trybie normalnym administrator ma auto-grant na wszystko.
 * W trybie testowym administrator jest traktowany jak pracownik.
 */
export const usePermissions = () => {
  const { currentUser } = useAuth();
  const [permissions, setPermissions] = useState({});
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [refreshCounter, setRefreshCounter] = useState(0);
  const [testMode, setTestModeState] = useState(() => {
    try { return localStorage.getItem(TEST_MODE_KEY) === 'true'; } catch { return false; }
  });

  const setTestMode = useCallback((enabled) => {
    setTestModeState(enabled);
    try { localStorage.setItem(TEST_MODE_KEY, String(enabled)); } catch {}
  }, []);

  /**
   * Wymusza ponowne pobranie uprawnień z Firestore (czyści cache).
   */
  const refreshPermissions = useCallback(() => {
    if (currentUser?.uid) {
      clearUserCache(currentUser.uid);
    }
    setRefreshCounter(c => c + 1);
  }, [currentUser?.uid]);

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
        // Zawsze pobieraj surowe uprawnienia z Firestore
        const userPermissions = await getRawUserPermissions(currentUser.uid);
        setPermissions(userPermissions);
        
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
  }, [currentUser, refreshCounter]);

  const checkPermission = useCallback((permission) => {
    if (isAdmin && !testMode) return true;
    return permissions[permission] === true;
  }, [isAdmin, testMode, permissions]);

  return {
    permissions,
    loading,
    isAdmin,
    testMode,
    setTestMode,
    refreshPermissions,
    hasPermission: checkPermission,
    // Uprawnienia operacyjne
    canCompleteStocktaking: checkPermission('canCompleteStocktaking'),
    // Uprawnienia modułowe
    canAccessDashboard: checkPermission('canAccessDashboard'),
    canAccessAnalytics: checkPermission('canAccessAnalytics'),
    canAccessProduction: checkPermission('canAccessProduction'),
    canAccessInventory: checkPermission('canAccessInventory'),
    canAccessSales: checkPermission('canAccessSales'),
    canAccessHallData: checkPermission('canAccessHallData'),
    canAccessAIAssistant: checkPermission('canAccessAIAssistant'),
    canAccessCRM: checkPermission('canAccessCRM'),
  };
};

export default usePermissions;

