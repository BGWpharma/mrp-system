import React, { useState, useEffect } from 'react';
import {
  Paper,
  Typography,
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Button,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Chip,
  Alert,
  Fab,
  Accordion,
  AccordionSummary,
  AccordionDetails
} from '@mui/material';
import {
  Edit as EditIcon,
  Delete as DeleteIcon,
  Add as AddIcon,
  Science as ScienceIcon,
  ExpandMore as ExpandMoreIcon
} from '@mui/icons-material';
import { useNutritionalComponents } from '../../hooks/useNutritionalComponents';
import {
  addNutritionalComponent,
  updateNutritionalComponent,
  deleteNutritionalComponent
} from '../../services/nutritionalComponentsService';
import { useNotification } from '../../hooks/useNotification';
import { NUTRITIONAL_CATEGORIES } from '../../utils/constants';

const NutritionalComponentsManager = () => {
  const { components, loading, error, usingFallback, refreshComponents } = useNutritionalComponents();
  const { showSuccess, showError } = useNotification();
  
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingComponent, setEditingComponent] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    unit: '',
    category: '',
    isActive: true
  });

  const categories = Object.values(NUTRITIONAL_CATEGORIES);

  const handleOpenDialog = (component = null) => {
    if (component) {
      setEditingComponent(component);
      setFormData({
        code: component.code,
        name: component.name,
        unit: component.unit,
        category: component.category,
        isActive: component.isActive !== false
      });
    } else {
      setEditingComponent(null);
      setFormData({
        code: '',
        name: '',
        unit: '',
        category: '',
        isActive: true
      });
    }
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setEditingComponent(null);
    setFormData({
      code: '',
      name: '',
      unit: '',
      category: '',
      isActive: true
    });
  };

  const handleSave = async () => {
    try {
      if (!formData.code || !formData.name || !formData.unit || !formData.category) {
        showError('Wszystkie pola są wymagane');
        return;
      }

      if (editingComponent) {
        await updateNutritionalComponent(editingComponent.id, formData);
        showSuccess('Składnik odżywczy został zaktualizowany');
      } else {
        await addNutritionalComponent(formData);
        showSuccess('Składnik odżywczy został dodany');
      }
      
      await refreshComponents();
      handleCloseDialog();
    } catch (error) {
      console.error('Błąd przy zapisywaniu składnika:', error);
      showError('Wystąpił błąd podczas zapisywania składnika');
    }
  };

  const handleDelete = async (component) => {
    if (window.confirm(`Czy na pewno chcesz usunąć składnik ${component.code} - ${component.name}?`)) {
      try {
        await deleteNutritionalComponent(component.id);
        showSuccess('Składnik odżywczy został usunięty');
        await refreshComponents();
      } catch (error) {
        console.error('Błąd przy usuwaniu składnika:', error);
        showError('Wystąpił błąd podczas usuwania składnika');
      }
    }
  };

  const getCategoryColor = (category) => {
    switch (category) {
      case 'Witaminy': return 'success';
      case 'Minerały': return 'info';
      case 'Makroelementy': return 'primary';
      case 'Energia': return 'warning';
      case 'Składniki aktywne': return 'secondary';
      default: return 'default';
    }
  };

  if (loading) {
    return (
      <Paper sx={{ p: 3 }}>
        <Typography>Ładowanie składników odżywczych...</Typography>
      </Paper>
    );
  }

  return (
    <>
      <Accordion 
        expanded={expanded} 
        onChange={() => setExpanded(!expanded)}
        sx={{ mb: 3 }}
      >
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
          <ScienceIcon color="primary" />
          <Typography variant="h6">
            Zarządzanie składnikami odżywczymi ({components.length})
          </Typography>
        </Box>
      </AccordionSummary>
      <AccordionDetails>
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => handleOpenDialog()}
            disabled={usingFallback}
          >
            Dodaj składnik
          </Button>
        </Box>

        {usingFallback && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            Składniki są pobierane z kodu jako fallback. Wykonaj migrację, aby móc edytować składniki w bazie danych.
          </Alert>
        )}

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            Błąd: {error}
          </Alert>
        )}

        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Kod</TableCell>
                <TableCell>Nazwa</TableCell>
                <TableCell>Jednostka</TableCell>
                <TableCell>Kategoria</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Akcje</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {components.map((component, index) => (
                <TableRow key={component.id || component.code || index} hover>
                  <TableCell sx={{ fontWeight: 'bold' }}>{component.code}</TableCell>
                  <TableCell>{component.name}</TableCell>
                  <TableCell>{component.unit}</TableCell>
                  <TableCell>
                    <Chip 
                      size="small"
                      label={component.category}
                      color={getCategoryColor(component.category)}
                    />
                  </TableCell>
                  <TableCell>
                    <Chip 
                      size="small"
                      label={component.isActive !== false ? 'Aktywny' : 'Nieaktywny'}
                      color={component.isActive !== false ? 'success' : 'default'}
                    />
                  </TableCell>
                  <TableCell>
                    {!usingFallback && (
                      <Box sx={{ display: 'flex', gap: 1 }}>
                        <IconButton
                          size="small"
                          onClick={() => handleOpenDialog(component)}
                        >
                          <EditIcon />
                        </IconButton>
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => handleDelete(component)}
                        >
                          <DeleteIcon />
                        </IconButton>
                      </Box>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </AccordionDetails>
    </Accordion>

    {/* Dialog dodawania/edycji składnika */}
    <Dialog open={dialogOpen} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
      <DialogTitle>
        {editingComponent ? 'Edytuj składnik odżywczy' : 'Dodaj składnik odżywczy'}
      </DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
          <TextField
            label="Kod"
            value={formData.code}
            onChange={(e) => setFormData(prev => ({ ...prev, code: e.target.value }))}
            fullWidth
            required
          />
          <TextField
            label="Nazwa"
            value={formData.name}
            onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
            fullWidth
            required
          />
          <TextField
            label="Jednostka"
            value={formData.unit}
            onChange={(e) => setFormData(prev => ({ ...prev, unit: e.target.value }))}
            fullWidth
            required
          />
          <FormControl fullWidth required>
            <InputLabel>Kategoria</InputLabel>
            <Select
              value={formData.category}
              onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value }))}
              label="Kategoria"
            >
              {categories.map((category) => (
                <MenuItem key={category} value={category}>
                  {category}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl fullWidth>
            <InputLabel>Status</InputLabel>
            <Select
              value={formData.isActive}
              onChange={(e) => setFormData(prev => ({ ...prev, isActive: e.target.value }))}
              label="Status"
            >
              <MenuItem value={true}>Aktywny</MenuItem>
              <MenuItem value={false}>Nieaktywny</MenuItem>
            </Select>
          </FormControl>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleCloseDialog}>Anuluj</Button>
        <Button onClick={handleSave} variant="contained">
          {editingComponent ? 'Zapisz' : 'Dodaj'}
        </Button>
      </DialogActions>
    </Dialog>
    </>
  );
};

export default NutritionalComponentsManager; 