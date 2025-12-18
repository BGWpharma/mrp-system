import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  IconButton,
  Divider,
  alpha
} from '@mui/material';
import {
  HelpOutline as FaqIcon,
  ExpandMore as ExpandMoreIcon,
  Close as CloseIcon
} from '@mui/icons-material';
import { useTranslation } from '../../hooks/useTranslation';
import { useTheme } from '../../contexts/ThemeContext';

/**
 * Dialog FAQ z najczęściej zadawanymi pytaniami
 * @param {boolean} open - Czy dialog jest otwarty
 * @param {function} onClose - Funkcja wywoływana przy zamknięciu dialogu
 */
const FaqDialog = ({ open, onClose }) => {
  const { t } = useTranslation('faq');
  const { mode } = useTheme();
  const [expanded, setExpanded] = useState(false);

  const handleChange = (panel) => (event, isExpanded) => {
    setExpanded(isExpanded ? panel : false);
  };

  // Lista FAQ - można rozbudować w przyszłości lub przenieść do pliku tłumaczeń
  const faqItems = [
    {
      id: 'general-1',
      question: t('questions.general1.question'),
      answer: t('questions.general1.answer')
    },
    {
      id: 'general-2',
      question: t('questions.general2.question'),
      answer: t('questions.general2.answer')
    },
    {
      id: 'production-1',
      question: t('questions.production1.question'),
      answer: t('questions.production1.answer')
    },
    {
      id: 'production-2',
      question: t('questions.production2.question'),
      answer: t('questions.production2.answer')
    },
    {
      id: 'inventory-1',
      question: t('questions.inventory1.question'),
      answer: t('questions.inventory1.answer')
    },
    {
      id: 'inventory-2',
      question: t('questions.inventory2.question'),
      answer: t('questions.inventory2.answer')
    },
    {
      id: 'orders-1',
      question: t('questions.orders1.question'),
      answer: t('questions.orders1.answer')
    },
    {
      id: 'orders-2',
      question: t('questions.orders2.question'),
      answer: t('questions.orders2.answer')
    }
  ];

  return (
    <Dialog 
      open={open} 
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 3,
          maxHeight: '80vh'
        }
      }}
    >
      <DialogTitle sx={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'space-between',
        background: mode === 'dark' 
          ? 'linear-gradient(135deg, rgba(33, 150, 243, 0.15) 0%, rgba(25, 118, 210, 0.1) 100%)'
          : 'linear-gradient(135deg, rgba(33, 150, 243, 0.1) 0%, rgba(25, 118, 210, 0.05) 100%)',
        borderBottom: '1px solid',
        borderColor: mode === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <FaqIcon sx={{ color: 'info.main', fontSize: 28 }} />
          <Typography variant="h6" fontWeight="bold">
            {t('title')}
          </Typography>
        </Box>
        <IconButton onClick={onClose} size="small">
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      
      <DialogContent sx={{ py: 3 }}>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          {t('description')}
        </Typography>
        
        <Divider sx={{ mb: 2 }} />
        
        {faqItems.map((item, index) => (
          <Accordion 
            key={item.id}
            expanded={expanded === item.id}
            onChange={handleChange(item.id)}
            sx={{
              mb: 1,
              borderRadius: 2,
              '&:before': { display: 'none' },
              boxShadow: mode === 'dark' 
                ? '0 2px 8px rgba(0,0,0,0.3)' 
                : '0 2px 8px rgba(0,0,0,0.08)',
              '&.Mui-expanded': {
                margin: '0 0 8px 0',
                boxShadow: mode === 'dark' 
                  ? '0 4px 16px rgba(33, 150, 243, 0.2)' 
                  : '0 4px 16px rgba(33, 150, 243, 0.15)',
              }
            }}
          >
            <AccordionSummary
              expandIcon={<ExpandMoreIcon />}
              sx={{
                '&.Mui-expanded': {
                  minHeight: 48,
                  borderBottom: '1px solid',
                  borderColor: mode === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'
                },
                '& .MuiAccordionSummary-content': {
                  my: 1.5
                }
              }}
            >
              <Typography 
                fontWeight={expanded === item.id ? 600 : 500}
                color={expanded === item.id ? 'info.main' : 'text.primary'}
              >
                {item.question}
              </Typography>
            </AccordionSummary>
            <AccordionDetails sx={{ pt: 2, pb: 2.5 }}>
              <Typography 
                variant="body2" 
                color="text.secondary"
                sx={{ 
                  lineHeight: 1.7,
                  whiteSpace: 'pre-line'
                }}
              >
                {item.answer}
              </Typography>
            </AccordionDetails>
          </Accordion>
        ))}
      </DialogContent>
      
      <DialogActions sx={{ 
        px: 3, 
        py: 2,
        borderTop: '1px solid',
        borderColor: mode === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'
      }}>
        <Button onClick={onClose} variant="contained" color="primary">
          {t('close')}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default FaqDialog;



