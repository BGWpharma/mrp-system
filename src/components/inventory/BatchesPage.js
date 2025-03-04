import React, { useState } from 'react';
import { Table, TableHead, TableBody, TableRow, TableCell, Chip } from '@mui/material';
import { getBatchStatus, getBatchStatusColor } from '../../utils/batchUtils';

const BatchesPage = () => {
  const [filteredBatches, setFilteredBatches] = useState([]);
  const [item, setItem] = useState(null);

  // ... existing code ...

  // Dodajemy kolumnę z ceną jednostkową w tabeli partii
  <TableHead>
    <TableRow>
      <TableCell>Numer partii</TableCell>
      <TableCell>Numer LOT</TableCell>
      <TableCell>Ilość</TableCell>
      <TableCell>Cena jedn.</TableCell>
      <TableCell>Data przyjęcia</TableCell>
      <TableCell>Data ważności</TableCell>
      <TableCell>Status</TableCell>
      <TableCell>Akcje</TableCell>
    </TableRow>
  </TableHead>
  <TableBody>
    {filteredBatches.map((batch) => (
      <TableRow key={batch.id}>
        <TableCell>{batch.batchNumber}</TableCell>
        <TableCell>{batch.lotNumber}</TableCell>
        <TableCell>{batch.quantity} {item?.unit}</TableCell>
        <TableCell>{batch.unitPrice ? `${batch.unitPrice.toFixed(2)} zł` : '-'}</TableCell>
        <TableCell>{batch.receivedDate ? new Date(batch.receivedDate).toLocaleDateString() : '-'}</TableCell>
        <TableCell>{batch.expiryDate ? new Date(batch.expiryDate).toLocaleDateString() : '-'}</TableCell>
        <TableCell>
          <Chip 
            label={getBatchStatus(batch)} 
            color={getBatchStatusColor(batch)}
            size="small"
          />
        </TableCell>
        <TableCell>
          {/* ... existing code ... */}
        </TableCell>
      </TableRow>
    ))}
  </TableBody>

  // ... existing code ...
};

export default BatchesPage; 