import React, { memo } from 'react';
import {
  Grid,
  Paper,
  Typography,
  Box,
  Button,
  CircularProgress,
  Tabs,
  Tab,
  TableContainer,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  IconButton
} from '@mui/material';
import {
  Assessment as AssessmentIcon,
  Assignment as FormIcon,
  Timeline as TimelineIcon,
  Visibility as VisibilityIcon,
  Edit as EditIcon
} from '@mui/icons-material';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { useTranslation } from 'react-i18next';

const FormsTab = ({
  task,
  formTab,
  setFormTab,
  formResponses,
  loadingFormResponses,
  setCompletedMODialogOpen,
  setProductionControlDialogOpen,
  setProductionShiftDialogOpen
}) => {
  const { t } = useTranslation();

  return (
    <Grid container spacing={3}>
      <Grid item xs={12}>
        <Paper sx={{ p: 3 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h6" component="h2">Formularze produkcyjne</Typography>
            <Box sx={{ display: 'flex', gap: 1 }}>
              {formTab === 0 && (
                <Button
                  variant="contained"
                  color="success"
                  startIcon={<AssessmentIcon />}
                  onClick={() => setCompletedMODialogOpen(true)}
                  size="medium"
                >
                  Wypełnij raport zakończonego MO
                </Button>
              )}
              {formTab === 1 && (
                <Button
                  variant="contained"
                  color="primary"
                  startIcon={<FormIcon />}
                  onClick={() => setProductionControlDialogOpen(true)}
                  size="medium"
                >
                  Wypełnij raport kontroli produkcji
                </Button>
              )}
              {formTab === 2 && (
                <Button
                  variant="contained"
                  color="warning"
                  startIcon={<TimelineIcon />}
                  onClick={() => setProductionShiftDialogOpen(true)}
                  size="medium"
                >
                  Wypełnij raport zmiany produkcyjnej
                </Button>
              )}
            </Box>
          </Box>
          {loadingFormResponses ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
              <CircularProgress />
            </Box>
          ) : (
            <Box sx={{ width: '100%' }}>
              <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
                <Tabs 
                  value={formTab || 0} 
                  onChange={(e, newValue) => setFormTab(newValue)} 
                  aria-label="Zakładki formularzy"
                  variant="scrollable" 
                  scrollButtons="auto"
                  allowScrollButtonsMobile
                >
                  <Tab label={`${t('production.taskDetails.formTabs.completedMO')} (${formResponses.completedMO.length})`} />
                  <Tab label={`${t('production.taskDetails.formTabs.productionControl')} (${formResponses.productionControl.length})`} />
                  <Tab label={`${t('production.taskDetails.formTabs.productionShift')} (${formResponses.productionShift.length})`} />
                </Tabs>
              </Box>
              
              {/* Completed MO Tab */}
              {formTab === 0 && (
                <>
                  {formResponses.completedMO.length === 0 ? (
                    <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
                      Brak raportów zakończonych MO dla tego zadania.
                    </Typography>
                  ) : (
                    <TableContainer>
                      <Table size="small">
                        <TableHead>
                          <TableRow>
                            <TableCell>Data</TableCell>
                            <TableCell>Godzina</TableCell>
                            <TableCell>Email</TableCell>
                            <TableCell>Numer MO</TableCell>
                            <TableCell>Ilość produktu</TableCell>
                            <TableCell>Straty opakowania</TableCell>
                            <TableCell>Straty wieczka</TableCell>
                            <TableCell>Straty surowca</TableCell>
                            <TableCell>Strata - Produkt gotowy</TableCell>
                            <TableCell>Waga netto kapsułek</TableCell>
                            <TableCell>Raport mieszań</TableCell>
                            <TableCell>Akcje</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {formResponses.completedMO.map((form) => (
                            <TableRow key={form.id}>
                              <TableCell>
                                {form.date ? format(new Date(form.date), 'dd.MM.yyyy') : '-'}
                              </TableCell>
                              <TableCell>
                                {form.time || (form.date ? format(new Date(form.date), 'HH:mm') : '-')}
                              </TableCell>
                              <TableCell>{form.email || '-'}</TableCell>
                              <TableCell>{form.moNumber || '-'}</TableCell>
                              <TableCell>{form.productQuantity || '-'}</TableCell>
                              <TableCell>{form.packagingLoss || '-'}</TableCell>
                              <TableCell>{form.bulkLoss || '-'}</TableCell>
                              <TableCell>{form.rawMaterialLoss || '-'}</TableCell>
                              <TableCell>{form.finishedProductLoss || '-'}</TableCell>
                              <TableCell>{form.netCapsuleWeight || '-'}</TableCell>
                              <TableCell>
                                {form.mixingPlanReportUrl ? (
                                  <IconButton 
                                    size="small" 
                                    color="primary" 
                                    component="a" 
                                    href={form.mixingPlanReportUrl} 
                                    target="_blank" 
                                    title="Otwórz raport"
                                  >
                                    <VisibilityIcon fontSize="small" />
                                  </IconButton>
                                ) : '-'}
                              </TableCell>
                              <TableCell>
                                <IconButton 
                                  size="small" 
                                  color="primary" 
                                  component={Link} 
                                  to={`/production/forms/completed-mo?edit=true`} 
                                  onClick={() => sessionStorage.setItem('editFormData', JSON.stringify(form))} 
                                  title="Edytuj raport"
                                >
                                  <EditIcon fontSize="small" />
                                </IconButton>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  )}
                </>
              )}

              {/* Production Control Tab */}
              {formTab === 1 && (
                <>
                  {formResponses.productionControl.length === 0 ? (
                    <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
                      Brak raportów kontroli produkcji dla tego zadania.
                    </Typography>
                  ) : (
                    <TableContainer>
                      <Table size="small">
                        <TableHead>
                          <TableRow>
                            <TableCell>Data wypełnienia</TableCell>
                            <TableCell>Email</TableCell>
                            <TableCell>Imię i nazwisko</TableCell>
                            <TableCell>Stanowisko</TableCell>
                            <TableCell>Produkt</TableCell>
                            <TableCell>Nr LOT</TableCell>
                            <TableCell>Data produkcji</TableCell>
                            <TableCell>Godzina rozpoczęcia</TableCell>
                            <TableCell>Data zakończenia</TableCell>
                            <TableCell>Godzina zakończenia</TableCell>
                            <TableCell>Data ważności</TableCell>
                            <TableCell>Ilość</TableCell>
                            <TableCell>Numer zmiany</TableCell>
                            <TableCell>Temperatura</TableCell>
                            <TableCell>Wilgotność</TableCell>
                            <TableCell>Stan surowca</TableCell>
                            <TableCell>Stan opakowania</TableCell>
                            <TableCell>Zamknięcie opakowania</TableCell>
                            <TableCell>Ilość opakowań</TableCell>
                            <TableCell>Zamówienie klienta</TableCell>
                            <TableCell>Skany dokumentów</TableCell>
                            <TableCell>Zdjęcie produktu 1</TableCell>
                            <TableCell>Zdjęcie produktu 2</TableCell>
                            <TableCell>Zdjęcie produktu 3</TableCell>
                            <TableCell>Akcje</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {formResponses.productionControl.map((form) => (
                            <TableRow key={form.id}>
                              <TableCell>
                                {form.fillDate ? format(new Date(form.fillDate), 'dd.MM.yyyy HH:mm') : '-'}
                              </TableCell>
                              <TableCell>{form.email || '-'}</TableCell>
                              <TableCell>{form.name || '-'}</TableCell>
                              <TableCell>{form.position || '-'}</TableCell>
                              <TableCell>{form.productName || '-'}</TableCell>
                              <TableCell>{form.lotNumber || '-'}</TableCell>
                              <TableCell>
                                {form.productionStartDate ? format(new Date(form.productionStartDate), 'dd.MM.yyyy') : '-'}
                              </TableCell>
                              <TableCell>{form.productionStartTime || '-'}</TableCell>
                              <TableCell>
                                {form.productionEndDate ? format(new Date(form.productionEndDate), 'dd.MM.yyyy') : '-'}
                              </TableCell>
                              <TableCell>{form.productionEndTime || '-'}</TableCell>
                              <TableCell>{form.expiryDate || '-'}</TableCell>
                              <TableCell>{form.quantity || '-'}</TableCell>
                              <TableCell>
                                {Array.isArray(form.shiftNumber) ? form.shiftNumber.join(', ') : form.shiftNumber || '-'}
                              </TableCell>
                              <TableCell>{form.temperature || '-'}</TableCell>
                              <TableCell>{form.humidity || '-'}</TableCell>
                              <TableCell>{form.rawMaterialPurity || '-'}</TableCell>
                              <TableCell>{form.packagingPurity || '-'}</TableCell>
                              <TableCell>{form.packagingClosure || '-'}</TableCell>
                              <TableCell>{form.packagingQuantity || '-'}</TableCell>
                              <TableCell>{form.customerOrder || '-'}</TableCell>
                              <TableCell>
                                {form.documentScanUrl ? (
                                  <IconButton 
                                    size="small" 
                                    color="primary" 
                                    component="a" 
                                    href={form.documentScanUrl} 
                                    target="_blank" 
                                    title="Otwórz skan dokumentu"
                                  >
                                    <VisibilityIcon fontSize="small" />
                                  </IconButton>
                                ) : '-'}
                              </TableCell>
                              <TableCell>
                                {form.productPhoto1Url ? (
                                  <IconButton 
                                    size="small" 
                                    color="primary" 
                                    component="a" 
                                    href={form.productPhoto1Url} 
                                    target="_blank" 
                                    title="Otwórz zdjęcie produktu 1"
                                  >
                                    <VisibilityIcon fontSize="small" />
                                  </IconButton>
                                ) : '-'}
                              </TableCell>
                              <TableCell>
                                {form.productPhoto2Url ? (
                                  <IconButton 
                                    size="small" 
                                    color="primary" 
                                    component="a" 
                                    href={form.productPhoto2Url} 
                                    target="_blank" 
                                    title="Otwórz zdjęcie produktu 2"
                                  >
                                    <VisibilityIcon fontSize="small" />
                                  </IconButton>
                                ) : '-'}
                              </TableCell>
                              <TableCell>
                                {form.productPhoto3Url ? (
                                  <IconButton 
                                    size="small" 
                                    color="primary" 
                                    component="a" 
                                    href={form.productPhoto3Url} 
                                    target="_blank" 
                                    title="Otwórz zdjęcie produktu 3"
                                  >
                                    <VisibilityIcon fontSize="small" />
                                  </IconButton>
                                ) : '-'}
                              </TableCell>
                              <TableCell>
                                <IconButton 
                                  size="small" 
                                  color="primary" 
                                  component={Link} 
                                  to={`/production/forms/production-control?edit=true`} 
                                  onClick={() => sessionStorage.setItem('editFormData', JSON.stringify(form))} 
                                  title="Edytuj raport"
                                >
                                  <EditIcon fontSize="small" />
                                </IconButton>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  )}
                </>
              )}

              {/* Production Shift Tab */}
              {formTab === 2 && (
                <>
                  {formResponses.productionShift.length === 0 ? (
                    <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
                      Brak raportów zmian produkcyjnych dla tego zadania.
                    </Typography>
                  ) : (
                    <TableContainer>
                      <Table size="small">
                        <TableHead>
                          <TableRow>
                            <TableCell>Data wypełnienia</TableCell>
                            <TableCell>Email</TableCell>
                            <TableCell>Osoba odpowiedzialna</TableCell>
                            <TableCell>Rodzaj zmiany</TableCell>
                            <TableCell>Ilość produkcji</TableCell>
                            <TableCell>Pracownicy</TableCell>
                            <TableCell>Nadruk 1</TableCell>
                            <TableCell>Ilość nadruku 1</TableCell>
                            <TableCell>Straty nadruku 1</TableCell>
                            <TableCell>Nadruk 2</TableCell>
                            <TableCell>Ilość nadruku 2</TableCell>
                            <TableCell>Straty nadruku 2</TableCell>
                            <TableCell>Nadruk 3</TableCell>
                            <TableCell>Ilość nadruku 3</TableCell>
                            <TableCell>Straty nadruku 3</TableCell>
                            <TableCell>Straty surowca</TableCell>
                            <TableCell>Problemy maszyn</TableCell>
                            <TableCell>Inne aktywności</TableCell>
                            <TableCell>Akcje</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {formResponses.productionShift.map((form) => (
                            <TableRow key={form.id}>
                              <TableCell>
                                {form.fillDate ? format(new Date(form.fillDate), 'dd.MM.yyyy') : '-'}
                              </TableCell>
                              <TableCell>{form.email || '-'}</TableCell>
                              <TableCell>{form.responsiblePerson || '-'}</TableCell>
                              <TableCell>{form.shiftType || '-'}</TableCell>
                              <TableCell>{form.productionQuantity || '-'}</TableCell>
                              <TableCell>
                                {form.shiftWorkers && form.shiftWorkers.length > 0 ? form.shiftWorkers.join(', ') : '-'}
                              </TableCell>
                              <TableCell>
                                {form.firstProduct !== 'BRAK' ? form.firstProduct : '-'}
                              </TableCell>
                              <TableCell>{form.firstProductQuantity || '-'}</TableCell>
                              <TableCell>{form.firstProductLoss || '-'}</TableCell>
                              <TableCell>
                                {form.secondProduct !== 'BRAK' ? form.secondProduct : '-'}
                              </TableCell>
                              <TableCell>{form.secondProductQuantity || '-'}</TableCell>
                              <TableCell>{form.secondProductLoss || '-'}</TableCell>
                              <TableCell>
                                {form.thirdProduct !== 'BRAK' ? form.thirdProduct : '-'}
                              </TableCell>
                              <TableCell>{form.thirdProductQuantity || '-'}</TableCell>
                              <TableCell>{form.thirdProductLoss || '-'}</TableCell>
                              <TableCell>{form.rawMaterialLoss || '-'}</TableCell>
                              <TableCell>{form.machineIssues || '-'}</TableCell>
                              <TableCell>{form.otherActivities || '-'}</TableCell>
                              <TableCell>
                                <IconButton 
                                  size="small" 
                                  color="primary" 
                                  component={Link} 
                                  to={`/production/forms/production-shift?edit=true`} 
                                  onClick={() => sessionStorage.setItem('editFormData', JSON.stringify(form))} 
                                  title="Edytuj raport"
                                >
                                  <EditIcon fontSize="small" />
                                </IconButton>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  )}
                </>
              )}
            </Box>
          )}
        </Paper>
      </Grid>
    </Grid>
  );
};

export default memo(FormsTab); 