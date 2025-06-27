import React, { useState, useEffect } from 'react';
import { FileText, Download, Eye, Calendar, DollarSign, AlertCircle, Package, Search, Filter } from 'lucide-react';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { db } from '../../firebase';

/**
 * Invoices Component
 * 
 * Expected invoice structure in Firestore collection 'invoices':
 * {
 *   id: string,
 *   invoiceNumber: string,
 *   customerId: string,
 *   customerName?: string,
 *   customer?: { name: string, email?: string },
 *   issueDate: Timestamp,
 *   dueDate?: Timestamp,
 *   createdAt?: Timestamp,
 *   totalAmount: number (or 'total'),
 *   subtotal?: number,
 *   taxAmount?: number,
 *   discountAmount?: number,
 *   paidAmount?: number,
 *   status?: string ('Paid', 'Pending', 'Overdue', 'Partially Paid'),
 *   paymentStatus?: string,
 *   paymentMethod?: string,
 *   currency?: string,
 *   description?: string,
 *   notes?: string,
 *   orderId?: string,
 *   orderNumber?: string,
 *   items?: Array<{id, name, quantity, price, unit}>
 * }
 */
const Invoices = ({ customerId, customerName }) => {
  const [invoices, setInvoices] = useState([]);
  const [filteredInvoices, setFilteredInvoices] = useState([]);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('all');

  useEffect(() => {
    if (customerId) {
      fetchInvoices();
    }
  }, [customerId]);

  useEffect(() => {
    filterInvoices();
  }, [invoices, searchTerm, statusFilter, dateFilter]);

  const fetchInvoices = async () => {
    try {
      setLoading(true);
      setError(null);

      // Pobierz faktury klienta bezpośrednio z bazy danych
      const invoicesRef = collection(db, 'invoices');
      const invoicesQuery = query(
        invoicesRef,
        where('customerId', '==', customerId),
        orderBy('issueDate', 'desc')
      );
      
      const invoicesSnapshot = await getDocs(invoicesQuery);
      const fetchedInvoices = [];
      
      invoicesSnapshot.forEach((doc) => {
        const invoiceData = doc.data();
        fetchedInvoices.push({
          id: doc.id,
          ...invoiceData,
          // Ensure status is calculated if not present
          status: invoiceData.status || calculateInvoiceStatus(invoiceData)
        });
      });

      setInvoices(fetchedInvoices);
    } catch (error) {
      console.error('Error fetching invoices:', error);
      setError('Failed to load invoices');
    } finally {
      setLoading(false);
    }
  };

  const addDays = (date, days) => {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  };

  const calculateInvoiceStatus = (invoice) => {
    const paymentStatus = invoice.paymentStatus?.toLowerCase();
    const totalAmount = invoice.totalAmount || 0;
    const paidAmount = invoice.paidAmount || 0;
    
    // Check if fully paid
    if (paymentStatus === 'paid' || paymentStatus === 'opłacone' || paidAmount >= totalAmount) {
      return 'Paid';
    } 
    // Check if partially paid
    else if (paymentStatus === 'partially paid' || paymentStatus === 'częściowo opłacone' || paidAmount > 0) {
      return 'Partially Paid';
    } 
    // Check if overdue
    else if (invoice.dueDate) {
      const dueDate = invoice.dueDate?.toDate ? invoice.dueDate.toDate() : new Date(invoice.dueDate);
      if (new Date() > dueDate) {
        return 'Overdue';
      }
    }
    
    return 'Pending';
  };

  const filterInvoices = () => {
    let filtered = [...invoices];

    // Search filter
    if (searchTerm) {
      filtered = filtered.filter(invoice =>
        (invoice.invoiceNumber || invoice.id || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (invoice.orderNumber || invoice.orderId || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (invoice.customerName || invoice.customer?.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (invoice.description || '').toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(invoice => 
        invoice.status.toLowerCase() === statusFilter.toLowerCase()
      );
    }

    // Date filter
    if (dateFilter !== 'all') {
      const now = new Date();
      filtered = filtered.filter(invoice => {
        const invoiceDate = invoice.issueDate?.toDate ? invoice.issueDate.toDate() : new Date(invoice.issueDate);
        
        switch (dateFilter) {
          case 'week':
            return (now - invoiceDate) <= 7 * 24 * 60 * 60 * 1000;
          case 'month':
            return (now - invoiceDate) <= 30 * 24 * 60 * 60 * 1000;
          case 'quarter':
            return (now - invoiceDate) <= 90 * 24 * 60 * 60 * 1000;
          default:
            return true;
        }
      });
    }

    setFilteredInvoices(filtered);
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return 'N/A';
    try {
      if (timestamp.toDate) {
        return timestamp.toDate().toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric'
        });
      }
      return new Date(timestamp).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    } catch (error) {
      return 'Invalid date';
    }
  };

  const formatCurrency = (amount) => {
    if (!amount && amount !== 0) return '€0.00';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'EUR',
    }).format(amount);
  };

  const getStatusColor = (status) => {
    switch(status?.toLowerCase()) {
      case 'paid':
        return { color: '#22c55e', backgroundColor: 'rgba(34, 197, 94, 0.1)' };
      case 'partially paid':
        return { color: '#f59e0b', backgroundColor: 'rgba(245, 158, 11, 0.1)' };
      case 'overdue':
        return { color: '#ef4444', backgroundColor: 'rgba(239, 68, 68, 0.1)' };
      case 'pending':
        return { color: '#3b82f6', backgroundColor: 'rgba(59, 130, 246, 0.1)' };
      default:
        return { color: '#9ca3af', backgroundColor: 'rgba(156, 163, 175, 0.1)' };
    }
  };

  const getStatusIcon = (status) => {
    switch(status?.toLowerCase()) {
      case 'paid':
        return <DollarSign className="w-4 h-4" />;
      case 'partially paid':
        return <DollarSign className="w-4 h-4" />;
      case 'overdue':
        return <AlertCircle className="w-4 h-4" />;
      case 'pending':
        return <FileText className="w-4 h-4" />;
      default:
        return <FileText className="w-4 h-4" />;
    }
  };

  const handleDownloadInvoice = (invoice) => {
    // Placeholder for invoice download functionality
    console.log('Downloading invoice:', invoice.invoiceNumber);
    alert(`Download functionality for invoice ${invoice.invoiceNumber} will be implemented soon.`);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-400">Loading invoices...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <div className="text-red-400 mb-4">⚠️ {error}</div>
        <button 
          onClick={fetchInvoices}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-white">Invoices</h2>
          <p className="text-gray-400 mt-1">
            {filteredInvoices.length} invoice{filteredInvoices.length !== 1 ? 's' : ''} found for {customerName}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-gray-800 rounded-lg p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Search invoices..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Status Filter */}
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none"
            >
              <option value="all">All Statuses</option>
              <option value="paid">Paid</option>
              <option value="pending">Pending</option>
              <option value="overdue">Overdue</option>
              <option value="partially paid">Partially Paid</option>
            </select>
          </div>

          {/* Date Filter */}
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <select
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none"
            >
              <option value="all">All Time</option>
              <option value="week">Last Week</option>
              <option value="month">Last Month</option>
              <option value="quarter">Last 3 Months</option>
            </select>
          </div>
        </div>
      </div>

      {/* Invoices List */}
      {filteredInvoices.length === 0 ? (
        <div className="text-center py-12">
          <FileText className="w-12 h-12 text-gray-600 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-300 mb-2">No invoices found</h3>
          <p className="text-gray-400">
            {invoices.length === 0 
              ? "No invoices have been created for this customer yet." 
              : "Try adjusting your search criteria."}
          </p>
          {invoices.length === 0 && (
            <p className="text-gray-500 text-sm mt-2">
              Invoices will appear here once orders are processed and invoiced.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {filteredInvoices.map(invoice => (
            <div key={invoice.id} className="bg-gray-800 rounded-xl shadow-lg overflow-hidden hover:shadow-xl transition-shadow">
              {/* Mobile layout */}
              <div className="block lg:hidden p-4 space-y-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-semibold text-white truncate">
                      {invoice.invoiceNumber}
                    </h3>
                    <div className="mt-1 space-y-1 text-sm text-gray-400">
                      <div className="flex items-center">
                        <Calendar className="w-4 h-4 mr-1 flex-shrink-0" />
                        <span className="truncate">Issued: {formatDate(invoice.issueDate)}</span>
                      </div>
                      <div className="flex items-center">
                        <Calendar className="w-4 h-4 mr-1 flex-shrink-0" />
                        <span className="truncate">Due: {formatDate(invoice.dueDate)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="ml-3 flex-shrink-0">
                    <span 
                      className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium"
                      style={getStatusColor(invoice.status)}
                    >
                      {getStatusIcon(invoice.status)}
                      <span className="ml-1 hidden sm:inline">{invoice.status}</span>
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-400">Order:</span>
                    <div className="text-white font-medium">
                      {invoice.orderNumber || invoice.orderId}
                    </div>
                  </div>
                  <div>
                    <span className="text-gray-400">Amount:</span>
                    <div className="text-white font-medium">
                      {formatCurrency(invoice.totalAmount || invoice.total)}
                    </div>
                  </div>
                  <div className="col-span-2">
                    <span className="text-gray-400">Payment:</span>
                    <div className="text-white">{invoice.paymentStatus} ({invoice.paymentMethod})</div>
                  </div>
                </div>

                <div className="flex flex-col space-y-2">
                  <button
                    onClick={() => setSelectedInvoice(selectedInvoice === invoice.id ? null : invoice.id)}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors flex items-center justify-center"
                  >
                    <Eye className="w-4 h-4 mr-2" />
                    <span className="text-sm">
                      {selectedInvoice === invoice.id ? 'Hide Details' : 'View Details'}
                    </span>
                  </button>
                  <button 
                    onClick={() => handleDownloadInvoice(invoice)}
                    className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg transition-colors flex items-center justify-center"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    <span className="text-sm">Download PDF</span>
                  </button>
                </div>
              </div>

              {/* Desktop layout */}
              <div className="hidden lg:block p-6">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="text-lg font-semibold text-white">
                      {invoice.invoiceNumber}
                    </h3>
                    <div className="flex items-center space-x-4 mt-1 text-sm text-gray-400">
                      <div className="flex items-center">
                        <Calendar className="w-4 h-4 mr-1" />
                        Issued: {formatDate(invoice.issueDate)}
                      </div>
                      <div className="flex items-center">
                        <Calendar className="w-4 h-4 mr-1" />
                        Due: {formatDate(invoice.dueDate)}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-4">
                    <span 
                      className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium"
                      style={getStatusColor(invoice.status)}
                    >
                      {getStatusIcon(invoice.status)}
                      <span className="ml-1">{invoice.status}</span>
                    </span>
                    <button
                      onClick={() => setSelectedInvoice(selectedInvoice === invoice.id ? null : invoice.id)}
                      className="text-blue-400 hover:text-blue-300 flex items-center"
                    >
                      <Eye className="w-4 h-4 mr-1" />
                      {selectedInvoice === invoice.id ? 'Hide' : 'View'} Details
                    </button>
                  </div>
                </div>

                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-sm text-gray-400">
                      Order: {invoice.orderNumber || invoice.orderId}
                    </p>
                    <p className="text-sm text-gray-400">
                      Payment: {invoice.paymentStatus} ({invoice.paymentMethod})
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-white">
                      {formatCurrency(invoice.totalAmount || invoice.total)}
                    </p>
                    <button 
                      onClick={() => handleDownloadInvoice(invoice)}
                      className="text-sm text-green-400 hover:text-green-300 flex items-center"
                    >
                      <Download className="w-4 h-4 mr-1" />
                      Download PDF
                    </button>
                  </div>
                </div>
              </div>

              {/* Invoice Details */}
              {selectedInvoice === invoice.id && (
                <div className="mt-6 pt-6 px-4 lg:px-6 border-t border-gray-600">
                  <h4 className="font-medium text-white mb-3">Invoice Details</h4>
                  
                  {/* Invoice Items */}
                  <div className="space-y-3 mb-6">
                    {(invoice.items || []).map((item, index) => (
                      <div key={item.id || index} className="flex justify-between items-center py-2 border-b border-gray-700 last:border-b-0">
                        <div className="flex-1">
                          <p className="font-medium text-white">{item.name}</p>
                          <p className="text-sm text-gray-400">Unit: {item.unit || 'pcs'}</p>
                        </div>
                        <div className="text-right ml-4">
                          <p className="font-medium text-white">
                            {item.quantity} × {formatCurrency(item.price)}
                          </p>
                          <p className="text-sm text-gray-400">
                            {formatCurrency(parseFloat(item.quantity) * parseFloat(item.price))}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                  
                  {/* Invoice Summary */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-sm">
                    <div>
                      <h5 className="font-medium text-white mb-2">Invoice Information</h5>
                      <div className="space-y-1 text-gray-400">
                        <p><strong>Invoice Number:</strong> {invoice.invoiceNumber || invoice.id}</p>
                        <p><strong>Issue Date:</strong> {formatDate(invoice.issueDate || invoice.createdAt)}</p>
                        <p><strong>Due Date:</strong> {formatDate(invoice.dueDate)}</p>
                        {(invoice.orderNumber || invoice.orderId) && (
                          <p><strong>Related Order:</strong> {invoice.orderNumber || invoice.orderId}</p>
                        )}
                        {invoice.description && (
                          <p><strong>Description:</strong> {invoice.description}</p>
                        )}
                      </div>
                    </div>
                    <div>
                      <h5 className="font-medium text-white mb-2">Payment Information</h5>
                      <div className="space-y-1 text-gray-400">
                        {invoice.subtotal && (
                          <p><strong>Subtotal:</strong> {formatCurrency(invoice.subtotal)}</p>
                        )}
                        {invoice.taxAmount && (
                          <p><strong>Tax Amount:</strong> {formatCurrency(invoice.taxAmount)}</p>
                        )}
                        {invoice.discountAmount && (
                          <p><strong>Discount:</strong> {formatCurrency(invoice.discountAmount)}</p>
                        )}
                        <p><strong>Total Amount:</strong> {formatCurrency(invoice.totalAmount || invoice.total)}</p>
                        <p><strong>Paid Amount:</strong> {formatCurrency(invoice.paidAmount || 0)}</p>
                        <p><strong>Balance:</strong> {formatCurrency((invoice.totalAmount || invoice.total || 0) - (invoice.paidAmount || 0))}</p>
                        {invoice.paymentMethod && (
                          <p><strong>Payment Method:</strong> {invoice.paymentMethod}</p>
                        )}
                        <p><strong>Status:</strong> <span style={getStatusColor(invoice.status)}>{invoice.status}</span></p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Invoices; 