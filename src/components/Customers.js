import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import { Eye, X, User } from 'lucide-react';
import { useTranslation } from '../hooks/useTranslation';

const Customers = () => {
  const { t } = useTranslation();
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
        setError(t('customers.notifications.loadError'));
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
    if (!timestamp) return t('common.noDate');
    try {
      // Handle Firestore timestamp
      if (timestamp.toDate) {
        return timestamp.toDate().toLocaleDateString();
      }
      // Handle regular date string
      return new Date(timestamp).toLocaleDateString();
    } catch (error) {
      return t('customers.empty.invalidDate');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-400">{t('customers.loading')}</p>
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
          {t('customers.actions.retry')}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-white">{t('customers.title')}</h2>
          <p className="text-gray-400 mt-1">
            {t('customers.count', { count: customers.length })}
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
            <h3 className="text-lg font-medium text-gray-300 mb-2">{t('customers.empty.title')}</h3>
            <p className="text-gray-400 max-w-sm mx-auto">
              {t('customers.empty.description')}
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
                          {customer.name || t('customers.empty.namedCustomer')}
                        </div>
                        <div className="text-xs text-gray-400">
                          ID: {customer.id}
                        </div>
                      </div>
                    </div>
                    <button 
                      onClick={() => handleViewCustomer(customer)}
                      className="text-blue-400 hover:text-blue-300 p-2 rounded-lg hover:bg-gray-600 transition-colors"
                      title={t('customers.actions.details')}
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                  </div>
                  
                  <div className="space-y-2 text-sm">
                    <div>
                      <span className="text-gray-400">{t('customers.table.contact')}:</span>
                      <div className="text-gray-300">{customer.email || t('customers.empty.noEmail')}</div>
                      <div className="text-gray-400">{customer.phone || t('customers.empty.noPhone')}</div>
                    </div>
                    
                    <div>
                      <span className="text-gray-400">{t('customers.table.address')}:</span>
                      <div className="text-gray-300 break-words">
                        {customer.address || customer.billingAddress || t('customers.empty.noAddress')}
                      </div>
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        customer.supplierVatEu 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-gray-100 text-gray-800'
                      }`}>
                        {customer.supplierVatEu ? t('customers.status.euVat') : t('customers.status.standard')}
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
                    {t('customers.table.customer')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    {t('customers.table.contact')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    {t('customers.table.address')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    {t('customers.table.status')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    {t('customers.table.created')}
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-300 uppercase tracking-wider">
                    {t('customers.table.actions')}
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
                            {customer.name || t('customers.empty.namedCustomer')}
                          </div>
                          <div className="text-sm text-gray-400">
                            ID: {customer.id}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-300">
                        {customer.email || t('customers.empty.noEmail')}
                      </div>
                      <div className="text-sm text-gray-400">
                        {customer.phone || t('customers.empty.noPhone')}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-300 max-w-xs truncate">
                        {customer.address || customer.billingAddress || t('customers.empty.noAddress')}
                      </div>
                      {customer.shippingAddress && customer.shippingAddress !== customer.address && (
                        <div className="text-sm text-gray-400 max-w-xs truncate">
                          {t('customers.table.shippingAddress')}: {customer.shippingAddress}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        customer.supplierVatEu 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-gray-100 text-gray-800'
                      }`}>
                        {customer.supplierVatEu ? t('customers.status.euVat') : t('customers.status.standard')}
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
                          title={t('customers.actions.details')}
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
                <h3 className="text-xl font-semibold text-white">{t('customers.details.title')}</h3>
                <p className="text-gray-400 mt-1">
                  {selectedCustomer.name || t('customers.empty.namedCustomer')}
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
                  <h4 className="text-lg font-medium text-white mb-4">{t('customers.details.basicInformation')}</h4>
                  <div className="space-y-3">
                    <div>
                      <label className="text-sm text-gray-400">{t('customers.details.customerId')}</label>
                      <p className="text-white font-mono text-sm">{selectedCustomer.id}</p>
                    </div>
                    <div>
                      <label className="text-sm text-gray-400">{t('customers.details.customerName')}</label>
                      <p className="text-white">{selectedCustomer.name || t('common.noDate')}</p>
                    </div>
                    <div>
                      <label className="text-sm text-gray-400">{t('customers.details.type')}</label>
                      <p className="text-white">{selectedCustomer.type || t('customers.details.individual')}</p>
                    </div>
                    <div>
                      <label className="text-sm text-gray-400">{t('customers.details.status')}</label>
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        selectedCustomer.supplierVatEu 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-gray-100 text-gray-800'
                      }`}>
                        {selectedCustomer.supplierVatEu ? t('customers.details.euVatSupplier') : t('customers.details.standardCustomer')}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Contact Information */}
                <div className="bg-slate-700 rounded-lg p-4">
                  <h4 className="text-lg font-medium text-white mb-4">{t('customers.details.contactInformation')}</h4>
                  <div className="space-y-3">
                    <div>
                      <label className="text-sm text-gray-400">{t('customers.details.email')}</label>
                      <p className="text-white break-all">{selectedCustomer.email || t('common.noDate')}</p>
                    </div>
                    <div>
                      <label className="text-sm text-gray-400">{t('customers.details.phone')}</label>
                      <p className="text-white">{selectedCustomer.phone || t('common.noDate')}</p>
                    </div>
                    <div>
                      <label className="text-sm text-gray-400">{t('customers.details.website')}</label>
                      <p className="text-white break-all">{selectedCustomer.website || t('common.noDate')}</p>
                    </div>
                  </div>
                </div>

                {/* Billing Address */}
                <div className="bg-slate-700 rounded-lg p-4">
                  <h4 className="text-lg font-medium text-white mb-4">{t('customers.details.billingAddress')}</h4>
                  <div className="space-y-3">
                    <div>
                      <label className="text-sm text-gray-400">{t('customers.table.address')}</label>
                      <p className="text-white">{selectedCustomer.address || selectedCustomer.billingAddress || t('common.noDate')}</p>
                    </div>
                    <div>
                      <label className="text-sm text-gray-400">{t('customers.details.city')}</label>
                      <p className="text-white">{selectedCustomer.city || t('common.noDate')}</p>
                    </div>
                    <div>
                      <label className="text-sm text-gray-400">{t('customers.details.postalCode')}</label>
                      <p className="text-white">{selectedCustomer.postalCode || selectedCustomer.zipCode || t('common.noDate')}</p>
                    </div>
                    <div>
                      <label className="text-sm text-gray-400">{t('customers.details.country')}</label>
                      <p className="text-white">{selectedCustomer.country || t('common.noDate')}</p>
                    </div>
                  </div>
                </div>

                {/* Shipping Address */}
                <div className="bg-slate-700 rounded-lg p-4">
                  <h4 className="text-lg font-medium text-white mb-4">{t('customers.details.shippingAddress')}</h4>
                  <div className="space-y-3">
                    <div>
                      <label className="text-sm text-gray-400">{t('customers.table.address')}</label>
                      <p className="text-white">{selectedCustomer.shippingAddress || t('customers.details.sameAsBilling')}</p>
                    </div>
                    <div>
                      <label className="text-sm text-gray-400">{t('customers.details.shippingCity')}</label>
                      <p className="text-white">{selectedCustomer.shippingCity || selectedCustomer.city || t('common.noDate')}</p>
                    </div>
                    <div>
                      <label className="text-sm text-gray-400">{t('customers.details.shippingPostalCode')}</label>
                      <p className="text-white">{selectedCustomer.shippingPostalCode || selectedCustomer.postalCode || t('common.noDate')}</p>
                    </div>
                    <div>
                      <label className="text-sm text-gray-400">{t('customers.details.shippingCountry')}</label>
                      <p className="text-white">{selectedCustomer.shippingCountry || selectedCustomer.country || t('common.noDate')}</p>
                    </div>
                  </div>
                </div>

                {/* Tax Information */}
                <div className="bg-slate-700 rounded-lg p-4">
                  <h4 className="text-lg font-medium text-white mb-4">{t('customers.details.taxInformation')}</h4>
                  <div className="space-y-3">
                    <div>
                      <label className="text-sm text-gray-400">{t('customers.details.vatNumber')}</label>
                      <p className="text-white font-mono">{selectedCustomer.vatNumber || t('common.noDate')}</p>
                    </div>
                    <div>
                      <label className="text-sm text-gray-400">{t('customers.details.taxId')}</label>
                      <p className="text-white font-mono">{selectedCustomer.taxId || t('common.noDate')}</p>
                    </div>
                    <div>
                      <label className="text-sm text-gray-400">{t('customers.details.euVatSupplierFlag')}</label>
                      <p className="text-white">{selectedCustomer.supplierVatEu ? t('customers.status.yes') : t('customers.status.no')}</p>
                    </div>
                  </div>
                </div>

                {/* Timestamps */}
                <div className="bg-slate-700 rounded-lg p-4">
                  <h4 className="text-lg font-medium text-white mb-4">{t('customers.details.timestamps')}</h4>
                  <div className="space-y-3">
                    <div>
                      <label className="text-sm text-gray-400">{t('customers.details.createdAt')}</label>
                      <p className="text-white">{formatDate(selectedCustomer.createdAt)}</p>
                    </div>
                    <div>
                      <label className="text-sm text-gray-400">{t('customers.details.updatedAt')}</label>
                      <p className="text-white">{formatDate(selectedCustomer.updatedAt)}</p>
                    </div>
                  </div>
                </div>

              </div>

              {/* Additional Information */}
              {selectedCustomer.notes && (
                <div className="mt-6 bg-slate-700 rounded-lg p-4">
                  <h4 className="text-lg font-medium text-white mb-4">{t('customers.details.notes')}</h4>
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