// src/pages/Recipes/NewRecipePage.js
import React from 'react';
import { Container } from '@mui/material';
import RecipeForm from '../../components/recipes/RecipeForm';

const NewRecipePage = () => {
  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <RecipeForm />
    </Container>
  );
};

export default NewRecipePage;