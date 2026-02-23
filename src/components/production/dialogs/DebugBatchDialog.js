import React, { memo } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  CircularProgress
} from '@mui/material';
import {
  BugReport as BugReportIcon,
  BuildCircle as BuildCircleIcon,
  Refresh as RefreshIcon
} from '@mui/icons-material';

const DebugBatchDialog = memo(({
  open,
  onClose,
  loading = false,
  results = [],
  onRepairBatch,
  onRepairAll,
  onRefresh
}) => {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <BugReportIcon color="warning" />
        Debug: Spójność partii w zadaniu
      </DialogTitle>
      <DialogContent dividers>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
            <CircularProgress />
          </Box>
        ) : (
          <Box sx={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>
            {results.map((result, idx) => (
              <Box
                key={idx}
                sx={{
                  mb: 1,
                  p: result.type === 'header' ? 1 : 0.5,
                  bgcolor: result.type === 'header' ? 'grey.100' : 'transparent',
                  borderLeft: result.type === 'error' ? '4px solid red' :
                             result.type === 'warning' ? '4px solid orange' :
                             result.type === 'success' ? '4px solid green' :
                             result.type === 'material' ? '4px solid blue' : 'none',
                  pl: result.type !== 'header' ? 2 : 1
                }}
              >
                <Typography
                  variant="body2"
                  sx={{
                    fontFamily: 'monospace',
                    fontWeight: result.type === 'header' || result.type === 'material' ? 'bold' : 'normal',
                    color: result.type === 'error' ? 'error.main' :
                           result.type === 'warning' ? 'warning.main' :
                           result.type === 'success' ? 'success.main' : 'text.primary'
                  }}
                >
                  {result.text}
                </Typography>
                {result.details && (
                  <Box sx={{ pl: 2, mt: 0.5 }}>
                    {Object.entries(result.details).map(([key, value]) => (
                      <Typography key={key} variant="caption" component="div" sx={{ fontFamily: 'monospace', color: 'text.secondary' }}>
                        <strong>{key}:</strong> {typeof value === 'object' ? JSON.stringify(value) : value}
                      </Typography>
                    ))}
                  </Box>
                )}
                {result.canRepair && result.repairData && (
                  <Box sx={{ mt: 1, pl: 2 }}>
                    <Button
                      variant="contained"
                      color="warning"
                      size="small"
                      startIcon={<BuildCircleIcon />}
                      onClick={() => onRepairBatch(result.repairData)}
                    >
                      Napraw powiązanie: {result.repairData.oldBatchId.substring(0, 8)}... → {result.repairData.newBatchId.substring(0, 8)}...
                    </Button>
                  </Box>
                )}
              </Box>
            ))}
            {results.length === 0 && (
              <Typography color="text.secondary">
                Kliknij przycisk debugowania żeby sprawdzić spójność partii
              </Typography>
            )}
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>
          Zamknij
        </Button>
        {results.some(r => r.canRepair && r.repairData) && (
          <Button
            onClick={onRepairAll}
            disabled={loading}
            variant="contained"
            color="warning"
            startIcon={<BuildCircleIcon />}
          >
            Napraw wszystkie ({results.filter(r => r.canRepair).length})
          </Button>
        )}
        <Button
          onClick={onRefresh}
          disabled={loading}
          startIcon={<RefreshIcon />}
        >
          Odśwież
        </Button>
      </DialogActions>
    </Dialog>
  );
});

DebugBatchDialog.displayName = 'DebugBatchDialog';

export default DebugBatchDialog;
