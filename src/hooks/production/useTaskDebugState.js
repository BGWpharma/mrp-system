import { useState } from 'react';

export const useTaskDebugState = () => {
  const [debugBatchDialogOpen, setDebugBatchDialogOpen] = useState(false);
  const [debugResults, setDebugResults] = useState([]);
  const [debugLoading, setDebugLoading] = useState(false);

  return {
    debugBatchDialogOpen,
    debugResults,
    debugLoading,
    setDebugBatchDialogOpen,
    setDebugResults,
    setDebugLoading,
  };
};
