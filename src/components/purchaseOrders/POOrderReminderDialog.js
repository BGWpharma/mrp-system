import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  Chip,
  Alert,
  CircularProgress,
  Paper,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Divider,
  IconButton,
  Tooltip,
  Badge,
  Collapse,
  alpha
} from '@mui/material';
import {
  Warning as WarningIcon,
  Error as ErrorIcon,
  Info as InfoIcon,
  OpenInNew as OpenInNewIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  Refresh as RefreshIcon,
  ShoppingCart as ShoppingCartIcon
} from '@mui/icons-material';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';
import { getUnorderedMaterialAlerts } from '../../services/poOrderReminderService';

const POOrderReminderDialog = ({ open, onClose }) => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [alerts, setAlerts] = useState([]);
  const [stats, setStats] = useState(null);
  const [expandedPOs, setExpandedPOs] = useState({});
  const [error, setError] = useState(null);

  const fetchAlerts = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getUnorderedMaterialAlerts();
      setAlerts(result.alerts);
      setStats(result.stats);
      
      // Domyślnie rozwiń wszystkie PO z alertami krytycznymi
      const expanded = {};
      result.alerts.forEach(alert => {
        if (alert.warningLevel.level === 'critical') {
          expanded[alert.poId] = true;
        }
      });
      setExpandedPOs(expanded);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      fetchAlerts();
    }
  }, [open]);

  const togglePO = (poId) => {
    setExpandedPOs(prev => ({
      ...prev,
      [poId]: !prev[poId]
    }));
  };

  const handleGoToPO = (poId) => {
    onClose();
    navigate(`/purchase-orders/${poId}`);
  };

  const handleGoToTask = (taskId) => {
    onClose();
    navigate(`/production/tasks/${taskId}`);
  };

  // Grupuj alerty po PO
  const alertsByPO = alerts.reduce((acc, alert) => {
    if (!acc[alert.poId]) {
      acc[alert.poId] = {
        poId: alert.poId,
        poNumber: alert.poNumber,
        supplierName: alert.supplierName,
        alerts: [],
        worstLevel: null,
      };
    }
    acc[alert.poId].alerts.push(alert);
    
    // Określ najgorszy poziom dla PO
    const levelPriority = { critical: 3, urgent: 2, normal: 1 };
    if (!acc[alert.poId].worstLevel || 
        levelPriority[alert.warningLevel.level] > levelPriority[acc[alert.poId].worstLevel.level]) {
      acc[alert.poId].worstLevel = alert.warningLevel;
    }
    
    return acc;
  }, {});

  const getIcon = (level) => {
    switch (level) {
      case 'critical': return <ErrorIcon color="error" />;
      case 'urgent': return <WarningIcon color="warning" />;
      default: return <InfoIcon color="info" />;
    }
  };

  return (
    <Dialog 
      open={open} 
      onClose={onClose} 
      maxWidth="md" 
      fullWidth
      PaperProps={{
        sx: { minHeight: '60vh' }
      }}
    >
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <ShoppingCartIcon color="warning" />
            <Typography variant="h6">
              Niezamówione materiały dla produkcji
            </Typography>
          </Box>
          <Tooltip title="Odśwież">
            <IconButton onClick={fetchAlerts} disabled={loading} size="small">
              <RefreshIcon />
            </IconButton>
          </Tooltip>
        </Box>
      </DialogTitle>
      
      <DialogContent dividers>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 200 }}>
            <CircularProgress />
          </Box>
        ) : error ? (
          <Alert severity="error">{error}</Alert>
        ) : alerts.length === 0 ? (
          <Alert severity="success" icon={<InfoIcon />}>
            Wszystkie materiały zarezerwowane z PO zostały już zamówione. 
            Brak ostrzeżeń do wyświetlenia.
          </Alert>
        ) : (
          <>
            {/* Podsumowanie */}
            <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
              {stats?.criticalCount > 0 && (
                <Chip 
                  icon={<ErrorIcon />} 
                  label={`🔴 Krytyczne: ${stats.criticalCount}`} 
                  color="error" 
                  variant="filled"
                />
              )}
              {stats?.urgentCount > 0 && (
                <Chip 
                  icon={<WarningIcon />} 
                  label={`🟠 Pilne: ${stats.urgentCount}`} 
                  color="warning" 
                  variant="filled"
                />
              )}
              {stats?.normalCount > 0 && (
                <Chip 
                  icon={<InfoIcon />} 
                  label={`🟡 Uwaga: ${stats.normalCount}`} 
                  color="info" 
                  variant="filled"
                />
              )}
              <Chip 
                label={`PO w projekcie: ${stats?.draftPOs || 0}`} 
                variant="outlined"
              />
            </Box>

            {/* Lista PO z alertami */}
            <List disablePadding>
              {Object.values(alertsByPO).map((poGroup) => (
                <Paper 
                  key={poGroup.poId} 
                  variant="outlined" 
                  sx={{ 
                    mb: 2,
                    borderColor: poGroup.worstLevel?.level === 'critical' ? 'error.main' : 
                                 poGroup.worstLevel?.level === 'urgent' ? 'warning.main' : 'info.main',
                    borderWidth: 2
                  }}
                >
                  {/* Nagłówek PO */}
                  <ListItem 
                    button 
                    onClick={() => togglePO(poGroup.poId)}
                    sx={{ 
                      bgcolor: alpha(
                        poGroup.worstLevel?.level === 'critical' ? '#f44336' : 
                        poGroup.worstLevel?.level === 'urgent' ? '#ff9800' : '#2196f3',
                        0.1
                      )
                    }}
                  >
                    <ListItemIcon>
                      {getIcon(poGroup.worstLevel?.level)}
                    </ListItemIcon>
                    <ListItemText
                      primary={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Typography variant="subtitle1" fontWeight="bold">
                            {poGroup.poNumber}
                          </Typography>
                          <Chip 
                            label="PROJEKT" 
                            size="small" 
                            color="default"
                            variant="outlined"
                          />
                          <Badge 
                            badgeContent={poGroup.alerts.length} 
                            color={poGroup.worstLevel?.color || 'default'}
                          >
                            <Typography variant="body2" color="text.secondary">
                              pozycji
                            </Typography>
                          </Badge>
                        </Box>
                      }
                      secondary={`Dostawca: ${poGroup.supplierName}`}
                    />
                    <Tooltip title="Otwórz PO">
                      <IconButton 
                        size="small" 
                        onClick={(e) => { e.stopPropagation(); handleGoToPO(poGroup.poId); }}
                      >
                        <OpenInNewIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    {expandedPOs[poGroup.poId] ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                  </ListItem>

                  {/* Lista materiałów */}
                  <Collapse in={expandedPOs[poGroup.poId]}>
                    <Divider />
                    <List dense disablePadding>
                      {poGroup.alerts.map((alert, idx) => (
                        <ListItem 
                          key={alert.id}
                          sx={{ 
                            pl: 4,
                            borderBottom: idx < poGroup.alerts.length - 1 ? '1px solid' : 'none',
                            borderColor: 'divider'
                          }}
                        >
                          <ListItemText
                            primary={
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                                <Typography variant="body2" fontWeight="medium">
                                  {alert.materialName}
                                </Typography>
                                <Chip 
                                  label={`${alert.reservedQuantity} ${alert.unit}`}
                                  size="small"
                                  variant="outlined"
                                />
                                <Chip 
                                  label={alert.warningLevel.label}
                                  size="small"
                                  color={alert.warningLevel.color}
                                />
                              </Box>
                            }
                            secondary={
                              <Box sx={{ mt: 0.5 }}>
                                <Typography variant="caption" display="block">
                                  <strong>Zadanie:</strong> {alert.taskNumber} - {alert.taskName}
                                </Typography>
                                <Typography 
                                  variant="caption" 
                                  display="block"
                                  color={alert.isOverdue ? 'error.main' : 'text.secondary'}
                                  fontWeight={alert.isOverdue ? 'bold' : 'normal'}
                                >
                                  <strong>Produkcja:</strong> {format(alert.scheduledDate, 'dd.MM.yyyy', { locale: pl })}
                                  {alert.isOverdue ? (
                                    ` (SPÓŹNIONE o ${Math.abs(alert.daysToProduction)} dni!)`
                                  ) : (
                                    ` (za ${alert.daysToProduction} dni)`
                                  )}
                                </Typography>
                              </Box>
                            }
                          />
                          <Tooltip title="Otwórz zadanie">
                            <IconButton 
                              size="small"
                              onClick={() => handleGoToTask(alert.taskId)}
                            >
                              <OpenInNewIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </ListItem>
                      ))}
                    </List>
                  </Collapse>
                </Paper>
              ))}
            </List>
          </>
        )}
      </DialogContent>
      
      <DialogActions>
        <Button onClick={onClose} variant="contained">
          Zamknij
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default POOrderReminderDialog;
