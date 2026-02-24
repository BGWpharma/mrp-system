import { useCallback } from 'react';
import { db, storage } from '../../services/firebase/config';
import { getDoc, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';

export const useFileHandlers = ({
  task,
  materials,
  currentUser,
  clinicalAttachments,
  additionalAttachments,
  setClinicalAttachments,
  setAdditionalAttachments,
  setUploadingClinical,
  setUploadingAdditional,
  setIngredientAttachments,
  setIngredientBatchAttachments,
  setRefreshingBatchAttachments,
  showSuccess,
  showError,
}) => {
  const fetchIngredientAttachments = useCallback(async () => {
    if (!task?.recipe?.ingredients || task.recipe.ingredients.length === 0) {
      return;
    }

    if (!task?.consumedMaterials || task.consumedMaterials.length === 0) {
      return;
    }

    try {
      const attachments = {};
      
      for (const ingredient of task.recipe.ingredients) {
        const ingredientAttachments = [];
        
        const matchingConsumedMaterials = task.consumedMaterials.filter(consumed => {
          const material = materials.find(m => (m.inventoryItemId || m.id) === consumed.materialId);
          const materialName = consumed.materialName || material?.name || '';
          
          return materialName.toLowerCase().includes(ingredient.name.toLowerCase()) ||
                 ingredient.name.toLowerCase().includes(materialName.toLowerCase());
        });
        
        for (const consumed of matchingConsumedMaterials) {
          if (consumed.batchId) {
            try {
              const { getInventoryBatch } = await import('../../services/inventory');
              const batchData = await getInventoryBatch(consumed.batchId);
              
              if (batchData && batchData.purchaseOrderDetails && batchData.purchaseOrderDetails.id) {
                const { getPurchaseOrderById } = await import('../../services/purchaseOrderService');
                const poData = await getPurchaseOrderById(batchData.purchaseOrderDetails.id);
                
                const coaAttachments = poData.coaAttachments || [];
                
                if (coaAttachments.length > 0) {
                  const poAttachments = coaAttachments.map(attachment => ({
                    ...attachment,
                    poNumber: poData.number,
                    poId: poData.id,
                    lotNumber: consumed.batchNumber || batchData.lotNumber || batchData.batchNumber,
                    category: 'CoA'
                  }));
                  
                  ingredientAttachments.push(...poAttachments);
                }
              }
            } catch (error) {
              console.warn(`Nie udało się pobrać załączników dla partii ${consumed.batchId}:`, error);
            }
          }
        }
        
        const uniqueAttachments = ingredientAttachments.filter((attachment, index, self) => 
          index === self.findIndex(a => a.fileName === attachment.fileName)
        );
        
        if (uniqueAttachments.length > 0) {
          attachments[ingredient.name] = uniqueAttachments;
        }
      }
      
      setIngredientAttachments(attachments);
    } catch (error) {
      console.warn('Błąd podczas pobierania załączników składników:', error);
    }
  }, [task, materials, setIngredientAttachments]);

  const fetchClinicalAttachments = useCallback(async () => {
    if (!task?.id) return;
    
    try {
      const taskRef = doc(db, 'productionTasks', task.id);
      const taskDoc = await getDoc(taskRef);
      
      if (taskDoc.exists()) {
        const taskData = taskDoc.data();
        setClinicalAttachments(taskData.clinicalAttachments || []);
      }
    } catch (error) {
      console.warn('Błąd podczas pobierania załączników badań klinicznych:', error);
    }
  }, [task?.id, setClinicalAttachments]);

  const uploadClinicalFile = useCallback(async (file) => {
    try {
      const maxSize = 10 * 1024 * 1024; // 10MB
      if (file.size > maxSize) {
        throw new Error('Plik jest za duży. Maksymalny rozmiar to 10MB.');
      }

      const allowedTypes = [
        'application/pdf',
        'image/jpeg',
        'image/png',
        'image/gif',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'text/plain'
      ];
      
      if (!allowedTypes.includes(file.type)) {
        throw new Error('Nieobsługiwany typ pliku. Dozwolone: PDF, JPG, PNG, GIF, DOC, DOCX, TXT');
      }

      const timestamp = new Date().getTime();
      const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
      const fileName = `${timestamp}_${sanitizedFileName}`;
      const storagePath = `clinical-research-attachments/${task.id}/${fileName}`;

      const fileRef = ref(storage, storagePath);
      await uploadBytes(fileRef, file);
      const downloadURL = await getDownloadURL(fileRef);

      return {
        id: `${timestamp}_${Math.random().toString(36).substr(2, 9)}`,
        fileName: file.name,
        storagePath,
        downloadURL,
        contentType: file.type,
        size: file.size,
        uploadedAt: new Date().toISOString(),
        uploadedBy: currentUser?.uid
      };
    } catch (error) {
      console.error('Błąd podczas przesyłania pliku:', error);
      throw error;
    }
  }, [task?.id, currentUser?.uid]);

  const handleClinicalFileSelect = useCallback(async (files) => {
    if (!files || files.length === 0) return;

    setUploadingClinical(true);
    const newAttachments = [...clinicalAttachments];

    try {
      for (const file of files) {
        try {
          const uploadedFile = await uploadClinicalFile(file);
          newAttachments.push(uploadedFile);
          showSuccess(`Plik "${file.name}" został przesłany pomyślnie`);
        } catch (error) {
          showError(`Błąd podczas przesyłania pliku "${file.name}": ${error.message}`);
        }
      }

      const taskRef = doc(db, 'productionTasks', task.id);
      await updateDoc(taskRef, {
        clinicalAttachments: newAttachments,
        updatedAt: serverTimestamp(),
        updatedBy: currentUser.uid
      });

      setClinicalAttachments(newAttachments);
    } finally {
      setUploadingClinical(false);
    }
  }, [clinicalAttachments, task?.id, currentUser?.uid, uploadClinicalFile, setClinicalAttachments, setUploadingClinical, showSuccess, showError]);

  const handleDeleteClinicalFile = useCallback(async (attachment) => {
    try {
      const fileRef = ref(storage, attachment.storagePath);
      await deleteObject(fileRef);

      const updatedAttachments = clinicalAttachments.filter(a => a.id !== attachment.id);
      
      const taskRef = doc(db, 'productionTasks', task.id);
      await updateDoc(taskRef, {
        clinicalAttachments: updatedAttachments,
        updatedAt: serverTimestamp(),
        updatedBy: currentUser.uid
      });

      setClinicalAttachments(updatedAttachments);
      showSuccess(`Plik "${attachment.fileName}" został usunięty`);
    } catch (error) {
      console.error('Błąd podczas usuwania pliku:', error);
      showError(`Błąd podczas usuwania pliku: ${error.message}`);
    }
  }, [clinicalAttachments, task?.id, currentUser?.uid, setClinicalAttachments, showSuccess, showError]);

  const handleDownloadClinicalFile = useCallback((attachment) => {
    window.open(attachment.downloadURL, '_blank');
  }, []);

  const fetchAdditionalAttachments = useCallback(async () => {
    if (!task?.id) return;
    
    try {
      const taskRef = doc(db, 'productionTasks', task.id);
      const taskDoc = await getDoc(taskRef);
      
      if (taskDoc.exists()) {
        const taskData = taskDoc.data();
        setAdditionalAttachments(taskData.additionalAttachments || []);
      }
    } catch (error) {
      console.warn('Błąd podczas pobierania dodatkowych załączników:', error);
    }
  }, [task?.id, setAdditionalAttachments]);

  const uploadAdditionalFile = useCallback(async (file) => {
    try {
      const maxSize = 20 * 1024 * 1024; // 20MB dla dodatkowych załączników
      if (file.size > maxSize) {
        throw new Error('Plik jest za duży. Maksymalny rozmiar to 20MB.');
      }

      const allowedTypes = [
        'application/pdf',
        'image/jpeg',
        'image/png',
        'image/gif',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'text/plain',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      ];
      
      if (!allowedTypes.includes(file.type)) {
        throw new Error('Nieobsługiwany typ pliku. Dozwolone: PDF, JPG, PNG, GIF, DOC, DOCX, TXT, XLS, XLSX');
      }

      const timestamp = new Date().getTime();
      const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
      const fileName = `${timestamp}_${sanitizedFileName}`;
      const storagePath = `additional-attachments/${task.id}/${fileName}`;

      const fileRef = ref(storage, storagePath);
      await uploadBytes(fileRef, file);
      const downloadURL = await getDownloadURL(fileRef);

      return {
        id: `${timestamp}_${Math.random().toString(36).substr(2, 9)}`,
        fileName: file.name,
        storagePath,
        downloadURL,
        contentType: file.type,
        size: file.size,
        uploadedAt: new Date().toISOString(),
        uploadedBy: currentUser?.uid
      };
    } catch (error) {
      console.error('Błąd podczas przesyłania pliku:', error);
      throw error;
    }
  }, [task?.id, currentUser?.uid]);

  const handleAdditionalFileSelect = useCallback(async (files) => {
    if (!files || files.length === 0) return;

    setUploadingAdditional(true);
    const newAttachments = [...additionalAttachments];

    try {
      for (const file of files) {
        try {
          const uploadedFile = await uploadAdditionalFile(file);
          newAttachments.push(uploadedFile);
          showSuccess(`Plik "${file.name}" został przesłany pomyślnie`);
        } catch (error) {
          showError(`Błąd podczas przesyłania pliku "${file.name}": ${error.message}`);
        }
      }

      const taskRef = doc(db, 'productionTasks', task.id);
      await updateDoc(taskRef, {
        additionalAttachments: newAttachments,
        updatedAt: serverTimestamp(),
        updatedBy: currentUser.uid
      });

      setAdditionalAttachments(newAttachments);
    } finally {
      setUploadingAdditional(false);
    }
  }, [additionalAttachments, task?.id, currentUser?.uid, uploadAdditionalFile, setAdditionalAttachments, setUploadingAdditional, showSuccess, showError]);

  const handleDeleteAdditionalFile = useCallback(async (attachment) => {
    try {
      const fileRef = ref(storage, attachment.storagePath);
      await deleteObject(fileRef);

      const updatedAttachments = additionalAttachments.filter(a => a.id !== attachment.id);
      
      const taskRef = doc(db, 'productionTasks', task.id);
      await updateDoc(taskRef, {
        additionalAttachments: updatedAttachments,
        updatedAt: serverTimestamp(),
        updatedBy: currentUser.uid
      });

      setAdditionalAttachments(updatedAttachments);
      showSuccess(`Plik "${attachment.fileName}" został usunięty`);
    } catch (error) {
      console.error('Błąd podczas usuwania pliku:', error);
      showError(`Błąd podczas usuwania pliku: ${error.message}`);
    }
  }, [additionalAttachments, task?.id, currentUser?.uid, setAdditionalAttachments, showSuccess, showError]);

  const handleDownloadAdditionalFile = useCallback((attachment) => {
    window.open(attachment.downloadURL, '_blank');
  }, []);

  const fetchIngredientBatchAttachments = useCallback(async () => {
    if (!task?.recipe?.ingredients || !task?.consumedMaterials || materials.length === 0) {
      return;
    }

    try {
      const attachments = {};

      for (const ingredient of task.recipe.ingredients) {
        const ingredientAttachments = [];

        const matchingConsumedMaterials = task.consumedMaterials.filter(consumed => {
          const material = materials.find(m => (m.inventoryItemId || m.id) === consumed.materialId);
          const materialName = consumed.materialName || material?.name || '';
          
          const ingredientLower = ingredient.name.toLowerCase().trim();
          const materialLower = materialName.toLowerCase().trim();
          
          const exactMatch = ingredientLower === materialLower;
          
          const containsMatch = materialLower.includes(ingredientLower) || ingredientLower.includes(materialLower);
          
          const ingredientWords = ingredientLower.split(/[\s\-_]+/).filter(w => w.length > 2);
          const materialWords = materialLower.split(/[\s\-_]+/).filter(w => w.length > 2);
          const wordMatch = ingredientWords.some(iWord => 
            materialWords.some(mWord => 
              iWord.includes(mWord) || mWord.includes(iWord) || 
              (iWord.length > 3 && mWord.length > 3 && 
               (iWord.startsWith(mWord.substring(0, 4)) || mWord.startsWith(iWord.substring(0, 4))))
            )
          );
          
          const cleanIngredient = ingredientLower.replace(/^(packcor|bgw|pharma)[\s\-_]*/i, '').replace(/[\s\-_]*(premium|standard|plus)$/i, '');
          const cleanMaterial = materialLower.replace(/^(packcor|bgw|pharma)[\s\-_]*/i, '').replace(/[\s\-_]*(premium|standard|plus)$/i, '');
          const cleanMatch = cleanIngredient && cleanMaterial && 
                             (cleanIngredient.includes(cleanMaterial) || cleanMaterial.includes(cleanIngredient));
          
          const matches = exactMatch || containsMatch || wordMatch || cleanMatch;
          
          return matches;
        });

        if (matchingConsumedMaterials.length === 0 && task.recipe.ingredients.length === 1) {
          matchingConsumedMaterials.push(...task.consumedMaterials);
        }

        for (const consumed of matchingConsumedMaterials) {
          if (consumed.batchId) {
            try {
              const { getInventoryBatch } = await import('../../services/inventory');
              const batchData = await getInventoryBatch(consumed.batchId);
              
              const hasAttachments = (batchData.attachments && batchData.attachments.length > 0);
              const hasCertificate = (batchData.certificateFileName && batchData.certificateDownloadURL);
              
              const batchAttachments = [];
              
              if (hasAttachments || hasCertificate) {
                if (hasAttachments) {
                  const attachments = batchData.attachments.map(attachment => ({
                    ...attachment,
                    batchNumber: consumed.batchNumber || batchData.lotNumber || batchData.batchNumber,
                    batchId: consumed.batchId,
                    materialName: consumed.materialName || 'Nieznany materiał',
                    source: 'batch_attachment'
                  }));
                  batchAttachments.push(...attachments);
                }
                
                if (hasCertificate) {
                  const certificateAttachment = {
                    id: `cert_${batchData.id}`,
                    fileName: batchData.certificateFileName,
                    downloadURL: batchData.certificateDownloadURL,
                    contentType: batchData.certificateContentType || 'application/octet-stream',
                    size: 0,
                    uploadedAt: batchData.certificateUploadedAt?.toDate?.() || new Date(),
                    batchNumber: consumed.batchNumber || batchData.lotNumber || batchData.batchNumber,
                    batchId: consumed.batchId,
                    materialName: consumed.materialName || 'Nieznany materiał',
                    source: 'batch_certificate'
                  };
                  batchAttachments.push(certificateAttachment);
                }
              }
              
              if (batchAttachments.length === 0 && batchData && batchData.purchaseOrderDetails && batchData.purchaseOrderDetails.id) {
                try {
                  const { getPurchaseOrderById } = await import('../../services/purchaseOrderService');
                  const poData = await getPurchaseOrderById(batchData.purchaseOrderDetails.id);
                  
                  const coaAttachments = poData.coaAttachments || [];
                  
                  if (coaAttachments.length > 0) {
                    const poAttachments = coaAttachments.map(attachment => ({
                      ...attachment,
                      batchNumber: consumed.batchNumber || batchData.lotNumber || batchData.batchNumber,
                      batchId: consumed.batchId,
                      materialName: consumed.materialName || 'Nieznany materiał',
                      poNumber: poData.number,
                      poId: poData.id,
                      source: 'po_coa'
                    }));
                    batchAttachments.push(...poAttachments);
                  }
                } catch (poError) {
                  console.warn(`Nie udało się pobrać załączników z PO dla partii ${consumed.batchId}:`, poError);
                }
              }
              
              if (batchAttachments.length > 0) {
                ingredientAttachments.push(...batchAttachments);
              }
            } catch (error) {
              console.warn(`Nie udało się pobrać załączników dla partii ${consumed.batchId}:`, error);
            }
          }
        }

        const uniqueAttachments = ingredientAttachments.filter((attachment, index, self) => 
          index === self.findIndex(a => a.fileName === attachment.fileName)
        );

        if (uniqueAttachments.length > 0) {
          const displayName = uniqueAttachments.length > 0 ? 
            (uniqueAttachments[0].materialName || ingredient.name) : ingredient.name;
          
          attachments[displayName] = uniqueAttachments;
        }
      }

      setIngredientBatchAttachments(attachments);
    } catch (error) {
      console.error('Błąd podczas pobierania załączników z partii składników:', error);
    }
  }, [task, materials, setIngredientBatchAttachments]);

  const handleRefreshBatchAttachments = useCallback(async () => {
    try {
      setRefreshingBatchAttachments(true);
      
      setIngredientBatchAttachments({});
      
      await fetchIngredientBatchAttachments();
      
      showSuccess('Załączniki z partii zostały odświeżone');
    } catch (error) {
      console.error('Błąd podczas odświeżania załączników:', error);
      showError('Błąd podczas odświeżania załączników z partii');
    } finally {
      setRefreshingBatchAttachments(false);
    }
  }, [fetchIngredientBatchAttachments, setRefreshingBatchAttachments, setIngredientBatchAttachments, showSuccess, showError]);

  return {
    // clinical file handlers
    handleClinicalFileSelect,
    handleDeleteClinicalFile,
    handleDownloadClinicalFile,
    // additional file handlers
    handleAdditionalFileSelect,
    handleDeleteAdditionalFile,
    handleDownloadAdditionalFile,
    // batch attachment handlers
    handleRefreshBatchAttachments,
    // fetch functions
    fetchIngredientAttachments,
    fetchClinicalAttachments,
    fetchAdditionalAttachments,
    fetchIngredientBatchAttachments,
  };
};

export default useFileHandlers;
