import React from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, Box, Typography, Avatar
} from '@mui/material';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import CloseIcon from '@mui/icons-material/Close';
import WorkTimeAdminTab from './WorkTimeAdminTab';

const WorkTimeUserDialog = ({ open, onClose, user, users, adminUser }) => {
  if (!user) return null;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Avatar sx={{ bgcolor: 'primary.main', width: 36, height: 36 }}>
            {user.displayName?.charAt(0) || '?'}
          </Avatar>
          <Box sx={{ flex: 1 }}>
            <Typography variant="h6" component="span">
              Czas pracy — {user.displayName || user.email}
            </Typography>
            <Typography variant="caption" display="block" color="text.secondary">
              {user.employeeId} · {user.position || 'Brak stanowiska'}
            </Typography>
          </Box>
          <AccessTimeIcon color="primary" />
        </Box>
      </DialogTitle>
      <DialogContent dividers sx={{ p: 0 }}>
        <WorkTimeAdminTab
          users={users}
          adminUser={adminUser}
          filterEmployeeId={user.employeeId}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} startIcon={<CloseIcon />}>
          Zamknij
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default WorkTimeUserDialog;
