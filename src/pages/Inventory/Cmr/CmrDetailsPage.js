import React, { useState, lazy, Suspense } from 'react';
import {
  Typography,
  Box,
  Paper,
  Grid,
  Divider,
  Button,
  Card,
  CardHeader,
  CardContent,
  CircularProgress,
  Chip,
  styled,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Tabs,
  Tab,
  IconButton,
  Menu,
  MenuItem as MenuItemComponent,
  ListItemIcon,
  ListItemText
} from '@mui/material';
import { mb3 } from '../../../styles/muiCommonStyles';
import { useParams, Link as RouterLink } from 'react-router-dom';
import { format } from 'date-fns';
import pl from 'date-fns/locale/pl';
import {
  CMR_STATUSES,
  CMR_PAYMENT_STATUSES,
  getTransportTypeLabel,
  translatePaymentStatus,
  uploadCmrDeliveryNote,
  updateCmrDocument
} from '../../../services/logistics';
import { generateAllDeliveryNoteData, buildAttachedDocumentsWithDN } from '../../../services/logistics/deliveryNoteService';
import LabelsDisplayDialog from '../../../components/cmr/LabelsDisplayDialog';
import StatusChip from '../../../components/common/StatusChip';
import StatusStepper from '../../../components/common/StatusStepper';
import ConfirmDialog from '../../../components/common/ConfirmDialog';
import DetailPageLayout from '../../../components/common/DetailPageLayout';

import { useCmrData, useCmrWeights, useCmrAttachments, useCmrLabels, useCmrStatus } from '../../../hooks/cmr';

import EditIcon from '@mui/icons-material/Edit';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import FileCopyIcon from '@mui/icons-material/FileCopy';
import LabelIcon from '@mui/icons-material/Label';
import GridViewIcon from '@mui/icons-material/GridView';
import WarningIcon from '@mui/icons-material/Warning';
import CheckIcon from '@mui/icons-material/Check';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import PrintIcon from '@mui/icons-material/Print';
import RefreshIcon from '@mui/icons-material/Refresh';
import DescriptionIcon from '@mui/icons-material/Description';

const CmrPartiesTransportTab = lazy(() => import('./tabs/CmrPartiesTransportTab'));
const CmrItemsWeightsTab = lazy(() => import('./tabs/CmrItemsWeightsTab'));
const CmrFinanceTab = lazy(() => import('./tabs/CmrFinanceTab'));
const CmrAdditionalTab = lazy(() => import('./tabs/CmrAdditionalTab'));
const CmrPrintView = lazy(() => import('./CmrPrintView'));

function TabPanel(props) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`cmr-tabpanel-${index}`}
      aria-labelledby={`cmr-tab-${index}`}
      {...other}
    >
      {value === index && (
        <Box sx={{ py: 3 }}>
          {children}
        </Box>
      )}
    </div>
  );
}

function a11yProps(index) {
  return {
    id: `cmr-tab-${index}`,
    'aria-controls': `cmr-tabpanel-${index}`,
  };
}

const GlobalStyles = styled('style')({});

const globalPrintCss = `
  @media print {
    body * {
      visibility: hidden;
    }
    .print-container, .print-container * {
      visibility: visible;
    }
    .print-container {
      position: absolute;
      left: 0;
      top: 0;
      width: 100%;
      display: block !important;
    }
    .no-print {
      display: none !important;
    }
    @page {
      size: A4 portrait;
      margin: 10mm;
    }
    .print-header {
      text-align: center;
      margin-bottom: 20px;
      padding-bottom: 10px;
      border-bottom: 1px solid #000;
    }
    .print-section {
      margin-bottom: 15px;
      page-break-inside: avoid;
    }
    .print-section-title {
      font-weight: bold;
      border-bottom: 1px solid #ddd;
      padding-bottom: 5px;
      margin-bottom: 10px;
    }
    .print-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
      margin-bottom: 20px;
    }
    .print-grid-item {
      margin-bottom: 10px;
    }
    .print-label {
      font-weight: bold;
      font-size: 0.9rem;
    }
    .print-value {
      margin-bottom: 5px;
    }
    .print-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 20px;
    }
    .print-table th, .print-table td {
      border: 1px solid #000;
      padding: 6px;
      text-align: left;
      font-size: 0.9rem;
    }
    .print-table th {
      background-color: #f3f3f3;
    }
    .print-footer {
      margin-top: 30px;
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 20px;
    }
    .print-signature {
      text-align: center;
      margin-top: 40px;
      border-top: 1px solid #000;
      padding-top: 5px;
    }
  }
`;

const LazyFallback = (
  <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
    <CircularProgress />
  </Box>
);

const CmrDetailsPage = () => {
  const { id } = useParams();

  const [activeTab, setActiveTab] = useState(0);
  const [anchorEl, setAnchorEl] = useState(null);
  const menuOpen = Boolean(anchorEl);

  // Hooks
  const weights = useCmrWeights();
  const data = useCmrData(id, weights.calculateItemsWeightDetails);
  const attachmentHook = useCmrAttachments(id, data.cmrData, data.fetchCmrDocument);
  const labels = useCmrLabels(data.cmrData, weights.itemsWeightDetails);
  const status = useCmrStatus({
    id,
    cmrData: data.cmrData,
    setCmrData: data.setCmrData,
    fetchCmrDocument: data.fetchCmrDocument,
    loadingFormResponses: data.loadingFormResponses,
    fetchDeliveryNoteAttachments: attachmentHook.fetchDeliveryNoteAttachments
  });

  const { cmrData, loading, linkedOrders, formatDate, isEditable, navigate, currentUser, showSuccess, showError, t } = data;

  const handleEdit = () => navigate(`/inventory/cmr/${id}/edit`);
  const handleBack = () => navigate('/inventory/cmr');
  const handleTabChange = (event, newValue) => setActiveTab(newValue);
  const handlePrint = () => window.print();
  const handleMenuOpen = (event) => setAnchorEl(event.currentTarget);
  const handleMenuClose = () => setAnchorEl(null);
  const handlePrintFromMenu = () => { handleMenuClose(); handlePrint(); };
  const handleMigrateFromMenu = () => { handleMenuClose(); data.handleMigrateCmr(); };

  const handleGenerateDeliveryNotes = async () => {
    try {
      if (!cmrData.items || cmrData.items.length === 0) {
        showError(t('details.deliveryNotes.noItems'));
        return;
      }

      const { pdf, filename, text: dnText, metadata: dnMetadata } =
        await generateAllDeliveryNoteData(cmrData.items, cmrData);

      if (dnText) {
        const newAttachedDocs = buildAttachedDocumentsWithDN(cmrData.attachedDocuments, dnText);
        try {
          await updateCmrDocument(id, {
            attachedDocuments: newAttachedDocs,
            deliveryNotes: dnMetadata
          }, currentUser.uid);
          data.setCmrData(prev => ({
            ...prev,
            attachedDocuments: newAttachedDocs,
            deliveryNotes: dnMetadata
          }));
        } catch (updateErr) {
          console.error('Failed to update CMR with DN data:', updateErr);
        }
      }

      const pdfBlob = pdf.output('blob');
      try {
        await uploadCmrDeliveryNote(pdfBlob, id, currentUser.uid, filename);
        attachmentHook.fetchDeliveryNoteAttachments();
      } catch (uploadErr) {
        console.error('Failed to save DN attachment:', uploadErr);
      }

      const pdfUrl = URL.createObjectURL(pdfBlob);
      const printWindow = window.open(pdfUrl, '_blank');
      if (!printWindow) {
        pdf.save(filename);
        showSuccess(t('details.deliveryNotes.pdfSaved', { filename }));
      } else {
        showSuccess(t('details.deliveryNotes.generated', { count: dnMetadata.length }));
      }
    } catch (error) {
      console.error('Error generating Delivery Notes:', error);
      showError(t('details.deliveryNotes.generateError', { message: error.message }));
    }
  };

  return (
    <DetailPageLayout
      loading={loading}
      error={!cmrData && !loading}
      errorMessage={t('details.errors.loadingDocument')}
      backTo="/inventory/cmr"
      backLabel={t('details.backToList')}
      maxWidth="xl"
    >
      {cmrData && (
        <>
      <GlobalStyles>{globalPrintCss}</GlobalStyles>

      {/* Header */}
      <Paper sx={{ p: 3, mb: 3 }} className="no-print">
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexDirection: { xs: 'column', md: 'row' } }}>
          <Box sx={{ mb: { xs: 2, md: 0 } }}>
            <Typography variant="h4" gutterBottom sx={{ fontWeight: 600, color: 'primary.main' }}>
              {cmrData.cmrNumber}
            </Typography>
            <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
              <StatusChip status={cmrData.status} />
              {status.getPaymentStatusChip(cmrData.paymentStatus)}
              <Typography variant="body2" color="text.secondary">
                {t('details.basicInfo.created')}: {formatDate(cmrData.issueDate)}
              </Typography>
            </Box>
          </Box>

          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
            <Button variant="outlined" startIcon={<ArrowBackIcon />} onClick={handleBack} sx={{ minWidth: 'auto' }}>
              {t('details.backToList')}
            </Button>

            {isEditable && (
              <Button variant="contained" startIcon={<EditIcon />} onClick={handleEdit} color="primary">
                {t('details.editDocument')}
              </Button>
            )}

            {cmrData.status === CMR_STATUSES.DRAFT && (
              <Button variant="contained" color="primary" onClick={() => status.handleTransportValidation(CMR_STATUSES.ISSUED)}>
                {t('details.statusActions.setIssued')}
              </Button>
            )}

            {cmrData.status === CMR_STATUSES.ISSUED && (
              <Button variant="contained" color="warning" onClick={() => status.handleTransportValidation(CMR_STATUSES.IN_TRANSIT)}>
                {t('details.statusActions.setInTransit')}
              </Button>
            )}

            {cmrData.status === CMR_STATUSES.IN_TRANSIT && (
              <Button variant="contained" color="success" onClick={() => status.handleTransportValidation(CMR_STATUSES.DELIVERED)}>
                {t('details.statusActions.setDelivered')}
              </Button>
            )}

            {cmrData.status === CMR_STATUSES.DELIVERED && (
              <Button variant="contained" color="info" onClick={() => status.handleTransportValidation(CMR_STATUSES.COMPLETED)}>
                {t('details.statusActions.setCompleted')}
              </Button>
            )}

            {(cmrData.status === CMR_STATUSES.DRAFT || cmrData.status === CMR_STATUSES.ISSUED) && (
              <Button variant="contained" color="error" onClick={() => status.handleTransportValidation(CMR_STATUSES.CANCELED)}>
                {t('details.statusActions.setCanceled')}
              </Button>
            )}

            <Button variant="outlined" startIcon={<FileCopyIcon />} onClick={data.handleGenerateOfficialCmr} color="success">
              {t('details.actions.generateOfficialCMR')}
            </Button>

            <Button variant="outlined" startIcon={<DescriptionIcon />} onClick={handleGenerateDeliveryNotes} color="info" disabled={!cmrData.items || cmrData.items.length === 0}>
              {t('details.actions.deliveryNotes')}
            </Button>

            {weights.weightSummary && (weights.weightSummary.totalPallets > 0 || weights.weightSummary.totalBoxes > 0) && (
              <Box sx={{ display: 'flex', gap: 0.5 }}>
                <Button variant="outlined" startIcon={<LabelIcon />} onClick={labels.handleBoxLabel} size="small" color="secondary"
                  disabled={weights.weightSummary.totalBoxes === 0 || !weights.itemsWeightDetails.some(item => item.hasDetailedData && item.hasBoxes)}>
                  {t('details.actions.boxLabels', { count: weights.weightSummary.totalBoxes })}
                </Button>
                <Button variant="outlined" startIcon={<GridViewIcon />} onClick={labels.handlePalletLabel} size="small" color="secondary"
                  disabled={weights.weightSummary.totalPallets === 0}>
                  {t('details.actions.palletLabels', { count: weights.weightSummary.totalPallets })}
                </Button>
              </Box>
            )}

            <IconButton onClick={handleMenuOpen} size="small" sx={{ ml: 1 }}>
              <MoreVertIcon />
            </IconButton>

            <Menu anchorEl={anchorEl} open={menuOpen} onClose={handleMenuClose}
              transformOrigin={{ horizontal: 'right', vertical: 'top' }}
              anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}>
              <MenuItemComponent onClick={handlePrintFromMenu}>
                <ListItemIcon><PrintIcon fontSize="small" /></ListItemIcon>
                <ListItemText>{t('details.actions.print')}</ListItemText>
              </MenuItemComponent>
              <MenuItemComponent onClick={handleMigrateFromMenu}>
                <ListItemIcon><RefreshIcon fontSize="small" /></ListItemIcon>
                <ListItemText>{t('details.actions.migrate')}</ListItemText>
              </MenuItemComponent>
            </Menu>
          </Box>
        </Box>

        <Box sx={{ mt: 2, mb: 1 }}>
          <StatusStepper
            steps={[CMR_STATUSES.DRAFT, CMR_STATUSES.ISSUED, CMR_STATUSES.IN_TRANSIT, CMR_STATUSES.DELIVERED, CMR_STATUSES.COMPLETED]}
            currentStatus={cmrData.status}
            cancelledStatus={CMR_STATUSES.CANCELED}
            isCancelled={cmrData.status === CMR_STATUSES.CANCELED}
          />
        </Box>
      </Paper>

      {/* Tabs navigation */}
      <Paper sx={mb3} className="no-print">
        <Tabs value={activeTab} onChange={handleTabChange} variant="scrollable" scrollButtons="auto" sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tab label={t('details.tabs.basic')} {...a11yProps(0)} />
          <Tab label={t('details.tabs.partiesTransport')} {...a11yProps(1)} />
          <Tab label={t('details.tabs.itemsWeights')} {...a11yProps(2)} />
          <Tab label={t('details.tabs.financeSettings')} {...a11yProps(3)} />
          <Tab label={t('details.tabs.additional')} {...a11yProps(4)} />
        </Tabs>
      </Paper>

      {/* Tab content */}
      <div className="no-print">
        {/* Tab 0: Basic - inline */}
        <TabPanel value={activeTab} index={0}>
          <Grid container spacing={3}>
            <Grid item xs={12} lg={8}>
              <Card sx={mb3}>
                <CardHeader title={t('details.basicInfo.title')} titleTypographyProps={{ variant: 'h6', fontWeight: 600 }} sx={{ pb: 1 }} />
                <Divider />
                <CardContent>
                  <Grid container spacing={3}>
                    <Grid item xs={6} sm={3}>
                      <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', fontWeight: 600 }}>{t('details.basicInfo.cmrNumber')}</Typography>
                      <Typography variant="body1" sx={{ fontWeight: 500 }}>{cmrData.cmrNumber}</Typography>
                    </Grid>
                    <Grid item xs={6} sm={3}>
                      <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', fontWeight: 600 }}>{t('details.basicInfo.issueDate')}</Typography>
                      <Typography variant="body1">{formatDate(cmrData.issueDate)}</Typography>
                    </Grid>
                    <Grid item xs={6} sm={3}>
                      <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', fontWeight: 600 }}>{t('details.basicInfo.deliveryDate')}</Typography>
                      <Typography variant="body1">{formatDate(cmrData.deliveryDate)}</Typography>
                    </Grid>
                    <Grid item xs={6} sm={3}>
                      <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', fontWeight: 600 }}>{t('details.basicInfo.transportType')}</Typography>
                      <Typography variant="body1">{getTransportTypeLabel(cmrData.transportType) || '-'}</Typography>
                    </Grid>
                  </Grid>
                </CardContent>
              </Card>

              {linkedOrders.length > 0 && (
                <Card sx={mb3}>
                  <CardHeader title={t('details.linkedOrders.title', { count: linkedOrders.length })} titleTypographyProps={{ variant: 'h6', fontWeight: 600 }} sx={{ pb: 1 }} />
                  <Divider />
                  <CardContent>
                    <Grid container spacing={2}>
                      {linkedOrders.map((order) => (
                        <Grid item xs={12} key={order.id}>
                          <Paper variant="outlined" component={RouterLink} to={`/orders/${order.id}`}
                            sx={{ p: 2, cursor: 'pointer', textDecoration: 'none', display: 'block', '&:hover': { backgroundColor: 'action.hover', borderColor: 'primary.main' } }}>
                            <Grid container spacing={2} alignItems="center">
                              <Grid item xs={12} sm={6}>
                                <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', fontWeight: 600 }}>{t('details.linkedOrders.orderNumber')}</Typography>
                                <Typography variant="body1" sx={{ color: 'primary.main', fontWeight: 600 }}>{order.orderNumber}</Typography>
                              </Grid>
                              <Grid item xs={12} sm={6}>
                                <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', fontWeight: 600 }}>{t('details.linkedOrders.customer')}</Typography>
                                <Typography variant="body1">{order.customer?.name || '-'}</Typography>
                              </Grid>
                              <Grid item xs={6} sm={3}>
                                <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', fontWeight: 600 }}>{t('details.linkedOrders.orderDate')}</Typography>
                                <Typography variant="body2">{formatDate(order.orderDate)}</Typography>
                              </Grid>
                              <Grid item xs={6} sm={3}>
                                <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', fontWeight: 600 }}>{t('details.linkedOrders.status')}</Typography>
                                <Chip label={order.status} size="small"
                                  color={order.status === 'Dostarczone' ? 'success' : order.status === 'W realizacji' ? 'warning' : order.status === 'Anulowane' ? 'error' : 'default'} />
                              </Grid>
                            </Grid>
                          </Paper>
                        </Grid>
                      ))}
                    </Grid>
                  </CardContent>
                </Card>
              )}
            </Grid>

            <Grid item xs={12} lg={4}>
              <Card sx={mb3}>
                <CardHeader title={t('details.parties.title')} titleTypographyProps={{ variant: 'h6', fontWeight: 600 }} sx={{ pb: 1 }} />
                <Divider />
                <CardContent>
                  <Box sx={mb3}>
                    <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', fontWeight: 600 }}>{t('details.parties.sender')}</Typography>
                    <Typography variant="body1" sx={{ fontWeight: 500, mb: 1 }}>{cmrData.sender}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      {cmrData.senderAddress}
                      {cmrData.senderPostalCode && cmrData.senderCity && (<><br />{cmrData.senderPostalCode} {cmrData.senderCity}</>)}
                      {cmrData.senderCountry && (<>, {cmrData.senderCountry}</>)}
                    </Typography>
                  </Box>
                  <Box sx={mb3}>
                    <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', fontWeight: 600 }}>{t('details.parties.recipient')}</Typography>
                    <Typography variant="body1" sx={{ fontWeight: 500, mb: 1 }}>{cmrData.recipient}</Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'pre-line' }}>{cmrData.recipientAddress}</Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', fontWeight: 600 }}>{t('details.parties.carrier')}</Typography>
                    <Typography variant="body1" sx={{ fontWeight: 500, mb: 1 }}>{cmrData.carrier}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      {cmrData.carrierAddress}
                      {cmrData.carrierPostalCode && cmrData.carrierCity && (<><br />{cmrData.carrierPostalCode} {cmrData.carrierCity}</>)}
                      {cmrData.carrierCountry && (<>, {cmrData.carrierCountry}</>)}
                    </Typography>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </TabPanel>

        {/* Tab 1-4: Lazy loaded */}
        <TabPanel value={activeTab} index={1}>
          <Suspense fallback={LazyFallback}>
            <CmrPartiesTransportTab cmrData={cmrData} formatDate={formatDate} t={t} />
          </Suspense>
        </TabPanel>

        <TabPanel value={activeTab} index={2}>
          <Suspense fallback={LazyFallback}>
            <CmrItemsWeightsTab cmrData={cmrData} linkedOrders={linkedOrders}
              itemsWeightDetails={weights.itemsWeightDetails} weightDetailsLoading={weights.weightDetailsLoading}
              weightSummary={weights.weightSummary} t={t} />
          </Suspense>
        </TabPanel>

        <TabPanel value={activeTab} index={3}>
          <Suspense fallback={LazyFallback}>
            <CmrFinanceTab cmrData={cmrData} t={t} />
          </Suspense>
        </TabPanel>

        <TabPanel value={activeTab} index={4}>
          <Suspense fallback={LazyFallback}>
            <CmrAdditionalTab cmrData={cmrData} t={t}
              loadingFormResponses={data.loadingFormResponses}
              loadingFormResponsesLoading={data.loadingFormResponsesLoading}
              attachmentProps={attachmentHook} />
          </Suspense>
        </TabPanel>
      </div>

      {/* Print view */}
      <Suspense fallback={null}>
        <CmrPrintView cmrData={cmrData} itemsWeightDetails={weights.itemsWeightDetails} formatDate={formatDate} t={t} />
      </Suspense>

      {/* Loading form validation dialog */}
      <Dialog open={status.loadingFormValidationDialogOpen} onClose={status.handleCancelStatusChange} maxWidth="lg" fullWidth>
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <WarningIcon color="warning" />
            {t('details.dialogs.confirmTransportTitle')}
          </Box>
        </DialogTitle>
        <DialogContent>
          <DialogContentText sx={mb3}>
            {t('details.loadingReports.dialogDescription', { count: data.loadingFormResponses.length })}
          </DialogContentText>

          {data.loadingFormResponses.length > 0 && (
            <Grid container spacing={2}>
              {data.loadingFormResponses.map((report, index) => (
                <Grid item xs={12} key={index}>
                  <Paper sx={{ p: 2, backgroundColor: 'background.default', border: 1, borderColor: 'divider' }}>
                    <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 'bold', color: 'primary.main' }}>
                      {t('details.loadingReports.formTitle', { number: index + 1 })} - {report.fillDate ? format(report.fillDate, 'dd.MM.yyyy HH:mm', { locale: pl }) : t('details.common.notSet')}
                    </Typography>

                    <Grid container spacing={2}>
                      <Grid item xs={12}>
                        <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 'bold', color: 'text.primary', borderBottom: 1, borderColor: 'divider', pb: 1 }}>
                          {t('details.loadingReports.formInfoTitle')}
                        </Typography>
                      </Grid>
                      <Grid item xs={12} sm={6} md={3}>
                        <Typography variant="caption" color="text.secondary">{t('details.loadingReports.employeeEmail')}</Typography>
                        <Typography variant="body2" sx={{ fontWeight: 500 }}>{report.email || t('details.common.notProvided')}</Typography>
                      </Grid>
                      <Grid item xs={12} sm={6} md={3}>
                        <Typography variant="caption" color="text.secondary">{t('details.loadingReports.employee')}</Typography>
                        <Typography variant="body2" sx={{ fontWeight: 500 }}>{report.employeeName || t('details.common.notProvided')}</Typography>
                      </Grid>
                      <Grid item xs={12} sm={6} md={3}>
                        <Typography variant="caption" color="text.secondary">{t('details.loadingReports.position')}</Typography>
                        <Typography variant="body2" sx={{ fontWeight: 500 }}>{report.position || t('details.common.notProvided')}</Typography>
                      </Grid>
                      <Grid item xs={12} sm={6} md={3}>
                        <Typography variant="caption" color="text.secondary">{t('details.loadingReports.fillTime')}</Typography>
                        <Typography variant="body2" sx={{ fontWeight: 500 }}>{report.fillTime || t('details.common.notProvided')}</Typography>
                      </Grid>

                      <Grid item xs={12}>
                        <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 'bold', color: 'text.primary', borderBottom: 1, borderColor: 'divider', pb: 1, mt: 2 }}>
                          {t('details.loadingReports.loadingInfoTitle')}
                        </Typography>
                      </Grid>
                      <Grid item xs={12} sm={6} md={3}>
                        <Typography variant="caption" color="text.secondary">{t('details.loadingReports.loadingDate')}</Typography>
                        <Typography variant="body2" sx={{ fontWeight: 500 }}>{report.loadingDate ? format(report.loadingDate, 'dd.MM.yyyy', { locale: pl }) : t('details.common.notProvided')}</Typography>
                      </Grid>
                      <Grid item xs={12} sm={6} md={3}>
                        <Typography variant="caption" color="text.secondary">{t('details.loadingReports.loadingTime')}</Typography>
                        <Typography variant="body2" sx={{ fontWeight: 500 }}>{report.loadingTime || t('details.common.notProvided')}</Typography>
                      </Grid>
                      <Grid item xs={12} sm={6} md={3}>
                        <Typography variant="caption" color="text.secondary">{t('details.loadingReports.carrier')}</Typography>
                        <Typography variant="body2" sx={{ fontWeight: 500 }}>{report.carrierName || t('details.common.notProvided')}</Typography>
                      </Grid>
                      <Grid item xs={12} sm={6} md={3}>
                        <Typography variant="caption" color="text.secondary">{t('details.loadingReports.vehicleRegistration')}</Typography>
                        <Typography variant="body2" sx={{ fontWeight: 500 }}>{report.vehicleRegistration || t('details.common.notProvided')}</Typography>
                      </Grid>
                      <Grid item xs={12} sm={6}>
                        <Typography variant="caption" color="text.secondary">{t('details.loadingReports.vehicleTechnicalCondition')}</Typography>
                        <Typography variant="body2" sx={{ fontWeight: 500 }}>{report.vehicleTechnicalCondition || t('details.common.notProvided')}</Typography>
                      </Grid>

                      <Grid item xs={12}>
                        <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 'bold', color: 'text.primary', borderBottom: 1, borderColor: 'divider', pb: 1, mt: 2 }}>
                          {t('details.loadingReports.goodsInfo')}
                        </Typography>
                      </Grid>
                      <Grid item xs={12} sm={6} md={3}>
                        <Typography variant="caption" color="text.secondary">{t('details.loadingReports.client')}</Typography>
                        <Typography variant="body2" sx={{ fontWeight: 500 }}>{report.clientName || t('details.common.notProvided')}</Typography>
                      </Grid>
                      <Grid item xs={12} sm={6} md={3}>
                        <Typography variant="caption" color="text.secondary">{t('details.loadingReports.orderNumber')}</Typography>
                        <Typography variant="body2" sx={{ fontWeight: 500 }}>{report.orderNumber || t('details.common.notProvided')}</Typography>
                      </Grid>
                      <Grid item xs={12} sm={6} md={3}>
                        <Typography variant="caption" color="text.secondary">{t('details.loadingReports.palletQuantity')}</Typography>
                        <Typography variant="body2" sx={{ fontWeight: 500 }}>{report.palletQuantity || t('details.common.notProvided')}</Typography>
                      </Grid>
                      <Grid item xs={12} sm={6} md={3}>
                        <Typography variant="caption" color="text.secondary">{t('details.weightSummary.weight')}</Typography>
                        <Typography variant="body2" sx={{ fontWeight: 500 }}>{report.weight || t('details.common.notProvided')}</Typography>
                      </Grid>

                      {report.palletProductName && (
                        <Grid item xs={12}>
                          <Typography variant="caption" color="text.secondary">{t('details.loadingReports.productNamePallet')}</Typography>
                          <Typography variant="body2" sx={{ fontWeight: 500 }}>{report.palletProductName}</Typography>
                        </Grid>
                      )}

                      {(report.notes || report.goodsNotes) && (
                        <>
                          <Grid item xs={12}>
                            <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 'bold', color: 'text.primary', borderBottom: 1, borderColor: 'divider', pb: 1, mt: 2 }}>
                              {t('details.loadingReports.notes')}
                            </Typography>
                          </Grid>
                          {report.notes && (
                            <Grid item xs={12} sm={6}>
                              <Typography variant="caption" color="text.secondary">{t('details.loadingReports.loadingNotes')}</Typography>
                              <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{report.notes}</Typography>
                            </Grid>
                          )}
                          {report.goodsNotes && (
                            <Grid item xs={12} sm={6}>
                              <Typography variant="caption" color="text.secondary">{t('details.loadingReports.goodsNotes')}</Typography>
                              <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{report.goodsNotes}</Typography>
                            </Grid>
                          )}
                        </>
                      )}

                      {report.documentsUrl && (
                        <>
                          <Grid item xs={12}>
                            <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 'bold', color: 'text.primary', borderBottom: 1, borderColor: 'divider', pb: 1, mt: 2 }}>
                              {t('details.attachments.title')}
                            </Typography>
                          </Grid>
                          <Grid item xs={12}>
                            <Button variant="outlined" size="small" href={report.documentsUrl} target="_blank" rel="noopener noreferrer" startIcon={<FileCopyIcon />}>
                              {report.documentsName || t('details.loadingReports.downloadAttachment')}
                            </Button>
                          </Grid>
                        </>
                      )}
                    </Grid>
                  </Paper>
                </Grid>
              ))}
            </Grid>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={status.handleCancelStatusChange} color="inherit">{t('dialogs.cancel')}</Button>
          <Button onClick={status.handleConfirmStatusChange} color="warning" variant="contained" startIcon={<CheckIcon />}>
            {t('details.loadingReports.confirmTransport')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Payment status dialog */}
      <Dialog open={status.paymentStatusDialogOpen} onClose={() => status.setPaymentStatusDialogOpen(false)}>
        <DialogTitle>{t('details.dialogs.changePaymentStatusTitle')}</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>{t('details.dialogs.selectNewPaymentStatus')}</DialogContentText>
          <FormControl fullWidth>
            <InputLabel>{t('common:common.paymentStatus')}</InputLabel>
            <Select value={status.newPaymentStatus} onChange={(e) => status.setNewPaymentStatus(e.target.value)} label={t('common:common.paymentStatus')}>
              <MenuItem value={CMR_PAYMENT_STATUSES.UNPAID}>{translatePaymentStatus(CMR_PAYMENT_STATUSES.UNPAID)}</MenuItem>
              <MenuItem value={CMR_PAYMENT_STATUSES.PAID}>{translatePaymentStatus(CMR_PAYMENT_STATUSES.PAID)}</MenuItem>
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => status.setPaymentStatusDialogOpen(false)}>{t('dialogs.cancel')}</Button>
          <Button onClick={status.handlePaymentStatusUpdate} color="primary">{t('dialogs.update')}</Button>
        </DialogActions>
      </Dialog>

      {/* Labels dialog */}
      <LabelsDisplayDialog
        open={labels.labelsDialogOpen}
        onClose={labels.handleLabelsDialogClose}
        labels={labels.currentLabels}
        title={t('details.dialogs.labelsTitle', { cmrNumber: cmrData?.cmrNumber || '' })}
        cmrData={cmrData}
        itemsWeightDetails={weights.itemsWeightDetails}
        labelType={labels.currentLabelType}
      />

      <ConfirmDialog
        open={attachmentHook.confirmDialog.open}
        title={attachmentHook.confirmDialog.title}
        message={attachmentHook.confirmDialog.message}
        onConfirm={attachmentHook.confirmDialog.onConfirm}
        onCancel={() => attachmentHook.setConfirmDialog(prev => ({ ...prev, open: false }))}
      />
        </>
      )}
    </DetailPageLayout>
  );
};

export default CmrDetailsPage;
