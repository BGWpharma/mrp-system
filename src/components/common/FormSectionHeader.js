import React from 'react';
import { Box, Typography, Avatar } from '@mui/material';

const FormSectionHeader = ({ number, title, subtitle, icon }) => (
  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2.5 }}>
    <Avatar
      sx={{
        width: 30,
        height: 30,
        bgcolor: 'primary.main',
        fontSize: '0.85rem',
        fontWeight: 700,
      }}
    >
      {number}
    </Avatar>
    {icon && (
      <Box sx={{ color: 'primary.main', display: 'flex', alignItems: 'center' }}>
        {icon}
      </Box>
    )}
    <Box>
      <Typography variant="h6" sx={{ fontWeight: 600, lineHeight: 1.2 }}>
        {title}
      </Typography>
      {subtitle && (
        <Typography variant="caption" color="text.secondary">
          {subtitle}
        </Typography>
      )}
    </Box>
  </Box>
);

export default FormSectionHeader;
