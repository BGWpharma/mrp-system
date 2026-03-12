import { useState, useCallback, useRef } from 'react';
import { getStatusMainColor } from '../../styles/colorConfig';
import { getPOReservationsForTask } from '../../services/purchaseOrders/poReservationService';

export const useTimelineSettings = ({ workstations, showError, t }) => {
  const [useWorkstationColors, setUseWorkstationColors] = useState(false);
  const [snapToPrevious, setSnapToPrevious] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [poDeliveryMode, setPODeliveryMode] = useState(false);
  const [focusedMOId, setFocusedMOId] = useState(null);
  const [focusedMOReservations, setFocusedMOReservations] = useState([]);
  const [loadingPOReservations, setLoadingPOReservations] = useState(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [mobileControlsExpanded, setMobileControlsExpanded] = useState({
    timeScale: false,
    zoom: false,
    display: false
  });

  const poRequestIdRef = useRef(0);

  const handleEditModeToggle = useCallback(() => {
    setEditMode(prev => !prev);
  }, []);

  const loadPOReservationsForMO = useCallback(async (taskId) => {
    const requestId = ++poRequestIdRef.current;
    setFocusedMOReservations([]);
    setLoadingPOReservations(true);
    try {
      const reservations = await getPOReservationsForTask(taskId);
      if (poRequestIdRef.current !== requestId) return;
      setFocusedMOReservations(reservations);
    } catch (error) {
      if (poRequestIdRef.current !== requestId) return;
      showError(t('production.timeline.poDeliveryLoadError'));
      setFocusedMOReservations([]);
    } finally {
      if (poRequestIdRef.current === requestId) {
        setLoadingPOReservations(false);
      }
    }
  }, [showError, t]);

  const getStatusColor = useCallback((status) => {
    switch (status) {
      case 'Zaplanowane': return '#6366f1';
      case 'W trakcie':   return '#f59e0b';
      case 'Zakończone':  return '#10b981';
      case 'Anulowane':   return '#ef4444';
      case 'Wstrzymane':  return '#64748b';
      default:            return getStatusMainColor(status);
    }
  }, []);

  const getWorkstationColor = useCallback((workstationId) => {
    const workstation = workstations.find(w => w.id === workstationId);
    if (workstation?.color) return workstation.color;
    const defaultColors = {
      'WCT00003': '#2196f3', 'WCT00006': '#4caf50', 'WCT00009': '#f50057',
      'WCT00012': '#ff9800', 'WCT00015': '#9c27b0'
    };
    return defaultColors[workstationId] || '#7986cb';
  }, [workstations]);

  const getItemColor = useCallback((task) => {
    if (useWorkstationColors && task.workstationId) {
      return getWorkstationColor(task.workstationId);
    }
    return getStatusColor(task.status);
  }, [useWorkstationColors, getWorkstationColor, getStatusColor]);

  return {
    useWorkstationColors, setUseWorkstationColors,
    snapToPrevious, setSnapToPrevious,
    editMode, setEditMode, handleEditModeToggle,
    poDeliveryMode, setPODeliveryMode,
    focusedMOId, setFocusedMOId,
    focusedMOReservations, setFocusedMOReservations,
    loadingPOReservations, loadPOReservationsForMO,
    mobileDrawerOpen, setMobileDrawerOpen,
    mobileControlsExpanded, setMobileControlsExpanded,
    getStatusColor, getWorkstationColor, getItemColor
  };
};
