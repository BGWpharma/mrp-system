/**
 * Utility functions for exporting data to CSV, Excel and PDF
 */
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

/**
 * Converts data to CSV format and triggers download
 * 
 * @param {Array} data - Array of objects to convert to CSV
 * @param {Array} headers - Array of objects with 'label' and 'key' properties for CSV headers
 * @param {string} filename - Filename for the downloaded CSV file
 */
export const exportToCSV = (data, headers, filename) => {
  if (!data || !data.length || !headers || !headers.length) {
    console.error('Invalid data or headers for CSV export');
    return;
  }

  try {
    // Create CSV header row
    const headerRow = headers.map(header => `"${header.label}"`).join(',');
    
    // Create CSV data rows
    const csvRows = data.map(row => {
      return headers.map(header => {
        // Get the value from the data using the header key
        const value = header.key.split('.').reduce((obj, key) => {
          return obj && obj[key] !== undefined ? obj[key] : '';
        }, row);
        
        // Format the value for CSV based on type
        if (value === null || value === undefined || value === '') {
          return '';
        } else if (typeof value === 'number') {
          // Numbers without quotes for proper Excel recognition
          return isNaN(value) ? '' : value.toString();
        } else if (typeof value === 'boolean') {
          // Booleans as text
          return `"${value ? 'Tak' : 'Nie'}"`;
        } else if (value instanceof Date) {
          // Dates with quotes
          return `"${value.toLocaleDateString()}"`;
        } else if (typeof value === 'string') {
          // Check if string represents a number
          const numValue = parseFloat(value);
          // Jeśli string zawiera liczbę z miejscami dziesiętnymi (np. "5.00"), zachowaj format
          if (!isNaN(numValue) && isFinite(numValue)) {
            // Sprawdź czy ma miejsca dziesiętne w stringu
            if (value.includes('.')) {
              // Zachowaj dokładny format z miejscami dziesiętnymi
              return value.trim();
            } else if (value.trim() === numValue.toString()) {
              // Jeśli to liczba całkowita bez kropki, eksportuj bez cudzysłowów
              return numValue.toString();
            }
          }
          // Escape quotes in strings by doubling them
          return `"${value.replace(/"/g, '""')}"`;
        } else {
          // Other types as quoted strings
          return `"${value}"`;
        }
      }).join(',');
    });
    
    // Combine header and rows
    const csvContent = [headerRow, ...csvRows].join('\n');
    
    // Create blob and trigger download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    // Create download link and trigger click
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${filename}.csv`);
    document.body.appendChild(link);
    link.click();
    
    // Clean up
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    return true;
  } catch (error) {
    console.error('Error exporting to CSV:', error);
    return false;
  }
};

/**
 * Exports data to PDF using jsPDF
 * 
 * @param {Array} data - Array of objects to export
 * @param {Array} headers - Array of objects with 'label' and 'key' properties
 * @param {string} filename - Filename for the PDF
 * @param {Object} options - Additional options for PDF generation
 * @returns {boolean} - Success status
 */
export const exportToPDF = (data, headers, filename, options = {}) => {
  if (!data || !data.length || !headers || !headers.length) {
    console.error('Invalid data or headers for PDF export');
    return false;
  }

  try {
    const {
      title = 'Data Export',
      subtitle = '',
      orientation = 'landscape',
      pageSize = 'a4',
      pageMargins = [15, 15, 15, 15], // [left, top, right, bottom]
      headerStyles = { fillColor: [66, 66, 66], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles = { fillColor: [240, 240, 240] },
      includeFooter = true,
      footerText = 'Generated on ' + new Date().toLocaleString(),
      customHeader = null
    } = options;

    // Create PDF document
    const doc = new jsPDF({
      orientation: orientation,
      unit: 'mm',
      format: pageSize
    });
    
    // Add title and subtitle
    const pageWidth = doc.internal.pageSize.getWidth();
    let yPos = 20;
    
    // Add title
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text(title, pageWidth / 2, yPos, { align: 'center' });
    
    // Add subtitle if provided
    if (subtitle) {
      yPos += 10;
      doc.setFontSize(12);
      doc.setFont('helvetica', 'normal');
      doc.text(subtitle, pageWidth / 2, yPos, { align: 'center' });
    }
    
    // Add custom header if provided
    if (customHeader) {
      yPos += 10;
      if (typeof customHeader === 'function') {
        customHeader(doc, yPos);
        yPos += 10;
      }
    }
    
    // Prepare data for table
    const tableHeaders = headers.map(header => header.label);
    const tableData = data.map(row => {
      return headers.map(header => {
        // Get the value using the header key (support for nested properties)
        const value = header.key.split('.').reduce((obj, key) => {
          return obj && obj[key] !== undefined ? obj[key] : '';
        }, row);
        
        // Format the value based on its type
        if (value === null || value === undefined) {
          return '';
        } else if (value instanceof Date) {
          return value.toLocaleDateString();
        } else {
          return value.toString();
        }
      });
    });
    
    // Generate table using autoTable
    autoTable(doc, {
      head: [tableHeaders],
      body: tableData,
      startY: yPos + 10,
      margin: { left: pageMargins[0], top: pageMargins[1], right: pageMargins[2], bottom: pageMargins[3] },
      headStyles: headerStyles,
      alternateRowStyles: alternateRowStyles,
      didDrawPage: function(data) {
        // Add footer on each page if enabled
        if (includeFooter) {
          const pageHeight = doc.internal.pageSize.getHeight();
          doc.setFontSize(8);
          doc.setFont('helvetica', 'italic');
          doc.text(
            footerText,
            pageWidth / 2, 
            pageHeight - 5, 
            { align: 'center' }
          );
        }
      }
    });
    
    // Save the PDF
    doc.save(`${filename}.pdf`);
    return true;
  } catch (error) {
    console.error('Error generating PDF:', error);
    return false;
  }
};

/**
 * Formats date object to string
 * 
 * @param {Date|Object} date - Date to format (can be Date object or Firebase Timestamp)
 * @param {string} format - Format string (default: 'dd.MM.yyyy')
 * @returns {string} Formatted date string
 */
export const formatDateForExport = (date, format = 'dd.MM.yyyy') => {
  if (!date) return '';
  
  let dateObj;
  if (typeof date === 'string') {
    dateObj = new Date(date);
  } else if (date.toDate && typeof date.toDate === 'function') {
    // Handle Firebase Timestamp
    dateObj = date.toDate();
  } else if (date instanceof Date) {
    dateObj = date;
  } else {
    return '';
  }
  
  if (isNaN(dateObj.getTime())) return '';
  
  const day = String(dateObj.getDate()).padStart(2, '0');
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const year = dateObj.getFullYear();
  
  return format
    .replace('dd', day)
    .replace('MM', month)
    .replace('yyyy', year);
};

/**
 * Formats currency for export
 * 
 * @param {number} value - Value to format
 * @param {string} currency - Currency code (default: 'EUR')
 * @returns {string} Formatted currency string
 */
export const formatCurrencyForExport = (value, currency = 'EUR') => {
  if (value === null || value === undefined) return '';
  
  return `${Number(value).toFixed(2)} ${currency}`;
};

/**
 * Exports multiple datasets to Excel with separate worksheets
 * 
 * @param {Array} worksheets - Array of worksheet objects: {name, data, headers}
 * @param {string} filename - Filename for the Excel file (without extension)
 * @returns {boolean} - Success status
 */
export const exportToExcel = (worksheets, filename) => {
  if (!worksheets || !worksheets.length) {
    console.error('Invalid worksheets data for Excel export');
    return false;
  }

  try {
    // Create a new workbook
    const workbook = XLSX.utils.book_new();

    worksheets.forEach((worksheet, index) => {
      const { name, data, headers } = worksheet;
      
      if (!data || !headers || !data.length || !headers.length) {
        console.warn(`Skipping worksheet ${name} - invalid data or headers`);
        return;
      }

      // Convert data to worksheet format
      const worksheetData = [];
      
      // Add headers as first row
      const headerRow = headers.map(header => header.label);
      worksheetData.push(headerRow);
      
      // Add data rows
      data.forEach(row => {
        const dataRow = headers.map(header => {
          // Get the value from the data using the header key
          const value = header.key.split('.').reduce((obj, key) => {
            return obj && obj[key] !== undefined ? obj[key] : '';
          }, row);
          
          // Format the value for Excel
          if (value === null || value === undefined) {
            return '';
          } else if (typeof value === 'number') {
            return isNaN(value) ? '' : value;
          } else if (typeof value === 'boolean') {
            return value ? 'Tak' : 'Nie';
          } else if (value instanceof Date) {
            return value.toLocaleDateString();
          } else {
            return value.toString();
          }
        });
        worksheetData.push(dataRow);
      });

      // Create worksheet
      const ws = XLSX.utils.aoa_to_sheet(worksheetData);
      
      // Auto-size columns
      const colWidths = [];
      worksheetData.forEach(row => {
        row.forEach((cell, colIndex) => {
          const cellLength = cell ? cell.toString().length : 0;
          colWidths[colIndex] = Math.max(colWidths[colIndex] || 0, cellLength + 2);
        });
      });
      
      ws['!cols'] = colWidths.map(width => ({ width: Math.min(width, 50) }));
      
      // Style the header row
      const headerRange = XLSX.utils.decode_range(ws['!ref'] || 'A1');
      for (let col = headerRange.s.c; col <= headerRange.e.c; col++) {
        const cellAddress = XLSX.utils.encode_cell({ r: 0, c: col });
        if (ws[cellAddress]) {
          ws[cellAddress].s = {
            font: { bold: true, color: { rgb: "FFFFFF" } },
            fill: { fgColor: { rgb: "366092" } },
            alignment: { horizontal: "center" }
          };
        }
      }

      // Add worksheet to workbook with proper name
      const sheetName = name.replace(/[[\]\\\/\?\*\:]/g, '_').substring(0, 31);
      XLSX.utils.book_append_sheet(workbook, ws, sheetName);
    });

    // Save the file
    XLSX.writeFile(workbook, `${filename}.xlsx`);
    return true;
    
  } catch (error) {
    console.error('Error exporting to Excel:', error);
    return false;
  }
}; 