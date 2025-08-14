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
import { useTranslation } from '../../hooks/useTranslation';
import FormsSummaryCard from './FormsSummaryCard';

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
  const { t } = useTranslation('taskDetails');

  return (
    <Grid container spacing={3}>
      {/* Sekcja podsumowania */}
      <Grid item xs={12}>
        <FormsSummaryCard formResponses={formResponses} />
      </Grid>
      
      <Grid item xs={12}>
        <Paper sx={{ p: 3 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h6" component="h2">{t('forms.title')}</Typography>
            <Box sx={{ display: 'flex', gap: 1 }}>
              {formTab === 0 && (
                <Button
                  variant="contained"
                  color="success"
                  startIcon={<AssessmentIcon />}
                  onClick={() => setCompletedMODialogOpen(true)}
                  size="medium"
                >
                  {t('forms.fillCompletedMOReport')}
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
                  {t('forms.fillProductionControlReport')}
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
                  {t('forms.fillProductionShiftReport')}
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
                      {t('forms.noCompletedMOReports')}
                    </Typography>
                  ) : (
                    <TableContainer>
                      <Table size="small">
                        <TableHead>
                          <TableRow>
                            <TableCell>{t('forms.table.date')}</TableCell>
                            <TableCell>{t('forms.table.time')}</TableCell>
                            <TableCell>{t('forms.table.email')}</TableCell>
                            <TableCell>{t('forms.table.moNumber')}</TableCell>
                            <TableCell>{t('forms.table.productQuantity')}</TableCell>
                            <TableCell>{t('forms.table.packagingLoss')}</TableCell>
                            <TableCell>{t('forms.table.bulkLoss')}</TableCell>
                            <TableCell>{t('forms.table.rawMaterialLoss')}</TableCell>
                            <TableCell>{t('forms.table.netCapsuleWeight')}</TableCell>
                            <TableCell>{t('forms.table.mixingReport')}</TableCell>
                            <TableCell>{t('forms.table.actions')}</TableCell>
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
                      {t('forms.noProductionControlReports')}
                    </Typography>
                  ) : (
                    <TableContainer>
                      <Table size="small">
                        <TableHead>
                          <TableRow>
                            <TableCell>{t('forms.table.fillDate')}</TableCell>
                            <TableCell>{t('forms.table.email')}</TableCell>
                            <TableCell>{t('forms.table.name')}</TableCell>
                            <TableCell>{t('forms.table.position')}</TableCell>
                            <TableCell>{t('forms.table.product')}</TableCell>
                            <TableCell>{t('forms.table.lotNumber')}</TableCell>
                            <TableCell>{t('forms.table.productionDate')}</TableCell>
                            <TableCell>{t('forms.table.startTime')}</TableCell>
                            <TableCell>{t('forms.table.endDate')}</TableCell>
                            <TableCell>{t('forms.table.endTime')}</TableCell>
                            <TableCell>{t('forms.table.expiryDate')}</TableCell>
                            <TableCell>{t('forms.table.quantity')}</TableCell>
                            <TableCell>{t('forms.table.shiftNumber')}</TableCell>
                            <TableCell>{t('forms.table.temperature')}</TableCell>
                            <TableCell>{t('forms.table.humidity')}</TableCell>
                            <TableCell>{t('forms.table.rawMaterialPurity')}</TableCell>
                            <TableCell>{t('forms.table.packagingPurity')}</TableCell>
                            <TableCell>{t('forms.table.packagingClosure')}</TableCell>
                            <TableCell>{t('forms.table.packagingQuantity')}</TableCell>
                            <TableCell>{t('forms.table.customerOrder')}</TableCell>
                            <TableCell>{t('forms.table.documentScans')}</TableCell>
                            <TableCell>{t('forms.table.productPhoto1')}</TableCell>
                            <TableCell>{t('forms.table.productPhoto2')}</TableCell>
                            <TableCell>{t('forms.table.productPhoto3')}</TableCell>
                            <TableCell>{t('forms.table.actions')}</TableCell>
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
                      {t('forms.noProductionShiftReports')}
                    </Typography>
                  ) : (
                    <TableContainer>
                      <Table size="small">
                        <TableHead>
                          <TableRow>
                            <TableCell>{t('forms.table.fillDate')}</TableCell>
                            <TableCell>{t('forms.table.email')}</TableCell>
                            <TableCell>{t('forms.table.responsiblePerson')}</TableCell>
                            <TableCell>{t('forms.table.shiftType')}</TableCell>
                            <TableCell>{t('forms.table.productQuantity')}</TableCell>
                            <TableCell>{t('forms.table.workers')}</TableCell>
                            <TableCell>{t('forms.table.print1')}</TableCell>
                            <TableCell>{t('forms.table.print1Quantity')}</TableCell>
                            <TableCell>{t('forms.table.print1Loss')}</TableCell>
                            <TableCell>{t('forms.table.print2')}</TableCell>
                            <TableCell>{t('forms.table.print2Quantity')}</TableCell>
                            <TableCell>{t('forms.table.print2Loss')}</TableCell>
                            <TableCell>{t('forms.table.print3')}</TableCell>
                            <TableCell>{t('forms.table.print3Quantity')}</TableCell>
                            <TableCell>{t('forms.table.print3Loss')}</TableCell>
                            <TableCell>{t('forms.table.rawMaterialLoss')}</TableCell>
                            <TableCell>{t('forms.table.finishedProductLoss')}</TableCell>
                            <TableCell>{t('forms.table.machineIssues')}</TableCell>
                            <TableCell>{t('forms.table.otherActivities')}</TableCell>
                            <TableCell>{t('forms.table.actions')}</TableCell>
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
                              <TableCell>{form.finishedProductLoss || '-'}</TableCell>
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