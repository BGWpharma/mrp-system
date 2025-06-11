import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';

// Service for generating End Product Report PDF
export const generateEndProductReportPDF = async (task, additionalData = {}) => {
  try {
    if (!task) {
      throw new Error('Task data is required for generating the report');
    }

    const {
      companyData = {},
      workstationData = {},
      productionHistory = [],
      formResponses = {},
      clinicalAttachments = [],
      ingredientAttachments = {},
      ingredientBatchAttachments = {},
      materials = [],
      currentUser = {}
    } = additionalData;

    // Create PDF document in A4 format
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 20;
    const contentWidth = pageWidth - 2 * margin;

    // Load template background image
    const templateImg = await loadBackgroundTemplate();
    
    let currentY = margin;
    let pageNumber = 1;

    // Function to add a new page with template background
    const addPageWithTemplate = () => {
      if (pageNumber > 1) {
        doc.addPage();
      }
      
      // Add template background if available
      if (templateImg) {
        doc.addImage(templateImg, 'PNG', 0, 0, pageWidth, pageHeight);
      }
      
      currentY = margin + 30; // Leave space for template header
      pageNumber++;
    };

    // Initialize first page
    addPageWithTemplate();

    // Helper function to check if we need a new page
    const checkPageBreak = (requiredHeight) => {
      if (currentY + requiredHeight > pageHeight - margin) {
        addPageWithTemplate();
      }
    };

    // Helper function to add section header
    const addSectionHeader = (number, title, color = '#1976d2') => {
      checkPageBreak(15);
      
      doc.setFillColor(color);
      doc.circle(margin + 8, currentY + 4, 4, 'F');
      
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text(number.toString(), margin + 8, currentY + 6, { align: 'center' });
      
      doc.setTextColor(color);
      doc.setFontSize(16);
      doc.text(title, margin + 20, currentY + 6);
      
      currentY += 15;
    };

    // Helper function to add subsection header
    const addSubsectionHeader = (number, title, color = '#4caf50') => {
      checkPageBreak(10);
      
      doc.setFillColor(color);
      doc.roundedRect(margin, currentY, 20, 6, 3, 3, 'F');
      
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text(number, margin + 10, currentY + 4, { align: 'center' });
      
      doc.setTextColor(color);
      doc.setFontSize(12);
      doc.text(title, margin + 25, currentY + 4);
      
      currentY += 12;
    };

    // Helper function to add field
    const addField = (label, value, isMultiline = false) => {
      checkPageBreak(isMultiline ? 15 : 8);
      
      doc.setTextColor(85, 85, 85);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.text(label + ':', margin, currentY);
      
      doc.setTextColor(0, 0, 0);
      doc.setFont('helvetica', 'normal');
      
      if (isMultiline && value && value.length > 50) {
        const lines = doc.splitTextToSize(value, contentWidth - 30);
        doc.text(lines, margin, currentY + 4);
        currentY += Math.max(8, lines.length * 4);
      } else {
        doc.text(value || 'Not specified', margin, currentY + 4);
        currentY += 8;
      }
    };

    // Helper function to add table with dynamic row heights
    const addTable = (headers, data, options = {}) => {
      const {
        headerColor = [25, 118, 210],
        alternateRowColor = [245, 245, 245],
        fontSize = 8,
        minRowHeight = 6,
        padding = 2
      } = options;

      if (data.length === 0) {
        doc.setTextColor(150, 150, 150);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'italic');
        doc.text('No data available', margin, currentY);
        currentY += 8;
        return;
      }

      const colWidth = contentWidth / headers.length;
      const availableWidth = colWidth - (padding * 2);
      
      // Set font for calculations
      doc.setFontSize(fontSize);
      doc.setFont('helvetica', 'normal');

      // Calculate row heights based on content
      const rowHeights = [];
      
      // Calculate header height
      if (headers.length > 0) {
        let headerHeight = minRowHeight;
        headers.forEach(header => {
          const lines = doc.splitTextToSize(header, availableWidth);
          const requiredHeight = Math.max(minRowHeight, lines.length * 4 + padding);
          headerHeight = Math.max(headerHeight, requiredHeight);
        });
        rowHeights.push(headerHeight);
      }

      // Calculate data row heights
      data.forEach(row => {
        let maxRowHeight = minRowHeight;
        row.forEach(cell => {
          const cellText = cell ? cell.toString() : '';
          if (cellText.length > 0) {
            const lines = doc.splitTextToSize(cellText, availableWidth);
            const requiredHeight = Math.max(minRowHeight, lines.length * 4 + padding);
            maxRowHeight = Math.max(maxRowHeight, requiredHeight);
          }
        });
        rowHeights.push(maxRowHeight);
      });

      // Calculate total table height
      const totalTableHeight = rowHeights.reduce((sum, height) => sum + height, 0);
      checkPageBreak(totalTableHeight + 10);

      const startY = currentY;
      let rowStartY = currentY;

      // Draw headers
      if (headers.length > 0) {
        const headerHeight = rowHeights[0];
        
        doc.setFillColor(...headerColor);
        doc.rect(margin, rowStartY, contentWidth, headerHeight, 'F');
        
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(fontSize);
        doc.setFont('helvetica', 'bold');
        
        headers.forEach((header, index) => {
          const lines = doc.splitTextToSize(header, availableWidth);
          const startX = margin + (index * colWidth) + padding;
          const startTextY = rowStartY + padding + 3;
          
          lines.forEach((line, lineIndex) => {
            doc.text(line, startX, startTextY + (lineIndex * 4));
          });
        });
        
        rowStartY += headerHeight;
      }

      // Draw data rows
      doc.setTextColor(0, 0, 0);
      doc.setFont('helvetica', 'normal');
      
      data.forEach((row, rowIndex) => {
        const dataRowIndex = headers.length > 0 ? rowIndex + 1 : rowIndex;
        const rowHeight = rowHeights[dataRowIndex];
        
        // Alternate row background
        if (rowIndex % 2 === 1) {
          doc.setFillColor(...alternateRowColor);
          doc.rect(margin, rowStartY, contentWidth, rowHeight, 'F');
        }
        
        // Draw cell content
        row.forEach((cell, colIndex) => {
          const cellText = cell ? cell.toString() : '';
          if (cellText.length > 0) {
            const lines = doc.splitTextToSize(cellText, availableWidth);
            const startX = margin + (colIndex * colWidth) + padding;
            const startTextY = rowStartY + padding + 3;
            
            lines.forEach((line, lineIndex) => {
              doc.text(line, startX, startTextY + (lineIndex * 4));
            });
          }
        });
        
        rowStartY += rowHeight;
      });

      currentY = rowStartY;

      // Draw table borders
      doc.setDrawColor(200, 200, 200);
      doc.setLineWidth(0.1);
      
      // Outer border
      doc.rect(margin, startY, contentWidth, currentY - startY);
      
      // Horizontal lines between rows
      let lineY = startY;
      rowHeights.forEach(height => {
        lineY += height;
        if (lineY < currentY) {
          doc.line(margin, lineY, margin + contentWidth, lineY);
        }
      });
      
      // Vertical column lines
      for (let i = 1; i < headers.length; i++) {
        const lineX = margin + (i * colWidth);
        doc.line(lineX, startY, lineX, currentY);
      }

      currentY += 5;
    };

    // 1. Product identification
    addSectionHeader(1, 'Product identification', '#1976d2');
    
    addField('SKU', task?.recipeName || task?.productName);
    addField('Description', task?.recipe?.description || task?.description, true);
    addField('Version', task?.recipeVersion || '1');
    addField('Report creation date', new Date().toLocaleDateString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }));
    addField('User', currentUser?.displayName || currentUser?.email || 'Unknown user');

    currentY += 10;

    // 2. TDS Specification
    addSectionHeader(2, 'TDS Specification', '#ff9800');
    
    addField('Date', task?.recipe?.updatedAt 
      ? (task.recipe.updatedAt && typeof task.recipe.updatedAt === 'object' && typeof task.recipe.updatedAt.toDate === 'function'
        ? task.recipe.updatedAt.toDate().toLocaleDateString('en-GB')
        : new Date(task.recipe.updatedAt).toLocaleDateString('en-GB'))
      : 'No data');
    
    addField('Expiration date', task?.expiryDate 
      ? (task.expiryDate instanceof Date 
        ? task.expiryDate.toLocaleDateString('en-GB')
        : typeof task.expiryDate === 'string'
          ? new Date(task.expiryDate).toLocaleDateString('en-GB')
          : task.expiryDate && task.expiryDate.toDate
            ? task.expiryDate.toDate().toLocaleDateString('en-GB')
            : 'Not specified')
      : 'Not specified');

    // Microelements + Nutrition data
    if (task?.recipe?.micronutrients && task.recipe.micronutrients.length > 0) {
      currentY += 5;
      doc.setTextColor(85, 85, 85);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text('Microelements + Nutrition data:', margin, currentY);
      currentY += 8;

      const microHeaders = ['Code', 'Name', 'Quantity', 'Unit', 'Category'];
      const microData = task.recipe.micronutrients.map(micro => [
        micro.code || '',
        micro.name || '',
        micro.quantity?.toString() || '',
        micro.unit || '',
        micro.category || ''
      ]);

      addTable(microHeaders, microData);
    }

    currentY += 10;

    // 3. Active Ingredients
    addSectionHeader(3, 'Active Ingredients', '#4caf50');

    // 3.1 List of materials
    addSubsectionHeader('3.1', 'List of materials');
    
    if (task?.recipe?.ingredients && task.recipe.ingredients.length > 0) {
      const ingredientHeaders = ['Ingredient name', 'Quantity', 'Unit', 'CAS Number', 'Notes'];
      const ingredientData = task.recipe.ingredients.map(ingredient => [
        ingredient.name || '',
        ingredient.quantity?.toString() || '',
        ingredient.unit || '',
        ingredient.casNumber || '-',
        ingredient.notes || '-'
      ]);

      addTable(ingredientHeaders, ingredientData);

      // Summary
      doc.setTextColor(25, 118, 210);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.text(`Total ingredients: ${task.recipe.ingredients.length}`, margin, currentY);
      doc.setTextColor(85, 85, 85);
      doc.setFont('helvetica', 'normal');
      doc.text(`Ingredients for ${task.recipe.yield?.quantity || 1} ${task.recipe.yield?.unit || 'pcs'} of product`, margin, currentY + 4);
      currentY += 12;
    }

    // 3.2 Expiration date of materials
    if (task?.consumedMaterials && task.consumedMaterials.length > 0) {
      addSubsectionHeader('3.2', 'Expiration date of materials');
      
      const expiryHeaders = ['Material name', 'Batch', 'Quantity', 'Unit', 'Expiration date'];
      const expiryData = task.consumedMaterials.map(consumed => {
        const material = materials.find(m => (m.inventoryItemId || m.id) === consumed.materialId);
        const materialName = consumed.materialName || material?.name || 'Unknown material';
        const materialUnit = consumed.unit || material?.unit || '-';
        
        let batchNumber = consumed.batchNumber || consumed.lotNumber || '-';
        if (batchNumber === '-' && task.materialBatches && task.materialBatches[consumed.materialId]) {
          const batch = task.materialBatches[consumed.materialId].find(b => b.batchId === consumed.batchId);
          if (batch && batch.batchNumber) {
            batchNumber = batch.batchNumber;
          }
        }
        
        let formattedExpiryDate = 'Not specified';
        if (consumed.expiryDate) {
          const expiry = consumed.expiryDate instanceof Date 
            ? consumed.expiryDate 
            : consumed.expiryDate.toDate 
              ? consumed.expiryDate.toDate() 
              : new Date(consumed.expiryDate);
          formattedExpiryDate = expiry.toLocaleDateString('en-GB');
        }
        
        return [
          materialName,
          batchNumber,
          (consumed.quantity || consumed.consumedQuantity || '-').toString(),
          materialUnit,
          formattedExpiryDate
        ];
      });

      addTable(expiryHeaders, expiryData);

      // Summary
      doc.setTextColor(25, 118, 210);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.text(`Summary: ${task.consumedMaterials.length} consumed materials`, margin, currentY);
      doc.setTextColor(85, 85, 85);
      doc.setFont('helvetica', 'normal');
      doc.text(`• With expiration date: ${task.consumedMaterials.filter(m => m.expiryDate).length}`, margin, currentY + 4);
      doc.text(`• Used batches: ${[...new Set(task.consumedMaterials.map(m => m.batchNumber || m.lotNumber || m.batchId).filter(Boolean))].length}`, margin, currentY + 8);
      currentY += 16;
    }

    // 3.3 Clinical and bibliographic research
    addSubsectionHeader('3.3', 'Clinical and bibliographic research');
    
    if (clinicalAttachments.length > 0) {
      const clinicalHeaders = ['File type', 'File name', 'Size', 'Upload date'];
      const clinicalData = clinicalAttachments.map(attachment => [
        getFileTypeFromExtension(attachment.fileName),
        attachment.fileName,
        formatFileSize(attachment.size),
        new Date(attachment.uploadedAt).toLocaleDateString('en-GB')
      ]);

      addTable(clinicalHeaders, clinicalData);

      // Summary
      doc.setTextColor(25, 118, 210);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.text(`Total documents: ${clinicalAttachments.length}`, margin, currentY);
      doc.setTextColor(85, 85, 85);
      doc.setFont('helvetica', 'normal');
      doc.text(`Total size: ${formatFileSize(clinicalAttachments.reduce((sum, attachment) => sum + attachment.size, 0))}`, margin, currentY + 4);
      currentY += 12;
    } else {
      doc.setTextColor(150, 150, 150);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'italic');
      doc.text('No clinical research documents attached', margin, currentY);
      currentY += 8;
    }

    currentY += 10;

    // 4. Physicochemical properties
    addSectionHeader(4, 'Physicochemical properties', '#ffc107');
    
    if (Object.keys(ingredientAttachments).length > 0) {
      Object.entries(ingredientAttachments).forEach(([ingredientName, attachments]) => {
        checkPageBreak(20);
        
        doc.setTextColor(25, 118, 210);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text(ingredientName, margin, currentY);
        currentY += 6;

        const physHeaders = ['File name', 'Size', 'PO Number', 'Upload date'];
        const physData = attachments.map(attachment => [
          attachment.fileName,
          formatFileSize(attachment.size),
          attachment.poNumber,
          new Date(attachment.uploadedAt).toLocaleDateString('en-GB')
        ]);

        addTable(physHeaders, physData, { fontSize: 7 });
        currentY += 5;
      });

      // Global summary
      const totalAttachments = Object.values(ingredientAttachments).reduce((sum, attachments) => sum + attachments.length, 0);
      const totalSize = Object.values(ingredientAttachments).flat().reduce((sum, attachment) => sum + attachment.size, 0);
      const uniquePOs = [...new Set(Object.values(ingredientAttachments).flat().map(a => a.poNumber))].length;

      doc.setTextColor(25, 118, 210);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.text('Physicochemical attachments summary:', margin, currentY);
      doc.setTextColor(85, 85, 85);
      doc.setFont('helvetica', 'normal');
      doc.text(`• Ingredients with attachments: ${Object.keys(ingredientAttachments).length}`, margin, currentY + 4);
      doc.text(`• Total attachments: ${totalAttachments}`, margin, currentY + 8);
      doc.text(`• Related purchase orders: ${uniquePOs}`, margin, currentY + 12);
      doc.text(`• Total size: ${formatFileSize(totalSize)}`, margin, currentY + 16);
      currentY += 24;
    } else {
      doc.setTextColor(150, 150, 150);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'italic');
      doc.text('No physicochemical attachments from related purchase orders', margin, currentY);
      currentY += 8;
    }

    currentY += 10;

    // 5. Production
    addSectionHeader(5, 'Production', '#e91e63');
    
    addField('Start date', productionHistory && productionHistory.length > 0
      ? formatDateTime(productionHistory[0].startTime)
      : 'No production history data');
    
    addField('End date', productionHistory && productionHistory.length > 0
      ? formatDateTime(productionHistory[productionHistory.length - 1].endTime)
      : 'No production history data');
    
    addField('MO number', task?.moNumber || 'Not specified');
    addField('Company name', companyData?.name || 'Loading...');
    addField('Address', companyData?.address || companyData ? `${companyData.address || ''} ${companyData.city || ''}`.trim() : 'Loading...');
    addField('Workstation', workstationData === null 
      ? 'Loading...' 
      : workstationData?.name 
        ? workstationData.name 
        : 'No workstation assigned');
    
    addField('Time per unit', task?.productionTimePerUnit 
      ? `${task.productionTimePerUnit} min/pcs`
      : task?.recipe?.productionTimePerUnit
        ? `${task.recipe.productionTimePerUnit} min/pcs`
        : 'Not specified');

    // History of production
    if (productionHistory && productionHistory.length > 0) {
      currentY += 5;
      doc.setTextColor(85, 85, 85);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text('History of production:', margin, currentY);
      currentY += 8;

      const historyHeaders = ['Start date', 'End date', 'Quantity', 'Time spent'];
      const historyData = productionHistory.map(session => [
        formatDateTime(session.startTime),
        formatDateTime(session.endTime),
        `${session.quantity} ${task?.unit || 'pcs'}`,
        session.timeSpent ? `${session.timeSpent} min` : '-'
      ]);

      // Add summary row
      const totalQuantity = productionHistory.reduce((sum, session) => sum + (parseFloat(session.quantity) || 0), 0);
      const totalTime = productionHistory.reduce((sum, session) => sum + (session.timeSpent || 0), 0);
      historyData.push([
        'Total:', '',
        `${totalQuantity.toFixed(3)} ${task?.unit || 'pcs'}`,
        `${totalTime} min`
      ]);

      addTable(historyHeaders, historyData);
    }

    // Report Data from Completed MO Forms
    if (formResponses?.completedMO && formResponses.completedMO.length > 0) {
      currentY += 5;
      doc.setTextColor(85, 85, 85);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text('Report Data from Completed MO Forms:', margin, currentY);
      currentY += 8;

      formResponses.completedMO.forEach((report, index) => {
        checkPageBreak(30);
        
        doc.setTextColor(25, 118, 210);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.text(`Report #${index + 1} - ${formatDateTime(report.date)}`, margin, currentY);
        currentY += 6;

        addField('Completion time', report.time || 'Not provided');
        addField('Responsible person', report.email || 'Not provided');
        addField('Final product quantity', report.productQuantity ? `${report.productQuantity} ${task?.unit || 'pcs'}` : 'Not provided');
        addField('Packaging loss', report.packagingLoss || 'No loss');
        addField('Lid loss', report.bulkLoss || 'No loss');
        addField('Raw material loss', report.rawMaterialLoss || 'No loss', true);
        
        if (report.mixingPlanReportUrl) {
          addField('Mixing plan report', report.mixingPlanReportName || 'Available (see digital copy)');
        }
        
        currentY += 8;
      });
    }

    currentY += 10;

    // 6. Quality control
    addSectionHeader(6, 'Quality control', '#9c27b0');
    
    if (formResponses?.productionControl && formResponses.productionControl.length > 0) {
      formResponses.productionControl.forEach((report, index) => {
        checkPageBreak(80); // More space needed for detailed report
        
        doc.setTextColor(76, 175, 80);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text(`Control Report #${index + 1} - ${formatDateTime(report.fillDate)}`, margin, currentY);
        currentY += 10;

        // Identification section
        doc.setTextColor(25, 118, 210);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text('Identification:', margin, currentY);
        currentY += 8;

        addField('Name and surname', report.name || 'Not provided');
        addField('Position', report.position || 'Not provided');
        addField('Completion date', formatDateTime(report.fillDate));
        
        currentY += 5;

        // Production control protocol section
        doc.setTextColor(25, 118, 210);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text('Production control protocol:', margin, currentY);
        currentY += 8;

        addField('Customer Order', report.customerOrder || 'Not provided');
        addField('Production start date', formatDateTime(report.productionStartDate));
        addField('Production start time', report.productionStartTime || 'Not provided');
        addField('Production end date', formatDateTime(report.productionEndDate));
        addField('Production end time', report.productionEndTime || 'Not provided');
        addField('Conditions reading date', formatDateTime(report.readingDate));
        addField('Conditions reading time', report.readingTime || 'Not provided');

        currentY += 5;

        // Product data section
        doc.setTextColor(25, 118, 210);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text('Product data:', margin, currentY);
        currentY += 8;

        addField('Product name', report.productName || task?.productName || 'Not provided');
        addField('LOT number', report.lotNumber || 'Not provided');
        addField('Expiration date (EXP)', report.expiryDate || 'Not provided');
        addField('Quantity (pcs)', report.quantity ? `${report.quantity} pcs` : 'Not provided');
        addField('Shift number', Array.isArray(report.shiftNumber) ? report.shiftNumber.join(', ') : (report.shiftNumber || 'Not provided'));

        currentY += 5;

        // Atmospheric conditions section
        doc.setTextColor(25, 118, 210);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text('Atmospheric conditions:', margin, currentY);
        currentY += 8;

        addField('Air humidity', report.humidity || 'Not provided');
        addField('Air temperature', report.temperature || 'Not provided');

        currentY += 5;

        // Quality control section
        doc.setTextColor(25, 118, 210);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text('Quality control:', margin, currentY);
        currentY += 8;

        addField('Raw material purity', report.rawMaterialPurity || 'Not provided');
        addField('Packaging purity', report.packagingPurity || 'Not provided');
        addField('Packaging closure', report.packagingClosure || 'Not provided');
        addField('Quantity on pallet', report.packagingQuantity || 'Not provided');

        // Additional quality control fields if available
        if (report.additionalControls && typeof report.additionalControls === 'object') {
          Object.entries(report.additionalControls).forEach(([key, value]) => {
            if (value && typeof value === 'string') {
              const formattedKey = key.replace(/([A-Z])/g, ' $1').toLowerCase().replace(/^./, str => str.toUpperCase());
              addField(formattedKey, value);
            }
          });
        }

        // Attachments section if available
        const attachmentFields = [
          { key: 'documentScansUrl', name: 'documentScansName', label: 'Document scans' },
          { key: 'productPhoto1Url', name: 'productPhoto1Name', label: 'Product photo 1' },
          { key: 'productPhoto2Url', name: 'productPhoto2Name', label: 'Product photo 2' },
          { key: 'productPhoto3Url', name: 'productPhoto3Name', label: 'Product photo 3' }
        ];

        const availableAttachments = attachmentFields.filter(field => report[field.key]);
        
        if (availableAttachments.length > 0) {
          currentY += 5;
          doc.setTextColor(25, 118, 210);
          doc.setFontSize(10);
          doc.setFont('helvetica', 'bold');
          doc.text('Attachments:', margin, currentY);
          currentY += 8;

          availableAttachments.forEach(attachment => {
            addField(attachment.label, report[attachment.name] || 'Available (see digital copy)');
          });
        }

        // Comments/Notes if available
        if (report.comments || report.notes) {
          currentY += 5;
          doc.setTextColor(25, 118, 210);
          doc.setFontSize(10);
          doc.setFont('helvetica', 'bold');
          doc.text('Comments/Notes:', margin, currentY);
          currentY += 8;
          
          addField('Comments', report.comments || report.notes || '', true);
        }
        
        currentY += 10;
      });
    } else {
      doc.setTextColor(150, 150, 150);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'italic');
      doc.text('No quality control reports for this task', margin, currentY);
      currentY += 8;
    }

    currentY += 10;

    // 7. Allergens
    addSectionHeader(7, 'Allergens', '#ff5722');
    
    if (additionalData.selectedAllergens && additionalData.selectedAllergens.length > 0) {
      // Add section description
      doc.setTextColor(85, 85, 85);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.text('The following allergens are present in this product:', margin, currentY);
      currentY += 8;

      // Create allergen table
      const allergenHeaders = ['Allergen name', 'Status'];
      const allergenData = additionalData.selectedAllergens.map(allergen => [
        allergen,
        'PRESENT'
      ]);

      addTable(allergenHeaders, allergenData, { 
        headerColor: [255, 87, 34],
        fontSize: 9 
      });

      // Add regulatory notice
      doc.setTextColor(255, 87, 34);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.text('ALLERGEN WARNING:', margin, currentY);
      doc.setTextColor(85, 85, 85);
      doc.setFont('helvetica', 'normal');
      doc.text('This product contains or may contain the allergens listed above.', margin, currentY + 4);
      doc.text('Please refer to product labeling for complete allergen information.', margin, currentY + 8);
      currentY += 16;
    } else {
      doc.setTextColor(150, 150, 150);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'italic');
      doc.text('No allergen information provided for this product', margin, currentY);
      currentY += 8;
    }

    // Add footer to last page
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setTextColor(150, 150, 150);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.text(
        `Page ${i} of ${pageCount} | Generated on ${new Date().toLocaleDateString('en-GB')} ${new Date().toLocaleTimeString('en-GB')}`,
        pageWidth / 2,
        pageHeight - 10,
        { align: 'center' }
      );
    }

    // Save the PDF
    const fileName = `End_Product_Report_MO_${task.moNumber || task.id}_${new Date().toISOString().split('T')[0]}.pdf`;
    doc.save(fileName);

    return { success: true, fileName };

  } catch (error) {
    console.error('Error generating End Product Report PDF:', error);
    throw new Error(`Failed to generate PDF report: ${error.message}`);
  }
};

// Helper function to load background template
const loadBackgroundTemplate = async () => {
  try {
    const response = await fetch('/templates/end-product-raport-template.png');
    if (!response.ok) {
      console.warn('Template image not found, proceeding without background');
      return null;
    }
    
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.warn('Could not load template image:', error);
    return null;
  }
};

// Helper function to format file size
const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

// Helper function to get file type from extension
const getFileTypeFromExtension = (fileName) => {
  const extension = fileName.split('.').pop().toLowerCase();
  const typeMap = {
    'pdf': 'PDF',
    'doc': 'DOC',
    'docx': 'DOCX',
    'jpg': 'JPG',
    'jpeg': 'JPEG',
    'png': 'PNG',
    'gif': 'GIF',
    'txt': 'TXT'
  };
  return typeMap[extension] || 'FILE';
};

// Helper function to format date and time
const formatDateTime = (dateTime) => {
  if (!dateTime) return 'Not specified';
  
  try {
    let date;
    if (dateTime && typeof dateTime === 'object' && typeof dateTime.toDate === 'function') {
      date = dateTime.toDate();
    } else if (typeof dateTime === 'string') {
      date = new Date(dateTime);
    } else {
      date = dateTime;
    }
    
    if (isNaN(date.getTime())) {
      return 'Invalid date';
    }
    
    return date.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch (error) {
    console.error('Error formatting date:', error);
    return 'Date error';
  }
}; 