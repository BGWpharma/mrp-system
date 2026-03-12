import { useState } from 'react';
import { useNotification } from '../useNotification';
import LabelGenerator from '../../components/cmr/LabelGenerator';

export function useCmrLabels(cmrData, itemsWeightDetails) {
  const { showError } = useNotification();

  const [labelsDialogOpen, setLabelsDialogOpen] = useState(false);
  const [currentLabels, setCurrentLabels] = useState([]);
  const [currentLabelType, setCurrentLabelType] = useState('unknown');

  const handleBoxLabel = () => {
    if (itemsWeightDetails.length === 0) {
      showError('Brak danych do wygenerowania etykiet kartonów');
      return;
    }

    const itemsWithBoxes = itemsWeightDetails.filter(item =>
      item.hasDetailedData && item.hasBoxes && item.boxesCount > 0
    );

    if (itemsWithBoxes.length === 0) {
      showError('Żadna z pozycji nie ma przypisanych kartonów');
      return;
    }

    const labels = LabelGenerator.generateBoxLabels(cmrData, itemsWithBoxes);
    setCurrentLabels(labels);
    setCurrentLabelType('box');
    setLabelsDialogOpen(true);
  };

  const handlePalletLabel = () => {
    if (itemsWeightDetails.length === 0) {
      showError('Brak danych do wygenerowania etykiet palet');
      return;
    }
    const labels = LabelGenerator.generatePalletLabels(cmrData, itemsWeightDetails);
    setCurrentLabels(labels);
    setCurrentLabelType('pallet');
    setLabelsDialogOpen(true);
  };

  const handleLabelsDialogClose = () => {
    setLabelsDialogOpen(false);
    setCurrentLabels([]);
    setCurrentLabelType('unknown');
  };

  return {
    labelsDialogOpen,
    currentLabels,
    currentLabelType,
    handleBoxLabel,
    handlePalletLabel,
    handleLabelsDialogClose
  };
}
