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
  Receipt,
  AccountBalance as AccountBalanceIcon,
  Schedule as ScheduleIcon,
  TrendingUp as TrendingUpIcon,
  Assessment as AssessmentIcon,
  Timer as TimerIcon,
  ShoppingBasket as ShoppingBasketIcon,
  AttachMoney as AttachMoneyIcon,
  Settings as SettingsIcon,
  Business as BusinessIcon
} from '@mui/icons-material';
import { formatCurrency } from '../../../utils/formatUtils';
import { useTranslation } from '../../../hooks/useTranslation';

/**
 * Komponent wyświetlający karty podsumowujące dla cashflow
 * Z GLOBALNYMI WYDATKAMI
 */
const CashflowSummaryCards = ({ statistics, globalExpenses, currency = 'EUR' }) => {
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
      color: 'warning',
      format: 'currency'
    },
    // GLOBALNE WYDATKI Z PO
    {
      title: t('cashflow.summary.totalExpenses'),
      value: statistics.totalExpenses || 0,
      icon: <ShoppingBasketIcon />,
      color: 'error',
      format: 'currency',
      tooltip: t('cashflow.summary.tooltips.totalExpenses')
    },
    {
      title: t('cashflow.summary.totalExpensesPaid'),
      value: statistics.totalExpensesPaid || 0,
      icon: <AttachMoneyIcon />,
      color: 'error',
      format: 'currency',
      tooltip: t('cashflow.summary.tooltips.totalExpensesPaid')
    },
    // KOSZTY OPERACYJNE
    {
      title: t('cashflow.summary.operationalCosts'),
      value: statistics.totalOperationalCosts || 0,
      icon: <BusinessIcon />,
      color: 'warning',
      format: 'currency',
      tooltip: t('cashflow.summary.tooltips.operationalCosts')
    },
    {
      title: t('cashflow.summary.operationalCostsPaid'),
      value: statistics.totalOperationalCostsPaid || 0,
      icon: <SettingsIcon />,
      color: 'warning',
      format: 'currency',
      tooltip: t('cashflow.summary.tooltips.operationalCostsPaid')
    },
    // ŁĄCZNE WYDATKI
    {
      title: t('cashflow.summary.totalAllExpenses'),
      value: statistics.totalAllExpenses || 0,
      icon: <Receipt />,
      color: 'error',
      format: 'currency',
      tooltip: t('cashflow.summary.tooltips.totalAllExpenses')
    },
    // BILANS
    {
      title: t('cashflow.summary.netCashflow'),
      value: statistics.netCashflow || 0,
      icon: <AccountBalanceIcon />,
      color: (statistics.netCashflow || 0) >= 0 ? 'success' : 'error',
      format: 'currency',
      tooltip: t('cashflow.summary.tooltips.netCashflow')
    },
    {
      title: t('cashflow.summary.netProfit'),
      value: statistics.netProfit || 0,
      icon: <TrendingUpIcon />,
      color: (statistics.netProfit || 0) >= 0 ? 'success' : 'error',
      format: 'currency',
      tooltip: t('cashflow.summary.tooltips.netProfit')
    },
    {
      title: t('cashflow.summary.poCount'),
      value: statistics.totalPOCount || 0,
      icon: <ShoppingBasketIcon />,
      color: 'secondary',
      format: 'number',
      tooltip: t('cashflow.summary.tooltips.poCount')
    },
    {
      title: t('cashflow.summary.paymentRate'),
      value: statistics.paymentRate,
      icon: <TrendingUpIcon />,
      color: 'success',
      format: 'percentage',
      tooltip: t('cashflow.summary.tooltips.paymentRate')
    },
    {
      title: t('cashflow.summary.avgPaymentTime'),
      value: statistics.avgPaymentTime,
      icon: <TimerIcon />,
      color: 'info',
      format: 'days',
      tooltip: t('cashflow.summary.tooltips.avgPaymentTime')
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
        <Grid item xs={12} sm={6} md={3} lg={2} key={index}>
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
              <CardContent sx={{ p: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: 40,
                      height: 40,
                      borderRadius: 2,
                      bgcolor: `${card.color}.light`,
                      color: `${card.color}.dark`,
                      mr: 1.5
                    }}
                  >
                    {React.cloneElement(card.icon, { sx: { fontSize: 20 } })}
                  </Box>
                  <Typography 
                    variant="caption" 
                    color="text.secondary"
                    sx={{ 
                      flex: 1,
                      fontSize: '0.75rem',
                      lineHeight: 1.2
                    }}
                  >
                    {card.title}
                  </Typography>
                </Box>
                <Typography 
                  variant="h6" 
                  component="div" 
                  fontWeight="bold"
                  color={`${card.color}.main`}
                  sx={{
                    fontSize: { xs: '1rem', sm: '1.15rem' }
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

