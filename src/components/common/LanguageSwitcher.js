import React, { useState } from 'react';
import { useTranslation } from '../../hooks/useTranslation';
import { useNotification } from '../../hooks/useNotification';
import {
  IconButton,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Tooltip,
  Box,
  Typography,
  CircularProgress
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
  const { i18n, t } = useTranslation('common');
  const { showSuccess, showError } = useNotification();
  const [anchorEl, setAnchorEl] = useState(null);
  const [isChanging, setIsChanging] = useState(false);
  const open = Boolean(anchorEl);

  const handleClick = (event) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleLanguageChange = async (languageCode) => {
    // Nie zmieniaj jeśli to już aktualny język
    if (languageCode === i18n.language) {
      handleClose();
      return;
    }

    setIsChanging(true);
    
    try {
      await i18n.changeLanguage(languageCode);
      
      // Sprawdź czy zmiana się powiodła
      if (i18n.language === languageCode) {
        const languageName = languages.find(lang => lang.code === languageCode)?.name || languageCode;
        showSuccess(`Język zmieniony na: ${languageName}`);
      } else {
        throw new Error('Language change failed - language not updated');
      }
    } catch (error) {
      console.error('[LanguageSwitcher] Błąd zmiany języka:', error);
      showError('Nie udało się zmienić języka. Spróbuj ponownie.');
      
      // Spróbuj przywrócić do domyślnego języka
      try {
        await i18n.changeLanguage('pl');
      } catch (fallbackError) {
        console.error('[LanguageSwitcher] Błąd przywracania języka domyślnego:', fallbackError);
      }
    } finally {
      setIsChanging(false);
      handleClose();
    }
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
            disabled={isChanging}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              {isChanging ? (
                <CircularProgress size={16} />
              ) : (
                <>
                  <Typography variant="body2" component="span">
                    {currentLanguage.flag}
                  </Typography>
                  <TranslateIcon fontSize="small" />
                </>
              )}
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
              disabled={isChanging}
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
          disabled={isChanging}
        >
          {isChanging ? <CircularProgress size={20} /> : <LanguageIcon />}
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