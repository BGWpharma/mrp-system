import React from 'react';
import { Container, Box, Typography, Paper, CircularProgress } from '@mui/material';

const FormPageLayout = ({ title, maxWidth = 'lg', children, actions, loading = false }) => (
  <Container maxWidth={maxWidth}>
    <Box sx={{ py: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h5" fontWeight={600}>{title}</Typography>
        {actions}
      </Box>
      <Paper sx={{ p: 3 }}>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
            <CircularProgress />
          </Box>
        ) : children}
      </Paper>
    </Box>
  </Container>
);

export default FormPageLayout;
