/**
 * Hook do zarządzania stanem załączników w TaskDetailsPage
 * 
 * Konsoliduje stany:
 * - ingredientAttachments
 * - ingredientBatchAttachments
 * - clinicalAttachments
 * - additionalAttachments
 * - uploadingClinical
 * - uploadingAdditional
 * - loadingReportAttachments
 * - refreshingBatchAttachments
 */

import { useState, useCallback } from 'react';

export const useAttachmentsState = () => {
  // Skonsolidowany stan
  const [attachmentsState, setAttachmentsState] = useState({
    // Załączniki składników
    ingredient: {},
    ingredientBatch: {},
    
    // Załączniki kliniczne
    clinical: [],
    uploadingClinical: false,
    
    // Załączniki dodatkowe
    additional: [],
    uploadingAdditional: false,
    
    // Stany ładowania
    loadingReport: false,
    refreshingBatch: false
  });

  // === Załączniki składników ===
  
  const setIngredientAttachments = useCallback((attachments) => {
    setAttachmentsState(prev => ({ 
      ...prev, 
      ingredient: typeof attachments === 'function' ? attachments(prev.ingredient) : attachments 
    }));
  }, []);

  const setIngredientBatchAttachments = useCallback((attachments) => {
    setAttachmentsState(prev => ({ 
      ...prev, 
      ingredientBatch: typeof attachments === 'function' ? attachments(prev.ingredientBatch) : attachments 
    }));
  }, []);

  const addIngredientAttachment = useCallback((ingredientId, attachment) => {
    setAttachmentsState(prev => ({
      ...prev,
      ingredient: {
        ...prev.ingredient,
        [ingredientId]: [...(prev.ingredient[ingredientId] || []), attachment]
      }
    }));
  }, []);

  const removeIngredientAttachment = useCallback((ingredientId, attachmentIndex) => {
    setAttachmentsState(prev => ({
      ...prev,
      ingredient: {
        ...prev.ingredient,
        [ingredientId]: (prev.ingredient[ingredientId] || []).filter((_, i) => i !== attachmentIndex)
      }
    }));
  }, []);

  // === Załączniki kliniczne ===
  
  const setClinicalAttachments = useCallback((attachments) => {
    setAttachmentsState(prev => ({ 
      ...prev, 
      clinical: typeof attachments === 'function' ? attachments(prev.clinical) : attachments 
    }));
  }, []);

  const setUploadingClinical = useCallback((uploading) => {
    setAttachmentsState(prev => ({ ...prev, uploadingClinical: uploading }));
  }, []);

  const addClinicalAttachment = useCallback((attachment) => {
    setAttachmentsState(prev => ({
      ...prev,
      clinical: [...prev.clinical, attachment]
    }));
  }, []);

  const removeClinicalAttachment = useCallback((attachmentIndex) => {
    setAttachmentsState(prev => ({
      ...prev,
      clinical: prev.clinical.filter((_, i) => i !== attachmentIndex)
    }));
  }, []);

  // === Załączniki dodatkowe ===
  
  const setAdditionalAttachments = useCallback((attachments) => {
    setAttachmentsState(prev => ({ 
      ...prev, 
      additional: typeof attachments === 'function' ? attachments(prev.additional) : attachments 
    }));
  }, []);

  const setUploadingAdditional = useCallback((uploading) => {
    setAttachmentsState(prev => ({ ...prev, uploadingAdditional: uploading }));
  }, []);

  const addAdditionalAttachment = useCallback((attachment) => {
    setAttachmentsState(prev => ({
      ...prev,
      additional: [...prev.additional, attachment]
    }));
  }, []);

  const removeAdditionalAttachment = useCallback((attachmentIndex) => {
    setAttachmentsState(prev => ({
      ...prev,
      additional: prev.additional.filter((_, i) => i !== attachmentIndex)
    }));
  }, []);

  // === Stany ładowania ===
  
  const setLoadingReportAttachments = useCallback((loading) => {
    setAttachmentsState(prev => ({ ...prev, loadingReport: loading }));
  }, []);

  const setRefreshingBatchAttachments = useCallback((refreshing) => {
    setAttachmentsState(prev => ({ ...prev, refreshingBatch: refreshing }));
  }, []);

  // === Reset ===
  
  const resetAttachmentsState = useCallback(() => {
    setAttachmentsState({
      ingredient: {},
      ingredientBatch: {},
      clinical: [],
      uploadingClinical: false,
      additional: [],
      uploadingAdditional: false,
      loadingReport: false,
      refreshingBatch: false
    });
  }, []);

  return {
    // Stan (rozpakowany dla kompatybilności wstecznej)
    ingredientAttachments: attachmentsState.ingredient,
    ingredientBatchAttachments: attachmentsState.ingredientBatch,
    clinicalAttachments: attachmentsState.clinical,
    additionalAttachments: attachmentsState.additional,
    uploadingClinical: attachmentsState.uploadingClinical,
    uploadingAdditional: attachmentsState.uploadingAdditional,
    loadingReportAttachments: attachmentsState.loadingReport,
    refreshingBatchAttachments: attachmentsState.refreshingBatch,
    
    // Akcje - składniki
    setIngredientAttachments,
    setIngredientBatchAttachments,
    addIngredientAttachment,
    removeIngredientAttachment,
    
    // Akcje - kliniczne
    setClinicalAttachments,
    setUploadingClinical,
    addClinicalAttachment,
    removeClinicalAttachment,
    
    // Akcje - dodatkowe
    setAdditionalAttachments,
    setUploadingAdditional,
    addAdditionalAttachment,
    removeAdditionalAttachment,
    
    // Akcje - ładowanie
    setLoadingReportAttachments,
    setRefreshingBatchAttachments,
    
    // Reset
    resetAttachmentsState
  };
};

export default useAttachmentsState;

