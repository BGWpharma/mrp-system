import { useState, useMemo, useRef, useEffect } from 'react';

const debounce = (func, delay) => {
  let timeoutId;
  const debounced = function (...args) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func.apply(this, args), delay);
  };
  debounced.cancel = () => { clearTimeout(timeoutId); };
  return debounced;
};

export const useTimelineTooltip = ({ performanceMode = false }) => {
  const [tooltipData, setTooltipData] = useState(null);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const [poTooltipData, setPOTooltipData] = useState(null);
  const [poTooltipVisible, setPOTooltipVisible] = useState(false);

  const rafIdRef = useRef(null);

  const debouncedTooltipUpdate = useMemo(() =>
    debounce((e, task) => {
      setTooltipData(task);
      setTooltipPosition({
        x: e.clientX + 10,
        y: e.clientY - 10
      });
      setTooltipVisible(true);
    }, performanceMode ? 300 : 250),
    [performanceMode]
  );

  const hideTooltip = () => {
    debouncedTooltipUpdate.cancel();
    setTooltipVisible(false);
    setTooltipData(null);
  };

  const showPOTooltip = (reservation, e) => {
    setPOTooltipData(reservation);
    setTooltipPosition({ x: e.clientX + 10, y: e.clientY - 10 });
    setPOTooltipVisible(true);
  };

  const hidePOTooltip = () => {
    setPOTooltipVisible(false);
    setPOTooltipData(null);
  };

  // Globalny listener dla ruchu myszy — aktualizuje pozycję tooltipa i drag info
  useEffect(() => {
    const handleGlobalMouseMove = (e) => {
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = requestAnimationFrame(() => {
        if (tooltipVisible || poTooltipVisible) {
          setTooltipPosition({
            x: e.clientX + 10,
            y: e.clientY - 10
          });
        }
      });
    };

    if (tooltipVisible || poTooltipVisible) {
      document.addEventListener('mousemove', handleGlobalMouseMove);
      return () => {
        document.removeEventListener('mousemove', handleGlobalMouseMove);
        if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
      };
    }
  }, [tooltipVisible, poTooltipVisible]);

  return {
    tooltipData, tooltipPosition, tooltipVisible,
    poTooltipData, poTooltipVisible,
    debouncedTooltipUpdate,
    hideTooltip, showPOTooltip, hidePOTooltip,
    setTooltipPosition,
    rafIdRef
  };
};
