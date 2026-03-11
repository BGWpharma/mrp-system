import React from 'react';
import { Breadcrumbs as MuiBreadcrumbs, Link, Typography, Box } from '@mui/material';
import { Home as HomeIcon, NavigateNext as NavigateNextIcon } from '@mui/icons-material';
import { Link as RouterLink, useLocation } from 'react-router-dom';
import { useTranslation } from '../../hooks/useTranslation';

const isIdSegment = (segment) => {
  if (segment.length >= 15) return true;
  if (/^[a-zA-Z0-9]{20,}$/.test(segment)) return true;
  return false;
};

const AppBreadcrumbs = () => {
  const location = useLocation();
  const { t } = useTranslation('navigation');
  const pathSegments = location.pathname.split('/').filter(Boolean);

  if (pathSegments.length === 0) return null;

  const getLabel = (segment) => {
    const key = `breadcrumbs.${segment}`;
    const translated = t(key);
    if (translated !== key && translated !== `breadcrumbs.${segment}`) return translated;
    if (isIdSegment(segment)) return t('breadcrumbs.details');
    return segment;
  };

  const crumbs = pathSegments.map((segment, index) => {
    const path = '/' + pathSegments.slice(0, index + 1).join('/');
    const isLast = index === pathSegments.length - 1;
    return { label: getLabel(segment), path, isLast };
  });

  return (
    <Box sx={{ mb: 1.5, mt: -0.5 }}>
      <MuiBreadcrumbs
        separator={<NavigateNextIcon sx={{ fontSize: 16 }} />}
        sx={{
          '& .MuiBreadcrumbs-ol': { flexWrap: 'nowrap' },
          '& .MuiBreadcrumbs-li': { whiteSpace: 'nowrap' },
          fontSize: '0.8125rem',
        }}
      >
        <Link
          component={RouterLink}
          to="/"
          underline="hover"
          color="text.secondary"
          sx={{ display: 'flex', alignItems: 'center', gap: 0.5, fontSize: 'inherit' }}
        >
          <HomeIcon sx={{ fontSize: 16 }} />
          {t('breadcrumbs.home')}
        </Link>
        {crumbs.map((crumb) =>
          crumb.isLast ? (
            <Typography
              key={crumb.path}
              color="text.primary"
              sx={{ fontSize: 'inherit', fontWeight: 500 }}
            >
              {crumb.label}
            </Typography>
          ) : (
            <Link
              key={crumb.path}
              component={RouterLink}
              to={crumb.path}
              underline="hover"
              color="text.secondary"
              sx={{ fontSize: 'inherit' }}
            >
              {crumb.label}
            </Link>
          )
        )}
      </MuiBreadcrumbs>
    </Box>
  );
};

export default AppBreadcrumbs;
