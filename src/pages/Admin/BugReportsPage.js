import React, { useState, useEffect } from 'react';
import {
  Container,
  Paper,
  Typography,
  Box,
  Tabs,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Button,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  IconButton,
  Card,
  CardContent,
  Alert,
  Divider,
  Grid,
  Stack
} from '@mui/material';
import {
  BugReport as BugIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  Close as CloseIcon,
  Refresh as RefreshIcon,
  Comment as CommentIcon,
  Assignment as AssignmentIcon,
  Check as CheckIcon,
  Cancel as CancelIcon,
  Image as ImageIcon,
  Computer as ComputerIcon,
  Download as DownloadIcon,
  Remove as RemoveIcon,
  Add as AddIcon
} from '@mui/icons-material';
import { formatDistanceToNow } from 'date-fns';
import { pl } from 'date-fns/locale';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';
import { AdminRoute } from '../../components/common/AdminRoute';
import {
  getBugReports,
  getBugReportById,
  updateBugReportStatus,
  addBugReportComment,
  deleteBugReport
} from '../../services/bugReportService';

/**
 * Strona zarządzania zgłoszeniami błędów dla administratorów
 */
const BugReportsPage = () => {
  const { currentUser } = useAuth();
  const { showSuccess, showError, showWarning } = useNotification();
  
  const [bugReports, setBugReports] = useState([]);
  const [filteredReports, setFilteredReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('wszystkie');
  const [selectedReport, setSelectedReport] = useState(null);
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [commentDialogOpen, setCommentDialogOpen] = useState(false);
  const [newStatus, setNewStatus] = useState('');
  const [newComment, setNewComment] = useState('');
  const [reportToDelete, setReportToDelete] = useState(null);
  const [screenshotPreviewOpen, setScreenshotPreviewOpen] = useState(false);
  const [previewImageSrc, setPreviewImageSrc] = useState('');
  const [zoomLevel, setZoomLevel] = useState(1);
  
  // Pobieranie zgłoszeń błędów
  const fetchBugReports = async () => {
    setLoading(true);
    try {
      const reports = await getBugReports();
      setBugReports(reports);
      filterReports(reports, activeTab);
    } catch (error) {
      console.error('Błąd podczas pobierania zgłoszeń błędów:', error);
      showError('Nie udało się pobrać zgłoszeń błędów');
    } finally {
      setLoading(false);
    }
  };
  
  // Pobierz dane przy montowaniu komponentu
  useEffect(() => {
    fetchBugReports();
  }, []);
  
  // Filtrowanie zgłoszeń błędów
  const filterReports = (reports, status) => {
    if (status === 'wszystkie') {
      setFilteredReports(reports);
    } else {
      setFilteredReports(reports.filter(report => report.status === status));
    }
  };
  
  // Obsługa zmiany zakładki (statusu)
  const handleTabChange = (event, newValue) => {
    setActiveTab(newValue);
    filterReports(bugReports, newValue);
  };
  
  // Otwieranie szczegółów zgłoszenia
  const handleOpenDetails = async (reportId) => {
    try {
      setLoading(true);
      const report = await getBugReportById(reportId);
      setSelectedReport(report);
      setDetailsDialogOpen(true);
    } catch (error) {
      console.error('Błąd podczas pobierania szczegółów zgłoszenia:', error);
      showError('Nie udało się pobrać szczegółów zgłoszenia');
    } finally {
      setLoading(false);
    }
  };
  
  // Otwieranie dialogu zmiany statusu
  const handleOpenStatusDialog = (report) => {
    setSelectedReport(report);
    setNewStatus(report.status);
    setStatusDialogOpen(true);
  };
  
  // Zmiana statusu zgłoszenia
  const handleUpdateStatus = async () => {
    try {
      await updateBugReportStatus(selectedReport.id, newStatus, currentUser.uid);
      showSuccess('Status zgłoszenia został zaktualizowany');
      setStatusDialogOpen(false);
      fetchBugReports();
    } catch (error) {
      console.error('Błąd podczas aktualizacji statusu zgłoszenia:', error);
      showError('Nie udało się zaktualizować statusu zgłoszenia');
    }
  };
  
  // Otwieranie dialogu dodawania komentarza
  const handleOpenCommentDialog = (report) => {
    setSelectedReport(report);
    setNewComment('');
    setCommentDialogOpen(true);
  };
  
  // Dodawanie komentarza
  const handleAddComment = async () => {
    if (!newComment.trim()) {
      return;
    }
    
    try {
      await addBugReportComment(selectedReport.id, newComment, currentUser.uid);
      showSuccess('Komentarz został dodany');
      setCommentDialogOpen(false);
      fetchBugReports();
    } catch (error) {
      console.error('Błąd podczas dodawania komentarza:', error);
      showError('Nie udało się dodać komentarza');
    }
  };
  
  // Otwieranie dialogu usuwania zgłoszenia
  const handleOpenDeleteDialog = (report) => {
    setReportToDelete(report);
    setDeleteDialogOpen(true);
  };
  
  // Usuwanie zgłoszenia
  const handleDeleteReport = async () => {
    try {
      setLoading(true);
      await deleteBugReport(reportToDelete.id);
      showSuccess('Zgłoszenie zostało usunięte');
      setDeleteDialogOpen(false);
      fetchBugReports();
    } catch (error) {
      console.error('Błąd podczas usuwania zgłoszenia:', error);
      
      // Wyświetlamy bardziej szczegółową informację o błędzie
      if (error.message && error.message.includes('CORS')) {
        // Przypadek błędu CORS - prawdopodobnie problem z usunięciem zrzutu ekranu
        showWarning('Zgłoszenie zostało usunięte, ale wystąpił problem z usunięciem pliku zrzutu ekranu. Nie wpływa to na funkcjonalność systemu.');
        setDeleteDialogOpen(false);
        fetchBugReports();
      } else {
        // Inne błędy
        showError(`Nie udało się usunąć zgłoszenia: ${error.message}`);
      }
    } finally {
      setLoading(false);
    }
  };
  
  // Formatowanie daty
  const formatDate = (timestamp) => {
    if (!timestamp) return 'Brak daty';
    
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return new Intl.DateTimeFormat('pl-PL', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  };
  
  // Renderowanie chipa statusu
  const getStatusChip = (status) => {
    switch (status) {
      case 'nowy':
        return <Chip label="Nowy" color="info" size="small" />;
      case 'w trakcie':
        return <Chip label="W trakcie" color="warning" size="small" />;
      case 'rozwiązany':
        return <Chip label="Rozwiązany" color="success" size="small" />;
      case 'odrzucony':
        return <Chip label="Odrzucony" color="error" size="small" />;
      default:
        return <Chip label={status} size="small" />;
    }
  };
  
  // Funkcja do zmiany poziomu powiększenia
  const handleZoomIn = () => {
    setZoomLevel((prev) => Math.min(prev + 0.25, 3));
  };

  // Funkcja do zmniejszenia poziomu powiększenia
  const handleZoomOut = () => {
    setZoomLevel((prev) => Math.max(prev - 0.25, 0.5));
  };

  // Funkcja do resetowania poziomu powiększenia
  const handleZoomReset = () => {
    setZoomLevel(1);
  };

  // Funkcje obsługujące podgląd zrzutu ekranu
  const handleOpenScreenshotPreview = (imageSrc) => {
    // Jeśli imageSrc jest przekazane bezpośrednio, użyj go
    // W przeciwnym razie użyj obrazu z wybranego zgłoszenia
    const src = imageSrc || (selectedReport && (selectedReport.screenshotUrl || selectedReport.screenshotBase64));
    if (src) {
      setPreviewImageSrc(src);
      setScreenshotPreviewOpen(true);
      setZoomLevel(1); // Reset zoom przy otwarciu
    }
  };

  const handleCloseScreenshotPreview = () => {
    setScreenshotPreviewOpen(false);
  };

  // Funkcja do pobierania zrzutu ekranu
  const handleDownloadScreenshot = () => {
    // Tworzymy link do pobrania
    const link = document.createElement('a');
    link.href = previewImageSrc;
    link.download = `screenshot-${selectedReport?.id || 'bug-report'}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };
  
  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
        <BugIcon sx={{ mr: 2, fontSize: 30, color: 'error.main' }} />
        <Typography variant="h4">Zgłoszenia błędów</Typography>
      </Box>
      
      <Paper elevation={2} sx={{ p: 3, mb: 4 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6">
            Lista zgłoszeń błędów
          </Typography>
          <Button 
            startIcon={<RefreshIcon />} 
            onClick={fetchBugReports}
            disabled={loading}
          >
            Odśwież
          </Button>
        </Box>
        
        <Tabs 
          value={activeTab} 
          onChange={handleTabChange}
          variant="scrollable"
          scrollButtons="auto"
          sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}
        >
          <Tab value="wszystkie" label="Wszystkie" />
          <Tab value="nowy" label="Nowe" />
          <Tab value="w trakcie" label="W trakcie" />
          <Tab value="rozwiązany" label="Rozwiązane" />
          <Tab value="odrzucony" label="Odrzucone" />
        </Tabs>
        
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
            <CircularProgress />
          </Box>
        ) : filteredReports.length === 0 ? (
          <Alert severity="info" sx={{ mt: 2 }}>
            Brak zgłoszeń błędów o statusie {activeTab !== 'wszystkie' ? `"${activeTab}"` : ''}
          </Alert>
        ) : (
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Tytuł</TableCell>
                  <TableCell>Zgłaszający</TableCell>
                  <TableCell>Data zgłoszenia</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Zrzut ekranu</TableCell>
                  <TableCell>Akcje</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredReports.map((report) => (
                  <TableRow key={report.id}>
                    <TableCell>{report.title}</TableCell>
                    <TableCell>{report.createdBy}</TableCell>
                    <TableCell>{formatDate(report.createdAt)}</TableCell>
                    <TableCell>{getStatusChip(report.status)}</TableCell>
                    <TableCell>
                      {report.screenshotUrl || report.screenshotBase64 ? (
                        <IconButton 
                          color="primary" 
                          size="small" 
                          onClick={(e) => {
                            e.stopPropagation(); // Zapobiega otwieraniu szczegółów zgłoszenia
                            handleOpenScreenshotPreview(report.screenshotUrl || report.screenshotBase64);
                          }}
                        >
                          <ImageIcon />
                        </IconButton>
                      ) : (
                        <Typography variant="caption" color="text.secondary">Brak</Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', gap: 1 }}>
                        <Button 
                          size="small" 
                          variant="outlined" 
                          onClick={() => handleOpenDetails(report.id)}
                        >
                          Szczegóły
                        </Button>
                        <IconButton 
                          color="primary" 
                          size="small"
                          onClick={() => handleOpenStatusDialog(report)}
                        >
                          <EditIcon fontSize="small" />
                        </IconButton>
                        <IconButton 
                          color="error" 
                          size="small"
                          onClick={() => handleOpenDeleteDialog(report)}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Box>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>
      
      {/* Dialog ze szczegółami zgłoszenia */}
      <Dialog 
        open={detailsDialogOpen} 
        onClose={() => setDetailsDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <BugIcon color="error" />
          Szczegóły zgłoszenia
          <IconButton 
            sx={{ position: 'absolute', right: 8, top: 8 }}
            onClick={() => setDetailsDialogOpen(false)}
          >
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          {selectedReport && (
            <Grid container spacing={3}>
              <Grid item xs={12}>
                <Box sx={{ mb: 2 }}>
                  <Typography variant="h6">{selectedReport.title}</Typography>
                  <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mt: 1 }}>
                    {getStatusChip(selectedReport.status)}
                    <Typography variant="caption" color="text.secondary">
                      Zgłoszono: {formatDate(selectedReport.createdAt)}
                    </Typography>
                  </Box>
                </Box>
                <Divider sx={{ my: 2 }} />
              </Grid>
              
              <Grid item xs={12} md={8}>
                <Typography variant="subtitle1" gutterBottom>Opis problemu</Typography>
                <Paper variant="outlined" sx={{ p: 2, mb: 3, minHeight: '100px' }}>
                  <Typography variant="body2">{selectedReport.description}</Typography>
                </Paper>
                
                <Typography variant="subtitle1" gutterBottom>Komentarze</Typography>
                {selectedReport.comments && selectedReport.comments.length > 0 ? (
                  <Stack spacing={2} sx={{ mb: 3 }}>
                    {selectedReport.comments.map((comment, index) => (
                      <Paper key={index} variant="outlined" sx={{ p: 2 }}>
                        <Typography variant="body2">{comment.text}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {formatDate(comment.createdAt)}
                        </Typography>
                      </Paper>
                    ))}
                  </Stack>
                ) : (
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                    Brak komentarzy
                  </Typography>
                )}
                
                <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
                  <Button 
                    variant="outlined" 
                    startIcon={<CommentIcon />}
                    onClick={() => handleOpenCommentDialog(selectedReport)}
                  >
                    Dodaj komentarz
                  </Button>
                  <Button 
                    variant="outlined" 
                    startIcon={<EditIcon />}
                    onClick={() => handleOpenStatusDialog(selectedReport)}
                  >
                    Zmień status
                  </Button>
                </Box>
              </Grid>
              
              <Grid item xs={12} md={4}>
                <Card variant="outlined" sx={{ mb: 3 }}>
                  <CardContent>
                    <Typography variant="subtitle2" gutterBottom>
                      Informacje o przeglądarce
                    </Typography>
                    <Divider sx={{ my: 1 }} />
                    {selectedReport.browserInfo ? (
                      <>
                        <Typography variant="body2">
                          <strong>Przeglądarka:</strong> {selectedReport.browserInfo.userAgent}
                        </Typography>
                        <Typography variant="body2">
                          <strong>Platforma:</strong> {selectedReport.browserInfo.platform}
                        </Typography>
                        <Typography variant="body2">
                          <strong>Rozdzielczość:</strong> {selectedReport.browserInfo.screenWidth} x {selectedReport.browserInfo.screenHeight}
                        </Typography>
                      </>
                    ) : (
                      <Typography variant="body2" color="text.secondary">
                        Brak informacji o przeglądarce
                      </Typography>
                    )}
                  </CardContent>
                </Card>
                
                {(selectedReport.screenshotUrl || selectedReport.screenshotBase64) && (
                  <Box sx={{ mb: 3 }}>
                    <Typography variant="subtitle2" gutterBottom>
                      Zrzut ekranu
                    </Typography>
                    <Paper 
                      variant="outlined" 
                      sx={{ 
                        p: 1,
                        cursor: 'pointer',
                        '&:hover': {
                          boxShadow: 3,
                          transition: 'box-shadow 0.3s'
                        }
                      }}
                      onClick={() => handleOpenScreenshotPreview(selectedReport.screenshotUrl || selectedReport.screenshotBase64)}
                    >
                      <Box
                        component="img"
                        src={selectedReport.screenshotUrl || selectedReport.screenshotBase64}
                        alt="Zrzut ekranu"
                        sx={{
                          width: '100%',
                          maxHeight: '300px',
                          objectFit: 'contain',
                          borderRadius: '4px'
                        }}
                      />
                    </Paper>
                  </Box>
                )}
                
                {selectedReport.consoleLogs && (
                  <Box sx={{ mb: 3 }}>
                    <Typography variant="subtitle2" gutterBottom>
                      Logi konsoli
                    </Typography>
                    <Paper variant="outlined" sx={{ 
                      p: 1, 
                      maxHeight: '200px', 
                      overflowY: 'auto',
                      bgcolor: theme => theme.palette.mode === 'dark' ? '#2d2d2d' : '#f5f5f5'
                    }}>
                      <Box
                        component="pre"
                        sx={{
                          margin: 0,
                          fontSize: '0.75rem',
                          fontFamily: 'monospace',
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-all'
                        }}
                      >
                        {selectedReport.consoleLogs}
                      </Box>
                    </Paper>
                  </Box>
                )}
              </Grid>
            </Grid>
          )}
        </DialogContent>
      </Dialog>
      
      {/* Dialog do zmiany statusu */}
      <Dialog open={statusDialogOpen} onClose={() => setStatusDialogOpen(false)}>
        <DialogTitle>Zmień status zgłoszenia</DialogTitle>
        <DialogContent>
          <FormControl fullWidth sx={{ mt: 2 }}>
            <InputLabel>Status</InputLabel>
            <Select
              value={newStatus}
              onChange={(e) => setNewStatus(e.target.value)}
              label="Status"
            >
              <MenuItem value="nowy">Nowy</MenuItem>
              <MenuItem value="w trakcie">W trakcie</MenuItem>
              <MenuItem value="rozwiązany">Rozwiązany</MenuItem>
              <MenuItem value="odrzucony">Odrzucony</MenuItem>
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setStatusDialogOpen(false)}>Anuluj</Button>
          <Button onClick={handleUpdateStatus} variant="contained" color="primary">
            Zapisz
          </Button>
        </DialogActions>
      </Dialog>
      
      {/* Dialog do dodawania komentarza */}
      <Dialog 
        open={commentDialogOpen} 
        onClose={() => setCommentDialogOpen(false)}
        fullWidth
      >
        <DialogTitle>Dodaj komentarz</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Komentarz"
            fullWidth
            multiline
            rows={4}
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCommentDialogOpen(false)}>Anuluj</Button>
          <Button 
            onClick={handleAddComment} 
            variant="contained" 
            color="primary"
            disabled={!newComment.trim()}
          >
            Dodaj
          </Button>
        </DialogActions>
      </Dialog>
      
      {/* Dialog do usuwania zgłoszenia */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>Potwierdź usunięcie</DialogTitle>
        <DialogContent>
          <Typography>
            Czy na pewno chcesz usunąć zgłoszenie "{reportToDelete?.title}"?
            Ta operacja jest nieodwracalna.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Anuluj</Button>
          <Button onClick={handleDeleteReport} color="error" variant="contained">
            Usuń
          </Button>
        </DialogActions>
      </Dialog>
      
      {/* Dialog do podglądu zrzutu ekranu */}
      <Dialog
        open={screenshotPreviewOpen}
        onClose={handleCloseScreenshotPreview}
        maxWidth="xl"
        fullWidth
        PaperProps={{
          sx: {
            maxHeight: '90vh',
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            borderRadius: 2
          }
        }}
      >
        <Box sx={{ position: 'absolute', top: 8, right: 8, display: 'flex', gap: 1 }}>
          <IconButton
            onClick={handleDownloadScreenshot}
            sx={{
              color: 'white',
              backgroundColor: 'rgba(0, 0, 0, 0.5)',
              '&:hover': {
                backgroundColor: 'rgba(0, 0, 0, 0.7)',
              }
            }}
          >
            <DownloadIcon />
          </IconButton>
          <IconButton
            onClick={handleCloseScreenshotPreview}
            sx={{
              color: 'white',
              backgroundColor: 'rgba(0, 0, 0, 0.5)',
              '&:hover': {
                backgroundColor: 'rgba(0, 0, 0, 0.7)',
              }
            }}
          >
            <CloseIcon />
          </IconButton>
        </Box>
        
        <Box sx={{ position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 1, backgroundColor: 'rgba(0, 0, 0, 0.5)', borderRadius: 2, p: 0.5 }}>
          <IconButton
            onClick={handleZoomOut}
            disabled={zoomLevel <= 0.5}
            sx={{
              color: 'white',
              '&.Mui-disabled': {
                color: 'rgba(255, 255, 255, 0.3)',
              }
            }}
          >
            <RemoveIcon />
          </IconButton>
          <Button
            onClick={handleZoomReset}
            sx={{ color: 'white' }}
          >
            {Math.round(zoomLevel * 100)}%
          </Button>
          <IconButton
            onClick={handleZoomIn}
            disabled={zoomLevel >= 3}
            sx={{
              color: 'white',
              '&.Mui-disabled': {
                color: 'rgba(255, 255, 255, 0.3)',
              }
            }}
          >
            <AddIcon />
          </IconButton>
        </Box>
        
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            p: 2,
            height: '80vh',
            overflow: 'auto'
          }}
        >
          <Box
            component="img"
            src={previewImageSrc}
            alt="Pełny widok zrzutu ekranu"
            sx={{
              maxWidth: `${zoomLevel * 100}%`,
              maxHeight: `${zoomLevel * 100}%`,
              objectFit: 'contain',
              transition: 'max-width 0.2s, max-height 0.2s'
            }}
          />
        </Box>
      </Dialog>
    </Container>
  );
};

export default BugReportsPage; 