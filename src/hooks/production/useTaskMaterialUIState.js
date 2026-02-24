import { useState } from 'react';

export const useTaskMaterialUIState = () => {
  const [materialTab, setMaterialTab] = useState(0);
  const [materialAwaitingOrders, setMaterialAwaitingOrders] = useState({});
  const [awaitingOrders, setAwaitingOrders] = useState({});
  const [awaitingOrdersLoading, setAwaitingOrdersLoading] = useState(false);
  const [materialBatchesLoading, setMaterialBatchesLoading] = useState(false);
  const [includeInCosts, setIncludeInCosts] = useState({});
  const [consumedBatchPrices, setConsumedBatchPrices] = useState({});
  const [consumedIncludeInCosts, setConsumedIncludeInCosts] = useState({});

  return {
    materialTab,
    materialAwaitingOrders,
    awaitingOrders,
    awaitingOrdersLoading,
    materialBatchesLoading,
    includeInCosts,
    consumedBatchPrices,
    consumedIncludeInCosts,
    setMaterialTab,
    setMaterialAwaitingOrders,
    setAwaitingOrders,
    setAwaitingOrdersLoading,
    setMaterialBatchesLoading,
    setIncludeInCosts,
    setConsumedBatchPrices,
    setConsumedIncludeInCosts,
  };
};
