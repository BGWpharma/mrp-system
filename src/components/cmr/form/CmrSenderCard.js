import React from 'react';
import {
  Grid,
  TextField,
  Card,
  CardContent,
  CardHeader,
  Divider
} from '@mui/material';

const CmrSenderCard = React.memo(({
  formData,
  formErrors,
  handleChange
}) => {
  return (
    <Grid item xs={12}>
      <Card>
        <CardHeader
          title="Dane nadawcy"
          titleTypographyProps={{ variant: 'h6' }}
        />
        <Divider />
        <CardContent>
          <Grid container spacing={2}>
            <Grid item xs={12}>
              <TextField
                label="Nazwa nadawcy"
                name="sender"
                value={formData.sender}
                onChange={handleChange}
                fullWidth
                margin="normal"
                error={formErrors.sender}
                helperText={formErrors.sender}
              />
            </Grid>

            <Grid item xs={12}>
              <TextField
                label="Adres nadawcy"
                name="senderAddress"
                value={formData.senderAddress}
                onChange={handleChange}
                fullWidth
                margin="normal"
              />
            </Grid>

            <Grid item xs={12} sm={4}>
              <TextField
                label="Kod pocztowy nadawcy"
                name="senderPostalCode"
                value={formData.senderPostalCode}
                onChange={handleChange}
                fullWidth
                margin="normal"
              />
            </Grid>

            <Grid item xs={12} sm={4}>
              <TextField
                label="Miasto nadawcy"
                name="senderCity"
                value={formData.senderCity}
                onChange={handleChange}
                fullWidth
                margin="normal"
              />
            </Grid>

            <Grid item xs={12} sm={4}>
              <TextField
                label="Kraj nadawcy"
                name="senderCountry"
                value={formData.senderCountry}
                onChange={handleChange}
                fullWidth
                margin="normal"
              />
            </Grid>
          </Grid>
        </CardContent>
      </Card>
    </Grid>
  );
});

CmrSenderCard.displayName = 'CmrSenderCard';

export default CmrSenderCard;
