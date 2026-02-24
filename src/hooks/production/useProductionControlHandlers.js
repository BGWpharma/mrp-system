import { useCallback } from 'react';
import {
  getTaskById,
  updateTaskStatus,
  confirmMaterialConsumption,
  addTaskProductToInventory,
  startProduction,
  stopProduction,
  generateMaterialsAndLotsReport
} from '../../services/productionService';

export const useProductionControlHandlers = ({
  id,
  task,
  setTask,
  setLoading,
  currentUser,
  navigate,
  productionData,
  materials,
  materialQuantities,
  includeInCosts,
  userNames,
  fetchUserNames,
  openDialog,
  invalidateCostsCache,
  calculateWeightedUnitPrice,
  showSuccess,
  showError,
  showInfo,
  showWarning,
}) => {

  const handleStatusChange = useCallback(async (newStatus) => {
    try {
      if (newStatus === 'Zakończone' && !task.materialConsumptionConfirmed && task.materials && task.materials.length > 0) {
        showWarning('Przed zakończeniem zadania potwierdź zużycie materiałów w zakładce "Materiały i koszty"');
        return;
      }

      setLoading(true);
      await updateTaskStatus(id, newStatus, currentUser.uid);
      
      const updatedTask = await getTaskById(id);
      setTask(updatedTask);
      
      if (updatedTask.statusHistory && updatedTask.statusHistory.length > 0) {
        const userIds = updatedTask.statusHistory.map(change => change.changedBy).filter(id => id);
        const uniqueUserIds = [...new Set(userIds)];
        const missingUserIds = uniqueUserIds.filter(id => !userNames[id]);
        
        if (missingUserIds.length > 0) {
          await fetchUserNames(missingUserIds);
        }
      }
      
      showSuccess(`Status zadania zmieniony na: ${newStatus}`);
    } catch (error) {
      console.error('Błąd podczas zmiany statusu:', error);
      showError('Nie udało się zmienić statusu zadania: ' + error.message);
    } finally {
      setLoading(false);
    }
  }, [id, task, currentUser, userNames, fetchUserNames, setLoading, setTask, showSuccess, showError, showWarning]);

  const handleConfirmConsumption = useCallback(async () => {
    try {
      await confirmMaterialConsumption(id);
      showSuccess('Zużycie materiałów potwierdzone. Stany magazynowe zostały zaktualizowane.');
      
      // Invaliduj cache kosztów po konsumpcji (ceny mogły się zmienić)
      invalidateCostsCache();
      
      const updatedTask = await getTaskById(id);
      setTask(updatedTask);
    } catch (error) {
      console.error('Błąd podczas potwierdzania zużycia:', error);
      showError('Nie udało się potwierdzić zużycia materiałów: ' + error.message);
    }
  }, [id, invalidateCostsCache, setTask, showSuccess, showError]);

  const handleReceiveItem = useCallback(async () => {
    try {
      setLoading(true);
      
      let inventoryProductId = task.inventoryProductId;
      
      if (!inventoryProductId && task.recipeId) {
        try {
          const { getInventoryItemByRecipeId } = await import('../../services/inventory');
          const recipeInventoryItem = await getInventoryItemByRecipeId(task.recipeId);
          
          if (recipeInventoryItem) {
            inventoryProductId = recipeInventoryItem.id;
            
            const { updateTask } = await import('../../services/productionService');
            await updateTask(id, {
              inventoryProductId: inventoryProductId
            }, currentUser.uid);
            
            const updatedTask = await getTaskById(id);
            setTask(updatedTask);
          }
        } catch (error) {
          console.error('Błąd podczas pobierania pozycji magazynowej z receptury:', error);
        }
      }
      
      if (inventoryProductId) {
        const unitPrice = task.costs && task.quantity ? 
          Number(task.costs.totalCost / task.quantity) : 0;
        
        const lotNumber = task.lotNumber || 
                         (task.moNumber ? `SN${task.moNumber.replace('MO', '')}` : `LOT-PROD-${id.substring(0, 6)}`);
          
        const sourceInfo = new URLSearchParams();
        sourceInfo.append('poNumber', `PROD-${id.substring(0, 6)}`);
        sourceInfo.append('quantity', task.quantity);
        sourceInfo.append('unitPrice', unitPrice);
        sourceInfo.append('reason', 'production');
        sourceInfo.append('lotNumber', lotNumber);
        sourceInfo.append('source', 'production');
        sourceInfo.append('sourceId', id);
        
        if (task.expiryDate) {
          let expiryDateStr;
          if (task.expiryDate instanceof Date) {
            expiryDateStr = task.expiryDate.toISOString();
          } else if (task.expiryDate.toDate && typeof task.expiryDate.toDate === 'function') {
            expiryDateStr = task.expiryDate.toDate().toISOString();
          } else if (task.expiryDate.seconds) {
            expiryDateStr = new Date(task.expiryDate.seconds * 1000).toISOString();
          } else if (typeof task.expiryDate === 'string') {
            try {
              expiryDateStr = new Date(task.expiryDate).toISOString();
            } catch (e) {
              console.error('Błąd podczas konwersji daty ważności:', e);
            }
          }
          
          if (expiryDateStr) {
            sourceInfo.append('expiryDate', expiryDateStr);
          }
        }
        
        if (task.moNumber) {
          sourceInfo.append('moNumber', task.moNumber);
        }
        
        if (task.orderNumber) {
          sourceInfo.append('orderNumber', task.orderNumber);
        }
        
        if (task.orderId) {
          sourceInfo.append('orderId', task.orderId);
        }
        
        let notes = `Partia z zadania produkcyjnego: ${task.name || ''}`;
        if (task.moNumber) {
          notes += ` (MO: ${task.moNumber})`;
        }
        if (task.orderNumber) {
          notes += ` (CO: ${task.orderNumber})`;
        }
        sourceInfo.append('notes', notes);
        
        navigate(`/inventory/${inventoryProductId}/receive?${sourceInfo.toString()}`);
      } else {
        await addTaskProductToInventory(id, currentUser.uid);
        
        showSuccess('Produkt został pomyślnie dodany do magazynu jako partia');
        
        const updatedTask = await getTaskById(id);
        setTask(updatedTask);
      }
    } catch (error) {
      console.error('Błąd podczas dodawania produktu do magazynu:', error);
      showError(`Błąd podczas dodawania produktu do magazynu: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }, [id, task, currentUser, navigate, setLoading, setTask, showSuccess, showError]);

  const handleReceiveClick = useCallback(() => {
    handleReceiveItem();
  }, [handleReceiveItem]);

  const handleAddToInventory = useCallback(() => {
    handleReceiveClick();
  }, [handleReceiveClick]);

  const handleStartProduction = useCallback(async () => {
    try {
      if (!task?.expiryDate) {
        openDialog('startProduction');
        return;
      }
      
      const result = await startProduction(id, currentUser.uid);
      
      if (result.batchResult) {
        if (result.batchResult.message === 'Partia już istnieje') {
          showSuccess('Produkcja wznowiona - używa istniejącą partię produktu');
        } else if (result.batchResult.isNewBatch === false) {
          showSuccess('Produkcja wznowiona - dodano do istniejącej partii produktu');
        } else {
          showSuccess('Produkcja rozpoczęta - utworzono nową pustą partię produktu');
        }
      } else {
        showSuccess('Produkcja rozpoczęta');
      }
      
      const updatedTask = await getTaskById(id);
      setTask(updatedTask);
    } catch (error) {
      showError('Błąd podczas rozpoczynania produkcji: ' + error.message);
    }
  }, [id, task, currentUser, openDialog, setTask, showSuccess, showError]);

  const handleStartProductionWithExpiry = useCallback(async (expiryDate) => {
    try {
      const result = await startProduction(id, currentUser.uid, expiryDate);
      
      if (result.batchResult) {
        if (result.batchResult.message === 'Partia już istnieje') {
          showSuccess('Produkcja wznowiona - używa istniejącą partię produktu');
        } else if (result.batchResult.isNewBatch === false) {
          showSuccess('Produkcja wznowiona - dodano do istniejącej partii produktu');
        } else {
          showSuccess('Produkcja rozpoczęta - utworzono nową pustą partię produktu');
        }
      } else {
        showSuccess('Produkcja rozpoczęta');
      }
      
      const updatedTask = await getTaskById(id);
      setTask(updatedTask);
      
      return { success: true };
    } catch (error) {
      console.error('Error starting production:', error);
      return { success: false, error };
    }
  }, [id, currentUser?.uid, showSuccess]);

  const handleStopProduction = useCallback(async () => {
    if (!productionData.completedQuantity) {
      showError('Podaj ilość wyprodukowaną');
      return;
    }
    
    const quantity = parseFloat(productionData.completedQuantity);
    
    if (isNaN(quantity) || quantity <= 0) {
      showError('Ilość wyprodukowana musi być liczbą większą od zera');
      return;
    }
    
    setLoading(true);
    
    try {
      const result = await stopProduction(
        id, 
        quantity, 
        productionData.timeSpent || 0,
        currentUser.uid,
        {
          startTime: productionData.startTime.toISOString(),
          endTime: productionData.endTime.toISOString()
        }
      );
      
      if (result.isCompleted) {
        showSuccess('Zadanie zostało zakończone');
        showInfo('Rezerwacje materiałów pozostają aktywne do momentu potwierdzenia zużycia materiałów. Przejdź do zakładki "Zużycie materiałów", aby je potwierdzić.');
      } else {
        showSuccess('Produkcja została wstrzymana');
      }
      
    } catch (error) {
      console.error('Error stopping production:', error);
      showError('Błąd podczas zatrzymywania produkcji: ' + error.message);
    } finally {
      setLoading(false);
    }
  }, [id, productionData, currentUser, setLoading, showSuccess, showError, showInfo]);

  const handlePrintMaterialsAndLots = useCallback(async () => {
    if (!task) return;
    
    try {
      const report = await generateMaterialsAndLotsReport(id);
      
      const formatDate = (dateString) => {
        if (!dateString) return 'Nie określono';
        const date = new Date(dateString);
        return date.toLocaleDateString('pl-PL', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric'
        });
      };
      
      const printContents = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Rozpiska materiałów - MO ${task.moNumber}</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              margin: 20px;
              line-height: 1.5;
            }
            h1, h2, h3 {
              margin-top: 20px;
              margin-bottom: 10px;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin-bottom: 20px;
            }
            th, td {
              border: 1px solid #ddd;
              padding: 8px;
              text-align: left;
            }
            th {
              background-color: #f2f2f2;
            }
            .header {
              display: flex;
              justify-content: space-between;
              align-items: center;
              margin-bottom: 20px;
            }
            .section {
              margin-bottom: 30px;
            }
            .footer {
              margin-top: 50px;
              text-align: center;
              font-size: 12px;
              color: #666;
            }
            @media print {
              button {
                display: none;
              }
            }
            .reserved {
              background-color: #e8f5e9;
            }
            .not-reserved {
              background-color: #ffebee;
            }
            .excluded {
              text-decoration: line-through;
              color: #888;
            }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <h1>Rozpiska materiałów</h1>
              <h2>MO: ${task.moNumber}</h2>
            </div>
            <div>
              <p><strong>Data:</strong> ${new Date().toLocaleDateString('pl-PL')}</p>
              <p><strong>Status:</strong> ${task.status}</p>
            </div>
          </div>
          
          <div class="section">
            <h3>Szczegóły zadania</h3>
            <table>
              <tr><th>Produkt:</th><td>${task.productName}</td></tr>
              <tr><th>Ilość:</th><td>${task.quantity} ${task.unit}</td></tr>
              <tr><th>Data rozpoczęcia:</th><td>${formatDate(task.scheduledDate)}</td></tr>
              <tr><th>Planowane zakończenie:</th><td>${formatDate(task.endDate)}</td></tr>
            </table>
          </div>
          
          <div class="section">
            <h3>Lista materiałów</h3>
            <table>
              <thead>
                <tr>
                  <th>Nazwa materiału</th>
                  <th>Ilość potrzebna</th>
                  <th>Jednostka</th>
                  <th>Cena jedn.</th>
                  <th>Koszt</th>
                  <th>Stan</th>
                  <th>Wliczany do kosztów</th>
                </tr>
              </thead>
              <tbody>
                ${report.materials.map(material => {
                  const isReserved = material.batches && material.batches.length > 0;
                  const isIncludedInCosts = includeInCosts[material.id] !== undefined ? includeInCosts[material.id] : true;
                  const rowClass = isReserved ? 'reserved' : 'not-reserved';
                  const nameClass = !isIncludedInCosts ? 'excluded' : '';
                  
                  return `
                  <tr class="${rowClass}">
                    <td class="${nameClass}">${material.name}</td>
                    <td>${material.quantity}</td>
                    <td>${material.unit || 'szt.'}</td>
                    <td>${(() => {
                      const materialId = material.inventoryItemId || material.id;
                      const unitPrice = calculateWeightedUnitPrice(material, materialId);
                      return unitPrice > 0 ? `${unitPrice.toFixed(4)} €` : '—';
                    })()}</td>
                    <td>${material.cost ? `${material.cost.toFixed(2)} €` : '—'}</td>
                    <td>${material.available ? 'Dostępny' : 'Brak'}</td>
                    <td>${isIncludedInCosts ? 'Tak' : 'Nie'}</td>
                  </tr>
                  `;
                }).join('')}
                
                <tr>
                  <th colspan="4" style="text-align: right">Całkowity koszt materiałów:</th>
                  <th>${report.totalMaterialCost ? `${report.totalMaterialCost.toFixed(2)} €` : '—'}</th>
                  <th colspan="2"></th>
                </tr>
                <tr>
                  <th colspan="4" style="text-align: right">Koszt materiałów na jednostkę:</th>
                  <th>${report.unitMaterialCost ? `~${report.unitMaterialCost.toFixed(4)} €/${task.unit}` : '—'}</th>
                  <th colspan="2"></th>
                </tr>
                ${task.processingCostPerUnit > 0 ? `
                <tr>
                  <th colspan="4" style="text-align: right">Koszt procesowy na jednostkę:</th>
                  <th>${parseFloat(task.processingCostPerUnit).toFixed(2)} €/${task.unit}</th>
                  <th colspan="2"></th>
                </tr>
                <tr>
                  <th colspan="4" style="text-align: right">Całkowity koszt procesowy:</th>
                  <th>${(parseFloat(task.processingCostPerUnit) * parseFloat(task.quantity)).toFixed(2)} €</th>
                  <th colspan="2"></th>
                </tr>
                ` : ''}
              </tbody>
            </table>
          </div>
          
          <div class="section">
            <h3>Zarezerwowane partie (LOT)</h3>
            ${Object.keys(report.batches || {}).length === 0 ? 
              `<p>Brak zarezerwowanych partii</p>` : 
              `<table>
                <thead>
                  <tr>
                    <th>Materiał</th>
                    <th>Partia (LOT)</th>
                    <th>Ilość</th>
                    <th>Cena jedn.</th>
                    <th>Koszt</th>
                    <th>Data ważności</th>
                  </tr>
                </thead>
                <tbody>
                  ${Object.entries(report.batches || {}).map(([materialId, batches]) => {
                    const material = report.materials.find(m => m.id === materialId || m.inventoryItemId === materialId);
                    
                    return batches.map(batch => {
                      const batchCost = (batch.quantity || 0) * (batch.unitPrice || 0);
                      return `
                        <tr>
                          <td>${material ? material.name : 'Nieznany materiał'}</td>
                          <td>${batch.batchNumber}</td>
                          <td>${batch.quantity} ${material ? material.unit : 'szt.'}</td>
                          <td>${batch.unitPrice ? batch.unitPrice.toFixed(4) + ' €' : '—'}</td>
                          <td>${batchCost ? batchCost.toFixed(2) + ' €' : '—'}</td>
                          <td>${formatDate(batch.expiryDate)}</td>
                        </tr>
                      `;
                    }).join('');
                  }).join('')}
                </tbody>
              </table>`
            }
          </div>
          
          <div class="footer">
            <p>Wygenerowano: ${new Date().toLocaleString('pl-PL')}</p>
            <p>System MRP</p>
          </div>
          
          <div style="text-align: center; margin-top: 20px;">
            <button onclick="window.print()" style="padding: 10px 20px; background-color: #2196F3; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 16px;">
              Drukuj raport
            </button>
          </div>
        </body>
        </html>
      `;
      
      const printWindow = window.open('', '_blank');
      printWindow.document.open();
      printWindow.document.write(printContents);
      printWindow.document.close();
    } catch (error) {
      console.error('Błąd podczas generowania raportu materiałów:', error);
      showError('Wystąpił błąd podczas generowania raportu materiałów');
    }
  }, [id, task, includeInCosts, calculateWeightedUnitPrice, showError]);

  const handlePrintMODetails = useCallback(() => {
    const formatDateForPrint = (dateValue) => {
      if (!dateValue) return 'Nie określono';
      
      try {
        let date;
        if (dateValue instanceof Date) {
          date = dateValue;
        } else if (dateValue.toDate && typeof dateValue.toDate === 'function') {
          date = dateValue.toDate();
        } else if (dateValue.seconds) {
          date = new Date(dateValue.seconds * 1000);
        } else {
          date = new Date(dateValue);
        }
        
        if (isNaN(date.getTime())) {
          return 'Nie określono';
        }
        
        return date.toLocaleDateString('pl-PL', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });
      } catch (error) {
        console.error('Błąd konwersji daty:', error);
        return 'Nie określono';
      }
    };
    
    let printContents = `
      <html>
      <head>
        <title>Szczegóły MO: ${task.moNumber || ''}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; }
          .header { text-align: center; margin-bottom: 20px; border-bottom: 1px solid #ccc; padding-bottom: 10px; }
          h1 { margin-bottom: 5px; }
          table { width: 100%; border-collapse: collapse; margin: 15px 0; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
          th { background-color: #f2f2f2; width: 30%; }
          .section { margin-top: 20px; }
          .footer { text-align: center; margin-top: 50px; font-size: 0.8em; border-top: 1px solid #ccc; padding-top: 10px; }
          .highlighted { background-color: #f9f9f9; border-left: 4px solid #2196F3; padding-left: 10px; }
          @media print {
            body { -webkit-print-color-adjust: exact; color-adjust: exact; }
            button { display: none; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>Szczegóły zlecenia produkcyjnego</h1>
          <h2>MO: ${task.moNumber || 'Nie określono'}</h2>
        </div>
        
        <div class="section">
          <h3>Informacje podstawowe</h3>
          <table>
            <tr><th>Nazwa zadania:</th><td>${task.name || 'Nie określono'}</td></tr>
            <tr><th>Produkt:</th><td>${task.productName || 'Nie określono'}</td></tr>
            <tr><th>Ilość:</th><td>${task.quantity || '0'} ${task.unit || 'szt.'}</td></tr>
            <tr><th>Status:</th><td>${task.status || 'Nie określono'}</td></tr>

            ${(task.recipeName || task.recipe?.recipeName) ? `<tr><th>Receptura:</th><td>${task.recipeName || task.recipe?.recipeName}${task.recipeVersion ? ` (wersja ${task.recipeVersion})` : ''}</td></tr>` : ''}
          </table>
        </div>

        <div class="section highlighted">
          <h3>Informacje o partii produktu</h3>
          <table>
            <tr><th>Numer LOT:</th><td>${task.lotNumber || 'Nie określono'}</td></tr>
            <tr><th>Data ważności:</th><td>${task.expiryDate ? formatDateForPrint(task.expiryDate).split(',')[0] : 'Nie określono'}</td></tr>
          </table>
        </div>

        <div class="section">
          <h3>Harmonogram</h3>
          <table>
            <tr><th>Planowany start:</th><td>${formatDateForPrint(task.scheduledDate)}</td></tr>
            <tr><th>Planowane zakończenie:</th><td>${formatDateForPrint(task.endDate)}</td></tr>
            <tr><th>Szacowany czas produkcji:</th><td>${task.estimatedDuration ? (task.estimatedDuration / 60).toFixed(2) + ' godz.' : 'Nie określono'}</td></tr>
            <tr><th>Czas na jednostkę:</th><td>${task.productionTimePerUnit ? parseFloat(task.productionTimePerUnit).toFixed(2) + ' min./szt.' : 'Nie określono'}</td></tr>
          </table>
        </div>

        <div class="section">
          <h3>Materiały</h3>
          <table>
            <thead>
              <tr>
                <th>Nazwa</th>
                <th>Zaplanowana ilość</th>
                <th>Jednostka</th>
              </tr>
            </thead>
            <tbody>
              ${materials.map(material => `
                <tr>
                  <td>${material.name || 'Nie określono'}</td>
                  <td>${materialQuantities[material.id] || 0}</td>
                  <td>${material.unit || 'szt.'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>

        ${task.notes ? `
        <div class="section">
          <h3>Notatki</h3>
          <p>${task.notes}</p>
        </div>
        ` : ''}

        <div class="footer">
          <p>Data wydruku: ${new Date().toLocaleDateString('pl-PL', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          })}</p>
          <p>System MRP</p>
        </div>
        
        <div style="text-align: center; margin-top: 20px;">
          <button onclick="window.print()" style="padding: 10px 20px; background-color: #2196F3; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 16px;">
            Drukuj dokument
          </button>
        </div>
      </body>
      </html>
    `;
    
    const printWindow = window.open('', '_blank');
    printWindow.document.open();
    printWindow.document.write(printContents);
    printWindow.document.close();
  }, [task, materials, materialQuantities]);

  return {
    handleStatusChange,
    handleConfirmConsumption,
    handleReceiveClick,
    handleReceiveItem,
    handleAddToInventory,
    handleStartProduction,
    handleStartProductionWithExpiry,
    handleStopProduction,
    handlePrintMaterialsAndLots,
    handlePrintMODetails,
  };
};

export default useProductionControlHandlers;
