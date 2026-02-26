import React, { useState, useEffect } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, Box, Grid,
  CircularProgress, Typography, Alert
} from '@mui/material';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { TimePicker } from '@mui/x-date-pickers/TimePicker';
import { pl } from 'date-fns/locale';
import EditIcon from '@mui/icons-material/Edit';
import { updateWorkTimeEntry } from '../../services/workTimeService';

const WorkTimeEditDialog = ({ open, onClose, entry, adminUser, onSaved }) => {
  const [date, setDate] = useState(null);
  const [startTime, setStartTime] = useState(null);
  const [endTime, setEndTime] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (entry && open) {
      const entryDate = entry.date?.toDate ? entry.date.toDate() : new Date(entry.date);
      setDate(entryDate);

      if (entry.startTime) {
        const [h, m] = entry.startTime.split(':').map(Number);
        const d = new Date();
        d.setHours(h, m, 0, 0);
        setStartTime(d);
      } else {
        setStartTime(null);
      }

      if (entry.endTime) {
        const [h, m] = entry.endTime.split(':').map(Number);
        const d = new Date();
        d.setHours(h, m, 0, 0);
        setEndTime(d);
      } else {
        setEndTime(null);
      }

      setError('');
    }
  }, [entry, open]);

  const formatTime = (d) => {
    if (!d || isNaN(d.getTime())) return null;
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  const handleSave = async () => {
    const startStr = formatTime(startTime);
    const endStr = formatTime(endTime);

    if (!startStr) {
      setError('Godzina rozpoczęcia jest wymagana');
      return;
    }
    if (endStr && startStr >= endStr) {
      setError('Godzina zakończenia musi być późniejsza niż rozpoczęcia');
      return;
    }

    setSaving(true);
    setError('');
    try {
      await updateWorkTimeEntry(
        entry.id,
        {
          startTime: startStr,
          endTime: endStr,
          date,
          status: endStr ? 'approved' : 'in_progress',
        },
        adminUser.uid,
        adminUser.displayName || adminUser.email
      );
      onSaved?.();
      onClose();
    } catch (err) {
      setError(err.message || 'Błąd podczas zapisywania zmian');
    } finally {
      setSaving(false);
    }
  };

  if (!entry) return null;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <EditIcon color="primary" />
          Edytuj wpis czasu pracy
        </Box>
      </DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2, mt: 1 }}>
          Pracownik: <strong>{entry.employeeName}</strong> ({entry.employeeId})
        </Typography>

        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={pl}>
          <Grid container spacing={2.5}>
            <Grid item xs={12}>
              <DatePicker
                label="Data"
                value={date}
                onChange={setDate}
                slotProps={{ textField: { fullWidth: true } }}
              />
            </Grid>
            <Grid item xs={6}>
              <TimePicker
                label="Godzina rozpoczęcia"
                value={startTime}
                onChange={setStartTime}
                ampm={false}
                minutesStep={5}
                slotProps={{ textField: { fullWidth: true } }}
              />
            </Grid>
            <Grid item xs={6}>
              <TimePicker
                label="Godzina zakończenia"
                value={endTime}
                onChange={setEndTime}
                ampm={false}
                minutesStep={5}
                slotProps={{ textField: { fullWidth: true } }}
              />
            </Grid>
          </Grid>
        </LocalizationProvider>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>Anuluj</Button>
        <Button
          onClick={handleSave}
          variant="contained"
          disabled={saving}
          startIcon={saving ? <CircularProgress size={20} color="inherit" /> : <EditIcon />}
        >
          {saving ? 'Zapisywanie...' : 'Zapisz zmiany'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default WorkTimeEditDialog;
