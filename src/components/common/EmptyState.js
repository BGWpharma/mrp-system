import React from 'react';
import { Box, Typography, Button } from '@mui/material';
import { alpha } from '@mui/material/styles';
import InboxIcon from '@mui/icons-material/Inbox';

const EmptyState = ({
  icon: Icon = InboxIcon,
  title = 'Brak danych',
  description,
  action,
  onAction,
  actionIcon,
  sx = {},
}) => {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        py: 6,
        px: 3,
        textAlign: 'center',
        ...sx,
      }}
    >
      <Box
        sx={{
          width: 80,
          height: 80,
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          bgcolor: (theme) => alpha(theme.palette.primary.main, 0.08),
          mb: 2,
        }}
      >
        <Icon sx={{ fontSize: 40, color: 'text.disabled' }} />
      </Box>
      <Typography variant="h6" sx={{ fontWeight: 600, color: 'text.primary', mb: 0.5 }}>
        {title}
      </Typography>
      {description && (
        <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 360, mb: action ? 2.5 : 0 }}>
          {description}
        </Typography>
      )}
      {action && onAction && (
        <Button
          variant="contained"
          size="small"
          onClick={onAction}
          startIcon={actionIcon}
          sx={{ textTransform: 'none' }}
        >
          {action}
        </Button>
      )}
    </Box>
  );
};

export default EmptyState;
