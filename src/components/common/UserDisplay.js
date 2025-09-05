// src/components/common/UserDisplay.js
import React from 'react';
import { 
  Chip, 
  Box, 
  Avatar, 
  Typography, 
  Tooltip,
  CircularProgress 
} from '@mui/material';
import { Person as PersonIcon } from '@mui/icons-material';

/**
 * Komponent do spójnego wyświetlania nazw użytkowników w aplikacji
 * Automatycznie obsługuje fallbacki i różne warianty wyświetlania
 */
const UserDisplay = ({ 
  userId, 
  userName, 
  variant = 'text', // 'text', 'chip', 'avatar', 'minimal'
  showFallback = true,
  loading = false,
  size = 'medium', // 'small', 'medium', 'large'
  color = 'default',
  onClick = null,
  tooltip = null,
  ...props 
}) => {
  // Określ nazwę do wyświetlenia
  const getDisplayName = () => {
    if (userName) return userName;
    if (userId) {
      // Jeśli userId jest długie (prawdopodobnie Firebase UID), pokaż skróconą wersję
      if (userId.length > 10) {
        return `${userId.substring(0, 5)}...${userId.substring(userId.length - 4)}`;
      }
      return userId;
    }
    return showFallback ? 'System' : '';
  };

  const displayName = getDisplayName();
  
  if (!displayName && !loading) return null;

  // Określ rozmiary na podstawie prop size
  const getSizes = () => {
    switch (size) {
      case 'small':
        return {
          avatar: { width: 20, height: 20 },
          typography: 'caption',
          chip: 'small',
          icon: 'small'
        };
      case 'large':
        return {
          avatar: { width: 32, height: 32 },
          typography: 'body1',
          chip: 'medium',
          icon: 'medium'
        };
      default: // medium
        return {
          avatar: { width: 24, height: 24 },
          typography: 'body2',
          chip: 'small',
          icon: 'small'
        };
    }
  };

  const sizes = getSizes();

  // Komponent z loading
  if (loading) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <CircularProgress size={16} />
        <Typography variant={sizes.typography} color="text.secondary">
          Ładowanie...
        </Typography>
      </Box>
    );
  }

  // Wariant chip
  if (variant === 'chip') {
    const chipElement = (
      <Chip 
        icon={<PersonIcon />}
        label={displayName}
        size={sizes.chip}
        variant="outlined"
        color={color}
        clickable={!!onClick}
        onClick={onClick}
        sx={{ cursor: onClick ? 'pointer' : 'default' }}
        {...props}
      />
    );

    return tooltip ? (
      <Tooltip title={tooltip} arrow>
        {chipElement}
      </Tooltip>
    ) : chipElement;
  }
  
  // Wariant avatar
  if (variant === 'avatar') {
    const avatarElement = (
      <Box 
        sx={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: 1,
          cursor: onClick ? 'pointer' : 'default'
        }}
        onClick={onClick}
        {...props}
      >
        <Avatar sx={sizes.avatar}>
          <PersonIcon fontSize={sizes.icon} />
        </Avatar>
        <Typography variant={sizes.typography}>{displayName}</Typography>
      </Box>
    );

    return tooltip ? (
      <Tooltip title={tooltip} arrow>
        {avatarElement}
      </Tooltip>
    ) : avatarElement;
  }

  // Wariant minimal (tylko ikona z tooltip)
  if (variant === 'minimal') {
    return (
      <Tooltip title={displayName} arrow>
        <PersonIcon 
          fontSize={sizes.icon} 
          color="action"
          sx={{ cursor: onClick ? 'pointer' : 'default' }}
          onClick={onClick}
          {...props}
        />
      </Tooltip>
    );
  }
  
  // Wariant text (domyślny)
  const textElement = (
    <Typography 
      variant={sizes.typography}
      sx={{ 
        cursor: onClick ? 'pointer' : 'default',
        '&:hover': onClick ? { textDecoration: 'underline' } : {}
      }}
      onClick={onClick}
      {...props}
    >
      {displayName}
    </Typography>
  );

  return tooltip ? (
    <Tooltip title={tooltip} arrow>
      {textElement}
    </Tooltip>
  ) : textElement;
};

export default UserDisplay;
