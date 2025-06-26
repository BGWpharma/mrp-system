import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import { Eye, X, User } from 'lucide-react';

const Customers = () => {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [showDialog, setShowDialog] = useState(false);

  useEffect(() => {
    const fetchCustomers = async () => {
      try {
        setLoading(true);
        const customersRef = collection(db, 'customers');
        const q = query(customersRef, orderBy('name', 'asc'));
        const querySnapshot = await getDocs(q);
        
        const customersData = [];
        querySnapshot.forEach((doc) => {
          customersData.push({
            id: doc.id,
            ...doc.data()
          });
        });
        
        setCustomers(customersData);
        setError(null);
      } catch (error) {
        console.error('Error fetching customers:', error);
        setError('Failed to load customers');
      } finally {
        setLoading(false);
      }
    };

    fetchCustomers();
  }, []);

  const handleViewCustomer = (customer) => {
    setSelectedCustomer(customer);
    setShowDialog(true);
  };

  const closeDialog = () => {
    setShowDialog(false);
    setSelectedCustomer(null);
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return 'N/A';
    try {
      // Handle Firestore timestamp
      if (timestamp.toDate) {
        return timestamp.toDate().toLocaleDateString();
      }
      // Handle regular date string
      return new Date(timestamp).toLocaleDateString();
    } catch (error) {
      return 'Invalid date';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-400">Loading customers...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <div className="text-red-400 mb-4">⚠️ {error}</div>
        <button 
          onClick={() => window.location.reload()}
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
          <h2 className="text-2xl font-bold text-white">Customers</h2>
          <p className="text-gray-400 mt-1">
            {customers.length} customer{customers.length !== 1 ? 's' : ''} found
          </p>
        </div>
      </div>

      {/* Customers List */}
      {customers.length === 0 ? (
        <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
          <div className="text-center py-20">
            <div className="mx-auto h-24 w-24 text-gray-400 mb-4 flex items-center justify-center">
              <User className="w-full h-full" />
            </div>
            <h3 className="text-lg font-medium text-gray-300 mb-2">No customers found</h3>
            <p className="text-gray-400 max-w-sm mx-auto">
              No customers are currently in the system. Customers will appear here once they are added.
            </p>
          </div>
        </div>
      ) : (
        <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden shadow-lg">
          {/* Mobile view - pokazuje karty na małych ekranach */}
          <div className="block md:hidden">
            <div className="p-4 space-y-4">
              {customers.map((customer) => (
                <div key={customer.id} className="bg-gray-700 rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <div className="h-10 w-10 flex-shrink-0">
                        <div className="h-10 w-10 rounded-full bg-blue-600 flex items-center justify-center">
                          <span className="text-sm font-medium text-white">
                            {customer.name ? customer.name.charAt(0).toUpperCase() : '?'}
                          </span>
                        </div>
                      </div>
                      <div className="ml-3">
                        <div className="text-sm font-medium text-white">
                          {customer.name || 'Unnamed Customer'}
                        </div>
                        <div className="text-xs text-gray-400">
                          ID: {customer.id}
                        </div>
                      </div>
                    </div>
                    <button 
                      onClick={() => handleViewCustomer(customer)}
                      className="text-blue-400 hover:text-blue-300 p-2 rounded-lg hover:bg-gray-600 transition-colors"
                      title="View Customer Details"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                  </div>
                  
                  <div className="space-y-2 text-sm">
                    <div>
                      <span className="text-gray-400">Contact:</span>
                      <div className="text-gray-300">{customer.email || 'No email'}</div>
                      <div className="text-gray-400">{customer.phone || 'No phone'}</div>
                    </div>
                    
                    <div>
                      <span className="text-gray-400">Address:</span>
                      <div className="text-gray-300 break-words">
                        {customer.address || customer.billingAddress || 'No address'}
                      </div>
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        customer.supplierVatEu 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-gray-100 text-gray-800'
                      }`}>
                        {customer.supplierVatEu ? 'EU VAT' : 'Standard'}
                      </span>
                      <span className="text-xs text-gray-400">
                        {formatDate(customer.createdAt)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Desktop view - tabela na większych ekranach */}
          <div className="hidden md:block overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-700">
              <thead className="bg-gray-900">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    Customer
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    Contact
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    Address
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    Created
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-300 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-gray-800 divide-y divide-gray-700">
                {customers.map((customer) => (
                  <tr key={customer.id} className="hover:bg-gray-700 transition-colors duration-200">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="h-10 w-10 flex-shrink-0">
                          <div className="h-10 w-10 rounded-full bg-blue-600 flex items-center justify-center">
                            <span className="text-sm font-medium text-white">
                              {customer.name ? customer.name.charAt(0).toUpperCase() : '?'}
                            </span>
                          </div>
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-white">
                            {customer.name || 'Unnamed Customer'}
                          </div>
                          <div className="text-sm text-gray-400">
                            ID: {customer.id}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-300">
                        {customer.email || 'No email'}
                      </div>
                      <div className="text-sm text-gray-400">
                        {customer.phone || 'No phone'}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-300 max-w-xs truncate">
                        {customer.address || customer.billingAddress || 'No address'}
                      </div>
                      {customer.shippingAddress && customer.shippingAddress !== customer.address && (
                        <div className="text-sm text-gray-400 max-w-xs truncate">
                          Ship: {customer.shippingAddress}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        customer.supplierVatEu 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-gray-100 text-gray-800'
                      }`}>
                        {customer.supplierVatEu ? 'EU VAT' : 'Standard'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">
                      {formatDate(customer.createdAt)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex justify-end">
                        <button 
                          onClick={() => handleViewCustomer(customer)}
                          className="text-blue-400 hover:text-blue-300 p-2 rounded-lg hover:bg-gray-700 transition-colors"
                          title="View Customer Details"
                        >
                          <Eye className="w-5 h-5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Customer Details Dialog */}
      {showDialog && selectedCustomer && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-lg border border-slate-700 max-w-4xl w-full max-h-[90vh] overflow-hidden">
            {/* Dialog Header */}
            <div className="px-6 py-4 border-b border-slate-700 flex justify-between items-center">
              <div>
                <h3 className="text-xl font-semibold text-white">Customer Details</h3>
                <p className="text-gray-400 mt-1">
                  {selectedCustomer.name || 'Unknown Customer'}
                </p>
              </div>
              <button
                onClick={closeDialog}
                className="text-gray-400 hover:text-white"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Dialog Content */}
            <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* Basic Information */}
                <div className="bg-slate-700 rounded-lg p-4">
                  <h4 className="text-lg font-medium text-white mb-4">Basic Information</h4>
                  <div className="space-y-3">
                    <div>
                      <label className="text-sm text-gray-400">Customer ID</label>
                      <p className="text-white font-mono text-sm">{selectedCustomer.id}</p>
                    </div>
                    <div>
                      <label className="text-sm text-gray-400">Name</label>
                      <p className="text-white">{selectedCustomer.name || 'N/A'}</p>
                    </div>
                    <div>
                      <label className="text-sm text-gray-400">Type</label>
                      <p className="text-white">{selectedCustomer.type || 'Individual'}</p>
                    </div>
                    <div>
                      <label className="text-sm text-gray-400">Status</label>
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        selectedCustomer.supplierVatEu 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-gray-100 text-gray-800'
                      }`}>
                        {selectedCustomer.supplierVatEu ? 'EU VAT Supplier' : 'Standard Customer'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Contact Information */}
                <div className="bg-slate-700 rounded-lg p-4">
                  <h4 className="text-lg font-medium text-white mb-4">Contact Information</h4>
                  <div className="space-y-3">
                    <div>
                      <label className="text-sm text-gray-400">Email</label>
                      <p className="text-white break-all">{selectedCustomer.email || 'N/A'}</p>
                    </div>
                    <div>
                      <label className="text-sm text-gray-400">Phone</label>
                      <p className="text-white">{selectedCustomer.phone || 'N/A'}</p>
                    </div>
                    <div>
                      <label className="text-sm text-gray-400">Website</label>
                      <p className="text-white break-all">{selectedCustomer.website || 'N/A'}</p>
                    </div>
                  </div>
                </div>

                {/* Billing Address */}
                <div className="bg-slate-700 rounded-lg p-4">
                  <h4 className="text-lg font-medium text-white mb-4">Billing Address</h4>
                  <div className="space-y-3">
                    <div>
                      <label className="text-sm text-gray-400">Address</label>
                      <p className="text-white">{selectedCustomer.address || selectedCustomer.billingAddress || 'N/A'}</p>
                    </div>
                    <div>
                      <label className="text-sm text-gray-400">City</label>
                      <p className="text-white">{selectedCustomer.city || 'N/A'}</p>
                    </div>
                    <div>
                      <label className="text-sm text-gray-400">Postal Code</label>
                      <p className="text-white">{selectedCustomer.postalCode || selectedCustomer.zipCode || 'N/A'}</p>
                    </div>
                    <div>
                      <label className="text-sm text-gray-400">Country</label>
                      <p className="text-white">{selectedCustomer.country || 'N/A'}</p>
                    </div>
                  </div>
                </div>

                {/* Shipping Address */}
                <div className="bg-slate-700 rounded-lg p-4">
                  <h4 className="text-lg font-medium text-white mb-4">Shipping Address</h4>
                  <div className="space-y-3">
                    <div>
                      <label className="text-sm text-gray-400">Address</label>
                      <p className="text-white">{selectedCustomer.shippingAddress || 'Same as billing'}</p>
                    </div>
                    <div>
                      <label className="text-sm text-gray-400">Shipping City</label>
                      <p className="text-white">{selectedCustomer.shippingCity || selectedCustomer.city || 'N/A'}</p>
                    </div>
                    <div>
                      <label className="text-sm text-gray-400">Shipping Postal Code</label>
                      <p className="text-white">{selectedCustomer.shippingPostalCode || selectedCustomer.postalCode || 'N/A'}</p>
                    </div>
                    <div>
                      <label className="text-sm text-gray-400">Shipping Country</label>
                      <p className="text-white">{selectedCustomer.shippingCountry || selectedCustomer.country || 'N/A'}</p>
                    </div>
                  </div>
                </div>

                {/* Tax Information */}
                <div className="bg-slate-700 rounded-lg p-4">
                  <h4 className="text-lg font-medium text-white mb-4">Tax Information</h4>
                  <div className="space-y-3">
                    <div>
                      <label className="text-sm text-gray-400">VAT Number</label>
                      <p className="text-white font-mono">{selectedCustomer.vatNumber || 'N/A'}</p>
                    </div>
                    <div>
                      <label className="text-sm text-gray-400">Tax ID</label>
                      <p className="text-white font-mono">{selectedCustomer.taxId || 'N/A'}</p>
                    </div>
                    <div>
                      <label className="text-sm text-gray-400">EU VAT Supplier</label>
                      <p className="text-white">{selectedCustomer.supplierVatEu ? 'Yes' : 'No'}</p>
                    </div>
                  </div>
                </div>

                {/* Timestamps */}
                <div className="bg-slate-700 rounded-lg p-4">
                  <h4 className="text-lg font-medium text-white mb-4">Timestamps</h4>
                  <div className="space-y-3">
                    <div>
                      <label className="text-sm text-gray-400">Created At</label>
                      <p className="text-white">{formatDate(selectedCustomer.createdAt)}</p>
                    </div>
                    <div>
                      <label className="text-sm text-gray-400">Updated At</label>
                      <p className="text-white">{formatDate(selectedCustomer.updatedAt)}</p>
                    </div>
                  </div>
                </div>

              </div>

              {/* Additional Information */}
              {selectedCustomer.notes && (
                <div className="mt-6 bg-slate-700 rounded-lg p-4">
                  <h4 className="text-lg font-medium text-white mb-4">Notes</h4>
                  <p className="text-gray-300 whitespace-pre-wrap">{selectedCustomer.notes}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Customers; 