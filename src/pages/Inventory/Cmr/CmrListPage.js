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
  getAllCmrDocuments, 
  CMR_STATUSES,
  TRANSPORT_TYPES
} from '../../../services/cmrService';

// Ikony
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import VisibilityIcon from '@mui/icons-material/Visibility';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import NoteIcon from '@mui/icons-material/Note';

const CmrListPage = () => {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { showSuccess, showError } = useNotification();
  
  const [loading, setLoading] = useState(true);
  const [cmrDocuments, setCmrDocuments] = useState([]);
  
  useEffect(() => {
    fetchCmrDocuments();
  }, []);
  
  const fetchCmrDocuments = async () => {
    try {
      setLoading(true);
      const data = await getAllCmrDocuments();
      setCmrDocuments(data);
    } catch (error) {
      console.error('Błąd podczas pobierania dokumentów CMR:', error);
      showError('Nie udało się pobrać listy dokumentów CMR');
    } finally {
      setLoading(false);
    }
  };
  
  const handleCreateCmr = () => {
    navigate('/inventory/cmr/create');
  };
  
  const handleEditCmr = (id) => {
    navigate(`/inventory/cmr/${id}/edit`);
  };
  
  const handleViewCmr = (id) => {
    navigate(`/inventory/cmr/${id}`);
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
      case CMR_STATUSES.DRAFT:
        color = 'default';
        break;
      case CMR_STATUSES.ISSUED:
        color = 'primary';
        break;
      case CMR_STATUSES.IN_TRANSIT:
        color = 'warning';
        break;
      case CMR_STATUSES.DELIVERED:
        color = 'success';
        break;
      case CMR_STATUSES.COMPLETED:
        color = 'info';
        break;
      case CMR_STATUSES.CANCELED:
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
          Dokumenty CMR
        </Typography>
        <Button
          variant="contained"
          color="primary"
          startIcon={<AddIcon />}
          onClick={handleCreateCmr}
        >
          Nowy dokument CMR
        </Button>
      </Box>
      
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
          <CircularProgress />
        </Box>
      ) : cmrDocuments.length === 0 ? (
        <Alert severity="info">
          Brak dokumentów CMR w systemie. Kliknij "Nowy dokument CMR", aby dodać pierwszy.
        </Alert>
      ) : (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Numer CMR</TableCell>
                <TableCell>Data wystawienia</TableCell>
                <TableCell>Nadawca</TableCell>
                <TableCell>Odbiorca</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Akcje</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {cmrDocuments.map((cmr) => (
                <TableRow key={cmr.id}>
                  <TableCell>{cmr.cmrNumber}</TableCell>
                  <TableCell>{formatDate(cmr.issueDate)}</TableCell>
                  <TableCell>{cmr.sender}</TableCell>
                  <TableCell>{cmr.recipient}</TableCell>
                  <TableCell>{renderStatusChip(cmr.status)}</TableCell>
                  <TableCell>
                    <IconButton
                      size="small"
                      onClick={() => handleViewCmr(cmr.id)}
                      title="Podgląd"
                    >
                      <VisibilityIcon fontSize="small" />
                    </IconButton>
                    
                    {cmr.status !== CMR_STATUSES.COMPLETED && cmr.status !== CMR_STATUSES.CANCELED && (
                      <IconButton
                        size="small"
                        onClick={() => handleEditCmr(cmr.id)}
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

export default CmrListPage; 