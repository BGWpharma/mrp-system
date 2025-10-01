// Wspólne style dla formularzy produkcyjnych i magazynowych
// z obsługą jasnego i ciemnego motywu

export const getFormHeaderStyles = (theme, isEditMode = false) => ({
  mb: { xs: 2, sm: 3 },
  p: { xs: 2, sm: 3 },
  borderRadius: 2,
  background: theme.palette.mode === 'dark' 
    ? isEditMode
      ? 'linear-gradient(135deg, rgba(255,152,0,0.15) 0%, rgba(255,193,7,0.1) 100%)'
      : 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(76,175,80,0.1) 100%)'
    : isEditMode
      ? 'linear-gradient(135deg, #fff3e0 0%, #ffe0b2 100%)'
      : 'linear-gradient(135deg, #f5f5f5 0%, #e8f5e8 100%)',
  border: '1px solid',
  borderColor: isEditMode ? 'warning.light' : 'divider',
  boxShadow: theme.palette.mode === 'dark'
    ? '0 2px 8px rgba(0,0,0,0.3)'
    : '0 2px 8px rgba(0,0,0,0.08)'
});

export const getFormSectionStyles = (theme, color = 'primary') => {
  const colorMap = {
    primary: {
      dark: 'linear-gradient(45deg, rgba(33,150,243,0.12) 30%, rgba(156,39,176,0.12) 90%)',
      light: 'linear-gradient(45deg, #e3f2fd 30%, #f3e5f5 90%)'
    },
    warning: {
      dark: 'linear-gradient(45deg, rgba(255,152,0,0.12) 30%, rgba(76,175,80,0.12) 90%)',
      light: 'linear-gradient(45deg, #fff3e0 30%, #e8f5e8 90%)'
    },
    success: {
      dark: 'linear-gradient(45deg, rgba(156,39,176,0.12) 30%, rgba(76,175,80,0.12) 90%)',
      light: 'linear-gradient(45deg, #f3e5f5 30%, #e8f5e8 90%)'
    },
    info: {
      dark: 'linear-gradient(45deg, rgba(33,150,243,0.12) 30%, rgba(0,188,212,0.12) 90%)',
      light: 'linear-gradient(45deg, #e3f2fd 30%, #e0f7fa 90%)'
    }
  };

  return {
    mt: 2,
    mb: 2,
    p: 2,
    borderRadius: 2,
    background: theme.palette.mode === 'dark'
      ? colorMap[color].dark
      : colorMap[color].light,
    border: '1px solid',
    borderColor: `${color}.light`,
    transition: 'all 0.3s ease',
    '&:hover': {
      boxShadow: theme.palette.mode === 'dark'
        ? '0 4px 12px rgba(0,0,0,0.3)'
        : '0 4px 12px rgba(0,0,0,0.1)'
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
  background: theme.palette.mode === 'dark'
    ? theme.palette.background.paper
    : '#ffffff'
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
    transform: 'translateY(-2px)',
    transition: 'all 0.3s ease'
  }
});

export const getFormFieldStyles = () => ({
  '& .MuiOutlinedInput-root': {
    borderRadius: 2,
    transition: 'all 0.3s ease',
    '&:hover': {
      boxShadow: '0 2px 8px rgba(0,0,0,0.08)'
    },
    '&.Mui-focused': {
      boxShadow: '0 4px 12px rgba(0,0,0,0.12)'
    }
  }
});

export const getInfoCardStyles = (theme, severity = 'info') => ({
  mb: 3,
  borderRadius: 2,
  boxShadow: theme.palette.mode === 'dark'
    ? '0 2px 8px rgba(0,0,0,0.3)'
    : '0 2px 8px rgba(0,0,0,0.08)',
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

