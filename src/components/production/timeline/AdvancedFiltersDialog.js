import React from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, Grid, TextField, Typography, Box, Chip
} from '@mui/material';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker';
import { pl } from 'date-fns/locale';
import { format } from 'date-fns';
import { typographyBold, mb1, mb2, mt2, mr1 } from '../../../styles/muiCommonStyles';

const pt1 = { pt: 1 };

const AdvancedFiltersDialog = ({
  open, onClose, advancedFilters, onChange, onApply, onReset, themeMode, t
}) => (
  <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
    <DialogTitle>{t('production.timeline.advancedFilters.title')}</DialogTitle>
    <DialogContent>
      <Box sx={pt1}>
        <Grid container spacing={2}>
          <Grid item xs={12}>
            <TextField fullWidth label={t('production.timeline.advancedFilters.productName')}
              placeholder={t('timeline.advancedFilters.typeProductName')}
              value={advancedFilters.productName}
              onChange={(e) => onChange('productName', e.target.value)}
              variant="outlined" size="small"
            />
          </Grid>
          <Grid item xs={12}>
            <TextField fullWidth label={t('production.timeline.advancedFilters.moNumber')}
              placeholder={t('timeline.advancedFilters.typeMoNumber')}
              value={advancedFilters.moNumber}
              onChange={(e) => onChange('moNumber', e.target.value)}
              variant="outlined" size="small"
            />
          </Grid>
          <Grid item xs={12}>
            <TextField fullWidth label={t('production.timeline.advancedFilters.orderNumber')}
              placeholder={t('timeline.advancedFilters.typeOrderNumber')}
              value={advancedFilters.orderNumber}
              onChange={(e) => onChange('orderNumber', e.target.value)}
              variant="outlined" size="small"
            />
          </Grid>
          <Grid item xs={12}>
            <TextField fullWidth label={t('production.timeline.advancedFilters.poNumber')}
              placeholder={t('timeline.advancedFilters.typePoNumber')}
              value={advancedFilters.poNumber}
              onChange={(e) => onChange('poNumber', e.target.value)}
              variant="outlined" size="small"
            />
          </Grid>
          <Grid item xs={12}>
            <Typography variant="subtitle2" sx={{ ...mb1, ...mt2, ...typographyBold, color: 'primary.main' }}>
              Filtrowanie po zakresie dat:
            </Typography>
          </Grid>
          <Grid item xs={12} sm={6}>
            <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={pl}>
              <DateTimePicker
                label={t('production.timeline.advancedFilters.startDate')}
                value={advancedFilters.startDate}
                onChange={(newValue) => onChange('startDate', newValue)}
                slotProps={{ textField: { fullWidth: true, size: 'small', variant: 'outlined' } }}
              />
            </LocalizationProvider>
          </Grid>
          <Grid item xs={12} sm={6}>
            <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={pl}>
              <DateTimePicker
                label={t('production.timeline.advancedFilters.endDate')}
                value={advancedFilters.endDate}
                onChange={(newValue) => onChange('endDate', newValue)}
                slotProps={{ textField: { fullWidth: true, size: 'small', variant: 'outlined' } }}
              />
            </LocalizationProvider>
          </Grid>
        </Grid>

        {(advancedFilters.productName || advancedFilters.moNumber || advancedFilters.orderNumber || advancedFilters.poNumber || advancedFilters.startDate || advancedFilters.endDate) && (
          <Box sx={{
            mt: 2, p: 2,
            bgcolor: themeMode === 'dark' ? '#1e293b' : '#f5f5f5',
            borderRadius: 1,
            border: themeMode === 'dark' ? '1px solid rgba(255, 255, 255, 0.1)' : 'none'
          }}>
            <Typography variant="subtitle2" sx={{ ...mb1, ...typographyBold }}>
              Aktywne filtry:
            </Typography>
            {advancedFilters.productName && <Chip label={`Produkt: ${advancedFilters.productName}`} size="small" sx={{ ...mr1, ...mb1 }} />}
            {advancedFilters.moNumber && <Chip label={`MO: ${advancedFilters.moNumber}`} size="small" sx={{ ...mr1, ...mb1 }} />}
            {advancedFilters.orderNumber && <Chip label={`Zamówienie: ${advancedFilters.orderNumber}`} size="small" sx={{ ...mr1, ...mb1 }} />}
            {advancedFilters.poNumber && <Chip label={`PO: ${advancedFilters.poNumber}`} size="small" sx={{ ...mr1, ...mb1 }} />}
            {advancedFilters.startDate && (() => {
              try {
                const date = new Date(advancedFilters.startDate);
                if (isNaN(date.getTime())) return null;
                return <Chip label={`Od: ${format(date, 'dd.MM.yyyy', { locale: pl })}`} size="small" sx={{ ...mr1, ...mb1 }} color="primary" />;
              } catch { return null; }
            })()}
            {advancedFilters.endDate && (() => {
              try {
                const date = new Date(advancedFilters.endDate);
                if (isNaN(date.getTime())) return null;
                return <Chip label={`Do: ${format(date, 'dd.MM.yyyy', { locale: pl })}`} size="small" sx={{ ...mr1, ...mb1 }} color="primary" />;
              } catch { return null; }
            })()}
          </Box>
        )}
      </Box>
    </DialogContent>
    <DialogActions>
      <Button onClick={onReset} color="warning">{t('production.timeline.advancedFilters.clear')}</Button>
      <Button onClick={onClose}>{t('production.timeline.edit.cancel')}</Button>
      <Button onClick={onApply} variant="contained">{t('production.timeline.advancedFilters.apply')}</Button>
    </DialogActions>
  </Dialog>
);

export default AdvancedFiltersDialog;
