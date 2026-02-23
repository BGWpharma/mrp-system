import React, { useState, useEffect } from 'react';
import {
  Container,
  Typography,
  Box,
  Paper,
  Grid,
  Button,
  Divider,
  CircularProgress,
  Chip,
  Card,
  CardContent,
  CardHeader,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Tooltip,
  IconButton
} from '@mui/material';
import {
  Edit as EditIcon,
  Delete as DeleteIcon,
  ArrowBack as ArrowBackIcon,
  Person as PersonIcon,
  TrendingUp as TrendingUpIcon,
  MonetizationOn as MoneyIcon,
  CalendarToday as CalendarIcon,
  BarChart as ChartIcon,
  Description as DescriptionIcon,
  Assignment as AssignmentIcon,
  Add as AddIcon
} from '@mui/icons-material';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { getOpportunityById, getContactById, deleteOpportunity } from '../../services/crmService';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';
import { OPPORTUNITY_STAGES } from '../../utils/constants';

const OpportunityDetailsPage = () => {
  const { opportunityId } = useParams();
  const [opportunity, setOpportunity] = useState(null);
  const [loading, setLoading] = useState(true);
  const [contact, setContact] = useState(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  
  const { currentUser } = useAuth();
  const { showSuccess, showError } = useNotification();
  const navigate = useNavigate();
  
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        
        const oppData = await getOpportunityById(opportunityId);
        if (cancelled) return;
        setOpportunity(oppData);
        
        if (oppData.contactId) {
          try {
            const contactData = await getContactById(oppData.contactId);
            if (cancelled) return;
            setContact(contactData);
          } catch (error) {
            if (cancelled) return;
            console.error('Błąd podczas pobierania kontaktu:', error);
            showError('Nie udało się pobrać danych kontaktu: ' + error.message);
          }
        }
      } catch (error) {
        if (cancelled) return;
        console.error('Błąd podczas pobierania szansy sprzedaży:', error);
        showError('Nie udało się pobrać szczegółów szansy sprzedaży: ' + error.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [opportunityId]);
  
  const fetchOpportunityDetails = async () => {
    try {
      setLoading(true);
      
      const oppData = await getOpportunityById(opportunityId);
      setOpportunity(oppData);
      
      if (oppData.contactId) {
        try {
          const contactData = await getContactById(oppData.contactId);
          setContact(contactData);
        } catch (error) {
          console.error('Błąd podczas pobierania kontaktu:', error);
          showError('Nie udało się pobrać danych kontaktu: ' + error.message);
        }
      }
    } catch (error) {
      console.error('Błąd podczas pobierania szansy sprzedaży:', error);
      showError('Nie udało się pobrać szczegółów szansy sprzedaży: ' + error.message);
    } finally {
      setLoading(false);
    }
  };
  
  const handleDeleteClick = () => {
    setDeleteDialogOpen(true);
  };
  
  const handleDeleteConfirm = async () => {
    try {
      await deleteOpportunity(opportunityId);
      showSuccess('Szansa sprzedaży została usunięta');
      navigate('/crm/opportunities');
    } catch (error) {
      console.error('Błąd podczas usuwania szansy sprzedaży:', error);
      showError('Nie udało się usunąć szansy sprzedaży: ' + error.message);
    }
    setDeleteDialogOpen(false);
  };
  
  const handleDeleteCancel = () => {
    setDeleteDialogOpen(false);
  };
  
  const formatDate = (dateString) => {
    if (!dateString) return 'Nie określono';
    let date;
    
    if (typeof dateString === 'object' && dateString.seconds) {
      // Convert Firestore Timestamp to Date
      date = new Date(dateString.seconds * 1000);
    } else {
      date = new Date(dateString);
    }
    
    return format(date, 'dd MMMM yyyy', { locale: pl });
  };
  
  const formatCurrency = (value) => {
    return new Intl.NumberFormat('pl-PL', { 
      style: 'currency', 
      currency: 'EUR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value || 0);
  };
  
  const getStageColor = (stage) => {
    switch (stage) {
      case OPPORTUNITY_STAGES.PROSPECTING:
        return 'primary';
      case OPPORTUNITY_STAGES.QUALIFICATION:
        return 'info';
      case OPPORTUNITY_STAGES.NEEDS_ANALYSIS:
        return 'info';
      case OPPORTUNITY_STAGES.VALUE_PROPOSITION:
        return 'warning';
      case OPPORTUNITY_STAGES.NEGOTIATION:
        return 'warning';
      case OPPORTUNITY_STAGES.CLOSED_WON:
        return 'success';
      case OPPORTUNITY_STAGES.CLOSED_LOST:
        return 'error';
      default:
        return 'default';
    }
  };
  
  const getContactName = () => {
    if (!contact) return 'Nieznany kontakt';
    const firstName = contact.firstName || '';
    const lastName = contact.lastName || '';
    return (firstName + ' ' + lastName).trim() || contact.company || 'Nieznany kontakt';
  };
  
  if (loading) {
    return (
      <Container>
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
          <CircularProgress />
        </Box>
      </Container>
    );
  }
  
  if (!opportunity) {
    return (
      <Container>
        <Box mt={4} mb={4} display="flex" alignItems="center">
          <Button 
            component={Link} 
            to="/crm/opportunities" 
            startIcon={<ArrowBackIcon />}
            sx={{ mr: 2 }}
          >
            Powrót do listy
          </Button>
          <Typography variant="h4" component="h1">
            Szansa sprzedaży nie istnieje
          </Typography>
        </Box>
        <Paper sx={{ p: 3 }}>
          <Typography>
            Nie znaleziono szansy sprzedaży o podanym identyfikatorze. Mogła zostać usunięta.
          </Typography>
          <Button 
            variant="contained" 
            component={Link}
            to="/crm/opportunities"
            sx={{ mt: 2 }}
          >
            Wróć do listy szans sprzedaży
          </Button>
        </Paper>
      </Container>
    );
  }
  
  return (
    <Container>
      <Box mt={4} mb={4} display="flex" alignItems="center" justifyContent="space-between">
        <Box display="flex" alignItems="center">
          <Button 
            component={Link} 
            to="/crm/opportunities" 
            startIcon={<ArrowBackIcon />}
            sx={{ mr: 2 }}
          >
            Powrót do listy
          </Button>
          <Typography variant="h4" component="h1">
            {opportunity.name}
          </Typography>
          <Chip 
            label={opportunity.stage} 
            color={getStageColor(opportunity.stage)} 
            sx={{ ml: 2 }}
          />
        </Box>
        <Box>
          <Button 
            variant="outlined" 
            component={Link}
            to={`/crm/opportunities/${opportunityId}/edit`}
            startIcon={<EditIcon />}
            sx={{ mr: 1 }}
          >
            Edytuj
          </Button>
          <Button 
            variant="outlined" 
            color="error"
            onClick={handleDeleteClick}
            startIcon={<DeleteIcon />}
          >
            Usuń
          </Button>
        </Box>
      </Box>
      
      <Grid container spacing={3}>
        <Grid item xs={12} md={8}>
          <Card sx={{ mb: 3 }}>
            <CardHeader title="Informacje podstawowe" />
            <Divider />
            <CardContent>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                  <Paper variant="outlined" sx={{ p: 2 }}>
                    <Typography variant="body2" color="textSecondary">Nazwa</Typography>
                    <Typography variant="body1">{opportunity.name}</Typography>
                  </Paper>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Paper variant="outlined" sx={{ p: 2 }}>
                    <Typography variant="body2" color="textSecondary">Etap</Typography>
                    <Box display="flex" alignItems="center">
                      <Typography variant="body1" mr={1}>{opportunity.stage}</Typography>
                      <Chip 
                        label={opportunity.stage} 
                        size="small"
                        color={getStageColor(opportunity.stage)} 
                      />
                    </Box>
                  </Paper>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Paper variant="outlined" sx={{ p: 2 }}>
                    <Typography variant="body2" color="textSecondary">Wartość</Typography>
                    <Typography variant="body1">{formatCurrency(opportunity.amount)}</Typography>
                  </Paper>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Paper variant="outlined" sx={{ p: 2 }}>
                    <Typography variant="body2" color="textSecondary">Prawdopodobieństwo</Typography>
                    <Typography variant="body1">{opportunity.probability || 0}%</Typography>
                  </Paper>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Paper variant="outlined" sx={{ p: 2 }}>
                    <Typography variant="body2" color="textSecondary">Planowana data zamknięcia</Typography>
                    <Typography variant="body1">{formatDate(opportunity.expectedCloseDate)}</Typography>
                  </Paper>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Paper variant="outlined" sx={{ p: 2 }}>
                    <Typography variant="body2" color="textSecondary">Ważona wartość</Typography>
                    <Typography variant="body1">
                      {formatCurrency((opportunity.amount || 0) * (opportunity.probability || 0) / 100)}
                    </Typography>
                  </Paper>
                </Grid>
              </Grid>
              
              {opportunity.notes && (
                <Box mt={3}>
                  <Typography variant="subtitle1">Notatki</Typography>
                  <Paper variant="outlined" sx={{ p: 2, mt: 1, minHeight: '100px' }}>
                    <Typography variant="body2" style={{ whiteSpace: 'pre-wrap' }}>
                      {opportunity.notes}
                    </Typography>
                  </Paper>
                </Box>
              )}
            </CardContent>
          </Card>
          
          {/* Tutaj można dodać dodatkowe karty z informacjami o produktach itp. */}
        </Grid>
        
        <Grid item xs={12} md={4}>
          <Card sx={{ mb: 3 }}>
            <CardHeader title="Kontakt" />
            <Divider />
            <CardContent>
              {contact ? (
                <Box>
                  <Box display="flex" alignItems="center" mb={2}>
                    <PersonIcon sx={{ mr: 1 }} />
                    <Typography variant="h6">{getContactName()}</Typography>
                  </Box>
                  
                  <List disablePadding>
                    {contact.company && (
                      <ListItem sx={{ px: 0, py: 0.5 }}>
                        <ListItemText 
                          primary="Firma"
                          secondary={contact.company}
                          primaryTypographyProps={{ variant: 'body2', color: 'textSecondary' }}
                        />
                      </ListItem>
                    )}
                    {contact.email && (
                      <ListItem sx={{ px: 0, py: 0.5 }}>
                        <ListItemText 
                          primary="Email"
                          secondary={contact.email}
                          primaryTypographyProps={{ variant: 'body2', color: 'textSecondary' }}
                        />
                      </ListItem>
                    )}
                    {contact.phone && (
                      <ListItem sx={{ px: 0, py: 0.5 }}>
                        <ListItemText 
                          primary="Telefon"
                          secondary={contact.phone}
                          primaryTypographyProps={{ variant: 'body2', color: 'textSecondary' }}
                        />
                      </ListItem>
                    )}
                  </List>
                  
                  <Box mt={2}>
                    <Button 
                      variant="outlined" 
                      fullWidth
                      component={Link}
                      to={`/crm/contacts/${contact.id}`}
                    >
                      Zobacz profil kontaktu
                    </Button>
                  </Box>
                </Box>
              ) : (
                <Box textAlign="center" py={2}>
                  <Typography variant="body1" color="textSecondary" gutterBottom>
                    Brak przypisanego kontaktu
                  </Typography>
                  <Button 
                    variant="contained" 
                    component={Link}
                    to={`/crm/opportunities/${opportunityId}/edit`}
                    size="small"
                  >
                    Przypisz kontakt
                  </Button>
                </Box>
              )}
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader 
              title="Działania" 
              titleTypographyProps={{ variant: 'h6' }}
            />
            <Divider />
            <CardContent>
              <List>
                <ListItem 
                  button 
                  component={Link}
                  to={`/crm/interactions/new?contactId=${opportunity.contactId}&opportunityId=${opportunityId}`}
                >
                  <ListItemIcon>
                    <AddIcon />
                  </ListItemIcon>
                  <ListItemText primary="Dodaj interakcję" />
                </ListItem>
                
                <ListItem 
                  button 
                  component={Link}
                  to={`/crm/opportunities/${opportunityId}/edit`}
                >
                  <ListItemIcon>
                    <EditIcon />
                  </ListItemIcon>
                  <ListItemText primary="Aktualizuj etap" />
                </ListItem>
              </List>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
      
      {/* Dialog potwierdzenia usunięcia */}
      <Dialog
        open={deleteDialogOpen}
        onClose={handleDeleteCancel}
      >
        <DialogTitle>Usuń szansę sprzedaży</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Czy na pewno chcesz usunąć szansę sprzedaży "{opportunity.name}"?
            Tej operacji nie można cofnąć.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleDeleteCancel} color="primary">
            Anuluj
          </Button>
          <Button onClick={handleDeleteConfirm} color="error">
            Usuń
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default OpportunityDetailsPage; 