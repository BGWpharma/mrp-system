import React from 'react';
import {
  Box,
  Button,
  TextField,
  Typography,
  Paper,
  Chip,
  FormControlLabel,
  Checkbox,
  FormGroup,
} from '@mui/material';
import {
  Add as AddIcon,
  Science as ScienceIcon,
} from '@mui/icons-material';

const RecipeCertificationsSection = React.forwardRef(({
  recipeData,
  newCustomCert,
  setNewCustomCert,
  handleCertificationChange,
  handleAddCustomCert,
  handleRemoveCustomCert,
  t
}, ref) => {
  return (
    <Paper 
      ref={ref}
      elevation={3} 
      sx={{ 
        p: 0, 
        mb: 3, 
        borderRadius: '12px', 
        overflow: 'hidden' 
      }}
    >
      <Box 
        sx={{ 
          p: 2, 
          display: 'flex', 
          alignItems: 'center', 
          gap: 1,
          borderBottom: '1px solid',
          borderColor: 'divider',
          bgcolor: 'action.hover'
        }}
      >
        <ScienceIcon color="primary" />
        <Typography variant="h6" fontWeight="500">{t('recipes.certifications.title')}</Typography>
      </Box>
      
      <Box sx={{ p: 3 }}>
        <FormGroup row sx={{ gap: 3 }}>
          <FormControlLabel
            control={
              <Checkbox
                checked={recipeData.certifications?.halal || false}
                onChange={handleCertificationChange('halal')}
                color="primary"
              />
            }
            label={t('recipes.certifications.halal')}
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={recipeData.certifications?.eco || false}
                onChange={handleCertificationChange('eco')}
                color="primary"
              />
            }
            label={t('recipes.certifications.eco')}
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={recipeData.certifications?.vege || false}
                onChange={handleCertificationChange('vege')}
                color="primary"
              />
            }
            label={t('recipes.certifications.vege')}
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={recipeData.certifications?.vegan || false}
                onChange={handleCertificationChange('vegan')}
                color="primary"
              />
            }
            label={t('recipes.certifications.vegan')}
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={recipeData.certifications?.kosher || false}
                onChange={handleCertificationChange('kosher')}
                color="primary"
              />
            }
            label={t('recipes.certifications.kosher')}
          />
        </FormGroup>

        {(recipeData.certifications?.custom || []).length > 0 && (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 2, mb: 1 }}>
            {recipeData.certifications.custom.map((cert) => (
              <Chip
                key={cert}
                label={cert}
                color="primary"
                variant="outlined"
                onDelete={() => handleRemoveCustomCert(cert)}
              />
            ))}
          </Box>
        )}

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 2 }}>
          <TextField
            size="small"
            value={newCustomCert}
            onChange={(e) => setNewCustomCert(e.target.value)}
            placeholder={t('recipes.certifications.customPlaceholder')}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAddCustomCert();
              }
            }}
            sx={{ minWidth: 280 }}
          />
          <Button
            variant="outlined"
            size="small"
            startIcon={<AddIcon />}
            onClick={handleAddCustomCert}
            disabled={!newCustomCert.trim()}
            sx={{ borderRadius: '20px', whiteSpace: 'nowrap' }}
          >
            {t('recipes.certifications.addCustom')}
          </Button>
        </Box>
      </Box>
    </Paper>
  );
});

RecipeCertificationsSection.displayName = 'RecipeCertificationsSection';

export default RecipeCertificationsSection;
