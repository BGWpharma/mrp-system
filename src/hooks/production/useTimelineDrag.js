import { useState, useCallback, useRef, useMemo } from 'react';
import { calculateEndDateWithWorkingHours } from '../../utils/dateUtils';

export const useTimelineDrag = ({ items, roundToMinute }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [dragInfo, setDragInfo] = useState({
    isDragging: false,
    itemId: null,
    currentTime: null,
    startTime: null,
    endTime: null,
    position: { x: 0, y: 0 }
  });

  const itemsMapRef = useRef(new Map());
  useMemo(() => {
    const map = new Map();
    items.forEach(item => map.set(item.id, item));
    itemsMapRef.current = map;
  }, [items]);

  const handleItemDrag = useCallback(({ itemId, time }) => {
    setIsDragging(true);
    const item = itemsMapRef.current.get(itemId);
    if (item) {
      const originalDurationMinutes = item.originalDuration || Math.round((item.end_time - item.start_time) / (1000 * 60));
      const newStartTime = roundToMinute(new Date(time));
      const workingHours = item.workingHoursPerDay || 16;
      const newEndTime = calculateEndDateWithWorkingHours(newStartTime, originalDurationMinutes, workingHours);

      setDragInfo({
        isDragging: true,
        itemId,
        currentTime: newStartTime,
        startTime: newStartTime,
        endTime: newEndTime,
        position: { x: 0, y: 0 }
      });
    }
  }, [roundToMinute]);

  const resetDrag = useCallback(() => {
    setIsDragging(false);
    setDragInfo({
      isDragging: false,
      itemId: null,
      currentTime: null,
      startTime: null,
      endTime: null,
      position: { x: 0, y: 0 }
    });
  }, []);

  return {
    isDragging, setIsDragging,
    dragInfo, setDragInfo,
    handleItemDrag, resetDrag,
    itemsMapRef
  };
};
