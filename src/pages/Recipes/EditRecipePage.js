import React from 'react';
import { Container } from '@mui/material';
import { useParams } from 'react-router-dom';
import RecipeForm from '../../components/recipes/RecipeForm';

const EditRecipePage = () => {
  const { id } = useParams();
  
  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <RecipeForm recipeId={id} />
    </Container>
  );
};

export default EditRecipePage; 