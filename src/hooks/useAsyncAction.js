import { useState, useCallback } from 'react';
import { useNotification } from './useNotification';

export const useAsyncAction = () => {
  const { showError, showSuccess } = useNotification();
  const [loading, setLoading] = useState(false);

  const execute = useCallback(async (fn, { successMsg, errorMsg } = {}) => {
    setLoading(true);
    try {
      const result = await fn();
      if (successMsg) showSuccess(successMsg);
      return result;
    } catch (error) {
      showError(errorMsg || error.message);
      throw error;
    } finally {
      setLoading(false);
    }
  }, [showError, showSuccess]);

  return { execute, loading };
};
