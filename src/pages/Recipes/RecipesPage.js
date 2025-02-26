// src/pages/Recipes/RecipesPage.js
import React from 'react';
import { Container } from '@mui/material';
import RecipeList from '../../components/recipes/RecipeList';

const RecipesPage = () => {
  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <RecipeList />
    </Container>
  );
};

export default RecipesPage;