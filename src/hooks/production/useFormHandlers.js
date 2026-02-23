import { useCallback } from 'react';

export const useFormHandlers = ({ task, showSuccess, fetchFormResponses }) => {
  const handleProductionControlFormSuccess = useCallback((formData) => {
    showSuccess('Formularz kontroli produkcji został zapisany pomyślnie!');
    if (task?.moNumber) {
      fetchFormResponses(task.moNumber);
    }
  }, [task?.moNumber, showSuccess, fetchFormResponses]);

  const handleCompletedMOFormSuccess = useCallback((formData) => {
    showSuccess('Raport zakończonego MO został zapisany pomyślnie!');
    if (task?.moNumber) {
      fetchFormResponses(task.moNumber);
    }
  }, [task?.moNumber, showSuccess, fetchFormResponses]);

  const handleProductionShiftFormSuccess = useCallback((formData) => {
    showSuccess('Raport zmiany produkcyjnej został zapisany pomyślnie!');
    if (task?.moNumber) {
      fetchFormResponses(task.moNumber);
    }
  }, [task?.moNumber, showSuccess, fetchFormResponses]);

  return {
    handleProductionControlFormSuccess,
    handleCompletedMOFormSuccess,
    handleProductionShiftFormSuccess
  };
};

export default useFormHandlers;
