import React, { memo } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, TextField, Box, Typography, CircularProgress
} from '@mui/material';
import SaveAltIcon from '@mui/icons-material/SaveAlt';
import { format } from 'date-fns';

const SaveToCrmDialog = memo(({
  open,
  onClose,
  onSave,
  name,
  onNameChange,
  notes,
  onNotesChange,
  saving = false,
  forecastData = [],
  startDate,
  endDate
}) => {
  return (
    <Dialog
      open={open}
      onClose={() => !saving && onClose()}
      maxWidth="sm"
      fullWidth
    >
      <DialogTitle>Zapisz prognozę do CRM</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Zapisz aktualną prognozę zapotrzebowania jako snapshot. Będzie dostępna w zakładce Stany → Prognozy zakupowe.
        </Typography>
        <TextField
          autoFocus
          label="Nazwa prognozy"
          fullWidth
          variant="outlined"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder={`Prognoza ${format(startDate, 'dd.MM')} - ${format(endDate, 'dd.MM.yyyy')}`}
          sx={{ mb: 2 }}
        />
        <TextField
          label="Notatki (opcjonalne)"
          fullWidth
          variant="outlined"
          multiline
          rows={3}
          value={notes}
          onChange={(e) => onNotesChange(e.target.value)}
          placeholder="Dodatkowe informacje do prognozy..."
        />
        <Box sx={{ mt: 2, p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
          <Typography variant="body2" color="text.secondary">
            Materiałów: <strong>{forecastData.length}</strong> |
            Z niedoborem: <strong style={{ color: '#d32f2f' }}>{forecastData.filter(i => i.balanceWithFutureDeliveries < 0).length}</strong> |
            Okres: <strong>{format(startDate, 'dd.MM.yyyy')} - {format(endDate, 'dd.MM.yyyy')}</strong>
          </Typography>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>
          Anuluj
        </Button>
        <Button
          onClick={onSave}
          variant="contained"
          color="success"
          disabled={saving}
          startIcon={saving ? <CircularProgress size={20} /> : <SaveAltIcon />}
        >
          {saving ? 'Zapisywanie...' : 'Zapisz'}
        </Button>
      </DialogActions>
    </Dialog>
  );
});

SaveToCrmDialog.displayName = 'SaveToCrmDialog';

export default SaveToCrmDialog;
