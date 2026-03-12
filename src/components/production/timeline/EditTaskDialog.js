import React from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, Grid } from '@mui/material';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker';
import { pl } from 'date-fns/locale';

const mt1 = { mt: 1 };

const EditTaskDialog = ({ open, onClose, editForm, onEditFormChange, onSave, t }) => (
  <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
    <DialogTitle>{t('production.timeline.edit.title')}</DialogTitle>
    <DialogContent>
      <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={pl}>
        <Grid container spacing={2} sx={mt1}>
          <Grid item xs={12}>
            <DateTimePicker
              label={t('production.timeline.edit.scheduledDate')}
              value={editForm.start}
              onChange={(newValue) => onEditFormChange(prev => ({ ...prev, start: newValue }))}
              slotProps={{ textField: { fullWidth: true } }}
            />
          </Grid>
          <Grid item xs={12}>
            <DateTimePicker
              label={t('production.timeline.edit.endDate')}
              value={editForm.end}
              onChange={(newValue) => onEditFormChange(prev => ({ ...prev, end: newValue }))}
              slotProps={{ textField: { fullWidth: true } }}
            />
          </Grid>
        </Grid>
      </LocalizationProvider>
    </DialogContent>
    <DialogActions>
      <Button onClick={onClose}>{t('production.timeline.edit.cancel')}</Button>
      <Button onClick={onSave} variant="contained">{t('production.timeline.edit.save')}</Button>
    </DialogActions>
  </Dialog>
);

export default EditTaskDialog;
