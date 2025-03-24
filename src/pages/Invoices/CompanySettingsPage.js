import React from 'react';
import { Box, Container, Typography, Paper, Breadcrumbs, Link } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { NavigateNext as NavigateNextIcon } from '@mui/icons-material';
import CompanyInfoForm from '../../components/invoices/CompanyInfoForm';

const CompanySettingsPage = () => {
  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Paper sx={{ p: 2, mb: 3 }}>
        <Breadcrumbs separator={<NavigateNextIcon fontSize="small" />} aria-label="breadcrumb">
          <Link component={RouterLink} to="/dashboard" color="inherit">
            Dashboard
          </Link>
          <Link component={RouterLink} to="/invoices" color="inherit">
            Faktury
          </Link>
          <Typography color="text.primary">Dane firmy</Typography>
        </Breadcrumbs>
      </Paper>
      
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" gutterBottom>
          Dane firmy
        </Typography>
        <Typography variant="subtitle1" color="text.secondary">
          Ustaw dane firmy, które będą widoczne na wystawianych fakturach
        </Typography>
      </Box>
      
      <CompanyInfoForm />
    </Container>
  );
};

export default CompanySettingsPage; 