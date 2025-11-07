import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Container, 
  Typography, 
  Box, 
  Paper, 
  Tab, 
  Tabs, 
  Table, 
  TableBody, 
  TableCell, 
  TableContainer, 
  TableHead, 
  TableRow,
  Button,
  Alert,
  CircularProgress,
  IconButton,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Tooltip,
  TablePagination,
  Chip
} from '@mui/material';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';
import { useNavigate, useLocation } from 'react-router-dom';
import { Delete as DeleteIcon, Edit as EditIcon, Build as BuildIcon } from '@mui/icons-material';
import { useTheme } from '@mui/material/styles';
import { 
  getHallDataFormResponsesWithPagination,
  deleteHallDataFormResponse,
  HALL_DATA_FORM_TYPES
} from '../../services/hallDataFormsService';

const HallDataFormsResponsesPage = () => {
  const theme = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  
  // Odczytaj typ z query params
  const queryParams = new URLSearchParams(location.search);
  const typeParam = queryParams.get('type');
  
  // Mapowanie typu z URL do wartości zakładki
  const getTabValueFromType = (type) => {
    switch(type) {
      case 'service': return 0;
      case 'monthly': return 1;
      case 'defect': return 2;
      case 'service-repair': return 3;
      default: return 0;
    }
  };
  
  const [tabValue, setTabValue] = useState(getTabValueFromType(typeParam));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // Cache kursorów dla każdej strony
  const cursorsRef = useRef({
    serviceReport: new Map(),
    monthlyServiceReport: new Map(),
    defectRegistry: new Map(),
    serviceRepairReport: new Map()
  });

  // Osobne stany dla każdej zakładki
  const [serviceReportResponses, setServiceReportResponses] = useState([]);
  const [monthlyServiceReportResponses, setMonthlyServiceReportResponses] = useState([]);
  const [defectRegistryResponses, setDefectRegistryResponses] = useState([]);
  const [serviceRepairReportResponses, setServiceRepairReportResponses] = useState([]);
  
  // Paginacja
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  
  // Śledzenie załadowanych zakładek
  const [loadedTabs, setLoadedTabs] = useState({
    serviceReport: false,
    monthlyServiceReport: false,
    defectRegistry: false,
    serviceRepairReport: false
  });
  
  // Dialog usuwania
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteItemData, setDeleteItemData] = useState(null);

  // Funkcja ładowania danych dla aktualnej zakładki
  const loadCurrentTabData = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      const pageNum = page + 1;
      
      // Pobierz kursor dla poprzedniej strony (jeśli istnieje)
      let currentCursor = null;
      const formTypeKey = tabValue === 0 ? 'serviceReport' : 
                          tabValue === 1 ? 'monthlyServiceReport' :
                          tabValue === 2 ? 'defectRegistry' : 'serviceRepairReport';
      
      if (pageNum > 1) {
        // Użyj kursora z poprzedniej strony
        currentCursor = cursorsRef.current[formTypeKey].get(pageNum - 1);
      }
      
      switch (tabValue) {
        case 0: // Service Reports
          const serviceResult = await getHallDataFormResponsesWithPagination(
            HALL_DATA_FORM_TYPES.SERVICE_REPORT,
            pageNum,
            rowsPerPage,
            {},
            currentCursor
          );
          setServiceReportResponses(serviceResult.data);
          setTotalCount(serviceResult.totalCount);
          setTotalPages(serviceResult.totalPages);
          
          if (serviceResult.lastVisible) {
            cursorsRef.current.serviceReport.set(pageNum, serviceResult.lastVisible);
          }
          break;
          
        case 1: // Monthly Service Reports
          const monthlyResult = await getHallDataFormResponsesWithPagination(
            HALL_DATA_FORM_TYPES.MONTHLY_SERVICE_REPORT,
            pageNum,
            rowsPerPage,
            {},
            currentCursor
          );
          setMonthlyServiceReportResponses(monthlyResult.data);
          setTotalCount(monthlyResult.totalCount);
          setTotalPages(monthlyResult.totalPages);
          
          if (monthlyResult.lastVisible) {
            cursorsRef.current.monthlyServiceReport.set(pageNum, monthlyResult.lastVisible);
          }
          break;
          
        case 2: // Defect Registry
          const defectResult = await getHallDataFormResponsesWithPagination(
            HALL_DATA_FORM_TYPES.DEFECT_REGISTRY,
            pageNum,
            rowsPerPage,
            {},
            currentCursor
          );
          setDefectRegistryResponses(defectResult.data);
          setTotalCount(defectResult.totalCount);
          setTotalPages(defectResult.totalPages);
          
          if (defectResult.lastVisible) {
            cursorsRef.current.defectRegistry.set(pageNum, defectResult.lastVisible);
          }
          break;
          
        case 3: // Service Repair Reports
          const serviceRepairResult = await getHallDataFormResponsesWithPagination(
            HALL_DATA_FORM_TYPES.SERVICE_REPAIR_REPORT,
            pageNum,
            rowsPerPage,
            {},
            currentCursor
          );
          setServiceRepairReportResponses(serviceRepairResult.data);
          setTotalCount(serviceRepairResult.totalCount);
          setTotalPages(serviceRepairResult.totalPages);
          
          if (serviceRepairResult.lastVisible) {
            cursorsRef.current.serviceRepairReport.set(pageNum, serviceRepairResult.lastVisible);
          }
          break;
          
        default:
          break;
      }
    } catch (error) {
      console.error('Błąd podczas ładowania danych zakładki:', error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  }, [tabValue, page, rowsPerPage]);
  
  // Załaduj dane gdy zmieni się zakładka, strona lub rozmiar strony
  useEffect(() => {
    loadCurrentTabData();
  }, [loadCurrentTabData]);
  
  // Resetuj paginację przy zmianie zakładki
  const handleTabChange = (event, newValue) => {
    setTabValue(newValue);
    setPage(0);
    setTotalCount(0);
    setTotalPages(0);
  };
  
  const handleChangePage = (event, newPage) => {
    setPage(newPage);
  };
  
  const handleChangeRowsPerPage = (event) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
    
    // Wyczyść cache kursorów przy zmianie rozmiaru strony
    const formTypeKey = tabValue === 0 ? 'serviceReport' : 
                        tabValue === 1 ? 'monthlyServiceReport' :
                        tabValue === 2 ? 'defectRegistry' : 'serviceRepairReport';
    cursorsRef.current[formTypeKey].clear();
  };
  
  // Funkcje obsługi usuwania
  const handleDeleteClick = (item, formType) => {
    setDeleteItemData({ item, formType });
    setDeleteConfirmOpen(true);
  };
  
  const handleDeleteConfirm = async () => {
    if (!deleteItemData) return;
    
    try {
      await deleteHallDataFormResponse(deleteItemData.formType, deleteItemData.item.id);
      setDeleteConfirmOpen(false);
      setDeleteItemData(null);
      // Odśwież dane
      loadCurrentTabData();
    } catch (error) {
      console.error('Błąd podczas usuwania odpowiedzi:', error);
      alert('Wystąpił błąd podczas usuwania odpowiedzi');
    }
  };
  
  const handleDeleteCancel = () => {
    setDeleteConfirmOpen(false);
    setDeleteItemData(null);
  };
  
  // Funkcje obsługi edycji
  const handleEditClick = (item, formType) => {
    sessionStorage.setItem('editFormData', JSON.stringify(item));
    if (formType === HALL_DATA_FORM_TYPES.MONTHLY_SERVICE_REPORT) {
      navigate('/hall-data/forms/monthly-service-report?edit=true');
    } else if (formType === HALL_DATA_FORM_TYPES.DEFECT_REGISTRY) {
      navigate('/hall-data/forms/defect-registry?edit=true');
    } else if (formType === HALL_DATA_FORM_TYPES.SERVICE_REPAIR_REPORT) {
      navigate('/hall-data/forms/service-repair-report?edit=true');
    } else {
      navigate('/hall-data/forms/service-report?edit=true');
    }
  };
  
  // Formatowanie daty
  const formatDate = (date) => {
    if (!date) return '-';
    try {
      const dateObj = date.toDate ? date.toDate() : new Date(date);
      return format(dateObj, 'dd.MM.yyyy', { locale: pl });
    } catch (error) {
      return '-';
    }
  };
  
  const formatDateTime = (date) => {
    if (!date) return '-';
    try {
      const dateObj = date.toDate ? date.toDate() : new Date(date);
      return format(dateObj, 'dd.MM.yyyy HH:mm', { locale: pl });
    } catch (error) {
      return '-';
    }
  };
  
  // Renderowanie tabeli dla raportów serwisowych
  const renderServiceReportsTable = () => {
    if (loading) {
      return (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
          <CircularProgress />
        </Box>
      );
    }
    
    if (serviceReportResponses.length === 0) {
      return (
        <Alert severity="info" sx={{ m: 2 }}>
          Brak raportów serwisowych do wyświetlenia.
        </Alert>
      );
    }
    
    return (
      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Data wypełnienia</TableCell>
              <TableCell>Pracownik</TableCell>
              <TableCell>Stanowisko</TableCell>
              <TableCell>Data serwisu</TableCell>
              <TableCell>Godzina</TableCell>
              <TableCell>Status zadań</TableCell>
              <TableCell>Akcje</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {serviceReportResponses.map((response) => {
              // Policz wykonane zadania
              const tasks = [
                response.filterCleaning,
                response.actuatorCheck,
                response.sensorCleaning,
                response.pneumaticCheck,
                response.actuatorAirtightness,
                response.oilLevelCheck,
                response.controlChamberCleaning,
                response.screwsNutsCheck,
                response.rubberGasketCheck
              ];
              const completedCount = tasks.filter(t => t === 'Wykonano').length;
              const totalTasks = tasks.length;
              
              return (
                <TableRow key={response.id}>
                  <TableCell>{formatDate(response.fillDate)}</TableCell>
                  <TableCell>{response.employeeName || '-'}</TableCell>
                  <TableCell>{response.position || '-'}</TableCell>
                  <TableCell>{formatDate(response.serviceDate)}</TableCell>
                  <TableCell>
                    {response.serviceTime ? formatDateTime(response.serviceTime) : '-'}
                  </TableCell>
                  <TableCell>
                    <Chip 
                      label={`${completedCount}/${totalTasks}`}
                      color={completedCount === totalTasks ? 'success' : 'warning'}
                      size="small"
                    />
                  </TableCell>
                  <TableCell>
                    <Tooltip title="Edytuj">
                      <IconButton 
                        size="small" 
                        color="primary"
                        onClick={() => handleEditClick(response, HALL_DATA_FORM_TYPES.SERVICE_REPORT)}
                      >
                        <EditIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Usuń">
                      <IconButton 
                        size="small" 
                        color="error"
                        onClick={() => handleDeleteClick(response, HALL_DATA_FORM_TYPES.SERVICE_REPORT)}
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
    );
  };
  
  return (
    <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
      <Box sx={{ mb: 3, display: 'flex', alignItems: 'center' }}>
        <BuildIcon sx={{ fontSize: 40, mr: 2, color: 'primary.main' }} />
        <Typography variant="h4" component="h1">
          Odpowiedzi - Formularze Parametrów Hali
        </Typography>
      </Box>
      
      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      
      <Paper elevation={3} sx={{ borderRadius: 2 }}>
        <Tabs 
          value={tabValue} 
          onChange={handleTabChange}
          variant="fullWidth"
          sx={{ borderBottom: 1, borderColor: 'divider' }}
        >
          <Tab label={`Tygodniowy Serwis (${tabValue === 0 ? totalCount : 0})`} />
          <Tab label={`Miesięczny Serwis (${tabValue === 1 ? totalCount : 0})`} />
          <Tab label={`Rejestr Usterek (${tabValue === 2 ? totalCount : 0})`} />
          <Tab label={`Raport Serwisu/Napraw (${tabValue === 3 ? totalCount : 0})`} />
        </Tabs>
        
        {/* Tab Panel 0 - Service Reports */}
        {tabValue === 0 && (
          <Box>
            {renderServiceReportsTable()}
            <TablePagination
              component="div"
              count={totalCount}
              page={page}
              onPageChange={handleChangePage}
              rowsPerPage={rowsPerPage}
              onRowsPerPageChange={handleChangeRowsPerPage}
              rowsPerPageOptions={[5, 10, 25, 50]}
              labelRowsPerPage="Wierszy na stronę:"
              labelDisplayedRows={({ from, to, count }) => 
                `${from}-${to} z ${count !== -1 ? count : `więcej niż ${to}`}`
              }
            />
          </Box>
        )}
        
        {/* Tab Panel 1 - Monthly Service Reports */}
        {tabValue === 1 && (
          <Box>
            {loading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
                <CircularProgress />
              </Box>
            ) : monthlyServiceReportResponses.length === 0 ? (
              <Alert severity="info" sx={{ m: 2 }}>
                Brak raportów miesięcznego serwisu do wyświetlenia.
              </Alert>
            ) : (
              <>
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Data wypełnienia</TableCell>
                        <TableCell>Pracownik</TableCell>
                        <TableCell>Stanowisko</TableCell>
                        <TableCell>Data serwisu</TableCell>
                        <TableCell>Godzina</TableCell>
                        <TableCell>Status zadań</TableCell>
                        <TableCell>Akcje</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {monthlyServiceReportResponses.map((response) => {
                        const tasks = [
                          response.dosingScrewCheck, response.dosingMotorCheck, response.filterCleaning,
                          response.sensorCleaning, response.chamberCleaning, response.rubberGasketCheck,
                          response.vBeltCheck, response.bhpSafetyCheck, response.pneumaticCheck,
                          response.actuatorAirtightness, response.limitSwitchCheck, response.screwsNutsCheck
                        ];
                        const completedCount = tasks.filter(t => t === 'Wykonano').length;
                        const totalTasks = tasks.length;
                        
                        return (
                          <TableRow key={response.id}>
                            <TableCell>{formatDate(response.fillDate)}</TableCell>
                            <TableCell>{response.employeeName || '-'}</TableCell>
                            <TableCell>{response.position || '-'}</TableCell>
                            <TableCell>{formatDate(response.serviceDate)}</TableCell>
                            <TableCell>{response.serviceTime ? formatDateTime(response.serviceTime) : '-'}</TableCell>
                            <TableCell>
                              <Chip 
                                label={`${completedCount}/${totalTasks}`}
                                color={completedCount === totalTasks ? 'success' : 'warning'}
                                size="small"
                              />
                            </TableCell>
                            <TableCell>
                              <Tooltip title="Edytuj">
                                <IconButton 
                                  size="small" 
                                  color="primary"
                                  onClick={() => handleEditClick(response, HALL_DATA_FORM_TYPES.MONTHLY_SERVICE_REPORT)}
                                >
                                  <EditIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                              <Tooltip title="Usuń">
                                <IconButton 
                                  size="small" 
                                  color="error"
                                  onClick={() => handleDeleteClick(response, HALL_DATA_FORM_TYPES.MONTHLY_SERVICE_REPORT)}
                                >
                                  <DeleteIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </TableContainer>
                <TablePagination
                  component="div"
                  count={totalCount}
                  page={page}
                  onPageChange={handleChangePage}
                  rowsPerPage={rowsPerPage}
                  onRowsPerPageChange={handleChangeRowsPerPage}
                  rowsPerPageOptions={[5, 10, 25, 50]}
                  labelRowsPerPage="Wierszy na stronę:"
                  labelDisplayedRows={({ from, to, count }) => 
                    `${from}-${to} z ${count !== -1 ? count : `więcej niż ${to}`}`
                  }
                />
              </>
            )}
          </Box>
        )}
        
        {/* Tab Panel 2 - Defect Registry */}
        {tabValue === 2 && (
          <Box>
            {loading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
                <CircularProgress />
              </Box>
            ) : defectRegistryResponses.length === 0 ? (
              <Alert severity="info" sx={{ m: 2 }}>
                Brak zgłoszeń usterek do wyświetlenia.
              </Alert>
            ) : (
              <>
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Data wypełnienia</TableCell>
                        <TableCell>Pracownik</TableCell>
                        <TableCell>Data wykrycia</TableCell>
                        <TableCell>Status naprawy</TableCell>
                        <TableCell>Opis usterki</TableCell>
                        <TableCell>Akcje</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {defectRegistryResponses.map((response) => {
                        let statusColor = 'default';
                        if (response.repairStatus === 'Zakończono') statusColor = 'success';
                        else if (response.repairStatus === 'W trakcie') statusColor = 'warning';
                        else if (response.repairStatus === 'Oczekuje') statusColor = 'error';
                        
                        return (
                          <TableRow key={response.id}>
                            <TableCell>{formatDate(response.fillDate)}</TableCell>
                            <TableCell>{response.employeeName || '-'}</TableCell>
                            <TableCell>{formatDate(response.detectionDate)}</TableCell>
                            <TableCell>
                              <Chip 
                                label={response.repairStatus || '-'}
                                color={statusColor}
                                size="small"
                              />
                            </TableCell>
                            <TableCell>
                              <Typography variant="body2" noWrap sx={{ maxWidth: 200 }}>
                                {response.defectDescription || '-'}
                              </Typography>
                            </TableCell>
                            <TableCell>
                              <Tooltip title="Edytuj">
                                <IconButton 
                                  size="small" 
                                  color="primary"
                                  onClick={() => handleEditClick(response, HALL_DATA_FORM_TYPES.DEFECT_REGISTRY)}
                                >
                                  <EditIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                              <Tooltip title="Usuń">
                                <IconButton 
                                  size="small" 
                                  color="error"
                                  onClick={() => handleDeleteClick(response, HALL_DATA_FORM_TYPES.DEFECT_REGISTRY)}
                                >
                                  <DeleteIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </TableContainer>
                <TablePagination
                  component="div"
                  count={totalCount}
                  page={page}
                  onPageChange={handleChangePage}
                  rowsPerPage={rowsPerPage}
                  onRowsPerPageChange={handleChangeRowsPerPage}
                  rowsPerPageOptions={[5, 10, 25, 50]}
                  labelRowsPerPage="Wierszy na stronę:"
                  labelDisplayedRows={({ from, to, count }) => 
                    `${from}-${to} z ${count !== -1 ? count : `więcej niż ${to}`}`
                  }
                />
              </>
            )}
          </Box>
        )}
        
        {/* Tab Panel 3 - Service Repair Reports */}
        {tabValue === 3 && (
          <Box>
            {loading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
                <CircularProgress />
              </Box>
            ) : serviceRepairReportResponses.length === 0 ? (
              <Alert severity="info" sx={{ m: 2 }}>
                Brak raportów serwisu/napraw do wyświetlenia.
              </Alert>
            ) : (
              <>
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Data wypełnienia</TableCell>
                        <TableCell>Pracownik</TableCell>
                        <TableCell>Rodzaj zadania</TableCell>
                        <TableCell>Data wykonania</TableCell>
                        <TableCell>Wykonany serwis/naprawa</TableCell>
                        <TableCell>Akcje</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {serviceRepairReportResponses.map((response) => {
                        return (
                          <TableRow key={response.id}>
                            <TableCell>{formatDate(response.fillDate)}</TableCell>
                            <TableCell>{response.employeeName || '-'}</TableCell>
                            <TableCell>
                              <Chip 
                                label={response.taskType || '-'}
                                color={response.taskType === 'Serwis' ? 'primary' : 'warning'}
                                size="small"
                              />
                            </TableCell>
                            <TableCell>{formatDate(response.completionDate)}</TableCell>
                            <TableCell>
                              <Typography variant="body2" noWrap sx={{ maxWidth: 250 }}>
                                {response.performedWork || '-'}
                              </Typography>
                            </TableCell>
                            <TableCell>
                              <Tooltip title="Edytuj">
                                <IconButton 
                                  size="small" 
                                  color="primary"
                                  onClick={() => handleEditClick(response, HALL_DATA_FORM_TYPES.SERVICE_REPAIR_REPORT)}
                                >
                                  <EditIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                              <Tooltip title="Usuń">
                                <IconButton 
                                  size="small" 
                                  color="error"
                                  onClick={() => handleDeleteClick(response, HALL_DATA_FORM_TYPES.SERVICE_REPAIR_REPORT)}
                                >
                                  <DeleteIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </TableContainer>
                <TablePagination
                  component="div"
                  count={totalCount}
                  page={page}
                  onPageChange={handleChangePage}
                  rowsPerPage={rowsPerPage}
                  onRowsPerPageChange={handleChangeRowsPerPage}
                  rowsPerPageOptions={[5, 10, 25, 50]}
                  labelRowsPerPage="Wierszy na stronę:"
                  labelDisplayedRows={({ from, to, count }) => 
                    `${from}-${to} z ${count !== -1 ? count : `więcej niż ${to}`}`
                  }
                />
              </>
            )}
          </Box>
        )}
      </Paper>
      
      {/* Dialog potwierdzenia usunięcia */}
      <Dialog
        open={deleteConfirmOpen}
        onClose={handleDeleteCancel}
      >
        <DialogTitle>Potwierdź usunięcie</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Czy na pewno chcesz usunąć tę odpowiedź formularza? Ta operacja jest nieodwracalna.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleDeleteCancel} color="primary">
            Anuluj
          </Button>
          <Button onClick={handleDeleteConfirm} color="error" variant="contained">
            Usuń
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default HallDataFormsResponsesPage;

