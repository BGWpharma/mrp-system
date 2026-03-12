import React from 'react';
import { Chip, Tooltip } from '@mui/material';
import { InventoryOutlined as ArchiveFilterIcon } from '@mui/icons-material';
import { useTranslation } from '../../hooks/useTranslation';

const ArchiveFilterChip = ({ showArchived, onToggle, count, sx }) => {
  const { t } = useTranslation();

  const tooltipTitle = showArchived
    ? t('common:common.hideArchived')
    : t('common:common.showArchived');

  return (
    <Tooltip title={tooltipTitle} arrow>
      <Chip
        icon={<ArchiveFilterIcon sx={{ fontSize: '1.1rem' }} />}
        label={count != null ? count : (showArchived ? t('common:common.hideArchived') : t('common:common.showArchived'))}
        onClick={onToggle}
        color={showArchived ? 'warning' : 'default'}
        variant={showArchived ? 'filled' : 'outlined'}
        size="small"
        sx={{
          cursor: 'pointer',
          transition: 'all 0.2s ease',
          ...(!showArchived && {
            borderColor: 'divider',
            color: 'text.secondary',
          }),
          ...sx,
        }}
      />
    </Tooltip>
  );
};

export default ArchiveFilterChip;
