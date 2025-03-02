// src/pages/Production/ProductionPage.js
import React, { useState } from 'react';
import { Container, Box, ToggleButtonGroup, ToggleButton, Tooltip } from '@mui/material';
import { ViewList as ListIcon, CalendarMonth as CalendarIcon } from '@mui/icons-material';
import TaskList from '../../components/production/TaskList';
import ProductionCalendar from '../../components/production/ProductionCalendar';

const ProductionPage = () => {
  const [view, setView] = useState('list'); // 'list' lub 'calendar'

  const handleViewChange = (event, newView) => {
    if (newView !== null) {
      setView(newView);
    }
  };

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
        <ToggleButtonGroup
          value={view}
          exclusive
          onChange={handleViewChange}
          aria-label="widok produkcji"
          size="small"
        >
          <ToggleButton value="list" aria-label="lista">
            <Tooltip title="Widok listy">
              <ListIcon />
            </Tooltip>
          </ToggleButton>
          <ToggleButton value="calendar" aria-label="kalendarz">
            <Tooltip title="Widok kalendarza">
              <CalendarIcon />
            </Tooltip>
          </ToggleButton>
        </ToggleButtonGroup>
      </Box>
      
      {view === 'list' ? <TaskList /> : <ProductionCalendar />}
    </Container>
  );
};

export default ProductionPage;