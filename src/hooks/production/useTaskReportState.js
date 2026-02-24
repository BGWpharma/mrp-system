import { useState } from 'react';

export const useTaskReportState = () => {
  const [companyData, setCompanyData] = useState(null);
  const [workstationData, setWorkstationData] = useState(null);
  const [selectedAllergens, setSelectedAllergens] = useState([]);
  const [fixingRecipeData, setFixingRecipeData] = useState(false);
  const [syncingNamesWithRecipe, setSyncingNamesWithRecipe] = useState(false);
  const [generatingPDF, setGeneratingPDF] = useState(false);

  return {
    companyData,
    workstationData,
    selectedAllergens,
    fixingRecipeData,
    syncingNamesWithRecipe,
    generatingPDF,
    setCompanyData,
    setWorkstationData,
    setSelectedAllergens,
    setFixingRecipeData,
    setSyncingNamesWithRecipe,
    setGeneratingPDF,
  };
};
