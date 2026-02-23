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
  CircularProgress
} from '@mui/material';
import {
  Add as AddIcon,
  Search as SearchIcon,
  Clear as ClearIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  TrendingUp as TrendingUpIcon,
  AttachMoney as MoneyIcon,
  Person as PersonIcon
} from '@mui/icons-material';
import { Link, useNavigate } from 'react-router-dom';
import { getAllOpportunities, getContactById, deleteOpportunity } from '../../services/crmService';
import { useNotification } from '../../hooks/useNotification';
import { useTranslation } from '../../hooks/useTranslation';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';
import { OPPORTUNITY_STAGES } from '../../utils/constants';

const OpportunitiesPage = () => {
  const [opportunities, setOpportunities] = useState([]);
  const [filteredOpportunities, setFilteredOpportunities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [searchTerm, setSearchTerm] = useState('');
  const [contactNames, setContactNames] = useState({});
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [opportunityToDelete, setOpportunityToDelete] = useState(null);
  
  const { showSuccess, showError } = useNotification();
  const { t } = useTranslation('interactions');
  const navigate = useNavigate();
  
  useEffect(() => {
    let cancelled = false;
    const fetchOpportunities = async () => {
      try {
        setLoading(true);
        const allOpportunities = await getAllOpportunities();
        if (cancelled) return;
        setOpportunities(allOpportunities);
        setFilteredOpportunities(allOpportunities);
        
        // Pobieranie nazw kontaktów
        const contactIds = [...new Set(allOpportunities.map(opp => opp.contactId).filter(Boolean))];
        const contactNamesObj = {};
        
        for (const contactId of contactIds) {
          try {
            const contact = await getContactById(contactId);
            if (cancelled) return;
            contactNamesObj[contactId] = `${contact.firstName || ''} ${contact.lastName || ''}`.trim() || contact.company || 'Nieznany kontakt';
          } catch (error) {
            console.error(`Błąd podczas pobierania kontaktu ${contactId}:`, error);
            contactNamesObj[contactId] = 'Nieznany kontakt';
          }
        }
        
        if (cancelled) return;
        setContactNames(contactNamesObj);
      } catch (error) {
        if (cancelled) return;
        console.error('Błąd podczas pobierania szans sprzedaży:', error);
        showError('Nie udało się pobrać szans sprzedaży: ' + error.message);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };
    fetchOpportunities();
    return () => { cancelled = true; };
  }, []);
  
  useEffect(() => {
    if (searchTerm.trim() === '') {
      setFilteredOpportunities(opportunities);
    } else {
      const lowercasedSearch = searchTerm.toLowerCase();
      setFilteredOpportunities(
        opportunities.filter((opportunity) => {
          return (
            opportunity.name.toLowerCase().includes(lowercasedSearch) ||
            opportunity.notes?.toLowerCase().includes(lowercasedSearch) ||
            opportunity.stage.toLowerCase().includes(lowercasedSearch) ||
            contactNames[opportunity.contactId]?.toLowerCase().includes(lowercasedSearch)
          );
        })
      );
    }
  }, [searchTerm, opportunities, contactNames]);
  
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
  
  const handleDeleteClick = (opportunity, event) => {
    event.stopPropagation();
    setOpportunityToDelete(opportunity);
    setDeleteDialogOpen(true);
  };
  
  const handleDeleteConfirm = async () => {
    if (!opportunityToDelete) return;
    
    try {
      await deleteOpportunity(opportunityToDelete.id);
      showSuccess('Szansa sprzedaży została usunięta');
      setOpportunities(prev => prev.filter(opp => opp.id !== opportunityToDelete.id));
      setDeleteDialogOpen(false);
      setOpportunityToDelete(null);
    } catch (error) {
      console.error('Błąd podczas usuwania szansy sprzedaży:', error);
      showError('Nie udało się usunąć szansy sprzedaży: ' + error.message);
    }
  };
  
  const handleDeleteCancel = () => {
    setDeleteDialogOpen(false);
    setOpportunityToDelete(null);
  };
  
  const formatDate = (dateString) => {
    if (!dateString) return '-';
    let date;
    
    if (dateString.seconds) {
      date = new Date(dateString.seconds * 1000);
    } else {
      date = new Date(dateString);
    }
    
    return format(date, 'dd MMM yyyy', { locale: pl });
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
  
  const handleRowClick = (opportunityId) => {
    navigate(`/crm/opportunities/${opportunityId}`);
  };
  
  return (
    <Container maxWidth="xl">
      <Box mt={4} mb={4} display="flex" justifyContent="space-between" alignItems="center">
        <Typography variant="h4" component="h1">
          Szanse sprzedaży
        </Typography>
        <Button 
          variant="contained" 
          color="primary" 
          startIcon={<AddIcon />}
          component={Link}
          to="/crm/opportunities/new"
        >
          Nowa szansa sprzedaży
        </Button>
      </Box>
      
      <Paper sx={{ mb: 4 }}>
        <Box p={2} display="flex" justifyContent="space-between" alignItems="center">
          <TextField
            variant="outlined"
            placeholder={t('opportunities.searchOpportunities')}
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
            Łącznie: {filteredOpportunities.length} szans sprzedaży
          </Typography>
        </Box>
        
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell width="30%">Nazwa</TableCell>
                <TableCell width="15%">Kontakt</TableCell>
                <TableCell width="15%">Wartość</TableCell>
                <TableCell width="15%">Etap</TableCell>
                <TableCell width="10%">Planowane zamknięcie</TableCell>
                <TableCell width="15%" align="right">Akcje</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 3 }}>
                    <CircularProgress />
                  </TableCell>
                </TableRow>
              ) : filteredOpportunities.length > 0 ? (
                (rowsPerPage > 0
                  ? filteredOpportunities.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
                  : filteredOpportunities
                ).map((opportunity) => (
                  <TableRow 
                    key={opportunity.id} 
                    hover 
                    onClick={() => handleRowClick(opportunity.id)}
                    sx={{ cursor: 'pointer' }}
                  >
                    <TableCell>
                      <Box display="flex" alignItems="center">
                        <TrendingUpIcon sx={{ mr: 1, color: 'primary.main' }} />
                        <Box>
                          <Typography variant="body1" fontWeight="medium">
                            {opportunity.name}
                          </Typography>
                          {opportunity.notes && (
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
                              {opportunity.notes}
                            </Typography>
                          )}
                        </Box>
                      </Box>
                    </TableCell>
                    <TableCell>
                      {opportunity.contactId ? (
                        <Box display="flex" alignItems="center">
                          <PersonIcon fontSize="small" sx={{ mr: 1 }} />
                          <Link 
                            to={`/crm/contacts/${opportunity.contactId}`}
                            onClick={(e) => e.stopPropagation()}
                            style={{ textDecoration: 'none', color: 'primary.main' }}
                          >
                            {contactNames[opportunity.contactId] || 'Nieznany kontakt'}
                          </Link>
                        </Box>
                      ) : (
                        'Brak kontaktu'
                      )}
                    </TableCell>
                    <TableCell>
                      <Box display="flex" alignItems="center">
                        <MoneyIcon fontSize="small" sx={{ mr: 1, color: 'success.main' }} />
                        <Box>
                          <Typography variant="body2">
                            {formatCurrency(opportunity.amount)}
                          </Typography>
                          <Typography variant="caption" color="textSecondary">
                            {opportunity.probability}% szans
                          </Typography>
                        </Box>
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Chip 
                        label={opportunity.stage} 
                        size="small" 
                        color={getStageColor(opportunity.stage)} 
                      />
                    </TableCell>
                    <TableCell>
                      {formatDate(opportunity.expectedCloseDate)}
                    </TableCell>
                    <TableCell align="right">
                      <Tooltip title="Edytuj">
                        <IconButton
                          component={Link}
                          to={`/crm/opportunities/${opportunity.id}/edit`}
                          onClick={(e) => e.stopPropagation()}
                          size="small"
                        >
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Usuń">
                        <IconButton
                          onClick={(e) => handleDeleteClick(opportunity, e)}
                          size="small"
                          color="error"
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 3 }}>
                    <Typography variant="body1" color="textSecondary">
                      {searchTerm.trim() !== '' 
                        ? 'Nie znaleziono szans sprzedaży pasujących do wyszukiwania'
                        : 'Brak szans sprzedaży'}
                    </Typography>
                    {searchTerm.trim() !== '' ? (
                      <Button 
                        sx={{ mt: 1 }} 
                        variant="outlined" 
                        size="small"
                        onClick={handleClearSearch}
                      >
                        Wyczyść wyszukiwanie
                      </Button>
                    ) : (
                      <Button 
                        sx={{ mt: 1 }} 
                        variant="contained" 
                        size="small"
                        component={Link}
                        to="/crm/opportunities/new"
                        startIcon={<AddIcon />}
                      >
                        Dodaj pierwszą szansę sprzedaży
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
        
        {filteredOpportunities.length > 0 && (
          <TablePagination
            rowsPerPageOptions={[5, 10, 25, 50]}
            component="div"
            count={filteredOpportunities.length}
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
        <DialogTitle>Usuń szansę sprzedaży</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Czy na pewno chcesz usunąć szansę sprzedaży "{opportunityToDelete?.name}"?
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

export default OpportunitiesPage; 