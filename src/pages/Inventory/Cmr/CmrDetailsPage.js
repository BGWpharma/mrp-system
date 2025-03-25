import React, { useState, useEffect } from 'react';
import { 
  Container, 
  Typography, 
  Box, 
  Paper, 
  Grid, 
  Divider, 
  Button, 
  Card, 
  CardHeader, 
  CardContent,
  CircularProgress,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Alert
} from '@mui/material';
import { useParams, useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import pl from 'date-fns/locale/pl';
import { useAuth } from '../../../hooks/useAuth';
import { useNotification } from '../../../hooks/useNotification';
import { 
  getCmrDocumentById, 
  updateCmrStatus, 
  CMR_STATUSES 
} from '../../../services/cmrService';

// Ikony
import EditIcon from '@mui/icons-material/Edit';
import PrintIcon from '@mui/icons-material/Print';
import EventIcon from '@mui/icons-material/Event';
import BusinessIcon from '@mui/icons-material/Business';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import PersonIcon from '@mui/icons-material/Person';
import InventoryIcon from '@mui/icons-material/Inventory';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';

const CmrDetailsPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { showSuccess, showError } = useNotification();
  
  const [loading, setLoading] = useState(true);
  const [cmrData, setCmrData] = useState(null);
  
  useEffect(() => {
    fetchCmrDocument();
  }, [id]);
  
  const fetchCmrDocument = async () => {
    try {
      setLoading(true);
      const data = await getCmrDocumentById(id);
      setCmrData(data);
    } catch (error) {
      console.error('Błąd podczas pobierania dokumentu CMR:', error);
      showError('Nie udało się pobrać dokumentu CMR');
      navigate('/inventory/cmr');
    } finally {
      setLoading(false);
    }
  };
  
  const handleEdit = () => {
    navigate(`/inventory/cmr/${id}/edit`);
  };
  
  const handleBack = () => {
    navigate('/inventory/cmr');
  };
  
  const handlePrint = () => {
    window.print();
  };
  
  const handleStatusChange = async (newStatus) => {
    try {
      await updateCmrStatus(id, newStatus, currentUser.uid);
      showSuccess(`Status dokumentu CMR zmieniony na: ${newStatus}`);
      fetchCmrDocument();
    } catch (error) {
      console.error('Błąd podczas zmiany statusu dokumentu CMR:', error);
      showError('Nie udało się zmienić statusu dokumentu CMR');
    }
  };
  
  const formatDate = (date) => {
    if (!date) return '-';
    try {
      return format(date, 'dd MMMM yyyy', { locale: pl });
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
    
    return <Chip label={status} color={color} />;
  };
  
  if (loading) {
    return (
      <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
          <CircularProgress />
        </Box>
      </Container>
    );
  }
  
  if (!cmrData) {
    return (
      <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
        <Alert severity="error">
          Nie znaleziono dokumentu CMR o podanym identyfikatorze.
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
  
  const isEditable = cmrData.status === CMR_STATUSES.DRAFT || cmrData.status === CMR_STATUSES.ISSUED;
  
  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      {/* Nagłówek */}
      <Box sx={{ mb: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Box>
          <Typography variant="h5">
            Dokument CMR: {cmrData.cmrNumber}
          </Typography>
          <Typography variant="subtitle1" color="text.secondary">
            Status: {renderStatusChip(cmrData.status)}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 2 }}>
          <Button
            variant="outlined"
            startIcon={<ArrowBackIcon />}
            onClick={handleBack}
          >
            Powrót
          </Button>
          
          {isEditable && (
            <Button
              variant="outlined"
              startIcon={<EditIcon />}
              onClick={handleEdit}
            >
              Edytuj
            </Button>
          )}
          
          <Button
            variant="outlined"
            startIcon={<PrintIcon />}
            onClick={handlePrint}
          >
            Drukuj
          </Button>
        </Box>
      </Box>
      
      {/* Główne informacje */}
      <Grid container spacing={3}>
        {/* Informacje podstawowe */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardHeader 
              title="Informacje podstawowe" 
              titleTypographyProps={{ variant: 'h6' }}
            />
            <Divider />
            <CardContent>
              <Grid container spacing={2}>
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">
                    Numer CMR
                  </Typography>
                  <Typography variant="body1">
                    {cmrData.cmrNumber}
                  </Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">
                    Data wystawienia
                  </Typography>
                  <Typography variant="body1">
                    {formatDate(cmrData.issueDate)}
                  </Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">
                    Data dostawy
                  </Typography>
                  <Typography variant="body1">
                    {formatDate(cmrData.deliveryDate)}
                  </Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">
                    Typ transportu
                  </Typography>
                  <Typography variant="body1">
                    {cmrData.transportType}
                  </Typography>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>
        
        {/* Strony */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardHeader 
              title="Strony" 
              titleTypographyProps={{ variant: 'h6' }}
            />
            <Divider />
            <CardContent>
              <Grid container spacing={2}>
                <Grid item xs={12}>
                  <Typography variant="body2" color="text.secondary">
                    Nadawca
                  </Typography>
                  <Typography variant="body1">
                    {cmrData.sender}
                  </Typography>
                  <Typography variant="body2">
                    {cmrData.senderAddress}
                    {cmrData.senderPostalCode && cmrData.senderCity && (
                      <>, {cmrData.senderPostalCode} {cmrData.senderCity}</>
                    )}
                    {cmrData.senderCountry && (
                      <>, {cmrData.senderCountry}</>
                    )}
                  </Typography>
                </Grid>
                <Grid item xs={12}>
                  <Typography variant="body2" color="text.secondary">
                    Odbiorca
                  </Typography>
                  <Typography variant="body1">
                    {cmrData.recipient}
                  </Typography>
                  <Typography variant="body2">
                    {cmrData.recipientAddress}
                    {cmrData.recipientPostalCode && cmrData.recipientCity && (
                      <>, {cmrData.recipientPostalCode} {cmrData.recipientCity}</>
                    )}
                    {cmrData.recipientCountry && (
                      <>, {cmrData.recipientCountry}</>
                    )}
                  </Typography>
                </Grid>
                <Grid item xs={12}>
                  <Typography variant="body2" color="text.secondary">
                    Przewoźnik
                  </Typography>
                  <Typography variant="body1">
                    {cmrData.carrier}
                  </Typography>
                  <Typography variant="body2">
                    {cmrData.carrierAddress}
                    {cmrData.carrierPostalCode && cmrData.carrierCity && (
                      <>, {cmrData.carrierPostalCode} {cmrData.carrierCity}</>
                    )}
                    {cmrData.carrierCountry && (
                      <>, {cmrData.carrierCountry}</>
                    )}
                  </Typography>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>
        
        {/* Miejsce załadunku i rozładunku */}
        <Grid item xs={12}>
          <Card>
            <CardHeader 
              title="Miejsce załadunku i rozładunku" 
              titleTypographyProps={{ variant: 'h6' }}
            />
            <Divider />
            <CardContent>
              <Grid container spacing={2}>
                <Grid item xs={12} md={6}>
                  <Typography variant="body2" color="text.secondary">
                    Miejsce załadunku
                  </Typography>
                  <Typography variant="body1">
                    {cmrData.loadingPlace || '-'}
                  </Typography>
                  
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                    Data załadunku
                  </Typography>
                  <Typography variant="body1">
                    {formatDate(cmrData.loadingDate)}
                  </Typography>
                </Grid>
                
                <Grid item xs={12} md={6}>
                  <Typography variant="body2" color="text.secondary">
                    Miejsce dostawy
                  </Typography>
                  <Typography variant="body1">
                    {cmrData.deliveryPlace || '-'}
                  </Typography>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>
        
        {/* Dokumenty i instrukcje */}
        <Grid item xs={12}>
          <Card>
            <CardHeader 
              title="Dokumenty i instrukcje" 
              titleTypographyProps={{ variant: 'h6' }}
            />
            <Divider />
            <CardContent>
              <Grid container spacing={2}>
                <Grid item xs={12} md={6}>
                  <Typography variant="body2" color="text.secondary">
                    Załączone dokumenty
                  </Typography>
                  <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap' }}>
                    {cmrData.attachedDocuments || '-'}
                  </Typography>
                </Grid>
                
                <Grid item xs={12} md={6}>
                  <Typography variant="body2" color="text.secondary">
                    Instrukcje nadawcy
                  </Typography>
                  <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap' }}>
                    {cmrData.instructionsFromSender || '-'}
                  </Typography>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>
        
        {/* Informacje o pojeździe */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardHeader 
              title="Informacje o pojeździe" 
              titleTypographyProps={{ variant: 'h6' }}
            />
            <Divider />
            <CardContent>
              <Grid container spacing={2}>
                <Grid item xs={12} md={6}>
                  <Typography variant="body2" color="text.secondary">
                    Numer rejestracyjny pojazdu
                  </Typography>
                  <Typography variant="body1">
                    {cmrData.vehicleInfo?.vehicleRegistration || '-'}
                  </Typography>
                </Grid>
                
                <Grid item xs={12} md={6}>
                  <Typography variant="body2" color="text.secondary">
                    Numer rejestracyjny naczepy
                  </Typography>
                  <Typography variant="body1">
                    {cmrData.vehicleInfo?.trailerRegistration || '-'}
                  </Typography>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>
        
        {/* Opłaty i płatności */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardHeader 
              title="Opłaty i ustalenia szczególne" 
              titleTypographyProps={{ variant: 'h6' }}
            />
            <Divider />
            <CardContent>
              <Grid container spacing={2}>
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">
                    Przewoźne
                  </Typography>
                  <Typography variant="body1">
                    {cmrData.freight || '-'}
                  </Typography>
                </Grid>
                
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">
                    Koszty dodatkowe
                  </Typography>
                  <Typography variant="body1">
                    {cmrData.carriage || '-'}
                  </Typography>
                </Grid>
                
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">
                    Bonifikaty
                  </Typography>
                  <Typography variant="body1">
                    {cmrData.discounts || '-'}
                  </Typography>
                </Grid>
                
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">
                    Saldo
                  </Typography>
                  <Typography variant="body1">
                    {cmrData.balance || '-'}
                  </Typography>
                </Grid>
                
                <Grid item xs={12} sx={{ mt: 2 }}>
                  <Typography variant="body2" color="text.secondary">
                    Płatność
                  </Typography>
                  <Typography variant="body1">
                    {cmrData.paymentMethod === 'sender' ? 'Płaci nadawca' : 
                     cmrData.paymentMethod === 'recipient' ? 'Płaci odbiorca' : 
                     'Inny sposób płatności'}
                  </Typography>
                </Grid>
                
                <Grid item xs={12} sx={{ mt: 2 }}>
                  <Typography variant="body2" color="text.secondary">
                    Ustalenia szczególne
                  </Typography>
                  <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap' }}>
                    {cmrData.specialAgreements || '-'}
                  </Typography>
                </Grid>
                
                <Grid item xs={12} sx={{ mt: 2 }}>
                  <Typography variant="body2" color="text.secondary">
                    Zastrzeżenia i uwagi przewoźnika
                  </Typography>
                  <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap' }}>
                    {cmrData.reservations || '-'}
                  </Typography>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>
        
        {/* Elementy dokumentu CMR */}
        <Grid item xs={12}>
          <Card>
            <CardHeader 
              title="Elementy dokumentu CMR" 
              titleTypographyProps={{ variant: 'h6' }}
            />
            <Divider />
            <CardContent>
              {cmrData.items && cmrData.items.length > 0 ? (
                <TableContainer>
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableCell>Lp.</TableCell>
                        <TableCell>Opis</TableCell>
                        <TableCell>Ilość</TableCell>
                        <TableCell>Jednostka</TableCell>
                        <TableCell>Waga (kg)</TableCell>
                        <TableCell>Objętość (m³)</TableCell>
                        <TableCell>Uwagi</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {cmrData.items.map((item, index) => (
                        <TableRow key={item.id || index}>
                          <TableCell>{index + 1}</TableCell>
                          <TableCell>{item.description}</TableCell>
                          <TableCell>{item.quantity}</TableCell>
                          <TableCell>{item.unit}</TableCell>
                          <TableCell>{item.weight}</TableCell>
                          <TableCell>{item.volume}</TableCell>
                          <TableCell>{item.notes}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              ) : (
                <Typography variant="body1" sx={{ textAlign: 'center', py: 2 }}>
                  Brak elementów w dokumencie CMR
                </Typography>
              )}
            </CardContent>
          </Card>
        </Grid>
        
        {/* Uwagi i informacje dodatkowe */}
        <Grid item xs={12}>
          <Card>
            <CardHeader 
              title="Uwagi i informacje dodatkowe" 
              titleTypographyProps={{ variant: 'h6' }}
            />
            <Divider />
            <CardContent>
              <Typography variant="body1">
                {cmrData.notes || 'Brak uwag'}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        
        {/* Akcje zmiany statusu */}
        {isEditable && (
          <Grid item xs={12}>
            <Card>
              <CardHeader 
                title="Zmiana statusu" 
                titleTypographyProps={{ variant: 'h6' }}
              />
              <Divider />
              <CardContent>
                <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                  {cmrData.status === CMR_STATUSES.DRAFT && (
                    <Button 
                      variant="contained" 
                      color="primary"
                      onClick={() => handleStatusChange(CMR_STATUSES.ISSUED)}
                    >
                      Wystaw dokument
                    </Button>
                  )}
                  
                  {cmrData.status === CMR_STATUSES.ISSUED && (
                    <Button 
                      variant="contained" 
                      color="warning"
                      onClick={() => handleStatusChange(CMR_STATUSES.IN_TRANSIT)}
                    >
                      Rozpocznij transport
                    </Button>
                  )}
                  
                  {cmrData.status === CMR_STATUSES.IN_TRANSIT && (
                    <Button 
                      variant="contained" 
                      color="success"
                      onClick={() => handleStatusChange(CMR_STATUSES.DELIVERED)}
                    >
                      Oznacz jako dostarczony
                    </Button>
                  )}
                  
                  {cmrData.status === CMR_STATUSES.DELIVERED && (
                    <Button 
                      variant="contained" 
                      color="info"
                      onClick={() => handleStatusChange(CMR_STATUSES.COMPLETED)}
                    >
                      Zakończ
                    </Button>
                  )}
                  
                  {(cmrData.status === CMR_STATUSES.DRAFT || 
                    cmrData.status === CMR_STATUSES.ISSUED) && (
                    <Button 
                      variant="contained" 
                      color="error"
                      onClick={() => handleStatusChange(CMR_STATUSES.CANCELED)}
                    >
                      Anuluj
                    </Button>
                  )}
                </Box>
              </CardContent>
            </Card>
          </Grid>
        )}
      </Grid>
    </Container>
  );
};

export default CmrDetailsPage; 