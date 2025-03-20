import React, { useState, useRef } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Tabs,
  Tab,
  Typography,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  CircularProgress
} from '@mui/material';
import InventoryLabel from './InventoryLabel';

const LabelDialog = ({ open, onClose, item, batches = [] }) => {
  const [selectedTab, setSelectedTab] = useState(0);
  const [selectedBatch, setSelectedBatch] = useState(batches?.length > 0 ? batches[0] : null);
  const [loading, setLoading] = useState(false);
  const labelRef = useRef(null);
  
  const handleTabChange = (event, newValue) => {
    setSelectedTab(newValue);
  };
  
  const handleBatchChange = (event) => {
    const batchId = event.target.value;
    const batch = batches?.find(b => b.id === batchId) || null;
    setSelectedBatch(batch);
  };
  
  const handleClose = () => {
    onClose();
  };
  
  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: {
          minHeight: '60vh',
          maxHeight: '90vh'
        }
      }}
    >
      <DialogTitle>
        Generowanie etykiety: {item?.name || 'Produkt'}
      </DialogTitle>
      <DialogContent>
        <Tabs value={selectedTab} onChange={handleTabChange} sx={{ mb: 2 }}>
          <Tab label="Etykieta produktu" />
          <Tab label="Etykieta partii" disabled={!batches || batches.length === 0} />
        </Tabs>
        
        {selectedTab === 1 && batches && batches.length > 0 && (
          <Box sx={{ mb: 3 }}>
            <FormControl fullWidth>
              <InputLabel>Wybierz partię</InputLabel>
              <Select
                value={selectedBatch?.id || ''}
                onChange={handleBatchChange}
                label="Wybierz partię"
              >
                {batches.map((batch) => (
                  <MenuItem key={batch.id} value={batch.id}>
                    Nr partii: {batch.batchNumber || 'brak'} | Ilość: {batch.quantity} | 
                    {batch.expiryDate ? ` Ważna do: ${new Date(batch.expiryDate).toLocaleDateString('pl-PL')}` : ' Brak daty ważności'}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>
        )}
        
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '300px' }}>
            <CircularProgress />
          </Box>
        ) : (
          <>
            {selectedTab === 0 && (
              <InventoryLabel 
                ref={labelRef}
                item={item} 
                onClose={handleClose}
              />
            )}
            
            {selectedTab === 1 && selectedBatch && (
              <InventoryLabel 
                ref={labelRef}
                item={item} 
                batch={selectedBatch}
                onClose={handleClose}
              />
            )}
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} color="primary">
          Zamknij
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default LabelDialog; 