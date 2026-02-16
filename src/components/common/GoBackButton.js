import React from 'react';
import { useNavigate } from 'react-router-dom';
import { IconButton, Tooltip } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useTranslation } from '../../hooks/useTranslation';

const GoBackButton = () => {
  const navigate = useNavigate();
  const { t } = useTranslation('common');

  const handleGoBack = () => {
    navigate(-1);
  };

  return (
    <Tooltip title={t('common.goBack')}>
      <IconButton onClick={handleGoBack} sx={{ mr: 2 }}>
        <ArrowBackIcon />
      </IconButton>
    </Tooltip>
  );
};

export default GoBackButton; 