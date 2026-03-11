import React from 'react';
import { Fade, Box } from '@mui/material';

const PageTransition = ({ children }) => {
  return (
    <Fade in timeout={300}>
      <Box>{children}</Box>
    </Fade>
  );
};

export default PageTransition;
