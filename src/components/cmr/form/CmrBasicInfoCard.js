import React from 'react';
import {
  Grid,
  TextField,
  Typography,
  Box,
  Button,
  Card,
  CardContent,
  CardHeader,
  Divider,
  MenuItem,
  FormHelperText,
  FormControl,
  InputLabel,
  Select,
  Chip
} from '@mui/material';
import { DatePicker } from '@mui/x-date-pickers';
import DeleteIcon from '@mui/icons-material/Delete';
import {
  CMR_PAYMENT_STATUSES,
  TRANSPORT_TYPES,
  getTransportTypeLabel,
  translatePaymentStatus
} from '../../../services/cmrService';

const CmrBasicInfoCard = React.memo(({
  formData,
  formErrors,
  handleChange,
  handleDateChange,
  handleOpenOrderDialog,
  linkedOrders,
  removeLinkedOrder,
  t
}) => {
  return (
    <Grid item xs={12}>
      <Card>
        <CardHeader
          title="Podstawowe informacje"
          titleTypographyProps={{ variant: 'h6' }}
        />
        <Divider />
        <CardContent>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
              <TextField
                label="Numer CMR"
                name="cmrNumber"
                value={formData.cmrNumber}
                onChange={handleChange}
                fullWidth
                margin="normal"
                error={formErrors.cmrNumber}
                helperText={formErrors.cmrNumber}
              />
            </Grid>

            <Grid item xs={12} sm={6}>
              <FormControl fullWidth margin="normal">
                <InputLabel>{t('common:common.paymentStatus')}</InputLabel>
                <Select
                  name="paymentStatus"
                  value={formData.paymentStatus}
                  onChange={handleChange}
                  label={t('common:common.paymentStatus')}
                >
                  <MenuItem value={CMR_PAYMENT_STATUSES.UNPAID}>
                    {translatePaymentStatus(CMR_PAYMENT_STATUSES.UNPAID)}
                  </MenuItem>
                  <MenuItem value={CMR_PAYMENT_STATUSES.PAID}>
                    {translatePaymentStatus(CMR_PAYMENT_STATUSES.PAID)}
                  </MenuItem>
                </Select>
              </FormControl>
            </Grid>

            <Grid item xs={12} sm={6}>
              <DatePicker
                label="Data wystawienia"
                value={formData.issueDate}
                onChange={(date) => handleDateChange('issueDate', date)}
                slots={{
                  textField: TextField
                }}
                slotProps={{
                  textField: {
                    fullWidth: true,
                    margin: "normal",
                    error: !!formErrors.issueDate,
                    helperText: formErrors.issueDate
                  }
                }}
              />
            </Grid>

            <Grid item xs={12} sm={6}>
              <DatePicker
                label="Data dostawy"
                value={formData.deliveryDate}
                onChange={(date) => handleDateChange('deliveryDate', date)}
                slots={{
                  textField: TextField
                }}
                slotProps={{
                  textField: {
                    fullWidth: true,
                    margin: "normal"
                  }
                }}
              />
            </Grid>

            <Grid item xs={12} sm={6}>
              <FormControl fullWidth margin="normal">
                <InputLabel>Typ transportu</InputLabel>
                <Select
                  name="transportType"
                  value={formData.transportType}
                  onChange={handleChange}
                  label="Typ transportu"
                >
                  {Object.entries(TRANSPORT_TYPES).map(([key, value]) => (
                    <MenuItem key={key} value={value}>{getTransportTypeLabel(value)}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>

            <Grid item xs={12}>
              <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
                <Button
                  variant={formData.linkedOrderId ? "contained" : "outlined"}
                  color={formData.linkedOrderId ? "success" : "primary"}
                  size="large"
                  onClick={handleOpenOrderDialog}
                  fullWidth
                  sx={{
                    py: 1.5,
                    fontSize: '16px',
                    fontWeight: 'bold',
                    border: formErrors.linkedOrderId ? '2px solid #f44336' : undefined
                  }}
                >
                  {linkedOrders.length > 0
                    ? `✓ Powiązano z ${linkedOrders.length} CO`
                    : 'Powiąż z CO (wymagane)'
                  }
                </Button>
              </Box>

              {linkedOrders.length > 0 && (
                <Box sx={{ mt: 2 }}>
                  <Typography variant="subtitle2" sx={{ mb: 1 }}>
                    Powiązane zamówienia klienta:
                  </Typography>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                    {linkedOrders.map((order) => (
                      <Chip
                        key={order.id}
                        label={`CO ${order.orderNumber} - ${order.customer?.name || 'Nieznany klient'}`}
                        variant="outlined"
                        color="primary"
                        onDelete={() => removeLinkedOrder(order.id)}
                        deleteIcon={<DeleteIcon />}
                        sx={{ mb: 1 }}
                      />
                    ))}
                  </Box>
                </Box>
              )}

              {formErrors.linkedOrderId && (
                <FormHelperText error sx={{ mt: 0, mb: 1 }}>
                  {formErrors.linkedOrderId}
                </FormHelperText>
              )}
            </Grid>
          </Grid>
        </CardContent>
      </Card>
    </Grid>
  );
});

CmrBasicInfoCard.displayName = 'CmrBasicInfoCard';

export default CmrBasicInfoCard;
