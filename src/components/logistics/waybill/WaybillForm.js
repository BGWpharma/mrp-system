import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Container,
  Paper,
  Typography,
  TextField,
  Button,
  Grid,
  Box,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Divider,
  IconButton,
  TableContainer,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  Autocomplete,
  CircularProgress
} from '@mui/material';
import { LocalizationProvider, DatePicker } from '@mui/x-date-pickers';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { pl } from 'date-fns/locale';
import { format } from 'date-fns';
import { useAuth } from '../../../hooks/useAuth';
import { useNotification } from '../../../hooks/useNotification';
import {
  getWaybillById,
  createWaybill,
  updateWaybill,
  WAYBILL_STATUSES,
  WAYBILL_TYPES,
  generateWaybillNumber
} from '../../../services/logisticsService';
import { getAllInventoryItems } from '../../../services/inventoryService';
import { getAllClients } from '../../../services/clientService';
import { getAllSuppliers } from '../../../services/purchaseOrderService';
import { getAllWarehouses } from '../../../services/inventoryService';

// Ikony
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';

const WaybillForm = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { showSuccess, showError } = useNotification();
  
  const isNewWaybill = id === 'new';
  const [loading, setLoading] = useState(!isNewWaybill);
  const [saving, setSaving] = useState(false);
  
  const [inventoryItems, setInventoryItems] = useState([]);
  const [clients, setClients] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  
  const [waybillData, setWaybillData] = useState({
    waybillNumber: '',
    type: WAYBILL_TYPES.DELIVERY,
    status: WAYBILL_STATUSES.DRAFT,
    plannedDate: format(new Date(), 'yyyy-MM-dd'),
    sourceLocation: '',
    destinationLocation: '',
    notes: '',
    driver: '',
    vehicle: '',
    contactPerson: '',
    contactPhone: '',
    items: []
  });
  
  useEffect(() => {
    const fetchData = async () => {
      try {
        // Pobierz przedmioty magazynowe
        const items = await getAllInventoryItems();
        setInventoryItems(items);
        
        // Pobierz klientów
        const clientsData = await getAllClients();
        setClients(clientsData);
        
        // Pobierz dostawców
        const suppliersData = await getAllSuppliers();
        setSuppliers(suppliersData);
        
        // Pobierz magazyny
        const warehousesData = await getAllWarehouses();
        setWarehouses(warehousesData);
        
        // Jeśli edytujemy istniejący list
        if (!isNewWaybill) {
          const waybill = await getWaybillById(id);
          
          // Konwersja daty z formatu serwera do lokalnego
          const formattedPlannedDate = waybill.plannedDate 
            ? format(waybill.plannedDate, 'yyyy-MM-dd')
            : format(new Date(), 'yyyy-MM-dd');
          
          setWaybillData({
            ...waybill,
            plannedDate: formattedPlannedDate
          });
        } else {
          // Wygeneruj numer listu przewozowego dla nowego listu
          setWaybillData(prev => ({
            ...prev,
            waybillNumber: generateWaybillNumber()
          }));
        }
        
        setLoading(false);
      } catch (error) {
        console.error('Błąd podczas pobierania danych:', error);
        showError('Nie udało się pobrać wymaganych danych');
        setLoading(false);
      }
    };
    
    fetchData();
  }, [id, isNewWaybill]);
  
  const handleChange = (e) => {
    const { name, value } = e.target;
    setWaybillData(prev => ({
      ...prev,
      [name]: value
    }));
  };
  
  const handleDateChange = (date) => {
    if (date) {
      setWaybillData(prev => ({
        ...prev,
        plannedDate: format(date, 'yyyy-MM-dd')
      }));
    }
  };
  
  const handleAddItem = () => {
    setWaybillData(prev => ({
      ...prev,
      items: [
        ...prev.items,
        {
          id: `temp-${Date.now()}`,
          name: '',
          itemId: '',
          quantity: 1,
          unit: 'szt.',
          notes: ''
        }
      ]
    }));
  };
  
  const handleRemoveItem = (index) => {
    const updatedItems = [...waybillData.items];
    updatedItems.splice(index, 1);
    setWaybillData(prev => ({
      ...prev,
      items: updatedItems
    }));
  };
  
  const handleItemChange = (index, field, value) => {
    const updatedItems = [...waybillData.items];
    updatedItems[index][field] = value;
    setWaybillData(prev => ({
      ...prev,
      items: updatedItems
    }));
  };
  
  const handleItemSelect = (index, selectedItem) => {
    if (!selectedItem) return;
    
    const updatedItems = [...waybillData.items];
    updatedItems[index] = {
      ...updatedItems[index],
      itemId: selectedItem.id,
      name: selectedItem.name,
      unit: selectedItem.unit || 'szt.'
    };
    
    setWaybillData(prev => ({
      ...prev,
      items: updatedItems
    }));
  };
  
  const handleSelectLocation = (type, entity) => {
    if (!entity) return;
    
    let location = '';
    if (entity.addresses && entity.addresses.length > 0) {
      const address = entity.addresses.find(addr => addr.isMain) || entity.addresses[0];
      location = `${entity.name}, ${address.street}, ${address.postalCode} ${address.city}`;
    } else if (entity.address) {
      location = `${entity.name}, ${entity.address}`;
    } else {
      location = entity.name;
    }
    
    setWaybillData(prev => ({
      ...prev,
      [type]: location
    }));
  };
  
  const handleSelectWarehouse = (type, warehouse) => {
    if (!warehouse) return;
    
    const location = `Magazyn: ${warehouse.name}`;
    
    setWaybillData(prev => ({
      ...prev,
      [type]: location
    }));
  };
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Walidacja
    if (!waybillData.waybillNumber) {
      showError('Wprowadź numer listu przewozowego');
      return;
    }
    
    if (!waybillData.sourceLocation) {
      showError('Wprowadź miejsce nadania');
      return;
    }
    
    if (!waybillData.destinationLocation) {
      showError('Wprowadź miejsce dostawy');
      return;
    }
    
    if (!waybillData.plannedDate) {
      showError('Wprowadź planowaną datę');
      return;
    }
    
    // Walidacja pozycji
    if (waybillData.items.length === 0) {
      showError('Dodaj co najmniej jedną pozycję do listu przewozowego');
      return;
    }
    
    const invalidItem = waybillData.items.find(item => !item.name || !item.quantity);
    if (invalidItem) {
      showError('Uzupełnij wszystkie dane dla każdej pozycji');
      return;
    }
    
    try {
      setSaving(true);
      
      if (isNewWaybill) {
        // Tworzenie nowego listu
        const result = await createWaybill(waybillData, currentUser.uid);
        showSuccess('List przewozowy został utworzony');
        navigate(`/logistics/waybill/${result.id}`);
      } else {
        // Aktualizacja istniejącego listu
        await updateWaybill(id, waybillData, currentUser.uid);
        showSuccess('List przewozowy został zaktualizowany');
        navigate(`/logistics/waybill/${id}`);
      }
    } catch (error) {
      console.error('Błąd podczas zapisywania listu przewozowego:', error);
      showError('Nie udało się zapisać listu przewozowego');
    } finally {
      setSaving(false);
    }
  };
  
  const handleCancel = () => {
    navigate('/logistics/waybill');
  };
  
  if (loading) {
    return (
      <Container>
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
          <CircularProgress />
        </Box>
      </Container>
    );
  }
  
  return (
    <Container>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h5">
          {isNewWaybill ? 'Nowy list przewozowy' : 'Edytuj list przewozowy'}
        </Typography>
      </Box>
      
      <Paper sx={{ p: 3 }}>
        <form onSubmit={handleSubmit}>
          <Grid container spacing={3}>
            {/* Numer listu i typ */}
            <Grid item xs={12} md={6}>
              <TextField
                name="waybillNumber"
                label="Numer listu przewozowego"
                value={waybillData.waybillNumber}
                onChange={handleChange}
                fullWidth
                required
              />
            </Grid>
            
            <Grid item xs={12} md={6}>
              <FormControl fullWidth>
                <InputLabel>Typ listu przewozowego</InputLabel>
                <Select
                  name="type"
                  value={waybillData.type}
                  onChange={handleChange}
                  label="Typ listu przewozowego"
                >
                  <MenuItem value={WAYBILL_TYPES.DELIVERY}>Dostawa do klienta</MenuItem>
                  <MenuItem value={WAYBILL_TYPES.RECEIPT}>Odbiór od dostawcy</MenuItem>
                  <MenuItem value={WAYBILL_TYPES.INTERNAL}>Transport wewnętrzny</MenuItem>
                  <MenuItem value={WAYBILL_TYPES.RETURN}>Zwrot</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            
            {/* Status i data */}
            <Grid item xs={12} md={6}>
              <FormControl fullWidth>
                <InputLabel>Status</InputLabel>
                <Select
                  name="status"
                  value={waybillData.status}
                  onChange={handleChange}
                  label="Status"
                >
                  <MenuItem value={WAYBILL_STATUSES.DRAFT}>Szkic</MenuItem>
                  <MenuItem value={WAYBILL_STATUSES.PLANNED}>Zaplanowany</MenuItem>
                  <MenuItem value={WAYBILL_STATUSES.IN_TRANSIT}>W transporcie</MenuItem>
                  <MenuItem value={WAYBILL_STATUSES.DELIVERED}>Dostarczony</MenuItem>
                  <MenuItem value={WAYBILL_STATUSES.CANCELED}>Anulowany</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            
            <Grid item xs={12} md={6}>
              <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={pl}>
                <DatePicker
                  label="Planowana data"
                  value={waybillData.plannedDate ? new Date(waybillData.plannedDate) : null}
                  onChange={handleDateChange}
                  slotProps={{ textField: { fullWidth: true, required: true } }}
                />
              </LocalizationProvider>
            </Grid>
            
            {/* Miejsca nadania i odbioru */}
            <Grid item xs={12} md={6}>
              <TextField
                name="sourceLocation"
                label="Miejsce nadania"
                value={waybillData.sourceLocation}
                onChange={handleChange}
                fullWidth
                required
                multiline
                rows={2}
              />
              <Box sx={{ mt: 1 }}>
                <Typography variant="subtitle2" gutterBottom>
                  Wybierz z:
                </Typography>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Autocomplete
                    options={warehouses}
                    getOptionLabel={(option) => option.name}
                    onChange={(e, value) => handleSelectWarehouse('sourceLocation', value)}
                    renderInput={(params) => (
                      <TextField {...params} label="Magazyn" size="small" sx={{ minWidth: 150 }} />
                    )}
                    sx={{ flex: 1 }}
                  />
                  <Autocomplete
                    options={suppliers}
                    getOptionLabel={(option) => option.name}
                    onChange={(e, value) => handleSelectLocation('sourceLocation', value)}
                    renderInput={(params) => (
                      <TextField {...params} label="Dostawca" size="small" sx={{ minWidth: 150 }} />
                    )}
                    sx={{ flex: 1 }}
                  />
                </Box>
              </Box>
            </Grid>
            
            <Grid item xs={12} md={6}>
              <TextField
                name="destinationLocation"
                label="Miejsce dostawy"
                value={waybillData.destinationLocation}
                onChange={handleChange}
                fullWidth
                required
                multiline
                rows={2}
              />
              <Box sx={{ mt: 1 }}>
                <Typography variant="subtitle2" gutterBottom>
                  Wybierz z:
                </Typography>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Autocomplete
                    options={warehouses}
                    getOptionLabel={(option) => option.name}
                    onChange={(e, value) => handleSelectWarehouse('destinationLocation', value)}
                    renderInput={(params) => (
                      <TextField {...params} label="Magazyn" size="small" sx={{ minWidth: 150 }} />
                    )}
                    sx={{ flex: 1 }}
                  />
                  <Autocomplete
                    options={clients}
                    getOptionLabel={(option) => option.name}
                    onChange={(e, value) => handleSelectLocation('destinationLocation', value)}
                    renderInput={(params) => (
                      <TextField {...params} label="Klient" size="small" sx={{ minWidth: 150 }} />
                    )}
                    sx={{ flex: 1 }}
                  />
                </Box>
              </Box>
            </Grid>
            
            {/* Kierowca i pojazd */}
            <Grid item xs={12} md={6}>
              <TextField
                name="driver"
                label="Kierowca"
                value={waybillData.driver}
                onChange={handleChange}
                fullWidth
              />
            </Grid>
            
            <Grid item xs={12} md={6}>
              <TextField
                name="vehicle"
                label="Pojazd / Nr rejestracyjny"
                value={waybillData.vehicle}
                onChange={handleChange}
                fullWidth
              />
            </Grid>
            
            {/* Osoba kontaktowa */}
            <Grid item xs={12} md={6}>
              <TextField
                name="contactPerson"
                label="Osoba kontaktowa"
                value={waybillData.contactPerson}
                onChange={handleChange}
                fullWidth
              />
            </Grid>
            
            <Grid item xs={12} md={6}>
              <TextField
                name="contactPhone"
                label="Telefon kontaktowy"
                value={waybillData.contactPhone}
                onChange={handleChange}
                fullWidth
              />
            </Grid>
            
            {/* Uwagi */}
            <Grid item xs={12}>
              <TextField
                name="notes"
                label="Uwagi"
                value={waybillData.notes}
                onChange={handleChange}
                fullWidth
                multiline
                rows={3}
              />
            </Grid>
          </Grid>
          
          <Divider sx={{ my: 3 }} />
          
          {/* Pozycje listu przewozowego */}
          <Box sx={{ mb: 2 }}>
            <Typography variant="h6">Pozycje listu przewozowego</Typography>
          </Box>
          
          <TableContainer component={Paper} variant="outlined" sx={{ mb: 3 }}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Produkt</TableCell>
                  <TableCell>Ilość</TableCell>
                  <TableCell>Jednostka</TableCell>
                  <TableCell>Uwagi</TableCell>
                  <TableCell>Akcje</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {waybillData.items.map((item, index) => (
                  <TableRow key={index}>
                    <TableCell>
                      <Autocomplete
                        options={inventoryItems}
                        getOptionLabel={(option) => option.name}
                        value={inventoryItems.find(i => i.id === item.itemId) || null}
                        onChange={(event, newValue) => handleItemSelect(index, newValue)}
                        renderInput={(params) => (
                          <TextField
                            {...params}
                            label="Produkt"
                            required
                            size="small"
                          />
                        )}
                        sx={{ width: 250 }}
                      />
                    </TableCell>
                    <TableCell>
                      <TextField
                        type="number"
                        value={item.quantity}
                        onChange={(e) => handleItemChange(index, 'quantity', e.target.value)}
                        size="small"
                        inputProps={{ min: 0, step: 0.01 }}
                        sx={{ width: 100 }}
                      />
                    </TableCell>
                    <TableCell>
                      <TextField
                        value={item.unit}
                        onChange={(e) => handleItemChange(index, 'unit', e.target.value)}
                        size="small"
                        sx={{ width: 80 }}
                      />
                    </TableCell>
                    <TableCell>
                      <TextField
                        value={item.notes || ''}
                        onChange={(e) => handleItemChange(index, 'notes', e.target.value)}
                        size="small"
                        multiline
                        sx={{ width: 200 }}
                      />
                    </TableCell>
                    <TableCell>
                      <IconButton
                        color="error"
                        onClick={() => handleRemoveItem(index)}
                        size="small"
                      >
                        <DeleteIcon />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
                
                {waybillData.items.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} align="center">
                      Brak pozycji w liście przewozowym
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
          
          <Box sx={{ mb: 3 }}>
            <Button
              variant="outlined"
              startIcon={<AddIcon />}
              onClick={handleAddItem}
              sx={{ mt: 2 }}
            >
              Dodaj pozycję
            </Button>
          </Box>
          
          <Divider sx={{ my: 3 }} />
          
          {/* Przyciski */}
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 2 }}>
            <Button
              variant="outlined"
              onClick={handleCancel}
              disabled={saving}
            >
              Anuluj
            </Button>
            <Button
              type="submit"
              variant="contained"
              color="primary"
              disabled={saving}
            >
              {saving ? 'Zapisywanie...' : 'Zapisz'}
            </Button>
          </Box>
        </form>
      </Paper>
    </Container>
  );
};

export default WaybillForm; 