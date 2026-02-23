import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { 
  Paper, 
  Table, 
  TableBody, 
  TableCell, 
  TableContainer, 
  TableHead, 
  TableRow,
  Box,
  Button,
  IconButton,
  Typography,
  Tooltip
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';

import { 
  getPriceListItems, 
  deletePriceListItem 
} from '../../../services/priceListService';
import { useNotification } from '../../../hooks/useNotification';
import { useTranslation } from '../../../hooks/useTranslation';
import ConfirmDialog from '../../common/ConfirmDialog';
import Loader from '../../common/Loader';
import AddPriceListItemDialog from './AddPriceListItemDialog';
import EditPriceListItemDialog from './EditPriceListItemDialog';

const PriceListItemsTable = ({ priceListId, readOnly = false }) => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState(null);
  
  const { showNotification } = useNotification();
  const { t } = useTranslation('priceLists');
  
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const data = await getPriceListItems(priceListId);
        if (cancelled) return;
        setItems(data);
      } catch (error) {
        if (cancelled) return;
        console.error('Błąd podczas pobierania elementów listy cenowej:', error);
        showNotification(t('priceLists.messages.errors.fetchItemsFailed'), 'error');
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [priceListId]);
  
  const fetchItems = async () => {
    try {
      setLoading(true);
      const data = await getPriceListItems(priceListId);
      setItems(data);
    } catch (error) {
      console.error('Błąd podczas pobierania elementów listy cenowej:', error);
      showNotification(t('priceLists.messages.errors.fetchItemsFailed'), 'error');
    } finally {
      setLoading(false);
    }
  };
  
  const handleAddClick = () => {
    setAddDialogOpen(true);
  };
  
  const handleEditClick = (item) => {
    setSelectedItem(item);
    setEditDialogOpen(true);
  };
  
  const handleDeleteClick = (item) => {
    setItemToDelete(item);
    setConfirmDeleteOpen(true);
  };
  
  const handleConfirmDelete = async () => {
    if (!itemToDelete) return;
    
    try {
      await deletePriceListItem(itemToDelete.id);
      setItems(items.filter(item => item.id !== itemToDelete.id));
      showNotification(t('priceLists.messages.success.itemDeleted'), 'success');
    } catch (error) {
      console.error('Błąd podczas usuwania elementu listy cenowej:', error);
      showNotification(t('priceLists.messages.errors.deleteItemFailed'), 'error');
    } finally {
      setConfirmDeleteOpen(false);
      setItemToDelete(null);
    }
  };
  
  const handleItemAdded = (newItem) => {
    setItems([...items, newItem]);
    setAddDialogOpen(false);
  };
  
  const handleItemUpdated = (updatedItem) => {
    setItems(items.map(item => 
      item.id === updatedItem.id ? updatedItem : item
    ));
    setEditDialogOpen(false);
    setSelectedItem(null);
  };
  
  if (loading) {
    return <Loader />;
  }
  
  return (
    <>
      <Box sx={{ mb: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="subtitle1">
          {t('priceLists.items.totalCount', { count: items.length })}
        </Typography>
        
        {!readOnly && (
          <Button
            variant="contained"
            color="primary"
            startIcon={<AddIcon />}
            onClick={handleAddClick}
          >
            {t('priceLists.items.addProduct')}
          </Button>
        )}
      </Box>
      
      <Paper elevation={3}>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>{t('priceLists.items.table.productName')}</TableCell>
                <TableCell>{t('priceLists.items.table.price')}</TableCell>
                <TableCell>{t('priceLists.items.table.unit')}</TableCell>
                <TableCell>{t('priceLists.items.table.minQuantity')}</TableCell>
                <TableCell>{t('priceLists.items.table.notes')}</TableCell>
                {!readOnly && <TableCell align="right">{t('priceLists.items.table.actions')}</TableCell>}
              </TableRow>
            </TableHead>
            <TableBody>
              {items.length > 0 ? (
                items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{item.productName}</TableCell>
                    <TableCell>{item.price.toFixed(2)} {item.currency || 'EUR'}</TableCell>
                    <TableCell>{item.unit}</TableCell>
                    <TableCell>{item.minQuantity || 1} {item.unit}</TableCell>
                    <TableCell>{item.notes || '-'}</TableCell>
                    {!readOnly && (
                      <TableCell align="right">
                        <Tooltip title={t('priceLists.items.table.edit')}>
                          <IconButton 
                            size="small"
                            onClick={() => handleEditClick(item)}
                          >
                            <EditIcon />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title={t('priceLists.items.table.delete')}>
                          <IconButton 
                            color="error" 
                            size="small"
                            onClick={() => handleDeleteClick(item)}
                          >
                            <DeleteIcon />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    )}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={readOnly ? 5 : 6} align="center">
                    {t('priceLists.items.noItems')}
                    {!readOnly && t('priceLists.items.noItemsAction')}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
      
      {/* Dialogi */}
      {!readOnly && (
        <>
          <AddPriceListItemDialog 
            open={addDialogOpen}
            onClose={() => setAddDialogOpen(false)}
            priceListId={priceListId}
            onItemAdded={handleItemAdded}
          />
          
          <EditPriceListItemDialog
            open={editDialogOpen}
            onClose={() => {
              setEditDialogOpen(false);
              setSelectedItem(null);
            }}
            item={selectedItem}
            onItemUpdated={handleItemUpdated}
          />
          
          <ConfirmDialog
            open={confirmDeleteOpen}
            title={t('priceLists.confirmations.deleteTitle')}
            message={t('priceLists.confirmations.deleteItemMessage', { productName: itemToDelete?.productName })}
            onConfirm={handleConfirmDelete}
            onCancel={() => setConfirmDeleteOpen(false)}
          />
        </>
      )}
    </>
  );
};

PriceListItemsTable.propTypes = {
  priceListId: PropTypes.string.isRequired,
  readOnly: PropTypes.bool
};

export default PriceListItemsTable; 