import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import {
  getTasksByDateRangeOptimizedNew,
  getAllTasks,
  getProductionHistory,
  enrichTasksWithAllPONumbers,
  enrichTasksWithPODeliveryInfo
} from '../../services/production/productionService';
import { getAllWorkstations } from '../../services/production/workstationService';
import { getAllCustomers } from '../../services/crm';

const debounce = (func, delay) => {
  let timeoutId;
  const debounced = function (...args) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func.apply(this, args), delay);
  };
  debounced.cancel = () => { clearTimeout(timeoutId); };
  return debounced;
};

const VIEWPORT_BUFFER_MULTIPLIER = 2;
const REFETCH_THRESHOLD = 0.5;

export const useTimelineState = ({
  visibleTimeStart, visibleTimeEnd,
  setLoadedRange, loadedRangeRef,
  setIsLoadingMore,
  showError, showSuccess, t
}) => {
  const [tasks, setTasks] = useState([]);
  const [workstations, setWorkstations] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [productionHistoryMap, setProductionHistoryMap] = useState(new Map());
  const [loading, setLoading] = useState(true);
  const [tasksEnrichedWithPO, setTasksEnrichedWithPO] = useState(false);
  const [enrichmentInProgress, setEnrichmentInProgress] = useState(false);
  const [deliveryInfoEnriched, setDeliveryInfoEnriched] = useState(false);

  const fetchInProgressRef = useRef(false);
  const productionHistoryCacheRef = useRef(new Map());

  const fetchWorkstations = useCallback(async (setSelectedWorkstations) => {
    try {
      const data = await getAllWorkstations();
      setWorkstations(data);
      const initialSelected = {};
      data.forEach(ws => { initialSelected[ws.id] = true; });
      initialSelected['no-workstation'] = true;
      setSelectedWorkstations(initialSelected);
    } catch (error) {
      console.error('Błąd podczas pobierania stanowisk:', error);
      showError(t('production.timeline.messages.loadingError') + ': ' + error.message);
    }
  }, [showError, t]);

  const fetchCustomers = useCallback(async (setSelectedCustomers) => {
    try {
      const data = await getAllCustomers();
      setCustomers(data);
      const initialSelected = {};
      data.forEach(c => { initialSelected[c.id] = true; });
      initialSelected['no-customer'] = true;
      setSelectedCustomers(initialSelected);
    } catch (error) {
      console.error('Błąd podczas pobierania klientów:', error);
      showError(t('production.timeline.messages.loadingError') + ': ' + error.message);
    }
  }, [showError, t]);

  const mergeTasks = useCallback((existingTasks, newTasks) => {
    const taskMap = new Map();
    existingTasks.forEach(t => taskMap.set(t.id, t));
    newTasks.forEach(t => taskMap.set(t.id, t));
    return Array.from(taskMap.values());
  }, []);

  const cleanupOldTasks = useCallback((allTasks, rangeStart, rangeEnd) => {
    const rangeSize = rangeEnd - rangeStart;
    const cleanupStart = rangeStart - rangeSize;
    const cleanupEnd = rangeEnd + rangeSize;
    return allTasks.filter(task => {
      const taskDate = task.scheduledDate;
      if (!taskDate) return true;
      const taskTime = taskDate instanceof Date ? taskDate.getTime() :
                      taskDate.toDate ? taskDate.toDate().getTime() :
                      new Date(taskDate).getTime();
      return taskTime >= cleanupStart && taskTime <= cleanupEnd;
    });
  }, []);

  const enrichDeliveryInfoInBackground = useCallback(async (tasksToEnrich) => {
    if (deliveryInfoEnriched || !tasksToEnrich || tasksToEnrich.length === 0) return;
    try {
      const enrichedTasks = await enrichTasksWithPODeliveryInfo(tasksToEnrich);
      setTasks(enrichedTasks);
      setDeliveryInfoEnriched(true);
    } catch (error) {
      console.warn('Nie udało się wzbogacić zadań o dane dostawowe PO:', error.message);
    }
  }, [deliveryInfoEnriched]);

  const fetchTasks = useCallback(async (options = {}) => {
    const { forceReload = false } = options;
    if (fetchInProgressRef.current && !forceReload) return;

    try {
      const visibleRange = visibleTimeEnd - visibleTimeStart;
      const buffer = visibleRange * VIEWPORT_BUFFER_MULTIPLIER;
      const fetchStart = visibleTimeStart - buffer;
      const fetchEnd = visibleTimeEnd + buffer;

      const cached = loadedRangeRef.current;
      if (!forceReload && cached.start !== null) {
        const margin = visibleRange * REFETCH_THRESHOLD;
        if (visibleTimeStart - margin >= cached.start && visibleTimeEnd + margin <= cached.end) {
          return;
        }
      }

      fetchInProgressRef.current = true;
      const isInitialLoad = cached.start === null;
      if (isInitialLoad) setLoading(true);
      else setIsLoadingMore(true);

      const startDate = new Date(fetchStart);
      const endDate = new Date(fetchEnd);
      const visibleDays = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));
      const dynamicLimit = Math.min(Math.max(visibleDays * 30, 100), 500);

      let data;
      try {
        data = await getTasksByDateRangeOptimizedNew(
          startDate.toISOString(), endDate.toISOString(), dynamicLimit
        );
      } catch (error) {
        console.warn('Fallback do getAllTasks:', error.message);
        const allData = await getAllTasks();
        data = allData.filter(task => {
          const taskDate = task.scheduledDate;
          if (!taskDate) return true;
          const taskTime = taskDate instanceof Date ? taskDate.getTime() :
                          taskDate.toDate ? taskDate.toDate().getTime() :
                          new Date(taskDate).getTime();
          return taskTime >= fetchStart && taskTime <= fetchEnd;
        }).slice(0, dynamicLimit);
      }

      let newRange;
      if (forceReload || isInitialLoad) {
        setTasks(data);
        newRange = { start: fetchStart, end: fetchEnd };
      } else {
        setTasks(prev => {
          const merged = mergeTasks(prev, data);
          return cleanupOldTasks(merged, fetchStart, fetchEnd);
        });
        newRange = {
          start: Math.min(cached.start ?? fetchStart, fetchStart),
          end: Math.max(cached.end ?? fetchEnd, fetchEnd)
        };
      }
      loadedRangeRef.current = newRange;
      setLoadedRange(newRange);
      setTasksEnrichedWithPO(false);
      setDeliveryInfoEnriched(false);

      if (data.length > 0) {
        setTimeout(() => enrichDeliveryInfoInBackground(data), 300);
      }
    } catch (error) {
      console.error('Błąd podczas pobierania zadań:', error);
      showError(t('production.timeline.messages.loadingError') + ': ' + error.message);
    } finally {
      setLoading(false);
      setIsLoadingMore(false);
      fetchInProgressRef.current = false;
    }
  }, [visibleTimeStart, visibleTimeEnd, showError, mergeTasks, cleanupOldTasks, setLoadedRange, loadedRangeRef, setIsLoadingMore, enrichDeliveryInfoInBackground, t]);

  const handleRefresh = useCallback(() => {
    loadedRangeRef.current = { start: null, end: null };
    setLoadedRange({ start: null, end: null });
    fetchInProgressRef.current = false;
    fetchTasks({ forceReload: true });
  }, [fetchTasks, setLoadedRange, loadedRangeRef]);

  const calculateActualDatesFromHistory = useCallback((taskId, history) => {
    if (!history || history.length === 0) return null;
    const sessions = history.map(session => ({
      startTime: session.startTime instanceof Date ? session.startTime :
                 session.startTime?.toDate ? session.startTime.toDate() :
                 new Date(session.startTime),
      endTime: session.endTime instanceof Date ? session.endTime :
               session.endTime?.toDate ? session.endTime.toDate() :
               new Date(session.endTime)
    })).filter(s => !isNaN(s.startTime.getTime()) && !isNaN(s.endTime.getTime()));
    if (sessions.length === 0) return null;
    return {
      actualStartTime: new Date(Math.min(...sessions.map(s => s.startTime.getTime()))),
      actualEndTime: new Date(Math.max(...sessions.map(s => s.endTime.getTime())))
    };
  }, []);

  const fetchProductionHistoryForCompletedTasks = useCallback(async (currentTasks) => {
    const completedTasks = currentTasks.filter(task => task.status === 'Zakończone');
    if (completedTasks.length === 0) return;

    const newTasks = completedTasks.filter(task => !productionHistoryCacheRef.current.has(task.id));
    if (newTasks.length === 0) {
      setProductionHistoryMap(new Map(productionHistoryCacheRef.current));
      return;
    }

    await Promise.all(newTasks.map(async (task) => {
      try {
        const history = await getProductionHistory(task.id);
        if (history?.length > 0) {
          productionHistoryCacheRef.current.set(task.id, history);
        }
      } catch (error) {
        console.error(`Błąd podczas pobierania historii produkcji dla zadania ${task.id}:`, error);
      }
    }));
    setProductionHistoryMap(new Map(productionHistoryCacheRef.current));
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (tasks.length > 0) {
      fetchProductionHistoryForCompletedTasks(tasks).then(() => { if (cancelled) return; });
    }
    return () => { cancelled = true; };
  }, [tasks, fetchProductionHistoryForCompletedTasks]);

  const enrichTasksWithPO = useCallback(async () => {
    if (enrichmentInProgress || tasksEnrichedWithPO || !tasks || tasks.length === 0) return;
    setEnrichmentInProgress(true);
    try {
      const enrichedTasks = await enrichTasksWithAllPONumbers(tasks);
      setTasks(enrichedTasks);
      setTasksEnrichedWithPO(true);
    } catch (error) {
      console.error('Błąd podczas wzbogacania zadań:', error);
      showError('Błąd podczas ładowania powiązań z zamówieniami zakupowymi');
    } finally {
      setEnrichmentInProgress(false);
    }
  }, [tasks, tasksEnrichedWithPO, enrichmentInProgress, showError]);

  // Viewport-based loading: debounced refetch
  const fetchTasksRef = useRef(fetchTasks);
  fetchTasksRef.current = fetchTasks;

  const debouncedViewportFetch = useMemo(
    () => debounce(() => fetchTasksRef.current(), 500),
    []
  );

  useEffect(() => {
    if (loadedRangeRef.current.start !== null) {
      debouncedViewportFetch();
    }
    return () => debouncedViewportFetch.cancel?.();
  }, [visibleTimeStart, visibleTimeEnd, debouncedViewportFetch, loadedRangeRef]);

  return {
    tasks, setTasks,
    workstations, customers,
    productionHistoryMap,
    loading,
    tasksEnrichedWithPO, enrichmentInProgress,
    deliveryInfoEnriched,
    fetchWorkstations, fetchCustomers, fetchTasks,
    handleRefresh,
    enrichTasksWithPO,
    calculateActualDatesFromHistory
  };
};
