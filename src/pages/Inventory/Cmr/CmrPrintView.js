import React from 'react';
import {
  Box,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Chip
} from '@mui/material';
import { mt1 } from '../../../styles/muiCommonStyles';
import { getTransportTypeLabel } from '../../../services/logistics';

const CmrPrintView = ({ cmrData, itemsWeightDetails, formatDate, t }) => {
  return (
    <Box sx={{ display: 'none' }} className="print-container">
      <Box className="print-header">
        <Typography variant="h4" gutterBottom>
          DOKUMENT CMR
        </Typography>
        <Typography variant="h5">
          {cmrData.cmrNumber}
        </Typography>
        <Typography variant="subtitle1">
          Status: {cmrData.status}
        </Typography>
      </Box>

      <Box className="print-section">
        <Typography variant="h6" className="print-section-title">
          {t('details.basicInfo.title')}
        </Typography>

        <Box className="print-grid">
          <Box className="print-grid-item">
            <Typography className="print-label">{t('details.basicInfo.cmrNumber')}</Typography>
            <Typography className="print-value">{cmrData.cmrNumber}</Typography>
          </Box>

          <Box className="print-grid-item">
            <Typography className="print-label">{t('details.basicInfo.issueDate')}</Typography>
            <Typography className="print-value">{formatDate(cmrData.issueDate)}</Typography>
          </Box>

          <Box className="print-grid-item">
            <Typography className="print-label">{t('details.basicInfo.deliveryDate')}</Typography>
            <Typography className="print-value">{formatDate(cmrData.deliveryDate)}</Typography>
          </Box>

          <Box className="print-grid-item">
            <Typography className="print-label">{t('details.basicInfo.transportType')}</Typography>
            <Typography className="print-value">{getTransportTypeLabel(cmrData.transportType) || '-'}</Typography>
          </Box>
        </Box>
      </Box>

      <Box className="print-section">
        <Typography variant="h6" className="print-section-title">
          {t('details.parties.title')}
        </Typography>

        <Box className="print-grid">
          <Box className="print-grid-item">
            <Typography className="print-label">{t('details.parties.sender')}</Typography>
            <Typography className="print-value" sx={{ fontWeight: 'bold' }}>{cmrData.sender}</Typography>
            <Typography className="print-value">{cmrData.senderAddress}</Typography>
            <Typography className="print-value">
              {cmrData.senderPostalCode} {cmrData.senderCity}, {cmrData.senderCountry}
            </Typography>
          </Box>

          <Box className="print-grid-item">
            <Typography className="print-label">{t('details.parties.recipient')}</Typography>
            <Typography className="print-value" sx={{ fontWeight: 'bold' }}>{cmrData.recipient}</Typography>
            <Typography className="print-value" sx={{ whiteSpace: 'pre-line' }}>
              {cmrData.recipientAddress}
            </Typography>
          </Box>
        </Box>

        <Box sx={{ mt: 3 }}>
          <Typography className="print-label">{t('details.parties.carrier')}</Typography>
          <Typography className="print-value" sx={{ fontWeight: 'bold' }}>{cmrData.carrier}</Typography>
          <Typography className="print-value">{cmrData.carrierAddress}</Typography>
          <Typography className="print-value">
            {cmrData.carrierPostalCode} {cmrData.carrierCity}, {cmrData.carrierCountry}
          </Typography>
        </Box>
      </Box>

      <Box className="print-section">
        <Typography variant="h6" className="print-section-title">
          Miejsce załadunku i rozładunku
        </Typography>

        <Box className="print-grid">
          <Box className="print-grid-item">
            <Typography className="print-label">Miejsce załadunku</Typography>
            <Typography className="print-value">{cmrData.loadingPlace || '-'}</Typography>
            <Typography className="print-label" sx={mt1}>Data załadunku</Typography>
            <Typography className="print-value">{formatDate(cmrData.loadingDate)}</Typography>
          </Box>

          <Box className="print-grid-item">
            <Typography className="print-label">Miejsce dostawy</Typography>
            <Typography className="print-value">{cmrData.deliveryPlace || '-'}</Typography>
          </Box>
        </Box>
      </Box>

      <Box className="print-section">
        <Typography variant="h6" className="print-section-title">
          {t('details.vehicle.title')}
        </Typography>

        <Box className="print-grid">
          <Box className="print-grid-item">
            <Typography className="print-label">{t('details.vehicle.vehicleRegistration')}</Typography>
            <Typography className="print-value">{cmrData.vehicleInfo?.vehicleRegistration || '-'}</Typography>
          </Box>

          <Box className="print-grid-item">
            <Typography className="print-label">{t('details.vehicle.trailerRegistration')}</Typography>
            <Typography className="print-value">{cmrData.vehicleInfo?.trailerRegistration || '-'}</Typography>
          </Box>
        </Box>
      </Box>

      <Box className="print-section">
        <Typography variant="h6" className="print-section-title">
          {t('details.items.title')}
        </Typography>

        {cmrData.items && cmrData.items.length > 0 ? (
          <Table className="print-table">
            <TableHead>
              <TableRow>
                <TableCell>#</TableCell>
                <TableCell>{t('details.items.description')}</TableCell>
                <TableCell>{t('details.items.quantity')}</TableCell>
                <TableCell>{t('details.items.unit')}</TableCell>
                <TableCell>{t('details.items.weight')}</TableCell>
                <TableCell>{t('details.common.pallets')}</TableCell>
                <TableCell>{t('details.common.boxes')}</TableCell>
                <TableCell>{t('details.items.batchInfo')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {cmrData.items.map((item, index) => {
                const weightDetail = itemsWeightDetails.find(detail =>
                  detail.itemId === (item.id || item.description)
                );

                return (
                  <TableRow key={item.id || index}>
                    <TableCell>{index + 1}</TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        {item.description}
                        {item.isEco === true && (
                          <Chip label="ECO" size="small" color="success" variant="outlined" sx={{ fontSize: '0.65rem', height: 18 }} />
                        )}
                        {item.isEco === false && item.orderNumber && (
                          <Chip label="STD" size="small" variant="outlined" sx={{ fontSize: '0.65rem', height: 18 }} />
                        )}
                      </Box>
                    </TableCell>
                    <TableCell>
                      {item.quantity}
                      {item.orderItemTotalQuantity && (
                        <Typography variant="caption" display="block" color="text.secondary">
                          z {item.orderItemTotalQuantity} zam.
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>{item.unit}</TableCell>
                    <TableCell>{item.weight}</TableCell>
                    <TableCell>{weightDetail?.palletsCount || 0}</TableCell>
                    <TableCell>{weightDetail?.boxesCount || 0}</TableCell>
                    <TableCell>
                      {item.linkedBatches && item.linkedBatches.length > 0 ? (
                        <Box>
                          {item.linkedBatches.map((batch, batchIndex) => (
                            <Typography key={batch.id} variant="body2" sx={{ fontSize: '0.9rem' }}>
                              {batch.batchNumber || batch.lotNumber || '-'}
                              ({batch.quantity} {batch.unit || t('common:common.pieces')})
                              {batchIndex < item.linkedBatches.length - 1 ? '; ' : ''}
                            </Typography>
                          ))}
                        </Box>
                      ) : (
                        <Typography variant="body2" sx={{ fontSize: '0.9rem', fontStyle: 'italic' }}>
                          -
                        </Typography>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        ) : (
          <Typography variant="body1" sx={{ textAlign: 'center', py: 2 }}>
            {t('details.items.noItems')}
          </Typography>
        )}
      </Box>

      <Box className="print-section">
        <Typography variant="h6" className="print-section-title">
          {t('details.feesPayments.title')}
        </Typography>

        <Box className="print-grid">
          <Box className="print-grid-item">
            <Typography className="print-label">{t('details.feesPayments.freight')}</Typography>
            <Typography className="print-value">{cmrData.freight || '-'}</Typography>
          </Box>

          <Box className="print-grid-item">
            <Typography className="print-label">{t('details.feesPayments.additionalCosts')}</Typography>
            <Typography className="print-value">{cmrData.carriage || '-'}</Typography>
          </Box>

          <Box className="print-grid-item">
            <Typography className="print-label">{t('details.feesPayments.discounts')}</Typography>
            <Typography className="print-value">{cmrData.discounts || '-'}</Typography>
          </Box>

          <Box className="print-grid-item">
            <Typography className="print-label">{t('details.feesPayments.balance')}</Typography>
            <Typography className="print-value">{cmrData.balance || '-'}</Typography>
          </Box>

          <Box className="print-grid-item">
            <Typography className="print-label">{t('details.feesPayments.paymentMethod')}</Typography>
            <Typography className="print-value">
              {cmrData.paymentMethod === 'sender' ? t('details.feesPayments.paymentBySender') :
               cmrData.paymentMethod === 'recipient' ? t('details.feesPayments.paymentByRecipient') :
               t('details.feesPayments.otherPaymentMethod')}
            </Typography>
          </Box>
        </Box>

        <Box sx={{ mt: 3 }}>
          <Typography className="print-label">{t('details.specialAgreements.specialAgreements')}</Typography>
          <Typography className="print-value" sx={{ whiteSpace: 'pre-wrap' }}>
            {cmrData.specialAgreements || '-'}
          </Typography>
        </Box>

        <Box sx={{ mt: 3 }}>
          <Typography className="print-label">{t('details.specialAgreements.carrierReservations')}</Typography>
          <Typography className="print-value" sx={{ whiteSpace: 'pre-wrap' }}>
            {cmrData.reservations || '-'}
          </Typography>
        </Box>
      </Box>

      {cmrData.notes && (
        <Box className="print-section">
          <Typography variant="h6" className="print-section-title">
            {t('details.additionalInfo.notesAndAdditionalInfo')}
          </Typography>
          <Typography className="print-value" sx={{ whiteSpace: 'pre-wrap' }}>
            {cmrData.notes}
          </Typography>
        </Box>
      )}

      <Box className="print-footer">
        <Box className="print-signature">
          <Typography variant="body2">Podpis nadawcy</Typography>
        </Box>
        <Box className="print-signature">
          <Typography variant="body2">Podpis przewoźnika</Typography>
        </Box>
        <Box className="print-signature">
          <Typography variant="body2">Podpis odbiorcy</Typography>
        </Box>
      </Box>
    </Box>
  );
};

export default CmrPrintView;
