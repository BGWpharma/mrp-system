import { useState, useCallback, useRef, useEffect } from 'react';
import { updateTask } from '../../services/production/productionService';
import { isWeekend, calculateEndDateWithWorkingHours, calculateProductionTimeBetweenExcludingWeekends } from '../../utils/dateUtils';

export const useTimelineEdit = ({
  items, tasks, setTasks, groups, groupBy,
  snapToPrevious, editMode, poDeliveryMode, focusedMOId,
  showError, showSuccess, t, currentUser,
  handleRefresh, resetDrag, isDragging,
  setFocusedMOId, setFocusedMOReservations, loadPOReservationsForMO
}) => {
  const [editDialog, setEditDialog] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [editForm, setEditForm] = useState({ start: null, end: null });
  const [undoStack, setUndoStack] = useState([]);
  const [maxUndoSteps] = useState(10);

  const undoFunctionRef = useRef(null);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const roundToMinute = useCallback((date) => {
    if (!date || isNaN(new Date(date).getTime())) return new Date();
    const rounded = new Date(date);
    rounded.setSeconds(0, 0);
    return rounded;
  }, []);

  const getGroupByValue = useCallback((task) => {
    return groupBy === 'workstation'
      ? task.workstationId || 'no-workstation'
      : task.orderId || 'no-order';
  }, [groupBy]);

  const findPreviousTask = useCallback((movedTask, allTasks, targetGroup) => {
    const movedTaskId = movedTask.id || movedTask.task?.id;
    const tasksInGroup = allTasks.filter(task =>
      getGroupByValue(task) === targetGroup && task.id !== movedTaskId
    );
    const sortedTasks = tasksInGroup.sort((a, b) => {
      const getEndDate = (task) => {
        if (!task.endDate) return new Date(0);
        if (task.endDate instanceof Date) return task.endDate;
        if (task.endDate.toDate) return task.endDate.toDate();
        return new Date(task.endDate);
      };
      return getEndDate(a) - getEndDate(b);
    });
    let previousTask = null;
    const movedStartDate = new Date(movedTask.startDate);
    for (const task of sortedTasks) {
      const taskEndDate = task.endDate ?
        (task.endDate instanceof Date ? task.endDate :
         task.endDate.toDate ? task.endDate.toDate() :
         new Date(task.endDate)) : null;
      if (taskEndDate && taskEndDate <= movedStartDate) {
        previousTask = task;
      } else { break; }
    }
    return previousTask;
  }, [getGroupByValue]);

  const findNextTask = useCallback((movedTask, allTasks, targetGroup) => {
    const movedTaskId = movedTask.id || movedTask.task?.id;
    const tasksInGroup = allTasks.filter(task =>
      getGroupByValue(task) === targetGroup && task.id !== movedTaskId
    );
    const sortedTasks = tasksInGroup.sort((a, b) => {
      const getStartDate = (task) => {
        if (!task.scheduledDate) return new Date(0);
        if (task.scheduledDate instanceof Date) return task.scheduledDate;
        if (task.scheduledDate.toDate) return task.scheduledDate.toDate();
        return new Date(task.scheduledDate);
      };
      return getStartDate(a) - getStartDate(b);
    });
    const movedEndDate = new Date(movedTask.endDate);
    for (const task of sortedTasks) {
      const taskStartDate = task.scheduledDate ?
        (task.scheduledDate instanceof Date ? task.scheduledDate :
         task.scheduledDate.toDate ? task.scheduledDate.toDate() :
         new Date(task.scheduledDate)) : null;
      if (taskStartDate && taskStartDate >= movedEndDate) return task;
    }
    return null;
  }, [getGroupByValue]);

  const snapToTask = useCallback((movedTask, targetGroup, newStartTime, newEndTime) => {
    if (!snapToPrevious) return { newStartTime, newEndTime };
    const duration = newEndTime - newStartTime;
    const taskData = { ...movedTask, startDate: newStartTime, endDate: newEndTime };
    const previousTask = findPreviousTask(taskData, tasks, targetGroup);
    const nextTask = findNextTask(taskData, tasks, targetGroup);

    let snapToPreviousResult = null, snapToNextResult = null;
    let distanceToPrevious = Infinity, distanceToNext = Infinity;

    if (previousTask?.endDate) {
      let previousEndDate;
      if (previousTask.endDate instanceof Date) previousEndDate = previousTask.endDate;
      else if (previousTask.endDate.toDate) previousEndDate = previousTask.endDate.toDate();
      else previousEndDate = new Date(previousTask.endDate);

      if (!isNaN(previousEndDate.getTime())) {
        distanceToPrevious = Math.abs(newStartTime.getTime() - previousEndDate.getTime());
        const snappedStart = roundToMinute(previousEndDate);
        snapToPreviousResult = { newStartTime: snappedStart, newEndTime: roundToMinute(new Date(snappedStart.getTime() + duration)) };
      }
    }

    if (nextTask?.scheduledDate) {
      let nextStartDate;
      if (nextTask.scheduledDate instanceof Date) nextStartDate = nextTask.scheduledDate;
      else if (nextTask.scheduledDate.toDate) nextStartDate = nextTask.scheduledDate.toDate();
      else nextStartDate = new Date(nextTask.scheduledDate);

      if (!isNaN(nextStartDate.getTime())) {
        distanceToNext = Math.abs(newEndTime.getTime() - nextStartDate.getTime());
        const snappedEnd = roundToMinute(nextStartDate);
        snapToNextResult = { newStartTime: roundToMinute(new Date(snappedEnd.getTime() - duration)), newEndTime: snappedEnd };
      }
    }

    if (snapToPreviousResult && snapToNextResult) {
      return distanceToPrevious <= distanceToNext ? snapToPreviousResult : snapToNextResult;
    }
    if (snapToPreviousResult) return snapToPreviousResult;
    if (snapToNextResult) return snapToNextResult;
    return { newStartTime, newEndTime };
  }, [snapToPrevious, tasks, findPreviousTask, findNextTask, roundToMinute]);

  const addToUndoStack = useCallback((action) => {
    setUndoStack(prevStack => {
      const newStack = [...prevStack, action];
      return newStack.length > maxUndoSteps ? newStack.slice(-maxUndoSteps) : newStack;
    });
  }, [maxUndoSteps]);

  const handleUndo = useCallback(async () => {
    if (undoStack.length === 0) {
      showError(t('production.timeline.messages.noActionsToUndo'));
      return;
    }
    try {
      const lastAction = undoStack[undoStack.length - 1];
      if (lastAction.type === 'move') {
        const updateData = {
          scheduledDate: lastAction.previousData.scheduledDate,
          endDate: lastAction.previousData.endDate,
          estimatedDuration: lastAction.previousData.estimatedDuration
        };
        await updateTask(lastAction.taskId, updateData, currentUser.uid);
        setUndoStack(prevStack => prevStack.slice(0, -1));
        showSuccess(t('production.timeline.messages.undoSuccess'));
        handleRefresh();
      }
    } catch (error) {
      console.error('Błąd podczas cofania akcji:', error);
      showError(t('production.timeline.messages.undoError') + ': ' + error.message);
    }
  }, [undoStack, showError, showSuccess, handleRefresh, currentUser.uid, t]);

  undoFunctionRef.current = handleUndo;

  // Ctrl+Z handler
  useEffect(() => {
    const handleKeyDown = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'z' && !event.shiftKey) {
        event.preventDefault();
        if (undoFunctionRef.current) undoFunctionRef.current();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Escape zamyka tryb fokusowania PO
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && focusedMOId) {
        setFocusedMOId(null);
        setFocusedMOReservations([]);
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [focusedMOId, setFocusedMOId, setFocusedMOReservations]);

  const handleItemMove = useCallback(async (itemId, dragTime, newGroupId) => {
    try {
      resetDrag();
      const item = items.find(i => i.id === itemId);
      if (!item) return;
      if (item.task?.status === 'Zakończone') {
        showError(t('production.timeline.tooltip.cannotEdit'));
        return;
      }

      const previousState = {
        type: 'move', taskId: itemId,
        previousData: {
          scheduledDate: item.task?.scheduledDate || new Date(item.start_time),
          endDate: item.task?.endDate || new Date(item.end_time),
          estimatedDuration: item.task?.estimatedDuration || Math.round((item.end_time - item.start_time) / (1000 * 60)),
          workstationId: item.task?.workstationId || item.group
        },
        timestamp: new Date().toISOString()
      };

      let newStartTime = roundToMinute(new Date(dragTime));
      if (isWeekend(newStartTime)) {
        const originalHour = newStartTime.getHours();
        const originalMinute = newStartTime.getMinutes();
        while (isWeekend(newStartTime)) newStartTime.setDate(newStartTime.getDate() + 1);
        newStartTime.setHours(originalHour, originalMinute, 0, 0);
      }

      const originalDurationMinutes = item.originalDuration || item.task?.estimatedDuration || Math.round((item.end_time - item.start_time) / (1000 * 60));
      const workingHours = item.workingHoursPerDay || item.task?.workingHoursPerDay || 16;
      let newEndTime = calculateEndDateWithWorkingHours(newStartTime, originalDurationMinutes, workingHours);

      const task = item.task;
      let targetGroup = newGroupId || item.group;
      if (typeof targetGroup === 'number' && groups[targetGroup]) {
        targetGroup = groups[targetGroup].id;
      }

      const snappedTimes = snapToTask(task, targetGroup, newStartTime, newEndTime);
      newStartTime = snappedTimes.newStartTime;
      newEndTime = snappedTimes.newEndTime;

      if (isNaN(newStartTime.getTime()) || isNaN(newEndTime.getTime())) {
        showError(t('production.timeline.messages.taskMoveError'));
        return;
      }

      const updateData = {
        scheduledDate: newStartTime,
        endDate: newEndTime,
        estimatedDuration: originalDurationMinutes
      };

      await updateTask(itemId, updateData, currentUser.uid);

      setTasks(prevTasks => prevTasks.map(prevTask => {
        if (prevTask.id === itemId) {
          return { ...prevTask, scheduledDate: newStartTime, endDate: newEndTime, estimatedDuration: originalDurationMinutes };
        }
        return prevTask;
      }));

      addToUndoStack(previousState);
      showSuccess(t('production.timeline.edit.saveSuccess'));
      setTimeout(() => handleRefresh(), 100);
    } catch (error) {
      console.error('Błąd podczas aktualizacji zadania:', error);
      showError(t('production.timeline.edit.saveError') + ': ' + error.message);
    }
  }, [items, roundToMinute, snapToTask, showError, showSuccess, handleRefresh, currentUser.uid, addToUndoStack, groups, setTasks, resetDrag, t]);

  const handleItemResize = useCallback(async (itemId, time, edge) => {
    try {
      resetDrag();
      const item = items.find(i => i.id === itemId);
      if (!item) return;
      if (item.task?.status === 'Zakończone') {
        showError(t('production.timeline.tooltip.cannotEdit'));
        return;
      }

      let newStartTime, newEndTime, duration;
      if (edge === 'left') {
        newStartTime = roundToMinute(new Date(time));
        newEndTime = roundToMinute(new Date(item.end_time));
        duration = calculateProductionTimeBetweenExcludingWeekends(newStartTime, newEndTime);
      } else {
        newStartTime = roundToMinute(new Date(item.start_time));
        const requestedEndTime = roundToMinute(new Date(time));
        duration = calculateProductionTimeBetweenExcludingWeekends(newStartTime, requestedEndTime);
        const workingHours = item.task?.workingHoursPerDay || 16;
        newEndTime = calculateEndDateWithWorkingHours(newStartTime, duration, workingHours);
      }

      await updateTask(itemId, { scheduledDate: newStartTime, endDate: newEndTime, estimatedDuration: duration }, currentUser.uid);
      showSuccess(t('production.timeline.edit.saveSuccess'));
      handleRefresh();
    } catch (error) {
      console.error('Błąd podczas aktualizacji zadania:', error);
      showError(t('production.timeline.edit.saveError') + ': ' + error.message);
    }
  }, [items, roundToMinute, showError, showSuccess, handleRefresh, currentUser.uid, resetDrag, t]);

  const handleItemSelect = useCallback((itemId) => {
    if (isDragging) return;
    if (String(itemId).startsWith('po-res-')) return;

    const item = itemsRef.current.find(i => i.id === itemId);
    if (!item) return;

    if (poDeliveryMode) {
      if (focusedMOId === itemId) {
        setFocusedMOId(null);
        setFocusedMOReservations([]);
      } else {
        setFocusedMOId(itemId);
        loadPOReservationsForMO(item.task?.id || itemId);
      }
      return;
    }

    if (editMode) {
      if (item.task?.status === 'Zakończone') {
        showError(t('production.timeline.tooltip.cannotEdit'));
        return;
      }
      setSelectedItem(item);
      setEditForm({ start: new Date(item.start_time), end: new Date(item.end_time) });
      setEditDialog(true);
    } else {
      const taskId = item.task?.id || itemId;
      window.open(`/production/tasks/${taskId}`, '_blank');
    }
  }, [isDragging, poDeliveryMode, focusedMOId, editMode, showError, t, loadPOReservationsForMO, setFocusedMOId, setFocusedMOReservations]);

  const handleSaveEdit = useCallback(async () => {
    if (!selectedItem || !editForm.start || !editForm.end) {
      showError('Wszystkie pola są wymagane');
      return;
    }
    try {
      const startTime = roundToMinute(editForm.start);
      const endTime = roundToMinute(editForm.end);
      const duration = Math.round((endTime - startTime) / (1000 * 60));
      await updateTask(selectedItem.id, { scheduledDate: startTime, endDate: endTime, estimatedDuration: duration }, currentUser.uid);
      showSuccess(t('production.timeline.edit.saveSuccess'));
      setEditDialog(false);
      setSelectedItem(null);
      handleRefresh();
    } catch (error) {
      console.error('Błąd podczas zapisywania:', error);
      showError(t('production.timeline.edit.saveError') + ': ' + error.message);
    }
  }, [selectedItem, editForm, roundToMinute, showError, showSuccess, handleRefresh, currentUser.uid, t]);

  return {
    editDialog, setEditDialog,
    selectedItem,
    editForm, setEditForm,
    undoStack,
    roundToMinute,
    handleItemMove, handleItemResize,
    handleItemSelect, handleSaveEdit,
    handleUndo
  };
};
