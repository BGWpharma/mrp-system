import React from 'react';
import { Snackbar, Alert, Button } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { useVersionCheck } from '../../hooks/useVersionCheck';

function UpdateNotification() {
  const { t } = useTranslation('common');
  const { updateAvailable, applyUpdate } = useVersionCheck();

  return (
    <Snackbar
      open={updateAvailable}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
    >
      <Alert
        severity="info"
        variant="filled"
        sx={{ width: '100%' }}
        action={
          <Button color="inherit" size="small" onClick={applyUpdate}>
            {t('updateNotification.refresh')}
          </Button>
        }
      >
        {t('updateNotification.message')}
      </Alert>
    </Snackbar>
  );
}

export default UpdateNotification;
