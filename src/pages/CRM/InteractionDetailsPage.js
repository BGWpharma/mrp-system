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
import { getInteractionById, deleteInteraction } from '../../services/crmService';
import { getSupplierById } from '../../services/supplierService';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';
import { useTranslation } from '../../hooks/useTranslation';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';
import { INTERACTION_TYPES, INTERACTION_STATUSES } from '../../utils/constants';
import BackButton from '../../components/common/BackButton';
import ROUTES from '../../constants/routes';

const InteractionDetailsPage = () => {
  const { interactionId } = useParams();
  const [interaction, setInteraction] = useState(null);
  const [supplier, setSupplier] = useState(null);
  const [loading, setLoading] = useState(true);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const { currentUser } = useAuth();
  const { showSuccess, showError } = useNotification();
  const { t } = useTranslation('interactions');
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    const fetchInteractionData = async () => {
      try {
        setLoading(true);
        const interactionData = await getInteractionById(interactionId);
        if (cancelled) return;
        setInteraction(interactionData);

        if (interactionData.contactId) {
          try {
            const supplierData = await getSupplierById(interactionData.contactId);
            if (cancelled) return;
            setSupplier(supplierData);
          } catch (error) {
            if (cancelled) return;
            console.error('Błąd podczas pobierania dostawcy:', error);
          }
        }
      } catch (error) {
        if (cancelled) return;
        console.error('Błąd podczas pobierania danych interakcji:', error);
        showError(t('purchaseInteractions.notifications.loadFailed') + ': ' + error.message);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };
    fetchInteractionData();
    return () => { cancelled = true; };
  }, [interactionId]);

  const handleDeleteClick = () => {
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    try {
      await deleteInteraction(interactionId);
      showSuccess(t('purchaseInteractions.notifications.deleted'));
      
      // Przekieruj do listy interakcji
      navigate('/crm/interactions');
    } catch (error) {
      console.error('Błąd podczas usuwania interakcji:', error);
      showError(t('purchaseInteractions.notifications.deleteFailed') + ': ' + error.message);
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
        return t('purchaseInteractions.types.call');
      case INTERACTION_TYPES.EMAIL:
        return t('purchaseInteractions.types.email');
      case INTERACTION_TYPES.MEETING:
        return t('purchaseInteractions.types.meeting');
      case INTERACTION_TYPES.NOTE:
        return t('purchaseInteractions.types.note');
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
        return t('purchaseInteractions.statuses.completed');
      case INTERACTION_STATUSES.PLANNED:
        return t('purchaseInteractions.statuses.planned');
      case INTERACTION_STATUSES.IN_PROGRESS:
        return t('purchaseInteractions.statuses.inProgress');
      case INTERACTION_STATUSES.CANCELLED:
        return t('purchaseInteractions.statuses.cancelled');
      default:
        return status;
    }
  };

  const getContactName = () => {
    if (!supplier) return t('purchaseInteractions.details.unknownSupplier');
    return supplier.name || t('purchaseInteractions.details.noName');
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
          <BackButton 
            to={ROUTES.CRM_INTERACTIONS}
            label={t('common:common.backToList')}
            sx={{ mr: 2 }}
          />
          <Typography variant="h4" component="h1">
            Interakcja nie istnieje
          </Typography>
        </Box>
        <Paper sx={{ p: 3 }}>
          <Typography>
            {t('interactions:interactionNotFound')}
          </Typography>
          <BackButton 
            to={ROUTES.CRM_INTERACTIONS}
            label={t('interactions:backToInteractionsList')}
            variant="contained"
            sx={{ mt: 2 }}
          />
        </Paper>
      </Container>
    );
  }

  return (
    <Container maxWidth="lg">
      <Box mt={4} mb={4} display="flex" justifyContent="space-between" alignItems="center">
        <Box display="flex" alignItems="center">
          <BackButton 
            to={ROUTES.CRM_INTERACTIONS}
            label={t('purchaseInteractions.backToList')}
            sx={{ mr: 2 }}
          />
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
            {t('purchaseInteractions.actions.edit')}
          </Button>
          <Button 
            variant="outlined" 
            color="error" 
            startIcon={<DeleteIcon />}
            onClick={handleDeleteClick}
          >
            {t('purchaseInteractions.actions.delete')}
          </Button>
        </Box>
      </Box>

      <Grid container spacing={3}>
        <Grid item xs={12} md={8}>
          <Card>
            <CardHeader title={t('purchaseInteractions.interactionDetails')} />
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
                        primary={t('interactionDetails.dateTime')}
                        secondary={formatDate(interaction.date)}
                      />
                    </ListItem>
                    <ListItem>
                      <ListItemIcon>
                        <StatusIcon />
                      </ListItemIcon>
                      <ListItemText 
                        primary={t('interactionDetails.status')}
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
                    <ListItem button component={Link} to={`/suppliers/${interaction.contactId}/view`}>
                      <ListItemIcon>
                        <PersonIcon />
                      </ListItemIcon>
                      <ListItemText 
                        primary={t('interactionDetails.supplier')}
                        secondary={getContactName()}
                      />
                    </ListItem>
                    <ListItem>
                      <ListItemIcon>
                        {getTypeIcon(interaction.type)}
                      </ListItemIcon>
                      <ListItemText 
                        primary={t('interactionDetails.type')}
                        secondary={getTypeText(interaction.type)}
                      />
                    </ListItem>
                  </List>
                </Grid>
              </Grid>

              <Box mt={2}>
                <Typography variant="subtitle1">{t('interactionDetails.notes')}</Typography>
                <Paper variant="outlined" sx={{ p: 2, mt: 1, minHeight: '100px' }}>
                  {interaction.notes ? (
                    <Typography variant="body2" style={{ whiteSpace: 'pre-wrap' }}>
                      {interaction.notes}
                    </Typography>
                  ) : (
                    <Typography variant="body2" color="textSecondary" align="center">
                      {t('interactionDetails.noNotes')}
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
              {t('interactionDetails.newInteractionWithSupplier')}
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
                    primary={t('interactionDetails.createdAt')}
                    secondary={formatDateShort(interaction.createdAt)}
                  />
                </ListItem>
                {interaction.updatedAt && (
                  <ListItem>
                    <ListItemIcon>
                      <HistoryIcon />
                    </ListItemIcon>
                    <ListItemText 
                      primary={t('interactionDetails.lastModified')}
                      secondary={formatDateShort(interaction.updatedAt)}
                    />
                  </ListItem>
                )}
              </List>
            </CardContent>
          </Card>

          {supplier && (
            <Card sx={{ mt: 3 }}>
              <CardHeader title="Dostawca" />
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'flex-start' }}>
                  <PersonIcon sx={{ mr: 2, fontSize: 40, color: 'primary.main' }} />
                  <Box>
                    <Typography variant="h6">
                      {getContactName()}
                    </Typography>
                    {supplier.company && (
                      <Typography variant="body2" color="textSecondary">
                        {supplier.company}
                      </Typography>
                    )}
                    {supplier.position && (
                      <Typography variant="body2" color="textSecondary">
                        {supplier.position}
                      </Typography>
                    )}
                  </Box>
                </Box>
                <Divider sx={{ my: 2 }} />
                <List disablePadding dense>
                  {supplier.email && (
                    <ListItem disableGutters>
                      <ListItemIcon sx={{ minWidth: 30 }}>
                        <EmailIcon fontSize="small" />
                      </ListItemIcon>
                      <ListItemText primary={supplier.email} />
                    </ListItem>
                  )}
                  {supplier.phone && (
                    <ListItem disableGutters>
                      <ListItemIcon sx={{ minWidth: 30 }}>
                        <CallIcon fontSize="small" />
                      </ListItemIcon>
                      <ListItemText primary={supplier.phone} />
                    </ListItem>
                  )}
                </List>
                <Button
                  startIcon={<PersonIcon />}
                  variant="outlined"
                  component={Link}
                  to={`/suppliers/${supplier.id}/view`}
                  sx={{ mt: 2 }}
                >
                  {t('interactionDetails.viewSupplierCard')}
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
        <DialogTitle>{t('interactionDetails.deleteDialogTitle')}</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {t('interactionDetails.deleteDialogConfirmText', { subject: interaction.subject })}
            {t('interactionDetails.deleteDialogConfirmWarning')}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleDeleteCancel} color="primary">
            {t('interactionDetails.deleteDialogCancel')}
          </Button>
          <Button onClick={handleDeleteConfirm} color="error">
            {t('interactionDetails.deleteDialogConfirm')}
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default InteractionDetailsPage; 