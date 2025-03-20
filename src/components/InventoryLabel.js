import React, { useRef, useState } from 'react';
import { useReactToPrint } from 'react-to-print';
import { QRCodeSVG } from 'qrcode.react';
import html2canvas from 'html2canvas';

const InventoryLabel = React.forwardRef(({ item, batch, onClose }, ref) => {
  const labelRef = useRef(null);
  const [isEditing, setIsEditing] = useState(false);
  const [labelData, setLabelData] = useState({
    title: item.name,
    additionalInfo: '',
    fontSize: 16,
    showQR: true
  });

  const handlePrint = useReactToPrint({
    content: () => ref.current,
    onBeforeGetContent: () => {
      // Przygotowanie do drukowania
      return Promise.resolve();
    },
    onPrintError: (error) => {
      console.error('Błąd podczas drukowania:', error);
      alert('Wystąpił błąd podczas drukowania. Spróbuj ponownie.');
    },
    onAfterPrint: () => {
      // Czynności po wydruku
      console.log('Etykieta została wydrukowana');
    },
  });

  const handleDownloadPNG = async () => {
    try {
      if (!labelRef.current) return;

      const canvas = await html2canvas(labelRef.current, {
        scale: 2, // Wyższa rozdzielczość
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false
      });

      // Konwertuj canvas na PNG
      const pngData = canvas.toDataURL('image/png');
      
      // Utwórz link do pobrania
      const link = document.createElement('a');
      link.download = `etykieta_${item.id}${batch ? `_partia_${batch.batchNumber}` : ''}.png`;
      link.href = pngData;
      link.click();
    } catch (error) {
      console.error('Błąd podczas generowania PNG:', error);
      alert('Wystąpił błąd podczas generowania pliku PNG. Spróbuj ponownie.');
    }
  };

  const handleEdit = () => {
    setIsEditing(true);
  };

  const handleSave = () => {
    setIsEditing(false);
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setLabelData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const getQRCodeData = () => {
    if (batch) {
      return JSON.stringify({
        type: 'batch',
        batchId: batch.id,
        batchNumber: batch.batchNumber,
        productId: item.id,
        productName: item.name,
        expirationDate: batch.expirationDate,
        quantity: batch.quantity
      });
    }
    return JSON.stringify({
      type: 'product',
      productId: item.id,
      productName: item.name,
      category: item.category
    });
  };

  return (
    <div className="flex flex-col items-center p-4">
      {isEditing ? (
        <div className="bg-white p-4 rounded-lg shadow-lg w-[300px] mb-4">
          <h3 className="text-lg font-semibold mb-4">Edycja etykiety</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Tytuł</label>
              <input
                type="text"
                name="title"
                value={labelData.title}
                onChange={handleChange}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Dodatkowe informacje</label>
              <textarea
                name="additionalInfo"
                value={labelData.additionalInfo}
                onChange={handleChange}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                rows="3"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Rozmiar czcionki</label>
              <input
                type="number"
                name="fontSize"
                value={labelData.fontSize}
                onChange={handleChange}
                min="12"
                max="24"
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              />
            </div>
            <div className="flex items-center">
              <input
                type="checkbox"
                name="showQR"
                checked={labelData.showQR}
                onChange={(e) => handleChange({ target: { name: 'showQR', value: e.target.checked } })}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <label className="ml-2 block text-sm text-gray-700">Pokaż kod QR</label>
            </div>
            <div className="flex justify-end space-x-2">
              <button
                onClick={() => setIsEditing(false)}
                className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors"
              >
                Anuluj
              </button>
              <button
                onClick={handleSave}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
              >
                Zapisz
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div ref={labelRef} className="bg-white p-4 rounded-lg shadow-lg w-[300px]">
        <div className="text-center mb-4" style={{ fontSize: `${labelData.fontSize}px` }}>
          <h3 className="font-semibold">{labelData.title}</h3>
          <p className="text-gray-600">ID: {item.id}</p>
          <p className="text-gray-600">Kategoria: {item.category}</p>
          {batch && (
            <>
              <p className="text-gray-600">Partia: {batch.batchNumber}</p>
              <p className="text-gray-600">Data ważności: {new Date(batch.expirationDate).toLocaleDateString()}</p>
              <p className="text-gray-600">Ilość: {batch.quantity}</p>
            </>
          )}
          {labelData.additionalInfo && (
            <p className="text-gray-600 mt-2">{labelData.additionalInfo}</p>
          )}
        </div>
        {labelData.showQR && (
          <div className="flex justify-center mb-4">
            <QRCodeSVG
              value={getQRCodeData()}
              size={200}
              level="H"
              includeMargin={true}
            />
          </div>
        )}
        <div className="text-center text-sm text-gray-500">
          Wydrukowano: {new Date().toLocaleString()}
        </div>
      </div>
      <div className="flex gap-2 mt-4">
        <button
          onClick={handlePrint}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
        >
          Drukuj
        </button>
        <button
          onClick={handleDownloadPNG}
          className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition-colors"
        >
          Pobierz PNG
        </button>
        <button
          onClick={handleEdit}
          className="px-4 py-2 bg-yellow-600 text-white rounded hover:bg-yellow-700 transition-colors"
        >
          Edytuj
        </button>
        <button
          onClick={onClose}
          className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors"
        >
          Zamknij
        </button>
      </div>
    </div>
  );
});

export default InventoryLabel; 