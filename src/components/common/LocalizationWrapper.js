// src/components/common/LocalizationWrapper.js
import React from 'react';
import { LocalizationProvider } from '@mui/x-date-pickers';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { pl, enUS } from 'date-fns/locale';
import { useTranslation } from '../../hooks/useTranslation';

/**
 * Wrapper dla LocalizationProvider który dynamicznie zmienia locale
 * w zależności od wybranego języka w aplikacji
 */
const LocalizationWrapper = ({ children }) => {
  const { currentLanguage } = useTranslation();
  
  // Wybierz odpowiedni locale na podstawie języka
  const locale = currentLanguage === 'en' ? enUS : pl;
  
  return (
    <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locale}>
      {children}
    </LocalizationProvider>
  );
};

export default LocalizationWrapper;

