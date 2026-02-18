import React from 'react';
import { 
  Typography, 
  Box, 
  Paper, 
  List, 
  ListItem, 
  ListItemIcon, 
  ListItemText,
  Divider
} from '@mui/material';
import { 
  Numbers as NumbersIcon,
  Key as KeyIcon,
  Login as LoginIcon,
  Person as PersonIcon,
  Payments as PaymentsIcon,
  ArrowRight as ArrowRightIcon,
  Shield as ShieldIcon
} from '@mui/icons-material';
  import { useTranslation } from '../../hooks/useTranslation';

  const ApiKeyInstructions = () => {
    const { t } = useTranslation('aiAssistant');
    return (
    <Paper sx={{ p: 3, mt: 4, mb: 4 }}>
      <Typography variant="h5" gutterBottom>
        {t('aiAssistant.instructions.title')}
      </Typography>
      
      <Divider sx={{ my: 2 }} />
      
      <Typography variant="body1" paragraph>
        {t('aiAssistant.instructions.intro')}
      </Typography>
      
      <List>
        <ListItem>
          <ListItemIcon>
            <NumbersIcon color="primary" />
          </ListItemIcon>
          <ListItemText 
            primary={t('aiAssistant.instructions.steps.step1.title')} 
            secondary={t('aiAssistant.instructions.steps.step1.desc')}
          />
        </ListItem>
        
        <ListItem>
          <ListItemIcon>
            <LoginIcon color="primary" />
          </ListItemIcon>
          <ListItemText 
            primary={t('aiAssistant.instructions.steps.step2.title')} 
            secondary={t('aiAssistant.instructions.steps.step2.desc')}
          />
        </ListItem>
        
        <ListItem>
          <ListItemIcon>
            <PersonIcon color="primary" />
          </ListItemIcon>
          <ListItemText 
            primary={t('aiAssistant.instructions.steps.step3.title')} 
            secondary={t('aiAssistant.instructions.steps.step3.desc')}
          />
        </ListItem>
        
        <ListItem>
          <ListItemIcon>
            <PaymentsIcon color="primary" />
          </ListItemIcon>
          <ListItemText 
            primary={t('aiAssistant.instructions.steps.step4.title')} 
            secondary={t('aiAssistant.instructions.steps.step4.desc')}
          />
        </ListItem>
        
        <ListItem>
          <ListItemIcon>
            <KeyIcon color="primary" />
          </ListItemIcon>
          <ListItemText 
            primary={t('aiAssistant.instructions.steps.step5.title')} 
            secondary={t('aiAssistant.instructions.steps.step5.desc')}
          />
        </ListItem>
        
        <ListItem>
          <ListItemIcon>
            <ArrowRightIcon color="primary" />
          </ListItemIcon>
          <ListItemText 
            primary={t('aiAssistant.instructions.steps.step6.title')} 
            secondary={t('aiAssistant.instructions.steps.step6.desc')}
          />
        </ListItem>
        
        <ListItem>
          <ListItemIcon>
            <ShieldIcon color="primary" />
          </ListItemIcon>
          <ListItemText 
            primary={t('aiAssistant.instructions.steps.step7.title')} 
            secondary={t('aiAssistant.instructions.steps.step7.desc')}
          />
        </ListItem>
      </List>
      
      <Divider sx={{ my: 2 }} />
      
      <Box sx={{ mt: 2, bgcolor: 'info.light', p: 2, borderRadius: 1 }}>
        <Typography variant="subtitle1" sx={{ color: 'info.contrastText', mb: 1 }}>
          {t('aiAssistant.instructions.important.title')}
        </Typography>
        <Typography variant="body2" sx={{ color: 'info.contrastText' }}>
          • {t('aiAssistant.instructions.important.confidential')}<br />
          • {t('aiAssistant.instructions.important.billing')}<br />
          • {t('aiAssistant.instructions.important.gpt4oCost')}<br />
          • {t('aiAssistant.instructions.important.monitor')}<br />
          • {t('aiAssistant.instructions.important.deactivate')}
        </Typography>
      </Box>
      
      <Typography variant="caption" display="block" sx={{ mt: 3, color: 'text.secondary' }}>
        {t('aiAssistant.instructions.docsLinkLabel')}
        <a href="https://platform.openai.com/docs" target="_blank" rel="noopener noreferrer" style={{ marginLeft: '4px' }}>
          https://platform.openai.com/docs
        </a>
      </Typography>
    </Paper>
  );
};

export default ApiKeyInstructions; 