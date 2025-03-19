import React, { useState, useEffect } from 'react';
import { 
  Container, 
  Paper, 
  Typography, 
  Button, 
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  IconButton,
  CircularProgress,
  Alert
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import pl from 'date-fns/locale/pl';
import { useAuth } from '../../../hooks/useAuth';
import { useNotification } from '../../../hooks/useNotification';
import { 
  getAllWaybills, 
  WAYBILL_STATUSES,
  WAYBILL_TYPES
} from '../../../services/logisticsService';

// Ikony
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import VisibilityIcon from '@mui/icons-material/Visibility';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';

const WaybillListPage = () => {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { showSuccess, showError } = useNotification();
  
  const [loading, setLoading] = useState(true);
  const [waybills, setWaybills] = useState([]);
  
  useEffect(() => {
    fetchWaybills();
  }, []);
  
  const fetchWaybills = async () => {
    try {
      setLoading(true);
      const data = await getAllWaybills();
      setWaybills(data);
    } catch (error) {
      console.error('Błąd podczas pobierania listów przewozowych:', error);
      showError('Nie udało się pobrać listy listów przewozowych');
    } finally {
      setLoading(false);
    }
  };
  
  const handleCreateWaybill = () => {
    navigate('/logistics/waybill/create');
  };
  
  const handleEditWaybill = (id) => {
    navigate(`/logistics/waybill/${id}/edit`);
  };
  
  const handleViewWaybill = (id) => {
    navigate(`/logistics/waybill/${id}`);
  };
  
  const formatDate = (date) => {
    if (!date) return '-';
    try {
      return format(date, 'dd.MM.yyyy', { locale: pl });
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
    
    return <Chip label={status} color={color} size="small" />;
  };
  
  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Box sx={{ mb: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h5">
          Listy przewozowe
        </Typography>
        <Button
          variant="contained"
          color="primary"
          startIcon={<AddIcon />}
          onClick={handleCreateWaybill}
        >
          Nowy list przewozowy
        </Button>
      </Box>
      
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
          <CircularProgress />
        </Box>
      ) : waybills.length === 0 ? (
        <Alert severity="info">
          Brak listów przewozowych w systemie. Kliknij "Nowy list przewozowy", aby dodać pierwszy.
        </Alert>
      ) : (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Numer</TableCell>
                <TableCell>Typ</TableCell>
                <TableCell>Data planowana</TableCell>
                <TableCell>Trasa</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Akcje</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {waybills.map((waybill) => (
                <TableRow key={waybill.id}>
                  <TableCell>{waybill.waybillNumber}</TableCell>
                  <TableCell>{waybill.type}</TableCell>
                  <TableCell>{formatDate(waybill.plannedDate)}</TableCell>
                  <TableCell>
                    {waybill.sourceLocation} → {waybill.destinationLocation}
                  </TableCell>
                  <TableCell>{renderStatusChip(waybill.status)}</TableCell>
                  <TableCell>
                    <IconButton
                      size="small"
                      onClick={() => handleViewWaybill(waybill.id)}
                      title="Podgląd"
                    >
                      <VisibilityIcon fontSize="small" />
                    </IconButton>
                    
                    {waybill.status !== WAYBILL_STATUSES.DELIVERED && (
                      <IconButton
                        size="small"
                        onClick={() => handleEditWaybill(waybill.id)}
                        title="Edytuj"
                      >
                        <EditIcon fontSize="small" />
                      </IconButton>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Container>
  );
};

export default WaybillListPage; 