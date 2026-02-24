import { useEffect } from 'react';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../services/firebase/config';
import { getRecipeVersion } from '../../services/recipeService';
import { getCompanyData } from '../../services/companyService';
import { getWorkstationById } from '../../services/workstationService';
import { generateEndProductReportPDF } from '../../services/endProductReportService';

export const useTaskReportFetcher = ({
  task,
  id,
  currentUser,
  t,
  // State setters
  setTask,
  setCompanyData,
  setWorkstationData,
  setFixingRecipeData,
  setSyncingNamesWithRecipe,
  setGeneratingPDF,
  setSelectedAllergens,
  setLoadingReportAttachments,
  // State values
  companyData,
  workstationData,
  clinicalAttachments,
  additionalAttachments,
  ingredientBatchAttachments,
  formResponses,
  productionHistory,
  materials,
  selectedAllergens,
  // Notifications
  showError,
  showInfo,
  showSuccess,
  showWarning,
  // File fetchers (from useFileHandlers)
  fetchClinicalAttachments,
  fetchAdditionalAttachments,
  fetchIngredientAttachments,
  fetchIngredientBatchAttachments,
}) => {

  const fetchCompanyData = async () => {
    try {
      const data = await getCompanyData();
      setCompanyData(data);
    } catch (error) {
      console.error('Błąd podczas pobierania danych firmy:', error);
      // Używamy domyślnych wartości przy błędzie
      setCompanyData({
        name: 'BGW Pharma Sp. z o.o.',
        address: 'Szkolna 43B, 84-100 Polchowo'
      });
    }
  };

  const fetchWorkstationData = async () => {
    try {
      if (task?.workstationId) {
        const data = await getWorkstationById(task.workstationId);
        setWorkstationData(data);
      } else {
        // Jeśli nie ma workstationId, ustaw pusty obiekt aby zatrzymać "Ładowanie..."
        setWorkstationData({});
      }
    } catch (error) {
      console.error('Błąd podczas pobierania danych stanowiska:', error);
      setWorkstationData(null);
    }
  };

  // Funkcja do zapisywania alergenów do receptury
  const saveAllergensToRecipe = async (recipeId, allergens) => {
    try {
      // Pobierz aktualną recepturę
      const { getRecipeById, updateRecipe } = await import('../../services/recipeService');
      const currentRecipe = await getRecipeById(recipeId);
      
      if (!currentRecipe) {
        throw new Error(t('errors.recipeNotFound'));
      }
      
      // Sprawdź czy alergeny się zmieniły
      const currentAllergens = currentRecipe.allergens || [];
      const sortedCurrentAllergens = [...currentAllergens].sort();
      const sortedNewAllergens = [...allergens].sort();
      
      if (JSON.stringify(sortedCurrentAllergens) === JSON.stringify(sortedNewAllergens)) {
        console.log('Alergeny są identyczne, pomijam aktualizację receptury');
        return;
      }
      
      // Zaktualizuj recepturę z nowymi allergenami
      const updatedRecipeData = {
        ...currentRecipe,
        allergens: allergens,
        updatedAt: new Date()
      };
      
      await updateRecipe(recipeId, updatedRecipeData, currentUser.uid);
      console.log(`Zaktualizowano alergeny w recepturze ${recipeId}:`, allergens);
      
    } catch (error) {
      console.error('Błąd podczas zapisywania alergenów do receptury:', error);
      throw error;
    }
  };

  const handleFixRecipeData = async () => {
    if (!task?.recipeId) {
      showError('Brak ID receptury w zadaniu');
      return;
    }

    try {
      setFixingRecipeData(true);
      showInfo('Pobieranie aktualnych danych receptury...');
      
      // Pobierz pełne dane receptury
      let recipeData = null;
      
      if (task.recipeVersion) {
        // Jeśli mamy wersję, pobierz konkretną wersję receptury
        try {
          const recipeVersion = await getRecipeVersion(task.recipeId, task.recipeVersion);
          recipeData = recipeVersion.data;
          console.log(`Pobrano dane wersji ${task.recipeVersion} receptury ${task.recipeId}`);
        } catch (error) {
          console.warn(`Nie udało się pobrać wersji ${task.recipeVersion}, próbuję pobrać aktualną recepturę:`, error);
          // Jeśli nie udało się pobrać konkretnej wersji, pobierz aktualną recepturę
          const { getRecipeById } = await import('../../services/recipeService');
          recipeData = await getRecipeById(task.recipeId);
          console.log('Pobrano aktualną wersję receptury');
        }
      } else {
        // Jeśli nie ma wersji, pobierz aktualną recepturę
        const { getRecipeById } = await import('../../services/recipeService');
        recipeData = await getRecipeById(task.recipeId);
        console.log('Pobrano aktualną recepturę (brak wersji w zadaniu)');
      }

      if (!recipeData) {
        throw new Error('Nie udało się pobrać danych receptury');
      }

      // Sprawdź czy są nowe dane do zaktualizowania
      const hasNewMicronutrients = recipeData.micronutrients && recipeData.micronutrients.length > 0;
      const hasNewIngredients = recipeData.ingredients && recipeData.ingredients.length > 0;
      const currentMicronutrients = task.recipe?.micronutrients || [];
      const currentIngredients = task.recipe?.ingredients || [];

      // Zaktualizuj zadanie w bazie danych z pełnymi danymi receptury
      const taskRef = doc(db, 'productionTasks', id);
      await updateDoc(taskRef, {
        recipe: recipeData,
        updatedAt: serverTimestamp(),
        updatedBy: currentUser.uid
      });

      // Zaktualizuj lokalny stan
      setTask(prevTask => ({
        ...prevTask,
        recipe: recipeData
      }));

      // Pokaż szczegółową informację o tym co zostało zaktualizowane
      let updateDetails = [];
      if (hasNewMicronutrients && currentMicronutrients.length === 0) {
        updateDetails.push(`${recipeData.micronutrients.length} mikroelementów`);
      }
      if (hasNewIngredients && currentIngredients.length === 0) {
        updateDetails.push(`${recipeData.ingredients.length} składników`);
      }

      if (updateDetails.length > 0) {
        showSuccess(`Dane receptury zostały zaktualizowane! Dodano: ${updateDetails.join(', ')}`);
      } else {
        showSuccess('Dane receptury zostały odświeżone!');
      }
      
      console.log('Odświeżono dane receptury dla zadania:', id);

    } catch (error) {
      console.error('Błąd podczas odświeżania danych receptury:', error);
      showError('Nie udało się odświeżyć danych receptury: ' + error.message);
    } finally {
      setFixingRecipeData(false);
    }
  };

  // Funkcja synchronizacji nazw z aktualną recepturą
  const handleSyncNamesWithRecipe = async () => {
    if (!task?.recipeId) {
      showError(t('syncNames.noRecipeId'));
      return;
    }

    try {
      setSyncingNamesWithRecipe(true);
      showInfo(t('syncNames.syncing'));
      
      // Pobierz aktualną recepturę
      const { getRecipeById } = await import('../../services/recipeService');
      const recipe = await getRecipeById(task.recipeId);
      
      if (!recipe) {
        throw new Error(t('syncNames.recipeNotFound'));
      }

      // Pobierz pozycję magazynową powiązaną z recepturą
      const { getInventoryItemByRecipeId } = await import('../../services/inventory');
      let inventoryItem = null;
      try {
        inventoryItem = await getInventoryItemByRecipeId(task.recipeId);
      } catch (error) {
        console.warn('Nie znaleziono pozycji magazynowej dla receptury:', error);
      }

      // Przygotuj dane do aktualizacji
      const updateData = {
        name: recipe.name,
        productName: recipe.name,
        recipeName: recipe.name,
        updatedAt: serverTimestamp(),
        updatedBy: currentUser.uid
      };

      // Jeśli znaleziono pozycję magazynową, zaktualizuj też inventoryProductId
      if (inventoryItem) {
        updateData.inventoryProductId = inventoryItem.id;
      }

      // Zaktualizuj zadanie w bazie
      const taskRef = doc(db, 'productionTasks', id);
      await updateDoc(taskRef, updateData);

      // Zaktualizuj lokalny stan
      setTask(prevTask => ({
        ...prevTask,
        name: recipe.name,
        productName: recipe.name,
        recipeName: recipe.name,
        inventoryProductId: inventoryItem?.id || prevTask.inventoryProductId
      }));

      const inventoryInfo = inventoryItem 
        ? t('syncNames.successWithInventory', { recipeName: recipe.name, inventoryName: inventoryItem.name })
        : t('syncNames.success', { recipeName: recipe.name });
      
      showSuccess(inventoryInfo);
      console.log('Zsynchronizowano nazwy z recepturą:', recipe.name);

    } catch (error) {
      console.error('Błąd podczas synchronizacji nazw z recepturą:', error);
      showError(t('syncNames.error', { error: error.message }));
    } finally {
      setSyncingNamesWithRecipe(false);
    }
  };

  // Funkcja do generowania raportu PDF
  const handleGenerateEndProductReport = async () => {
    if (!task) {
      showError(t('errors.noTaskDataForReport'));
      return;
    }

    try {
      setGeneratingPDF(true);
      showInfo('Generowanie raportu PDF...');

      // Przygotowanie załączników w formacie oczekiwanym przez funkcję PDF
      const attachments = [];
      
      // Dodaj załączniki badań klinicznych
      if (clinicalAttachments && clinicalAttachments.length > 0) {
        clinicalAttachments.forEach(attachment => {
          if (attachment.downloadURL && attachment.fileName) {
            const fileExtension = attachment.fileName.split('.').pop().toLowerCase();
            const fileType = ['pdf', 'png', 'jpg', 'jpeg'].includes(fileExtension) ? fileExtension : 'pdf';
            
            attachments.push({
              fileName: attachment.fileName,
              fileType: fileType,
              fileUrl: attachment.downloadURL
            });
          }
        });
      }
      
      // Dodaj załączniki CoA z partii składników (zamiast z PO)
      if (ingredientBatchAttachments && Object.keys(ingredientBatchAttachments).length > 0) {
        Object.values(ingredientBatchAttachments).flat().forEach(attachment => {
          if ((attachment.downloadURL || attachment.fileUrl) && attachment.fileName) {
            const fileExtension = attachment.fileName.split('.').pop().toLowerCase();
            const fileType = ['pdf', 'png', 'jpg', 'jpeg'].includes(fileExtension) ? fileExtension : 'pdf';
            
            attachments.push({
              fileName: attachment.fileName,
              fileType: fileType,
              fileUrl: attachment.downloadURL || attachment.fileUrl
            });
          }
        });
      }
      
      // Dodaj dodatkowe załączniki
      if (additionalAttachments && additionalAttachments.length > 0) {
        additionalAttachments.forEach(attachment => {
          if (attachment.downloadURL && attachment.fileName) {
            const fileExtension = attachment.fileName.split('.').pop().toLowerCase();
            const fileType = ['pdf', 'png', 'jpg', 'jpeg'].includes(fileExtension) ? fileExtension : 'pdf';
            
            attachments.push({
              fileName: attachment.fileName,
              fileType: fileType,
              fileUrl: attachment.downloadURL
            });
          }
        });
      }
      
      // Dodaj załączniki z raportów CompletedMO
      if (formResponses?.completedMO && formResponses.completedMO.length > 0) {
        formResponses.completedMO.forEach((report, index) => {
          if (report.mixingPlanReportUrl && report.mixingPlanReportName) {
            const fileExtension = report.mixingPlanReportName.split('.').pop().toLowerCase();
            const fileType = ['pdf', 'png', 'jpg', 'jpeg'].includes(fileExtension) ? fileExtension : 'pdf';
            
            attachments.push({
              fileName: `CompletedMO_Report_${index + 1}_${report.mixingPlanReportName}`,
              fileType: fileType,
              fileUrl: report.mixingPlanReportUrl
            });
          }
        });
      }
      
      // Dodaj załączniki z raportów ProductionControl
      if (formResponses?.productionControl && formResponses.productionControl.length > 0) {
        formResponses.productionControl.forEach((report, index) => {
          // Document scans
          if (report.documentScansUrl && report.documentScansName) {
            const fileExtension = report.documentScansName.split('.').pop().toLowerCase();
            const fileType = ['pdf', 'png', 'jpg', 'jpeg'].includes(fileExtension) ? fileExtension : 'pdf';
            
            attachments.push({
              fileName: `ProductionControl_Report_${index + 1}_${report.documentScansName}`,
              fileType: fileType,
              fileUrl: report.documentScansUrl
            });
          }
          
          // Product photos
          const photoFields = [
            { url: report.productPhoto1Url, name: report.productPhoto1Name, label: 'Photo1' },
            { url: report.productPhoto2Url, name: report.productPhoto2Name, label: 'Photo2' },
            { url: report.productPhoto3Url, name: report.productPhoto3Name, label: 'Photo3' }
          ];
          
          photoFields.forEach(photo => {
            if (photo.url && photo.name) {
              const fileExtension = photo.name.split('.').pop().toLowerCase();
              const fileType = ['pdf', 'png', 'jpg', 'jpeg'].includes(fileExtension) ? fileExtension : 'jpg';
              
              attachments.push({
                fileName: `ProductionControl_Report_${index + 1}_${photo.label}_${photo.name}`,
                fileType: fileType,
                fileUrl: photo.url
              });
            }
          });
        });
      }

      // Usunięcie duplikatów załączników na podstawie nazwy pliku
      const uniqueAttachments = attachments.filter((attachment, index, self) => 
        index === self.findIndex(a => a.fileName === attachment.fileName)
      );

      console.log('Załączniki do dodania do raportu:', uniqueAttachments);

      // Przygotowanie danych dodatkowych dla raportu z opcjami optymalizacji PDF
      const additionalData = {
        companyData,
        workstationData,
        productionHistory,
        formResponses,
        clinicalAttachments,
        additionalAttachments,
        ingredientBatchAttachments, // Zmienione z ingredientAttachments
        ingredientBatchAttachments,
        materials,
        currentUser,
        selectedAllergens,
        attachments: uniqueAttachments, // Dodajemy załączniki w odpowiednim formacie
        options: {
          useTemplate: true,           // Użyj szablon tła (można zmienić na false dla oszczędności miejsca)
          imageQuality: 0.75,          // Jakość kompresji obrazu (0.1-1.0) - zoptymalizowane dla rozmiaru
          enableCompression: true,     // Włącz kompresję PDF
          precision: 2,                // Ogranicz precyzję do 2 miejsc po przecinku
          // Zaawansowane opcje kompresji załączników
          attachmentCompression: {
            enabled: true,
            imageQuality: 0.75,        // Jakość kompresji załączników obrazowych (75% - dobry balans)
            maxImageWidth: 1200,       // Maksymalna szerokość obrazu w pikselach
            maxImageHeight: 1600,      // Maksymalna wysokość obrazu w pikselach
            convertPngToJpeg: true     // Konwertuj PNG na JPEG dla lepszej kompresji
          }
        }
      };

      // Generowanie raportu PDF
      const result = await generateEndProductReportPDF(task, additionalData);
      
      if (result.success) {
        // Zapisz alergeny do receptury jeśli zostały wybrane i zadanie ma przypisaną recepturę
        if (selectedAllergens.length > 0 && task.recipeId) {
          try {
            await saveAllergensToRecipe(task.recipeId, selectedAllergens);
            showInfo('Alergeny zostały zapisane do receptury');
          } catch (allergenError) {
            console.error('Błąd podczas zapisywania alergenów do receptury:', allergenError);
            showWarning('Raport został wygenerowany, ale nie udało się zapisać alergenów do receptury');
          }
        }
        
        if (result.withAttachments) {
          showSuccess(`Raport PDF został wygenerowany z załącznikami (${uniqueAttachments.length}): ${result.fileName}`);
        } else {
          showSuccess(`Raport PDF został wygenerowany: ${result.fileName}${uniqueAttachments.length > 0 ? ' (załączniki nie zostały dodane z powodu błędu)' : ''}`);
        }
      } else {
        showError('Wystąpił błąd podczas generowania raportu PDF');
      }
    } catch (error) {
      console.error('Błąd podczas generowania raportu PDF:', error);
      showError(`Błąd generowania raportu: ${error.message}`);
    } finally {
      setGeneratingPDF(false);
    }
  };

  // ===== useEffect hooks =====

  // Pobieranie alergenów z receptury przy załadowaniu zadania
  useEffect(() => {
    if (task?.recipe?.allergens && task.recipe.allergens.length > 0) {
      setSelectedAllergens(task.recipe.allergens);
    } else if (task?.recipeId && !task?.recipe?.allergens) {
      // Jeśli zadanie ma recipeId ale nie ma załadowanych danych receptury, pobierz je
      const fetchRecipeAllergens = async () => {
        try {
          const { getRecipeById } = await import('../../services/recipeService');
          const recipe = await getRecipeById(task.recipeId);
          if (recipe?.allergens && recipe.allergens.length > 0) {
            setSelectedAllergens(recipe.allergens);
          }
        } catch (error) {
          console.error('Błąd podczas pobierania alergenów z receptury:', error);
        }
      };
      fetchRecipeAllergens();
    }
  }, [task?.recipe?.allergens, task?.recipeId]);

  // Pobieranie danych firmy i stanowiska dla raportu (uruchamiane przy montowaniu EndProductReportTab)
  useEffect(() => {
    fetchCompanyData();
    fetchWorkstationData();
  }, [task?.workstationId]);

  // Lazy loading załączników
  useEffect(() => {
    const loadReportAttachments = async () => {
      if (task?.id) {
        try {
          setLoadingReportAttachments(true);
          
          // Sprawdź czy załączniki zostały już załadowane (cache)
          const needsClinicalAttachments = clinicalAttachments.length === 0;
          const needsAdditionalAttachments = additionalAttachments.length === 0;
          const needsBatchAttachments = Object.keys(ingredientBatchAttachments).length === 0;
          
          // Pobierz załączniki zadania (tylko jeśli nie są załadowane)
          const taskAttachmentsPromises = [];
          if (needsClinicalAttachments) taskAttachmentsPromises.push(fetchClinicalAttachments());
          if (needsAdditionalAttachments) taskAttachmentsPromises.push(fetchAdditionalAttachments());
          
          if (taskAttachmentsPromises.length > 0) {
            await Promise.all(taskAttachmentsPromises);
          }
          
          // Pobierz załączniki z partii i PO (jeśli są dostępne dane i nie są załadowane)
          if (needsBatchAttachments && task?.recipe?.ingredients && task?.consumedMaterials && materials.length > 0) {
            await Promise.all([
              fetchIngredientAttachments(), // dla kompatybilności
              fetchIngredientBatchAttachments()
            ]);
          }
        } catch (error) {
          console.error('Błąd podczas ładowania załączników raportu:', error);
        } finally {
          setLoadingReportAttachments(false);
        }
      }
    };
    
    loadReportAttachments();
  }, [task?.id, task?.recipe?.ingredients, task?.consumedMaterials, materials, clinicalAttachments.length, additionalAttachments.length, ingredientBatchAttachments]);

  return {
    fetchCompanyData,
    fetchWorkstationData,
    saveAllergensToRecipe,
    handleFixRecipeData,
    handleSyncNamesWithRecipe,
    handleGenerateEndProductReport,
  };
};
