import React from 'react';
import {
  Grid,
  Card,
  CardHeader,
  CardContent,
  Divider,
  Box,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  CircularProgress,
  Paper,
  Button,
  IconButton
} from '@mui/material';
import { loadingContainer } from '../../../../styles/muiCommonStyles';
import { format } from 'date-fns';
import pl from 'date-fns/locale/pl';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import DeleteIcon from '@mui/icons-material/Delete';
import DownloadIcon from '@mui/icons-material/Download';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import ReceiptIcon from '@mui/icons-material/Receipt';
import DescriptionIcon from '@mui/icons-material/Description';
import FileCopyIcon from '@mui/icons-material/FileCopy';

const CmrAdditionalTab = ({
  cmrData,
  t,
  loadingFormResponses,
  loadingFormResponsesLoading,
  attachmentProps
}) => {
  const {
    attachments,
    attachmentsLoading,
    uploadingAttachment,
    invoices,
    invoicesLoading,
    uploadingInvoice,
    otherAttachments,
    otherAttachmentsLoading,
    uploadingOtherAttachment,
    deliveryNoteAttachments,
    deliveryNoteAttachmentsLoading,
    uploadingDeliveryNote,
    handleAttachmentUpload,
    handleAttachmentDelete,
    handleInvoiceUpload,
    handleInvoiceDelete,
    handleOtherAttachmentUpload,
    handleOtherAttachmentDelete,
    handleDeliveryNoteUpload,
    handleDeliveryNoteDelete,
    formatFileSize
  } = attachmentProps;

  return (
    <Grid container spacing={3}>
      {/* Uwagi i informacje dodatkowe */}
      <Grid item xs={12} md={6}>
        <Card>
          <CardHeader
            title={t('details.additionalInfo.notesAndAdditionalInfo')}
            titleTypographyProps={{ variant: 'h6', fontWeight: 600 }}
            sx={{ pb: 1 }}
          />
          <Divider />
          <CardContent>
            <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap' }}>
              {cmrData.notes || t('details.additionalInfo.noNotes')}
            </Typography>
          </CardContent>
        </Card>
      </Grid>

      {/* Raporty załadunku towaru */}
      <Grid item xs={12} md={6}>
        <Card>
          <CardHeader
            title={t('details.loadingReports.title', { count: loadingFormResponses.length })}
            titleTypographyProps={{ variant: 'h6', fontWeight: 600 }}
            sx={{ pb: 1 }}
          />
          <Divider />
          <CardContent>
            {loadingFormResponsesLoading ? (
              <Box sx={loadingContainer}>
                <CircularProgress />
              </Box>
            ) : loadingFormResponses.length === 0 ? (
              <Typography variant="body1" color="text.secondary">
                {t('details.loadingReports.noReports')}
              </Typography>
            ) : (
              <Grid container spacing={3}>
                {loadingFormResponses.map((report, index) => (
                  <Grid item xs={12} key={index}>
                    <Paper sx={{ p: 3, backgroundColor: 'warning.light', border: 1, borderColor: 'warning.main', opacity: 0.8 }}>
                      <Typography variant="subtitle2" gutterBottom sx={{ color: 'warning.main', fontWeight: 'bold' }}>
                        {t('details.loadingReports.reportTitle', { number: index + 1 })} - {report.fillDate ? format(report.fillDate, 'dd.MM.yyyy HH:mm', { locale: pl }) : t('details.common.notSet')}
                      </Typography>

                      <Grid container spacing={2}>
                        <Grid item xs={12} sm={6} md={3}>
                          <Typography variant="body2" color="text.secondary">
                            {t('details.loadingReports.employee')}
                          </Typography>
                          <Typography variant="body1">
                            {report.employeeName || t('details.common.notProvided')}
                          </Typography>
                        </Grid>

                        <Grid item xs={12} sm={6} md={3}>
                          <Typography variant="body2" color="text.secondary">
                            {t('details.loadingReports.position')}
                          </Typography>
                          <Typography variant="body1">
                            {report.position || t('details.common.notProvided')}
                          </Typography>
                        </Grid>

                        <Grid item xs={12} sm={6} md={3}>
                          <Typography variant="body2" color="text.secondary">
                            {t('details.loadingReports.fillTime')}
                          </Typography>
                          <Typography variant="body1">
                            {report.fillTime || t('details.common.notProvided')}
                          </Typography>
                        </Grid>

                        <Grid item xs={12} sm={6} md={3}>
                          <Typography variant="body2" color="text.secondary">
                            {t('details.loadingReports.loadingDate')}
                          </Typography>
                          <Typography variant="body1">
                            {report.loadingDate ? format(report.loadingDate, 'dd.MM.yyyy', { locale: pl }) : t('details.common.notProvided')}
                          </Typography>
                        </Grid>

                        <Grid item xs={12} sm={6} md={3}>
                          <Typography variant="body2" color="text.secondary">
                            {t('details.loadingReports.loadingTime')}
                          </Typography>
                          <Typography variant="body1">
                            {report.loadingTime || t('details.common.notProvided')}
                          </Typography>
                        </Grid>

                        <Grid item xs={12} sm={6} md={3}>
                          <Typography variant="body2" color="text.secondary">
                            {t('details.loadingReports.carrier')}
                          </Typography>
                          <Typography variant="body1">
                            {report.carrierName || t('details.common.notProvided')}
                          </Typography>
                        </Grid>

                        <Grid item xs={12} sm={6} md={3}>
                          <Typography variant="body2" color="text.secondary">
                            {t('details.loadingReports.vehicleRegistration')}
                          </Typography>
                          <Typography variant="body1">
                            {report.vehicleRegistration || t('details.common.notProvided')}
                          </Typography>
                        </Grid>

                        <Grid item xs={12} sm={6} md={3}>
                          <Typography variant="body2" color="text.secondary">
                            {t('details.loadingReports.vehicleTechnicalCondition')}
                          </Typography>
                          <Typography variant="body1">
                            {report.vehicleTechnicalCondition || t('details.common.notProvided')}
                          </Typography>
                        </Grid>

                        {/* Informacje o towarze */}
                        <Grid item xs={12}>
                          <Divider sx={{ my: 2 }} />
                          <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 'bold' }}>
                            {t('details.loadingReports.goodsInfo')}
                          </Typography>
                        </Grid>

                        <Grid item xs={12} sm={6} md={3}>
                          <Typography variant="body2" color="text.secondary">
                            {t('details.loadingReports.client')}
                          </Typography>
                          <Typography variant="body1">
                            {report.clientName || t('details.common.notProvided')}
                          </Typography>
                        </Grid>

                        <Grid item xs={12} sm={6} md={3}>
                          <Typography variant="body2" color="text.secondary">
                            {t('details.loadingReports.orderNumber')}
                          </Typography>
                          <Typography variant="body1">
                            {report.orderNumber || t('details.common.notProvided')}
                          </Typography>
                        </Grid>

                        <Grid item xs={12} sm={6} md={3}>
                          <Typography variant="body2" color="text.secondary">
                            {t('details.loadingReports.palletQuantity')}
                          </Typography>
                          <Typography variant="body1">
                            {report.palletQuantity || t('details.common.notProvided')}
                          </Typography>
                        </Grid>

                        <Grid item xs={12} sm={6} md={3}>
                          <Typography variant="body2" color="text.secondary">
                            {t('details.weightSummary.weight')}
                          </Typography>
                          <Typography variant="body1">
                            {report.weight || t('details.common.notProvided')}
                          </Typography>
                        </Grid>

                        <Grid item xs={12} sm={6}>
                          <Typography variant="body2" color="text.secondary">
                            {t('details.loadingReports.palletProductName')}
                          </Typography>
                          <Typography variant="body1">
                            {report.palletProductName || t('details.common.notProvided')}
                          </Typography>
                        </Grid>

                        {/* Uwagi */}
                        {(report.notes || report.goodsNotes) && (
                          <>
                            <Grid item xs={12}>
                              <Divider sx={{ my: 2 }} />
                              <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 'bold' }}>
                                {t('details.loadingReports.notes')}
                              </Typography>
                            </Grid>

                            {report.notes && (
                              <Grid item xs={12} sm={6}>
                                <Typography variant="body2" color="text.secondary">
                                  {t('details.loadingReports.generalNotes')}
                                </Typography>
                                <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap' }}>
                                  {report.notes}
                                </Typography>
                              </Grid>
                            )}

                            {report.goodsNotes && (
                              <Grid item xs={12} sm={6}>
                                <Typography variant="body2" color="text.secondary">
                                  {t('details.loadingReports.goodsNotes')}
                                </Typography>
                                <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap' }}>
                                  {report.goodsNotes}
                                </Typography>
                              </Grid>
                            )}
                          </>
                        )}
                      </Grid>
                    </Paper>
                  </Grid>
                ))}
              </Grid>
            )}
          </CardContent>
        </Card>
      </Grid>

      {/* Wszystkie załączniki CMR */}
      <Grid item xs={12}>
        <Card>
          <CardHeader
            title={
              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                <AttachFileIcon sx={{ mr: 1 }} />
                {t('details.attachments.allTitle', { count: attachments.length + invoices.length + deliveryNoteAttachments.length + otherAttachments.length })}
              </Box>
            }
            titleTypographyProps={{ variant: 'h6', fontWeight: 600 }}
            sx={{ pb: 0 }}
          />
          <CardContent sx={{ pt: 1 }}>
            {/* Kompaktowy rząd przycisków upload */}
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
              <input accept=".pdf,.jpg,.jpeg,.png,.gif,.doc,.docx,.txt,.xls,.xlsx,.bmp,.tiff" style={{ display: 'none' }} id="cmr-attachment-upload" type="file" onChange={handleAttachmentUpload} disabled={uploadingAttachment} />
              <label htmlFor="cmr-attachment-upload">
                <Button variant="outlined" component="span" size="small" startIcon={uploadingAttachment ? <CircularProgress size={14} /> : <CloudUploadIcon />} disabled={uploadingAttachment}>
                  {t('details.attachments.attachment')}
                </Button>
              </label>

              <input accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx" style={{ display: 'none' }} id="cmr-invoice-upload" type="file" onChange={handleInvoiceUpload} disabled={uploadingInvoice} />
              <label htmlFor="cmr-invoice-upload">
                <Button variant="outlined" component="span" size="small" color="success" startIcon={uploadingInvoice ? <CircularProgress size={14} color="success" /> : <ReceiptIcon />} disabled={uploadingInvoice}>
                  {t('details.attachments.invoice')}
                </Button>
              </label>

              <input accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx,.zip,.txt" style={{ display: 'none' }} id="cmr-other-upload" type="file" onChange={handleOtherAttachmentUpload} disabled={uploadingOtherAttachment} />
              <label htmlFor="cmr-other-upload">
                <Button variant="outlined" component="span" size="small" color="info" startIcon={uploadingOtherAttachment ? <CircularProgress size={14} color="info" /> : <AttachFileIcon />} disabled={uploadingOtherAttachment}>
                  {t('details.attachments.other')}
                </Button>
              </label>

              <input accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" style={{ display: 'none' }} id="cmr-dn-upload" type="file" onChange={handleDeliveryNoteUpload} disabled={uploadingDeliveryNote} />
              <label htmlFor="cmr-dn-upload">
                <Button variant="outlined" component="span" size="small" color="success" startIcon={uploadingDeliveryNote ? <CircularProgress size={14} color="success" /> : <DescriptionIcon />} disabled={uploadingDeliveryNote}>
                  DN
                </Button>
              </label>
            </Box>

            {/* Jedna tabela ze wszystkimi plikami */}
            {(attachmentsLoading || invoicesLoading || otherAttachmentsLoading || deliveryNoteAttachmentsLoading) ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}><CircularProgress size={24} /></Box>
            ) : (attachments.length + invoices.length + deliveryNoteAttachments.length + otherAttachments.length) === 0 ? (
              <Typography variant="body2" color="text.secondary" align="center" sx={{ py: 2 }}>
                {t('details.attachments.noAttachments')}
              </Typography>
            ) : (
              <TableContainer component={Paper} variant="outlined">
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ backgroundColor: 'action.hover' }}>
                      <TableCell sx={{ fontWeight: 'bold', width: 55, py: 0.5 }}>{t('details.attachments.type')}</TableCell>
                      <TableCell sx={{ fontWeight: 'bold', py: 0.5 }}>{t('details.attachments.fileName')}</TableCell>
                      <TableCell sx={{ fontWeight: 'bold', width: 80, py: 0.5 }}>{t('details.attachments.size')}</TableCell>
                      <TableCell sx={{ fontWeight: 'bold', width: 110, py: 0.5 }}>{t('details.attachments.date')}</TableCell>
                      <TableCell sx={{ fontWeight: 'bold', width: 100, py: 0.5 }} align="center">{t('details.attachments.actions')}</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {/* Delivery Notes */}
                    {deliveryNoteAttachments.map((note) => (
                      <TableRow key={`dn-${note.id}`} hover>
                        <TableCell sx={{ py: 0.5 }}>
                          <Box sx={{ bgcolor: 'success.light', color: 'success.dark', px: 0.75, py: 0.25, borderRadius: 1, fontSize: '0.7rem', fontWeight: 'bold', display: 'inline-block' }}>DN</Box>
                        </TableCell>
                        <TableCell sx={{ py: 0.5 }}>
                          <Typography variant="body2" sx={{ fontWeight: 500, color: 'success.main', cursor: 'pointer', textDecoration: 'underline', '&:hover': { color: 'success.dark' } }} onClick={() => window.open(note.downloadURL, '_blank')}>
                            {note.fileName}
                          </Typography>
                        </TableCell>
                        <TableCell sx={{ py: 0.5 }}><Typography variant="caption" color="text.secondary">{formatFileSize(note.size)}</Typography></TableCell>
                        <TableCell sx={{ py: 0.5 }}><Typography variant="caption" color="text.secondary">{note.uploadedAt ? format(note.uploadedAt, 'dd.MM.yy HH:mm', { locale: pl }) : '-'}</Typography></TableCell>
                        <TableCell align="center" sx={{ py: 0.5 }}>
                          <Box sx={{ display: 'flex', gap: 0.25, justifyContent: 'center' }}>
                            <IconButton size="small" onClick={() => window.open(note.downloadURL, '_blank')}><OpenInNewIcon sx={{ fontSize: 16 }} /></IconButton>
                            <IconButton size="small" href={note.downloadURL} component="a" download={note.fileName}><DownloadIcon sx={{ fontSize: 16 }} /></IconButton>
                            <IconButton size="small" color="error" onClick={() => handleDeliveryNoteDelete(note.id, note.fileName)}><DeleteIcon sx={{ fontSize: 16 }} /></IconButton>
                          </Box>
                        </TableCell>
                      </TableRow>
                    ))}

                    {/* Załączniki */}
                    {attachments.map((att) => (
                      <TableRow key={`att-${att.id}`} hover>
                        <TableCell sx={{ py: 0.5 }}>
                          <Box sx={{ bgcolor: att.contentType?.includes('pdf') ? 'error.light' : att.contentType?.startsWith('image/') ? 'warning.light' : 'grey.300', color: att.contentType?.includes('pdf') ? 'error.dark' : att.contentType?.startsWith('image/') ? 'warning.dark' : 'grey.700', px: 0.75, py: 0.25, borderRadius: 1, fontSize: '0.7rem', fontWeight: 'bold', display: 'inline-block' }}>
                            {att.contentType?.includes('pdf') ? 'PDF' : att.contentType?.startsWith('image/') ? 'IMG' : 'FILE'}
                          </Box>
                        </TableCell>
                        <TableCell sx={{ py: 0.5 }}>
                          <Typography variant="body2" sx={{ fontWeight: 500, color: 'primary.main', cursor: 'pointer', textDecoration: 'underline', '&:hover': { color: 'primary.dark' } }} onClick={() => window.open(att.downloadURL, '_blank')}>
                            {att.fileName}
                          </Typography>
                        </TableCell>
                        <TableCell sx={{ py: 0.5 }}><Typography variant="caption" color="text.secondary">{formatFileSize(att.size)}</Typography></TableCell>
                        <TableCell sx={{ py: 0.5 }}><Typography variant="caption" color="text.secondary">{att.uploadedAt ? format(att.uploadedAt, 'dd.MM.yy HH:mm', { locale: pl }) : '-'}</Typography></TableCell>
                        <TableCell align="center" sx={{ py: 0.5 }}>
                          <Box sx={{ display: 'flex', gap: 0.25, justifyContent: 'center' }}>
                            <IconButton size="small" onClick={() => window.open(att.downloadURL, '_blank')}><OpenInNewIcon sx={{ fontSize: 16 }} /></IconButton>
                            <IconButton size="small" href={att.downloadURL} component="a" download={att.fileName}><DownloadIcon sx={{ fontSize: 16 }} /></IconButton>
                            <IconButton size="small" color="error" onClick={() => handleAttachmentDelete(att.id, att.fileName)}><DeleteIcon sx={{ fontSize: 16 }} /></IconButton>
                          </Box>
                        </TableCell>
                      </TableRow>
                    ))}

                    {/* Faktury */}
                    {invoices.map((inv) => (
                      <TableRow key={`inv-${inv.id}`} hover>
                        <TableCell sx={{ py: 0.5 }}>
                          <Box sx={{ bgcolor: 'success.light', color: 'success.dark', px: 0.75, py: 0.25, borderRadius: 1, fontSize: '0.7rem', fontWeight: 'bold', display: 'inline-block' }}>FV</Box>
                        </TableCell>
                        <TableCell sx={{ py: 0.5 }}>
                          <Typography variant="body2" sx={{ fontWeight: 500, color: 'success.main', cursor: 'pointer', textDecoration: 'underline', '&:hover': { color: 'success.dark' } }} onClick={() => window.open(inv.downloadURL, '_blank')}>
                            {inv.fileName}
                          </Typography>
                        </TableCell>
                        <TableCell sx={{ py: 0.5 }}><Typography variant="caption" color="text.secondary">{formatFileSize(inv.size)}</Typography></TableCell>
                        <TableCell sx={{ py: 0.5 }}><Typography variant="caption" color="text.secondary">{inv.uploadedAt ? format(inv.uploadedAt, 'dd.MM.yy HH:mm', { locale: pl }) : '-'}</Typography></TableCell>
                        <TableCell align="center" sx={{ py: 0.5 }}>
                          <Box sx={{ display: 'flex', gap: 0.25, justifyContent: 'center' }}>
                            <IconButton size="small" onClick={() => window.open(inv.downloadURL, '_blank')}><OpenInNewIcon sx={{ fontSize: 16 }} /></IconButton>
                            <IconButton size="small" href={inv.downloadURL} component="a" download={inv.fileName}><DownloadIcon sx={{ fontSize: 16 }} /></IconButton>
                            <IconButton size="small" color="error" onClick={() => handleInvoiceDelete(inv.id, inv.fileName)}><DeleteIcon sx={{ fontSize: 16 }} /></IconButton>
                          </Box>
                        </TableCell>
                      </TableRow>
                    ))}

                    {/* Inne */}
                    {otherAttachments.map((att) => (
                      <TableRow key={`other-${att.id}`} hover>
                        <TableCell sx={{ py: 0.5 }}>
                          <Box sx={{ bgcolor: 'info.light', color: 'info.dark', px: 0.75, py: 0.25, borderRadius: 1, fontSize: '0.7rem', fontWeight: 'bold', display: 'inline-block' }}>{t('details.attachments.otherBadge')}</Box>
                        </TableCell>
                        <TableCell sx={{ py: 0.5 }}>
                          <Typography variant="body2" sx={{ fontWeight: 500, color: 'info.main', cursor: 'pointer', textDecoration: 'underline', '&:hover': { color: 'info.dark' } }} onClick={() => window.open(att.downloadURL, '_blank')}>
                            {att.fileName}
                          </Typography>
                        </TableCell>
                        <TableCell sx={{ py: 0.5 }}><Typography variant="caption" color="text.secondary">{formatFileSize(att.size)}</Typography></TableCell>
                        <TableCell sx={{ py: 0.5 }}><Typography variant="caption" color="text.secondary">{att.uploadedAt ? format(att.uploadedAt, 'dd.MM.yy HH:mm', { locale: pl }) : '-'}</Typography></TableCell>
                        <TableCell align="center" sx={{ py: 0.5 }}>
                          <Box sx={{ display: 'flex', gap: 0.25, justifyContent: 'center' }}>
                            <IconButton size="small" onClick={() => window.open(att.downloadURL, '_blank')}><OpenInNewIcon sx={{ fontSize: 16 }} /></IconButton>
                            <IconButton size="small" href={att.downloadURL} component="a" download={att.fileName}><DownloadIcon sx={{ fontSize: 16 }} /></IconButton>
                            <IconButton size="small" color="error" onClick={() => handleOtherAttachmentDelete(att.id, att.fileName)}><DeleteIcon sx={{ fontSize: 16 }} /></IconButton>
                          </Box>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </CardContent>
        </Card>
      </Grid>
    </Grid>
  );
};

export default CmrAdditionalTab;
