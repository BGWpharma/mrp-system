import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Container,
  Paper,
  Typography,
  Box,
  Grid,
  Button,
  Chip,
  Divider,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  CircularProgress,
  Alert,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  MenuItem,
  Select,
  FormControl,
  InputLabel
} from '@mui/material';
import { format } from 'date-fns';
import pl from 'date-fns/locale/pl';
import { useAuth } from '../../../hooks/useAuth';
import { useNotification } from '../../../hooks/useNotification';
import { 
  getWaybillById, 
  updateWaybillStatus,
  deleteWaybill,
  WAYBILL_STATUSES 
} from '../../../services/logisticsService';

// Ikony
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import PrintIcon from '@mui/icons-material/Print';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';

const WaybillDetailsPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { showSuccess, showError } = useNotification();
  
  const [loading, setLoading] = useState(true);
  const [waybill, setWaybill] = useState(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [newStatus, setNewStatus] = useState('');
  const [error, setError] = useState(null);
  
  const fetchWaybill = async () => {
    try {
      setLoading(true);
      
      // Jeśli jesteśmy na stronie tworzenia nowego dokumentu, przekierujmy do właściwej strony
      if (id === 'create') {
        navigate('/logistics/waybill/create');
        return;
      }
      
      const data = await getWaybillById(id);
      setWaybill(data);
      setNewStatus(data.status);
    } catch (error) {
      console.error('Błąd podczas pobierania szczegółów listu przewozowego:', error);
      setError(error.message);
      showError('Nie udało się pobrać szczegółów listu przewozowego');
      navigate('/logistics/waybill');
    } finally {
      setLoading(false);
    }
  };
  
  useEffect(() => {
    fetchWaybill();
  }, [id, navigate]);
  
  const handleEdit = () => {
    navigate(`/logistics/waybill/${id}/edit`);
  };
  
  const handleBack = () => {
    navigate('/logistics/waybill');
  };
  
  const handlePrint = () => {
    window.print();
  };
  
  const handleDeleteClick = () => {
    setDeleteDialogOpen(true);
  };
  
  const handleDeleteCancel = () => {
    setDeleteDialogOpen(false);
  };
  
  const handleDeleteConfirm = async () => {
    try {
      await deleteWaybill(id);
      showSuccess('List przewozowy został usunięty');
      setDeleteDialogOpen(false);
      navigate('/logistics/waybill');
    } catch (error) {
      console.error('Błąd podczas usuwania listu przewozowego:', error);
      showError('Nie udało się usunąć listu przewozowego');
      setDeleteDialogOpen(false);
    }
  };
  
  const handleStatusClick = () => {
    setStatusDialogOpen(true);
  };
  
  const handleStatusCancel = () => {
    setStatusDialogOpen(false);
    // Przywróć poprzedni status
    if (waybill) {
      setNewStatus(waybill.status);
    }
  };
  
  const handleStatusChange = (e) => {
    setNewStatus(e.target.value);
  };
  
  const handleStatusConfirm = async () => {
    try {
      await updateWaybillStatus(id, newStatus, currentUser.uid);
      showSuccess(`Status listu przewozowego został zmieniony na: ${newStatus}`);
      setStatusDialogOpen(false);
      fetchWaybill(); // Odśwież dane
    } catch (error) {
      console.error('Błąd podczas aktualizacji statusu:', error);
      showError('Nie udało się zaktualizować statusu listu przewozowego');
      setStatusDialogOpen(false);
    }
  };
  
  const formatDate = (date) => {
    if (!date) return '-';
    try {
      return format(new Date(date), 'dd.MM.yyyy', { locale: pl });
    } catch (e) {
      return String(date);
    }
  };
  
  const renderStatusChip = (status) => {
    let color;
    switch (status) {
      case WAYBILL_STATUSES.DRAFT:
        color = 'default';
        break;
      case WAYBILL_STATUSES.PLANNED:
        color = 'primary';
        break;
      case WAYBILL_STATUSES.IN_TRANSIT:
        color = 'warning';
        break;
      case WAYBILL_STATUSES.DELIVERED:
        color = 'success';
        break;
      case WAYBILL_STATUSES.CANCELED:
        color = 'error';
        break;
      default:
        color = 'default';
    }
    
    return <Chip label={status} color={color} />;
  };
  
  if (loading) {
    return (
      <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}>
          <CircularProgress />
        </Box>
      </Container>
    );
  }
  
  if (!waybill) {
    return (
      <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
        <Alert severity="error">
          Nie znaleziono listu przewozowego
        </Alert>
        <Button 
          variant="outlined" 
          startIcon={<ArrowBackIcon />} 
          onClick={handleBack}
          sx={{ mt: 2 }}
        >
          Powrót do listy
        </Button>
      </Container>
    );
  }
  
  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h5">
          List przewozowy: {waybill.waybillNumber}
        </Typography>
        <Box>
          <Button
            variant="outlined"
            startIcon={<ArrowBackIcon />}
            onClick={handleBack}
            sx={{ mr: 1 }}
          >
            Powrót
          </Button>
          <Button
            variant="outlined"
            startIcon={<PrintIcon />}
            onClick={handlePrint}
            sx={{ mr: 1 }}
          >
            Drukuj
          </Button>
          
          {waybill.status !== WAYBILL_STATUSES.DELIVERED && 
           waybill.status !== WAYBILL_STATUSES.CANCELED && (
            <Button
              variant="outlined"
              startIcon={<EditIcon />}
              onClick={handleEdit}
              sx={{ mr: 1 }}
            >
              Edytuj
            </Button>
          )}
          
          {waybill.status === WAYBILL_STATUSES.DRAFT && (
            <Button
              variant="outlined"
              color="error"
              startIcon={<DeleteIcon />}
              onClick={handleDeleteClick}
            >
              Usuń
            </Button>
          )}
        </Box>
      </Box>
      
      <Paper sx={{ p: 3, mb: 3 }}>
        <Grid container spacing={3}>
          <Grid item xs={12} md={6}>
            <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 'bold' }}>
              Numer listu przewozowego
            </Typography>
            <Typography variant="body1" gutterBottom>
              {waybill.waybillNumber}
            </Typography>
          </Grid>
          
          <Grid item xs={12} md={6}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Box>
                <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 'bold' }}>
                  Status
                </Typography>
                {renderStatusChip(waybill.status)}
              </Box>
              <Button
                variant="outlined"
                onClick={handleStatusClick}
                startIcon={<LocalShippingIcon />}
              >
                Zmień status
              </Button>
            </Box>
          </Grid>
          
          <Grid item xs={12} md={6}>
            <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 'bold' }}>
              Typ transportu
            </Typography>
            <Typography variant="body1" gutterBottom>
              {waybill.type}
            </Typography>
          </Grid>
          
          <Grid item xs={12} md={6}>
            <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 'bold' }}>
              Planowana data
            </Typography>
            <Typography variant="body1" gutterBottom>
              {formatDate(waybill.plannedDate)}
            </Typography>
          </Grid>
          
          <Grid item xs={12} md={6}>
            <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 'bold' }}>
              Miejsce nadania
            </Typography>
            <Typography variant="body1" gutterBottom>
              {waybill.sourceLocation}
            </Typography>
          </Grid>
          
          <Grid item xs={12} md={6}>
            <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 'bold' }}>
              Miejsce dostawy
            </Typography>
            <Typography variant="body1" gutterBottom>
              {waybill.destinationLocation}
            </Typography>
          </Grid>
          
          <Grid item xs={12} md={6}>
            <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 'bold' }}>
              Kierowca
            </Typography>
            <Typography variant="body1" gutterBottom>
              {waybill.driver || '-'}
            </Typography>
          </Grid>
          
          <Grid item xs={12} md={6}>
            <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 'bold' }}>
              Pojazd / Nr rejestracyjny
            </Typography>
            <Typography variant="body1" gutterBottom>
              {waybill.vehicle || '-'}
            </Typography>
          </Grid>
          
          <Grid item xs={12} md={6}>
            <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 'bold' }}>
              Osoba kontaktowa
            </Typography>
            <Typography variant="body1" gutterBottom>
              {waybill.contactPerson || '-'}
            </Typography>
          </Grid>
          
          <Grid item xs={12} md={6}>
            <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 'bold' }}>
              Telefon kontaktowy
            </Typography>
            <Typography variant="body1" gutterBottom>
              {waybill.contactPhone || '-'}
            </Typography>
          </Grid>
          
          {waybill.notes && (
            <Grid item xs={12}>
              <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 'bold' }}>
                Uwagi
              </Typography>
              <Typography variant="body1" gutterBottom>
                {waybill.notes}
              </Typography>
            </Grid>
          )}
        </Grid>
      </Paper>
      
      <Typography variant="h6" gutterBottom>
        Pozycje listu przewozowego
      </Typography>
      
      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Produkt</TableCell>
              <TableCell align="right">Ilość</TableCell>
              <TableCell>Jednostka</TableCell>
              <TableCell>Uwagi</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {waybill.items && waybill.items.length > 0 ? (
              waybill.items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>{item.name}</TableCell>
                  <TableCell align="right">{item.quantity}</TableCell>
                  <TableCell>{item.unit}</TableCell>
                  <TableCell>{item.notes || '-'}</TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={4} align="center">
                  Brak pozycji w liście przewozowym
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
      
      {/* Dialog potwierdzenia usunięcia */}
      <Dialog
        open={deleteDialogOpen}
        onClose={handleDeleteCancel}
      >
        <DialogTitle>Potwierdź usunięcie</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Czy na pewno chcesz usunąć ten list przewozowy? Tej operacji nie można cofnąć.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleDeleteCancel}>Anuluj</Button>
          <Button onClick={handleDeleteConfirm} color="error">
            Usuń
          </Button>
        </DialogActions>
      </Dialog>
      
      {/* Dialog zmiany statusu */}
      <Dialog
        open={statusDialogOpen}
        onClose={handleStatusCancel}
      >
        <DialogTitle>Zmień status listu przewozowego</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            Wybierz nowy status dla listu przewozowego {waybill.waybillNumber}
          </DialogContentText>
          <FormControl fullWidth>
            <InputLabel>Status</InputLabel>
            <Select
              value={newStatus}
              onChange={handleStatusChange}
              label="Status"
            >
              <MenuItem value={WAYBILL_STATUSES.DRAFT}>Szkic</MenuItem>
              <MenuItem value={WAYBILL_STATUSES.PLANNED}>Zaplanowany</MenuItem>
              <MenuItem value={WAYBILL_STATUSES.IN_TRANSIT}>W transporcie</MenuItem>
              <MenuItem value={WAYBILL_STATUSES.DELIVERED}>Dostarczony</MenuItem>
              <MenuItem value={WAYBILL_STATUSES.CANCELED}>Anulowany</MenuItem>
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleStatusCancel}>Anuluj</Button>
          <Button onClick={handleStatusConfirm} color="primary">
            Zapisz
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default WaybillDetailsPage; 