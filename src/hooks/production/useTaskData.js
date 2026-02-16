/**
 * Hook do zarządzania danymi zadania produkcyjnego
 * Obsługuje real-time synchronizację, ładowanie i odświeżanie danych
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../services/firebase/config';
import { getTaskById } from '../../services/productionService';
import { useNotification } from '../useNotification';

export const useTaskData = (taskId, navigate) => {
  const [task, setTask] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { showError } = useNotification();
  
  // Ref do przechowywania ostatniego timestampu aktualizacji
  const lastUpdateTimestamp = useRef(null);
  const debounceTimerRef = useRef(null);
  const isMountedRef = useRef(true);
  
  // ✅ Real-time listener dla dokumentu zadania
  useEffect(() => {
    if (!taskId) {
      setLoading(false);
      return;
    }
    
    isMountedRef.current = true;
    setLoading(true);
    
    const taskRef = doc(db, 'productionTasks', taskId);
    
    const unsubscribe = onSnapshot(
      taskRef,
      { includeMetadataChanges: false },
      async (docSnapshot) => {
        // Debouncing z useRef
        if (debounceTimerRef.current) {
          clearTimeout(debounceTimerRef.current);
        }
        
        debounceTimerRef.current = setTimeout(async () => {
          if (!isMountedRef.current) {
            return;
          }
          
          if (!docSnapshot.exists()) {
            console.error('❌ Zadanie nie istnieje');
            if (isMountedRef.current) {
              showError('Zadanie nie istnieje');
              if (navigate) navigate('/production');
            }
            return;
          }
          
          const taskData = { id: docSnapshot.id, ...docSnapshot.data() };
          const updateTimestamp = taskData.updatedAt?.toMillis?.() || Date.now();
          
          // Smart update - porównaj timestamp
          if (lastUpdateTimestamp.current && updateTimestamp <= lastUpdateTimestamp.current) {
            return;
          }
          
          lastUpdateTimestamp.current = updateTimestamp;
          
          if (isMountedRef.current) {
            setTask(taskData);
            setError(null);
            
            if (loading) {
              setLoading(false);
            }
          }
        }, 300); // Debounce 300ms
      },
      (err) => {
        console.error('❌ [REAL-TIME] Błąd listenera zadania:', err);
        if (isMountedRef.current) {
          showError('Błąd synchronizacji danych zadania');
          setError(err);
          setLoading(false);
        }
      }
    );
    
    return () => {
      isMountedRef.current = false;
      
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      
      unsubscribe();
    };
  }, [taskId, navigate, showError, loading]);
  
  // Funkcja do wymuszenia odświeżenia danych
  const refreshTask = useCallback(async () => {
    if (!taskId) return;
    
    try {
      const freshTask = await getTaskById(taskId);
      setTask(freshTask);
      setError(null);
    } catch (err) {
      console.error('❌ Błąd podczas odświeżania zadania:', err);
      showError('Nie udało się odświeżyć danych zadania');
      setError(err);
    }
  }, [taskId, showError]);
  
  // Funkcja do aktualizacji lokalnego stanu (bez odświeżania z serwera)
  const updateTask = useCallback((updates) => {
    setTask(prevTask => prevTask ? { ...prevTask, ...updates } : null);
  }, []);
  
  return {
    task,
    loading,
    error,
    refreshTask,
    updateTask,
    setTask
  };
};

