import React, { useState, lazy, Suspense } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  CardActions,
  Button,
  Grid,
  Snackbar,
  Alert
} from '@mui/material';
import {
  Assignment as AssignmentIcon,
  FactCheck as FactCheckIcon,
  SwapVert as SwapVertIcon,
  Add as AddIcon
} from '@mui/icons-material';
import { useTheme as useThemeContext } from '../../contexts/ThemeContext';
import { baseColors, palettes } from '../../styles/colorConfig';
import { useTranslation } from '../../hooks/useTranslation';

const CompletedMOFormDialog = lazy(() => import('../production/CompletedMOFormDialog'));
const ProductionControlFormDialog = lazy(() => import('../production/ProductionControlFormDialog'));
const ProductionShiftFormDialog = lazy(() => import('../production/ProductionShiftFormDialog'));

const formCards = [
  {
    id: 'completedMO',
    titleKey: 'productionForms.completedMO.title',
    descKey: 'productionForms.completedMO.description',
    Icon: AssignmentIcon,
    color: palettes.success.main,
    gradient: `linear-gradient(135deg, ${palettes.success.main} 0%, ${palettes.success.dark} 100%)`,
  },
  {
    id: 'productionControl',
    titleKey: 'productionForms.productionControl.title',
    descKey: 'productionForms.productionControl.description',
    Icon: FactCheckIcon,
    color: palettes.primary.main,
    gradient: `linear-gradient(135deg, ${palettes.primary.main} 0%, ${palettes.primary.dark} 100%)`,
  },
  {
    id: 'productionShift',
    titleKey: 'productionForms.productionShift.title',
    descKey: 'productionForms.productionShift.description',
    Icon: SwapVertIcon,
    color: palettes.warning.main,
    gradient: `linear-gradient(135deg, ${palettes.warning.main} 0%, ${palettes.warning.dark} 100%)`,
  },
];

const KioskFormsPanel = () => {
  const { mode } = useThemeContext();
  const { t } = useTranslation('forms');
  const colors = baseColors[mode];

  const [openDialog, setOpenDialog] = useState(null);
  const [snackbar, setSnackbar] = useState({ open: false, message: '' });

  const handleOpen = (formId) => setOpenDialog(formId);
  const handleClose = () => setOpenDialog(null);

  const handleSuccess = () => {
    setOpenDialog(null);
    setSnackbar({ open: true, message: 'Formularz został wysłany pomyślnie!' });
  };

  return (
    <Box>
      <Grid container spacing={3}>
        {formCards.map(({ id, titleKey, descKey, Icon, color, gradient }) => (
          <Grid item xs={12} sm={6} md={4} key={id}>
            <Card
              sx={{
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                borderRadius: 4,
                background: mode === 'dark'
                  ? `linear-gradient(135deg, ${colors.paper} 0%, rgba(255,255,255,0.03) 100%)`
                  : `linear-gradient(135deg, ${colors.paper} 0%, rgba(0,0,0,0.01) 100%)`,
                border: `1px solid ${mode === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`,
                boxShadow: `0 4px 24px ${color}15`,
                transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                '&:hover': {
                  transform: 'translateY(-4px)',
                  boxShadow: `0 8px 32px ${color}25`,
                },
              }}
            >
              <CardContent sx={{ flexGrow: 1, p: 3 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                  <Box
                    sx={{
                      p: 1.5,
                      borderRadius: 3,
                      background: gradient,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      boxShadow: `0 4px 12px ${color}40`,
                    }}
                  >
                    <Icon sx={{ color: 'white', fontSize: 28 }} />
                  </Box>
                  <Typography
                    variant="h6"
                    sx={{
                      fontWeight: 700,
                      color: colors.text.primary,
                      fontSize: '1.1rem',
                      lineHeight: 1.3,
                    }}
                  >
                    {t(titleKey)}
                  </Typography>
                </Box>
                <Typography
                  variant="body2"
                  sx={{ color: colors.text.secondary, lineHeight: 1.6 }}
                >
                  {t(descKey)}
                </Typography>
              </CardContent>
              <CardActions sx={{ p: 3, pt: 0 }}>
                <Button
                  variant="contained"
                  fullWidth
                  size="large"
                  startIcon={<AddIcon />}
                  onClick={() => handleOpen(id)}
                  sx={{
                    background: gradient,
                    borderRadius: 3,
                    fontWeight: 600,
                    py: 1.2,
                    boxShadow: `0 4px 12px ${color}30`,
                    '&:hover': {
                      boxShadow: `0 6px 16px ${color}40`,
                      transform: 'translateY(-1px)',
                    },
                    transition: 'all 0.2s ease-in-out',
                  }}
                >
                  {t('productionForms.fillForm')}
                </Button>
              </CardActions>
            </Card>
          </Grid>
        ))}
      </Grid>

      {openDialog === 'completedMO' && (
        <Suspense fallback={null}>
          <CompletedMOFormDialog
            open
            onClose={handleClose}
            onSuccess={handleSuccess}
          />
        </Suspense>
      )}
      {openDialog === 'productionControl' && (
        <Suspense fallback={null}>
          <ProductionControlFormDialog
            open
            onClose={handleClose}
            onSuccess={handleSuccess}
          />
        </Suspense>
      )}
      {openDialog === 'productionShift' && (
        <Suspense fallback={null}>
          <ProductionShiftFormDialog
            open
            onClose={handleClose}
            onSuccess={handleSuccess}
          />
        </Suspense>
      )}

      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar({ open: false, message: '' })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setSnackbar({ open: false, message: '' })}
          severity="success"
          variant="filled"
          sx={{ width: '100%' }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default KioskFormsPanel;
