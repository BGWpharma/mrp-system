import React from 'react';
import { 
  Paper,
  Typography,
  Box,
  Divider,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Button,
  Alert
} from '@mui/material';
import {
  ErrorOutline as ErrorIcon,
  Info as InfoIcon,
  CheckCircleOutline as CheckIcon,
  Warning as WarningIcon,
  Payments as PaymentsIcon,
  ArrowForward as ArrowForwardIcon
} from '@mui/icons-material';
  import { useTranslation } from '../../hooks/useTranslation';

/**
 * Komponent wyświetlający szczegółowe informacje o błędzie przekroczenia limitu API OpenAI
 * oraz porady jak rozwiązać ten problem
 */
  const APIQuotaAlert = () => {
    const { t } = useTranslation('aiAssistant');
  const handleOpenBillingPage = () => {
    window.open('https://platform.openai.com/account/billing', '_blank');
  };
  
  const handleOpenAPIDocsPage = () => {
    window.open('https://platform.openai.com/docs/guides/error-codes/api-errors', '_blank');
  };
  
  return (
    <Paper sx={{ p: 3, mb: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <ErrorIcon color="error" fontSize="large" />
          <Typography variant="h5" color="error.main">
            {t('aiAssistant.quota.title')}
          </Typography>
      </Box>
      
        <Alert severity="warning" sx={{ mb: 3 }}>
          {t('aiAssistant.quota.alert')}
        </Alert>
      
        <Typography variant="body1" paragraph>
          {t('aiAssistant.quota.explainerPrefix')} <strong>"You exceeded your current quota"</strong> {t('aiAssistant.quota.explainerSuffix')}
        </Typography>
      
      <List>
        <ListItem>
          <ListItemIcon>
            <WarningIcon color="warning" />
          </ListItemIcon>
            <ListItemText 
              primary={t('aiAssistant.quota.causes.freeTier.title')} 
              secondary={t('aiAssistant.quota.causes.freeTier.desc')}
            />
        </ListItem>
        
        <ListItem>
          <ListItemIcon>
            <WarningIcon color="warning" />
          </ListItemIcon>
            <ListItemText 
              primary={t('aiAssistant.quota.causes.monthlyCap.title')} 
              secondary={t('aiAssistant.quota.causes.monthlyCap.desc')}
            />
        </ListItem>
        
        <ListItem>
          <ListItemIcon>
            <WarningIcon color="warning" />
          </ListItemIcon>
            <ListItemText 
              primary={t('aiAssistant.quota.causes.payment.title')} 
              secondary={t('aiAssistant.quota.causes.payment.desc')}
            />
        </ListItem>
        
        <ListItem>
          <ListItemIcon>
            <InfoIcon color="info" />
          </ListItemIcon>
            <ListItemText 
              primary={t('aiAssistant.quota.causes.tooManyRequests.title')} 
              secondary={t('aiAssistant.quota.causes.tooManyRequests.desc')}
            />
        </ListItem>
      </List>
      
      <Divider sx={{ my: 2 }} />
      
        <Typography variant="h6" gutterBottom>
          {t('aiAssistant.quota.howTo.title')}
        </Typography>
      
      <List>
        <ListItem>
          <ListItemIcon>
            <CheckIcon color="success" />
          </ListItemIcon>
            <ListItemText 
              primary={t('aiAssistant.quota.howTo.step1.title')} 
              secondary={t('aiAssistant.quota.howTo.step1.desc')}
            />
        </ListItem>
        
        <ListItem>
          <ListItemIcon>
            <CheckIcon color="success" />
          </ListItemIcon>
            <ListItemText 
              primary={t('aiAssistant.quota.howTo.step2.title')} 
              secondary={t('aiAssistant.quota.howTo.step2.desc')}
            />
        </ListItem>
        
        <ListItem>
          <ListItemIcon>
            <CheckIcon color="success" />
          </ListItemIcon>
            <ListItemText 
              primary={t('aiAssistant.quota.howTo.step3.title')} 
              secondary={t('aiAssistant.quota.howTo.step3.desc')}
            />
        </ListItem>
      </List>
      
      <Box sx={{ display: 'flex', gap: 2, mt: 3, justifyContent: 'center' }}>
        <Button 
          variant="contained" 
          color="primary" 
          startIcon={<PaymentsIcon />}
          onClick={handleOpenBillingPage}
        >
            {t('aiAssistant.quota.howTo.goToBilling')}
        </Button>
        
        <Button 
          variant="outlined" 
          endIcon={<ArrowForwardIcon />}
          onClick={handleOpenAPIDocsPage}
        >
            {t('aiAssistant.quota.howTo.apiErrorsDocs')}
        </Button>
      </Box>
      
        <Typography variant="caption" sx={{ display: 'block', mt: 3, textAlign: 'center', color: 'text.secondary' }}>
          {t('aiAssistant.quota.notice')}
        </Typography>
    </Paper>
  );
};

export default APIQuotaAlert; 