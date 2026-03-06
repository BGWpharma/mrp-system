// src/hooks/usePermissions.js
import { useState, useCallback } from 'react';
import { useAuth } from './useAuth';

const TEST_MODE_KEY = 'mrp_permissions_test_mode';

/**
 * Hook do sprawdzania uprawnień użytkownika.
 * Czyta uprawnienia bezpośrednio z currentUser (AuthContext),
 * eliminując dodatkowe zapytania do Firestore.
 * W trybie normalnym administrator ma auto-grant na wszystko.
 * W trybie testowym administrator jest traktowany jak pracownik.
 */
export const usePermissions = () => {
  const { currentUser, loading: authLoading, refreshUser } = useAuth();
  const [testMode, setTestModeState] = useState(() => {
    try { return localStorage.getItem(TEST_MODE_KEY) === 'true'; } catch { return false; }
  });

  const setTestMode = useCallback((enabled) => {
    setTestModeState(enabled);
    try { localStorage.setItem(TEST_MODE_KEY, String(enabled)); } catch {}
  }, []);

  const isAdmin = currentUser?.role === 'administrator';
  const permissions = currentUser?.permissions || {};

  const checkPermission = useCallback((permission) => {
    if (isAdmin && !testMode) return true;
    return permissions[permission] === true;
  }, [isAdmin, testMode, permissions]);

  const refreshPermissions = useCallback(() => {
    refreshUser?.();
  }, [refreshUser]);

  return {
    permissions,
    loading: authLoading,
    isAdmin,
    testMode,
    setTestMode,
    refreshPermissions,
    hasPermission: checkPermission,
    canCompleteStocktaking: checkPermission('canCompleteStocktaking'),
    canCreateSchedule: checkPermission('canCreateSchedule'),
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
