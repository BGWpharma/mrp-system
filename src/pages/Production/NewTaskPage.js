// src/pages/Production/NewTaskPage.js
import React from 'react';
import { Container } from '@mui/material';
import TaskForm from '../../components/production/TaskForm';

const NewTaskPage = () => {
  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <TaskForm />
    </Container>
  );
};

export default NewTaskPage;