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
import { mb3 } from '../../../../styles/muiCommonStyles';

const CmrPartiesTransportTab = ({ cmrData, formatDate, t }) => {
  return (
    <Grid container spacing={3}>
      {/* Strony */}
      <Grid item xs={12}>
        <Card>
          <CardHeader
            title={t('details.parties.title')}
            titleTypographyProps={{ variant: 'h6', fontWeight: 600 }}
            sx={{ pb: 1 }}
          />
          <Divider />
          <CardContent>
            <Grid container spacing={3}>
              <Grid item xs={12} md={4}>
                <Box sx={mb3}>
                  <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', fontWeight: 600 }}>
                    {t('details.parties.sender')}
                  </Typography>
                  <Typography variant="body1" sx={{ fontWeight: 500, mb: 1 }}>
                    {cmrData.sender}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {cmrData.senderAddress}
                    {cmrData.senderPostalCode && cmrData.senderCity && (
                      <><br />{cmrData.senderPostalCode} {cmrData.senderCity}</>
                    )}
                    {cmrData.senderCountry && (
                      <>, {cmrData.senderCountry}</>
                    )}
                  </Typography>
                </Box>
              </Grid>

              <Grid item xs={12} md={4}>
                <Box sx={mb3}>
                  <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', fontWeight: 600 }}>
                    {t('details.parties.recipient')}
                  </Typography>
                  <Typography variant="body1" sx={{ fontWeight: 500, mb: 1 }}>
                    {cmrData.recipient}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'pre-line' }}>
                    {cmrData.recipientAddress}
                  </Typography>
                </Box>
              </Grid>

              <Grid item xs={12} md={4}>
                <Box>
                  <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', fontWeight: 600 }}>
                    {t('details.parties.carrier')}
                  </Typography>
                  <Typography variant="body1" sx={{ fontWeight: 500, mb: 1 }}>
                    {cmrData.carrier}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {cmrData.carrierAddress}
                    {cmrData.carrierPostalCode && cmrData.carrierCity && (
                      <><br />{cmrData.carrierPostalCode} {cmrData.carrierCity}</>
                    )}
                    {cmrData.carrierCountry && (
                      <>, {cmrData.carrierCountry}</>
                    )}
                  </Typography>
                </Box>
              </Grid>
            </Grid>
          </CardContent>
        </Card>
      </Grid>

      {/* Transport i lokalizacje */}
      <Grid item xs={12} md={6}>
        <Card>
          <CardHeader
            title={t('details.transport.title')}
            titleTypographyProps={{ variant: 'h6', fontWeight: 600 }}
            sx={{ pb: 1 }}
          />
          <Divider />
          <CardContent>
            <Box sx={mb3}>
              <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', fontWeight: 600 }}>
                {t('details.transport.loadingPlace')}
              </Typography>
              <Typography variant="body1" sx={{ fontWeight: 500 }}>
                {cmrData.loadingPlace || '-'}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', fontWeight: 600, display: 'block', mt: 1 }}>
                {t('details.transport.loadingDate')}
              </Typography>
              <Typography variant="body2">
                {formatDate(cmrData.loadingDate)}
              </Typography>
            </Box>

            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', fontWeight: 600 }}>
                {t('details.transport.deliveryPlace')}
              </Typography>
              <Typography variant="body1" sx={{ fontWeight: 500 }}>
                {cmrData.deliveryPlace || '-'}
              </Typography>
            </Box>
          </CardContent>
        </Card>
      </Grid>

      {/* Informacje o pojeździe */}
      <Grid item xs={12} md={6}>
        <Card>
          <CardHeader
            title={t('details.vehicle.title')}
            titleTypographyProps={{ variant: 'h6', fontWeight: 600 }}
            sx={{ pb: 1 }}
          />
          <Divider />
          <CardContent>
            <Grid container spacing={2}>
              <Grid item xs={12}>
                <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', fontWeight: 600 }}>
                  {t('details.vehicle.vehicleRegistration')}
                </Typography>
                <Typography variant="body1" sx={{ fontWeight: 500 }}>
                  {cmrData.vehicleInfo?.vehicleRegistration || '-'}
                </Typography>
              </Grid>

              <Grid item xs={12}>
                <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', fontWeight: 600 }}>
                  {t('details.vehicle.trailerRegistration')}
                </Typography>
                <Typography variant="body1" sx={{ fontWeight: 500 }}>
                  {cmrData.vehicleInfo?.trailerRegistration || '-'}
                </Typography>
              </Grid>
            </Grid>
          </CardContent>
        </Card>
      </Grid>
    </Grid>
  );
};

export default CmrPartiesTransportTab;
