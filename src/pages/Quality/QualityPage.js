// src/pages/Quality/QualityPage.js
import React from 'react';
import { Container, Typography, Box, Button } from '@mui/material';
import { Link } from 'react-router-dom';
import { Add as AddIcon, Assessment as ReportIcon } from '@mui/icons-material';
import TestsList from '../../components/quality/TestsList';

const QualityPage = () => {
  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h5">
          Testy jakościowe
        </Typography>
        <Box>
          <Button
            variant="outlined"
            component={Link}
            to="/quality/reports"
            startIcon={<ReportIcon />}
            sx={{ mr: 1 }}
          >
            Raporty
          </Button>
          <Button
            variant="contained"
            component={Link}
            to="/quality/new-test"
            startIcon={<AddIcon />}
          >
            Nowy test
          </Button>
        </Box>
      </Box>
      <TestsList />
    </Container>
  );
};

export default QualityPage;