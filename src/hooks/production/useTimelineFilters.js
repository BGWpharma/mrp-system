import { useState, useCallback } from 'react';

export const useTimelineFilters = ({ enrichTasksWithPO, tasksEnrichedWithPO, enrichmentInProgress, tasksLength }) => {
  const [groupBy, setGroupBy] = useState('workstation');
  const [selectedWorkstations, setSelectedWorkstations] = useState({});
  const [selectedCustomers, setSelectedCustomers] = useState({});
  const [filterMenuAnchor, setFilterMenuAnchor] = useState(null);
  const [advancedFilterDialog, setAdvancedFilterDialog] = useState(false);
  const [advancedFilters, setAdvancedFilters] = useState({
    productName: '',
    moNumber: '',
    orderNumber: '',
    poNumber: '',
    startDate: null,
    endDate: null
  });

  const handleFilterMenuClick = useCallback((event) => {
    setFilterMenuAnchor(event.currentTarget);
    if (!tasksEnrichedWithPO && !enrichmentInProgress && tasksLength > 0) {
      enrichTasksWithPO();
    }
  }, [tasksEnrichedWithPO, enrichmentInProgress, tasksLength, enrichTasksWithPO]);

  const handleFilterMenuClose = useCallback(() => {
    setFilterMenuAnchor(null);
  }, []);

  const handleAdvancedFilterOpen = useCallback(() => {
    setAdvancedFilterDialog(true);
    setFilterMenuAnchor(null);
  }, []);

  const handleAdvancedFilterClose = useCallback(() => {
    setAdvancedFilterDialog(false);
  }, []);

  const handleAdvancedFilterChange = useCallback((field, value) => {
    if ((field === 'startDate' || field === 'endDate') && value !== null) {
      try {
        const testDate = new Date(value);
        if (isNaN(testDate.getTime())) return;
      } catch { return; }
    }
    if (field === 'poNumber' && value && !tasksEnrichedWithPO && !enrichmentInProgress) {
      enrichTasksWithPO();
    }
    setAdvancedFilters(prev => ({ ...prev, [field]: value }));
  }, [tasksEnrichedWithPO, enrichmentInProgress, enrichTasksWithPO]);

  const handleAdvancedFilterApply = useCallback(() => {
    setAdvancedFilterDialog(false);
  }, []);

  const handleAdvancedFilterReset = useCallback(() => {
    setAdvancedFilters({
      productName: '',
      moNumber: '',
      orderNumber: '',
      poNumber: '',
      startDate: null,
      endDate: null
    });
  }, []);

  const hasActiveAdvancedFilters = !!(
    advancedFilters.productName || advancedFilters.moNumber ||
    advancedFilters.orderNumber || advancedFilters.poNumber
  );

  return {
    groupBy, setGroupBy,
    selectedWorkstations, setSelectedWorkstations,
    selectedCustomers, setSelectedCustomers,
    filterMenuAnchor,
    advancedFilterDialog,
    advancedFilters,
    hasActiveAdvancedFilters,
    handleFilterMenuClick, handleFilterMenuClose,
    handleAdvancedFilterOpen, handleAdvancedFilterClose,
    handleAdvancedFilterChange, handleAdvancedFilterApply, handleAdvancedFilterReset
  };
};
