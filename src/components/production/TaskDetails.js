import React, { useEffect, useState } from 'react';
import { Grid, Paper, Typography, Box, Button, Chip } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { 
  ShoppingCart as ShoppingCartIcon,
  Person as PersonIcon,
  ShoppingBasket as ShoppingBasketIcon,
  Schedule as ScheduleIcon,
  Business as BusinessIcon
} from '@mui/icons-material';
import { formatDateTime } from '../../utils/formatters';
import { getWorkstationById } from '../../services/workstationService';
import { useNotification } from '../../hooks/useNotification';

const TaskDetails = ({ task }) => {
  const { showError } = useNotification();
  const [workstation, setWorkstation] = useState(null);
  
  // Sprawdź czy zadanie ma powiązane zamówienie klienta lub zamówienia zakupu
  const hasCustomerOrder = Boolean(task?.orderId);
  const hasPurchaseOrders = Boolean(task?.purchaseOrders && task.purchaseOrders.length > 0);
  
  // Jeśli nie ma żadnych powiązanych zamówień, nie renderuj sekcji dla zamówień
  const hasRelatedOrders = hasCustomerOrder || hasPurchaseOrders;
  
  // Ładuj dane stanowiska produkcyjnego, jeśli zadanie ma przypisane ID stanowiska
  useEffect(() => {
    const fetchWorkstation = async () => {
      if (task?.workstationId) {
        try {
          const workstationData = await getWorkstationById(task.workstationId);
          setWorkstation(workstationData);
        } catch (error) {
          console.error('Błąd podczas pobierania stanowiska produkcyjnego:', error);
          showError('Nie udało się pobrać informacji o stanowisku produkcyjnym');
        }
      }
    };
    
    fetchWorkstation();
  }, [task?.workstationId, showError]);
  
  return (
    <>
      {hasRelatedOrders && (
        <Grid item xs={12}>
          <Paper sx={{ p: 2, mb: 2 }}>
            <Typography variant="h6" sx={{ mb: 2 }}>
              Powiązane zamówienia
            </Typography>
            
            {hasCustomerOrder && (
              <Box sx={{ mb: 3 }}>
                <Typography variant="subtitle1" sx={{ mb: 1, fontWeight: 'medium' }}>
                  Zamówienie klienta
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  <Button
                    variant="outlined"
                    size="small"
                    component={RouterLink}
                    to={`/orders/${task.orderId}`}
                    startIcon={<ShoppingCartIcon />}
                    sx={{ mr: 1 }}
                  >
                    {task.orderNumber || task.orderId}
                  </Button>
                  {task.customer && (
                    <Chip 
                      icon={<PersonIcon />} 
                      label={task.customer.name || 'Klient'}
                      size="small"
                      variant="outlined"
                    />
                  )}
                </Box>
              </Box>
            )}
            
            {hasPurchaseOrders && (
              <Box>
                <Typography variant="subtitle1" sx={{ mb: 1, fontWeight: 'medium' }}>
                  Zamówienia komponentów
                </Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap' }}>
                  {task.purchaseOrders.map(po => (
                    <Button
                      key={po.id}
                      variant="outlined"
                      size="small"
                      component={RouterLink}
                      to={`/purchase-orders/${po.id}`}
                      startIcon={<ShoppingBasketIcon />}
                      sx={{ mr: 1, mb: 1 }}
                    >
                      {po.poNumber || po.id}
                    </Button>
                  ))}
                </Box>
              </Box>
            )}
          </Paper>
        </Grid>
      )}
      
      {task?.scheduledDate && (
        <Grid item xs={12}>
          <Paper sx={{ p: 2, mb: 2 }}>
            <Typography variant="h6" sx={{ mb: 2 }}>
              Informacje o czasie produkcji
            </Typography>
            
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
              <ScheduleIcon color="primary" sx={{ mr: 1 }} />
              <Typography variant="subtitle1" component="span" sx={{ fontWeight: 'medium' }}>
                Zaplanowana data i godzina rozpoczęcia:
              </Typography>
              <Typography variant="body1" component="span" sx={{ ml: 1 }}>
                {formatDateTime(task.scheduledDate)}
              </Typography>
            </Box>
            
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <ScheduleIcon color="primary" sx={{ mr: 1 }} />
              <Typography variant="subtitle1" component="span" sx={{ fontWeight: 'medium' }}>
                Planowana data i godzina zakończenia:
              </Typography>
              <Typography variant="body1" component="span" sx={{ ml: 1 }}>
                {formatDateTime(task.endDate)}
              </Typography>
            </Box>
            
            {task.productionTimePerUnit > 0 && (
              <Box sx={{ display: 'flex', alignItems: 'center', mt: 2 }}>
                <ScheduleIcon color="primary" sx={{ mr: 1 }} />
                <Typography variant="subtitle1" component="span" sx={{ fontWeight: 'medium' }}>
                  Czas produkcji na jednostkę:
                </Typography>
                <Typography variant="body1" component="span" sx={{ ml: 1 }}>
                  {task.productionTimePerUnit} min./szt.
                </Typography>
              </Box>
            )}
            
            {task.estimatedDuration > 0 && (
              <Box sx={{ display: 'flex', alignItems: 'center', mt: 2 }}>
                <ScheduleIcon color="primary" sx={{ mr: 1 }} />
                <Typography variant="subtitle1" component="span" sx={{ fontWeight: 'medium' }}>
                  Całkowity planowany czas produkcji:
                </Typography>
                <Typography variant="body1" component="span" sx={{ ml: 1 }}>
                  {task.estimatedDuration.toFixed(1)} godz.
                </Typography>
              </Box>
            )}
            
            {/* Informacja o stanowisku produkcyjnym */}
            {workstation && (
              <Box sx={{ display: 'flex', alignItems: 'center', mt: 2 }}>
                <BusinessIcon color="primary" sx={{ mr: 1 }} />
                <Typography variant="subtitle1" component="span" sx={{ fontWeight: 'medium' }}>
                  Stanowisko produkcyjne:
                </Typography>
                <Typography variant="body1" component="span" sx={{ ml: 1 }}>
                  {workstation.name}
                  {workstation.location && ` (lokalizacja: ${workstation.location})`}
                </Typography>
              </Box>
            )}
          </Paper>
        </Grid>
      )}
    </>
  );
};

export default TaskDetails; 