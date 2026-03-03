/**
 * Products module - barrel file
 * Re-exports all product/recipe/pricing-related services
 */

// productService.js
export {
  getAllProducts,
  addProduct,
  updateProduct,
  deleteProduct,
  getDefaultProducts,
  importDefaultProductsToDatabase
} from './productService';

// recipeService.js
export {
  sortIngredientsByQuantity,
  getAllRecipes,
  getActiveRecipesMinimal,
  getRecipesWithPagination,
  getRecipesByCustomer,
  getRecipeById,
  getRecipesContainingIngredient,
  createRecipe,
  updateRecipe,
  getRecipeVersions,
  getRecipeVersion,
  deleteRecipe,
  restoreRecipeVersion,
  fixRecipeYield,
  refreshRecipesCache,
  syncAllRecipesCAS,
  uploadRecipeDesignAttachment,
  deleteRecipeDesignAttachment,
  getRecipeDesignAttachmentsByVersion,
  uploadRecipeRulesAttachment,
  deleteRecipeRulesAttachment,
  getRecipeRulesAttachmentsByVersion
} from './recipeService';

// recipeExportService.js
export {
  exportRecipesToCSV,
  exportRecipesWithSuppliers
} from './recipeExportService';

// nutritionalComponentsService.js
export {
  getNutritionalComponents,
  getNutritionalComponentsByCategory,
  addNutritionalComponent,
  updateNutritionalComponent,
  deleteNutritionalComponent,
  setNutritionalComponentWithId,
  checkComponentExists
} from './nutritionalComponentsService';
export { default as nutritionalComponentsService } from './nutritionalComponentsService';

// priceListService.js
export {
  getAllPriceLists,
  getPriceListById,
  createPriceList,
  updatePriceList,
  deletePriceList,
  getPriceListItems,
  addPriceListItem,
  updatePriceListItem,
  deletePriceListItem,
  getPriceListsByCustomerId,
  DEFAULT_PRICE_LIST,
  DEFAULT_PRICE_LIST_ITEM,
  getActivePriceListsByCustomer,
  getPriceForCustomerProduct,
  getPriceListItemForCustomerProduct,
  getPriceListsContainingRecipe,
  exportPriceListToCSV,
  updateProductNameInPriceLists
} from './priceListService';

// priceListImportService.js
export {
  parsePriceListCSV,
  validatePriceListItems,
  matchProductsWithDatabase,
  previewPriceListImport,
  executePriceListImport,
  generatePriceListTemplate
} from './priceListImportService';

// quotationService.js
export {
  convertToGrams,
  calculateTotalWeight,
  DEFAULT_COST_PER_MINUTE,
  LABOR_MATRIX_BY_FORMAT,
  PACK_WEIGHT_OPTIONS,
  getAutoPackWeight,
  getLaborParamsByFormat,
  calculateLaborCostByFormat,
  calculateLaborTime,
  getRawMaterials,
  getPackagingItems,
  getCurrentCostPerMinute,
  calculateQuotation,
  saveQuotation,
  updateQuotation,
  deleteQuotation,
  getQuotationById,
  getAllQuotations,
  searchRecipesForQuotation,
  getRecipeForQuotation
} from './quotationService';
export { default as quotationService } from './quotationService';
