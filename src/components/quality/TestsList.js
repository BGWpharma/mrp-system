// src/components/quality/TestsList.js
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableContainer, 
  TableHead, 
  TableRow, 
  Paper, 
  Button, 
  TextField, 
  IconButton,
  Typography,
  Box,
  Chip,
  FormControl,
  InputLabel,
  Select,
  MenuItem
} from '@mui/material';
import { 
  Add as AddIcon, 
  Search as SearchIcon, 
  Edit as EditIcon,
  Delete as DeleteIcon,
  CheckCircle as TestIcon,
  History as HistoryIcon
} from '@mui/icons-material';
import { getAllTests, deleteTest } from '../../services/qualityService';
import { useNotification } from '../../hooks/useNotification';
import { formatDate } from '../../utils/formatters';

const TestsList = () => {
  const [tests, setTests] = useState([]);
  const [filteredTests, setFilteredTests] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const { showSuccess, showError } = useNotification();

  useEffect(() => {
    const cancelCheck = { current: false };
    fetchTests(cancelCheck);
    return () => { cancelCheck.current = true; };
  }, []);

  useEffect(() => {
    let filtered = [...tests];
    
    if (categoryFilter) {
      filtered = filtered.filter(test => test.category === categoryFilter);
    }
    
    if (searchTerm.trim() !== '') {
      filtered = filtered.filter(test => 
        test.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        test.description?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    
    setFilteredTests(filtered);
  }, [searchTerm, categoryFilter, tests]);

  const fetchTests = async (cancelCheck = { current: false }) => {
    try {
      setLoading(true);
      const fetchedTests = await getAllTests();
      if (cancelCheck.current) return;
      setTests(fetchedTests);
      setFilteredTests(fetchedTests);
    } catch (error) {
      if (cancelCheck.current) return;
      showError('Błąd podczas pobierania testów: ' + error.message);
      console.error('Error fetching tests:', error);
    } finally {
      if (!cancelCheck.current) setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Czy na pewno chcesz usunąć ten test?')) {
      try {
        await deleteTest(id);
        showSuccess('Test został usunięty');
        // Odśwież listę testów
        fetchTests();
      } catch (error) {
        showError('Błąd podczas usuwania testu: ' + error.message);
        console.error('Error deleting test:', error);
      }
    }
  };

  // Pobierz unikalne kategorie z testów
  const categories = [...new Set(tests.map(test => test.category))].filter(Boolean);

  if (loading) {
    return <div>Ładowanie testów jakościowych...</div>;
  }

  return (
    <div>
      <Box sx={{ display: 'flex', mb: 3, gap: 2 }}>
        <TextField
          label="Szukaj testu"
          variant="outlined"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          fullWidth
          InputProps={{
            startAdornment: <SearchIcon color="action" sx={{ mr: 1 }} />,
          }}
        />
        <FormControl sx={{ minWidth: 200 }}>
          <InputLabel>Kategoria</InputLabel>
          <Select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            label="Kategoria"
          >
            <MenuItem value="">Wszystkie</MenuItem>
            {categories.map(category => (
              <MenuItem key={category} value={category}>{category}</MenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>

      {filteredTests.length === 0 ? (
        <Typography variant="body1" align="center">
          Nie znaleziono testów jakościowych
        </Typography>
      ) : (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Nazwa testu</TableCell>
                <TableCell>Kategoria</TableCell>
                <TableCell>Etap produkcji</TableCell>
                <TableCell>Liczba parametrów</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Ostatnia aktualizacja</TableCell>
                <TableCell align="right">Akcje</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredTests.map((test) => (
                <TableRow key={test.id}>
                  <TableCell component="th" scope="row">
                    {test.name}
                  </TableCell>
                  <TableCell>{test.category || '—'}</TableCell>
                  <TableCell>{test.productionStage || '—'}</TableCell>
                  <TableCell>{test.parameters?.length || 0}</TableCell>
                  <TableCell>
                    <Chip 
                      label={test.status || 'Aktywny'} 
                      color={test.status === 'Nieaktywny' ? 'default' : 'success'} 
                      size="small" 
                    />
                  </TableCell>
                  <TableCell>{formatDate(test.updatedAt)}</TableCell>
                  <TableCell align="right">
                    <IconButton 
                      component={Link} 
                      to={`/quality/test/${test.id}/execute`}
                      color="success"
                      title="Wykonaj test"
                    >
                      <TestIcon />
                    </IconButton>
                    <IconButton 
                      component={Link} 
                      to={`/quality/test/${test.id}/results`}
                      color="info"
                      title="Historia wyników"
                    >
                      <HistoryIcon />
                    </IconButton>
                    <IconButton 
                      component={Link} 
                      to={`/quality/test/${test.id}/edit`}
                      color="primary"
                      title="Edytuj"
                    >
                      <EditIcon />
                    </IconButton>
                    <IconButton 
                      onClick={() => handleDelete(test.id)} 
                      color="error"
                      title="Usuń"
                    >
                      <DeleteIcon />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </div>
  );
};

export default TestsList;