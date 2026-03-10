import React from 'react';
import { TableBody, TableRow, TableCell, Skeleton, Box } from '@mui/material';

const WIDTHS = [75, 60, 85, 70, 90, 65, 80];

const TableSkeleton = React.memo(({ columns = 5, rows = 5, hasActions = true }) => (
  <TableBody>
    {Array.from({ length: rows }).map((_, rowIndex) => (
      <TableRow key={rowIndex}>
        {Array.from({ length: columns }).map((_, colIndex) => (
          <TableCell key={colIndex}>
            <Skeleton variant="text" width={`${WIDTHS[colIndex % WIDTHS.length]}%`} height={24} />
          </TableCell>
        ))}
        {hasActions && (
          <TableCell>
            <Box sx={{ display: 'flex', gap: 0.5 }}>
              <Skeleton variant="circular" width={24} height={24} />
              <Skeleton variant="circular" width={24} height={24} />
            </Box>
          </TableCell>
        )}
      </TableRow>
    ))}
  </TableBody>
));

TableSkeleton.displayName = 'TableSkeleton';

export default TableSkeleton;
