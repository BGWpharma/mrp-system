import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, Link as RouterLink } from 'react-router-dom';
import { useTranslation } from '../../hooks/useTranslation';
import {
  Container, Typography, Paper, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Button, TextField, Box, IconButton, Dialog,
  DialogActions, DialogContent, DialogContentText, DialogTitle,
  CircularProgress, Alert, Chip, Tooltip, Divider, List, ListItem, ListItemText,
  ListItemIcon, Collapse, FormControlLabel, Checkbox, TablePagination
} from '@mui/material';
import { 
  Add as AddIcon, 
  Edit as EditIcon, 
  Delete as DeleteIcon, 
  Visibility as ViewIcon,
  Download as DownloadIcon,
  Upload as UploadIcon,
  Description as DescriptionIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  Warning as WarningIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  BuildCircle as BuildCircleIcon
} from '@mui/icons-material';
import { getAllSuppliers, deleteSupplier } from '../../services/supplierService';
import { useNotification } from '../../hooks/useNotification';
import { useAuth } from '../../hooks/useAuth';
import { 
  downloadSuppliersCSV, 
  downloadSupplierCSVTemplate,
  parseSuppliersCSV,
  previewSuppliersImport,
  importSuppliersFromCSV
} from '../../services/supplierExportService';
import { rebuildAllSupplierCatalogs } from '../../services/supplierProductService';

const SuppliersList = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { showSuccess, showError } = useNotification();
  const { currentUser } = useAuth();
  const fileInputRef = useRef(null);
  
  const [suppliers, setSuppliers] = useState([]);
  const [filteredSuppliers, setFilteredSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [supplierToDelete, setSupplierToDelete] = useState(null);
  
  // Stany dla paginacji
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  
  // Stan dla przebudowy katalogów
  const [rebuildingCatalogs, setRebuildingCatalogs] = useState(false);
  
  // Stany dla eksportu/importu
  const [exporting, setExporting] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importPreview, setImportPreview] = useState(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState(null);
  const [updateExisting, setUpdateExisting] = useState(true);
  const [expandedSections, setExpandedSections] = useState({
    toCreate: true,
    toUpdate: true,
    unchanged: false
  });
  
  useEffect(() => {
    fetchSuppliers();
  }, []);
  
  useEffect(() => {
    filterSuppliers();
  }, [searchTerm, suppliers]);
  
  const fetchSuppliers = async () => {
    try {
      setLoading(true);
      const data = await getAllSuppliers();
      setSuppliers(data);
      setFilteredSuppliers(data);
      setLoading(false);
    } catch (error) {
      console.error('Błąd podczas pobierania dostawców:', error);
      showError(t('suppliers.notifications.loadFailed'));
      setLoading(false);
    }
  };
  
  const filterSuppliers = () => {
    if (!searchTerm) {
      setFilteredSuppliers(suppliers);
      return;
    }
    
    const term = searchTerm.toLowerCase();
    const filtered = suppliers.filter(supplier => 
      supplier.name?.toLowerCase().includes(term) ||
      supplier.contactPerson?.toLowerCase().includes(term) ||
      supplier.email?.toLowerCase().includes(term) ||
      supplier.phone?.includes(term) ||
      supplier.taxId?.includes(term)
    );
    
    setFilteredSuppliers(filtered);
  };
  
  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value);
    setPage(0); // Reset do pierwszej strony przy zmianie wyszukiwania
  };
  
  // === PAGINACJA ===
  const handleChangePage = (event, newPage) => {
    setPage(newPage);
  };
  
  const handleChangeRowsPerPage = (event) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };
  
  // Oblicz paginowane dane
  const paginatedSuppliers = filteredSuppliers.slice(
    page * rowsPerPage,
    page * rowsPerPage + rowsPerPage
  );
  
  const handleDeleteClick = (supplier) => {
    setSupplierToDelete(supplier);
    setDeleteDialogOpen(true);
  };
  
  const handleDeleteConfirm = async () => {
    try {
      await deleteSupplier(supplierToDelete.id);
      const newSuppliers = suppliers.filter(s => s.id !== supplierToDelete.id);
      setSuppliers(newSuppliers);
      
      // Jeśli usunęliśmy ostatni element na stronie, cofnij o stronę
      const newFilteredCount = newSuppliers.filter(supplier => {
        if (!searchTerm) return true;
        const term = searchTerm.toLowerCase();
        return supplier.name?.toLowerCase().includes(term) ||
          supplier.contactPerson?.toLowerCase().includes(term) ||
          supplier.email?.toLowerCase().includes(term) ||
          supplier.phone?.includes(term) ||
          supplier.taxId?.includes(term);
      }).length;
      
      const maxPage = Math.max(0, Math.ceil(newFilteredCount / rowsPerPage) - 1);
      if (page > maxPage) {
        setPage(maxPage);
      }
      
      showSuccess(t('suppliers.notifications.deleted'));
      setDeleteDialogOpen(false);
      setSupplierToDelete(null);
    } catch (error) {
      console.error('Błąd podczas usuwania dostawcy:', error);
      showError(t('suppliers.notifications.deleteFailed'));
    }
  };
  
  // === EKSPORT ===
  const handleExportCSV = async () => {
    try {
      setExporting(true);
      await downloadSuppliersCSV('dostawcy');
      showSuccess(t('suppliers.notifications.exportSuccess', 'Eksport dostawców zakończony pomyślnie'));
    } catch (error) {
      console.error('Błąd eksportu:', error);
      showError(t('suppliers.notifications.exportFailed', 'Błąd podczas eksportu dostawców'));
    } finally {
      setExporting(false);
    }
  };
  
  const handleDownloadTemplate = () => {
    downloadSupplierCSVTemplate('szablon_dostawcy');
    showSuccess(t('suppliers.notifications.templateDownloaded', 'Szablon CSV został pobrany'));
  };
  
  // === IMPORT ===
  const handleOpenImportDialog = () => {
    setImportDialogOpen(true);
    setImportFile(null);
    setImportPreview(null);
    setImportError(null);
  };
  
  const handleCloseImportDialog = () => {
    setImportDialogOpen(false);
    setImportFile(null);
    setImportPreview(null);
    setImportError(null);
  };
  
  const handleFileSelect = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    
    setImportFile(file);
    setImportError(null);
    setImportPreview(null);
    
    try {
      const text = await file.text();
      const preview = await previewSuppliersImport(text);
      setImportPreview(preview);
    } catch (error) {
      console.error('Błąd parsowania CSV:', error);
      setImportError(error.message);
    }
    
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };
  
  const handleImport = async () => {
    if (!importFile || !importPreview) return;
    
    try {
      setImporting(true);
      
      const text = await importFile.text();
      const parsedSuppliers = parseSuppliersCSV(text);
      
      const results = await importSuppliersFromCSV(parsedSuppliers, currentUser.uid, {
        updateExisting
      });
      
      const message = t('suppliers.notifications.importResults', 
        `Import zakończony: ${results.created} utworzonych, ${results.updated} zaktualizowanych, ${results.skipped} pominiętych`);
      
      if (results.errors.length > 0) {
        showError(`${message}. Błędy: ${results.errors.length}`);
      } else {
        showSuccess(message);
      }
      
      // Odśwież listę
      await fetchSuppliers();
      handleCloseImportDialog();
      
    } catch (error) {
      console.error('Błąd importu:', error);
      showError(t('suppliers.notifications.importFailed', 'Błąd podczas importu dostawców'));
    } finally {
      setImporting(false);
    }
  };
  
  // === PRZEBUDOWA KATALOGÓW DOSTAWCÓW ===
  const handleRebuildAllCatalogs = async () => {
    try {
      setRebuildingCatalogs(true);
      const result = await rebuildAllSupplierCatalogs();
      showSuccess(
        t('suppliers.catalog.rebuildAllSuccess', {
          products: result.updated,
          orders: result.ordersProcessed,
          suppliers: result.suppliersProcessed
        })
      );
    } catch (error) {
      console.error('Błąd podczas przebudowy katalogów:', error);
      showError(t('suppliers.catalog.rebuildAllFailed'));
    } finally {
      setRebuildingCatalogs(false);
    }
  };
  
  const toggleSection = (section) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };
  
  if (loading) {
    return (
      <Container>
        <Typography variant="h6">{t('suppliers.loading')}</Typography>
      </Container>
    );
  }
  
  return (
    <Container>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 2 }}>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          <Tooltip title={t('suppliers.actions.exportCSV', 'Eksportuj do CSV')}>
            <Button
              variant="outlined"
              startIcon={exporting ? <CircularProgress size={20} /> : <DownloadIcon />}
              onClick={handleExportCSV}
              disabled={exporting || suppliers.length === 0}
            >
              {t('suppliers.actions.export', 'Eksport')}
            </Button>
          </Tooltip>
          
          <Tooltip title={t('suppliers.actions.importCSV', 'Importuj z CSV')}>
            <Button
              variant="outlined"
              startIcon={<UploadIcon />}
              onClick={handleOpenImportDialog}
            >
              {t('suppliers.actions.import', 'Import')}
            </Button>
          </Tooltip>
          
          <Tooltip title={t('suppliers.actions.downloadTemplate', 'Pobierz szablon CSV')}>
            <Button
              variant="text"
              size="small"
              startIcon={<DescriptionIcon />}
              onClick={handleDownloadTemplate}
            >
              {t('suppliers.actions.template', 'Szablon')}
            </Button>
          </Tooltip>
          
          <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
          
          <Tooltip title={t('suppliers.catalog.rebuildAllTooltip', 'Przebuduj katalogi produktów wszystkich dostawców na podstawie istniejących zamówień zakupu')}>
            <Button
              variant="outlined"
              color="secondary"
              startIcon={rebuildingCatalogs ? <CircularProgress size={20} /> : <BuildCircleIcon />}
              onClick={handleRebuildAllCatalogs}
              disabled={rebuildingCatalogs}
            >
              {rebuildingCatalogs 
                ? t('suppliers.catalog.rebuilding', 'Przebudowywanie...') 
                : t('suppliers.catalog.rebuildAll', 'Przebuduj katalogi')
              }
            </Button>
          </Tooltip>
        </Box>
        
        <Button
          variant="contained"
          color="primary"
          startIcon={<AddIcon />}
          onClick={() => navigate('/suppliers/new')}
        >
          {t('suppliers.newSupplier')}
        </Button>
      </Box>
      
      <Box sx={{ mb: 3 }}>
        <TextField
          label={t('suppliers.search')}
          variant="outlined"
          size="small"
          value={searchTerm}
          onChange={handleSearchChange}
          fullWidth
        />
      </Box>
      
      {filteredSuppliers.length === 0 ? (
        <Paper sx={{ p: 3, textAlign: 'center' }}>
          <Typography variant="body1">{t('suppliers.noResultsFound')}</Typography>
        </Paper>
      ) : (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>{t('suppliers.table.name')}</TableCell>
                <TableCell>{t('suppliers.table.contactPerson')}</TableCell>
                <TableCell>{t('suppliers.table.email')}</TableCell>
                <TableCell>{t('suppliers.table.phone')}</TableCell>
                <TableCell>{t('suppliers.table.address')}</TableCell>
                <TableCell>{t('suppliers.table.actions')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {paginatedSuppliers.map((supplier) => (
                <TableRow key={supplier.id} hover>
                  <TableCell>{supplier.name}</TableCell>
                  <TableCell>{supplier.contactPerson}</TableCell>
                  <TableCell>{supplier.email}</TableCell>
                  <TableCell>{supplier.phone}</TableCell>
                  <TableCell>
                    {supplier.addresses && supplier.addresses.length > 0 
                      ? supplier.addresses.find(a => a.isMain)?.street || supplier.addresses[0].street
                      : t('suppliers.noAddress')
                    }
                  </TableCell>
                  <TableCell>
                    <IconButton 
                      color="primary" 
                      component={RouterLink}
                      to={`/suppliers/${supplier.id}/view`} 
                      title={t('suppliers.actions.view')}
                    >
                      <ViewIcon />
                    </IconButton>
                    <IconButton 
                      color="secondary" 
                      component={RouterLink}
                      to={`/suppliers/${supplier.id}/edit`} 
                      title={t('suppliers.actions.edit')}
                    >
                      <EditIcon />
                    </IconButton>
                    <IconButton color="error" onClick={() => handleDeleteClick(supplier)} title={t('suppliers.actions.delete')}>
                      <DeleteIcon />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <TablePagination
            component="div"
            count={filteredSuppliers.length}
            page={page}
            onPageChange={handleChangePage}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={handleChangeRowsPerPage}
            rowsPerPageOptions={[5, 10, 25, 50]}
            labelRowsPerPage={t('common.rowsPerPage', 'Wierszy na stronie:')}
            labelDisplayedRows={({ from, to, count }) => 
              `${from}-${to} ${t('common.of', 'z')} ${count !== -1 ? count : `więcej niż ${to}`}`
            }
          />
        </TableContainer>
      )}
      
      {/* Dialog potwierdzenia usunięcia */}
      <Dialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
      >
        <DialogTitle>{t('suppliers.confirmDelete.title')}</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {t('suppliers.confirmDelete.message', { name: supplierToDelete?.name })}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>{t('suppliers.confirmDelete.cancel')}</Button>
          <Button onClick={handleDeleteConfirm} color="error">{t('suppliers.confirmDelete.confirm')}</Button>
        </DialogActions>
      </Dialog>
      
      {/* Dialog importu CSV */}
      <Dialog
        open={importDialogOpen}
        onClose={handleCloseImportDialog}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          {t('suppliers.import.title', 'Import dostawców z CSV')}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ mb: 3 }}>
            <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
              {t('suppliers.import.description', 'Wybierz plik CSV z dostawcami. Wymagane kolumny: COMPANY NAME, CONTACT PERSON, EMAIL, PHONE, VAT EU, NOTES')}
            </Typography>
            
            <input
              type="file"
              accept=".csv"
              onChange={handleFileSelect}
              ref={fileInputRef}
              style={{ display: 'none' }}
              id="csv-file-input"
            />
            <label htmlFor="csv-file-input">
              <Button
                variant="outlined"
                component="span"
                startIcon={<UploadIcon />}
                disabled={importing}
              >
                {importFile ? importFile.name : t('suppliers.import.selectFile', 'Wybierz plik CSV')}
              </Button>
            </label>
          </Box>
          
          {importError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {importError}
            </Alert>
          )}
          
          {importPreview && (
            <Box>
              {/* Podsumowanie */}
              <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
                <Chip
                  icon={<CheckCircleIcon />}
                  label={`${t('suppliers.import.toCreate', 'Do utworzenia')}: ${importPreview.toCreate.length}`}
                  color="success"
                  variant="outlined"
                />
                <Chip
                  icon={<WarningIcon />}
                  label={`${t('suppliers.import.toUpdate', 'Do aktualizacji')}: ${importPreview.toUpdate.length}`}
                  color="warning"
                  variant="outlined"
                />
                <Chip
                  icon={<CheckCircleIcon />}
                  label={`${t('suppliers.import.unchanged', 'Bez zmian')}: ${importPreview.unchanged.length}`}
                  color="default"
                  variant="outlined"
                />
              </Box>
              
              {/* Opcja aktualizacji istniejących */}
              <FormControlLabel
                control={
                  <Checkbox
                    checked={updateExisting}
                    onChange={(e) => setUpdateExisting(e.target.checked)}
                  />
                }
                label={t('suppliers.import.updateExisting', 'Aktualizuj istniejących dostawców')}
                sx={{ mb: 2 }}
              />
              
              <Divider sx={{ my: 2 }} />
              
              {/* Nowi dostawcy */}
              {importPreview.toCreate.length > 0 && (
                <Box sx={{ mb: 2 }}>
                  <Box 
                    sx={{ display: 'flex', alignItems: 'center', cursor: 'pointer', mb: 1 }}
                    onClick={() => toggleSection('toCreate')}
                  >
                    {expandedSections.toCreate ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                    <Typography variant="subtitle1" color="success.main" sx={{ ml: 1 }}>
                      {t('suppliers.import.newSuppliers', 'Nowi dostawcy')} ({importPreview.toCreate.length})
                    </Typography>
                  </Box>
                  <Collapse in={expandedSections.toCreate}>
                    <List dense sx={{ bgcolor: 'success.light', borderRadius: 1, opacity: 0.9 }}>
                      {importPreview.toCreate.map((supplier, index) => (
                        <ListItem key={index}>
                          <ListItemIcon>
                            <CheckCircleIcon color="success" />
                          </ListItemIcon>
                          <ListItemText
                            primary={supplier.name}
                            secondary={`${supplier.contactPerson || ''} | ${supplier.email || ''} | ${supplier.phone || ''}`}
                          />
                        </ListItem>
                      ))}
                    </List>
                  </Collapse>
                </Box>
              )}
              
              {/* Dostawcy do aktualizacji */}
              {importPreview.toUpdate.length > 0 && (
                <Box sx={{ mb: 2 }}>
                  <Box 
                    sx={{ display: 'flex', alignItems: 'center', cursor: 'pointer', mb: 1 }}
                    onClick={() => toggleSection('toUpdate')}
                  >
                    {expandedSections.toUpdate ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                    <Typography variant="subtitle1" color="warning.main" sx={{ ml: 1 }}>
                      {t('suppliers.import.toUpdateList', 'Do aktualizacji')} ({importPreview.toUpdate.length})
                    </Typography>
                  </Box>
                  <Collapse in={expandedSections.toUpdate}>
                    <List dense sx={{ bgcolor: 'warning.light', borderRadius: 1, opacity: 0.9 }}>
                      {importPreview.toUpdate.map((item, index) => (
                        <ListItem key={index}>
                          <ListItemIcon>
                            <WarningIcon color="warning" />
                          </ListItemIcon>
                          <ListItemText
                            primary={item.name}
                            secondary={
                              <Box component="span">
                                {item.changes.map((change, i) => (
                                  <Typography key={i} variant="caption" display="block">
                                    {change.field}: "{change.oldValue || '(puste)'}" → "{change.newValue || '(puste)'}"
                                  </Typography>
                                ))}
                              </Box>
                            }
                          />
                        </ListItem>
                      ))}
                    </List>
                  </Collapse>
                </Box>
              )}
              
              {/* Bez zmian */}
              {importPreview.unchanged.length > 0 && (
                <Box sx={{ mb: 2 }}>
                  <Box 
                    sx={{ display: 'flex', alignItems: 'center', cursor: 'pointer', mb: 1 }}
                    onClick={() => toggleSection('unchanged')}
                  >
                    {expandedSections.unchanged ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                    <Typography variant="subtitle1" color="text.secondary" sx={{ ml: 1 }}>
                      {t('suppliers.import.unchangedList', 'Bez zmian')} ({importPreview.unchanged.length})
                    </Typography>
                  </Box>
                  <Collapse in={expandedSections.unchanged}>
                    <List dense sx={{ bgcolor: 'grey.100', borderRadius: 1 }}>
                      {importPreview.unchanged.map((item, index) => (
                        <ListItem key={index}>
                          <ListItemIcon>
                            <CheckCircleIcon color="disabled" />
                          </ListItemIcon>
                          <ListItemText primary={item.name} />
                        </ListItem>
                      ))}
                    </List>
                  </Collapse>
                </Box>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseImportDialog} disabled={importing}>
            {t('common.cancel', 'Anuluj')}
          </Button>
          <Button
            variant="contained"
            onClick={handleImport}
            disabled={importing || !importPreview || (importPreview.toCreate.length === 0 && importPreview.toUpdate.length === 0)}
            startIcon={importing ? <CircularProgress size={20} /> : <UploadIcon />}
          >
            {importing ? t('suppliers.import.importing', 'Importowanie...') : t('suppliers.import.import', 'Importuj')}
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default SuppliersList; 