import React from 'react';
import {
  Grid,
  TextField,
  Typography,
  Box,
  Card,
  CardContent,
  CardHeader,
  Divider,
  IconButton,
  CircularProgress,
  Autocomplete
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';

const CmrCarrierCard = React.memo(({
  formData,
  formErrors,
  handleChange,
  selectedCarrier,
  handleCarrierSelect,
  carriers,
  carriersLoading,
  handleEditCarrier,
  handleOpenDeleteCarrierDialog,
  t
}) => {
  return (
    <Grid item xs={12}>
      <Card>
        <CardHeader
          title={t('form.carrierData')}
          titleTypographyProps={{ variant: 'h6' }}
        />
        <Divider />
        <CardContent>
          <Grid container spacing={2}>
            <Grid item xs={12}>
              <Autocomplete
                value={selectedCarrier}
                onChange={handleCarrierSelect}
                options={[
                  { id: 'ADD_NEW', name: 'Dodaj nowego przewoźnika' },
                  ...carriers
                ]}
                getOptionLabel={(option) => option?.name || ''}
                loading={carriersLoading}
                isOptionEqualToValue={(option, value) => option?.id === value?.id}
                renderOption={(props, option) => {
                  const { key, ...otherProps } = props;
                  if (option.id === 'ADD_NEW') {
                    return (
                      <Box
                        key={key}
                        component="li"
                        {...otherProps}
                        sx={{
                          fontWeight: 'bold',
                          color: 'primary.main',
                          borderBottom: '1px solid',
                          borderColor: 'divider'
                        }}
                      >
                        <AddIcon sx={{ mr: 1 }} />
                        {option.name}
                      </Box>
                    );
                  }
                  return (
                    <Box
                      key={key}
                      component="li"
                      {...otherProps}
                      sx={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        width: '100%'
                      }}
                    >
                      <Box sx={{ flex: 1 }}>
                        <Typography variant="body1">{option.name}</Typography>
                        {option.city && (
                          <Typography variant="caption" color="text.secondary">
                            {option.city}{option.country ? `, ${option.country}` : ''}
                          </Typography>
                        )}
                      </Box>
                      <Box sx={{ display: 'flex', gap: 0.5, ml: 1 }}>
                        <IconButton
                          size="small"
                          onClick={(e) => handleEditCarrier(option, e)}
                          sx={{
                            p: 0.5,
                            '&:hover': { color: 'primary.main' }
                          }}
                        >
                          <EditIcon fontSize="small" />
                        </IconButton>
                        <IconButton
                          size="small"
                          onClick={(e) => handleOpenDeleteCarrierDialog(option, e)}
                          sx={{
                            p: 0.5,
                            '&:hover': { color: 'error.main' }
                          }}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Box>
                    </Box>
                  );
                }}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label={t('form.selectCarrier')}
                    margin="normal"
                    error={!!formErrors.carrier}
                    helperText={formErrors.carrier}
                    InputProps={{
                      ...params.InputProps,
                      endAdornment: (
                        <>
                          {carriersLoading ? <CircularProgress color="inherit" size={20} /> : null}
                          {params.InputProps.endAdornment}
                        </>
                      ),
                    }}
                  />
                )}
                fullWidth
              />
            </Grid>

            <Grid item xs={12}>
              <TextField
                label={t('form.carrierAddress')}
                name="carrierAddress"
                value={formData.carrierAddress}
                onChange={handleChange}
                fullWidth
                margin="normal"
                error={!!formErrors.carrierAddress}
                helperText={formErrors.carrierAddress}
              />
            </Grid>

            <Grid item xs={12} sm={4}>
              <TextField
                label={t('form.carrierPostalCode')}
                name="carrierPostalCode"
                value={formData.carrierPostalCode}
                onChange={handleChange}
                fullWidth
                margin="normal"
              />
            </Grid>

            <Grid item xs={12} sm={4}>
              <TextField
                label={t('form.carrierCity')}
                name="carrierCity"
                value={formData.carrierCity}
                onChange={handleChange}
                fullWidth
                margin="normal"
              />
            </Grid>

            <Grid item xs={12} sm={4}>
              <TextField
                label={t('form.carrierCountry')}
                name="carrierCountry"
                value={formData.carrierCountry}
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

CmrCarrierCard.displayName = 'CmrCarrierCard';

export default CmrCarrierCard;
