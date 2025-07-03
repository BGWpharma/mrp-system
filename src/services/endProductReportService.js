import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { PDFDocument, rgb } from 'pdf-lib';

// Helper function to translate quality control values to English
const translateQualityValue = (value) => {
  if (!value || typeof value !== 'string') return value;
  
  const translations = {
    'Prawidłowa': 'Correct',
    'Nieprawidłowa': 'Incorrect',
    'prawidłowa': 'Correct',
    'nieprawidłowa': 'Incorrect'
  };
  
  return translations[value] || value;
};

// Helper function to translate shift numbers to English
const translateShiftNumber = (value) => {
  if (!value) return value;
  
  if (Array.isArray(value)) {
    return value.map(shift => 
      typeof shift === 'string' ? shift.replace(/Zmiana/g, 'Shift') : shift
    ).join(', ');
  }
  
  if (typeof value === 'string') {
    return value.replace(/Zmiana/g, 'Shift');
  }
  
  return value;
};

// Helper function to translate position names to English
const translatePosition = (value) => {
  if (!value || typeof value !== 'string') return value;
  
  const positions = {
    // Management positions
    'Mistrz produkcji': 'Production Master',
    'Kierownik Magazynu': 'Warehouse Manager',
    'Kierownik produkcji': 'Production Manager',
    'Kierownik jakości': 'Quality Manager',
    'Kierownik': 'Manager',
    
    // Production positions
    'Operator': 'Operator',
    'Operator produkcji': 'Production Operator',
    'Specjalista produkcji': 'Production Specialist',
    'Pracownik produkcji': 'Production Worker',
    'Technolog': 'Technologist',
    
    // Quality positions
    'Kontroler jakości': 'Quality Controller',
    'Specjalista jakości': 'Quality Specialist',
    'Inspektor jakości': 'Quality Inspector',
    
    // Warehouse positions
    'Magazynier': 'Warehouse Worker',
    'Specjalista magazynu': 'Warehouse Specialist',
    'Operator magazynu': 'Warehouse Operator',
    
    // Other positions
    'Stanowiska': 'Position', // Generic fallback
    'Administrator': 'Administrator',
    'Koordynator': 'Coordinator'
  };
  
  return positions[value] || value;
};

// Helper function to replace Polish characters in address
const normalizePolishChars = (text) => {
  if (!text || typeof text !== 'string') return text;
  
  return text
    .replace(/ł/g, 'l')
    .replace(/Ł/g, 'L')
    .replace(/ą/g, 'a')
    .replace(/Ą/g, 'A')
    .replace(/ć/g, 'c')
    .replace(/Ć/g, 'C')
    .replace(/ę/g, 'e')
    .replace(/Ę/g, 'E')
    .replace(/ń/g, 'n')
    .replace(/Ń/g, 'N')
    .replace(/ó/g, 'o')
    .replace(/Ó/g, 'O')
    .replace(/ś/g, 's')
    .replace(/Ś/g, 'S')
    .replace(/ź/g, 'z')
    .replace(/Ź/g, 'Z')
    .replace(/ż/g, 'z')
    .replace(/Ż/g, 'Z');
};

// Function to append attachments to the PDF report
const appendAttachmentsToReport = async (doc, attachments) => {
  if (!attachments || attachments.length === 0) {
    console.log('No attachments provided to append');
    return null;
  }

  console.log(`Starting to process ${attachments.length} attachments:`, attachments);

  try {
    // Get the current PDF as ArrayBuffer
    const pdfBytes = doc.output('arraybuffer');
    const existingPdfDoc = await PDFDocument.load(pdfBytes);
    console.log('Successfully loaded existing PDF document');
    
    let successfulAttachments = 0;
    
    for (const attachment of attachments) {
      try {
        if (!attachment.fileUrl || !attachment.fileType) {
          console.warn('Invalid attachment (missing fileUrl or fileType):', attachment);
          continue;
        }

        console.log(`Processing attachment: ${attachment.fileName} (${attachment.fileType}) from URL: ${attachment.fileUrl}`);
        
        // Fetch the file
        const response = await fetch(attachment.fileUrl, {
          method: 'GET',
          mode: 'cors'
        });
        
        if (!response.ok) {
          console.error(`Failed to fetch attachment: ${attachment.fileName}, Status: ${response.status}, StatusText: ${response.statusText}`);
          continue;
        }

        console.log(`Successfully fetched ${attachment.fileName}, size: ${response.headers.get('content-length')} bytes`);
        
        const arrayBuffer = await response.arrayBuffer();
        
        if (attachment.fileType.toLowerCase() === 'pdf') {
          // Handle PDF files
          const attachmentPdfDoc = await PDFDocument.load(arrayBuffer);
          const pageIndices = attachmentPdfDoc.getPageIndices();
          
          // Copy all pages from the attachment PDF
          const copiedPages = await existingPdfDoc.copyPages(attachmentPdfDoc, pageIndices);
          copiedPages.forEach((page) => existingPdfDoc.addPage(page));
          
        } else if (['png', 'jpg', 'jpeg'].includes(attachment.fileType.toLowerCase())) {
          // Handle image files
          let image;
          if (attachment.fileType.toLowerCase() === 'png') {
            image = await existingPdfDoc.embedPng(arrayBuffer);
          } else {
            image = await existingPdfDoc.embedJpg(arrayBuffer);
          }
          
          // Create a new page for the image (A4 size)
          const page = existingPdfDoc.addPage([595.28, 841.89]); // A4 in points
          const { width: pageWidth, height: pageHeight } = page.getSize();
          
          // Calculate scaling to fit the image on the page while maintaining aspect ratio
          const imageAspectRatio = image.width / image.height;
          const pageAspectRatio = pageWidth / pageHeight;
          
          let imageWidth, imageHeight;
          const margin = 40; // Larger margin for better presentation
          
          if (imageAspectRatio > pageAspectRatio) {
            // Image is wider than page aspect ratio
            imageWidth = pageWidth - 2 * margin;
            imageHeight = imageWidth / imageAspectRatio;
          } else {
            // Image is taller than page aspect ratio
            imageHeight = pageHeight - 2 * margin - 60; // Leave space for filename
            imageWidth = imageHeight * imageAspectRatio;
          }
          
          // Center the image on the page
          const x = (pageWidth - imageWidth) / 2;
          const y = (pageHeight - imageHeight) / 2 + 20; // Move up to leave space for text
          
          page.drawImage(image, {
            x,
            y,
            width: imageWidth,
            height: imageHeight,
          });
          
          // Add filename as text at the bottom
          page.drawText(`Attachment: ${attachment.fileName}`, {
            x: margin,
            y: 30,
            size: 12,
            color: rgb(0.3, 0.3, 0.3)
          });
        }
        
        successfulAttachments++;
        console.log(`Successfully processed attachment: ${attachment.fileName}`);
        
      } catch (error) {
        console.error(`Error processing attachment ${attachment.fileName}:`, error);
      }
    }
    
    console.log(`Processed ${successfulAttachments} out of ${attachments.length} attachments successfully`);
    
    // Return the modified PDF bytes
    const modifiedPdfBytes = await existingPdfDoc.save();
    console.log('Successfully generated modified PDF with attachments');
    return modifiedPdfBytes;
    
  } catch (error) {
    console.error('Error appending attachments to PDF:', error);
    return null;
  }
};

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

    // Helper function to ensure entire section stays on one page
    const checkSectionPageBreak = (estimatedSectionHeight) => {
      if (currentY + estimatedSectionHeight > pageHeight - margin) {
        addPageWithTemplate();
      }
    };

    // Helper function to calculate estimated height of table
    const estimateTableHeight = (headers, data, options = {}) => {
      const { fontSize = 8, minRowHeight = 6, padding = 2 } = options;
      const colWidth = contentWidth / headers.length;
      const availableWidth = colWidth - (padding * 2);
      
      // Ensure data is an array and not empty
      if (!Array.isArray(data) || data.length === 0) return 8; // Height for "No data available" message
      
      // Set font temporarily for calculations
      doc.setFontSize(fontSize);
      doc.setFont('helvetica', 'normal');
      
      let totalHeight = 0;
      
      // Calculate header height
      if (headers.length > 0) {
        let headerHeight = minRowHeight;
        headers.forEach(header => {
          const lines = doc.splitTextToSize(header, availableWidth);
          const requiredHeight = Math.max(minRowHeight, lines.length * 4 + padding);
          headerHeight = Math.max(headerHeight, requiredHeight);
        });
        totalHeight += headerHeight;
      }

      // Calculate data rows height
      data.forEach(row => {
        // Ensure row is an array
        const rowArray = Array.isArray(row) ? row : [row];
        let maxRowHeight = minRowHeight;
        
        rowArray.forEach(cell => {
          const cellText = cell ? cell.toString() : '';
          if (cellText.length > 0) {
            const lines = doc.splitTextToSize(cellText, availableWidth);
            const requiredHeight = Math.max(minRowHeight, lines.length * 4 + padding);
            maxRowHeight = Math.max(maxRowHeight, requiredHeight);
          }
        });
        totalHeight += maxRowHeight;
      });

      return totalHeight + 10; // Add some padding
    };

    // Helper function to add section header
    const addSectionHeader = (number, title, color = '#1976d2') => {
      checkPageBreak(17);
      
      // Konwertuj kolor hex na RGB
      const r = parseInt(color.slice(1, 3), 16);
      const g = parseInt(color.slice(3, 5), 16);
      const b = parseInt(color.slice(5, 7), 16);
      
      // Dodaj kolorowe tło dla całego nagłówka (zmniejszona wysokość z 15 na 12)
      doc.setFillColor(r, g, b);
      doc.rect(margin, currentY, contentWidth, 12, 'F');
      
      // Dodaj numer sekcji w kółku (dostosowana pozycja dla mniejszej wysokości)
      doc.setFillColor(255, 255, 255);
      doc.circle(margin + 8, currentY + 6, 3.5, 'F');
      
      // Dodaj numer sekcji (dostosowana pozycja Y)
      doc.setTextColor(r, g, b);
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text(number.toString(), margin + 8, currentY + 7.5, { align: 'center' });
      
      // Dodaj tytuł sekcji (dostosowana pozycja Y i rozmiar fontu)
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(14);
      doc.text(title, margin + 18, currentY + 8);
      
      // Dodaj linię pod nagłówkiem (dostosowana pozycja Y)
      doc.setDrawColor(r, g, b);
      doc.setLineWidth(0.5);
      doc.line(margin, currentY + 12, margin + contentWidth, currentY + 12);
      
      currentY += 17; // Zmniejszony odstęp po nagłówku
    };

    // Helper function to add section header with page break consideration
    const addSectionHeaderWithPageBreak = (number, title, estimatedContentHeight, color = '#1976d2') => {
      const headerHeight = 17;
      const totalSectionHeight = headerHeight + estimatedContentHeight;
      
      checkSectionPageBreak(totalSectionHeight);
      addSectionHeader(number, title, color);
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

    // Helper function to add subsection header with page break consideration
    const addSubsectionHeaderWithPageBreak = (number, title, estimatedContentHeight, color = '#4caf50') => {
      const headerHeight = 12;
      const totalSubsectionHeight = headerHeight + estimatedContentHeight;
      
      checkSectionPageBreak(totalSubsectionHeight);
      addSubsectionHeader(number, title, color);
    };

    // Helper function to add field
    const addField = (label, value, isMultiline = false) => {
      checkPageBreak(isMultiline ? 15 : 8);
      
      // Convert value to string to ensure compatibility with jsPDF
      const valueStr = value !== null && value !== undefined ? String(value) : 'Not specified';
      
      doc.setTextColor(85, 85, 85);
      doc.setFontSize(10); // Powiększono z 9 na 10
      doc.setFont('helvetica', 'bold');
      doc.text(label + ':', margin, currentY);
      
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(10); // Powiększono z domyślnego na 10
      doc.setFont('helvetica', 'normal');
      
      if (isMultiline && valueStr && valueStr.length > 50) {
        const lines = doc.splitTextToSize(valueStr, contentWidth - 30);
        doc.text(lines, margin, currentY + 4);
        currentY += Math.max(8, lines.length * 4);
      } else {
        doc.text(valueStr, margin, currentY + 4);
        currentY += 8;
      }
    };

    // Helper function to add fields in two columns
    const addFieldTwoColumns = (leftLabel, leftValue, rightLabel, rightValue, isMultiline = false) => {
      checkPageBreak(isMultiline ? 15 : 8);
      
      const columnWidth = contentWidth / 2;
      const rightColumnX = margin + columnWidth + 5;
      
      // Convert values to strings to ensure compatibility with jsPDF
      const leftValueStr = leftValue !== null && leftValue !== undefined ? String(leftValue) : 'Not specified';
      const rightValueStr = rightValue !== null && rightValue !== undefined ? String(rightValue) : 'Not specified';
      
      // Left column
      doc.setTextColor(85, 85, 85);
      doc.setFontSize(10); // Powiększono z 9 na 10
      doc.setFont('helvetica', 'bold');
      doc.text(leftLabel + ':', margin, currentY);
      
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(10); // Powiększono z domyślnego na 10
      doc.setFont('helvetica', 'normal');
      
      if (isMultiline && leftValueStr && leftValueStr.length > 30) {
        const lines = doc.splitTextToSize(leftValueStr, columnWidth - 10);
        doc.text(lines, margin, currentY + 4);
      } else {
        doc.text(leftValueStr, margin, currentY + 4);
      }
      
      // Right column
      if (rightLabel && rightValue !== undefined) {
        doc.setTextColor(85, 85, 85);
        doc.setFontSize(10); // Powiększono z 9 na 10
        doc.setFont('helvetica', 'bold');
        doc.text(rightLabel + ':', rightColumnX, currentY);
        
        doc.setTextColor(0, 0, 0);
        doc.setFontSize(10); // Powiększono z domyślnego na 10
        doc.setFont('helvetica', 'normal');
        
        if (isMultiline && rightValueStr && rightValueStr.length > 30) {
          const lines = doc.splitTextToSize(rightValueStr, columnWidth - 10);
          doc.text(lines, rightColumnX, currentY + 4);
        } else {
          doc.text(rightValueStr, rightColumnX, currentY + 4);
        }
      }
      
      currentY += 8;
    };

    // Helper function to add table with dynamic row heights
    const addTable = (headers, data, options = {}) => {
      const {
        headerColor = [108, 53, 234], // #6C35EA converted to RGB
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

    // Introduction text
    const productName = task?.recipeName || task?.productName || 'the manufactured product';
    const introductionText = `This report constitutes a comprehensive technical and quality documentation concerning the finished product ${productName}. It has been prepared based on production data, ingredient specifications, quality control records, and bibliographic research documentation. Its purpose is to ensure full transparency and compliance of the manufacturing process with the internal standards of BGW Pharma Sp. z o.o., as well as with the quality standards applicable to dietary supplements.`;
    
    checkPageBreak(50); // Zwiększono dla większej zawartości
    doc.setTextColor(85, 85, 85);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('Introduction:', margin, currentY);
    currentY += 8;
    doc.setTextColor(85, 85, 85);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    
    const introLines = doc.splitTextToSize(introductionText, contentWidth);
    doc.text(introLines, margin, currentY);
    currentY += Math.max(20, introLines.length * 5);
    
    // Add detailed information section
    currentY += 8;
    doc.setTextColor(85, 85, 85);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('The report includes detailed information regarding:', margin, currentY);
    currentY += 8;
    
    // Add bullet points
    doc.setTextColor(85, 85, 85);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    
    const bulletPoints = [
      'the raw materials used and their identification,',
      'the validity (expiration dates) of materials and raw material batches,',
      'documentation of physicochemical analyses,',
      'the course of the production process,',
      'quality control results,',
      'atmospheric conditions during production,',
      'packaging closure integrity and cleanliness,',
      'information on the presence of allergens in the product.'
    ];
    
    bulletPoints.forEach(point => {
      checkPageBreak(8);
      doc.text('•', margin, currentY);
      const pointLines = doc.splitTextToSize(point, contentWidth - 10);
      doc.text(pointLines, margin + 10, currentY);
      currentY += Math.max(6, pointLines.length * 4);
    });
    
    currentY += 10;

    // 1. Product identification
    addSectionHeader(1, 'Product identification', '#6C35EA');
    
    // Use two-column layout for product identification
    addFieldTwoColumns(
      'SKU of recipe', 
      task?.recipeName || task?.productName,
      'Version of recipe', 
      task?.recipeVersion || '1'
    );
    
    addFieldTwoColumns(
      'Report creation date', 
      new Date().toLocaleDateString('en-GB', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }),
      'User', 
      currentUser?.displayName || currentUser?.email || 'Unknown user'
    );
    
    // Description spans full width due to potentially long content
    addField('Description of recipe', task?.recipe?.description || 'No recipe description available', true);

    currentY += 10;

    // 2. TDS Specification
    // Calculate estimated content height for this section
    let tdsEstimatedHeight = 16 + 16; // Two fields (Date fields)
    
    // Add micronutrients table height if present
    if (task?.recipe?.micronutrients && task.recipe.micronutrients.length > 0) {
      const nutritionalBasis = task?.recipe?.nutritionalBasis || '1 caps';
      
      // Function to translate categories to English
      const translateCategory = (category) => {
        const categoryTranslations = {
          'Witaminy': 'Vitamins',
          'Minerały': 'Minerals', 
          'Makroelementy': 'Macronutrients',
          'Energia': 'Energy',
          'Składniki aktywne': 'Active compounds'
        };
        return categoryTranslations[category] || category;
      };

      const microHeaders = ['Code', `Quantity per ${nutritionalBasis}`, 'Category'];
      const microData = task.recipe.micronutrients.map(micro => [
        micro.code || '',
        `${micro.quantity || ''} ${micro.unit || ''}`.trim(),
        translateCategory(micro.category || '')
      ]);
      
      tdsEstimatedHeight += 13 + estimateTableHeight(microHeaders, microData) + 20; // Label + table + two notes
    }
    
    addSectionHeaderWithPageBreak(2, 'TDS Specification', tdsEstimatedHeight, '#6C35EA');
    
    addField('Date of last recipe update', task?.recipe?.updatedAt 
      ? (task.recipe.updatedAt && typeof task.recipe.updatedAt === 'object' && typeof task.recipe.updatedAt.toDate === 'function'
        ? task.recipe.updatedAt.toDate().toLocaleDateString('en-GB')
        : new Date(task.recipe.updatedAt).toLocaleDateString('en-GB'))
      : 'No data');
    
    addField('Expiration date of end product', task?.expiryDate 
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
      const nutritionalBasis = task?.recipe?.nutritionalBasis || '1 caps';
      doc.setTextColor(85, 85, 85);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text(`Microelements + Nutrition data (per ${nutritionalBasis}):`, margin, currentY);
      currentY += 8;

      // Function to translate categories to English (defined above for height calculation)
      const translateCategory = (category) => {
        const categoryTranslations = {
          'Witaminy': 'Vitamins',
          'Minerały': 'Minerals', 
          'Makroelementy': 'Macronutrients',
          'Energia': 'Energy',
          'Składniki aktywne': 'Active compounds'
        };
        return categoryTranslations[category] || category;
      };

      const microHeaders = ['Code', `Quantity per ${nutritionalBasis}`, 'Category'];
      const microData = task.recipe.micronutrients.map(micro => [
        micro.code || '',
        `${micro.quantity || ''} ${micro.unit || ''}`.trim(),
        translateCategory(micro.category || '')
      ]);

      addTable(microHeaders, microData);
      
      // Add note about natural variation
      currentY += 5;
      doc.setTextColor(85, 85, 85);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'italic');
      const noteText = 'Note: Natural products may show differences in the values of micro/macronutrients up to 5% because they are not standardized.';
      const noteLines = doc.splitTextToSize(noteText, contentWidth);
      doc.text(noteLines, margin, currentY);
      currentY += Math.max(8, noteLines.length * 4);
      
      // Add note about active weight of components
      currentY += 5;
      const activeWeightNoteText = 'The values given refer to the active weight of the components (components), i.e. the elemental content of active substances.';
      const activeWeightNoteLines = doc.splitTextToSize(activeWeightNoteText, contentWidth);
      doc.text(activeWeightNoteLines, margin, currentY);
      currentY += Math.max(8, activeWeightNoteLines.length * 4);
    }

    currentY += 10;

    // 3. Active Ingredients
    // Calculate estimated content height for entire section
    let activeIngredientsEstimatedHeight = 0;
    
    // 3.1 List of materials height
    let materialsSubsectionHeight = 12; // Subsection header
    if (task?.recipe?.ingredients && task.recipe.ingredients.length > 0) {
      const ingredientHeaders = ['Ingredient name', 'Quantity', 'Unit', 'CAS Number', 'Notes'];
      const ingredientData = task.recipe.ingredients.map(ingredient => [
        ingredient.name || '',
        ingredient.quantity?.toString() || '',
        ingredient.unit || '',
        ingredient.casNumber || '-',
        ingredient.notes || '-'
      ]);
      materialsSubsectionHeight += estimateTableHeight(ingredientHeaders, ingredientData) + 21; // table + summary
    }
    activeIngredientsEstimatedHeight += materialsSubsectionHeight;
    
    // Check if we have expiration data for 3.2 subsection
    if (task?.consumedMaterials && task.consumedMaterials.length > 0) {
      const expiryHeaders = ['Material name', 'Batch', 'Quantity', 'Unit', 'Expiration date'];
      // Create proper data array for estimation
      const expiryDataSample = task.consumedMaterials.slice(0, 5).map(consumed => [
        consumed.materialName || 'Material',
        consumed.batchNumber || consumed.lotNumber || '-',
        (consumed.quantity || consumed.consumedQuantity || '-').toString(),
        consumed.unit || '-',
        consumed.expiryDate ? 'DD/MM/YYYY' : 'Not specified'
      ]);
      activeIngredientsEstimatedHeight += 12 + estimateTableHeight(expiryHeaders, expiryDataSample) + 20;
    }
    
    // Check if we have clinical attachments for 3.3 subsection
    if (clinicalAttachments.length > 0) {
      const clinicalHeaders = ['File type', 'File name', 'Size', 'Upload date'];
      // Create proper data array for estimation
      const clinicalDataSample = clinicalAttachments.slice(0, 3).map(attachment => [
        getFileTypeFromExtension(attachment.fileName),
        attachment.fileName,
        formatFileSize(attachment.size),
        new Date(attachment.uploadedAt).toLocaleDateString('en-GB')
      ]);
      activeIngredientsEstimatedHeight += 12 + estimateTableHeight(clinicalHeaders, clinicalDataSample) + 16;
    } else {
      activeIngredientsEstimatedHeight += 12 + 8; // Subsection header + "no data" message
    }
    
    addSectionHeaderWithPageBreak(3, 'Active Ingredients', activeIngredientsEstimatedHeight, '#6C35EA');

    // 3.1 List of materials - estimate subsection height and use page break check
    const materialsSubsectionEstimatedHeight = materialsSubsectionHeight - 12; // Exclude header height
    addSubsectionHeaderWithPageBreak('3.1', 'List of materials', materialsSubsectionEstimatedHeight, '#6C35EA');
    
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
      currentY += 12;
    }

    // 3.2 Expiration date of materials
    if (task?.consumedMaterials && task.consumedMaterials.length > 0) {
      // Calculate estimated height for this subsection
      const expiryHeadersForEstimation = ['Material name', 'Batch', 'Quantity', 'Unit', 'Expiration date'];
      // Create proper data array for estimation
      const expiryDataSample = task.consumedMaterials.slice(0, 5).map(consumed => [
        consumed.materialName || 'Material',
        consumed.batchNumber || consumed.lotNumber || '-',
        (consumed.quantity || consumed.consumedQuantity || '-').toString(),
        consumed.unit || '-',
        consumed.expiryDate ? 'DD/MM/YYYY' : 'Not specified'
      ]);
      const expirySubsectionHeight = estimateTableHeight(expiryHeadersForEstimation, expiryDataSample) + 20; // table + summary
      
      addSubsectionHeaderWithPageBreak('3.2', 'Expiration date of materials', expirySubsectionHeight, '#6C35EA');
      
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
    // Calculate estimated height for this subsection  
    let clinicalSubsectionHeight = 0;
    if (clinicalAttachments.length > 0) {
      const clinicalHeaders = ['File type', 'File name', 'Size', 'Upload date'];
      // Create proper data array for estimation
      const clinicalDataSample = clinicalAttachments.slice(0, 3).map(attachment => [
        getFileTypeFromExtension(attachment.fileName),
        attachment.fileName,
        formatFileSize(attachment.size),
        new Date(attachment.uploadedAt).toLocaleDateString('en-GB')
      ]);
      clinicalSubsectionHeight = estimateTableHeight(clinicalHeaders, clinicalDataSample) + 16; // table + summary
    } else {
      clinicalSubsectionHeight = 8; // "No data" message
    }
    
    addSubsectionHeaderWithPageBreak('3.3', 'Clinical and bibliographic research', clinicalSubsectionHeight, '#6C35EA');
    
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
    addSectionHeader(4, 'Physicochemical properties', '#6C35EA');
    
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
    addSectionHeader(5, 'Production', '#6C35EA');
    
    addFieldTwoColumns(
      'Start date of production', productionHistory && productionHistory.length > 0
        ? formatDateTime(productionHistory[0].startTime)
        : 'No production history data',
      'End date of production', productionHistory && productionHistory.length > 0
        ? formatDateTime(productionHistory[productionHistory.length - 1].endTime)
        : 'No production history data'
    );
    
    addFieldTwoColumns(
      'MO number', task?.moNumber || 'Not specified',
      'Company name', companyData?.name || 'Loading...'
    );
    
    addField('Address', companyData?.address || companyData ? normalizePolishChars(`${companyData.address || ''} ${companyData.city || ''}`.trim()) : 'Loading...');
    
    addFieldTwoColumns(
      'Workstation', workstationData === null 
        ? 'Loading...' 
        : workstationData?.name 
          ? workstationData.name 
          : 'No workstation assigned',
      'Time per unit', task?.productionTimePerUnit 
        ? `${task.productionTimePerUnit} min/pcs`
        : task?.recipe?.productionTimePerUnit
          ? `${task.recipe.productionTimePerUnit} min/pcs`
          : 'Not specified'
    );

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
        `${totalQuantity} ${task?.unit || 'pcs'}`,
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
        
        doc.setTextColor(76, 175, 80);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.text(`Report #${index + 1} - ${formatDateTime(report.date)}`, margin, currentY);
        currentY += 6;

        addFieldTwoColumns(
          'Completion time', report.time || 'Not provided',
          'Responsible person', report.email || 'Not provided'
        );
        addField('Final product quantity', report.productQuantity ? `${report.productQuantity} ${task?.unit || 'pcs'}` : 'Not provided');
        addFieldTwoColumns(
          'Packaging loss', report.packagingLoss || 'No loss',
          'Lid loss', report.bulkLoss || 'No loss'
        );
        addField('Raw material loss', report.rawMaterialLoss || 'No loss', true);
        
        if (report.mixingPlanReportUrl) {
          addField('Mixing plan report', report.mixingPlanReportName || 'Available (see digital copy)');
        }
        
        currentY += 8;
      });
    }

    currentY += 10;

    // 6. Quality control
    addSectionHeader(6, 'Quality control', '#6C35EA');
    
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

        addFieldTwoColumns(
          'Name and surname', report.name || 'Not provided',
          'Position', translatePosition(report.position) || 'Not provided'
        );
        addField('Completion date', formatDateTime(report.fillDate));
        
        currentY += 5;

        // Production control protocol section
        doc.setTextColor(25, 118, 210);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text('Production control protocol:', margin, currentY);
        currentY += 8;

        addField('Customer Order', report.customerOrder || 'Not provided');
        addFieldTwoColumns(
          'Production start date', formatDateOnly(report.productionStartDate),
          'Production start time', report.productionStartTime || 'Not provided'
        );
        addFieldTwoColumns(
          'Production end date', formatDateOnly(report.productionEndDate),
          'Production end time', report.productionEndTime || 'Not provided'
        );
        addFieldTwoColumns(
          'Conditions reading date', formatDateOnly(report.readingDate),
          'Conditions reading time', report.readingTime || 'Not provided'
        );

        currentY += 5;

        // Product data section
        doc.setTextColor(25, 118, 210);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text('Product data:', margin, currentY);
        currentY += 8;

        addField('Product name', report.productName || task?.productName || 'Not provided');
        addFieldTwoColumns(
          'LOT number', report.lotNumber || 'Not provided',
          'Expiration date (EXP)', report.expiryDate || 'Not provided'
        );
        addFieldTwoColumns(
          'Quantity (pcs)', report.quantity ? `${report.quantity} pcs` : 'Not provided',
          'Shift number', translateShiftNumber(report.shiftNumber) || 'Not provided'
        );

        currentY += 5;

        // Atmospheric conditions section
        doc.setTextColor(25, 118, 210);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text('Atmospheric conditions:', margin, currentY);
        currentY += 8;

        addFieldTwoColumns(
          'Air humidity', report.humidity || 'Not provided',
          'Air temperature', report.temperature || 'Not provided'
        );

        currentY += 5;

        // Quality control section
        doc.setTextColor(25, 118, 210);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text('Quality control:', margin, currentY);
        currentY += 8;

        addFieldTwoColumns(
          'Raw material purity', translateQualityValue(report.rawMaterialPurity) || 'Not provided',
          'Packaging purity', translateQualityValue(report.packagingPurity) || 'Not provided'
        );
        addFieldTwoColumns(
          'Packaging closure', translateQualityValue(report.packagingClosure) || 'Not provided',
          'Quantity on pallet', translateQualityValue(report.packagingQuantity) || 'Not provided'
        );

        // Additional quality control fields if available
        if (report.additionalControls && typeof report.additionalControls === 'object') {
          Object.entries(report.additionalControls).forEach(([key, value]) => {
            if (value && typeof value === 'string') {
              const formattedKey = key.replace(/([A-Z])/g, ' $1').toLowerCase().replace(/^./, str => str.toUpperCase());
              addField(formattedKey, translateQualityValue(value));
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
    // Calculate estimated height for allergens section
    let allergensEstimatedHeight = 0;
    if (additionalData.selectedAllergens && additionalData.selectedAllergens.length > 0) {
      const allergenHeaders = ['Allergen name', 'Status'];
      const allergenData = additionalData.selectedAllergens.map(allergen => [
        allergen,
        'PRESENT'
      ]);
      allergensEstimatedHeight = 8 + estimateTableHeight(allergenHeaders, allergenData, { fontSize: 9 }) + 20; // spacing + table + warning
    } else {
      allergensEstimatedHeight = 8; // "No data" message
    }
    
    addSectionHeaderWithPageBreak(7, 'Allergens', allergensEstimatedHeight, '#6C35EA');
    
    if (additionalData.selectedAllergens && additionalData.selectedAllergens.length > 0) {
      currentY += 8;

      // Create allergen table
      const allergenHeaders = ['Allergen name', 'Status'];
      const allergenData = additionalData.selectedAllergens.map(allergen => [
        allergen,
        'PRESENT'
      ]);

      addTable(allergenHeaders, allergenData, { 
        headerColor: [108, 53, 234],
        fontSize: 9 
      });

      // Add regulatory notice
      doc.setTextColor(25, 118, 210);
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

    currentY += 10;

    // 8. Disclaimer & Terms of Use
    const disclaimerEstimatedHeight = 300; // Estimated height for disclaimer content
    addSectionHeaderWithPageBreak(8, 'Disclaimer & Terms of Use', disclaimerEstimatedHeight, '#6C35EA');
    
    // Add disclaimer content
    const disclaimerText = `This Technical Data Sheet (TDS) describes the typical properties of the product and has been prepared with due care based on our current knowledge, internal analyses, and data from our suppliers. The legally binding parameters for the product are defined in the agreed-upon Product Specification Sheet and confirmed for each batch in its respective Certificate of Analysis (CoA).

Due to the natural variability of raw materials, minor batch-to-batch variations in non-critical organoleptic or physical parameters may occur. BGW PHARMA reserves the right to inform Clients of any significant deviations from the specifications. This provision does not apply to active ingredients, vitamins, minerals, or declared nutritional values, which must comply with labelling requirements under EU regulations.

We are committed to continuous improvement and reserve the right to modify the product's specifications. The Buyer will be notified with reasonable advance notice of any changes, particularly those affecting mandatory labelling information or the composition of active ingredients.

The Buyer is solely responsible for:

• Verifying the product's suitability for their specific application and manufacturing processes.

• Ensuring that their final product complies with all applicable laws and regulations.

• Maintaining full traceability in accordance with the requirements of EU food law.

Where information regarding health claims authorized under Regulation (EC) No 1924/2006 is provided, BGW PHARMA shall not be held liable for any modifications or alterations of these claims made by the Buyer. It remains the Buyer's exclusive responsibility to ensure compliance with all applicable regulations concerning the use of such claims in final products.

BGW PHARMA shall not be held liable for damages resulting from improper use, storage, or handling of the product, subject to applicable EU obligations on food safety and product liability directives.

This document does not constitute a warranty and is subject to our official General Terms and Conditions of Sale, which govern all legal aspects of the transaction, including specific warranties, claims procedures, liability limitations, and force majeure provisions. In the event of any discrepancy between this TDS and our General Terms and Conditions of Sale, the latter shall prevail.

By purchasing the product, the Buyer accepts the conditions outlined in this document and confirms the receipt and acceptance of our General Terms and Conditions of Sale.`;

    // Split disclaimer text into manageable paragraphs
    const disclaimerParagraphs = disclaimerText.split('\n\n');
    
    doc.setTextColor(51, 51, 51);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    
    for (const paragraph of disclaimerParagraphs) {
      if (paragraph.trim()) {
        checkPageBreak(20); // Check if we need a new page for each paragraph
        
        // Handle bullet points specially
        if (paragraph.startsWith('•')) {
          const lines = doc.splitTextToSize(paragraph, contentWidth - 10);
          doc.text(lines, margin + 10, currentY);
          currentY += Math.max(8, lines.length * 4.5);
        } else {
          const lines = doc.splitTextToSize(paragraph, contentWidth);
          doc.text(lines, margin, currentY);
          currentY += Math.max(8, lines.length * 4.5);
        }
        
        currentY += 4; // Add spacing between paragraphs
      }
    }

    currentY += 15;

    // 9. Additional Attachments
    // Calculate estimated height for attachments section
    let attachmentsEstimatedHeight = 0;
    if (additionalData.additionalAttachments && additionalData.additionalAttachments.length > 0) {
      const additionalAttHeaders = ['File type', 'File name', 'Size', 'Upload date'];
      const additionalAttData = additionalData.additionalAttachments.map(attachment => [
        getFileTypeFromExtension(attachment.fileName),
        attachment.fileName,
        formatFileSize(attachment.size),
        new Date(attachment.uploadedAt).toLocaleDateString('en-GB')
      ]);
      attachmentsEstimatedHeight = estimateTableHeight(additionalAttHeaders, additionalAttData) + 16; // table + summary
    } else {
      attachmentsEstimatedHeight = 8; // "No data" message
    }
    
    addSectionHeaderWithPageBreak(9, 'Additional Attachments', attachmentsEstimatedHeight, '#6C35EA');
    
    if (additionalData.additionalAttachments && additionalData.additionalAttachments.length > 0) {
      const additionalAttHeaders = ['File type', 'File name', 'Size', 'Upload date'];
      const additionalAttData = additionalData.additionalAttachments.map(attachment => [
        getFileTypeFromExtension(attachment.fileName),
        attachment.fileName,
        formatFileSize(attachment.size),
        new Date(attachment.uploadedAt).toLocaleDateString('en-GB')
      ]);

      addTable(additionalAttHeaders, additionalAttData);

      // Summary
      doc.setTextColor(25, 118, 210);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.text(`Total additional attachments: ${additionalData.additionalAttachments.length}`, margin, currentY);
      doc.setTextColor(85, 85, 85);
      doc.setFont('helvetica', 'normal');
      doc.text(`Total size: ${formatFileSize(additionalData.additionalAttachments.reduce((sum, attachment) => sum + attachment.size, 0))}`, margin, currentY + 4);
      currentY += 12;
    } else {
      doc.setTextColor(150, 150, 150);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'italic');
      doc.text('No additional attachments provided for this product', margin, currentY);
      currentY += 8;
    }

    // Process attachments if provided
    if (additionalData.attachments && additionalData.attachments.length > 0) {
      try {
        console.log('Processing attachments for PDF report...');
        const modifiedPdfBytes = await appendAttachmentsToReport(doc, additionalData.attachments);
        
        if (modifiedPdfBytes) {
          // Create a download link for the modified PDF
          const fileName = `End_Product_Report_MO_${task.moNumber || task.id}_${new Date().toISOString().split('T')[0]}.pdf`;
          
          // Create blob from the modified PDF bytes
          const blob = new Blob([modifiedPdfBytes], { type: 'application/pdf' });
          
          // Create download URL
          const url = window.URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = fileName;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          window.URL.revokeObjectURL(url);
          
          return { success: true, fileName, withAttachments: true };
        }
      } catch (error) {
        console.error('Error processing attachments, saving PDF without attachments:', error);
        // Fall back to saving without attachments
      }
    }

    // Add footer to last page (for PDF without attachments or if attachment processing failed)
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

    // Save the PDF (without attachments)
    const fileName = `End_Product_Report_MO_${task.moNumber || task.id}_${new Date().toISOString().split('T')[0]}.pdf`;
    doc.save(fileName);

    return { success: true, fileName, withAttachments: false };

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

// Helper function to format date only (without time)
const formatDateOnly = (dateTime) => {
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
      year: 'numeric'
    });
  } catch (error) {
    console.error('Error formatting date:', error);
    return 'Date error';
  }
};

// Export the attachment function for external use
export { appendAttachmentsToReport }; 