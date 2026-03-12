import { useState } from 'react';
import { useNotification } from '../useNotification';
import { useTranslation } from '../useTranslation';
import {
  calculatePalletWeights,
  calculateBoxWeights,
  getInventoryDataFromBatches
} from '../../utils/calculations';

export function useCmrWeights() {
  const { showError } = useNotification();
  const { t } = useTranslation('cmr');

  const [itemsWeightDetails, setItemsWeightDetails] = useState([]);
  const [weightDetailsLoading, setWeightDetailsLoading] = useState(false);
  const [weightSummary, setWeightSummary] = useState({
    totalWeight: 0,
    totalPallets: 0,
    totalBoxes: 0,
    itemsBreakdown: []
  });

  const calculateItemsWeightDetails = async (items) => {
    if (!items || items.length === 0) {
      setItemsWeightDetails([]);
      setWeightSummary({
        totalWeight: 0,
        totalPallets: 0,
        totalBoxes: 0,
        itemsBreakdown: []
      });
      return;
    }

    setWeightDetailsLoading(true);

    try {
      const weightDetails = [];
      let totalWeight = 0;
      let totalPallets = 0;
      let totalBoxes = 0;

      for (const item of items) {
        const weight = parseFloat(item.weight) || 0;
        totalWeight += weight;

        if (item.linkedBatches && item.linkedBatches.length > 0) {
          try {
            const inventoryData = await getInventoryDataFromBatches(item.linkedBatches);

            if (inventoryData) {
              const palletData = calculatePalletWeights({
                quantity: parseFloat(item.quantity) || 0,
                unitWeight: inventoryData.weight || 0,
                itemsPerBox: inventoryData.itemsPerBox || 0,
                boxesPerPallet: inventoryData.boxesPerPallet || 0
              });

              let boxData = { fullBox: null, partialBox: null, totalBoxes: 0 };
              if (inventoryData.itemsPerBox && inventoryData.itemsPerBox > 0) {
                boxData = calculateBoxWeights({
                  quantity: parseFloat(item.quantity) || 0,
                  unitWeight: inventoryData.weight || 0,
                  itemsPerBox: inventoryData.itemsPerBox
                });
              }

              totalPallets += palletData.palletsCount;
              totalBoxes += boxData.totalBoxes;

              weightDetails.push({
                itemId: item.id || item.description,
                description: item.description,
                quantity: item.quantity,
                unit: item.unit,
                weight: weight,
                barcode: inventoryData.barcode,
                hasDetailedData: true,
                palletsCount: palletData.palletsCount,
                pallets: palletData.pallets,
                boxesCount: boxData.totalBoxes,
                boxes: boxData,
                hasBoxes: inventoryData.itemsPerBox && inventoryData.itemsPerBox > 0,
                linkedBatches: item.linkedBatches.map(batch => ({
                  ...batch,
                  ...(inventoryData.batchData ? {
                    orderNumber: inventoryData.batchData.orderNumber,
                    moNumber: inventoryData.batchData.moNumber,
                    expiryDate: inventoryData.batchData.expiryDate,
                    lotNumber: inventoryData.batchData.lotNumber,
                    batchNumber: inventoryData.batchData.batchNumber
                  } : {})
                })),
                inventoryData: {
                  itemsPerBox: inventoryData.itemsPerBox || 0,
                  boxesPerPallet: inventoryData.boxesPerPallet || 0,
                  unitWeight: inventoryData.weight,
                  barcode: inventoryData.barcode
                }
              });
            } else {
              weightDetails.push({
                itemId: item.id || item.description,
                description: item.description,
                quantity: item.quantity,
                unit: item.unit,
                weight: weight,
                barcode: inventoryData?.barcode,
                hasDetailedData: false,
                palletsCount: 0,
                pallets: [],
                boxesCount: 0,
                boxes: { fullBox: null, partialBox: null },
                linkedBatches: item.linkedBatches.map(batch => ({
                  ...batch,
                  ...(inventoryData?.batchData ? {
                    orderNumber: inventoryData.batchData.orderNumber,
                    moNumber: inventoryData.batchData.moNumber,
                    expiryDate: inventoryData.batchData.expiryDate,
                    lotNumber: inventoryData.batchData.lotNumber,
                    batchNumber: inventoryData.batchData.batchNumber
                  } : {})
                })),
                inventoryData: null
              });
            }
          } catch (error) {
            console.error('Błąd podczas obliczania wagi dla pozycji:', error);
            weightDetails.push({
              itemId: item.id || item.description,
              description: item.description,
              quantity: item.quantity,
              unit: item.unit,
              weight: weight,
              barcode: null,
              hasDetailedData: false,
              palletsCount: 0,
              pallets: [],
              boxesCount: 0,
              boxes: { fullBox: null, partialBox: null },
              linkedBatches: item.linkedBatches,
              inventoryData: null,
              error: error.message
            });
          }
        } else {
          weightDetails.push({
            itemId: item.id || item.description,
            description: item.description,
            quantity: item.quantity,
            unit: item.unit,
            weight: weight,
            barcode: null,
            hasDetailedData: false,
            palletsCount: 0,
            pallets: [],
            boxesCount: 0,
            boxes: { fullBox: null, partialBox: null },
            linkedBatches: item.linkedBatches || [],
            inventoryData: null
          });
        }
      }

      setItemsWeightDetails(weightDetails);
      setWeightSummary({
        totalWeight: Number(totalWeight.toFixed(3)),
        totalPallets,
        totalBoxes,
        itemsBreakdown: weightDetails
      });

    } catch (error) {
      console.error('Błąd podczas obliczania szczegółów wag:', error);
      showError(t('details.errors.loadingWeights'));
    } finally {
      setWeightDetailsLoading(false);
    }
  };

  return {
    itemsWeightDetails,
    weightDetailsLoading,
    weightSummary,
    calculateItemsWeightDetails
  };
}
