import React from 'react';
import { 
  Card, 
  CardContent, 
  Typography, 
  Box, 
  Divider, 
  Stack, 
  Chip, 
  Grid,
  CircularProgress,
  List,
  ListItem,
  ListItemText,
  Paper,
  Tooltip
} from '@mui/material';
import { 
  TrendingUp as TrendingUpIcon, 
  TrendingDown as TrendingDownIcon,
  ShowChart as ShowChartIcon,
  AttachMoney as MoneyIcon,
  ShoppingCart as OrdersIcon,
  Inventory as InventoryIcon,
  Warning as WarningIcon,
  Schedule as ScheduleIcon,
  Build as BuildIcon,
  CheckCircle as CheckCircleIcon,
  Cancel as CancelIcon,
  TrendingFlat as TrendingFlatIcon
} from '@mui/icons-material';
import { formatCurrency, formatPercent, formatNumber } from '../../../utils/formatUtils';
import { formatTimestamp } from '../../../utils/dateUtils';

/**
 * Komponent karty KPI
 * 
 * @param {Object} props Właściwości komponentu
 * @param {string} props.title Tytuł karty
 * @param {Object} props.data Dane KPI
 * @param {string} props.type Typ karty (sales, inventory, production, quality)
 * @param {Object} props.sx Dodatkowe style
 */
const KpiCard = ({ title, data, type, sx }) => {
  // Jeśli brak danych, wyświetl spinner
  if (!data) {
    return (
      <Card sx={{ ...sx, height: '100%', display: 'flex', flexDirection: 'column' }}>
        <CardContent sx={{ p: { xs: 1, sm: 2 }, flexGrow: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <CircularProgress size={24} sx={{ mr: 1 }} />
          <Typography variant="body2" color="textSecondary">
            Ładowanie danych...
          </Typography>
        </CardContent>
      </Card>
    );
  }

  // Wybór ikony wskaźnika na podstawie typu
  const getIcon = () => {
    switch (type) {
      case 'sales':
        return <MoneyIcon color="primary" fontSize="small" />;
      case 'inventory':
        return <InventoryIcon color="primary" fontSize="small" />;
      case 'production':
        return <BuildIcon color="primary" fontSize="small" />;
      case 'quality':
        return <CheckCircleIcon color="primary" fontSize="small" />;
      default:
        return <ShowChartIcon color="primary" fontSize="small" />;
    }
  };

  // Wybór koloru wskaźnika wzrostu
  const getGrowthColor = (value) => {
    if (value > 0) return 'success';
    if (value < 0) return 'error';
    return 'default';
  };

  // Renderowanie zawartości na podstawie typu karty
  const renderContent = () => {
    switch (type) {
      case 'sales':
        return renderSalesContent();
      case 'inventory':
        return renderInventoryContent();
      case 'production':
        return renderProductionContent();
      case 'quality':
        return renderQualityContent();
      default:
        return <Typography>Nieznany typ karty</Typography>;
    }
  };

  // Renderowanie zawartości karty sprzedaży
  const renderSalesContent = () => {
    return (
      <>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
          {getIcon()}
          <Tooltip title={title || 'Sprzedaż'}>
            <Typography 
              variant="subtitle1" 
              component="div" 
              sx={{ 
                ml: 1, 
                fontSize: { xs: '0.9rem', sm: '1rem' },
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                maxWidth: { xs: '80px', sm: '120px', md: '100%' }
              }}
            >
              {title || 'Sprzedaż'}
            </Typography>
          </Tooltip>
        </Box>
        
        <Grid container spacing={1}>
          <Grid item xs={6}>
            <Tooltip title="Łączna wartość">
              <Paper 
                elevation={0} 
                sx={{ 
                  p: { xs: 0.75, sm: 1 }, 
                  bgcolor: 'background.paper', 
                  borderRadius: 1,
                  border: '1px solid rgba(0, 0, 0, 0.12)',
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center'
                }}
              >
                <Typography 
                  variant="caption" 
                  color="textSecondary" 
                  sx={{ 
                    fontSize: { xs: '0.65rem', sm: '0.7rem' },
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                  }}
                >
                  Łączna wartość
                </Typography>
                <Typography 
                  variant="body1" 
                  sx={{ 
                    fontWeight: 'medium', 
                    fontSize: { xs: '0.8rem', sm: '0.9rem' }
                  }}
                >
                  {formatCurrency(data.totalValue || 0)}
                </Typography>
              </Paper>
            </Tooltip>
          </Grid>
          
          <Grid item xs={6}>
            <Tooltip title="Liczba zamówień">
              <Paper 
                elevation={0} 
                sx={{ 
                  p: { xs: 0.75, sm: 1 }, 
                  bgcolor: 'background.paper', 
                  borderRadius: 1,
                  border: '1px solid rgba(0, 0, 0, 0.12)',
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center'
                }}
              >
                <Typography 
                  variant="caption" 
                  color="textSecondary" 
                  sx={{ 
                    fontSize: { xs: '0.65rem', sm: '0.7rem' },
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                  }}
                >
                  Liczba zamówień
                </Typography>
                <Typography 
                  variant="body1" 
                  sx={{ 
                    fontWeight: 'medium', 
                    fontSize: { xs: '0.8rem', sm: '0.9rem' }
                  }}
                >
                  {formatNumber(data.totalOrders || 0)}
                </Typography>
              </Paper>
            </Tooltip>
          </Grid>
        </Grid>

        <Box sx={{ mt: 1, display: 'flex', alignItems: 'center' }}>
          <Typography 
            variant="caption" 
            sx={{ 
              fontSize: { xs: '0.65rem', sm: '0.7rem' },
              whiteSpace: 'nowrap'
            }}
          >
            {data.growthLabel || 'Wzrost:'}
          </Typography>
          <Typography 
            variant="caption" 
            sx={{ 
              ml: 0.5, 
              color: `${getGrowthColor(data.growthRate)}.main`,
              fontWeight: 'bold',
              fontSize: { xs: '0.65rem', sm: '0.7rem' }
            }}
          >
            {formatPercent(data.growthRate || 0)}
          </Typography>
        </Box>
      </>
    );
  };

  // Renderowanie zawartości karty magazynu
  const renderInventoryContent = () => {
    return (
      <>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
          {getIcon()}
          <Tooltip title={title || 'Magazyn'}>
            <Typography 
              variant="subtitle1" 
              component="div" 
              sx={{ 
                ml: 1, 
                fontSize: { xs: '0.9rem', sm: '1rem' },
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                maxWidth: { xs: '80px', sm: '120px', md: '100%' }
              }}
            >
              {title || 'Magazyn'}
            </Typography>
          </Tooltip>
        </Box>
        
        <Grid container spacing={1}>
          <Grid item xs={6}>
            <Tooltip title="Wartość magazynu">
              <Paper 
                elevation={0} 
                sx={{ 
                  p: { xs: 0.75, sm: 1 }, 
                  bgcolor: 'background.paper', 
                  borderRadius: 1,
                  border: '1px solid rgba(0, 0, 0, 0.12)',
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center'
                }}
              >
                <Typography 
                  variant="caption" 
                  color="textSecondary" 
                  sx={{ 
                    fontSize: { xs: '0.65rem', sm: '0.7rem' },
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                  }}
                >
                  Wartość magazynu
                </Typography>
                <Typography 
                  variant="body1" 
                  sx={{ 
                    fontWeight: 'medium', 
                    fontSize: { xs: '0.8rem', sm: '0.9rem' }
                  }}
                >
                  {formatCurrency(data.totalValue || 0)}
                </Typography>
              </Paper>
            </Tooltip>
          </Grid>
          
          <Grid item xs={6}>
            <Tooltip title="Liczba pozycji">
              <Paper 
                elevation={0} 
                sx={{ 
                  p: { xs: 0.75, sm: 1 }, 
                  bgcolor: 'background.paper', 
                  borderRadius: 1,
                  border: '1px solid rgba(0, 0, 0, 0.12)',
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center'
                }}
              >
                <Typography 
                  variant="caption" 
                  color="textSecondary" 
                  sx={{ 
                    fontSize: { xs: '0.65rem', sm: '0.7rem' },
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                  }}
                >
                  Liczba pozycji
                </Typography>
                <Typography 
                  variant="body1" 
                  sx={{ 
                    fontWeight: 'medium', 
                    fontSize: { xs: '0.8rem', sm: '0.9rem' }
                  }}
                >
                  {formatNumber(data.totalItems || 0)}
                </Typography>
              </Paper>
            </Tooltip>
          </Grid>
        </Grid>

        <Box sx={{ mt: 1, display: 'flex', alignItems: 'center' }}>
          <Typography 
            variant="caption" 
            sx={{ 
              fontSize: { xs: '0.65rem', sm: '0.7rem' },
              whiteSpace: 'nowrap'
            }}
          >
            {data.status || 'Status:'}
          </Typography>
          <Chip
            label={data.statusLabel || 'Normalny'}
            color={data.statusValue < 0 ? 'error' : data.statusValue > 0 ? 'success' : 'default'}
            size="small"
            sx={{ 
              ml: 0.5, 
              height: 16, 
              '& .MuiChip-label': { 
                px: 0.5, 
                fontSize: '0.6rem',
                py: 0
              } 
            }}
          />
        </Box>
      </>
    );
  };

  // Renderowanie zawartości karty produkcji
  const renderProductionContent = () => {
    return (
      <>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
          {getIcon()}
          <Tooltip title={title || 'Produkcja'}>
            <Typography 
              variant="subtitle1" 
              component="div" 
              sx={{ 
                ml: 1, 
                fontSize: { xs: '0.9rem', sm: '1rem' },
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                maxWidth: { xs: '80px', sm: '120px', md: '100%' }
              }}
            >
              {title || 'Produkcja'}
            </Typography>
          </Tooltip>
        </Box>
        
        <Grid container spacing={1}>
          <Grid item xs={6}>
            <Tooltip title="Efektywność">
              <Paper 
                elevation={0} 
                sx={{ 
                  p: { xs: 0.75, sm: 1 }, 
                  bgcolor: 'background.paper', 
                  borderRadius: 1,
                  border: '1px solid rgba(0, 0, 0, 0.12)',
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center'
                }}
              >
                <Typography 
                  variant="caption" 
                  color="textSecondary" 
                  sx={{ 
                    fontSize: { xs: '0.65rem', sm: '0.7rem' },
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                  }}
                >
                  Efektywność
                </Typography>
                <Typography 
                  variant="body1" 
                  sx={{ 
                    fontWeight: 'medium', 
                    fontSize: { xs: '0.8rem', sm: '0.9rem' }
                  }}
                >
                  {`${(data.efficiency || 0).toFixed(1)}%`}
                </Typography>
              </Paper>
            </Tooltip>
          </Grid>
          
          <Grid item xs={6}>
            <Tooltip title="Zadania">
              <Paper 
                elevation={0} 
                sx={{ 
                  p: { xs: 0.75, sm: 1 }, 
                  bgcolor: 'background.paper', 
                  borderRadius: 1,
                  border: '1px solid rgba(0, 0, 0, 0.12)',
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center'
                }}
              >
                <Typography 
                  variant="caption" 
                  color="textSecondary" 
                  sx={{ 
                    fontSize: { xs: '0.65rem', sm: '0.7rem' },
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                  }}
                >
                  Zadania
                </Typography>
                <Typography 
                  variant="body1" 
                  sx={{ 
                    fontWeight: 'medium', 
                    fontSize: { xs: '0.8rem', sm: '0.9rem' }
                  }}
                >
                  {`${data.completedTasks || 0}/${data.totalTasks || 0}`}
                </Typography>
              </Paper>
            </Tooltip>
          </Grid>
        </Grid>

        <Box sx={{ mt: 1, display: 'flex', alignItems: 'center' }}>
          <Typography 
            variant="caption" 
            sx={{ 
              fontSize: { xs: '0.65rem', sm: '0.7rem' },
              whiteSpace: 'nowrap'
            }}
          >
            Stan:
          </Typography>
          <Chip
            label={data.status || 'Normalny'}
            color={data.status === 'Opóźnienie' ? 'warning' : data.status === 'Krytyczny' ? 'error' : 'success'}
            size="small"
            sx={{ 
              ml: 0.5, 
              height: 16, 
              '& .MuiChip-label': { 
                px: 0.5, 
                fontSize: '0.6rem',
                py: 0
              } 
            }}
          />
        </Box>
      </>
    );
  };

  // Renderowanie zawartości karty jakości
  const renderQualityContent = () => {
    return (
      <>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
          {getIcon()}
          <Tooltip title={title || 'Jakość'}>
            <Typography 
              variant="subtitle1" 
              component="div" 
              sx={{ 
                ml: 1, 
                fontSize: { xs: '0.9rem', sm: '1rem' },
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                maxWidth: { xs: '80px', sm: '120px', md: '100%' }
              }}
            >
              {title || 'Jakość'}
            </Typography>
          </Tooltip>
        </Box>
        
        <Grid container spacing={1}>
          <Grid item xs={6}>
            <Tooltip title="Wskaźnik jakości">
              <Paper 
                elevation={0} 
                sx={{ 
                  p: { xs: 0.75, sm: 1 }, 
                  bgcolor: 'background.paper', 
                  borderRadius: 1,
                  border: '1px solid rgba(0, 0, 0, 0.12)',
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center'
                }}
              >
                <Typography 
                  variant="caption" 
                  color="textSecondary" 
                  sx={{ 
                    fontSize: { xs: '0.65rem', sm: '0.7rem' },
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                  }}
                >
                  Wskaźnik jakości
                </Typography>
                <Typography 
                  variant="body1" 
                  sx={{ 
                    fontWeight: 'medium', 
                    fontSize: { xs: '0.8rem', sm: '0.9rem' }
                  }}
                >
                  {`${(data.qualityScore || 0).toFixed(1)}%`}
                </Typography>
              </Paper>
            </Tooltip>
          </Grid>
          
          <Grid item xs={6}>
            <Tooltip title="Wskaźnik odrzuceń">
              <Paper 
                elevation={0} 
                sx={{ 
                  p: { xs: 0.75, sm: 1 }, 
                  bgcolor: 'background.paper', 
                  borderRadius: 1,
                  border: '1px solid rgba(0, 0, 0, 0.12)',
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center'
                }}
              >
                <Typography 
                  variant="caption" 
                  color="textSecondary" 
                  sx={{ 
                    fontSize: { xs: '0.65rem', sm: '0.7rem' },
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                  }}
                >
                  Wskaźnik odrzuceń
                </Typography>
                <Typography 
                  variant="body1" 
                  sx={{ 
                    fontWeight: 'medium', 
                    fontSize: { xs: '0.8rem', sm: '0.9rem' }
                  }}
                >
                  {`${(data.rejectionRate || 0).toFixed(2)}%`}
                </Typography>
            </Paper>
            </Tooltip>
          </Grid>
        </Grid>

        <Box sx={{ mt: 1, display: 'flex', alignItems: 'center' }}>
          <Typography 
            variant="caption" 
            sx={{ 
              fontSize: { xs: '0.65rem', sm: '0.7rem' },
              whiteSpace: 'nowrap'
            }}
          >
            Trend:
          </Typography> 
          <Box sx={{ display: 'flex', alignItems: 'center', ml: 0.5 }}>
            {data.trend > 0 ? (
              <TrendingUpIcon color="success" sx={{ fontSize: '0.9rem' }} />
            ) : data.trend < 0 ? (
              <TrendingDownIcon color="error" sx={{ fontSize: '0.9rem' }} />
            ) : (
              <TrendingFlatIcon color="action" sx={{ fontSize: '0.9rem' }} />
            )}
            <Typography 
              variant="caption" 
              sx={{ 
                ml: 0.5, 
                fontSize: { xs: '0.65rem', sm: '0.7rem' },
                color: data.trend > 0 ? 'success.main' : data.trend < 0 ? 'error.main' : 'text.secondary'
              }}
            >
              {`${data.trend > 0 ? '+' : ''}${data.trend?.toFixed(1) || 0}%`}
            </Typography>
          </Box>
        </Box>
      </>
    );
  };

  return (
    <Card 
      sx={{ 
        ...sx, 
        height: '100%', 
        display: 'flex', 
        flexDirection: 'column',
        borderRadius: 1,
      }}
    >
      <CardContent 
        sx={{ 
          p: { xs: 1, sm: 1.5 }, 
          pb: { xs: 1, sm: 1.5 }, 
          flexGrow: 1, 
          display: 'flex', 
          flexDirection: 'column'
        }}
      >
        {renderContent()}
      </CardContent>
    </Card>
  );
};

export default KpiCard; 