import React, { useState, useEffect } from 'react';
import {
  Container,
  Typography,
  Box,
  Paper,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  TextField,
  InputAdornment,
  IconButton,
  Chip,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  CircularProgress,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Grid
} from '@mui/material';
import {
  Add as AddIcon,
  Search as SearchIcon,
  Clear as ClearIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Phone as CallIcon,
  Email as EmailIcon,
  EventNote as MeetingIcon,
  Note as NoteIcon,
  Visibility as ViewIcon
} from '@mui/icons-material';
import { Link } from 'react-router-dom';
import { getAllInteractions, deleteInteraction, updateInteraction, getInteractionById } from '../../services/crmService';
import { getAllSuppliers } from '../../services/supplierService';
import { useNotification } from '../../hooks/useNotification';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';
import { INTERACTION_TYPES, INTERACTION_STATUSES } from '../../utils/constants';
import { useAuth } from '../../hooks/useAuth';

const InteractionsPage = () => {
  const [interactions, setInteractions] = useState([]);
  const [filteredInteractions, setFilteredInteractions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [searchTerm, setSearchTerm] = useState('');
  const [supplierNames, setSupplierNames] = useState({});
  const [suppliers, setSuppliers] = useState([]);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [interactionToDelete, setInteractionToDelete] = useState(null);
  const [interactionToEdit, setInteractionToEdit] = useState(null);
  const [newStatus, setNewStatus] = useState('');
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [selectedInteraction, setSelectedInteraction] = useState(null);
  
  const { showSuccess, showError } = useNotification();
  const { currentUser } = useAuth();
  
  useEffect(() => {
    fetchInteractions();
  }, []);
  
  useEffect(() => {
    if (searchTerm.trim() === '') {
      setFilteredInteractions(interactions);
    } else {
      const lowercasedSearch = searchTerm.toLowerCase();
      setFilteredInteractions(
        interactions.filter((interaction) => {
          return (
            interaction.subject.toLowerCase().includes(lowercasedSearch) ||
            interaction.notes?.toLowerCase().includes(lowercasedSearch) ||
            interaction.type.toLowerCase().includes(lowercasedSearch) ||
            interaction.status.toLowerCase().includes(lowercasedSearch) ||
            supplierNames[interaction.contactId]?.toLowerCase().includes(lowercasedSearch)
          );
        })
      );
    }
  }, [searchTerm, interactions, supplierNames]);
  
  const fetchInteractions = async () => {
    try {
      setLoading(true);
      const allInteractions = await getAllInteractions();
      setInteractions(allInteractions);
      
      // Pobieramy dane dostawców
      const suppliersData = await getAllSuppliers();
      setSuppliers(suppliersData);
      
      // Tworzymy mapę nazw dostawców
      const supplierNamesObj = {};
      suppliersData.forEach(supplier => {
        supplierNamesObj[supplier.id] = supplier.name || 'Nieznany dostawca';
      });
      
      setSupplierNames(supplierNamesObj);
    } catch (error) {
      console.error('Błąd podczas pobierania interakcji:', error);
      showError('Nie udało się pobrać interakcji: ' + error.message);
    } finally {
      setLoading(false);
    }
  };
  
  const handleChangePage = (event, newPage) => {
    setPage(newPage);
  };
  
  const handleChangeRowsPerPage = (event) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };
  
  const handleSearchChange = (event) => {
    setSearchTerm(event.target.value);
    setPage(0);
  };
  
  const handleClearSearch = () => {
    setSearchTerm('');
  };
  
  const handleDeleteClick = (interaction) => {
    setInteractionToDelete(interaction);
    setDeleteDialogOpen(true);
  };
  
  const handleDeleteConfirm = async () => {
    try {
      await deleteInteraction(interactionToDelete.id);
      showSuccess('Interakcja została usunięta');
      setInteractions(interactions.filter(i => i.id !== interactionToDelete.id));
      setFilteredInteractions(filteredInteractions.filter(i => i.id !== interactionToDelete.id));
    } catch (error) {
      console.error('Błąd podczas usuwania interakcji:', error);
      showError('Nie udało się usunąć interakcji: ' + error.message);
    } finally {
      setDeleteDialogOpen(false);
      setInteractionToDelete(null);
    }
  };
  
  const handleDeleteCancel = () => {
    setDeleteDialogOpen(false);
    setInteractionToDelete(null);
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
  
  const getInteractionIcon = (type) => {
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
  
  const handleStatusClick = (interaction) => {
    setInteractionToEdit(interaction);
    setNewStatus(interaction.status);
    setStatusDialogOpen(true);
  };
  
  const handleStatusUpdate = async () => {
    if (!interactionToEdit || newStatus === interactionToEdit.status) {
      setStatusDialogOpen(false);
      return;
    }
    
    try {
      // Zapisz poprzedni status, aby móc zidentyfikować interakcję w tablicy
      const previousId = interactionToEdit.id;
      
      await updateInteraction(interactionToEdit.id, {
        ...interactionToEdit,
        status: newStatus
      }, currentUser?.uid);
      
      // Aktualizuj główną listę interakcji
      const updatedInteractions = interactions.map(interaction => 
        interaction.id === previousId 
          ? { ...interaction, status: newStatus } 
          : interaction
      );
      setInteractions(updatedInteractions);
      
      // Aktualizuj również przefiltrowaną listę interakcji
      const updatedFilteredInteractions = filteredInteractions.map(interaction => 
        interaction.id === previousId 
          ? { ...interaction, status: newStatus } 
          : interaction
      );
      setFilteredInteractions(updatedFilteredInteractions);
      
      showSuccess('Status interakcji został zaktualizowany');
    } catch (error) {
      console.error('Błąd podczas aktualizacji statusu:', error);
      showError('Nie udało się zaktualizować statusu interakcji: ' + error.message);
    } finally {
      setStatusDialogOpen(false);
      setInteractionToEdit(null);
    }
  };
  
  const handleDetailsClick = (interaction) => {
    setSelectedInteraction(interaction);
    setDetailsDialogOpen(true);
  };
  
  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }
  
  return (
    <Container maxWidth="xl">
      <Box mt={4} mb={4} display="flex" justifyContent="space-between" alignItems="center">
        <Typography variant="h4" component="h1">
          Interakcje zakupowe
        </Typography>
        <Button 
          variant="contained" 
          color="primary" 
          startIcon={<AddIcon />}
          component={Link}
          to="/inventory/interactions/new"
        >
          Nowa interakcja
        </Button>
      </Box>
      
      <Paper sx={{ mb: 4 }}>
        <Box p={2} display="flex" justifyContent="space-between" alignItems="center">
          <TextField
            variant="outlined"
            placeholder="Szukaj interakcji..."
            size="small"
            value={searchTerm}
            onChange={handleSearchChange}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon />
                </InputAdornment>
              ),
              endAdornment: searchTerm && (
                <InputAdornment position="end">
                  <IconButton
                    size="small"
                    onClick={handleClearSearch}
                    edge="end"
                  >
                    <ClearIcon />
                  </IconButton>
                </InputAdornment>
              ),
            }}
            sx={{ width: 300 }}
          />
          <Typography variant="body2" color="textSecondary">
            Łącznie: {filteredInteractions.length} interakcji
          </Typography>
        </Box>
        
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell width="5%">Typ</TableCell>
                <TableCell width="15%">Temat</TableCell>
                <TableCell width="10%">Data</TableCell>
                <TableCell width="12%">Dostawca</TableCell>
                <TableCell width="10%">Telefon</TableCell>
                <TableCell width="15%">Email</TableCell>
                <TableCell width="13%">Adres</TableCell>
                <TableCell width="10%">Status</TableCell>
                <TableCell width="10%" align="right">Akcje</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredInteractions.length > 0 ? (
                (rowsPerPage > 0
                  ? filteredInteractions.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
                  : filteredInteractions
                ).map((interaction) => (
                  <TableRow key={interaction.id} hover>
                    <TableCell>
                      <Tooltip title={interaction.type}>
                        {getInteractionIcon(interaction.type)}
                      </Tooltip>
                    </TableCell>
                    <TableCell>
                      <Tooltip title="Kliknij, aby zobaczyć szczegóły">
                        <Box 
                          onClick={() => handleDetailsClick(interaction)}
                          style={{ 
                            cursor: 'pointer',
                            textDecoration: 'none', 
                            color: 'inherit' 
                          }}
                        >
                          <Typography variant="body1" component="span" sx={{ fontWeight: 'bold' }}>
                            {interaction.subject}
                          </Typography>
                          {interaction.notes && (
                            <Typography 
                              variant="body2" 
                              color="textSecondary"
                              sx={{ 
                                display: '-webkit-box',
                                WebkitLineClamp: 1,
                                WebkitBoxOrient: 'vertical',
                                overflow: 'hidden'
                              }}
                            >
                              {interaction.notes}
                            </Typography>
                          )}
                        </Box>
                      </Tooltip>
                    </TableCell>
                    <TableCell>{formatDate(interaction.date)}</TableCell>
                    <TableCell>
                      <Link 
                        to={`/suppliers/${interaction.contactId}`}
                        style={{ textDecoration: 'none', color: 'primary.main' }}
                      >
                        {supplierNames[interaction.contactId] || 'Nieznany dostawca'}
                      </Link>
                    </TableCell>
                    <TableCell>
                      {suppliers.find(s => s.id === interaction.contactId)?.phone || '-'}
                    </TableCell>
                    <TableCell>
                      {suppliers.find(s => s.id === interaction.contactId)?.email || '-'}
                    </TableCell>
                    <TableCell>
                      {(() => {
                        const supplier = suppliers.find(s => s.id === interaction.contactId);
                        if (supplier?.addresses?.length > 0) {
                          const mainAddress = supplier.addresses.find(a => a.isMain) || supplier.addresses[0];
                          return mainAddress.city || '-';
                        }
                        return '-';
                      })()}
                    </TableCell>
                    <TableCell>
                      <Tooltip title="Kliknij, aby zobaczyć szczegóły lub edytować status">
                        <Chip 
                          label={interaction.status} 
                          size="small" 
                          color={getStatusColor(interaction.status)} 
                          variant="outlined"
                          onClick={() => handleStatusClick(interaction)}
                          sx={{ cursor: 'pointer' }}
                        />
                      </Tooltip>
                    </TableCell>
                    <TableCell align="right">
                      <Box display="flex" justifyContent="flex-end">
                        <Tooltip title="Edytuj">
                          <IconButton 
                            size="small"
                            component={Link}
                            to={`/inventory/interactions/${interaction.id}/edit`}
                          >
                            <EditIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Szczegóły">
                          <IconButton 
                            size="small"
                            color="primary"
                            component={Link}
                            to={`/inventory/interactions/${interaction.id}`}
                          >
                            <ViewIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Usuń">
                          <IconButton 
                            size="small"
                            color="error"
                            onClick={() => handleDeleteClick(interaction)}
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 3 }}>
                    <Typography variant="body1" color="textSecondary">
                      {searchTerm ? 'Nie znaleziono interakcji spełniających kryteria wyszukiwania' : 'Brak interakcji'}
                    </Typography>
                    <Button 
                      variant="contained" 
                      startIcon={<AddIcon />}
                      component={Link}
                      to="/inventory/interactions/new"
                      sx={{ mt: 2 }}
                    >
                      Dodaj pierwszą interakcję
                    </Button>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
        
        {filteredInteractions.length > 0 && (
          <TablePagination
            rowsPerPageOptions={[5, 10, 25, 50]}
            component="div"
            count={filteredInteractions.length}
            rowsPerPage={rowsPerPage}
            page={page}
            onPageChange={handleChangePage}
            onRowsPerPageChange={handleChangeRowsPerPage}
            labelRowsPerPage="Wierszy na stronę:"
            labelDisplayedRows={({ from, to, count }) => `${from}-${to} z ${count}`}
          />
        )}
      </Paper>
      
      {/* Dialog potwierdzenia usunięcia */}
      <Dialog
        open={deleteDialogOpen}
        onClose={handleDeleteCancel}
      >
        <DialogTitle>Usuń interakcję</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Czy na pewno chcesz usunąć interakcję "{interactionToDelete?.subject}"?
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

      {/* Dialog zmiany statusu */}
      <Dialog
        open={statusDialogOpen}
        onClose={() => setStatusDialogOpen(false)}
      >
        <DialogTitle>Zmień status interakcji</DialogTitle>
        <DialogContent>
          {interactionToEdit && (
            <>
              <DialogContentText>
                Zmień status interakcji "{interactionToEdit.subject}"
              </DialogContentText>
              <FormControl fullWidth sx={{ mt: 2 }}>
                <InputLabel>Status</InputLabel>
                <Select
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value)}
                  label="Status"
                >
                  <MenuItem value={INTERACTION_STATUSES.PLANNED}>Zaplanowana</MenuItem>
                  <MenuItem value={INTERACTION_STATUSES.IN_PROGRESS}>W trakcie</MenuItem>
                  <MenuItem value={INTERACTION_STATUSES.COMPLETED}>Zakończona</MenuItem>
                  <MenuItem value={INTERACTION_STATUSES.CANCELLED}>Anulowana</MenuItem>
                </Select>
              </FormControl>
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setStatusDialogOpen(false)}>Anuluj</Button>
          <Button onClick={handleStatusUpdate} color="primary">Zapisz</Button>
        </DialogActions>
      </Dialog>

      {/* Dialog szczegółów interakcji */}
      <Dialog
        open={detailsDialogOpen}
        onClose={() => setDetailsDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          Szczegóły interakcji
          <IconButton
            aria-label="close"
            onClick={() => setDetailsDialogOpen(false)}
            sx={{
              position: 'absolute',
              right: 8,
              top: 8,
            }}
          >
            <ClearIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          {selectedInteraction && (
            <Grid container spacing={3}>
              <Grid item xs={12}>
                <Typography variant="h6">{selectedInteraction.subject}</Typography>
                <Box display="flex" alignItems="center" mt={1}>
                  {getInteractionIcon(selectedInteraction.type)}
                  <Typography variant="body2" color="textSecondary" sx={{ ml: 1 }}>
                    {selectedInteraction.type}
                  </Typography>
                </Box>
              </Grid>
              
              <Grid item xs={12} sm={6}>
                <Typography variant="subtitle2">Data i godzina:</Typography>
                <Typography variant="body1">{formatDate(selectedInteraction.date)}</Typography>
              </Grid>
              
              <Grid item xs={12} sm={6}>
                <Typography variant="subtitle2">Status:</Typography>
                <Chip 
                  label={selectedInteraction.status} 
                  size="small" 
                  color={getStatusColor(selectedInteraction.status)}
                  onClick={() => {
                    setDetailsDialogOpen(false);
                    handleStatusClick(selectedInteraction);
                  }}
                  sx={{ cursor: 'pointer' }}
                />
              </Grid>
              
              <Grid item xs={12}>
                <Typography variant="subtitle2">Dostawca:</Typography>
                <Typography variant="body1">
                  {supplierNames[selectedInteraction.contactId] || 'Nieznany dostawca'}
                </Typography>
              </Grid>
              
              {selectedInteraction.notes && (
                <Grid item xs={12}>
                  <Typography variant="subtitle2">Notatki:</Typography>
                  <Paper variant="outlined" sx={{ p: 2, mt: 1, bgcolor: 'background.default' }}>
                    <Typography variant="body2" style={{ whiteSpace: 'pre-wrap' }}>
                      {selectedInteraction.notes}
                    </Typography>
                  </Paper>
                </Grid>
              )}
              
              <Grid item xs={12} sx={{ mt: 2 }}>
                <Box display="flex" justifyContent="flex-end" gap={1}>
                  <Button 
                    variant="outlined" 
                    startIcon={<EditIcon />}
                    component={Link}
                    to={`/inventory/interactions/${selectedInteraction.id}/edit`}
                    onClick={() => setDetailsDialogOpen(false)}
                  >
                    Edytuj
                  </Button>
                  <Button 
                    variant="outlined" 
                    color="error" 
                    startIcon={<DeleteIcon />}
                    onClick={() => {
                      setDetailsDialogOpen(false);
                      handleDeleteClick(selectedInteraction);
                    }}
                  >
                    Usuń
                  </Button>
                </Box>
              </Grid>
            </Grid>
          )}
        </DialogContent>
      </Dialog>
    </Container>
  );
};

export default InteractionsPage; 