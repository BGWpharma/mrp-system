// src/pages/Schedule/SchedulePage.js
import React, { useState, useEffect, useCallback } from 'react';
import {
  Container, Paper, Typography, TextField, Button, Box,
  Alert, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Chip, IconButton, Tabs, Tab, Fade, CircularProgress,
  InputAdornment, MenuItem, Select, FormControl, InputLabel, Grid,
  Tooltip, Dialog, DialogTitle, DialogContent, DialogActions, Stack
} from '@mui/material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { pl } from 'date-fns/locale';
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval,
  isWeekend, isSameDay, getDay, addDays
} from 'date-fns';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import BadgeIcon from '@mui/icons-material/Badge';
import AddIcon from '@mui/icons-material/Add';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import CloseIcon from '@mui/icons-material/Close';
import BeachAccessIcon from '@mui/icons-material/BeachAccess';
import LocalHospitalIcon from '@mui/icons-material/LocalHospital';
import EventBusyIcon from '@mui/icons-material/EventBusy';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import MoreHorizIcon from '@mui/icons-material/MoreHoriz';
import MoneyOffIcon from '@mui/icons-material/MoneyOff';
import EditCalendarIcon from '@mui/icons-material/EditCalendar';
import SendIcon from '@mui/icons-material/Send';
import SaveIcon from '@mui/icons-material/Save';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { useNotification } from '../../hooks/useNotification';
import { useTranslation } from '../../hooks/useTranslation';
import { useAuth } from '../../contexts/AuthContext';
import { getEmployeeByCode } from '../../services/workTimeService';
import { getAllActiveUsers } from '../../services/userService';
import {
  REQUEST_TYPES, REQUEST_TYPE_LABELS,
  addScheduleRequest, getRequestsByMonth, getRequestsByDateRange, deleteScheduleRequest,
} from '../../services/scheduleService';
import {
  SHIFT_PRESETS, SHIFT_TYPES,
  getShiftsForWeek, getShiftsByDateRange, saveShiftsBatch, deleteShift,
  getShiftTemplates, addShiftTemplate, deleteShiftTemplate, getMonday
} from '../../services/shiftService';

// Ikony i kolory typów wniosków
const TYPE_ICONS = {
  [REQUEST_TYPES.VACATION]: <BeachAccessIcon fontSize="small" />,
  [REQUEST_TYPES.SICK_LEAVE]: <LocalHospitalIcon fontSize="small" />,
  [REQUEST_TYPES.DAY_OFF]: <EventBusyIcon fontSize="small" />,
  [REQUEST_TYPES.UNPAID_LEAVE]: <MoneyOffIcon fontSize="small" />,
  [REQUEST_TYPES.SCHEDULE_CHANGE]: <SwapHorizIcon fontSize="small" />,
  [REQUEST_TYPES.OTHER]: <MoreHorizIcon fontSize="small" />,
};

const TYPE_COLORS = {
  [REQUEST_TYPES.VACATION]: '#4caf50',
  [REQUEST_TYPES.SICK_LEAVE]: '#f44336',
  [REQUEST_TYPES.DAY_OFF]: '#ff9800',
  [REQUEST_TYPES.UNPAID_LEAVE]: '#9e9e9e',
  [REQUEST_TYPES.SCHEDULE_CHANGE]: '#2196f3',
  [REQUEST_TYPES.OTHER]: '#795548',
};

// ============================================================
// Komponent
// ============================================================
const SchedulePage = () => {
  const [activeTab, setActiveTab] = useState(0);

  // ---- Grafik (kalendarz miesięczny) ----
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [monthShifts, setMonthShifts] = useState([]);
  const [monthRequests, setMonthRequests] = useState([]);
  const [calendarLoading, setCalendarLoading] = useState(false);

  // ---- Złóż wniosek ----
  const [employeeCode, setEmployeeCode] = useState('');
  const [newRequest, setNewRequest] = useState({
    type: REQUEST_TYPES.VACATION, startDate: null, endDate: null, reason: '',
  });
  const [submitting, setSubmitting] = useState(false);

  // ---- Utwórz grafik (admin) ----
  const [weekStart, setWeekStart] = useState(getMonday(new Date()));
  const [employees, setEmployees] = useState([]);
  const [weekShifts, setWeekShifts] = useState({}); // key: `YYYY-MM-DD_empId` → { shiftType, startTime, endTime, color }
  const [originalShiftKeys, setOriginalShiftKeys] = useState(new Set()); // klucze załadowane z bazy — do wykrycia usunięć
  const [weekRequests, setWeekRequests] = useState([]); // wnioski na dany tydzień
  const [templates, setTemplates] = useState([]);
  const [editorLoading, setEditorLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState(SHIFT_TYPES.MORNING);
  // Dialog szablonu
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [newTemplate, setNewTemplate] = useState({ name: '', startTime: '08:00', endTime: '16:00', color: '#4caf50' });

  const { showSuccess, showError } = useNotification();
  const { t } = useTranslation('schedule');
  const { currentUser } = useAuth();
  const isAdmin = currentUser?.role === 'administrator';

  // ===================== LOAD DATA =====================

  // Grafik: ładuj zmiany + wnioski na miesiąc
  useEffect(() => { loadCalendarData(); }, [currentMonth]);

  // Admin: editor grafiku
  useEffect(() => {
    if (activeTab === 2 && isAdmin) loadEditorData();
  }, [activeTab, weekStart, isAdmin]);

  const loadCalendarData = useCallback(async () => {
    setCalendarLoading(true);
    try {
      const start = startOfMonth(currentMonth);
      const end = endOfMonth(currentMonth);
      const [shiftsData, reqsData] = await Promise.all([
        getShiftsByDateRange(start, end),
        getRequestsByMonth(currentMonth.getMonth(), currentMonth.getFullYear()),
      ]);
      setMonthShifts(shiftsData);
      setMonthRequests(reqsData);
    } catch (error) {
      console.error('Błąd ładowania kalendarza:', error);
    } finally {
      setCalendarLoading(false);
    }
  }, [currentMonth]);

  const loadEditorData = useCallback(async () => {
    setEditorLoading(true);
    try {
      const weekEnd = addDays(weekStart, 6);
      const [emps, shifts, tmpls, reqs] = await Promise.all([
        getAllActiveUsers(),
        getShiftsForWeek(weekStart),
        getShiftTemplates(),
        getRequestsByDateRange(weekStart, weekEnd),
      ]);
      setWeekRequests(reqs);
      // Tylko pracownicy z employeeId
      setEmployees(emps.filter(e => e.employeeId));
      setTemplates(tmpls);

      // Mapuj zmiany
      const map = {};
      const keys = new Set();
      shifts.forEach(s => {
        const key = `${s.dateKey}_${s.employeeId}`;
        map[key] = {
          shiftType: s.shiftType,
          startTime: s.startTime,
          endTime: s.endTime,
          color: s.color,
        };
        keys.add(key);
      });
      setWeekShifts(map);
      setOriginalShiftKeys(keys);
    } catch (error) {
      console.error('Błąd ładowania edytora grafiku:', error);
    } finally {
      setEditorLoading(false);
    }
  }, [weekStart]);

  // ===================== NAWIGACJA =====================
  const handlePrevMonth = () => setCurrentMonth(p => new Date(p.getFullYear(), p.getMonth() - 1, 1));
  const handleNextMonth = () => setCurrentMonth(p => new Date(p.getFullYear(), p.getMonth() + 1, 1));
  const handlePrevWeek = () => setWeekStart(p => addDays(p, -7));
  const handleNextWeek = () => setWeekStart(p => addDays(p, 7));

  // ===================== WNIOSEK =====================
  const handleSubmitRequest = async () => {
    if (!employeeCode.trim()) { showError(t('requests.enterEmployeeId')); return; }
    if (!newRequest.startDate || !newRequest.endDate) { showError(t('requests.dateRequired')); return; }
    if (newRequest.endDate < newRequest.startDate) { showError(t('requests.dateError')); return; }

    setSubmitting(true);
    try {
      const emp = await getEmployeeByCode(employeeCode.trim());
      if (!emp) { showError(t('requests.notFound')); setSubmitting(false); return; }

      await addScheduleRequest({
        employeeId: emp.employeeId, userId: emp.id, employeeName: emp.displayName,
        type: newRequest.type, startDate: newRequest.startDate, endDate: newRequest.endDate,
        reason: newRequest.reason,
      });
      showSuccess(t('requests.successMessage', { name: emp.displayName }));
      setNewRequest({ type: REQUEST_TYPES.VACATION, startDate: null, endDate: null, reason: '' });
      setEmployeeCode('');
    } catch { showError(t('requests.submitError')); }
    finally { setSubmitting(false); }
  };

  // ===================== ADMIN: GRAFIK EDITOR =====================
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const fmtDateKey = (date) => {
    const d = new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  // Kliknięcie w komórkę — przypisuje aktualnie wybrany preset
  const handleCellClick = (date, emp) => {
    const key = `${fmtDateKey(date)}_${emp.employeeId}`;
    const preset = getActivePreset();
    setWeekShifts(prev => ({
      ...prev,
      [key]: {
        shiftType: preset.type,
        startTime: preset.start,
        endTime: preset.end,
        color: preset.color,
      }
    }));
  };

  // Usuń zmianę
  const handleCellClear = (date, emp) => {
    const key = `${fmtDateKey(date)}_${emp.employeeId}`;
    setWeekShifts(prev => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  // Kopiuj cały tydzień na następny
  const handleCopyWeek = () => {
    const nextWeekStart = addDays(weekStart, 7);
    const newShifts = { ...weekShifts };
    weekDays.forEach((day, idx) => {
      const nextDay = addDays(nextWeekStart, idx);
      employees.forEach(emp => {
        const srcKey = `${fmtDateKey(day)}_${emp.employeeId}`;
        const dstKey = `${fmtDateKey(nextDay)}_${emp.employeeId}`;
        if (weekShifts[srcKey]) {
          newShifts[dstKey] = { ...weekShifts[srcKey] };
        }
      });
    });
    setWeekShifts(newShifts);
    setWeekStart(nextWeekStart);
    showSuccess(t('shifts.copiedSuccess'));
  };

  // Zapis grafiku
  const handleSaveSchedule = async () => {
    setSaving(true);
    try {
      // 1. Zmiany do zapisania
      const shiftsToSave = [];
      const currentKeys = new Set();
      Object.entries(weekShifts).forEach(([key, val]) => {
        currentKeys.add(key);
        const [dateStr, ...empParts] = key.split('_');
        const empId = empParts.join('_');
        const emp = employees.find(e => e.employeeId === empId);
        if (!emp) return;
        shiftsToSave.push({
          date: new Date(dateStr),
          employeeId: empId,
          employeeName: emp.displayName || empId,
          shiftType: val.shiftType,
          startTime: val.startTime,
          endTime: val.endTime,
          color: val.color,
        });
      });

      // 2. Zmiany do usunięcia (były w oryginale, ale użytkownik je skasował)
      const keysToDelete = [...originalShiftKeys].filter(k => !currentKeys.has(k));

      if (shiftsToSave.length === 0 && keysToDelete.length === 0) {
        showError(t('shifts.noChanges'));
        setSaving(false);
        return;
      }

      // Zapisz nowe/zmienione
      if (shiftsToSave.length > 0) await saveShiftsBatch(shiftsToSave);
      // Usuń skasowane
      if (keysToDelete.length > 0) {
        await Promise.all(keysToDelete.map(key => deleteShift(key)));
      }

      const saved = shiftsToSave.length;
      const deleted = keysToDelete.length;
      showSuccess(deleted > 0 
        ? t('shifts.savedAndDeleted', { saved, deleted }) 
        : t('shifts.savedCount', { saved }));
      setOriginalShiftKeys(currentKeys);
      loadCalendarData();
    } catch { showError(t('shifts.saveError')); }
    finally { setSaving(false); }
  };

  // Aktywny preset (wbudowany lub szablon)
  const getActivePreset = () => {
    if (SHIFT_PRESETS[selectedPreset]) {
      const p = SHIFT_PRESETS[selectedPreset];
      return { type: selectedPreset, start: p.start, end: p.end, color: p.color, label: p.label };
    }
    const tmpl = templates.find(t => t.id === selectedPreset);
    if (tmpl) return { type: SHIFT_TYPES.CUSTOM, start: tmpl.startTime, end: tmpl.endTime, color: tmpl.color, label: tmpl.name };
    return { type: SHIFT_TYPES.MORNING, ...SHIFT_PRESETS[SHIFT_TYPES.MORNING] };
  };

  // Szablony
  const handleAddTemplate = async () => {
    if (!newTemplate.name.trim()) return;
    try {
      await addShiftTemplate(newTemplate);
      setNewTemplate({ name: '', startTime: '08:00', endTime: '16:00', color: '#4caf50' });
      setTemplateDialogOpen(false);
      const t = await getShiftTemplates();
      setTemplates(t);
      showSuccess(t('templates.addedSuccess'));
    } catch { showError(t('templates.addError')); }
  };

  const handleDeleteTemplate = async (id) => {
    try {
      await deleteShiftTemplate(id);
      setTemplates(prev => prev.filter(t => t.id !== id));
      if (selectedPreset === id) setSelectedPreset(SHIFT_TYPES.MORNING);
    } catch { showError(t('templates.deleteError')); }
  };

  // ===================== HELPERS =====================
  const fmtDate = (ts) => {
    if (!ts) return '-';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return format(d, 'd MMM yyyy', { locale: pl });
  };

  const countWorkDays = (s, e) => {
    if (!s || !e) return 0;
    try {
      return eachDayOfInterval({
        start: s.toDate ? s.toDate() : new Date(s),
        end: e.toDate ? e.toDate() : new Date(e),
      }).filter(d => !isWeekend(d)).length;
    } catch { return 0; }
  };

  const getShiftsForDay = (day) => {
    const dayKey = fmtDateKey(day);
    return monthShifts.filter(s => s.dateKey === dayKey);
  };

  const getRequestsForDay = (day) => {
    return monthRequests.filter(req => {
      const s = req.startDate?.toDate ? req.startDate.toDate() : new Date(req.startDate);
      const e = req.endDate?.toDate ? req.endDate.toDate() : new Date(req.endDate);
      return day >= new Date(new Date(s).setHours(0,0,0,0)) && day <= new Date(new Date(e).setHours(23,59,59,999));
    });
  };

  // Pobierz label dla zmiany w edytorze
  const getCellInfo = (date, emp) => {
    const key = `${fmtDateKey(date)}_${emp.employeeId}`;
    return weekShifts[key] || null;
  };

  // Pobierz wnioski pracownika na dany dzień (w edytorze)
  const getEmployeeRequestsForDay = (day, empId) => {
    return weekRequests.filter(req => {
      if (req.employeeId !== empId) return false;
      const s = req.startDate?.toDate ? req.startDate.toDate() : new Date(req.startDate);
      const e = req.endDate?.toDate ? req.endDate.toDate() : new Date(req.endDate);
      return day >= new Date(new Date(s).setHours(0,0,0,0)) && day <= new Date(new Date(e).setHours(23,59,59,999));
    });
  };

  // Usunięcie wniosku (z edytora grafiku)
  const handleDeleteRequest = async (requestId) => {
    try {
      await deleteScheduleRequest(requestId);
      setWeekRequests(prev => prev.filter(r => r.id !== requestId));
      showSuccess(t('requests.deleteSuccess'));
    } catch { showError(t('requests.deleteError')); }
  };

  // ===================== RENDER =====================
  return (
    <Container maxWidth="xl" sx={{ mt: 3, mb: 4 }}>
      <Paper elevation={3} sx={{ borderRadius: 3, overflow: 'hidden' }}>
        <Tabs
          value={activeTab}
          onChange={(_, v) => setActiveTab(v)}
          variant="scrollable"
          scrollButtons="auto"
          sx={{ borderBottom: 1, borderColor: 'divider', px: 2 }}
        >
          <Tab label={t('tabs.schedule')} icon={<CalendarMonthIcon />} iconPosition="start" />
          <Tab label={t('tabs.newRequest')} icon={<AddIcon />} iconPosition="start" />
          {isAdmin && <Tab label={t('tabs.createSchedule')} icon={<EditCalendarIcon />} iconPosition="start" />}
        </Tabs>

        <Box sx={{ p: { xs: 2, md: 3 } }}>

          {/* ═══════════ TAB 0: GRAFIK MIESIĘCZNY ═══════════ */}
          {activeTab === 0 && (
            <Fade in>
              <Box>
                {/* Nawigacja */}
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 2, gap: 2 }}>
                  <IconButton onClick={handlePrevMonth} size="large"><ArrowBackIcon /></IconButton>
                  <Typography variant="h5" fontWeight="bold" sx={{ minWidth: 260, textAlign: 'center', textTransform: 'capitalize' }}>
                    {format(currentMonth, 'LLLL yyyy', { locale: pl })}
                  </Typography>
                  <IconButton onClick={handleNextMonth} size="large"><ArrowForwardIcon /></IconButton>
                </Box>

                {/* Legenda zmian */}
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 1, justifyContent: 'center' }}>
                  {Object.entries(SHIFT_PRESETS).filter(([k]) => k !== SHIFT_TYPES.OFF).map(([key, val]) => (
                    <Chip key={key} label={val.label} size="small" sx={{ backgroundColor: val.color, color: '#fff', fontWeight: 600 }} />
                  ))}
                  <Chip label={t('calendar.off')} size="small" variant="outlined" sx={{ borderColor: '#9e9e9e' }} />
                </Box>
                {/* Legenda wniosków */}
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2, justifyContent: 'center' }}>
                  {Object.entries(REQUEST_TYPE_LABELS).map(([key, label]) => (
                    <Chip
                      key={key} icon={TYPE_ICONS[key]} label={label} size="small" variant="outlined"
                      sx={{ borderColor: TYPE_COLORS[key], '& .MuiChip-icon': { color: TYPE_COLORS[key] } }}
                    />
                  ))}
                </Box>

                {calendarLoading ? (
                  <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>
                ) : (
                  <TableContainer>
                    <Table sx={{ tableLayout: 'fixed' }}>
                      <TableHead>
                        <TableRow>
                          {[t('calendar.monday'), t('calendar.tuesday'), t('calendar.wednesday'), t('calendar.thursday'), t('calendar.friday'), t('calendar.saturday'), t('calendar.sunday')].map(d => (
                            <TableCell key={d} align="center" sx={{ fontWeight: 'bold', py: 1.5, fontSize: '0.85rem' }}>{d}</TableCell>
                          ))}
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {(() => {
                          const days = eachDayOfInterval({ start: startOfMonth(currentMonth), end: endOfMonth(currentMonth) });
                          const first = (getDay(days[0]) + 6) % 7;
                          const padded = [...Array(first).fill(null), ...days];
                          const weeks = [];
                          for (let i = 0; i < padded.length; i += 7) weeks.push(padded.slice(i, i + 7));
                          return weeks.map((week, wi) => (
                            <TableRow key={wi}>
                              {week.map((day, di) => {
                                if (!day) return <TableCell key={di} />;
                                const shifts = getShiftsForDay(day);
                                const reqs = getRequestsForDay(day);
                                const today = isSameDay(day, new Date());
                                const wknd = isWeekend(day);
                                return (
                                  <TableCell key={di} align="center" sx={{
                                    p: 0.75, verticalAlign: 'top', height: 110,
                                    border: '1px solid', borderColor: 'divider',
                                    backgroundColor: today ? 'primary.main' : wknd ? 'action.hover' : 'transparent',
                                    color: today ? '#fff' : 'inherit',
                                  }}>
                                    <Typography variant="body1" fontWeight={today ? 'bold' : 'normal'}
                                      color={today ? 'inherit' : wknd ? 'text.secondary' : 'text.primary'} sx={{ mb: 0.5 }}>
                                      {format(day, 'd')}
                                    </Typography>
                                    {/* Zmiany */}
                                    {shifts.map((s, i) => (
                                      <Box key={`s${i}`} sx={{
                                        backgroundColor: s.color || '#4caf50', color: '#fff',
                                        borderRadius: 1, px: 0.5, py: 0.25, mb: 0.5,
                                      }}>
                                        <Typography variant="caption" sx={{ fontSize: '0.75rem', fontWeight: 700, display: 'block', lineHeight: 1.2 }}>
                                          {(s.employeeName || '').split(' ')[0]}
                                        </Typography>
                                        <Typography variant="caption" sx={{ fontSize: '0.75rem', display: 'block', lineHeight: 1.2 }}>
                                          {s.startTime && s.endTime ? `${s.startTime}–${s.endTime}` : t('calendar.off')}
                                        </Typography>
                                      </Box>
                                    ))}
                                    {/* Wnioski */}
                                    {reqs.map((r, i) => (
                                      <Box key={`r${i}`} sx={{
                                        backgroundColor: TYPE_COLORS[r.type] || '#999', color: '#fff',
                                        borderRadius: 1, px: 0.5, py: 0.25, mb: 0.5,
                                        display: 'flex', alignItems: 'center', gap: 0.5,
                                      }}>
                                        {React.cloneElement(TYPE_ICONS[r.type] || <MoreHorizIcon fontSize="small" />, { sx: { fontSize: 14, color: '#fff' } })}
                                        <Typography variant="caption" sx={{ fontSize: '0.75rem', fontWeight: 600, lineHeight: 1.2 }}>
                                          {r.employeeName?.split(' ')[0] || '?'}
                                        </Typography>
                                      </Box>
                                    ))}
                                  </TableCell>
                                );
                              })}
                            </TableRow>
                          ));
                        })()}
                      </TableBody>
                    </Table>
                  </TableContainer>
                )}
              </Box>
            </Fade>
          )}

          {/* ═══════════ TAB 1: ZŁÓŻ WNIOSEK ═══════════ */}
          {activeTab === 1 && (
            <Fade in>
              <Box sx={{ maxWidth: 650, mx: 'auto' }}>
                <Typography variant="h6" gutterBottom>{t('requests.title')}</Typography>

                <TextField
                  label={t('requests.employeeId')} value={employeeCode} required
                  onChange={(e) => setEmployeeCode(e.target.value.toUpperCase())}
                  fullWidth placeholder={t('requests.employeeIdPlaceholder')} sx={{ mb: 2.5 }}
                  InputProps={{ startAdornment: <InputAdornment position="start"><BadgeIcon color="action" /></InputAdornment> }}
                />

                <FormControl fullWidth sx={{ mb: 2.5 }}>
                  <InputLabel>{t('requests.type')}</InputLabel>
                  <Select value={newRequest.type} label={t('requests.type')}
                    onChange={(e) => setNewRequest(p => ({ ...p, type: e.target.value }))}>
                    {Object.entries(REQUEST_TYPE_LABELS).map(([k, l]) => (
                      <MenuItem key={k} value={k}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>{TYPE_ICONS[k]} {l}</Box>
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>

                <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={pl}>
                  <Grid container spacing={2} sx={{ mb: 2.5 }}>
                    <Grid item xs={12} sm={6}>
                      <DatePicker label={t('requests.dateFrom')} value={newRequest.startDate}
                        onChange={(d) => setNewRequest(p => ({ ...p, startDate: d }))}
                        slotProps={{ textField: { fullWidth: true } }} />
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <DatePicker label={t('requests.dateTo')} value={newRequest.endDate}
                        onChange={(d) => setNewRequest(p => ({ ...p, endDate: d }))}
                        minDate={newRequest.startDate}
                        slotProps={{ textField: { fullWidth: true } }} />
                    </Grid>
                  </Grid>
                </LocalizationProvider>

                {newRequest.startDate && newRequest.endDate && (
                  <Alert severity="info" sx={{ mb: 2, borderRadius: 2 }}>
                    {t('requests.workDays', { count: countWorkDays(newRequest.startDate, newRequest.endDate) })}
                  </Alert>
                )}

                <TextField label={t('requests.reason')} value={newRequest.reason}
                  onChange={(e) => setNewRequest(p => ({ ...p, reason: e.target.value }))}
                  fullWidth multiline rows={2} sx={{ mb: 3 }} placeholder={t('requests.reasonPlaceholder')} />

                <Button variant="contained" fullWidth size="large"
                  onClick={handleSubmitRequest}
                  disabled={submitting || !employeeCode.trim() || !newRequest.startDate || !newRequest.endDate}
                  sx={{ py: 1.5, borderRadius: 2 }}
                  startIcon={submitting ? <CircularProgress size={20} color="inherit" /> : <SendIcon />}>
                  {submitting ? t('requests.submitting') : t('requests.submit')}
                </Button>
              </Box>
            </Fade>
          )}

          {/* ═══════════ TAB 2: UTWÓRZ GRAFIK (ADMIN) ═══════════ */}
          {activeTab === 2 && isAdmin && (
            <Fade in>
              <Box>
                {/* Toolbar */}
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2, mb: 2 }}>
                  {/* Nawigacja tygodnia */}
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <IconButton onClick={handlePrevWeek}><ArrowBackIcon /></IconButton>
                    <Typography variant="h6" fontWeight="bold" sx={{ minWidth: 240, textAlign: 'center' }}>
                      {format(weekStart, 'd MMM', { locale: pl })} – {format(addDays(weekStart, 6), 'd MMM yyyy', { locale: pl })}
                    </Typography>
                    <IconButton onClick={handleNextWeek}><ArrowForwardIcon /></IconButton>
                  </Box>

                  {/* Akcje */}
                  <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                    <Button variant="outlined" size="small" startIcon={<ContentCopyIcon />}
                      onClick={handleCopyWeek} sx={{ borderRadius: 2 }}>
                      {t('shifts.copyNextWeek')}
                    </Button>
                    <Button variant="contained" size="small" startIcon={saving ? <CircularProgress size={18} color="inherit" /> : <SaveIcon />}
                      onClick={handleSaveSchedule} disabled={saving} sx={{ borderRadius: 2 }}>
                      {saving ? t('shifts.savingSchedule') : t('shifts.saveSchedule')}
                    </Button>
                  </Box>
                </Box>

                {/* Wybór zmiany / presetu */}
                <Paper variant="outlined" sx={{ p: 2, mb: 2, borderRadius: 2 }}>
                  <Typography variant="subtitle2" sx={{ mb: 1 }}>
                    {t('shifts.selectShift')}
                  </Typography>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center' }}>
                    {Object.entries(SHIFT_PRESETS).map(([key, val]) => (
                      <Chip key={key} label={`${val.label}${val.start ? ` (${val.start}–${val.end})` : ''}`}
                        onClick={() => setSelectedPreset(key)}
                        sx={{
                          backgroundColor: selectedPreset === key ? val.color : 'transparent',
                          color: selectedPreset === key ? '#fff' : 'text.primary',
                          border: `2px solid ${val.color}`,
                          fontWeight: selectedPreset === key ? 700 : 400,
                          cursor: 'pointer',
                          '&:hover': { backgroundColor: val.color, color: '#fff' },
                        }}
                      />
                    ))}
                    {templates.map(t => (
                      <Chip key={t.id}
                        label={`${t.name} (${t.startTime}–${t.endTime})`}
                        onClick={() => setSelectedPreset(t.id)}
                        onDelete={() => handleDeleteTemplate(t.id)}
                        sx={{
                          backgroundColor: selectedPreset === t.id ? t.color : 'transparent',
                          color: selectedPreset === t.id ? '#fff' : 'text.primary',
                          border: `2px solid ${t.color}`,
                          fontWeight: selectedPreset === t.id ? 700 : 400,
                          cursor: 'pointer',
                          '&:hover': { backgroundColor: t.color, color: '#fff' },
                        }}
                      />
                    ))}
                    <Chip label={t('shifts.addTemplate')} variant="outlined" onClick={() => setTemplateDialogOpen(true)}
                      sx={{ cursor: 'pointer', borderStyle: 'dashed' }} />
                  </Box>
                </Paper>

                {editorLoading ? (
                  <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>
                ) : employees.length === 0 ? (
                  <Alert severity="warning" sx={{ borderRadius: 2 }}>
                    {t('shifts.noEmployees')}
                  </Alert>
                ) : (
                  <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
                    <Table size="small" sx={{ tableLayout: 'fixed' }}>
                      <TableHead>
                        <TableRow>
                          <TableCell sx={{ fontWeight: 'bold', width: 160, position: 'sticky', left: 0, backgroundColor: 'background.paper', zIndex: 1 }}>
                            {t('shifts.employee')}
                          </TableCell>
                          {weekDays.map((d, i) => (
                            <TableCell key={i} align="center" sx={{
                              fontWeight: 'bold', py: 1,
                              backgroundColor: isSameDay(d, new Date()) ? 'primary.main' : isWeekend(d) ? 'action.hover' : 'transparent',
                              color: isSameDay(d, new Date()) ? '#fff' : 'text.primary',
                            }}>
                              <Typography variant="caption" display="block">{format(d, 'EEEE', { locale: pl })}</Typography>
                              <Typography variant="body2" fontWeight="bold">{format(d, 'd.MM')}</Typography>
                            </TableCell>
                          ))}
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {employees.map(emp => (
                          <TableRow key={emp.id} hover>
                            <TableCell sx={{ position: 'sticky', left: 0, backgroundColor: 'background.paper', zIndex: 1, borderRight: 1, borderColor: 'divider' }}>
                              <Typography variant="body2" fontWeight="bold" noWrap>{emp.displayName}</Typography>
                              <Typography variant="caption" color="text.secondary">{emp.employeeId}</Typography>
                            </TableCell>
                            {weekDays.map((day, di) => {
                              const info = getCellInfo(day, emp);
                              const dayReqs = getEmployeeRequestsForDay(day, emp.employeeId);
                              return (
                                <TableCell key={di} align="center" sx={{
                                  cursor: 'pointer', p: 0.5,
                                  transition: 'all 0.15s',
                                  '&:hover': { backgroundColor: 'action.hover' },
                                  backgroundColor: dayReqs.length > 0
                                    ? `${TYPE_COLORS[dayReqs[0].type] || '#999'}18`
                                    : info ? `${info.color}18` : 'transparent',
                                  border: '1px solid', borderColor: 'divider',
                                }}
                                  onClick={() => handleCellClick(day, emp)}
                                  onContextMenu={(e) => { e.preventDefault(); handleCellClear(day, emp); }}
                                >
                                  {/* Wnioski pracownika */}
                                  {dayReqs.map((r, ri) => (
                                    <Tooltip key={ri} title={`${REQUEST_TYPE_LABELS[r.type] || r.type}: ${fmtDate(r.startDate)} – ${fmtDate(r.endDate)} • kliknij ✕ aby usunąć`}>
                                      <Chip size="small"
                                        icon={React.cloneElement(TYPE_ICONS[r.type] || <MoreHorizIcon fontSize="small" />, { sx: { fontSize: 14, color: '#fff !important' } })}
                                        label={REQUEST_TYPE_LABELS[r.type]?.split(' ')[0] || r.type}
                                        onDelete={(e) => { e.stopPropagation(); handleDeleteRequest(r.id); }}
                                        sx={{
                                          backgroundColor: TYPE_COLORS[r.type] || '#999', color: '#fff',
                                          fontWeight: 600, fontSize: '0.65rem', height: 22, mb: 0.25,
                                          '& .MuiChip-icon': { color: '#fff' },
                                          '& .MuiChip-deleteIcon': { color: '#fff', fontSize: 16, '&:hover': { color: '#ffcdd2' } },
                                        }} />
                                    </Tooltip>
                                  ))}
                                  {/* Zmiana */}
                                  {info ? (
                                    <Tooltip title={t('shifts.rightClickToRemove')}>
                                      <Box>
                                        <Chip size="small" label={info.startTime && info.endTime ? `${info.startTime}–${info.endTime}` : t('calendar.off')}
                                          sx={{
                                            backgroundColor: info.color, color: '#fff',
                                            fontWeight: 600, fontSize: '0.7rem', height: 24,
                                          }} />
                                      </Box>
                                    </Tooltip>
                                  ) : dayReqs.length === 0 ? (
                                    <Typography variant="caption" color="text.disabled">—</Typography>
                                  ) : null}
                                </TableCell>
                              );
                            })}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                )}

                <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                  {t('shifts.cellHint')}
                </Typography>
              </Box>
            </Fade>
          )}

        </Box>
      </Paper>

      {/* ═══════════ DIALOG: NOWY SZABLON ZMIANY ═══════════ */}
      <Dialog open={templateDialogOpen} onClose={() => setTemplateDialogOpen(false)} maxWidth="xs" fullWidth
        PaperProps={{ sx: { borderRadius: 3 } }}>
        <DialogTitle>{t('templates.title')}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField label={t('templates.name')} value={newTemplate.name}
              onChange={(e) => setNewTemplate(p => ({ ...p, name: e.target.value }))}
              placeholder={t('templates.namePlaceholder')} fullWidth />
            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField label={t('templates.from')} type="time" value={newTemplate.startTime}
                onChange={(e) => setNewTemplate(p => ({ ...p, startTime: e.target.value }))}
                fullWidth InputLabelProps={{ shrink: true }} />
              <TextField label={t('templates.to')} type="time" value={newTemplate.endTime}
                onChange={(e) => setNewTemplate(p => ({ ...p, endTime: e.target.value }))}
                fullWidth InputLabelProps={{ shrink: true }} />
            </Box>
            <Box>
              <Typography variant="caption" gutterBottom display="block">{t('templates.color')}</Typography>
              <Box sx={{ display: 'flex', gap: 1 }}>
                {['#4caf50', '#2196f3', '#f44336', '#ff9800', '#9c27b0', '#795548', '#607d8b', '#e91e63'].map(c => (
                  <Box key={c} onClick={() => setNewTemplate(p => ({ ...p, color: c }))}
                    sx={{
                      width: 32, height: 32, borderRadius: '50%', backgroundColor: c, cursor: 'pointer',
                      border: newTemplate.color === c ? '3px solid #000' : '3px solid transparent',
                      '&:hover': { transform: 'scale(1.15)' }, transition: 'all 0.15s',
                    }} />
                ))}
              </Box>
            </Box>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setTemplateDialogOpen(false)} sx={{ borderRadius: 2 }}>{t('templates.cancel')}</Button>
          <Button variant="contained" onClick={handleAddTemplate} disabled={!newTemplate.name.trim()} sx={{ borderRadius: 2 }}>
            {t('templates.add')}
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default SchedulePage;
