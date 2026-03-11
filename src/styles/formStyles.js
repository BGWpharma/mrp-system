import { alpha } from '@mui/material/styles';

export const getFormHeaderStyles = (theme, isEditMode = false) => ({
  mb: { xs: 2, sm: 3 },
  p: { xs: 2, sm: 3 },
  borderRadius: 2,
  background: theme.palette.mode === 'dark'
    ? alpha(isEditMode ? theme.palette.warning.main : theme.palette.success.main, 0.06)
    : alpha(isEditMode ? theme.palette.warning.main : theme.palette.success.main, 0.04),
  border: '1px solid',
  borderColor: isEditMode
    ? alpha(theme.palette.warning.main, 0.3)
    : theme.palette.divider,
  boxShadow: theme.palette.mode === 'dark'
    ? '0 2px 8px rgba(0,0,0,0.3)'
    : '0 2px 8px rgba(0,0,0,0.06)'
});

export const getFormSectionStyles = (theme, color = 'primary') => {
  const paletteColor = theme.palette[color]?.main || theme.palette.primary.main;

  return {
    mt: 2,
    mb: 2,
    p: 2,
    borderRadius: 2,
    background: alpha(paletteColor, theme.palette.mode === 'dark' ? 0.06 : 0.03),
    border: '1px solid',
    borderColor: alpha(paletteColor, theme.palette.mode === 'dark' ? 0.15 : 0.12),
    transition: 'box-shadow 0.15s ease',
    '&:hover': {
      boxShadow: theme.palette.mode === 'dark'
        ? `0 2px 8px ${alpha(paletteColor, 0.15)}`
        : `0 2px 8px ${alpha(paletteColor, 0.1)}`
    }
  };
};

export const getFormContainerStyles = () => ({
  mt: { xs: 2, sm: 4 },
  mb: { xs: 2, sm: 4 },
  px: { xs: 1, sm: 3 }
});

export const getFormPaperStyles = (theme) => ({
  p: { xs: 2, sm: 4 },
  borderRadius: { xs: 2, sm: 3 },
  boxShadow: theme.palette.mode === 'dark'
    ? '0 8px 32px rgba(0,0,0,0.4)'
    : '0 8px 32px rgba(0,0,0,0.12)',
  background: theme.palette.background.paper
});

export const getFormButtonStyles = (variant = 'contained') => ({
  px: { xs: 2, sm: 3 },
  py: { xs: 1, sm: 1.25 },
  fontWeight: 600,
  borderRadius: 2,
  textTransform: 'none',
  fontSize: { xs: '0.875rem', sm: '1rem' },
  boxShadow: variant === 'contained' ? 3 : 0,
  '&:hover': {
    boxShadow: variant === 'contained' ? 6 : 0,
    transition: 'box-shadow 0.15s ease'
  }
});

export const getFormFieldStyles = () => ({
  '& .MuiOutlinedInput-root': {
    borderRadius: 2,
    transition: 'box-shadow 0.15s ease',
    '&:hover': {
      boxShadow: '0 2px 8px rgba(0,0,0,0.06)'
    },
    '&.Mui-focused': {
      boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
    }
  }
});

export const getInfoCardStyles = (theme, severity = 'info') => ({
  mb: 3,
  borderRadius: 2,
  boxShadow: theme.palette.mode === 'dark'
    ? '0 2px 8px rgba(0,0,0,0.3)'
    : '0 2px 8px rgba(0,0,0,0.06)',
  '& .MuiAlert-message': {
    fontSize: { xs: '0.75rem', sm: '0.875rem' }
  }
});

export const getFormActionsStyles = () => ({
  display: 'flex',
  gap: 2,
  justifyContent: 'flex-end',
  mt: 3,
  pt: 3,
  borderTop: '1px solid',
  borderColor: 'divider'
});

export const getSectionHeaderStyles = (theme, icon = null) => ({
  display: 'flex',
  alignItems: 'center',
  gap: 1,
  color: 'primary.main',
  fontWeight: 'bold',
  fontSize: { xs: '1rem', sm: '1.1rem' },
  '& .section-icon': {
    fontSize: { xs: '1.25rem', sm: '1.5rem' }
  }
});
