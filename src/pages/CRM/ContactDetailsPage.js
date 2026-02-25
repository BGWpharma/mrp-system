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
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  IconButton,
  Card,
  CardHeader,
  CardContent,
  Tabs,
  Tab,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Tooltip
} from '@mui/material';
import {
  Edit as EditIcon,
  Delete as DeleteIcon,
  ArrowBack as ArrowBackIcon,
  Phone as PhoneIcon,
  Email as EmailIcon,
  Business as BusinessIcon,
  Person as PersonIcon,
  LocationOn as LocationIcon,
  Note as NoteIcon,
  Phone as CallIcon,
  Email as EmailActionIcon,
  EventNote as MeetingIcon,
  Add as AddIcon,
  FileCopy as FileCopyIcon
} from '@mui/icons-material';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { getContactById, getContactInteractions, deleteContact } from '../../services/crmService';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';
import { useTranslation } from '../../hooks/useTranslation';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';
import { INTERACTION_TYPES } from '../../utils/constants';

const ContactDetailsPage = () => {
  const { contactId } = useParams();
  const [contact, setContact] = useState(null);
  const [interactions, setInteractions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tabValue, setTabValue] = useState(0);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  
  const { currentUser } = useAuth();
  const { showSuccess, showError } = useNotification();
  const { t } = useTranslation('customers');
  const navigate = useNavigate();
  
  useEffect(() => {
    let cancelled = false;
    const fetchContactData = async () => {
      try {
        setLoading(true);
        
        // Pobierz dane kontaktu
        const contactData = await getContactById(contactId);
        if (cancelled) return;
        setContact(contactData);
        
        // Pobierz interakcje zakupowe związane z kontaktem
        const contactInteractions = await getContactInteractions(contactId);
        if (cancelled) return;
        setInteractions(contactInteractions);
        
      } catch (error) {
        if (cancelled) return;
        console.error('Błąd podczas pobierania danych kontaktu:', error);
        showError('Nie udało się pobrać danych kontaktu: ' + error.message);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };
    fetchContactData();
    return () => { cancelled = true; };
  }, [contactId]);
  
  const handleTabChange = (event, newValue) => {
    setTabValue(newValue);
  };
  
  const handleDeleteClick = () => {
    setDeleteDialogOpen(true);
  };
  
  const handleDeleteConfirm = async () => {
    try {
      await deleteContact(contactId);
      showSuccess('Kontakt został usunięty');
      navigate('/crm/contacts');
    } catch (error) {
      console.error('Błąd podczas usuwania kontaktu:', error);
      showError('Nie udało się usunąć kontaktu: ' + error.message);
    } finally {
      setDeleteDialogOpen(false);
    }
  };
  
  const handleDeleteCancel = () => {
    setDeleteDialogOpen(false);
  };
  
  const formatDate = (dateString) => {
    if (!dateString) return '';
    let date;
    
    if (typeof dateString === 'object' && dateString.seconds) {
      // Convert Firestore Timestamp to Date
      date = new Date(dateString.seconds * 1000);
    } else {
      date = new Date(dateString);
    }
    
    return format(date, 'dd MMM yyyy, HH:mm', { locale: pl });
  };
  
  const getInteractionIcon = (type) => {
    switch (type) {
      case INTERACTION_TYPES.CALL:
        return <CallIcon color="primary" />;
      case INTERACTION_TYPES.EMAIL:
        return <EmailActionIcon color="info" />;
      case INTERACTION_TYPES.MEETING:
        return <MeetingIcon color="success" />;
      default:
        return <NoteIcon />;
    }
  };
  
  const getFullName = () => {
    if (!contact) return '';
    return [contact.firstName, contact.lastName].filter(Boolean).join(' ') || 'Brak nazwy';
  };
  
  const handleCopyEmail = (email) => {
    navigator.clipboard.writeText(email)
      .then(() => {
        showSuccess('Email skopiowany do schowka');
      })
      .catch((error) => {
        showError('Nie udało się skopiować emaila: ' + error.message);
      });
  };
  
  const handleCopyPhone = (phone) => {
    navigator.clipboard.writeText(phone)
      .then(() => {
        showSuccess('Numer telefonu skopiowany do schowka');
      })
      .catch((error) => {
        showError('Nie udało się skopiować numeru telefonu: ' + error.message);
      });
  };
  
  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }
  
  if (!contact) {
    return (
      <Container>
        <Box mt={4} mb={4} display="flex" alignItems="center">
          <Button 
            component={Link} 
            to="/crm/contacts" 
            startIcon={<ArrowBackIcon />}
            sx={{ mr: 2 }}
          >
            Powrót do listy
          </Button>
          <Typography variant="h4" component="h1">
            Kontakt nie istnieje
          </Typography>
        </Box>
        <Paper sx={{ p: 3 }}>
          <Typography>
            Nie znaleziono kontaktu o podanym identyfikatorze. Kontakt mógł zostać usunięty.
          </Typography>
          <Button 
            variant="contained" 
            component={Link}
            to="/crm/contacts"
            sx={{ mt: 2 }}
          >
            Wróć do listy kontaktów
          </Button>
        </Paper>
      </Container>
    );
  }
  
  return (
    <Container maxWidth="xl">
      <Box mt={4} mb={4} display="flex" justifyContent="space-between" alignItems="center">
        <Box display="flex" alignItems="center">
          <Button 
            component={Link} 
            to="/crm/contacts" 
            startIcon={<ArrowBackIcon />}
            sx={{ mr: 2 }}
          >
            Powrót
          </Button>
          <Typography variant="h4" component="h1">
            {getFullName()}
          </Typography>
          <Chip 
            label={contact.type} 
            size="small" 
            color="primary" 
            sx={{ ml: 2 }} 
          />
        </Box>
        <Box>
          <Button 
            variant="outlined" 
            color="primary" 
            startIcon={<EditIcon />} 
            component={Link}
            to={`/crm/contacts/${contactId}/edit`}
            sx={{ mr: 1 }}
          >
            Edytuj
          </Button>
          <Button 
            variant="outlined" 
            color="error" 
            startIcon={<DeleteIcon />}
            onClick={handleDeleteClick}
          >
            Usuń
          </Button>
        </Box>
      </Box>
      
      <Grid container spacing={3}>
        <Grid item xs={12} md={4}>
          <Card>
            <CardHeader title="Informacje o kontakcie" />
            <Divider />
            <CardContent>
              <List>
                {contact.company && (
                  <ListItem>
                    <ListItemIcon>
                      <BusinessIcon />
                    </ListItemIcon>
                    <ListItemText 
                      primary="Firma"
                      secondary={contact.company}
                    />
                  </ListItem>
                )}
                
                {contact.position && (
                  <ListItem>
                    <ListItemIcon>
                      <PersonIcon />
                    </ListItemIcon>
                    <ListItemText 
                      primary="Stanowisko"
                      secondary={contact.position}
                    />
                  </ListItem>
                )}
                
                {contact.email && (
                  <ListItem>
                    <ListItemIcon>
                      <EmailIcon />
                    </ListItemIcon>
                    <ListItemText 
                      primary="Email"
                      secondary={contact.email}
                    />
                    <Tooltip title="Kopiuj email">
                      <IconButton 
                        edge="end" 
                        aria-label="copy" 
                        onClick={() => handleCopyEmail(contact.email)}
                      >
                        <FileCopyIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </ListItem>
                )}
                
                {contact.phone && (
                  <ListItem>
                    <ListItemIcon>
                      <PhoneIcon />
                    </ListItemIcon>
                    <ListItemText 
                      primary="Telefon"
                      secondary={contact.phone}
                    />
                    <Tooltip title="Kopiuj numer">
                      <IconButton 
                        edge="end" 
                        aria-label="copy" 
                        onClick={() => handleCopyPhone(contact.phone)}
                      >
                        <FileCopyIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </ListItem>
                )}
                
                {contact.mobile && (
                  <ListItem>
                    <ListItemIcon>
                      <PhoneIcon />
                    </ListItemIcon>
                    <ListItemText 
                      primary="Telefon komórkowy"
                      secondary={contact.mobile}
                    />
                    <Tooltip title="Kopiuj numer">
                      <IconButton 
                        edge="end" 
                        aria-label="copy" 
                        onClick={() => handleCopyPhone(contact.mobile)}
                      >
                        <FileCopyIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </ListItem>
                )}
                
                {(contact.address?.street || contact.address?.city || contact.address?.postalCode) && (
                  <ListItem>
                    <ListItemIcon>
                      <LocationIcon />
                    </ListItemIcon>
                    <ListItemText 
                      primary="Adres"
                      secondary={
                        <>
                          {contact.address?.street && <div>{contact.address.street}</div>}
                          {contact.address?.postalCode || contact.address?.city ? (
                            <div>
                              {contact.address?.postalCode} {contact.address?.city}
                            </div>
                          ) : null}
                          {contact.address?.country && contact.address.country !== 'Polska' && (
                            <div>{contact.address.country}</div>
                          )}
                        </>
                      }
                    />
                  </ListItem>
                )}
                
                {contact.notes && (
                  <ListItem>
                    <ListItemIcon>
                      <NoteIcon />
                    </ListItemIcon>
                    <ListItemText 
                      primary="Notatki"
                      secondary={contact.notes}
                      secondaryTypographyProps={{ 
                        style: { whiteSpace: 'pre-wrap' } 
                      }}
                    />
                  </ListItem>
                )}
              </List>
              
              <Divider sx={{ my: 2 }} />
              
              <Box display="flex" justifyContent="space-around">
                <Button 
                  startIcon={<CallIcon />}
                  component={Link}
                  to={`/crm/interactions/new?contactId=${contactId}&type=${INTERACTION_TYPES.CALL}`}
                >
                  Telefon
                </Button>
                <Button 
                  startIcon={<EmailActionIcon />}
                  component={Link}
                  to={`/crm/interactions/new?contactId=${contactId}&type=${INTERACTION_TYPES.EMAIL}`}
                >
                  Email
                </Button>
                <Button 
                  startIcon={<MeetingIcon />}
                  component={Link}
                  to={`/crm/interactions/new?contactId=${contactId}&type=${INTERACTION_TYPES.MEETING}`}
                >
                  Spotkanie
                </Button>
              </Box>
            </CardContent>
          </Card>
        </Grid>
        
        <Grid item xs={12} md={8}>
          <Paper>
            <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
              <Tabs 
                value={tabValue} 
                onChange={handleTabChange} 
                aria-label="contact tabs"
                variant="scrollable"
                scrollButtons="auto"
                allowScrollButtonsMobile
              >
                <Tab label="Interakcje zakupowe" id="tab-0" />
                <Tab label="Zadania" id="tab-1" />
                <Tab label={t('contacts.salesOpportunities')} id="tab-2" />
              </Tabs>
            </Box>
            
            {/* Tab Interakcje zakupowe */}
            <Box role="tabpanel" hidden={tabValue !== 0}>
              {tabValue === 0 && (
                <Box sx={{ p: 3 }}>
                  <Box mb={2} display="flex" justifyContent="space-between" alignItems="center">
                    <Typography variant="h6">Historia interakcji</Typography>
                    <Button 
                      variant="contained" 
                      size="small" 
                      startIcon={<AddIcon />}
                      component={Link}
                      to={`/crm/interactions/new?contactId=${contactId}`}
                    >
                      Nowa interakcja
                    </Button>
                  </Box>
                  
                  {interactions.length > 0 ? (
                    <List>
                      {interactions
                        .sort((a, b) => new Date(b.date) - new Date(a.date))
                        .map((interaction) => (
                          <ListItem 
                            key={interaction.id}
                            button
                            component={Link}
                            to={`/crm/interactions/${interaction.id}`}
                            divider
                          >
                            <ListItemIcon>
                              {getInteractionIcon(interaction.type)}
                            </ListItemIcon>
                            <ListItemText 
                              primary={
                                <Box display="flex" alignItems="center">
                                  <Typography variant="subtitle1">
                                    {interaction.subject}
                                  </Typography>
                                  <Chip 
                                    label={interaction.type} 
                                    size="small" 
                                    sx={{ ml: 1 }} 
                                  />
                                </Box>
                              }
                              secondary={
                                <>
                                  <Typography component="span" variant="body2" color="text.primary">
                                    {formatDate(interaction.date)}
                                  </Typography>
                                  {interaction.notes && (
                                    <Typography 
                                      variant="body2" 
                                      color="text.secondary"
                                      sx={{ 
                                        display: '-webkit-box',
                                        WebkitLineClamp: 2,
                                        WebkitBoxOrient: 'vertical',
                                        overflow: 'hidden'
                                      }}
                                    >
                                      {interaction.notes}
                                    </Typography>
                                  )}
                                </>
                              }
                            />
                          </ListItem>
                        ))}
                    </List>
                  ) : (
                    <Box textAlign="center" py={4}>
                      <Typography variant="body1" color="textSecondary" gutterBottom>
                        Brak interakcji z tym kontaktem
                      </Typography>
                      <Button 
                        variant="contained" 
                        startIcon={<AddIcon />}
                        component={Link}
                        to={`/crm/interactions/new?contactId=${contactId}`}
                        sx={{ mt: 2 }}
                      >
                        Dodaj pierwszą interakcję
                      </Button>
                    </Box>
                  )}
                </Box>
              )}
            </Box>
            
            {/* Tab Zadania */}
            <Box role="tabpanel" hidden={tabValue !== 1}>
              {tabValue === 1 && (
                <Box p={3} textAlign="center">
                  <Typography variant="body1" color="textSecondary">
                    Funkcjonalność zadań będzie dostępna wkrótce
                  </Typography>
                </Box>
              )}
            </Box>
            
            {/* Tab Szanse sprzedaży */}
            <Box role="tabpanel" hidden={tabValue !== 2}>
              {tabValue === 2 && (
                <Box p={3} textAlign="center">
                  <Typography variant="body1" color="textSecondary">
                    Funkcjonalność szans sprzedaży będzie dostępna wkrótce
                  </Typography>
                  <Button 
                    variant="contained" 
                    startIcon={<AddIcon />}
                    component={Link}
                    to={`/crm/opportunities/new?contactId=${contactId}`}
                    sx={{ mt: 2 }}
                  >
                    Dodaj szansę sprzedaży
                  </Button>
                </Box>
              )}
            </Box>
          </Paper>
        </Grid>
      </Grid>
      
      {/* Dialog potwierdzenia usunięcia */}
      <Dialog
        open={deleteDialogOpen}
        onClose={handleDeleteCancel}
      >
        <DialogTitle>Usuń kontakt</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Czy na pewno chcesz usunąć kontakt {getFullName()}?
            Tej operacji nie można cofnąć. Wszystkie powiązane dane, takie jak interakcje zakupowe, również zostaną usunięte.
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

export default ContactDetailsPage; 