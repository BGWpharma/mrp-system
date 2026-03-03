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
  HistoryEdu as EditedIcon,
  FileDownload as DownloadIcon
} from '@mui/icons-material';
import { format, differenceInCalendarDays } from 'date-fns';
import { pl } from 'date-fns/locale';
import {
  getAllWorkTimeEntries,
  getWorkTimeEntries,
  deleteWorkTimeEntry
} from '../../services/production/workTimeService';
import { getRequestsByMonth, REQUEST_TYPE_LABELS } from '../../services/production/scheduleService';
import { exportToExcel, formatDateForExport } from '../../utils/exportUtils';
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
  const [generating, setGenerating] = useState(false);

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

  const handleGenerateReport = async () => {
    setGenerating(true);
    try {
      const scheduleRequests = await getRequestsByMonth(month, year);
      const filteredRequests = employeeFilter
        ? scheduleRequests.filter(r => r.employeeId === employeeFilter)
        : scheduleRequests;

      const monthName = format(new Date(year, month, 1), 'LLLL yyyy', { locale: pl });

      // Arkusz 1: Czas pracy
      const workTimeData = entries.map(entry => {
        const date = entry.date?.toDate ? entry.date.toDate() : new Date(entry.date);
        return {
          employeeName: entry.employeeName || '',
          employeeId: entry.employeeId || '',
          date: formatDateForExport(date),
          dayOfWeek: format(date, 'EEEE', { locale: pl }),
          startTime: entry.startTime || '—',
          endTime: entry.endTime || '—',
          totalHours: entry.totalHours != null ? Number(entry.totalHours.toFixed(2)) : 0,
          source: entry.manualEntry ? 'Ręczny' : entry.lastEditedBy ? 'Edytowany' : 'Automat',
        };
      });

      const workTimeHeaders = [
        { label: 'Pracownik', key: 'employeeName' },
        { label: 'ID', key: 'employeeId' },
        { label: 'Data', key: 'date' },
        { label: 'Dzień tygodnia', key: 'dayOfWeek' },
        { label: 'Start', key: 'startTime' },
        { label: 'Koniec', key: 'endTime' },
        { label: 'Godziny', key: 'totalHours' },
        { label: 'Źródło', key: 'source' },
      ];

      // Arkusz 2: Wnioski urlopowe
      const requestsData = filteredRequests.map(req => {
        const start = req.startDate?.toDate ? req.startDate.toDate() : new Date(req.startDate);
        const end = req.endDate?.toDate ? req.endDate.toDate() : new Date(req.endDate);
        const days = differenceInCalendarDays(end, start) + 1;
        return {
          employeeName: req.employeeName || '',
          employeeId: req.employeeId || '',
          type: REQUEST_TYPE_LABELS[req.type] || req.type,
          startDate: formatDateForExport(start),
          endDate: formatDateForExport(end),
          days,
          reason: req.reason || '',
          status: req.status === 'approved' ? 'Zatwierdzony'
            : req.status === 'rejected' ? 'Odrzucony' : 'Oczekujący',
        };
      });

      const requestsHeaders = [
        { label: 'Pracownik', key: 'employeeName' },
        { label: 'ID', key: 'employeeId' },
        { label: 'Typ', key: 'type' },
        { label: 'Data od', key: 'startDate' },
        { label: 'Data do', key: 'endDate' },
        { label: 'Dni', key: 'days' },
        { label: 'Powód', key: 'reason' },
        { label: 'Status', key: 'status' },
      ];

      // Arkusz 3: Podsumowanie per pracownik
      const employeeMap = {};

      entries.forEach(entry => {
        const key = entry.employeeId;
        if (!key) return;
        if (!employeeMap[key]) {
          employeeMap[key] = {
            employeeName: entry.employeeName || '',
            employeeId: key,
            totalHours: 0,
            workDays: 0,
            vacation: 0,
            sickLeave: 0,
            dayOff: 0,
            unpaidLeave: 0,
            other: 0,
          };
        }
        employeeMap[key].totalHours += entry.totalHours || 0;
        employeeMap[key].workDays += 1;
      });

      filteredRequests.forEach(req => {
        const key = req.employeeId;
        if (!key) return;
        if (!employeeMap[key]) {
          employeeMap[key] = {
            employeeName: req.employeeName || '',
            employeeId: key,
            totalHours: 0,
            workDays: 0,
            vacation: 0,
            sickLeave: 0,
            dayOff: 0,
            unpaidLeave: 0,
            other: 0,
          };
        }
        const start = req.startDate?.toDate ? req.startDate.toDate() : new Date(req.startDate);
        const end = req.endDate?.toDate ? req.endDate.toDate() : new Date(req.endDate);
        const days = differenceInCalendarDays(end, start) + 1;

        switch (req.type) {
          case 'vacation': employeeMap[key].vacation += days; break;
          case 'sick_leave': employeeMap[key].sickLeave += days; break;
          case 'day_off': employeeMap[key].dayOff += days; break;
          case 'unpaid_leave': employeeMap[key].unpaidLeave += days; break;
          default: employeeMap[key].other += days; break;
        }
      });

      const summaryData = Object.values(employeeMap).map(emp => ({
        ...emp,
        totalHours: Number(emp.totalHours.toFixed(1)),
      }));

      const summaryHeaders = [
        { label: 'Pracownik', key: 'employeeName' },
        { label: 'ID', key: 'employeeId' },
        { label: 'Przepracowane godziny', key: 'totalHours' },
        { label: 'Dni z wpisem', key: 'workDays' },
        { label: 'Urlop wypoczynkowy (dni)', key: 'vacation' },
        { label: 'Zwolnienie lekarskie (dni)', key: 'sickLeave' },
        { label: 'Dni wolne', key: 'dayOff' },
        { label: 'Urlop bezpłatny (dni)', key: 'unpaidLeave' },
        { label: 'Inne (dni)', key: 'other' },
      ];

      const worksheets = [
        { name: 'Czas pracy', data: workTimeData, headers: workTimeHeaders },
      ];

      if (requestsData.length > 0) {
        worksheets.push({ name: 'Wnioski urlopowe', data: requestsData, headers: requestsHeaders });
      }

      if (summaryData.length > 0) {
        worksheets.push({ name: 'Podsumowanie', data: summaryData, headers: summaryHeaders });
      }

      const fileName = `Raport_czas_pracy_${monthName.replace(' ', '_')}`;
      await exportToExcel(worksheets, fileName);
    } catch (error) {
      console.error('Błąd generowania raportu:', error);
    } finally {
      setGenerating(false);
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
            variant="outlined"
            color="secondary"
            startIcon={generating ? <CircularProgress size={18} color="inherit" /> : <DownloadIcon />}
            onClick={handleGenerateReport}
            disabled={loading || generating || entries.length === 0}
            size="small"
          >
            {generating ? 'Generowanie...' : 'Generuj raport'}
          </Button>
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
