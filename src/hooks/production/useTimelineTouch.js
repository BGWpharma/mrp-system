import { useState, useCallback, useMemo, useEffect } from 'react';

const debounce = (func, delay) => {
  let timeoutId;
  const debounced = function (...args) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func.apply(this, args), delay);
  };
  debounced.cancel = () => { clearTimeout(timeoutId); };
  return debounced;
};

export const useTimelineTouch = ({
  visibleTimeStart, visibleTimeEnd,
  canvasTimeStart, canvasTimeEnd,
  zoomLevel,
  setVisibleTimeStart, setVisibleTimeEnd, setZoomLevel,
  updateScrollCanvasRef,
  debouncedTooltipUpdate, hideTooltip,
  calculateSliderValue, setSliderValue
}) => {
  const [touchStart, setTouchStart] = useState(null);
  const [touchEnd, setTouchEnd] = useState(null);
  const [isPinching, setIsPinching] = useState(false);
  const [initialPinchDistance, setInitialPinchDistance] = useState(0);
  const [isTouchpadScrolling, setIsTouchpadScrolling] = useState(false);
  const [touchpadScrollTimeout, setTouchpadScrollTimeout] = useState(null);
  const [lastWheelEvent, setLastWheelEvent] = useState(null);
  const [wheelEventCount, setWheelEventCount] = useState(0);

  const getTouchDistance = (touch1, touch2) => {
    return Math.sqrt(
      Math.pow(touch2.clientX - touch1.clientX, 2) +
      Math.pow(touch2.clientY - touch1.clientY, 2)
    );
  };

  const detectTouchpad = useCallback((event) => {
    const now = performance.now();
    const timeDiff = lastWheelEvent ? now - lastWheelEvent.timestamp : 0;
    setWheelEventCount(prev => prev + 1);
    setLastWheelEvent({ timestamp: now, deltaY: event.deltaY, deltaX: event.deltaX });

    const isSmallDelta = Math.abs(event.deltaY) < 50;
    const isVerySmallDelta = Math.abs(event.deltaY) < 20;
    const isFrequent = timeDiff < 50;
    const isVeryFrequent = timeDiff < 16;
    const isFloatValue = event.deltaY % 1 !== 0;
    const hasHorizontalComponent = Math.abs(event.deltaX) > 0;
    const isDeltaMode0 = event.deltaMode === 0;

    let touchpadScore = 0;
    if (isVerySmallDelta) touchpadScore += 3;
    else if (isSmallDelta) touchpadScore += 2;
    if (isVeryFrequent) touchpadScore += 3;
    else if (isFrequent) touchpadScore += 2;
    if (isFloatValue) touchpadScore += 2;
    if (hasHorizontalComponent) touchpadScore += 1;
    if (isDeltaMode0) touchpadScore += 1;
    if (wheelEventCount > 10 && timeDiff < 100) touchpadScore += 2;
    if (timeDiff > 1000) setWheelEventCount(0);

    return touchpadScore >= 3;
  }, [lastWheelEvent, wheelEventCount]);

  const handleWheel = useCallback((event) => {
    debouncedTooltipUpdate.cancel();
    hideTooltip();

    const isTouchpad = detectTouchpad(event);

    if (event.shiftKey) {
      event.preventDefault();
      const range = visibleTimeEnd - visibleTimeStart;
      const scrollSensitivity = isTouchpad ? 0.001 : 0.002;
      const scrollAmount = event.deltaY * range * scrollSensitivity;
      const newStart = Math.max(Math.min(visibleTimeStart + scrollAmount, canvasTimeEnd - range), canvasTimeStart);
      const newEnd = Math.min(newStart + range, canvasTimeEnd);
      setVisibleTimeStart(newStart);
      setVisibleTimeEnd(newEnd);
      if (updateScrollCanvasRef.current) updateScrollCanvasRef.current(newStart, newEnd);
      return;
    }

    if (event.ctrlKey || event.metaKey) {
      event.preventDefault();
      const delta = event.deltaY > 0 ? -1 : 1;
      const center = (visibleTimeStart + visibleTimeEnd) / 2;
      const range = (visibleTimeEnd - visibleTimeStart) / 2;
      const zoomFactor = isTouchpad
        ? (delta > 0 ? 0.9 : 1.1)
        : (delta > 0 ? 0.4 : 2.5);
      const newRange = range * zoomFactor;
      const newZoomLevel = isTouchpad
        ? (delta > 0 ? Math.min(zoomLevel * 1.1, 25) : Math.max(zoomLevel / 1.1, 0.04))
        : (delta > 0 ? Math.min(zoomLevel * 2.5, 25) : Math.max(zoomLevel / 2.5, 0.04));

      if (delta < 0) {
        const maxRange = (canvasTimeEnd - canvasTimeStart) / 2;
        if (newRange > maxRange) return;
      }

      const newStart = Math.max(center - newRange, canvasTimeStart);
      const newEnd = Math.min(center + newRange, canvasTimeEnd);
      setZoomLevel(newZoomLevel);
      setVisibleTimeStart(newStart);
      setVisibleTimeEnd(newEnd);
      if (updateScrollCanvasRef.current) {
        updateScrollCanvasRef.current(newStart, newEnd);
        setTimeout(() => { if (updateScrollCanvasRef.current) updateScrollCanvasRef.current(newStart, newEnd); }, 50);
      }
      return;
    }

    if (isTouchpad && !event.ctrlKey && !event.metaKey) {
      setIsTouchpadScrolling(true);
      if (touchpadScrollTimeout) clearTimeout(touchpadScrollTimeout);
      const newTimeout = setTimeout(() => setIsTouchpadScrolling(false), 150);
      setTouchpadScrollTimeout(newTimeout);

      if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
        event.preventDefault();
        const range = visibleTimeEnd - visibleTimeStart;
        const scrollAmount = event.deltaX * range * 0.02;
        const newStart = Math.max(Math.min(visibleTimeStart + scrollAmount, canvasTimeEnd - range), canvasTimeStart);
        const newEnd = Math.min(newStart + range, canvasTimeEnd);
        setVisibleTimeStart(newStart);
        setVisibleTimeEnd(newEnd);
        if (updateScrollCanvasRef.current) updateScrollCanvasRef.current(newStart, newEnd);
      } else if (Math.abs(event.deltaY) > 5) {
        event.preventDefault();
        const delta = event.deltaY > 0 ? -1 : 1;
        const center = (visibleTimeStart + visibleTimeEnd) / 2;
        const range = (visibleTimeEnd - visibleTimeStart) / 2;
        const zoomFactor = delta > 0 ? 0.98 : 1.02;
        const newRange = range * zoomFactor;
        if (delta < 0) {
          const maxRange = (canvasTimeEnd - canvasTimeStart) / 2;
          if (newRange > maxRange) return;
        }
        const newStart = Math.max(center - newRange, canvasTimeStart);
        const newEnd = Math.min(center + newRange, canvasTimeEnd);
        const newZoomLevel = delta > 0 ? Math.min(zoomLevel * 1.02, 25) : Math.max(zoomLevel / 1.02, 0.04);
        setZoomLevel(newZoomLevel);
        setVisibleTimeStart(newStart);
        setVisibleTimeEnd(newEnd);
        if (updateScrollCanvasRef.current) updateScrollCanvasRef.current(newStart, newEnd);
      }
    }
  }, [visibleTimeStart, visibleTimeEnd, canvasTimeStart, canvasTimeEnd, zoomLevel, detectTouchpad, touchpadScrollTimeout, debouncedTooltipUpdate, hideTooltip, setVisibleTimeStart, setVisibleTimeEnd, setZoomLevel, updateScrollCanvasRef]);

  const handleScrollSync = useMemo(() =>
    debounce(() => {
      debouncedTooltipUpdate.cancel();
      hideTooltip();
      if (updateScrollCanvasRef.current) {
        requestAnimationFrame(() => {
          if (updateScrollCanvasRef.current) {
            updateScrollCanvasRef.current(visibleTimeStart, visibleTimeEnd);
          }
        });
      }
    }, 16),
    [visibleTimeStart, visibleTimeEnd, debouncedTooltipUpdate, hideTooltip, updateScrollCanvasRef]
  );

  const handleTouchStart = useCallback((event) => {
    if (event.touches.length === 2) {
      setIsPinching(true);
      setInitialPinchDistance(getTouchDistance(event.touches[0], event.touches[1]));
      event.preventDefault();
    } else if (event.touches.length === 1) {
      setTouchStart({ x: event.touches[0].clientX, y: event.touches[0].clientY, time: Date.now() });
    }
  }, []);

  const handleTouchMove = useCallback((event) => {
    if (event.touches.length === 2 && isPinching) {
      event.preventDefault();
      const distance = getTouchDistance(event.touches[0], event.touches[1]);
      const scale = distance / initialPinchDistance;
      if (Math.abs(scale - 1) > 0.05) {
        const center = (visibleTimeStart + visibleTimeEnd) / 2;
        const range = (visibleTimeEnd - visibleTimeStart) / 2;
        const newRange = range / scale;
        const maxRange = (canvasTimeEnd - canvasTimeStart) / 2;
        if (newRange > maxRange || newRange < 60000) return;
        const newStart = Math.max(center - newRange, canvasTimeStart);
        const newEnd = Math.min(center + newRange, canvasTimeEnd);
        setVisibleTimeStart(newStart);
        setVisibleTimeEnd(newEnd);
        setInitialPinchDistance(distance);
        if (updateScrollCanvasRef.current) updateScrollCanvasRef.current(newStart, newEnd);
      }
    } else if (event.touches.length === 1 && touchStart) {
      setTouchEnd({ x: event.touches[0].clientX, y: event.touches[0].clientY, time: Date.now() });
    }
  }, [isPinching, initialPinchDistance, touchStart, visibleTimeStart, visibleTimeEnd, canvasTimeStart, canvasTimeEnd, setVisibleTimeStart, setVisibleTimeEnd, updateScrollCanvasRef]);

  const handleTouchEnd = useCallback(() => {
    if (isPinching) {
      setIsPinching(false);
      setInitialPinchDistance(0);
    } else if (touchStart && touchEnd) {
      const deltaX = touchEnd.x - touchStart.x;
      const deltaTime = touchEnd.time - touchStart.time;
      if (deltaTime < 300 && Math.abs(deltaX) > 50) {
        const range = visibleTimeEnd - visibleTimeStart;
        const swipeAmount = -(deltaX / 300) * range;
        const newStart = Math.max(Math.min(visibleTimeStart + swipeAmount, canvasTimeEnd - range), canvasTimeStart);
        const newEnd = Math.min(newStart + range, canvasTimeEnd);
        setVisibleTimeStart(newStart);
        setVisibleTimeEnd(newEnd);
        if (updateScrollCanvasRef.current) updateScrollCanvasRef.current(newStart, newEnd);
      }
    }
    setTouchStart(null);
    setTouchEnd(null);
  }, [isPinching, touchStart, touchEnd, visibleTimeStart, visibleTimeEnd, canvasTimeStart, canvasTimeEnd, setVisibleTimeStart, setVisibleTimeEnd, updateScrollCanvasRef]);

  // Podłącz event listenery do elementu timeline
  useEffect(() => {
    const timelineElement = document.querySelector('.react-calendar-timeline');
    if (!timelineElement) return;

    timelineElement.addEventListener('wheel', handleWheel, { passive: false });
    timelineElement.addEventListener('touchstart', handleTouchStart, { passive: false });
    timelineElement.addEventListener('touchmove', handleTouchMove, { passive: false });
    timelineElement.addEventListener('touchend', handleTouchEnd, { passive: true });
    timelineElement.addEventListener('scroll', handleScrollSync, { passive: true });

    const mainCanvas = timelineElement.querySelector('.rct-canvas');
    if (mainCanvas) {
      mainCanvas.addEventListener('scroll', handleScrollSync, { passive: true });
    }

    return () => {
      timelineElement.removeEventListener('wheel', handleWheel);
      timelineElement.removeEventListener('touchstart', handleTouchStart);
      timelineElement.removeEventListener('touchmove', handleTouchMove);
      timelineElement.removeEventListener('touchend', handleTouchEnd);
      timelineElement.removeEventListener('scroll', handleScrollSync);
      const mc = timelineElement.querySelector('.rct-canvas');
      if (mc) mc.removeEventListener('scroll', handleScrollSync);
      if (touchpadScrollTimeout) clearTimeout(touchpadScrollTimeout);
    };
  }, [handleWheel, handleScrollSync, handleTouchStart, handleTouchMove, handleTouchEnd, touchpadScrollTimeout]);

  return {
    touchStart, touchEnd,
    isPinching, initialPinchDistance,
    isTouchpadScrolling,
    handleWheel, handleTouchStart, handleTouchMove, handleTouchEnd,
    handleScrollSync
  };
};
