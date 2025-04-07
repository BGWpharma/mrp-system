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
        Generate Label: {item?.name || 'Product'}
      </DialogTitle>
      <DialogContent>
        <Tabs value={selectedTab} onChange={handleTabChange} sx={{ mb: 2 }}>
          <Tab label="Product Label" />
          <Tab label="Batch Label" disabled={!batches || batches.length === 0} />
        </Tabs>
        
        {selectedTab === 1 && batches && batches.length > 0 && (
          <Box sx={{ mb: 3 }}>
            <FormControl fullWidth>
              <InputLabel>Select Batch</InputLabel>
              <Select
                value={selectedBatch?.id || ''}
                onChange={handleBatchChange}
                label="Select Batch"
              >
                {batches.map((batch) => (
                  <MenuItem key={batch.id} value={batch.id}>
                    Batch No: {batch.batchNumber || 'none'} | Quantity: {batch.quantity} | 
                    {batch.expiryDate ? ` Expires: ${new Date(batch.expiryDate).toLocaleDateString('en-US')}` : ' No expiry date'}
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
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default LabelDialog; 