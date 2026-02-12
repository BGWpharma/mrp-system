// src/pages/WorkTime/WorkTimePage.js
import React, { useState, useEffect, useCallback } from 'react';
import {
  Container, Paper, Typography, TextField, Button, Box,
  Alert, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Chip, Divider, Fade, CircularProgress, InputAdornment, Grid
} from '@mui/material';
import { StaticTimePicker } from '@mui/x-date-pickers/StaticTimePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { pl } from 'date-fns/locale';
import { format, addMinutes, subMinutes } from 'date-fns';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import BadgeIcon from '@mui/icons-material/Badge';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import HistoryIcon from '@mui/icons-material/History';
import LoginIcon from '@mui/icons-material/Login';
import LogoutIcon from '@mui/icons-material/Logout';
import SaveIcon from '@mui/icons-material/Save';
import { useNotification } from '../../hooks/useNotification';
import { useAuth } from '../../contexts/AuthContext';
import { 
  getEmployeeByCode, 
  addWorkTimeEntry, 
  clockOut,
  getOpenEntry,
  getWorkTimeEntries,
} from '../../services/workTimeService';

// Margines walidacji: max ±30 minut od obecnej godziny
const TIME_MARGIN_MINUTES = 30;

const WorkTimePage = () => {
  const [step, setStep] = useState('login'); // 'login' | 'clocks' | 'success'
  const [employeeCode, setEmployeeCode] = useState('');
  const [employee, setEmployee] = useState(null);
  const [verifying, setVerifying] = useState(false);
  const [savingStart, setSavingStart] = useState(false);
  const [savingEnd, setSavingEnd] = useState(false);

  // Zaokrąglenie do najbliższego kwadransu (00/15/30/45)
  const roundToQuarter = (date) => {
    const d = new Date(date);
    const minutes = d.getMinutes();
    const rounded = Math.round(minutes / 15) * 15;
    d.setMinutes(rounded, 0, 0);
    return d;
  };

  // Zegary
  const [startTime, setStartTime] = useState(() => roundToQuarter(new Date()));
  const [endTime, setEndTime] = useState(() => roundToQuarter(new Date()));
  const [startSaved, setStartSaved] = useState(false); // czy start został już zapisany

  // Otwarty wpis (rozpoczęta praca bez zakończenia)
  const [openEntry, setOpenEntry] = useState(null);
  const [checkingOpen, setCheckingOpen] = useState(false);

  // Historia
  const [history, setHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Walidacja - błędy
  const [startError, setStartError] = useState('');
  const [endError, setEndError] = useState('');

  const { showSuccess, showError } = useNotification();
  const { currentUser } = useAuth();

  const today = new Date();
  const formattedDate = format(today, 'EEEE, d MMMM yyyy', { locale: pl });

  // Granice czasu
  const now = new Date();
  const minStartTime = subMinutes(now, TIME_MARGIN_MINUTES);
  const maxEndTime = addMinutes(now, TIME_MARGIN_MINUTES);

  // Sprawdź otwarty wpis
  const checkOpenEntry = useCallback(async (empId) => {
    setCheckingOpen(true);
    try {
      const entry = await getOpenEntry(empId);
      setOpenEntry(entry);
      if (entry) {
        setStartSaved(true);
        // Ustaw startTime na zapisaną godzinę
        const [h, m] = entry.startTime.split(':').map(Number);
        const savedStart = new Date();
        savedStart.setHours(h, m, 0, 0);
        setStartTime(savedStart);
      }
    } catch (error) {
      console.error('Błąd sprawdzania otwartego wpisu:', error);
    } finally {
      setCheckingOpen(false);
    }
  }, []);

  // Weryfikacja ID pracownika
  const handleVerifyId = async () => {
    if (!employeeCode.trim()) {
      showError('Wpisz swoje ID pracownika');
      return;
    }
    setVerifying(true);
    try {
      const emp = await getEmployeeByCode(employeeCode.trim());
      if (emp) {
        setEmployee(emp);
        await checkOpenEntry(emp.employeeId);
        setStep('clocks');
      } else {
        showError('Nie znaleziono pracownika o podanym ID.');
      }
    } catch (error) {
      showError('Wystąpił błąd podczas weryfikacji.');
    } finally {
      setVerifying(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') handleVerifyId();
  };

  // Walidacja startu: max 30 min wstecz od teraz
  const validateStartTime = (time) => {
    if (!time || isNaN(time.getTime())) return 'Wybierz prawidłową godzinę';
    const nowCheck = new Date();
    const min = subMinutes(nowCheck, TIME_MARGIN_MINUTES);
    if (time < min) {
      return `Nie można ustawić godziny wcześniejszej niż ${format(min, 'HH:mm')} (max ${TIME_MARGIN_MINUTES} min wstecz)`;
    }
    // Start nie powinien być w przyszłości (z marginesem 5 min)
    const maxStart = addMinutes(nowCheck, 5);
    if (time > maxStart) {
      return 'Godzina rozpoczęcia nie może być w przyszłości';
    }
    return '';
  };

  // Walidacja końca: max 30 min do przodu od teraz, musi być > start
  const validateEndTime = (time) => {
    if (!time || isNaN(time.getTime())) return 'Wybierz prawidłową godzinę';
    const nowCheck = new Date();
    const max = addMinutes(nowCheck, TIME_MARGIN_MINUTES);
    if (time > max) {
      return `Nie można ustawić godziny późniejszej niż ${format(max, 'HH:mm')} (max ${TIME_MARGIN_MINUTES} min do przodu)`;
    }
    // Sprawdź czy end > start
    const startRef = openEntry 
      ? (() => { const [h,m] = openEntry.startTime.split(':').map(Number); const d = new Date(); d.setHours(h,m,0,0); return d; })()
      : startTime;
    if (startRef && time <= startRef) {
      return `Godzina zakończenia musi być późniejsza niż rozpoczęcia (${format(startRef, 'HH:mm')})`;
    }
    return '';
  };

  // Zapisz start
  const handleSaveStart = async () => {
    const error = validateStartTime(startTime);
    if (error) { setStartError(error); showError(error); return; }

    setSavingStart(true);
    try {
      const formattedTime = format(startTime, 'HH:mm');
      await addWorkTimeEntry({
        employeeId: employee.employeeId,
        userId: employee.id,
        employeeName: employee.displayName,
        startTime: formattedTime,
        endTime: null,
      });
      showSuccess(`Rozpoczęto pracę o ${formattedTime}`);
      setStartSaved(true);
      await checkOpenEntry(employee.employeeId);
    } catch (error) {
      showError('Błąd zapisu. Spróbuj ponownie.');
    } finally {
      setSavingStart(false);
    }
  };

  // Zapisz koniec
  const handleSaveEnd = async () => {
    const error = validateEndTime(endTime);
    if (error) { setEndError(error); showError(error); return; }

    if (!openEntry) {
      showError('Najpierw zapisz godzinę rozpoczęcia pracy');
      return;
    }

    setSavingEnd(true);
    try {
      const formattedTime = format(endTime, 'HH:mm');
      await clockOut(openEntry.id, formattedTime, openEntry.startTime);
      showSuccess(`Zakończono pracę o ${formattedTime}`);
      setOpenEntry(null);
      setStep('success');
    } catch (error) {
      showError('Błąd zapisu. Spróbuj ponownie.');
    } finally {
      setSavingEnd(false);
    }
  };

  // Reset
  const handleReset = () => {
    setStep('login');
    setEmployeeCode('');
    setEmployee(null);
    setOpenEntry(null);
    setStartSaved(false);
    setStartTime(roundToQuarter(new Date()));
    setEndTime(roundToQuarter(new Date()));
    setStartError('');
    setEndError('');
    setShowHistory(false);
    setHistory([]);
  };

  const handleNewEntry = () => {
    setOpenEntry(null);
    setStartSaved(false);
    setStartTime(roundToQuarter(new Date()));
    setEndTime(roundToQuarter(new Date()));
    setStartError('');
    setEndError('');
    setStep('clocks');
    checkOpenEntry(employee.employeeId);
  };

  // Historia
  const handleShowHistory = async () => {
    if (showHistory) { setShowHistory(false); return; }
    setHistoryLoading(true);
    try {
      const n = new Date();
      const entries = await getWorkTimeEntries(employee.employeeId, n.getMonth(), n.getFullYear());
      setHistory(entries);
      setShowHistory(true);
    } catch (err) {
      showError('Błąd pobierania historii');
    } finally {
      setHistoryLoading(false);
    }
  };

  const formatEntryDate = (timestamp) => {
    if (!timestamp) return '-';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return format(date, 'd MMM yyyy', { locale: pl });
  };

  const getStatusChip = (status) => {
    const map = {
      in_progress: { label: 'W trakcie', color: 'warning' },
      submitted: { label: 'Zgłoszony', color: 'info' },
      approved: { label: 'Zatwierdzony', color: 'success' },
      rejected: { label: 'Odrzucony', color: 'error' },
    };
    const s = map[status] || { label: status, color: 'default' };
    return <Chip label={s.label} color={s.color} size="small" />;
  };

  return (
    <Container maxWidth={step === 'clocks' ? 'md' : 'sm'} sx={{ mt: 4, mb: 4 }}>

      {/* ==================== KROK 1: Logowanie ==================== */}
      {step === 'login' && (
        <Fade in={true}>
          <Paper elevation={3} sx={{ p: 4, borderRadius: 3, textAlign: 'center' }}>
            <Box sx={{ mb: 3 }}>
              <AccessTimeIcon sx={{ fontSize: 56, color: 'primary.main', mb: 1 }} />
              <Typography variant="h5" fontWeight="bold" gutterBottom>
                Rejestracja czasu pracy
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {formattedDate}
              </Typography>
            </Box>
            <Divider sx={{ mb: 3 }} />
            <Typography variant="body1" sx={{ mb: 2 }} color="text.secondary">
              Wpisz swoje ID pracownika
            </Typography>
            <TextField
              label="ID pracownika"
              value={employeeCode}
              onChange={(e) => setEmployeeCode(e.target.value.toUpperCase())}
              onKeyPress={handleKeyPress}
              fullWidth autoFocus
              placeholder="np. BGW-001"
              sx={{ mb: 3 }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <BadgeIcon color="action" />
                  </InputAdornment>
                ),
              }}
            />
            <Button 
              variant="contained" fullWidth size="large"
              onClick={handleVerifyId}
              disabled={verifying || !employeeCode.trim()}
              sx={{ py: 1.5, borderRadius: 2 }}
            >
              {verifying ? <CircularProgress size={24} color="inherit" /> : 'Dalej'}
            </Button>
          </Paper>
        </Fade>
      )}

      {/* ==================== KROK 2: Dwa zegary ==================== */}
      {step === 'clocks' && (
        <Fade in={true}>
          <Box>
            {/* Nagłówek */}
            <Paper elevation={3} sx={{ p: 3, borderRadius: 3, mb: 3, textAlign: 'center' }}>
              <Typography variant="h5" fontWeight="bold" gutterBottom>
                Rejestracja czasu pracy
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                {formattedDate}
              </Typography>
              <Alert severity="info" sx={{ borderRadius: 2, mt: 2 }} icon={<BadgeIcon />}>
                <Typography variant="body2">
                  <strong>{employee?.displayName}</strong> ({employee?.employeeId})
                </Typography>
              </Alert>
            </Paper>

            {checkingOpen ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
                <CircularProgress />
              </Box>
            ) : (
              <Grid container spacing={3}>
                {/* ======== ZEGAR START ======== */}
                <Grid item xs={12} md={6}>
                  <Paper 
                    elevation={3} 
                    sx={{ 
                      borderRadius: 3, overflow: 'hidden',
                      opacity: startSaved ? 0.7 : 1,
                      position: 'relative',
                    }}
                  >
                    {/* Nagłówek zegara */}
                    <Box sx={{ 
                      backgroundColor: 'success.main', color: '#fff', 
                      py: 1.5, px: 2, 
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1 
                    }}>
                      <LoginIcon />
                      <Typography variant="h6" fontWeight="bold">
                        Rozpoczęcie
                      </Typography>
                    </Box>

                    {/* Zapisany czas */}
                    {startSaved && openEntry && (
                      <Alert severity="success" sx={{ borderRadius: 0, py: 1 }}>
                        <Typography variant="body1" fontWeight="bold">
                          Zapisano: {openEntry.startTime}
                        </Typography>
                      </Alert>
                    )}

                    {/* Zegar tarczowy */}
                    {!startSaved && (
                      <>
                        <Box sx={{ display: 'flex', justifyContent: 'center', pt: 1 }}>
                          <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={pl}>
                            <StaticTimePicker
                              value={startTime}
                              onChange={(newTime) => {
                                if (newTime && !isNaN(newTime.getTime())) {
                                  setStartTime(newTime);
                                  setStartError('');
                                }
                              }}
                              ampm={false}
                              minutesStep={15}
                              minTime={minStartTime}
                              slotProps={{
                                actionBar: { sx: { display: 'none' } },
                              }}
                            />
                          </LocalizationProvider>
                        </Box>

                        {startError && (
                          <Alert severity="error" sx={{ mx: 2, mb: 1, borderRadius: 2 }}>
                            <Typography variant="caption">{startError}</Typography>
                          </Alert>
                        )}

                        <Box sx={{ p: 2, pt: 0 }}>
                          <Button
                            variant="contained"
                            color="success"
                            fullWidth
                            size="large"
                            onClick={handleSaveStart}
                            disabled={savingStart}
                            startIcon={savingStart ? <CircularProgress size={20} color="inherit" /> : <SaveIcon />}
                            sx={{ py: 1.5, borderRadius: 2, fontWeight: 'bold' }}
                          >
                            {savingStart ? 'Zapisywanie...' : `Zapisz start — ${startTime && !isNaN(startTime.getTime()) ? format(startTime, 'HH:mm') : ''}`}
                          </Button>
                        </Box>
                      </>
                    )}
                  </Paper>
                </Grid>

                {/* ======== ZEGAR KONIEC ======== */}
                <Grid item xs={12} md={6}>
                  <Paper 
                    elevation={3} 
                    sx={{ 
                      borderRadius: 3, overflow: 'hidden',
                      opacity: !startSaved ? 0.5 : 1,
                      pointerEvents: !startSaved ? 'none' : 'auto',
                    }}
                  >
                    {/* Nagłówek zegara */}
                    <Box sx={{ 
                      backgroundColor: 'error.main', color: '#fff', 
                      py: 1.5, px: 2, 
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1 
                    }}>
                      <LogoutIcon />
                      <Typography variant="h6" fontWeight="bold">
                        Zakończenie
                      </Typography>
                    </Box>

                    {!startSaved && (
                      <Box sx={{ py: 6, textAlign: 'center' }}>
                        <Typography variant="body1" color="text.secondary">
                          Najpierw zapisz godzinę rozpoczęcia
                        </Typography>
                      </Box>
                    )}

                    {startSaved && (
                      <>
                        <Box sx={{ display: 'flex', justifyContent: 'center', pt: 1 }}>
                          <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={pl}>
                            <StaticTimePicker
                              value={endTime}
                              onChange={(newTime) => {
                                if (newTime && !isNaN(newTime.getTime())) {
                                  setEndTime(newTime);
                                  setEndError('');
                                }
                              }}
                              ampm={false}
                              minutesStep={15}
                              maxTime={maxEndTime}
                              slotProps={{
                                actionBar: { sx: { display: 'none' } },
                              }}
                            />
                          </LocalizationProvider>
                        </Box>

                        {endError && (
                          <Alert severity="error" sx={{ mx: 2, mb: 1, borderRadius: 2 }}>
                            <Typography variant="caption">{endError}</Typography>
                          </Alert>
                        )}

                        <Box sx={{ p: 2, pt: 0 }}>
                          <Button
                            variant="contained"
                            color="error"
                            fullWidth
                            size="large"
                            onClick={handleSaveEnd}
                            disabled={savingEnd}
                            startIcon={savingEnd ? <CircularProgress size={20} color="inherit" /> : <SaveIcon />}
                            sx={{ py: 1.5, borderRadius: 2, fontWeight: 'bold' }}
                          >
                            {savingEnd ? 'Zapisywanie...' : `Zapisz koniec — ${endTime && !isNaN(endTime.getTime()) ? format(endTime, 'HH:mm') : ''}`}
                          </Button>
                        </Box>
                      </>
                    )}
                  </Paper>
                </Grid>
              </Grid>
            )}

            {/* Dolne przyciski */}
            <Paper elevation={3} sx={{ p: 2, borderRadius: 3, mt: 3 }}>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button 
                  variant="text" fullWidth onClick={handleReset}
                  startIcon={<ArrowBackIcon />} sx={{ borderRadius: 2 }}
                >
                  Zmień pracownika
                </Button>
                <Button 
                  variant="text" fullWidth onClick={handleShowHistory}
                  startIcon={historyLoading ? <CircularProgress size={16} /> : <HistoryIcon />}
                  sx={{ borderRadius: 2 }}
                >
                  {showHistory ? 'Ukryj historię' : 'Historia'}
                </Button>
              </Box>

              {showHistory && (
                <Fade in={true}>
                  <Box sx={{ mt: 2 }}>
                    <Divider sx={{ mb: 2 }} />
                    <Typography variant="subtitle2" gutterBottom color="text.secondary">
                      Historia tego miesiąca ({history.length} wpisów)
                    </Typography>
                    {history.length === 0 ? (
                      <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
                        Brak wpisów w tym miesiącu
                      </Typography>
                    ) : (
                      <TableContainer>
                        <Table size="small">
                          <TableHead>
                            <TableRow>
                              <TableCell>Data</TableCell>
                              <TableCell>Start</TableCell>
                              <TableCell>Koniec</TableCell>
                              <TableCell>Czas</TableCell>
                              <TableCell>Status</TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {history.map((entry) => (
                              <TableRow key={entry.id}>
                                <TableCell>{formatEntryDate(entry.date)}</TableCell>
                                <TableCell>{entry.startTime}</TableCell>
                                <TableCell>{entry.endTime || '—'}</TableCell>
                                <TableCell>{entry.totalHours ? `${entry.totalHours}h` : '—'}</TableCell>
                                <TableCell>{getStatusChip(entry.status)}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </TableContainer>
                    )}
                  </Box>
                </Fade>
              )}
            </Paper>
          </Box>
        </Fade>
      )}

      {/* ==================== KROK 3: Potwierdzenie ==================== */}
      {step === 'success' && (
        <Fade in={true}>
          <Paper elevation={3} sx={{ p: 4, borderRadius: 3, textAlign: 'center' }}>
            <CheckCircleOutlineIcon sx={{ fontSize: 64, color: 'success.main', mb: 2 }} />
            <Typography variant="h5" fontWeight="bold" gutterBottom>
              Zapisano!
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ mb: 1 }}>
              Czas pracy został zarejestrowany dla:
            </Typography>
            <Typography variant="h6" color="primary" sx={{ mb: 3 }}>
              {employee?.displayName}
            </Typography>
            <Box sx={{ display: 'flex', gap: 1.5 }}>
              <Button variant="contained" fullWidth onClick={handleNewEntry} sx={{ borderRadius: 2 }}>
                Powrót
              </Button>
              <Button variant="outlined" fullWidth onClick={handleReset} sx={{ borderRadius: 2 }}>
                Zmień pracownika
              </Button>
            </Box>
          </Paper>
        </Fade>
      )}
    </Container>
  );
};

export default WorkTimePage;
