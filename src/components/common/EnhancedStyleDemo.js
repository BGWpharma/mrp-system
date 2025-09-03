import React, { useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  Button,
  List,
  ListItem,
  ListItemText,
  Pagination,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Grid,
  Container
} from '@mui/material';
import { PlayArrow, CheckCircle, Error, Warning, Info } from '@mui/icons-material';

const EnhancedStyleDemo = () => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [page, setPage] = useState(1);

  // Sample data for demonstration
  const sampleTasks = [
    { id: 1, name: 'Produkcja Batch A-001', status: 'active', priority: 'high', progress: 75 },
    { id: 2, name: 'Kontrola jakości B-002', status: 'pending', priority: 'medium', progress: 30 },
    { id: 3, name: 'Pakowanie C-003', status: 'completed', priority: 'low', progress: 100 },
    { id: 4, name: 'Wysyłka D-004', status: 'error', priority: 'high', progress: 15 },
  ];

  const getStatusChip = (status) => {
    const statusConfig = {
      active: { label: 'Aktywne', color: 'success', icon: <PlayArrow fontSize="small" /> },
      pending: { label: 'Oczekujące', color: 'warning', icon: <Warning fontSize="small" /> },
      completed: { label: 'Zakończone', color: 'primary', icon: <CheckCircle fontSize="small" /> },
      error: { label: 'Błąd', color: 'error', icon: <Error fontSize="small" /> }
    };

    const config = statusConfig[status] || statusConfig.pending;
    
    return (
      <Chip
        label={config.label}
        color={config.color}
        icon={config.icon}
        className={`status-${status}`}
        size="small"
        variant="filled"
      />
    );
  };

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'high': return '#ef4444';
      case 'medium': return '#f59e0b';
      case 'low': return '#10b981';
      default: return '#6b7280';
    }
  };

  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      <Typography variant="h3" gutterBottom sx={{ textAlign: 'center', mb: 4 }}>
        Demo Ulepszonego Stylowania MRP
      </Typography>
      
      <Grid container spacing={4}>
        {/* Enhanced Cards Section */}
        <Grid item xs={12} md={6}>
          <Card className="stagger-animation">
            <CardContent>
              <Typography variant="h5" gutterBottom>
                Ulepszone Karty
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Karty z efektami glassmorphism, hover animations i backdrop blur
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                <Button variant="contained" color="primary">
                  Przycisk Primary
                </Button>
                <Button variant="contained" color="secondary">
                  Przycisk Secondary
                </Button>
                <Button variant="outlined">
                  Outlined
                </Button>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Enhanced Chips Section */}
        <Grid item xs={12} md={6}>
          <Card className="stagger-animation">
            <CardContent>
              <Typography variant="h5" gutterBottom>
                Ulepszone Chipsy
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Chipsy z gradientami, animacjami i hover effects
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                {sampleTasks.map((task) => (
                  <Box key={task.id}>
                    {getStatusChip(task.status)}
                  </Box>
                ))}
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Enhanced Table Section */}
        <Grid item xs={12}>
          <Card className="stagger-animation">
            <CardContent>
              <Typography variant="h5" gutterBottom>
                Ulepszona Tabela
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Tabela z glassmorphism, hover effects i nowoczesnym stylem
              </Typography>
              
              <TableContainer component={Paper} sx={{ mt: 2 }}>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>Zadanie</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell>Priorytet</TableCell>
                      <TableCell align="right">Postęp</TableCell>
                      <TableCell align="center">Akcje</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {sampleTasks.map((task) => (
                      <TableRow key={task.id} hover>
                        <TableCell>
                          <Typography variant="subtitle2">
                            {task.name}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          {getStatusChip(task.status)}
                        </TableCell>
                        <TableCell>
                          <Box
                            sx={{
                              width: 12,
                              height: 12,
                              borderRadius: '50%',
                              backgroundColor: getPriorityColor(task.priority),
                              display: 'inline-block'
                            }}
                          />
                          <Typography variant="body2" sx={{ ml: 1, display: 'inline' }}>
                            {task.priority}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Typography variant="body2">
                            {task.progress}%
                          </Typography>
                        </TableCell>
                        <TableCell align="center">
                          <Button size="small" color="primary">
                            Szczegóły
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </CardContent>
          </Card>
        </Grid>

        {/* Enhanced List Section */}
        <Grid item xs={12} md={6}>
          <Card className="stagger-animation">
            <CardContent>
              <Typography variant="h5" gutterBottom>
                Ulepszona Lista
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Lista z hover effects i nowoczesnym stylem
              </Typography>
              
              <List>
                {sampleTasks.map((task, index) => (
                  <ListItem key={task.id} divider={index < sampleTasks.length - 1}>
                    <ListItemText
                      primary={task.name}
                      secondary={`Status: ${task.status} | Priorytet: ${task.priority}`}
                    />
                    {getStatusChip(task.status)}
                  </ListItem>
                ))}
              </List>
            </CardContent>
          </Card>
        </Grid>

        {/* Enhanced Form Section */}
        <Grid item xs={12} md={6}>
          <Card className="stagger-animation">
            <CardContent>
              <Typography variant="h5" gutterBottom>
                Ulepszone Formularze
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Pola formularza z glassmorphism i animacjami
              </Typography>
              
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <TextField
                  label="Nazwa zadania"
                  variant="outlined"
                  placeholder="Wprowadź nazwę zadania"
                />
                <TextField
                  label="Opis"
                  variant="outlined"
                  multiline
                  rows={3}
                  placeholder="Wprowadź opis zadania"
                />
                <Button 
                  variant="contained" 
                  onClick={() => setDialogOpen(true)}
                  sx={{ alignSelf: 'flex-start' }}
                >
                  Otwórz Dialog
                </Button>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Enhanced Pagination Section */}
        <Grid item xs={12}>
          <Card className="stagger-animation">
            <CardContent>
              <Typography variant="h5" gutterBottom>
                Ulepszona Paginacja
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Paginacja z nowoczesnym stylem i hover effects
              </Typography>
              
              <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
                <Pagination
                  count={10}
                  page={page}
                  onChange={(event, value) => setPage(value)}
                  color="primary"
                  size="large"
                />
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Enhanced Dialog */}
      <Dialog 
        open={dialogOpen} 
        onClose={() => setDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Info color="primary" />
            Ulepszone Dialogi
          </Box>
        </DialogTitle>
        <DialogContent>
          <Typography variant="body1" sx={{ mb: 2 }}>
            To jest przykład ulepszonego dialogu z efektami glassmorphism i backdrop blur.
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Wszystkie komponenty MUI zostały ulepszone stylami inspirowanymi customer-portal
            z wykorzystaniem nowoczesnych technik CSS jak glassmorphism, backdrop-filter
            i płynne animacje.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>
            Anuluj
          </Button>
          <Button 
            onClick={() => setDialogOpen(false)} 
            variant="contained"
          >
            Zamknij
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default EnhancedStyleDemo;
