import React from 'react';
import PropTypes from 'prop-types';
import { Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, Button, IconButton } from '@mui/material';
import { Close as CloseIcon } from '@mui/icons-material';

const ConfirmDialog = ({ 
  open, 
  title, 
  message, 
  content, 
  onConfirm, 
  onCancel, 
  onClose,
  confirmText = 'Potwierdź',
  cancelText = 'Anuluj',
  showCloseButton = false,
  maxWidth = 'sm',
  fullWidth = true
}) => {
  const handleClose = onClose || onCancel;
  
  return (
    <Dialog
      open={open}
      onClose={handleClose}
      aria-labelledby="confirm-dialog-title"
      aria-describedby="confirm-dialog-description"
      maxWidth={maxWidth}
      fullWidth={fullWidth}
    >
      <DialogTitle id="confirm-dialog-title" sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        {title}
        {showCloseButton && (
          <IconButton
            aria-label="close"
            onClick={handleClose}
            sx={{ color: 'grey.500' }}
          >
            <CloseIcon />
          </IconButton>
        )}
      </DialogTitle>
      <DialogContent>
        {content ? (
          content
        ) : (
          <DialogContentText id="confirm-dialog-description">
            {message}
          </DialogContentText>
        )}
      </DialogContent>
      <DialogActions sx={{ p: 2, gap: 1 }}>
        <Button 
          onClick={onCancel} 
          color="primary"
          variant="outlined"
          sx={{ minWidth: 120 }}
        >
          {cancelText}
        </Button>
        <Button 
          onClick={onConfirm} 
          color="primary" 
          variant="contained"
          autoFocus
          sx={{ minWidth: 120 }}
        >
          {confirmText}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

ConfirmDialog.propTypes = {
  open: PropTypes.bool.isRequired,
  title: PropTypes.string.isRequired,
  message: PropTypes.string,
  content: PropTypes.node,
  onConfirm: PropTypes.func.isRequired,
  onCancel: PropTypes.func.isRequired,
  onClose: PropTypes.func,
  confirmText: PropTypes.string,
  cancelText: PropTypes.string,
  showCloseButton: PropTypes.bool,
  maxWidth: PropTypes.oneOf(['xs', 'sm', 'md', 'lg', 'xl']),
  fullWidth: PropTypes.bool
};

export default ConfirmDialog; 