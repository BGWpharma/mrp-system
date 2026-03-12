import React from 'react';
import {
  Box,
  Button,
  TextField,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  CircularProgress,
  Chip,
  Checkbox,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Alert,
} from '@mui/material';
import {
  Link as LinkIcon,
  Search as SearchIcon,
} from '@mui/icons-material';

const LinkInventoryDialog = ({
  open,
  onClose,
  inventorySearchQuery,
  onSearch,
  selectedInventoryItem,
  onSelectItem,
  linkDialogItems,
  linkDialogLoading,
  linkDialogTotalCount,
  linkingInventory,
  onLink,
  t
}) => {
  return (
    <Dialog 
      open={open} 
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: '12px',
          overflow: 'hidden'
        }
      }}
    >
      <Box sx={{ 
        p: 2, 
        display: 'flex', 
        alignItems: 'center', 
        gap: 1,
        borderBottom: '1px solid',
        borderColor: 'divider',
        bgcolor: 'action.hover'
      }}>
        <LinkIcon color="secondary" />
        <DialogTitle sx={{ p: 0 }}>{t('recipes.linkInventoryDialog.title')}</DialogTitle>
      </Box>
      
      <DialogContent sx={{ mt: 2 }}>
        <DialogContentText sx={{ mb: 2 }}>
          {t('recipes.linkInventoryDialog.description')}
        </DialogContentText>
        
        <TextField
          fullWidth
          placeholder={t('recipes.linkInventoryDialog.searchPlaceholder')}
          value={inventorySearchQuery}
          onChange={(e) => onSearch(e.target.value)}
          sx={{ mb: 1, '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
          InputProps={{
            startAdornment: <SearchIcon sx={{ mr: 1, color: 'text.secondary' }} />,
            endAdornment: linkDialogLoading ? <CircularProgress size={20} /> : null
          }}
        />
        
        {!linkDialogLoading && linkDialogTotalCount > 0 && (
          <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
            {linkDialogTotalCount > 100 
              ? t('recipes.linkInventoryDialog.showing100of', { total: linkDialogTotalCount })
              : t('recipes.linkInventoryDialog.foundItems', { count: linkDialogTotalCount })
            }
          </Typography>
        )}
        
        <Box sx={{ 
          maxHeight: 400, 
          overflow: 'auto',
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: '8px'
        }}>
          {linkDialogLoading && linkDialogItems.length === 0 ? (
            <Box sx={{ p: 3, textAlign: 'center' }}>
              <CircularProgress size={32} />
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                {t('recipes.linkInventoryDialog.loadingItems')}
              </Typography>
            </Box>
          ) : linkDialogItems.length === 0 ? (
            <Box sx={{ p: 3, textAlign: 'center', color: 'text.secondary' }}>
              {inventorySearchQuery 
                ? t('recipes.linkInventoryDialog.noResults')
                : t('recipes.linkInventoryDialog.noAvailableItems')
              }
            </Box>
          ) : (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell padding="checkbox"></TableCell>
                  <TableCell>{t('recipes.linkInventoryDialog.columns.name')}</TableCell>
                  <TableCell>{t('recipes.linkInventoryDialog.columns.unit')}</TableCell>
                  <TableCell>{t('recipes.linkInventoryDialog.linkStatus')}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {linkDialogItems.map((item) => (
                  <TableRow 
                    key={item.id}
                    hover
                    selected={selectedInventoryItem?.id === item.id}
                    onClick={() => onSelectItem(item)}
                    sx={{ 
                      cursor: 'pointer',
                      opacity: item.recipeId ? 0.75 : 1
                    }}
                  >
                    <TableCell padding="checkbox">
                      <Checkbox
                        checked={selectedInventoryItem?.id === item.id}
                        onChange={() => onSelectItem(
                          selectedInventoryItem?.id === item.id ? null : item
                        )}
                      />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" fontWeight="medium">
                        {item.name}
                      </Typography>
                    </TableCell>
                    <TableCell>{item.unit || '-'}</TableCell>
                    <TableCell>
                      {item.recipeId ? (
                        <Chip 
                          label={item.recipeInfo?.name || t('recipes.linkInventoryDialog.otherRecipe')} 
                          size="small" 
                          color="warning"
                          variant="outlined"
                          sx={{ maxWidth: 200 }}
                        />
                      ) : (
                        <Chip 
                          label={t('recipes.linkInventoryDialog.available')} 
                          size="small" 
                          color="success"
                          variant="outlined"
                        />
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Box>
        
        {selectedInventoryItem && (
          <Alert severity={selectedInventoryItem.recipeId ? "warning" : "info"} sx={{ mt: 2 }}>
            {selectedInventoryItem.recipeId ? (
              <>
                {t('recipes.linkInventoryDialog.alreadyLinkedWarning', { 
                  name: selectedInventoryItem.name, 
                  recipeName: selectedInventoryItem.recipeInfo?.name || t('recipes.linkInventoryDialog.otherRecipe') 
                })}
              </>
            ) : (
              <>
                {t('recipes.linkInventoryDialog.selectedItem')}: <strong>{selectedInventoryItem.name}</strong>
              </>
            )}
          </Alert>
        )}
      </DialogContent>
      
      <DialogActions sx={{ p: 2, borderTop: '1px solid', borderColor: 'divider' }}>
        <Button 
          onClick={onClose}
          sx={{ borderRadius: '8px' }}
        >
          {t('common.cancel')}
        </Button>
        <Button 
          onClick={onLink} 
          variant="contained" 
          color="secondary"
          disabled={linkingInventory || !selectedInventoryItem}
          startIcon={linkingInventory ? <CircularProgress size={20} /> : <LinkIcon />}
          sx={{ 
            borderRadius: '8px', 
            boxShadow: '0 4px 6px rgba(0,0,0,0.15)',
            px: 3
          }}
        >
          {linkingInventory 
            ? t('recipes.linkInventoryDialog.linking') 
            : t('recipes.linkInventoryDialog.linkButton')
          }
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default LinkInventoryDialog;
