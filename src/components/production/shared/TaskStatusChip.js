/**
 * Komponent TaskStatusChip - wyświetla chip statusu zadania z możliwością zmiany
 * Wzorowany na dialogu zmiany statusu w PurchaseOrderList
 */

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
  CircularProgress
} from '@mui/material';
import { useTranslation } from '../../../hooks/useTranslation';
import { PRODUCTION_TASK_STATUSES } from '../../../utils/constants';
import { updateTaskStatus } from '../../../services/productionService';
import { useAuth } from '../../../hooks/useAuth';
import { useNotification } from '../../../hooks/useNotification';

const TaskStatusChip = ({ 
  task, 
  getStatusColor, 
  onStatusChange,
  editable = true,
  size = 'small'
}) => {
  const { t } = useTranslation('taskDetails');
  const { currentUser } = useAuth();
  const { showSuccess, showError } = useNotification();
  
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [newStatus, setNewStatus] = useState('');
  const [loading, setLoading] = useState(false);

  if (!task?.status) return null;

  const handleStatusClick = (e) => {
    e.stopPropagation();
    if (!editable) return;
    setNewStatus(task.status);
    setStatusDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setStatusDialogOpen(false);
    setNewStatus('');
  };

  const handleStatusUpdate = async () => {
    if (!newStatus || newStatus === task.status) {
      handleCloseDialog();
      return;
    }

    setLoading(true);
    try {
      await updateTaskStatus(task.id, newStatus, currentUser?.uid);
      showSuccess(t('status.updateSuccess'));
      handleCloseDialog();
      
      // Wywołaj callback po zmianie statusu (np. odświeżenie danych)
      if (onStatusChange) {
        onStatusChange(newStatus);
      }
    } catch (error) {
      console.error('Błąd podczas aktualizacji statusu:', error);
      showError(t('status.updateError') + ': ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // Przygotuj opcje statusów
  const statusOptions = Object.entries(PRODUCTION_TASK_STATUSES).map(([key, value]) => ({
    key,
    value
  }));

  return (
    <>
      <Tooltip title={editable ? t('status.clickToChange') : ''} arrow>
        <Chip
          label={task.status}
          size={size}
          clickable={editable}
          onClick={handleStatusClick}
          sx={{
            ml: 1,
            backgroundColor: getStatusColor ? getStatusColor(task.status) : '#999',
            color: 'white',
            fontWeight: 500,
            cursor: editable ? 'pointer' : 'default',
            transition: 'all 0.2s ease-in-out',
            '&:hover': editable ? {
              opacity: 0.85,
              transform: 'scale(1.03)',
              boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
            } : {}
          }}
        />
      </Tooltip>

      {/* Dialog zmiany statusu */}
      <Dialog
        open={statusDialogOpen}
        onClose={handleCloseDialog}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>{t('status.changeTitle')}</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            {t('status.selectNewStatus')}
            <br />
            <strong>{task.name}</strong>
            {task.moNumber && (
              <span style={{ marginLeft: 8, opacity: 0.7 }}>
                ({task.moNumber})
              </span>
            )}
          </DialogContentText>
          <FormControl fullWidth sx={{ mt: 1 }}>
            <InputLabel id="task-status-label">{t('status.label')}</InputLabel>
            <Select
              labelId="task-status-label"
              value={newStatus}
              onChange={(e) => setNewStatus(e.target.value)}
              label={t('status.label')}
              disabled={loading}
            >
              {statusOptions.map(({ key, value }) => (
                <MenuItem 
                  key={key} 
                  value={value}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1
                  }}
                >
                  <Chip
                    label={value}
                    size="small"
                    sx={{
                      backgroundColor: getStatusColor ? getStatusColor(value) : '#999',
                      color: 'white',
                      height: 24,
                      fontSize: '0.75rem'
                    }}
                  />
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog} disabled={loading}>
            {t('common.cancel')}
          </Button>
          <Button 
            color="primary" 
            variant="contained"
            onClick={handleStatusUpdate}
            disabled={loading || newStatus === task.status}
            startIcon={loading ? <CircularProgress size={16} color="inherit" /> : null}
          >
            {loading ? t('common.updating') : t('common.update')}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default TaskStatusChip;

