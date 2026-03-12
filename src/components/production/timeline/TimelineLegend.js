import React from 'react';
import { Box, Typography, Chip } from '@mui/material';

const TimelineLegend = React.memo(({
  useWorkstationColors, workstations, getWorkstationColor,
  isMobile, t
}) => (
  <Box
    className="timeline-legend-container"
    sx={{
      display: { xs: 'none', sm: 'block' },
      '&.mobile-legend': { display: 'block' }
    }}
  >
    <Box sx={{
      display: 'flex',
      flexWrap: 'wrap',
      gap: { xs: 0.5, md: 1 },
      alignItems: 'center'
    }}>
      <Typography
        className="timeline-legend-title"
        variant="caption"
        sx={{ fontSize: { xs: '0.7rem', md: '0.75rem' } }}
      >
        {t('production.timeline.legend')}
      </Typography>

      {useWorkstationColors ? (
        workstations.map(workstation => (
          <Chip
            key={workstation.id}
            className="timeline-legend-chip"
            size="small"
            label={isMobile ? workstation.name.substring(0, 10) + (workstation.name.length > 10 ? '...' : '') : workstation.name}
            sx={{
              bgcolor: workstation.color || getWorkstationColor(workstation.id),
              color: 'white',
              height: { xs: 20, md: 24 },
              fontSize: { xs: '0.6rem', md: '0.7rem' },
              '& .MuiChip-label': { px: { xs: 0.75, md: 1 } }
            }}
          />
        ))
      ) : (
        <>
          <Chip className="timeline-legend-chip status-scheduled" size="small" label={t('production.timeline.statuses.scheduled')} />
          <Chip className="timeline-legend-chip status-inprogress" size="small" label={t('production.timeline.statuses.inProgress')} />
          <Chip className="timeline-legend-chip status-completed" size="small" label={t('production.timeline.statuses.completed')} />
          <Chip className="timeline-legend-chip status-cancelled" size="small" label={t('production.timeline.statuses.cancelled')} />
          <Chip className="timeline-legend-chip status-onhold" size="small" label={t('production.timeline.statuses.onHold')} />
        </>
      )}
    </Box>
  </Box>
));

export default TimelineLegend;
