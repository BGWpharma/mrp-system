import React from 'react';
import {
  Grid,
  Card,
  CardHeader,
  CardContent,
  Divider,
  Box,
  Typography
} from '@mui/material';
import { mb3, mt1 } from '../../../../styles/muiCommonStyles';

const CmrFinanceTab = ({ cmrData, t }) => {
  return (
    <Grid container spacing={3}>
      {/* Dokumenty i instrukcje */}
      <Grid item xs={12} md={6}>
        <Card>
          <CardHeader
            title={t('details.documentsInstructions.title')}
            titleTypographyProps={{ variant: 'h6', fontWeight: 600 }}
            sx={{ pb: 1 }}
          />
          <Divider />
          <CardContent>
            <Box sx={mb3}>
              <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', fontWeight: 600 }}>
                {t('details.documentsInstructions.attachedDocuments')}
              </Typography>
              <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap' }}>
                {cmrData.attachedDocuments || '-'}
              </Typography>
            </Box>

            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', fontWeight: 600 }}>
                {t('details.documentsInstructions.senderInstructions')}
              </Typography>
              <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap' }}>
                {cmrData.instructionsFromSender || '-'}
              </Typography>
            </Box>
          </CardContent>
        </Card>
      </Grid>

      {/* Opłaty i płatności */}
      <Grid item xs={12} md={6}>
        <Card>
          <CardHeader
            title={t('details.feesPayments.title')}
            titleTypographyProps={{ variant: 'h6', fontWeight: 600 }}
            sx={{ pb: 1 }}
          />
          <Divider />
          <CardContent>
            <Grid container spacing={2}>
              <Grid item xs={6}>
                <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', fontWeight: 600 }}>
                  {t('details.feesPayments.freight')}
                </Typography>
                <Typography variant="body1">
                  {cmrData.freight || '-'}
                </Typography>
              </Grid>

              <Grid item xs={6}>
                <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', fontWeight: 600 }}>
                  {t('details.feesPayments.additionalCosts')}
                </Typography>
                <Typography variant="body1">
                  {cmrData.carriage || '-'}
                </Typography>
              </Grid>

              <Grid item xs={6}>
                <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', fontWeight: 600 }}>
                  {t('details.feesPayments.discounts')}
                </Typography>
                <Typography variant="body1">
                  {cmrData.discounts || '-'}
                </Typography>
              </Grid>

              <Grid item xs={6}>
                <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', fontWeight: 600 }}>
                  {t('details.feesPayments.balance')}
                </Typography>
                <Typography variant="body1">
                  {cmrData.balance || '-'}
                </Typography>
              </Grid>

              <Grid item xs={12} sx={mt1}>
                <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', fontWeight: 600 }}>
                  {t('details.feesPayments.paymentMethod')}
                </Typography>
                <Typography variant="body1">
                  {cmrData.paymentMethod === 'sender' ? t('details.feesPayments.paymentBySender') :
                   cmrData.paymentMethod === 'recipient' ? t('details.feesPayments.paymentByRecipient') :
                   t('details.feesPayments.otherPaymentMethod')}
                </Typography>
              </Grid>
            </Grid>
          </CardContent>
        </Card>
      </Grid>

      {/* Ustalenia szczególne i uwagi */}
      <Grid item xs={12}>
        <Card>
          <CardHeader
            title={t('details.specialAgreements.title')}
            titleTypographyProps={{ variant: 'h6', fontWeight: 600 }}
            sx={{ pb: 1 }}
          />
          <Divider />
          <CardContent>
            <Grid container spacing={3}>
              <Grid item xs={12} md={6}>
                <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', fontWeight: 600 }}>
                  {t('details.specialAgreements.specialAgreements')}
                </Typography>
                <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap' }}>
                  {cmrData.specialAgreements || '-'}
                </Typography>
              </Grid>

              <Grid item xs={12} md={6}>
                <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', fontWeight: 600 }}>
                  {t('details.specialAgreements.carrierReservations')}
                </Typography>
                <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap' }}>
                  {cmrData.reservations || '-'}
                </Typography>
              </Grid>
            </Grid>
          </CardContent>
        </Card>
      </Grid>
    </Grid>
  );
};

export default CmrFinanceTab;
