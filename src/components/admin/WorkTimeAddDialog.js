import React, { useState, useEffect } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, Box, Grid, FormControl, InputLabel, Select, MenuItem,
  CircularProgress, Typography, Alert, Autocomplete, TextField
} from '@mui/material';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { TimePicker } from '@mui/x-date-pickers/TimePicker';
import { pl } from 'date-fns/locale';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import { addWorkTimeEntryAdmin } from '../../services/workTimeService';

const WorkTimeAddDialog = ({ open, onClose, users, adminUser, onSaved, preselectedUser = null }) => {
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [date, setDate] = useState(new Date());
  const [startTime, setStartTime] = useState(null);
  const [endTime, setEndTime] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setDate(new Date());
      setStartTime(null);
      setEndTime(null);
      setError('');
      if (preselectedUser) {
        setSelectedEmployee(preselectedUser);
      } else {
        setSelectedEmployee(null);
      }
    }
  }, [open, preselectedUser]);

  const employeeOptions = (users || [])
    .filter((u) => u.employeeId)
    .map((u) => ({
      id: u.id,
      employeeId: u.employeeId,
      displayName: u.displayName || u.email || u.employeeId,
      label: `${u.displayName || u.email} (${u.employeeId})`,
    }));

  const formatTime = (d) => {
    if (!d || isNaN(d.getTime())) return null;
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  const handleSave = async () => {
    if (!selectedEmployee) {
      setError('Wybierz pracownika');
      return;
    }
    const startStr = formatTime(startTime);
    if (!startStr) {
      setError('Godzina rozpoczęcia jest wymagana');
      return;
    }
    const endStr = formatTime(endTime);
    if (endStr && startStr >= endStr) {
      setError('Godzina zakończenia musi być późniejsza niż rozpoczęcia');
      return;
    }
    if (!date) {
      setError('Data jest wymagana');
      return;
    }

    setSaving(true);
    setError('');
    try {
      await addWorkTimeEntryAdmin(
        {
          employeeId: selectedEmployee.employeeId,
          userId: selectedEmployee.id,
          employeeName: selectedEmployee.displayName,
          date,
          startTime: startStr,
          endTime: endStr,
        },
        adminUser.uid,
        adminUser.displayName || adminUser.email
      );
      onSaved?.();
      onClose();
    } catch (err) {
      setError(err.message || 'Błąd podczas dodawania wpisu');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <AddCircleOutlineIcon color="success" />
          Dodaj wpis czasu pracy
        </Box>
      </DialogTitle>
      <DialogContent>
        <Alert severity="info" sx={{ mb: 2, mt: 1 }}>
          Wpis zostanie oznaczony jako dodany ręcznie przez administratora.
        </Alert>

        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={pl}>
          <Grid container spacing={2.5}>
            <Grid item xs={12}>
              <Autocomplete
                value={selectedEmployee}
                onChange={(_, val) => setSelectedEmployee(val)}
                options={employeeOptions}
                getOptionLabel={(opt) => opt.label || ''}
                isOptionEqualToValue={(opt, val) => opt.id === val?.id}
                disabled={!!preselectedUser}
                renderInput={(params) => (
                  <TextField {...params} label="Pracownik" required />
                )}
              />
            </Grid>
            <Grid item xs={12}>
              <DatePicker
                label="Data"
                value={date}
                onChange={setDate}
                slotProps={{ textField: { fullWidth: true, required: true } }}
              />
            </Grid>
            <Grid item xs={6}>
              <TimePicker
                label="Godzina rozpoczęcia"
                value={startTime}
                onChange={setStartTime}
                ampm={false}
                minutesStep={5}
                slotProps={{ textField: { fullWidth: true, required: true } }}
              />
            </Grid>
            <Grid item xs={6}>
              <TimePicker
                label="Godzina zakończenia"
                value={endTime}
                onChange={setEndTime}
                ampm={false}
                minutesStep={5}
                slotProps={{ textField: { fullWidth: true, helperText: 'Opcjonalne' } }}
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
          color="success"
          disabled={saving}
          startIcon={saving ? <CircularProgress size={20} color="inherit" /> : <AddCircleOutlineIcon />}
        >
          {saving ? 'Dodawanie...' : 'Dodaj wpis'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default WorkTimeAddDialog;
