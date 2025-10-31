// src/components/sales/co-reports/CashflowSummaryCards.js
import React from 'react';
import {
  Grid,
  Card,
  CardContent,
  Typography,
  Box,
  Tooltip
} from '@mui/material';
import {
  ShoppingCart as ShoppingCartIcon,
  Description as DescriptionIcon,
  Receipt as ReceiptIcon,
  AccountBalance as AccountBalanceIcon,
  Schedule as ScheduleIcon,
  TrendingUp as TrendingUpIcon,
  Assessment as AssessmentIcon,
  Timer as TimerIcon
} from '@mui/icons-material';
import { formatCurrency } from '../../../utils/formatUtils';
import { useTranslation } from '../../../hooks/useTranslation';

/**
 * Komponent wyświetlający karty podsumowujące dla cashflow
 */
const CashflowSummaryCards = ({ statistics, currency = 'EUR' }) => {
  const { t } = useTranslation('cashflow');

  if (!statistics) {
    return null;
  }

  const cards = [
    {
      title: t('cashflow.summary.totalOrders'),
      value: statistics.totalOrders,
      icon: <ShoppingCartIcon />,
      color: 'primary',
      format: 'number'
    },
    {
      title: t('cashflow.summary.orderValue'),
      value: statistics.totalOrderValue,
      icon: <AssessmentIcon />,
      color: 'info',
      format: 'currency'
    },
    {
      title: t('cashflow.summary.proformaValue'),
      value: statistics.totalProformaValue,
      icon: <DescriptionIcon />,
      color: 'warning',
      format: 'currency',
      tooltip: 'Suma wartości wszystkich proform (zaliczek)'
    },
    {
      title: t('cashflow.summary.totalPaid'),
      value: statistics.totalPaid,
      icon: <AccountBalanceIcon />,
      color: 'success',
      format: 'currency'
    },
    {
      title: t('cashflow.summary.totalRemaining'),
      value: statistics.totalRemaining,
      icon: <ScheduleIcon />,
      color: 'error',
      format: 'currency'
    },
    {
      title: t('cashflow.summary.paymentRate'),
      value: statistics.paymentRate,
      icon: <TrendingUpIcon />,
      color: 'success',
      format: 'percentage',
      tooltip: 'Procent zamówień w pełni opłaconych'
    },
    {
      title: t('cashflow.summary.avgOrderValue'),
      value: statistics.avgOrderValue,
      icon: <ReceiptIcon />,
      color: 'secondary',
      format: 'currency'
    },
    {
      title: t('cashflow.summary.avgPaymentTime'),
      value: statistics.avgPaymentTime,
      icon: <TimerIcon />,
      color: 'info',
      format: 'days',
      tooltip: 'Średni czas od zamówienia do pierwszej płatności'
    }
  ];

  const formatValue = (value, format) => {
    if (value === null || value === undefined) return '-';

    switch (format) {
      case 'currency':
        return formatCurrency(value, currency);
      case 'percentage':
        return `${value.toFixed(1)}%`;
      case 'days':
        return `${value} ${t('cashflow.summary.days')}`;
      case 'number':
      default:
        return value.toLocaleString('pl-PL');
    }
  };

  return (
    <Grid container spacing={2} sx={{ mb: 3 }}>
      {cards.map((card, index) => (
        <Grid item xs={12} sm={6} md={3} key={index}>
          <Tooltip title={card.tooltip || ''} arrow>
            <Card 
              elevation={2}
              sx={{
                height: '100%',
                transition: 'transform 0.2s, box-shadow 0.2s',
                '&:hover': {
                  transform: 'translateY(-4px)',
                  boxShadow: 4
                }
              }}
            >
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: 48,
                      height: 48,
                      borderRadius: 2,
                      bgcolor: `${card.color}.light`,
                      color: `${card.color}.dark`,
                      mr: 2
                    }}
                  >
                    {card.icon}
                  </Box>
                  <Typography 
                    variant="body2" 
                    color="text.secondary"
                    sx={{ 
                      flex: 1,
                      fontSize: '0.875rem',
                      lineHeight: 1.2
                    }}
                  >
                    {card.title}
                  </Typography>
                </Box>
                <Typography 
                  variant="h5" 
                  component="div" 
                  fontWeight="bold"
                  color={`${card.color}.main`}
                  sx={{
                    fontSize: { xs: '1.25rem', sm: '1.5rem' }
                  }}
                >
                  {formatValue(card.value, card.format)}
                </Typography>
              </CardContent>
            </Card>
          </Tooltip>
        </Grid>
      ))}
    </Grid>
  );
};

export default CashflowSummaryCards;

