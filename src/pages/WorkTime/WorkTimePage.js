// src/pages/WorkTime/WorkTimePage.js
import React, { useState, useEffect, useCallback } from 'react';
import {
  Container, Paper, Typography, TextField, Button, Box,
  Alert, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Chip, Divider, Fade, Grow, CircularProgress, InputAdornment, Grid, Avatar,
  IconButton
} from '@mui/material';
import { StaticTimePicker } from '@mui/x-date-pickers/StaticTimePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { pl } from 'date-fns/locale';
import { format } from 'date-fns';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import BadgeIcon from '@mui/icons-material/Badge';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import HistoryIcon from '@mui/icons-material/History';
import LoginIcon from '@mui/icons-material/Login';
import LogoutIcon from '@mui/icons-material/Logout';
import SaveIcon from '@mui/icons-material/Save';
import FingerprintIcon from '@mui/icons-material/Fingerprint';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import CelebrationIcon from '@mui/icons-material/Celebration';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { useNotification } from '../../hooks/useNotification';
import { useTranslation } from '../../hooks/useTranslation';
import { useAuth } from '../../contexts/AuthContext';
import { 
  getEmployeeByCode, 
  addWorkTimeEntry, 
  clockOut,
  getOpenEntry,
  getWorkTimeEntries,
} from '../../services/production/workTimeService';

const getDeviceInfo = () => {
  const ua = navigator.userAgent;
  const isMobile = /Mobi|Android|iPhone|iPad/i.test(ua);
  return {
    type: isMobile ? 'mobile' : 'desktop',
    platform: navigator.platform || 'unknown',
    userAgent: ua,
    screenWidth: window.screen.width,
    screenHeight: window.screen.height,
    timestamp: new Date().toISOString()
  };
};

const WorkTimePage = () => {
  const [step, setStep] = useState('login'); // 'login' | 'clocks' | 'success'
  const [employeeCode, setEmployeeCode] = useState('');
  const [employee, setEmployee] = useState(null);
  const [verifying, setVerifying] = useState(false);
  const [savingStart, setSavingStart] = useState(false);
  const [savingEnd, setSavingEnd] = useState(false);

  const roundUp30 = (date) => {
    const d = new Date(date);
    const minutes = d.getMinutes();
    const rounded = Math.ceil(minutes / 30) * 30;
    d.setMinutes(rounded, 0, 0);
    return d;
  };

  const roundDown30 = (date) => {
    const d = new Date(date);
    const minutes = d.getMinutes();
    const rounded = Math.floor(minutes / 30) * 30;
    d.setMinutes(rounded, 0, 0);
    return d;
  };

  // Zegary — start zaokrąglony w górę, koniec w dół
  const [startTime, setStartTime] = useState(() => roundUp30(new Date()));
  const [endTime, setEndTime] = useState(() => roundDown30(new Date()));
  const [startSaved, setStartSaved] = useState(false); // czy start został już zapisany

  // Otwarty wpis (rozpoczęta praca bez zakończenia)
  const [openEntry, setOpenEntry] = useState(null);
  const [checkingOpen, setCheckingOpen] = useState(false);

  // Historia
  const [history, setHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyMonth, setHistoryMonth] = useState(new Date().getMonth());
  const [historyYear, setHistoryYear] = useState(new Date().getFullYear());

  // Walidacja - błędy
  const [startError, setStartError] = useState('');
  const [endError, setEndError] = useState('');

  const { showSuccess, showError } = useNotification();
  const { t } = useTranslation('workTime');
  const { currentUser } = useAuth();

  const today = new Date();
  const formattedDate = format(today, 'EEEE, d MMMM yyyy', { locale: pl });

  // Granice czasu
  // Start: nie wcześniej niż teraz (nie cofasz czasu)
  // Koniec: nie później niż teraz (nie kończysz w przyszłości), ale nie wcześniej niż start
  const now = new Date();
  const minStartTime = now;
  const maxEndTime = now;

  const minEndTime = (() => {
    if (openEntry) {
      const [h, m] = openEntry.startTime.split(':').map(Number);
      const d = new Date();
      d.setHours(h, m, 0, 0);
      return d;
    }
    return startTime;
  })();

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
      showError(t('enterEmployeeId'));
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
        showError(t('notFound'));
      }
    } catch (error) {
      showError(t('verifyError'));
    } finally {
      setVerifying(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') handleVerifyId();
  };

  // Walidacja startu: nie wcześniej niż teraz
  const validateStartTime = (time) => {
    if (!time || isNaN(time.getTime())) return t('validation.selectValidTime');
    const nowCheck = new Date();
    if (time < nowCheck) {
      return t('validation.tooEarly', { time: format(nowCheck, 'HH:mm'), margin: 0 });
    }
    return '';
  };

  // Walidacja końca: nie później niż teraz i musi być > start
  const validateEndTime = (time) => {
    if (!time || isNaN(time.getTime())) return t('validation.selectValidTime');
    const nowCheck = new Date();
    if (time > nowCheck) {
      return t('validation.tooLate', { time: format(nowCheck, 'HH:mm'), margin: 0 });
    }
    const startRef = openEntry 
      ? (() => { const [h,m] = openEntry.startTime.split(':').map(Number); const d = new Date(); d.setHours(h,m,0,0); return d; })()
      : startTime;
    if (startRef && time <= startRef) {
      return t('validation.endAfterStart', { time: format(startRef, 'HH:mm') });
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
        startDevice: getDeviceInfo(),
      });
      showSuccess(t('workStarted', { time: formattedTime }));
      setStartSaved(true);
      await checkOpenEntry(employee.employeeId);
    } catch (error) {
      showError(t('saveError'));
    } finally {
      setSavingStart(false);
    }
  };

  // Zapisz koniec
  const handleSaveEnd = async () => {
    const error = validateEndTime(endTime);
    if (error) { setEndError(error); showError(error); return; }

    if (!openEntry) {
      showError(t('validation.firstSaveStart'));
      return;
    }

    setSavingEnd(true);
    try {
      const formattedTime = format(endTime, 'HH:mm');
      await clockOut(openEntry.id, formattedTime, openEntry.startTime, getDeviceInfo());
      showSuccess(t('workEnded', { time: formattedTime }));
      setOpenEntry(null);
      setStep('success');
    } catch (error) {
      showError(t('saveError'));
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
    setStartTime(roundUp30(new Date()));
    setEndTime(roundDown30(new Date()));
    setStartError('');
    setEndError('');
    setShowHistory(false);
    setHistory([]);
    setHistoryMonth(new Date().getMonth());
    setHistoryYear(new Date().getFullYear());
  };

  const handleNewEntry = () => {
    setOpenEntry(null);
    setStartSaved(false);
    setStartTime(roundUp30(new Date()));
    setEndTime(roundDown30(new Date()));
    setStartError('');
    setEndError('');
    setStep('clocks');
    checkOpenEntry(employee.employeeId);
  };

  // Historia
  const fetchHistory = useCallback(async (month, year) => {
    if (!employee) return;
    setHistoryLoading(true);
    try {
      const entries = await getWorkTimeEntries(employee.employeeId, month, year);
      setHistory(entries);
    } catch (err) {
      showError(t('historyError'));
    } finally {
      setHistoryLoading(false);
    }
  }, [employee, showError, t]);

  const handleShowHistory = async () => {
    if (showHistory) { setShowHistory(false); return; }
    await fetchHistory(historyMonth, historyYear);
    setShowHistory(true);
  };

  const handlePrevMonth = async () => {
    let newMonth = historyMonth - 1;
    let newYear = historyYear;
    if (newMonth < 0) { newMonth = 11; newYear--; }
    setHistoryMonth(newMonth);
    setHistoryYear(newYear);
    await fetchHistory(newMonth, newYear);
  };

  const handleNextMonth = async () => {
    const now = new Date();
    if (historyMonth === now.getMonth() && historyYear === now.getFullYear()) return;
    let newMonth = historyMonth + 1;
    let newYear = historyYear;
    if (newMonth > 11) { newMonth = 0; newYear++; }
    setHistoryMonth(newMonth);
    setHistoryYear(newYear);
    await fetchHistory(newMonth, newYear);
  };

  const totalMonthHours = history.reduce((sum, entry) => sum + (entry.totalHours || 0), 0);

  const formatEntryDate = (timestamp) => {
    if (!timestamp) return '-';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return format(date, 'd MMM yyyy', { locale: pl });
  };

  const getStatusChip = (status) => {
    const map = {
      in_progress: { label: t('statuses.inProgress'), color: 'warning' },
      approved: { label: t('statuses.approved'), color: 'success' },
    };
    const s = map[status] || { label: status, color: 'default' };
    return <Chip label={s.label} color={s.color} size="small" />;
  };

  // Gradient helpers
  const gradients = {
    login: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    start: 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)',
    end: 'linear-gradient(135deg, #eb3349 0%, #f45c43 100%)',
    success: 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)',
  };

  return (
    <Container maxWidth={step === 'clocks' ? 'md' : 'sm'} sx={{ mt: 4, mb: 4 }}>

      {/* ==================== KROK 1: Logowanie ==================== */}
      {step === 'login' && (
        <Grow in timeout={500}>
          <Paper elevation={6} sx={{ borderRadius: 4, overflow: 'hidden' }}>
            {/* Gradient header */}
            <Box sx={{
              background: gradients.login,
              py: { xs: 3, md: 5 }, px: 3, textAlign: 'center', position: 'relative',
            }}>
              <Avatar sx={{
                width: { xs: 64, md: 80 }, height: { xs: 64, md: 80 }, mx: 'auto', mb: 2,
                backgroundColor: 'rgba(255,255,255,0.2)',
                backdropFilter: 'blur(10px)',
              }}>
                <FingerprintIcon sx={{ fontSize: { xs: 36, md: 44 }, color: '#fff' }} />
              </Avatar>
              <Typography variant="h4" fontWeight="800" color="#fff" gutterBottom>
                {t('title')}
              </Typography>
              <Chip
                label={formattedDate}
                sx={{
                  backgroundColor: 'rgba(255,255,255,0.2)', color: '#fff',
                  fontWeight: 600, backdropFilter: 'blur(4px)', textTransform: 'capitalize',
                }}
              />
            </Box>

            {/* Formularz */}
            <Box sx={{ p: 4 }}>
              <Typography variant="body1" sx={{ mb: 2.5, textAlign: 'center' }} color="text.secondary">
                {t('enterEmployeeId')}
              </Typography>
              <TextField
                label={t('employeeIdLabel')}
                value={employeeCode}
                onChange={(e) => setEmployeeCode(e.target.value.toUpperCase())}
                onKeyPress={handleKeyPress}
                fullWidth autoFocus
                placeholder={t('employeeIdPlaceholder')}
                sx={{
                  mb: 3,
                  '& .MuiOutlinedInput-root': {
                    borderRadius: 3, fontSize: '1.1rem',
                    '&.Mui-focused fieldset': { borderWidth: 2 },
                  },
                }}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <BadgeIcon color="primary" />
                    </InputAdornment>
                  ),
                }}
              />
              <Button
                variant="contained" fullWidth size="large"
                onClick={handleVerifyId}
                disabled={verifying || !employeeCode.trim()}
                endIcon={!verifying && <ArrowForwardIcon />}
                sx={{
                  py: 1.8, borderRadius: 3, fontWeight: 'bold', fontSize: '1rem',
                  background: gradients.login,
                  boxShadow: '0 4px 15px rgba(102, 126, 234, 0.4)',
                  '&:hover': { boxShadow: '0 6px 20px rgba(102, 126, 234, 0.6)' },
                }}
              >
                {verifying ? <CircularProgress size={26} color="inherit" /> : t('next')}
              </Button>
            </Box>
          </Paper>
        </Grow>
      )}

      {/* ==================== KROK 2: Dwa zegary ==================== */}
      {step === 'clocks' && (
        <Fade in timeout={400}>
          <Box>
            {/* Nagłówek z info o pracowniku */}
            <Paper elevation={4} sx={{
              borderRadius: 4, mb: 3, overflow: 'hidden',
            }}>
              <Box sx={{
                background: gradients.login, py: 2.5, px: 3,
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column',
              }}>
                <Typography variant="h5" fontWeight="800" color="#fff">
                  {t('title')}
                </Typography>
                <Chip
                  label={formattedDate}
                  size="small"
                  sx={{
                    mt: 0.5, backgroundColor: 'rgba(255,255,255,0.2)', color: '#fff',
                    fontWeight: 600, textTransform: 'capitalize',
                  }}
                />
              </Box>
              <Box sx={{ px: 3, py: 1.5, display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <Avatar sx={{ bgcolor: 'primary.main', width: 36, height: 36 }}>
                  {employee?.displayName?.charAt(0) || '?'}
                </Avatar>
                <Box>
                  <Typography variant="body1" fontWeight="bold">{employee?.displayName}</Typography>
                  <Typography variant="caption" color="text.secondary">{employee?.employeeId}</Typography>
                </Box>
              </Box>
            </Paper>

            {checkingOpen ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
                <CircularProgress />
              </Box>
            ) : (
              <Grid container spacing={3}>
                {/* ======== ZEGAR START ======== */}
                <Grid item xs={12} sm={6}>
                  <Grow in timeout={500}>
                    <Paper
                      elevation={4}
                      sx={{
                        borderRadius: 4, overflow: 'hidden',
                        opacity: startSaved ? 0.75 : 1,
                        transition: 'all 0.3s ease',
                      }}
                    >
                      <Box sx={{
                        background: gradients.start, color: '#fff',
                        py: 2, px: 2,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1,
                      }}>
                        <LoginIcon sx={{ fontSize: 28 }} />
                        <Typography variant="h6" fontWeight="800">
                          {t('start')}
                        </Typography>
                      </Box>

                      {startSaved && openEntry && (
                        <Box sx={{
                          background: 'linear-gradient(90deg, #11998e22, #38ef7d22)',
                          py: 2, textAlign: 'center',
                        }}>
                          <Typography variant="h3" fontWeight="900" color="success.main">
                            {openEntry.startTime}
                          </Typography>
                          <Chip label={t('saved')} color="success" size="small" sx={{ mt: 0.5 }} />
                        </Box>
                      )}

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
                                minutesStep={30}
                                minTime={minStartTime}
                                slotProps={{ actionBar: { sx: { display: 'none' } } }}
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
                              variant="contained" fullWidth size="large"
                              onClick={handleSaveStart} disabled={savingStart}
                              startIcon={savingStart ? <CircularProgress size={20} color="inherit" /> : <LoginIcon />}
                              sx={{
                                py: 1.5, borderRadius: 3, fontWeight: 'bold',
                                background: gradients.start,
                                boxShadow: '0 4px 12px rgba(17,153,142,0.35)',
                                '&:hover': { boxShadow: '0 6px 18px rgba(17,153,142,0.5)' },
                              }}
                            >
                              {savingStart ? t('saving') : `${t('saveStart')} — ${startTime && !isNaN(startTime.getTime()) ? format(startTime, 'HH:mm') : ''}`}
                            </Button>
                          </Box>
                        </>
                      )}
                    </Paper>
                  </Grow>
                </Grid>

                {/* ======== ZEGAR KONIEC ======== */}
                <Grid item xs={12} sm={6}>
                  <Grow in timeout={700}>
                    <Paper
                      elevation={4}
                      sx={{
                        borderRadius: 4, overflow: 'hidden',
                        opacity: !startSaved ? 0.45 : 1,
                        pointerEvents: !startSaved ? 'none' : 'auto',
                        transition: 'all 0.3s ease',
                      }}
                    >
                      <Box sx={{
                        background: gradients.end, color: '#fff',
                        py: 2, px: 2,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1,
                      }}>
                        <LogoutIcon sx={{ fontSize: 28 }} />
                        <Typography variant="h6" fontWeight="800">
                          {t('end')}
                        </Typography>
                      </Box>

                      {!startSaved && (
                        <Box sx={{ py: 8, textAlign: 'center' }}>
                          <AccessTimeIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
                          <Typography variant="body1" color="text.secondary">
                            {t('firstSaveStart')}
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
                                minutesStep={30}
                                minTime={minEndTime}
                                maxTime={maxEndTime}
                                slotProps={{ actionBar: { sx: { display: 'none' } } }}
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
                              variant="contained" fullWidth size="large"
                              onClick={handleSaveEnd} disabled={savingEnd}
                              startIcon={savingEnd ? <CircularProgress size={20} color="inherit" /> : <LogoutIcon />}
                              sx={{
                                py: 1.5, borderRadius: 3, fontWeight: 'bold',
                                background: gradients.end,
                                boxShadow: '0 4px 12px rgba(235,51,73,0.35)',
                                '&:hover': { boxShadow: '0 6px 18px rgba(235,51,73,0.5)' },
                              }}
                            >
                              {savingEnd ? t('saving') : `${t('saveEnd')} — ${endTime && !isNaN(endTime.getTime()) ? format(endTime, 'HH:mm') : ''}`}
                            </Button>
                          </Box>
                        </>
                      )}
                    </Paper>
                  </Grow>
                </Grid>
              </Grid>
            )}

            {/* Dolne przyciski */}
            <Paper elevation={2} sx={{ p: 2, borderRadius: 4, mt: 3 }}>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button
                  variant="outlined" fullWidth size="large" onClick={handleReset}
                  startIcon={<ArrowBackIcon />} sx={{ borderRadius: 3, minHeight: 48 }}
                >
                  {t('changeEmployee')}
                </Button>
                <Button
                  variant="outlined" fullWidth size="large" onClick={handleShowHistory}
                  startIcon={historyLoading ? <CircularProgress size={16} /> : <HistoryIcon />}
                  sx={{ borderRadius: 3, minHeight: 48 }}
                >
                  {showHistory ? t('hideHistory') : t('history')}
                </Button>
              </Box>

              {showHistory && (
                <Fade in>
                  <Box sx={{ mt: 2 }}>
                    <Divider sx={{ mb: 2 }} />

                    {/* Nawigacja miesięcy */}
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1, mb: 2 }}>
                      <IconButton onClick={handlePrevMonth} disabled={historyLoading} size="small">
                        <ChevronLeftIcon />
                      </IconButton>
                      <Typography
                        variant="subtitle1"
                        fontWeight={600}
                        sx={{ minWidth: 160, textAlign: 'center', textTransform: 'capitalize' }}
                      >
                        {format(new Date(historyYear, historyMonth, 1), 'LLLL yyyy', { locale: pl })}
                      </Typography>
                      <IconButton
                        onClick={handleNextMonth}
                        disabled={historyLoading || (historyMonth === new Date().getMonth() && historyYear === new Date().getFullYear())}
                        size="small"
                      >
                        <ChevronRightIcon />
                      </IconButton>
                    </Box>

                    {/* Suma godzin + liczba wpisów */}
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
                      <Typography variant="subtitle2" color="text.secondary">
                        {t('historyTitle', { count: history.length })}
                      </Typography>
                      <Chip
                        label={`${Math.round(totalMonthHours * 100) / 100}h`}
                        color="primary"
                        size="small"
                        icon={<AccessTimeIcon />}
                      />
                    </Box>

                    {historyLoading ? (
                      <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
                        <CircularProgress size={28} />
                      </Box>
                    ) : history.length === 0 ? (
                      <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
                        {t('noEntries')}
                      </Typography>
                    ) : (
                      <TableContainer>
                        <Table size="small">
                          <TableHead>
                            <TableRow>
                              <TableCell>{t('table.date')}</TableCell>
                              <TableCell>{t('table.start')}</TableCell>
                              <TableCell>{t('table.end')}</TableCell>
                              <TableCell>{t('table.time')}</TableCell>
                              <TableCell>{t('table.status')}</TableCell>
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
        <Grow in timeout={500}>
          <Paper elevation={6} sx={{ borderRadius: 4, overflow: 'hidden' }}>
            <Box sx={{
              background: gradients.success,
              py: { xs: 3, md: 5 }, textAlign: 'center',
            }}>
              <Avatar sx={{
                width: { xs: 64, md: 80 }, height: { xs: 64, md: 80 }, mx: 'auto', mb: 2,
                backgroundColor: 'rgba(255,255,255,0.25)',
              }}>
                <CelebrationIcon sx={{ fontSize: { xs: 36, md: 44 }, color: '#fff' }} />
              </Avatar>
              <Typography variant="h4" fontWeight="800" color="#fff" gutterBottom>
                {t('successTitle')}
              </Typography>
              <Typography variant="body1" sx={{ color: 'rgba(255,255,255,0.85)' }}>
                {t('successMessage')}
              </Typography>
              <Typography variant="h5" fontWeight="bold" color="#fff" sx={{ mt: 1 }}>
                {employee?.displayName}
              </Typography>
            </Box>
            <Box sx={{ p: 3, display: 'flex', gap: 2 }}>
              <Button variant="contained" fullWidth onClick={handleNewEntry}
                sx={{
                  borderRadius: 3, py: 1.5, fontWeight: 'bold',
                  background: gradients.login,
                  boxShadow: '0 4px 12px rgba(102,126,234,0.3)',
                }}>
                {t('back')}
              </Button>
              <Button variant="outlined" fullWidth onClick={handleReset}
                sx={{ borderRadius: 3, py: 1.5, fontWeight: 'bold' }}>
                {t('changeEmployee')}
              </Button>
            </Box>
          </Paper>
        </Grow>
      )}
    </Container>
  );
};

export default WorkTimePage;
