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
  Phone as CallIcon,
  Email as EmailIcon,
  EventNote as MeetingIcon,
  Note as NoteIcon,
  Schedule as ScheduleIcon,
  CheckCircle as StatusIcon,
  Person as PersonIcon,
  History as HistoryIcon,
  Add as AddIcon
} from '@mui/icons-material';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { getInteractionById, getContactById, deleteInteraction } from '../../services/crmService';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';
import { INTERACTION_TYPES, INTERACTION_STATUSES } from '../../utils/constants';

const InteractionDetailsPage = () => {
  const { interactionId } = useParams();
  const [interaction, setInteraction] = useState(null);
  const [contact, setContact] = useState(null);
  const [loading, setLoading] = useState(true);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const { currentUser } = useAuth();
  const { showSuccess, showError } = useNotification();
  const navigate = useNavigate();

  useEffect(() => {
    fetchInteractionData();
  }, [interactionId]);

  const fetchInteractionData = async () => {
    try {
      setLoading(true);
      const interactionData = await getInteractionById(interactionId);
      setInteraction(interactionData);

      if (interactionData.contactId) {
        const contactData = await getContactById(interactionData.contactId);
        setContact(contactData);
      }
    } catch (error) {
      console.error('Błąd podczas pobierania danych interakcji:', error);
      showError('Nie udało się pobrać danych interakcji: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteClick = () => {
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    try {
      await deleteInteraction(interactionId);
      showSuccess('Interakcja została usunięta');
      
      // Jeśli mamy dane kontaktu, przekieruj do jego szczegółów, w przeciwnym razie do listy interakcji
      if (contact && contact.id) {
        navigate(`/crm/contacts/${contact.id}`);
      } else {
        navigate('/crm/interactions');
      }
    } catch (error) {
      console.error('Błąd podczas usuwania interakcji:', error);
      showError('Nie udało się usunąć interakcji: ' + error.message);
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

    return format(date, 'dd MMMM yyyy, HH:mm', { locale: pl });
  };

  const formatDateShort = (dateString) => {
    if (!dateString) return '';
    let date;

    if (typeof dateString === 'object' && dateString.seconds) {
      date = new Date(dateString.seconds * 1000);
    } else {
      date = new Date(dateString);
    }

    return format(date, 'dd.MM.yyyy, HH:mm', { locale: pl });
  };

  const getTypeIcon = (type) => {
    switch (type) {
      case INTERACTION_TYPES.CALL:
        return <CallIcon color="primary" />;
      case INTERACTION_TYPES.EMAIL:
        return <EmailIcon color="info" />;
      case INTERACTION_TYPES.MEETING:
        return <MeetingIcon color="success" />;
      default:
        return <NoteIcon />;
    }
  };

  const getTypeText = (type) => {
    switch (type) {
      case INTERACTION_TYPES.CALL:
        return 'Rozmowa telefoniczna';
      case INTERACTION_TYPES.EMAIL:
        return 'Email';
      case INTERACTION_TYPES.MEETING:
        return 'Spotkanie';
      case INTERACTION_TYPES.NOTE:
        return 'Notatka';
      default:
        return type;
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case INTERACTION_STATUSES.COMPLETED:
        return 'success';
      case INTERACTION_STATUSES.PLANNED:
        return 'info';
      case INTERACTION_STATUSES.IN_PROGRESS:
        return 'warning';
      case INTERACTION_STATUSES.CANCELLED:
        return 'error';
      default:
        return 'default';
    }
  };

  const getStatusText = (status) => {
    switch (status) {
      case INTERACTION_STATUSES.COMPLETED:
        return 'Zakończona';
      case INTERACTION_STATUSES.PLANNED:
        return 'Zaplanowana';
      case INTERACTION_STATUSES.IN_PROGRESS:
        return 'W trakcie';
      case INTERACTION_STATUSES.CANCELLED:
        return 'Anulowana';
      default:
        return status;
    }
  };

  const getContactName = () => {
    if (!contact) return 'Nieznany kontakt';
    
    const fullName = `${contact.firstName || ''} ${contact.lastName || ''}`.trim();
    return fullName || contact.company || 'Brak nazwy';
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  if (!interaction) {
    return (
      <Container>
        <Box mt={4} mb={4} display="flex" alignItems="center">
          <Button 
            component={Link} 
            to="/crm/interactions" 
            startIcon={<ArrowBackIcon />}
            sx={{ mr: 2 }}
          >
            Powrót do listy
          </Button>
          <Typography variant="h4" component="h1">
            Interakcja nie istnieje
          </Typography>
        </Box>
        <Paper sx={{ p: 3 }}>
          <Typography>
            Nie znaleziono interakcji o podanym identyfikatorze. Interakcja mogła zostać usunięta.
          </Typography>
          <Button 
            variant="contained" 
            component={Link}
            to="/crm/interactions"
            sx={{ mt: 2 }}
          >
            Wróć do listy interakcji
          </Button>
        </Paper>
      </Container>
    );
  }

  return (
    <Container maxWidth="lg">
      <Box mt={4} mb={4} display="flex" justifyContent="space-between" alignItems="center">
        <Box display="flex" alignItems="center">
          <Button 
            component={Link} 
            to="/crm/interactions" 
            startIcon={<ArrowBackIcon />}
            sx={{ mr: 2 }}
          >
            Powrót
          </Button>
          <Box>
            <Typography variant="h4" component="h1" display="flex" alignItems="center">
              {getTypeIcon(interaction.type)}
              <Box component="span" ml={1}>{interaction.subject}</Box>
            </Typography>
            <Box display="flex" alignItems="center" mt={0.5}>
              <Chip 
                label={getTypeText(interaction.type)} 
                size="small"
                color="primary" 
                variant="outlined"
                sx={{ mr: 1 }} 
              />
              <Chip 
                label={getStatusText(interaction.status)} 
                size="small" 
                color={getStatusColor(interaction.status)} 
              />
            </Box>
          </Box>
        </Box>
        <Box>
          <Button 
            variant="outlined" 
            color="primary" 
            startIcon={<EditIcon />} 
            component={Link}
            to={`/crm/interactions/${interactionId}/edit`}
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
        <Grid item xs={12} md={8}>
          <Card>
            <CardHeader title="Szczegóły interakcji" />
            <Divider />
            <CardContent>
              <Grid container spacing={2}>
                <Grid item xs={12} md={6}>
                  <List disablePadding>
                    <ListItem>
                      <ListItemIcon>
                        <ScheduleIcon />
                      </ListItemIcon>
                      <ListItemText 
                        primary="Data i czas"
                        secondary={formatDate(interaction.date)}
                      />
                    </ListItem>
                    <ListItem>
                      <ListItemIcon>
                        <StatusIcon />
                      </ListItemIcon>
                      <ListItemText 
                        primary="Status"
                        secondary={
                          <Chip 
                            label={getStatusText(interaction.status)} 
                            size="small" 
                            color={getStatusColor(interaction.status)} 
                          />
                        }
                      />
                    </ListItem>
                  </List>
                </Grid>
                <Grid item xs={12} md={6}>
                  <List disablePadding>
                    <ListItem button component={Link} to={`/crm/contacts/${interaction.contactId}`}>
                      <ListItemIcon>
                        <PersonIcon />
                      </ListItemIcon>
                      <ListItemText 
                        primary="Kontakt"
                        secondary={getContactName()}
                      />
                    </ListItem>
                    <ListItem>
                      <ListItemIcon>
                        {getTypeIcon(interaction.type)}
                      </ListItemIcon>
                      <ListItemText 
                        primary="Typ"
                        secondary={getTypeText(interaction.type)}
                      />
                    </ListItem>
                  </List>
                </Grid>
              </Grid>

              <Box mt={2}>
                <Typography variant="subtitle1">Notatki</Typography>
                <Paper variant="outlined" sx={{ p: 2, mt: 1, minHeight: '100px' }}>
                  {interaction.notes ? (
                    <Typography variant="body2" style={{ whiteSpace: 'pre-wrap' }}>
                      {interaction.notes}
                    </Typography>
                  ) : (
                    <Typography variant="body2" color="textSecondary" align="center">
                      Brak notatek
                    </Typography>
                  )}
                </Paper>
              </Box>
            </CardContent>
          </Card>

          <Box mt={3} display="flex" justifyContent="space-between">
            <Button 
              variant="outlined" 
              component={Link}
              to={`/crm/interactions/new?contactId=${interaction.contactId}`}
              startIcon={<AddIcon />}
            >
              Nowa interakcja z tym kontaktem
            </Button>
          </Box>
        </Grid>

        <Grid item xs={12} md={4}>
          <Card>
            <CardHeader title="Informacje systemowe" />
            <Divider />
            <CardContent>
              <List>
                <ListItem>
                  <ListItemIcon>
                    <HistoryIcon />
                  </ListItemIcon>
                  <ListItemText 
                    primary="Utworzono"
                    secondary={formatDateShort(interaction.createdAt)}
                  />
                </ListItem>
                {interaction.updatedAt && (
                  <ListItem>
                    <ListItemIcon>
                      <HistoryIcon />
                    </ListItemIcon>
                    <ListItemText 
                      primary="Ostatnia modyfikacja"
                      secondary={formatDateShort(interaction.updatedAt)}
                    />
                  </ListItem>
                )}
              </List>
            </CardContent>
          </Card>

          {contact && (
            <Card sx={{ mt: 3 }}>
              <CardHeader title="Kontakt" />
              <Divider />
              <CardContent>
                <Box>
                  <Typography variant="h6">
                    {getContactName()}
                  </Typography>
                  {contact.company && (
                    <Typography variant="body2" color="textSecondary">
                      {contact.company}
                    </Typography>
                  )}
                  {contact.position && (
                    <Typography variant="body2" color="textSecondary">
                      {contact.position}
                    </Typography>
                  )}
                </Box>
                <Divider sx={{ my: 2 }} />
                <List disablePadding dense>
                  {contact.email && (
                    <ListItem disableGutters>
                      <ListItemIcon sx={{ minWidth: 30 }}>
                        <EmailIcon fontSize="small" />
                      </ListItemIcon>
                      <ListItemText primary={contact.email} />
                    </ListItem>
                  )}
                  {contact.phone && (
                    <ListItem disableGutters>
                      <ListItemIcon sx={{ minWidth: 30 }}>
                        <CallIcon fontSize="small" />
                      </ListItemIcon>
                      <ListItemText primary={contact.phone} />
                    </ListItem>
                  )}
                </List>
                <Button 
                  fullWidth 
                  variant="outlined"
                  component={Link}
                  to={`/crm/contacts/${contact.id}`}
                  sx={{ mt: 2 }}
                >
                  Zobacz szczegóły kontaktu
                </Button>
              </CardContent>
            </Card>
          )}
        </Grid>
      </Grid>

      {/* Dialog potwierdzenia usunięcia */}
      <Dialog
        open={deleteDialogOpen}
        onClose={handleDeleteCancel}
      >
        <DialogTitle>Usuń interakcję</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Czy na pewno chcesz usunąć interakcję "{interaction.subject}"?
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

export default InteractionDetailsPage; 