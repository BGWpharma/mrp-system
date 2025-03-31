import React from 'react';
import { useNavigate } from 'react-router-dom';
import { IconButton, Tooltip } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';

const GoBackButton = () => {
  const navigate = useNavigate();

  const handleGoBack = () => {
    navigate(-1);
  };

  return (
    <Tooltip title="Powrót">
      <IconButton onClick={handleGoBack} sx={{ mr: 2 }}>
        <ArrowBackIcon />
      </IconButton>
    </Tooltip>
  );
};

export default GoBackButton; 