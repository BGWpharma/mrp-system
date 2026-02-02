// src/pages/Analytics/AnalyticsDashboardPage.js
import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  Grid,
  Card,
  CardContent,
  CardActionArea,
  Paper,
  alpha,
  useTheme
} from '@mui/material';
import {
  Assessment as AssessmentIcon,
  TrendingUp as TrendingUpIcon,
  AccountBalance as AccountBalanceIcon,
  Factory as FactoryIcon,
  ShoppingCart as ShoppingCartIcon,
  Inventory as InventoryIcon,
  Timeline as TimelineIcon,
  PieChart as PieChartIcon,
  BarChart as BarChartIcon,
  ShowChart as ShowChartIcon,
  Schedule as ScheduleIcon,
  LocalDining as ConsumptionIcon,
  Speed as ProgressIcon,
  MonetizationOn as CostsIcon,
  Savings as CashflowIcon,
  Blender as BlenderIcon
} from '@mui/icons-material';
import { useTranslation } from '../../hooks/useTranslation';

// Definicje kafelków raportów
const getReportTiles = (t) => [
  {
    id: 'production-costs',
    title: t('analyticsDashboard.tiles.productionCosts.title'),
    description: t('analyticsDashboard.tiles.productionCosts.description'),
    icon: CostsIcon,
    path: '/analytics/production-costs',
    gradient: 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)',
    iconBg: 'rgba(255, 255, 255, 0.2)'
  },
  {
    id: 'cashflow',
    title: t('analyticsDashboard.tiles.cashflow.title'),
    description: t('analyticsDashboard.tiles.cashflow.description'),
    icon: CashflowIcon,
    path: '/analytics/cashflow',
    gradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    iconBg: 'rgba(255, 255, 255, 0.2)'
  },
  {
    id: 'production-time',
    title: t('analyticsDashboard.tiles.productionTime.title'),
    description: t('analyticsDashboard.tiles.productionTime.description'),
    icon: ScheduleIcon,
    path: '/analytics/production-time',
    gradient: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
    iconBg: 'rgba(255, 255, 255, 0.2)'
  },
  {
    id: 'mo-consumption',
    title: t('analyticsDashboard.tiles.moConsumption.title'),
    description: t('analyticsDashboard.tiles.moConsumption.description'),
    icon: ConsumptionIcon,
    path: '/analytics/mo-consumption',
    gradient: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
    iconBg: 'rgba(255, 255, 255, 0.2)'
  },
  {
    id: 'production-progress',
    title: t('analyticsDashboard.tiles.productionProgress.title'),
    description: t('analyticsDashboard.tiles.productionProgress.description'),
    icon: ProgressIcon,
    path: '/analytics/production-progress',
    gradient: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
    iconBg: 'rgba(255, 255, 255, 0.2)'
  },
  {
    id: 'inventory-expiry',
    title: t('analyticsDashboard.tiles.inventoryExpiry.title'),
    description: t('analyticsDashboard.tiles.inventoryExpiry.description'),
    icon: InventoryIcon,
    path: '/inventory/expiry-dates',
    gradient: 'linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)',
    iconBg: 'rgba(255, 255, 255, 0.2)'
  },
  {
    id: 'production-timeline',
    title: t('analyticsDashboard.tiles.productionTimeline.title'),
    description: t('analyticsDashboard.tiles.productionTimeline.description'),
    icon: TimelineIcon,
    path: '/production/timeline',
    gradient: 'linear-gradient(135deg, #ff6b6b 0%, #feca57 100%)',
    iconBg: 'rgba(255, 255, 255, 0.2)'
  },
  {
    id: 'forecast',
    title: t('analyticsDashboard.tiles.forecast.title'),
    description: t('analyticsDashboard.tiles.forecast.description'),
    icon: TrendingUpIcon,
    path: '/production/forecast',
    gradient: 'linear-gradient(135deg, #5f72bd 0%, #9b23ea 100%)',
    iconBg: 'rgba(255, 255, 255, 0.2)'
  },
  {
    id: 'mixing-analytics',
    title: t('analyticsDashboard.tiles.mixingAnalytics.title'),
    description: t('analyticsDashboard.tiles.mixingAnalytics.description'),
    icon: BlenderIcon,
    path: '/analytics/mixing',
    gradient: 'linear-gradient(135deg, #00c6ff 0%, #0072ff 100%)',
    iconBg: 'rgba(255, 255, 255, 0.2)'
  }
];

// Komponent kafelka raportu
const ReportTile = ({ tile, onClick }) => {
  const theme = useTheme();
  const Icon = tile.icon;
  
  return (
    <Card
      sx={{
        height: '100%',
        background: tile.gradient,
        borderRadius: 3,
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        cursor: 'pointer',
        overflow: 'hidden',
        position: 'relative',
        '&:hover': {
          transform: 'translateY(-8px)',
          boxShadow: `0 20px 40px ${alpha('#000', 0.2)}`,
          '& .tile-icon': {
            transform: 'scale(1.1) rotate(5deg)',
          },
          '& .tile-arrow': {
            transform: 'translateX(4px)',
            opacity: 1,
          }
        },
        '&::before': {
          content: '""',
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.1) 100%)',
          pointerEvents: 'none'
        }
      }}
    >
      <CardActionArea
        onClick={onClick}
        sx={{
          height: '100%',
          p: 0
        }}
      >
        <CardContent
          sx={{
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            p: 3,
            position: 'relative',
            zIndex: 1
          }}
        >
          {/* Ikona w tle */}
          <Box
            sx={{
              position: 'absolute',
              top: -20,
              right: -20,
              opacity: 0.15,
              pointerEvents: 'none'
            }}
          >
            <Icon sx={{ fontSize: 140, color: 'white' }} />
          </Box>
          
          {/* Główna ikona */}
          <Box
            className="tile-icon"
            sx={{
              width: 56,
              height: 56,
              borderRadius: 2,
              backgroundColor: tile.iconBg,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              mb: 2,
              transition: 'transform 0.3s ease',
              backdropFilter: 'blur(10px)'
            }}
          >
            <Icon sx={{ fontSize: 28, color: 'white' }} />
          </Box>
          
          {/* Tytuł */}
          <Typography
            variant="h6"
            sx={{
              color: 'white',
              fontWeight: 700,
              mb: 1,
              lineHeight: 1.3,
              textShadow: '0 2px 4px rgba(0,0,0,0.1)'
            }}
          >
            {tile.title}
          </Typography>
          
          {/* Opis */}
          <Typography
            variant="body2"
            sx={{
              color: 'rgba(255, 255, 255, 0.9)',
              lineHeight: 1.5,
              flexGrow: 1,
              textShadow: '0 1px 2px rgba(0,0,0,0.1)'
            }}
          >
            {tile.description}
          </Typography>
          
          {/* Strzałka "przejdź" */}
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              mt: 2,
              pt: 2,
              borderTop: '1px solid rgba(255,255,255,0.2)'
            }}
          >
            <Typography
              variant="button"
              sx={{
                color: 'white',
                fontWeight: 600,
                fontSize: '0.8rem',
                letterSpacing: 0.5
              }}
            >
              Przejdź do raportu
            </Typography>
            <Box
              className="tile-arrow"
              sx={{
                ml: 1,
                opacity: 0.7,
                transition: 'all 0.3s ease',
                display: 'flex',
                alignItems: 'center'
              }}
            >
              →
            </Box>
          </Box>
        </CardContent>
      </CardActionArea>
    </Card>
  );
};

const AnalyticsDashboardPage = () => {
  const navigate = useNavigate();
  const theme = useTheme();
  const { t } = useTranslation('analytics');
  const isDarkMode = theme.palette.mode === 'dark';
  
  const reportTiles = getReportTiles(t);
  
  const handleTileClick = (path) => {
    navigate(path);
  };
  
  return (
    <Box sx={{ minHeight: '100vh', pb: 4 }}>
      {/* Nagłówek */}
      <Paper
        elevation={0}
        sx={{
          p: 4,
          mb: 4,
          background: isDarkMode
            ? 'linear-gradient(135deg, #1e293b 0%, #334155 100%)'
            : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          color: 'white',
          borderRadius: 3,
          position: 'relative',
          overflow: 'hidden',
          boxShadow: isDarkMode
            ? '0 4px 20px rgba(0, 0, 0, 0.3)'
            : '0 4px 20px rgba(102, 126, 234, 0.3)'
        }}
      >
        {/* Dekoracyjne elementy tła */}
        <Box
          sx={{
            position: 'absolute',
            top: -50,
            right: -50,
            width: 200,
            height: 200,
            borderRadius: '50%',
            background: 'rgba(255, 255, 255, 0.1)',
            pointerEvents: 'none'
          }}
        />
        <Box
          sx={{
            position: 'absolute',
            bottom: -30,
            left: '30%',
            width: 100,
            height: 100,
            borderRadius: '50%',
            background: 'rgba(255, 255, 255, 0.05)',
            pointerEvents: 'none'
          }}
        />
        
        <Box sx={{ position: 'relative', zIndex: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
            <Box
              sx={{
                width: 48,
                height: 48,
                borderRadius: 2,
                backgroundColor: 'rgba(255, 255, 255, 0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                mr: 2,
                backdropFilter: 'blur(10px)'
              }}
            >
              <PieChartIcon sx={{ fontSize: 24, color: 'white' }} />
            </Box>
            <Box>
              <Typography variant="h4" sx={{ fontWeight: 700, mb: 0.5 }}>
                {t('analyticsDashboard.title')}
              </Typography>
              <Typography variant="body1" sx={{ opacity: 0.9 }}>
                {t('analyticsDashboard.subtitle')}
              </Typography>
            </Box>
          </Box>
        </Box>
      </Paper>
      
      {/* Siatka kafelków */}
      <Grid container spacing={3}>
        {reportTiles.map((tile) => (
          <Grid item xs={12} sm={6} lg={4} key={tile.id}>
            <ReportTile
              tile={tile}
              onClick={() => handleTileClick(tile.path)}
            />
          </Grid>
        ))}
      </Grid>
      
      {/* Sekcja szybkich statystyk - opcjonalna */}
      <Paper
        sx={{
          mt: 4,
          p: 3,
          borderRadius: 3,
          backgroundColor: isDarkMode
            ? alpha(theme.palette.background.paper, 0.6)
            : theme.palette.background.paper,
          border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}`
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
          <BarChartIcon sx={{ color: 'primary.main', mr: 1.5 }} />
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            {t('analyticsDashboard.quickAccess.title')}
          </Typography>
        </Box>
        <Typography variant="body2" color="text.secondary">
          {t('analyticsDashboard.quickAccess.description')}
        </Typography>
      </Paper>
    </Box>
  );
};

export default AnalyticsDashboardPage;
