import React, { useState } from 'react';
import {
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Tooltip,
  CircularProgress,
} from '@mui/material';
import { useTheme as useMuiTheme } from '@mui/material/styles';
import { getStatusKeyFromLabel, statusColors } from '../../styles/colorConfig';

const getChipColor = (statusLabel) => {
  const key = getStatusKeyFromLabel(statusLabel);
  return statusColors[key]?.main || statusColors.draft.main;
};

const StatusChip = ({
  status,
  label,
  editable = false,
  size = 'small',
  statusOptions = [],
  onStatusChange,
  dialogTitle,
  dialogDescription,
  loading: externalLoading = false,
  sx: sxOverride = {},
  ...rest
}) => {
  const theme = useMuiTheme();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState('');
  const [internalLoading, setInternalLoading] = useState(false);

  const isLoading = externalLoading || internalLoading;
  const chipColor = getChipColor(status);
  const isDark = theme.palette.mode === 'dark';

  const handleClick = (e) => {
    e.stopPropagation();
    if (!editable) return;
    setSelectedStatus(status);
    setDialogOpen(true);
  };

  const handleClose = () => {
    setDialogOpen(false);
    setSelectedStatus('');
  };

  const handleConfirm = async () => {
    if (!selectedStatus || selectedStatus === status) {
      handleClose();
      return;
    }
    if (onStatusChange) {
      setInternalLoading(true);
      try {
        await onStatusChange(selectedStatus);
      } finally {
        setInternalLoading(false);
      }
      handleClose();
    }
  };

  const chipSx = {
    bgcolor: chipColor,
    color: '#fff',
    fontWeight: 500,
    cursor: editable ? 'pointer' : 'default',
    transition: 'all 0.2s ease',
    '&:hover': editable ? {
      opacity: 0.88,
      boxShadow: `0 2px 8px ${isDark ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.15)'}`,
    } : {},
    ...sxOverride,
  };

  const displayLabel = label || status;

  const chip = (
    <Chip
      label={displayLabel}
      size={size}
      clickable={editable}
      onClick={editable ? handleClick : undefined}
      sx={chipSx}
      {...rest}
    />
  );

  return (
    <>
      {editable ? (
        <Tooltip title="Kliknij, aby zmienić status" arrow>
          {chip}
        </Tooltip>
      ) : chip}

      {editable && (
        <Dialog open={dialogOpen} onClose={handleClose} maxWidth="xs" fullWidth>
          <DialogTitle>{dialogTitle || 'Zmień status'}</DialogTitle>
          <DialogContent>
            {dialogDescription && (
              <DialogContentText sx={{ mb: 2 }}>{dialogDescription}</DialogContentText>
            )}
            <FormControl fullWidth sx={{ mt: 1 }}>
              <InputLabel>Status</InputLabel>
              <Select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                label="Status"
                disabled={isLoading}
              >
                {statusOptions.map((opt) => {
                  const optValue = typeof opt === 'string' ? opt : opt.value;
                  const optLabel = typeof opt === 'string' ? opt : (opt.label || opt.value);
                  const optColor = getChipColor(optValue);
                  return (
                    <MenuItem key={optValue} value={optValue}>
                      <Chip
                        label={optLabel}
                        size="small"
                        sx={{ bgcolor: optColor, color: '#fff', height: 24, fontSize: '0.75rem' }}
                      />
                    </MenuItem>
                  );
                })}
              </Select>
            </FormControl>
          </DialogContent>
          <DialogActions>
            <Button onClick={handleClose} disabled={isLoading}>Anuluj</Button>
            <Button
              color="primary"
              variant="contained"
              onClick={handleConfirm}
              disabled={isLoading || selectedStatus === status}
              startIcon={isLoading ? <CircularProgress size={16} color="inherit" /> : null}
            >
              {isLoading ? 'Zapisywanie...' : 'Zapisz'}
            </Button>
          </DialogActions>
        </Dialog>
      )}
    </>
  );
};

export default StatusChip;
