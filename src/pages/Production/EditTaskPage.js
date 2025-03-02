import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Container, CircularProgress } from '@mui/material';
import TaskForm from '../../components/production/TaskForm';
import { getTaskById } from '../../services/productionService';
import { useNotification } from '../../hooks/useNotification';

const EditTaskPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { showError } = useNotification();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTask = async () => {
      try {
        setLoading(true);
        // Sprawdzam, czy zadanie istnieje
        await getTaskById(id);
      } catch (error) {
        showError('Błąd podczas pobierania zadania: ' + error.message);
        console.error('Error fetching task:', error);
        navigate('/production');
      } finally {
        setLoading(false);
      }
    };
    
    fetchTask();
  }, [id, navigate, showError]);

  if (loading) {
    return (
      <Container maxWidth="lg" sx={{ mt: 4, mb: 4, display: 'flex', justifyContent: 'center' }}>
        <CircularProgress />
      </Container>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <TaskForm taskId={id} />
    </Container>
  );
};

export default EditTaskPage; 