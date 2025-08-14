import React, { memo } from 'react';
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
import { useTranslation } from '../../hooks/useTranslation';

const ChangeHistoryTab = ({ task, getUserName }) => {
  const { t } = useTranslation('taskDetails');
  return (
    <Grid container spacing={3}>
      {task.statusHistory && task.statusHistory.length > 0 && (
        <Grid item xs={12}>
          <Paper sx={{ p: 3 }}>
            <Accordion defaultExpanded>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography variant="h6" component="h2">
                  {t('sections.changeHistory')} ({task.statusHistory.length})
                </Typography>
              </AccordionSummary>
              <AccordionDetails>
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>{t('changeHistory.table.dateTime')}</TableCell>
                        <TableCell>{t('changeHistory.table.previousStatus')}</TableCell>
                        <TableCell>{t('changeHistory.table.newStatus')}</TableCell>
                        <TableCell>{t('changeHistory.table.changedBy')}</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {[...task.statusHistory].reverse().map((change, index) => (
                        <TableRow key={index}>
                          <TableCell>
                            {change.changedAt 
                              ? new Date(change.changedAt).toLocaleString('pl') 
                              : t('changeHistory.table.noDate')}
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
              {t('changeHistory.title')}
            </Typography>
            <Typography variant="body2" color="text.secondary" align="center">
              {t('changeHistory.noHistory')}
            </Typography>
          </Paper>
        </Grid>
      )}
    </Grid>
  );
};

export default memo(ChangeHistoryTab); 