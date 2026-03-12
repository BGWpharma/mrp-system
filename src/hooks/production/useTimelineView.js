import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { startOfDay, endOfDay, addDays } from 'date-fns';

const debounce = (func, delay) => {
  let timeoutId;
  const debounced = function (...args) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func.apply(this, args), delay);
  };
  debounced.cancel = () => { clearTimeout(timeoutId); };
  return debounced;
};

export const useTimelineView = () => {
  const [visibleTimeStart, setVisibleTimeStart] = useState(startOfDay(new Date()).getTime());
  const [visibleTimeEnd, setVisibleTimeEnd] = useState(endOfDay(addDays(new Date(), 30)).getTime());
  const [canvasTimeStart] = useState(startOfDay(addDays(new Date(), -365)).getTime());
  const [canvasTimeEnd] = useState(endOfDay(addDays(new Date(), 365)).getTime());
  const [zoomLevel, setZoomLevel] = useState(1);
  const [timeScale, setTimeScale] = useState('daily');
  const [sliderValue, setSliderValue] = useState(0);
  const [loadedRange, setLoadedRange] = useState({ start: null, end: null });
  const loadedRangeRef = useRef({ start: null, end: null });
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const updateScrollCanvasRef = useRef(null);

  const syncCanvas = useCallback((start, end) => {
    if (updateScrollCanvasRef.current) {
      updateScrollCanvasRef.current(start, end);
      setTimeout(() => {
        if (updateScrollCanvasRef.current) {
          updateScrollCanvasRef.current(start, end);
        }
      }, 50);
    }
  }, []);

  const calculateSliderValue = useCallback(() => {
    const totalRange = canvasTimeEnd - canvasTimeStart;
    const currentPosition = visibleTimeStart - canvasTimeStart;
    if (totalRange <= 0) return 0;
    if (currentPosition < 0) return 0;
    if (currentPosition >= totalRange) return 100;
    return Math.max(0, Math.min(100, (currentPosition / totalRange) * 100));
  }, [canvasTimeStart, canvasTimeEnd, visibleTimeStart]);

  useEffect(() => {
    const newSliderValue = calculateSliderValue();
    if (isFinite(newSliderValue)) {
      setSliderValue(newSliderValue);
    }
  }, [calculateSliderValue, visibleTimeStart, visibleTimeEnd, canvasTimeStart, canvasTimeEnd]);

  const handleSliderChange = useCallback((event, newValue) => {
    const totalRange = canvasTimeEnd - canvasTimeStart;
    const viewRange = visibleTimeEnd - visibleTimeStart;
    const clampedValue = Math.max(0, Math.min(100, newValue));

    let newStart = canvasTimeStart + (totalRange * clampedValue / 100);
    let newEnd = newStart + viewRange;

    if (newEnd > canvasTimeEnd) {
      newEnd = canvasTimeEnd;
      newStart = Math.max(canvasTimeStart, newEnd - viewRange);
    }
    if (newStart < canvasTimeStart) {
      newStart = canvasTimeStart;
      newEnd = Math.min(canvasTimeEnd, newStart + viewRange);
    }
    if (newEnd <= newStart) {
      const minimumRange = 1000 * 60 * 60;
      newEnd = newStart + minimumRange;
      if (newEnd > canvasTimeEnd) {
        newEnd = canvasTimeEnd;
        newStart = newEnd - minimumRange;
      }
    }

    setVisibleTimeStart(newStart);
    setVisibleTimeEnd(newEnd);
    setSliderValue(clampedValue);
    syncCanvas(newStart, newEnd);
  }, [canvasTimeStart, canvasTimeEnd, visibleTimeEnd, visibleTimeStart, syncCanvas]);

  const handleTimeChange = useCallback((vts, vte, updateScrollCanvas) => {
    if (!vts || !vte || vte <= vts) {
      console.warn('Nieprawidłowe wartości czasu:', { vts, vte });
      return;
    }
    updateScrollCanvasRef.current = updateScrollCanvas;
    if (updateScrollCanvas && typeof updateScrollCanvas === 'function') {
      updateScrollCanvas(vts, vte);
      setTimeout(() => updateScrollCanvas(vts, vte), 50);
    }
    setVisibleTimeStart(vts);
    setVisibleTimeEnd(vte);
  }, []);

  const zoomIn = useCallback(() => {
    const center = (visibleTimeStart + visibleTimeEnd) / 2;
    const range = (visibleTimeEnd - visibleTimeStart) / 2;
    const newRange = range * 0.4;
    const newStart = center - newRange;
    const newEnd = center + newRange;
    setZoomLevel(prev => Math.min(prev * 2.5, 25));
    setVisibleTimeStart(newStart);
    setVisibleTimeEnd(newEnd);
    syncCanvas(newStart, newEnd);
  }, [visibleTimeStart, visibleTimeEnd, syncCanvas]);

  const zoomOut = useCallback(() => {
    const center = (visibleTimeStart + visibleTimeEnd) / 2;
    const range = (visibleTimeEnd - visibleTimeStart) / 2;
    const newRange = range * 2.5;
    const maxRange = (canvasTimeEnd - canvasTimeStart) / 2;
    const finalRange = Math.min(newRange, maxRange);
    const newStart = Math.max(center - finalRange, canvasTimeStart);
    const newEnd = Math.min(center + finalRange, canvasTimeEnd);
    setZoomLevel(prev => Math.max(prev / 2.5, 0.04));
    setVisibleTimeStart(newStart);
    setVisibleTimeEnd(newEnd);
    syncCanvas(newStart, newEnd);
  }, [visibleTimeStart, visibleTimeEnd, canvasTimeStart, canvasTimeEnd, syncCanvas]);

  const resetZoom = useCallback(() => {
    const newStart = startOfDay(new Date()).getTime();
    const newEnd = endOfDay(addDays(new Date(), 30)).getTime();
    setZoomLevel(1);
    setVisibleTimeStart(newStart);
    setVisibleTimeEnd(newEnd);
    syncCanvas(newStart, newEnd);
  }, [syncCanvas]);

  const zoomToScale = useCallback((scale) => {
    const now = new Date();
    let start, end, zoom;
    switch (scale) {
      case 'hourly': start = startOfDay(now).getTime(); end = endOfDay(addDays(now, 2)).getTime(); zoom = 6.25; break;
      case 'daily': start = startOfDay(now).getTime(); end = endOfDay(addDays(now, 7)).getTime(); zoom = 2.5; break;
      case 'weekly': start = startOfDay(now).getTime(); end = endOfDay(addDays(now, 30)).getTime(); zoom = 1; break;
      case 'monthly': start = startOfDay(now).getTime(); end = endOfDay(addDays(now, 90)).getTime(); zoom = 0.4; break;
      default: return;
    }
    setTimeScale(scale);
    setZoomLevel(zoom);
    setVisibleTimeStart(start);
    setVisibleTimeEnd(end);
    syncCanvas(start, end);
  }, [syncCanvas]);

  const debouncedCanvasSync = useMemo(() =>
    debounce(() => {
      if (updateScrollCanvasRef.current && typeof updateScrollCanvasRef.current === 'function') {
        updateScrollCanvasRef.current(visibleTimeStart, visibleTimeEnd);
      }
    }, 50),
    [visibleTimeStart, visibleTimeEnd]
  );

  useEffect(() => {
    debouncedCanvasSync();
  }, [visibleTimeStart, visibleTimeEnd, debouncedCanvasSync]);

  return {
    visibleTimeStart, setVisibleTimeStart,
    visibleTimeEnd, setVisibleTimeEnd,
    canvasTimeStart, canvasTimeEnd,
    zoomLevel, setZoomLevel,
    timeScale,
    sliderValue, setSliderValue,
    loadedRange, setLoadedRange,
    loadedRangeRef,
    isLoadingMore, setIsLoadingMore,
    updateScrollCanvasRef,
    syncCanvas,
    calculateSliderValue,
    handleSliderChange,
    handleTimeChange,
    zoomIn, zoomOut, resetZoom, zoomToScale
  };
};
