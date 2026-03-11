import React, { useState, useEffect, useCallback } from 'react';
import { Box, Typography, useMediaQuery } from '@mui/material';
import { useTheme as useMuiTheme, alpha } from '@mui/material/styles';

const FormSectionNav = ({ sections = [], containerRef }) => {
  const theme = useMuiTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [activeIndex, setActiveIndex] = useState(0);

  const handleIntersect = useCallback((entries) => {
    const visible = entries
      .filter((e) => e.isIntersecting)
      .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
    if (visible.length > 0) {
      const idx = sections.findIndex((s) => s.ref?.current === visible[0].target);
      if (idx >= 0) setActiveIndex(idx);
    }
  }, [sections]);

  useEffect(() => {
    const refs = sections.map((s) => s.ref?.current).filter(Boolean);
    if (refs.length === 0) return;

    const observer = new IntersectionObserver(handleIntersect, {
      rootMargin: '-20% 0px -60% 0px',
      threshold: 0.1,
    });

    refs.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [sections, handleIntersect]);

  const scrollTo = (index) => {
    const ref = sections[index]?.ref?.current;
    if (ref) {
      ref.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setActiveIndex(index);
    }
  };

  if (sections.length === 0) return null;

  if (isMobile) {
    return (
      <Box
        sx={{
          display: 'flex',
          gap: 0.5,
          overflowX: 'auto',
          py: 1,
          px: 1,
          mb: 2,
          bgcolor: 'background.paper',
          borderRadius: 2,
          border: '1px solid',
          borderColor: 'divider',
          position: 'sticky',
          top: 64,
          zIndex: 10,
          '&::-webkit-scrollbar': { height: 0 },
        }}
      >
        {sections.map((section, i) => (
          <Box
            key={i}
            onClick={() => scrollTo(i)}
            sx={{
              px: 1.5,
              py: 0.75,
              borderRadius: 1,
              whiteSpace: 'nowrap',
              cursor: 'pointer',
              fontSize: '0.75rem',
              fontWeight: i === activeIndex ? 600 : 400,
              color: i === activeIndex ? 'primary.main' : 'text.secondary',
              bgcolor: i === activeIndex ? alpha(theme.palette.primary.main, 0.08) : 'transparent',
              transition: 'all 0.15s ease',
              '&:hover': {
                bgcolor: alpha(theme.palette.primary.main, 0.04),
              },
            }}
          >
            {section.label}
          </Box>
        ))}
      </Box>
    );
  }

  return (
    <Box
      sx={{
        position: 'sticky',
        top: 80,
        width: 180,
        flexShrink: 0,
        alignSelf: 'flex-start',
        mr: 3,
        display: { xs: 'none', md: 'block' },
      }}
    >
      <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', mb: 1, display: 'block', px: 1.5 }}>
        Sekcje
      </Typography>
      {sections.map((section, i) => {
        const isActive = i === activeIndex;
        const isPast = i < activeIndex;
        return (
          <Box
            key={i}
            onClick={() => scrollTo(i)}
            sx={{
              py: 0.75,
              px: 1.5,
              cursor: 'pointer',
              borderLeft: '2px solid',
              borderColor: isActive ? 'primary.main' : 'transparent',
              color: isActive ? 'primary.main' : isPast ? 'text.primary' : 'text.secondary',
              fontWeight: isActive ? 600 : 400,
              fontSize: '0.8125rem',
              transition: 'all 0.15s ease',
              borderRadius: '0 4px 4px 0',
              '&:hover': {
                color: 'primary.main',
                bgcolor: alpha(theme.palette.primary.main, 0.04),
              },
            }}
          >
            {section.icon && (
              <Box component="span" sx={{ mr: 1, verticalAlign: 'middle', fontSize: 16 }}>
                {section.icon}
              </Box>
            )}
            {section.label}
          </Box>
        );
      })}
    </Box>
  );
};

export default FormSectionNav;
