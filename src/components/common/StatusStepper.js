import React from 'react';
import { Stepper, Step, StepLabel, StepConnector, Box } from '@mui/material';
import { styled } from '@mui/material/styles';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import RadioButtonCheckedIcon from '@mui/icons-material/RadioButtonChecked';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import { getStatusKeyFromLabel, statusColors } from '../../styles/colorConfig';

const StyledConnector = styled(StepConnector)(({ theme }) => ({
  '& .MuiStepConnector-line': {
    borderTopWidth: 2,
    borderColor: theme.palette.divider,
  },
  '&.Mui-active .MuiStepConnector-line': {
    borderColor: theme.palette.primary.main,
  },
  '&.Mui-completed .MuiStepConnector-line': {
    borderColor: theme.palette.success.main,
  },
  '&.cancelled .MuiStepConnector-line': {
    borderColor: theme.palette.error.main,
    borderStyle: 'dashed',
  },
}));

const StepIcon = ({ completed, active, cancelled, statusLabel }) => {
  if (cancelled) {
    return <CancelIcon sx={{ color: 'error.main', fontSize: 24 }} />;
  }
  if (completed) {
    return <CheckCircleIcon sx={{ color: 'success.main', fontSize: 24 }} />;
  }
  if (active) {
    const key = getStatusKeyFromLabel(statusLabel);
    const color = statusColors[key]?.main || '#3b82f6';
    return <RadioButtonCheckedIcon sx={{ color, fontSize: 24 }} />;
  }
  return <RadioButtonUncheckedIcon sx={{ color: 'text.disabled', fontSize: 24 }} />;
};

const StatusStepper = ({
  steps = [],
  currentStatus,
  cancelledStatus,
  isCancelled = false,
  compact = false,
}) => {
  const currentIndex = steps.indexOf(currentStatus);

  return (
    <Box sx={{ width: '100%', py: 1.5 }}>
      <Stepper
        activeStep={isCancelled ? steps.length : currentIndex}
        alternativeLabel={!compact}
        connector={<StyledConnector className={isCancelled ? 'cancelled' : ''} />}
      >
        {steps.map((step, index) => {
          const isCompleted = !isCancelled && index < currentIndex;
          const isActive = !isCancelled && index === currentIndex;

          return (
            <Step key={step} completed={isCompleted}>
              <StepLabel
                StepIconComponent={() => (
                  <StepIcon
                    completed={isCompleted}
                    active={isActive}
                    cancelled={false}
                    statusLabel={step}
                  />
                )}
                sx={{
                  '& .MuiStepLabel-label': {
                    fontSize: compact ? '0.7rem' : '0.75rem',
                    fontWeight: isActive ? 600 : 400,
                    color: isActive ? 'text.primary' : isCompleted ? 'success.main' : 'text.secondary',
                    mt: compact ? 0 : 0.5,
                    display: compact ? 'none' : 'block',
                  },
                }}
              >
                {step}
              </StepLabel>
            </Step>
          );
        })}
        {isCancelled && (
          <Step>
            <StepLabel
              StepIconComponent={() => (
                <StepIcon cancelled statusLabel={cancelledStatus} />
              )}
              sx={{
                '& .MuiStepLabel-label': {
                  fontSize: compact ? '0.7rem' : '0.75rem',
                  fontWeight: 600,
                  color: 'error.main',
                  mt: compact ? 0 : 0.5,
                  display: compact ? 'none' : 'block',
                },
              }}
            >
              {cancelledStatus}
            </StepLabel>
          </Step>
        )}
      </Stepper>
    </Box>
  );
};

export default StatusStepper;
