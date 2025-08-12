import React, { useState } from 'react';
import { useTranslation } from '../../hooks/useTranslation';
import {
  IconButton,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Tooltip,
  Box,
  Typography
} from '@mui/material';
import {
  Translate as TranslateIcon,
  Language as LanguageIcon
} from '@mui/icons-material';

// Flagi jako emoji dla lepszej dostępności
const languages = [
  {
    code: 'pl',
    name: 'Polski',
    flag: '🇵🇱'
  },
  {
    code: 'en',
    name: 'English',
    flag: '🇬🇧'
  }
];

const LanguageSwitcher = ({ variant = 'icon' }) => {
  const { i18n, t } = useTranslation();
  const [anchorEl, setAnchorEl] = useState(null);
  const open = Boolean(anchorEl);

  const handleClick = (event) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleLanguageChange = (languageCode) => {
    i18n.changeLanguage(languageCode);
    handleClose();
  };

  const currentLanguage = languages.find(lang => lang.code === i18n.language) || languages[0];

  if (variant === 'button') {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center' }}>
        <Tooltip title={t('common.language')}>
          <IconButton
            onClick={handleClick}
            size="small"
            sx={{ ml: 1 }}
            aria-controls={open ? 'language-menu' : undefined}
            aria-haspopup="true"
            aria-expanded={open ? 'true' : undefined}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Typography variant="body2" component="span">
                {currentLanguage.flag}
              </Typography>
              <TranslateIcon fontSize="small" />
            </Box>
          </IconButton>
        </Tooltip>

        <Menu
          id="language-menu"
          anchorEl={anchorEl}
          open={open}
          onClose={handleClose}
          MenuListProps={{
            'aria-labelledby': 'language-button',
          }}
          transformOrigin={{ horizontal: 'right', vertical: 'top' }}
          anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
        >
          {languages.map((language) => (
            <MenuItem
              key={language.code}
              onClick={() => handleLanguageChange(language.code)}
              selected={language.code === i18n.language}
            >
              <ListItemIcon>
                <Typography variant="body1" component="span">
                  {language.flag}
                </Typography>
              </ListItemIcon>
              <ListItemText primary={language.name} />
            </MenuItem>
          ))}
        </Menu>
      </Box>
    );
  }

  // Wariant domyślny - tylko ikona
  return (
    <>
      <Tooltip title={t('common.language')}>
        <IconButton
          onClick={handleClick}
          size="small"
          aria-controls={open ? 'language-menu' : undefined}
          aria-haspopup="true"
          aria-expanded={open ? 'true' : undefined}
        >
          <LanguageIcon />
        </IconButton>
      </Tooltip>

      <Menu
        id="language-menu"
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        MenuListProps={{
          'aria-labelledby': 'language-button',
        }}
        transformOrigin={{ horizontal: 'right', vertical: 'top' }}
        anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
      >
        {languages.map((language) => (
          <MenuItem
            key={language.code}
            onClick={() => handleLanguageChange(language.code)}
            selected={language.code === i18n.language}
          >
            <ListItemIcon>
              <Typography variant="body1" component="span">
                {language.flag}
              </Typography>
            </ListItemIcon>
            <ListItemText primary={language.name} />
          </MenuItem>
        ))}
      </Menu>
    </>
  );
};

export default LanguageSwitcher; 