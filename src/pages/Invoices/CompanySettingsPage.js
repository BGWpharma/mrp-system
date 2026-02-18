import React, { useRef, useState } from 'react';
import { Box, Container, Typography, Paper, Button, Snackbar, Alert, CircularProgress } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { ArrowBack as ArrowBackIcon, Save as SaveIcon } from '@mui/icons-material';
import CompanyInfoForm from '../../components/invoices/CompanyInfoForm';
import { useTranslation } from '../../hooks/useTranslation';

const CompanySettingsPage = () => {
  const navigate = useNavigate();
  const companyFormRef = useRef();
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState(null);
  const { t } = useTranslation('invoices');

  const handleBack = () => {
    navigate('/invoices');
  };

  const handleSave = async () => {
    if (!companyFormRef.current) return;
    
    setSaving(true);
    setError(null);
    
    try {
      const result = await companyFormRef.current.saveData();
      if (result.success) {
        setSuccess(true);
      } else {
        setError(result.error);
      }
    } catch (err) {
      setError(t('invoices.company.messages.saveError'));
    } finally {
      setSaving(false);
    }
  };

  const handleCloseAlert = () => {
    setSuccess(false);
    setError(null);
  };

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Paper sx={{ p: 2, mb: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Button
            startIcon={<ArrowBackIcon />}
            onClick={handleBack}
            variant="outlined"
            color="primary"
          >
            {t('invoices.company.buttons.back')}
          </Button>
          
          <Button
            startIcon={saving ? <CircularProgress size={20} /> : <SaveIcon />}
            onClick={handleSave}
            variant="contained"
            color="primary"
            disabled={saving}
          >
            {saving ? t('invoices.company.buttons.saving') : t('invoices.company.buttons.save')}
          </Button>
        </Box>
      </Paper>
      
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" gutterBottom>
          {t('invoices.company.title')}
        </Typography>
        <Typography variant="subtitle1" color="text.secondary">
          {t('invoices.company.subtitle')}
        </Typography>
      </Box>
      
      <CompanyInfoForm ref={companyFormRef} />
      
      <Snackbar open={success} autoHideDuration={6000} onClose={handleCloseAlert}>
        <Alert onClose={handleCloseAlert} severity="success" sx={{ width: '100%' }}>
          {t('invoices.company.messages.saved')}
        </Alert>
      </Snackbar>
      
      <Snackbar open={!!error} autoHideDuration={6000} onClose={handleCloseAlert}>
        <Alert onClose={handleCloseAlert} severity="error" sx={{ width: '100%' }}>
          {error}
        </Alert>
      </Snackbar>
    </Container>
  );
};

export default CompanySettingsPage; 