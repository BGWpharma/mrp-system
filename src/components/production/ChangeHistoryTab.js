import React from 'react';
import {
  Grid,
  Paper,
  Typography,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  TableContainer,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody
} from '@mui/material';
import {
  ExpandMore as ExpandMoreIcon
} from '@mui/icons-material';

const ChangeHistoryTab = ({ task, getUserName }) => {
  return (
    <Grid container spacing={3}>
      {task.statusHistory && task.statusHistory.length > 0 && (
        <Grid item xs={12}>
          <Paper sx={{ p: 3 }}>
            <Accordion defaultExpanded>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography variant="h6" component="h2">
                  Historia zmian statusu ({task.statusHistory.length})
                </Typography>
              </AccordionSummary>
              <AccordionDetails>
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Data i godzina</TableCell>
                        <TableCell>Poprzedni status</TableCell>
                        <TableCell>Nowy status</TableCell>
                        <TableCell>Kto zmienił</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {[...task.statusHistory].reverse().map((change, index) => (
                        <TableRow key={index}>
                          <TableCell>
                            {change.changedAt 
                              ? new Date(change.changedAt).toLocaleString('pl') 
                              : 'Brak daty'}
                          </TableCell>
                          <TableCell>{change.oldStatus}</TableCell>
                          <TableCell>{change.newStatus}</TableCell>
                          <TableCell>{getUserName(change.changedBy)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </AccordionDetails>
            </Accordion>
          </Paper>
        </Grid>
      )}
      
      {/* Dodatkowe sekcje historii można dodać tutaj w przyszłości */}
      {(!task.statusHistory || task.statusHistory.length === 0) && (
        <Grid item xs={12}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" component="h2" gutterBottom>
              Historia zmian
            </Typography>
            <Typography variant="body2" color="text.secondary" align="center">
              Brak historii zmian dla tego zadania
            </Typography>
          </Paper>
        </Grid>
      )}
    </Grid>
  );
};

export default ChangeHistoryTab; 