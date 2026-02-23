import React from 'react';
import {
  Grid,
  TextField,
  Card,
  CardContent,
  CardHeader,
  Divider
} from '@mui/material';

const CmrRecipientCard = React.memo(({
  formData,
  formErrors,
  handleChange,
  t
}) => {
  return (
    <Grid item xs={12}>
      <Card>
        <CardHeader
          title="Dane odbiorcy"
          titleTypographyProps={{ variant: 'h6' }}
        />
        <Divider />
        <CardContent>
          <Grid container spacing={2}>
            <Grid item xs={12}>
              <TextField
                label="Nazwa odbiorcy"
                name="recipient"
                value={formData.recipient}
                onChange={handleChange}
                fullWidth
                margin="normal"
                error={formErrors.recipient}
                helperText={formErrors.recipient}
              />
            </Grid>

            <Grid item xs={12}>
              <TextField
                label="Adres odbiorcy"
                name="recipientAddress"
                value={formData.recipientAddress}
                onChange={handleChange}
                fullWidth
                margin="normal"
                multiline
                rows={4}
                error={formErrors.recipientAddress}
                helperText={formErrors.recipientAddress || "Pełny adres odbiorcy (ulica, kod pocztowy, miasto, kraj)"}
                placeholder={t('form.addressPlaceholder')}
              />
            </Grid>
          </Grid>
        </CardContent>
      </Card>
    </Grid>
  );
});

CmrRecipientCard.displayName = 'CmrRecipientCard';

export default CmrRecipientCard;
