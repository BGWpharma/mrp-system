import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  Grid,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Divider,
  Chip
} from '@mui/material';
import { formatDate } from '../../utils/formatters';

const RecipeVersionComparison = ({ currentVersion, previousVersion }) => {
  const [differences, setDifferences] = useState({
    basic: [],
    ingredients: [],
    other: []
  });

  useEffect(() => {
    if (currentVersion && previousVersion) {
      compareVersions();
    }
  }, [currentVersion, previousVersion]);

  const compareVersions = () => {
    const basicDiffs = [];
    const ingredientDiffs = [];
    const otherDiffs = [];

    // Porównanie podstawowych pól
    const basicFields = [
      { key: 'name', label: 'Nazwa' },
      { key: 'description', label: 'Opis' },
      { key: 'prepTime', label: 'Czas przygotowania' },
      { key: 'productionTimePerUnit', label: 'Czas/sztuka' },
      { key: 'processingCostPerUnit', label: 'Koszt/sztuka' },
      { key: 'status', label: 'Status' },
      { key: 'notes', label: 'Notatki' }
    ];

    basicFields.forEach(field => {
      const oldValue = previousVersion.data[field.key];
      const newValue = currentVersion.data[field.key];

      if (oldValue !== newValue) {
        let formattedOldValue = oldValue || '(brak)';
        let formattedNewValue = newValue || '(brak)';
        
        // Formatowanie specyficznych pól
        if (field.key === 'prepTime' || field.key === 'productionTimePerUnit') {
          formattedOldValue = oldValue ? `${oldValue} min` : '(brak)';
          formattedNewValue = newValue ? `${newValue} min` : '(brak)';
        } else if (field.key === 'processingCostPerUnit') {
          formattedOldValue = oldValue ? `${parseFloat(oldValue).toFixed(2)} EUR` : '(brak)';
          formattedNewValue = newValue ? `${parseFloat(newValue).toFixed(2)} EUR` : '(brak)';
        }
        
        basicDiffs.push({
          field: field.label,
          oldValue: formattedOldValue,
          newValue: formattedNewValue
        });
      }
    });

    // Porównanie wydajności
    if (
      previousVersion.data.yield?.quantity !== currentVersion.data.yield?.quantity ||
      previousVersion.data.yield?.unit !== currentVersion.data.yield?.unit
    ) {
      basicDiffs.push({
        field: 'Wydajność',
        oldValue: `${previousVersion.data.yield?.quantity || ''} ${previousVersion.data.yield?.unit || ''}`,
        newValue: `${currentVersion.data.yield?.quantity || ''} ${currentVersion.data.yield?.unit || ''}`
      });
    }

    // Porównanie składników
    const oldIngredients = previousVersion.data.ingredients || [];
    const newIngredients = currentVersion.data.ingredients || [];

    // Znajdź usunięte składniki
    oldIngredients.forEach(oldIng => {
      const stillExists = newIngredients.some(
        newIng => newIng.name === oldIng.name && 
                 newIng.quantity === oldIng.quantity && 
                 newIng.unit === oldIng.unit
      );
      
      if (!stillExists) {
        ingredientDiffs.push({
          type: 'removed',
          name: oldIng.name,
          oldValue: `${oldIng.quantity} ${oldIng.unit}`,
          newValue: '-'
        });
      }
    });

    // Znajdź dodane lub zmienione składniki
    newIngredients.forEach(newIng => {
      const oldIng = oldIngredients.find(old => old.name === newIng.name);
      
      if (!oldIng) {
        // Dodany składnik
        ingredientDiffs.push({
          type: 'added',
          name: newIng.name,
          oldValue: '-',
          newValue: `${newIng.quantity} ${newIng.unit}`
        });
      } else if (
        oldIng.quantity !== newIng.quantity || 
        oldIng.unit !== newIng.unit
      ) {
        // Zmieniony składnik
        ingredientDiffs.push({
          type: 'modified',
          name: newIng.name,
          oldValue: `${oldIng.quantity} ${oldIng.unit}`,
          newValue: `${newIng.quantity} ${newIng.unit}`
        });
      }
    });

    // Porównanie alergenów
    const oldAllergens = previousVersion.data.allergens || [];
    const newAllergens = currentVersion.data.allergens || [];

    if (JSON.stringify(oldAllergens) !== JSON.stringify(newAllergens)) {
      otherDiffs.push({
        field: 'Alergeny',
        oldValue: oldAllergens.join(', ') || '(brak)',
        newValue: newAllergens.join(', ') || '(brak)'
      });
    }

    setDifferences({
      basic: basicDiffs,
      ingredients: ingredientDiffs,
      other: otherDiffs
    });
  };

  if (!currentVersion || !previousVersion) {
    return <Typography>Wybierz wersje do porównania</Typography>;
  }

  const hasDifferences = 
    differences.basic.length > 0 || 
    differences.ingredients.length > 0 || 
    differences.other.length > 0;

  return (
    <Paper sx={{ p: 3, mt: 2 }}>
      <Typography variant="h6" gutterBottom>
        Porównanie wersji {previousVersion.version} z wersją {currentVersion.version}
      </Typography>
      
      <Box sx={{ mb: 3 }}>
        <Grid container spacing={2}>
          <Grid item xs={6}>
            <Typography variant="subtitle2">
              Wersja {previousVersion.version}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Utworzona: {formatDate(previousVersion.createdAt)}
            </Typography>
          </Grid>
          <Grid item xs={6}>
            <Typography variant="subtitle2">
              Wersja {currentVersion.version}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Utworzona: {formatDate(currentVersion.createdAt)}
            </Typography>
          </Grid>
        </Grid>
      </Box>

      {!hasDifferences && (
        <Typography variant="body1" sx={{ my: 2 }}>
          Nie znaleziono różnic między wersjami.
        </Typography>
      )}

      {differences.basic.length > 0 && (
        <>
          <Typography variant="subtitle1" sx={{ mt: 3, mb: 1 }}>
            Podstawowe informacje
          </Typography>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Pole</TableCell>
                  <TableCell>Wersja {previousVersion.version}</TableCell>
                  <TableCell>Wersja {currentVersion.version}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {differences.basic.map((diff, index) => (
                  <TableRow key={index}>
                    <TableCell>{diff.field}</TableCell>
                    <TableCell 
                      sx={{ 
                        backgroundColor: '#ffeeee',
                        maxWidth: 250,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        color: '#000000'
                      }}
                    >
                      {diff.oldValue}
                    </TableCell>
                    <TableCell 
                      sx={{ 
                        backgroundColor: '#eeffee',
                        maxWidth: 250,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        color: '#000000'
                      }}
                    >
                      {diff.newValue}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </>
      )}

      {differences.ingredients.length > 0 && (
        <>
          <Typography variant="subtitle1" sx={{ mt: 3, mb: 1 }}>
            Zmiany w składnikach
          </Typography>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Składnik</TableCell>
                  <TableCell>Zmiana</TableCell>
                  <TableCell>Wersja {previousVersion.version}</TableCell>
                  <TableCell>Wersja {currentVersion.version}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {differences.ingredients.map((diff, index) => (
                  <TableRow key={index}>
                    <TableCell>{diff.name}</TableCell>
                    <TableCell>
                      <Chip 
                        label={
                          diff.type === 'added' ? 'Dodany' : 
                          diff.type === 'removed' ? 'Usunięty' : 'Zmieniony'
                        }
                        color={
                          diff.type === 'added' ? 'success' : 
                          diff.type === 'removed' ? 'error' : 'warning'
                        }
                        size="small"
                      />
                    </TableCell>
                    <TableCell 
                      sx={{ 
                        backgroundColor: diff.type !== 'added' ? '#ffeeee' : 'inherit',
                        color: diff.type !== 'added' ? '#000000' : 'inherit'
                      }}
                    >
                      {diff.oldValue}
                    </TableCell>
                    <TableCell 
                      sx={{ 
                        backgroundColor: diff.type !== 'removed' ? '#eeffee' : 'inherit',
                        color: diff.type !== 'removed' ? '#000000' : 'inherit'
                      }}
                    >
                      {diff.newValue}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </>
      )}

      {differences.other.length > 0 && (
        <>
          <Typography variant="subtitle1" sx={{ mt: 3, mb: 1 }}>
            Inne zmiany
          </Typography>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Pole</TableCell>
                  <TableCell>Wersja {previousVersion.version}</TableCell>
                  <TableCell>Wersja {currentVersion.version}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {differences.other.map((diff, index) => (
                  <TableRow key={index}>
                    <TableCell>{diff.field}</TableCell>
                    <TableCell 
                      sx={{ 
                        backgroundColor: '#ffeeee',
                        maxWidth: 250,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        color: '#000000'
                      }}
                    >
                      {diff.oldValue}
                    </TableCell>
                    <TableCell 
                      sx={{ 
                        backgroundColor: '#eeffee',
                        maxWidth: 250,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        color: '#000000'
                      }}
                    >
                      {diff.newValue}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </>
      )}
    </Paper>
  );
};

export default RecipeVersionComparison; 