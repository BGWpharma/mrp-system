import React, { useState, useEffect, useCallback } from 'react';
import {
  Paper, Typography, Box, Button, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Chip, IconButton, CircularProgress, Tooltip,
  FormControl, InputLabel, Select, MenuItem, Dialog, DialogTitle,
  DialogContent, DialogContentText, DialogActions, Grid, Alert
} from '@mui/material';
import {
  Edit as EditIcon,
  Delete as DeleteIcon,
  AddCircleOutline as AddIcon,
  Refresh as RefreshIcon,
  PersonAdd as ManualIcon,
  HistoryEdu as EditedIcon
} from '@mui/icons-material';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';
import {
  getAllWorkTimeEntries,
  getWorkTimeEntries,
  deleteWorkTimeEntry
} from '../../services/workTimeService';
import WorkTimeEditDialog from './WorkTimeEditDialog';
import WorkTimeAddDialog from './WorkTimeAddDialog';

const STATUS_MAP = {
  in_progress: { label: 'W trakcie', color: 'warning' },
  approved: { label: 'Zakończony', color: 'success' },
};

const WorkTimeAdminTab = ({ users, adminUser, filterEmployeeId = null }) => {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState(new Date().getMonth());
  const [year, setYear] = useState(new Date().getFullYear());
  const [employeeFilter, setEmployeeFilter] = useState(filterEmployeeId || '');

  const [editEntry, setEditEntry] = useState(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [entryToDelete, setEntryToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const employeeOptions = (users || []).filter((u) => u.employeeId);

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    try {
      let data;
      if (employeeFilter) {
        data = await getWorkTimeEntries(employeeFilter, month, year);
      } else {
        data = await getAllWorkTimeEntries(month, year);
      }
      setEntries(data);
    } catch (error) {
      console.error('Błąd pobierania wpisów:', error);
    } finally {
      setLoading(false);
    }
  }, [month, year, employeeFilter]);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  useEffect(() => {
    if (filterEmployeeId !== null && filterEmployeeId !== undefined) {
      setEmployeeFilter(filterEmployeeId);
    }
  }, [filterEmployeeId]);

  const formatEntryDate = (timestamp) => {
    if (!timestamp) return '—';
    const d = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return format(d, 'd MMM yyyy (EEEE)', { locale: pl });
  };

  const handleEdit = (entry) => {
    setEditEntry(entry);
    setEditDialogOpen(true);
  };

  const handleDeleteConfirm = (entry) => {
    setEntryToDelete(entry);
    setDeleteDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!entryToDelete) return;
    setDeleting(true);
    try {
      await deleteWorkTimeEntry(entryToDelete.id);
      setDeleteDialogOpen(false);
      setEntryToDelete(null);
      fetchEntries();
    } catch (error) {
      console.error('Błąd usuwania wpisu:', error);
    } finally {
      setDeleting(false);
    }
  };

  const months = Array.from({ length: 12 }, (_, i) => ({
    value: i,
    label: format(new Date(2024, i, 1), 'LLLL', { locale: pl }),
  }));

  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i);

  const totalHoursSum = entries.reduce((sum, e) => sum + (e.totalHours || 0), 0);

  return (
    <Paper sx={{ p: 2 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, flexWrap: 'wrap', gap: 1 }}>
        <Typography variant="h6">Czas pracy — wpisy</Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant="contained"
            color="success"
            startIcon={<AddIcon />}
            onClick={() => setAddDialogOpen(true)}
            size="small"
          >
            Dodaj wpis
          </Button>
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={fetchEntries}
            disabled={loading}
            size="small"
          >
            Odśwież
          </Button>
        </Box>
      </Box>

      {/* Filtry */}
      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid item xs={12} sm={4} md={3}>
          <FormControl fullWidth size="small">
            <InputLabel>Miesiąc</InputLabel>
            <Select value={month} label="Miesiąc" onChange={(e) => setMonth(e.target.value)}>
              {months.map((m) => (
                <MenuItem key={m.value} value={m.value} sx={{ textTransform: 'capitalize' }}>
                  {m.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Grid>
        <Grid item xs={12} sm={3} md={2}>
          <FormControl fullWidth size="small">
            <InputLabel>Rok</InputLabel>
            <Select value={year} label="Rok" onChange={(e) => setYear(e.target.value)}>
              {years.map((y) => (
                <MenuItem key={y} value={y}>{y}</MenuItem>
              ))}
            </Select>
          </FormControl>
        </Grid>
        {!filterEmployeeId && (
          <Grid item xs={12} sm={5} md={4}>
            <FormControl fullWidth size="small">
              <InputLabel>Pracownik</InputLabel>
              <Select
                value={employeeFilter}
                label="Pracownik"
                onChange={(e) => setEmployeeFilter(e.target.value)}
              >
                <MenuItem value="">Wszyscy pracownicy</MenuItem>
                {employeeOptions.map((u) => (
                  <MenuItem key={u.id} value={u.employeeId}>
                    {u.displayName || u.email} ({u.employeeId})
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
        )}
      </Grid>

      {/* Podsumowanie */}
      {!loading && entries.length > 0 && (
        <Alert severity="info" icon={false} sx={{ mb: 2 }}>
          Łącznie: <strong>{entries.length}</strong> wpisów, <strong>{totalHoursSum.toFixed(1)}h</strong> zarejestrowanych godzin
        </Alert>
      )}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress />
        </Box>
      ) : entries.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
          Brak wpisów w wybranym okresie
        </Typography>
      ) : (
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Pracownik</TableCell>
                <TableCell>Data</TableCell>
                <TableCell>Start</TableCell>
                <TableCell>Koniec</TableCell>
                <TableCell>Czas</TableCell>
                <TableCell>Źródło</TableCell>
                <TableCell align="right">Akcje</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {entries.map((entry) => (
                <TableRow key={entry.id} hover>
                  <TableCell>
                    <Typography variant="body2" fontWeight={500}>
                      {entry.employeeName}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {entry.employeeId}
                    </Typography>
                  </TableCell>
                  <TableCell>{formatEntryDate(entry.date)}</TableCell>
                  <TableCell>{entry.startTime || '—'}</TableCell>
                  <TableCell>{entry.endTime || '—'}</TableCell>
                  <TableCell>
                    {entry.totalHours != null ? `${entry.totalHours}h` : (
                      <Chip label={STATUS_MAP.in_progress.label} color="warning" size="small" />
                    )}
                  </TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', gap: 0.5 }}>
                      {entry.manualEntry && (
                        <Tooltip title={`Dodany ręcznie przez ${entry.manualEntryByName || 'admin'}`}>
                          <Chip
                            icon={<ManualIcon />}
                            label="Ręczny"
                            size="small"
                            variant="outlined"
                            color="warning"
                          />
                        </Tooltip>
                      )}
                      {entry.lastEditedBy && (
                        <Tooltip title={`Edytowany przez ${entry.lastEditedByName || 'admin'}`}>
                          <Chip
                            icon={<EditedIcon />}
                            label="Edytowany"
                            size="small"
                            variant="outlined"
                            color="secondary"
                          />
                        </Tooltip>
                      )}
                      {!entry.manualEntry && !entry.lastEditedBy && (
                        <Chip label="Automat" size="small" variant="outlined" />
                      )}
                    </Box>
                  </TableCell>
                  <TableCell align="right">
                    <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 0.25 }}>
                      <Tooltip title="Edytuj">
                        <IconButton size="small" color="primary" onClick={() => handleEdit(entry)}>
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Usuń">
                        <IconButton size="small" color="error" onClick={() => handleDeleteConfirm(entry)}>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Edit Dialog */}
      <WorkTimeEditDialog
        open={editDialogOpen}
        onClose={() => { setEditDialogOpen(false); setEditEntry(null); }}
        entry={editEntry}
        adminUser={adminUser}
        onSaved={fetchEntries}
      />

      {/* Add Dialog */}
      <WorkTimeAddDialog
        open={addDialogOpen}
        onClose={() => setAddDialogOpen(false)}
        users={users}
        adminUser={adminUser}
        onSaved={fetchEntries}
        preselectedUser={
          filterEmployeeId
            ? employeeOptions.find((u) => u.employeeId === filterEmployeeId) || null
            : null
        }
      />

      {/* Delete Confirm Dialog */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>Potwierdź usunięcie</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Czy na pewno chcesz usunąć wpis czasu pracy dla <strong>{entryToDelete?.employeeName}</strong> z dnia{' '}
            <strong>{entryToDelete ? formatEntryDate(entryToDelete.date) : ''}</strong>?
          </DialogContentText>
          <DialogContentText sx={{ mt: 1, color: 'error.main' }}>
            Ta operacja jest nieodwracalna.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)} disabled={deleting}>Anuluj</Button>
          <Button onClick={handleDelete} color="error" variant="contained" disabled={deleting}>
            {deleting ? <CircularProgress size={24} color="inherit" /> : 'Usuń'}
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
};

export default WorkTimeAdminTab;
