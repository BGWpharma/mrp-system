import React, { useState, useEffect } from 'react';
import {
  Container,
  Typography,
  Box,
  Button,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  IconButton,
  Tooltip,
  TextField,
  InputAdornment,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  CircularProgress,
  Grid
} from '@mui/material';
import {
  PersonAdd as PersonAddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Search as SearchIcon,
  Phone as PhoneIcon,
  Email as EmailIcon,
  Business as BusinessIcon,
  FileCopy as FileCopyIcon,
  Refresh as RefreshIcon
} from '@mui/icons-material';
import { Link, useNavigate, Link as RouterLink } from 'react-router-dom';
import { getAllContacts, searchContacts, deleteContact } from '../../services/crmService';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';
import { CRM_CONTACT_TYPES } from '../../utils/constants';

const ContactsPage = () => {
  const [contacts, setContacts] = useState([]);
  const [filteredContacts, setFilteredContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [searchTerm, setSearchTerm] = useState('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [contactToDelete, setContactToDelete] = useState(null);
  
  const { currentUser } = useAuth();
  const { showSuccess, showError } = useNotification();
  const navigate = useNavigate();
  
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const allContacts = await getAllContacts();
        if (cancelled) return;
        setContacts(allContacts);
        setFilteredContacts(allContacts);
      } catch (error) {
        if (cancelled) return;
        console.error('Błąd podczas pobierania kontaktów:', error);
        showError('Nie udało się pobrać kontaktów: ' + error.message);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);
  
  useEffect(() => {
    if (searchTerm.trim() === '') {
      setFilteredContacts(contacts);
    } else {
      const filtered = contacts.filter(contact => 
        (contact.firstName && contact.firstName.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (contact.lastName && contact.lastName.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (contact.company && contact.company.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (contact.email && contact.email.toLowerCase().includes(searchTerm.toLowerCase()))
      );
      setFilteredContacts(filtered);
    }
  }, [searchTerm, contacts]);
  
  const fetchContacts = async () => {
    try {
      setLoading(true);
      const allContacts = await getAllContacts();
      setContacts(allContacts);
      setFilteredContacts(allContacts);
    } catch (error) {
      console.error('Błąd podczas pobierania kontaktów:', error);
      showError('Nie udało się pobrać kontaktów: ' + error.message);
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
  
  const handleDeleteClick = (contact) => {
    setContactToDelete(contact);
    setDeleteDialogOpen(true);
  };
  
  const handleDeleteConfirm = async () => {
    if (!contactToDelete) return;
    
    try {
      await deleteContact(contactToDelete.id);
      showSuccess('Kontakt został usunięty');
      setContacts(prev => prev.filter(c => c.id !== contactToDelete.id));
      setDeleteDialogOpen(false);
      setContactToDelete(null);
    } catch (error) {
      console.error('Błąd podczas usuwania kontaktu:', error);
      showError('Nie udało się usunąć kontaktu: ' + error.message);
    }
  };
  
  const handleDeleteCancel = () => {
    setDeleteDialogOpen(false);
    setContactToDelete(null);
  };
  
  const getContactTypeColor = (type) => {
    switch (type) {
      case CRM_CONTACT_TYPES.CUSTOMER:
        return 'success';
      case CRM_CONTACT_TYPES.LEAD:
        return 'warning';
      case CRM_CONTACT_TYPES.PROSPECT:
        return 'info';
      case CRM_CONTACT_TYPES.SUPPLIER:
        return 'primary';
      case CRM_CONTACT_TYPES.PARTNER:
        return 'secondary';
      default:
        return 'default';
    }
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
  
  const getFullName = (contact) => {
    return [contact.firstName, contact.lastName].filter(Boolean).join(' ') || 'Brak nazwy';
  };
  
  return (
    <Container maxWidth="xl">
      <Box mb={4} display="flex" justifyContent="space-between" alignItems="center">
        <Typography variant="h4" component="h1" gutterBottom>
          Kontakty
        </Typography>
        <Button 
          variant="contained" 
          color="primary" 
          startIcon={<PersonAddIcon />} 
          component={Link}
          to="/crm/contacts/new"
        >
          Nowy kontakt
        </Button>
      </Box>
      
      <Paper sx={{ mb: 3, p: 2 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} md={8}>
            <TextField
              fullWidth
              label="Szukaj kontaktów"
              value={searchTerm}
              onChange={handleSearchChange}
              placeholder="Szukaj po imieniu, nazwisku, firmie lub emailu..."
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon />
                  </InputAdornment>
                ),
              }}
            />
          </Grid>
          <Grid item xs={12} md={4} display="flex" justifyContent="flex-end">
            <Button 
              startIcon={<RefreshIcon />} 
              onClick={fetchContacts}
              disabled={loading}
            >
              Odśwież
            </Button>
          </Grid>
        </Grid>
      </Paper>
      
      <TableContainer component={Paper}>
        {loading ? (
          <Box display="flex" justifyContent="center" p={4}>
            <CircularProgress />
          </Box>
        ) : filteredContacts.length > 0 ? (
          <>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Nazwa</TableCell>
                  <TableCell>Firma</TableCell>
                  <TableCell>Email</TableCell>
                  <TableCell>Telefon</TableCell>
                  <TableCell>Typ</TableCell>
                  <TableCell align="right">Akcje</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredContacts
                  .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
                  .map((contact) => (
                    <TableRow 
                      key={contact.id}
                      hover
                      onClick={() => navigate(`/crm/contacts/${contact.id}`)}
                      sx={{ cursor: 'pointer' }}
                    >
                      <TableCell>
                        <Box display="flex" alignItems="center">
                          {getFullName(contact)}
                        </Box>
                      </TableCell>
                      <TableCell>
                        {contact.company ? (
                          <Box display="flex" alignItems="center">
                            <BusinessIcon fontSize="small" color="action" sx={{ mr: 1 }} />
                            {contact.company}
                          </Box>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell>
                        {contact.email ? (
                          <Box display="flex" alignItems="center">
                            <EmailIcon fontSize="small" color="action" sx={{ mr: 1 }} />
                            {contact.email}
                            <IconButton 
                              size="small" 
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCopyEmail(contact.email);
                              }}
                            >
                              <FileCopyIcon fontSize="small" />
                            </IconButton>
                          </Box>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell>
                        {contact.phone ? (
                          <Box display="flex" alignItems="center">
                            <PhoneIcon fontSize="small" color="action" sx={{ mr: 1 }} />
                            {contact.phone}
                          </Box>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell>
                        <Chip 
                          label={contact.type} 
                          size="small" 
                          color={getContactTypeColor(contact.type)} 
                        />
                      </TableCell>
                      <TableCell align="right">
                        <Tooltip title="Edytuj">
                          <IconButton 
                            component={RouterLink}
                            to={`/crm/contacts/${contact.id}/edit`}
                            onClick={(e) => {
                              e.stopPropagation();
                            }}
                          >
                            <EditIcon />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Usuń">
                          <IconButton 
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteClick(contact);
                            }}
                          >
                            <DeleteIcon />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
            <TablePagination
              rowsPerPageOptions={[5, 10, 25]}
              component="div"
              count={filteredContacts.length}
              rowsPerPage={rowsPerPage}
              page={page}
              onPageChange={handleChangePage}
              onRowsPerPageChange={handleChangeRowsPerPage}
              labelRowsPerPage="Wierszy na stronę:"
              labelDisplayedRows={({ from, to, count }) => 
                `${from}–${to} z ${count !== -1 ? count : `więcej niż ${to}`}`
              }
            />
          </>
        ) : (
          <Box p={4} textAlign="center">
            <Typography variant="body1" color="textSecondary">
              {searchTerm.trim() !== '' 
                ? 'Nie znaleziono kontaktów pasujących do wyszukiwania' 
                : 'Brak kontaktów w systemie'}
            </Typography>
            {searchTerm.trim() !== '' && (
              <Button 
                sx={{ mt: 2 }} 
                variant="outlined" 
                onClick={() => setSearchTerm('')}
              >
                Wyczyść wyszukiwanie
              </Button>
            )}
            {searchTerm.trim() === '' && (
              <Button 
                sx={{ mt: 2 }} 
                variant="contained" 
                component={Link}
                to="/crm/contacts/new"
                startIcon={<PersonAddIcon />}
              >
                Dodaj pierwszy kontakt
              </Button>
            )}
          </Box>
        )}
      </TableContainer>
      
      {/* Dialog potwierdzenia usunięcia */}
      <Dialog
        open={deleteDialogOpen}
        onClose={handleDeleteCancel}
      >
        <DialogTitle>Usuń kontakt</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Czy na pewno chcesz usunąć kontakt {contactToDelete ? getFullName(contactToDelete) : ''}?
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

export default ContactsPage; 