import React, { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, doc, updateDoc, deleteDoc, query, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import { Plus, Eye, Edit, Trash2, Globe } from 'lucide-react';

const CustomerPortals = () => {
  const [portals, setPortals] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [priceLists, setPriceLists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingPortalId, setEditingPortalId] = useState(null);
  const [formData, setFormData] = useState({
    customerId: '',
    customerName: '',
    portalName: '',
    slug: '',
    description: '',
    assignedPriceLists: [],
    username: '',
    password: '',
    requiresLogin: false
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      await Promise.all([
        fetchPortals(),
        fetchCustomers(),
        fetchPriceLists()
      ]);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchPortals = async () => {
    try {
      const portalsRef = collection(db, 'customerPortals');
      const q = query(portalsRef, orderBy('createdAt', 'desc'));
      const querySnapshot = await getDocs(q);
      
      const portalsData = [];
      querySnapshot.forEach((doc) => {
        portalsData.push({
          id: doc.id,
          ...doc.data()
        });
      });
      
      setPortals(portalsData);
    } catch (error) {
      console.error('Error fetching portals:', error);
    }
  };

  const fetchCustomers = async () => {
    try {
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
    } catch (error) {
      console.error('Error fetching customers:', error);
    }
  };

  const fetchPriceLists = async () => {
    try {
      // Try different possible collection names for price lists
      const collections = ['priceLists', 'price-lists', 'products', 'inventory'];
      let priceListsData = [];
      
      for (const collectionName of collections) {
        try {
          const priceListsRef = collection(db, collectionName);
          const q = query(priceListsRef, orderBy('name', 'asc'));
          const querySnapshot = await getDocs(q);
          
          if (!querySnapshot.empty) {
            querySnapshot.forEach((doc) => {
              priceListsData.push({
                id: doc.id,
                name: doc.data().name || 'Unnamed Product',
                category: doc.data().category || 'Uncategorized',
                price: doc.data().price || doc.data().unitPrice || 0,
                ...doc.data()
              });
            });
            break; // Found data, stop trying other collections
          }
        } catch (collectionError) {
          console.log(`Collection ${collectionName} not found or empty`);
        }
      }
      
      setPriceLists(priceListsData);
    } catch (error) {
      console.error('Error fetching price lists:', error);
    }
  };

  const generateSlug = (name) => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    
    if (name === 'customerId') {
      const selectedCustomer = customers.find(c => c.id === value);
      setFormData(prev => ({
        ...prev,
        customerId: value,
        customerName: selectedCustomer?.name || '',
        slug: selectedCustomer ? generateSlug(selectedCustomer.name) : '',
        portalName: selectedCustomer ? `${selectedCustomer.name} Portal` : ''
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        [name]: value,
        ...(name === 'customerName' && { slug: generateSlug(value) })
      }));
    }
  };

  const handlePriceListToggle = (priceListId) => {
    setFormData(prev => ({
      ...prev,
      assignedPriceLists: prev.assignedPriceLists.includes(priceListId)
        ? prev.assignedPriceLists.filter(id => id !== priceListId)
        : [...prev.assignedPriceLists, priceListId]
    }));
  };

  const handleEdit = (portal) => {
    setIsEditing(true);
    setEditingPortalId(portal.id);
    setFormData({
      customerId: portal.customerId || '',
      customerName: portal.customerName || '',
      portalName: portal.portalName || '',
      slug: portal.slug || '',
      description: portal.description || '',
      assignedPriceLists: portal.assignedPriceLists || [],
      username: portal.username || '',
      password: portal.password || '',
      requiresLogin: portal.requiresLogin || false
    });
    setShowModal(true);
  };

  const handleDelete = async (portalId) => {
    if (window.confirm('Are you sure you want to delete this portal? This action cannot be undone.')) {
      try {
        await deleteDoc(doc(db, 'customerPortals', portalId));
        fetchPortals();
      } catch (error) {
        console.error('Error deleting portal:', error);
      }
    }
  };

  const resetForm = () => {
    setFormData({
      customerId: '',
      customerName: '',
      portalName: '',
      slug: '',
      description: '',
      assignedPriceLists: [],
      username: '',
      password: '',
      requiresLogin: false
    });
    setIsEditing(false);
    setEditingPortalId(null);
  };

  const handleModalClose = () => {
    setShowModal(false);
    resetForm();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const portalData = {
        ...formData,
        status: 'active',
        updatedAt: new Date()
      };

      if (isEditing && editingPortalId) {
        // Update existing portal
        await updateDoc(doc(db, 'customerPortals', editingPortalId), portalData);
      } else {
        // Create new portal
        portalData.createdAt = new Date();
        await addDoc(collection(db, 'customerPortals'), portalData);
      }

      setShowModal(false);
      resetForm();
      fetchPortals();
    } catch (error) {
      console.error('Error saving portal:', error);
    }
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return 'N/A';
    try {
      if (timestamp.toDate) {
        return timestamp.toDate().toLocaleDateString();
      }
      return new Date(timestamp).toLocaleDateString();
    } catch (error) {
      return 'Invalid date';
    }
  };

  const getAssignedPriceListsNames = (assignedIds) => {
    if (!assignedIds || assignedIds.length === 0) return 'No price lists';
    return assignedIds
      .map(id => priceLists.find(pl => pl.id === id)?.name)
      .filter(Boolean)
      .join(', ') || 'Unknown price lists';
  };

  // Group price lists by category
  const groupedPriceLists = priceLists.reduce((acc, priceList) => {
    const category = priceList.category || 'Uncategorized';
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(priceList);
    return acc;
  }, {});

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-400">Loading portals...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-white">Customer Portals</h2>
          <p className="text-gray-400 mt-1">
            {portals.length} portal{portals.length !== 1 ? 's' : ''} found
          </p>
        </div>
        <button 
          onClick={() => setShowModal(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md flex items-center space-x-2"
        >
          <Plus className="w-5 h-5" />
          <span>Add Portal</span>
        </button>
      </div>

      {/* Portals List */}
      {portals.length === 0 ? (
        <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden shadow-lg">
          <div className="text-center py-20">
            <div className="mx-auto h-24 w-24 text-gray-400 mb-4 flex items-center justify-center">
              <Globe className="w-full h-full" />
            </div>
            <h3 className="text-lg font-medium text-gray-300 mb-2">No customer portals</h3>
            <p className="text-gray-400 max-w-sm mx-auto">
              Get started by creating your first customer portal. Portals allow customers to access their personalized content and services.
            </p>
            <div className="mt-6">
              <button 
                onClick={() => setShowModal(true)}
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-md font-medium transition-colors"
              >
                Create Your First Portal
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden shadow-lg">
          {/* Mobile view - pokazuje karty na małych ekranach */}
          <div className="block lg:hidden">
            <div className="p-4 space-y-4">
              {portals.map((portal) => (
                <div key={portal.id} className="bg-gray-700 rounded-lg p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center flex-1 min-w-0">
                      <div className="h-10 w-10 flex-shrink-0">
                        <div className="h-10 w-10 rounded-full bg-green-600 flex items-center justify-center">
                          {portal.portalName ? (
                            <span className="text-sm font-medium text-white">
                              {portal.portalName.charAt(0).toUpperCase()}
                            </span>
                          ) : (
                            <Globe className="w-5 h-5 text-white" />
                          )}
                        </div>
                      </div>
                      <div className="ml-3 min-w-0 flex-1">
                        <div className="text-sm font-medium text-white truncate">
                          {portal.portalName || 'Unnamed Portal'}
                        </div>
                        <div className="text-xs text-gray-400 truncate">
                          {portal.description || 'No description'}
                        </div>
                      </div>
                    </div>
                    <div className="flex space-x-2 flex-shrink-0">
                      <a 
                        href={`/portal/${portal.slug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-400 hover:text-blue-300 p-1"
                        title="View Portal"
                      >
                        <Eye className="w-4 h-4" />
                      </a>
                      <button 
                        onClick={() => handleEdit(portal)}
                        className="text-gray-400 hover:text-gray-300 p-1"
                        title="Edit Portal"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => handleDelete(portal.id)}
                        className="text-red-400 hover:text-red-300 p-1"
                        title="Delete Portal"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4 text-xs">
                    <div>
                      <span className="text-gray-400">Customer:</span>
                      <div className="text-white truncate">{portal.customerName || 'No customer'}</div>
                    </div>
                    <div>
                      <span className="text-gray-400">Status:</span>
                      <div>
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          portal.status === 'active' 
                            ? 'bg-green-100 text-green-800' 
                            : 'bg-gray-100 text-gray-800'
                        }`}>
                          {portal.status || 'active'}
                        </span>
                      </div>
                    </div>
                    <div className="col-span-2">
                      <span className="text-gray-400">URL:</span>
                      <div className="text-blue-400 truncate">
                        <a 
                          href={`/portal/${portal.slug}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:text-blue-300"
                        >
                          /portal/{portal.slug}
                        </a>
                      </div>
                    </div>
                    <div className="col-span-2">
                      <span className="text-gray-400">Price Lists:</span>
                      <div className="text-white break-words">
                        {getAssignedPriceListsNames(portal.assignedPriceLists)}
                      </div>
                    </div>
                    <div>
                      <span className="text-gray-400">Login:</span>
                      <div>
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          portal.requiresLogin
                            ? 'bg-yellow-100 text-yellow-800' 
                            : 'bg-green-100 text-green-800'
                        }`}>
                          {portal.requiresLogin ? 'Protected' : 'Public'}
                        </span>
                      </div>
                    </div>
                    <div>
                      <span className="text-gray-400">Created:</span>
                      <div className="text-white">{formatDate(portal.createdAt)}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Desktop view - tabela na większych ekranach */}
          <div className="hidden lg:block overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-700">
              <thead className="bg-gray-900">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    Portal Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    Customer
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    URL
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    Price Lists
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    Login
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
                {portals.map((portal) => (
                  <tr key={portal.id} className="hover:bg-gray-700 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="h-10 w-10 flex-shrink-0">
                          <div className="h-10 w-10 rounded-full bg-green-600 flex items-center justify-center">
                            {portal.portalName ? (
                              <span className="text-sm font-medium text-white">
                                {portal.portalName.charAt(0).toUpperCase()}
                              </span>
                            ) : (
                              <Globe className="w-5 h-5 text-white" />
                            )}
                          </div>
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-white">
                            {portal.portalName || 'Unnamed Portal'}
                          </div>
                          <div className="text-sm text-gray-400">
                            {portal.description || 'No description'}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-300">
                        {portal.customerName || 'No customer'}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-blue-400">
                        <a 
                          href={`/portal/${portal.slug}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:text-blue-300"
                        >
                          /portal/{portal.slug}
                        </a>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-300 max-w-xs">
                        {getAssignedPriceListsNames(portal.assignedPriceLists)}
                      </div>
                      {portal.assignedPriceLists && portal.assignedPriceLists.length > 0 && (
                        <div className="text-xs text-gray-400 mt-1">
                          {portal.assignedPriceLists.length} item{portal.assignedPriceLists.length !== 1 ? 's' : ''}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        portal.requiresLogin
                          ? 'bg-yellow-100 text-yellow-800' 
                          : 'bg-green-100 text-green-800'
                      }`}>
                        {portal.requiresLogin ? 'Protected' : 'Public'}
                      </span>
                      {portal.requiresLogin && portal.username && (
                        <div className="text-xs text-gray-400 mt-1">
                          User: {portal.username}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        portal.status === 'active' 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-gray-100 text-gray-800'
                      }`}>
                        {portal.status || 'active'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">
                      {formatDate(portal.createdAt)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex justify-end space-x-2">
                        <a 
                          href={`/portal/${portal.slug}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-400 hover:text-blue-300"
                          title="View Portal"
                        >
                          <Eye className="w-5 h-5" />
                        </a>
                        <button 
                          onClick={() => handleEdit(portal)}
                          className="text-gray-400 hover:text-gray-300"
                          title="Edit Portal"
                        >
                          <Edit className="w-5 h-5" />
                        </button>
                        <button 
                          onClick={() => handleDelete(portal.id)}
                          className="text-red-400 hover:text-red-300"
                          title="Delete Portal"
                        >
                          <Trash2 className="w-5 h-5" />
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

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-lg border border-gray-700 p-4 lg:p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-medium text-white mb-4">
              {isEditing ? 'Edit Portal' : 'Create New Portal'}
            </h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Customer Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Customer *
                </label>
                <select
                  name="customerId"
                  value={formData.customerId}
                  onChange={handleInputChange}
                  required
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-md text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">Select a customer</option>
                  {customers.map(customer => (
                    <option key={customer.id} value={customer.id}>
                      {customer.name || 'Unnamed Customer'} {customer.email && `(${customer.email})`}
                    </option>
                  ))}
                </select>
                {customers.length === 0 && (
                  <p className="text-xs text-yellow-400 mt-1">
                    No customers found. Please add customers first.
                  </p>
                )}
              </div>
              
              {/* Portal Name */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Portal Name *
                </label>
                <input
                  type="text"
                  name="portalName"
                  value={formData.portalName}
                  onChange={handleInputChange}
                  required
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-md text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Enter portal name"
                />
              </div>

              {/* URL Slug */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  URL Slug *
                </label>
                <input
                  type="text"
                  name="slug"
                  value={formData.slug}
                  onChange={handleInputChange}
                  required
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-md text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="auto-generated-slug"
                />
                <p className="text-xs text-gray-400 mt-1">
                  Portal will be accessible at: /portal/{formData.slug}
                </p>
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Description
                </label>
                <textarea
                  name="description"
                  value={formData.description}
                  onChange={handleInputChange}
                  rows={3}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-md text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Enter portal description"
                />
              </div>

              {/* Custom Login Settings */}
              <div className="bg-slate-900 p-4 rounded-lg border border-slate-600">
                <h4 className="text-sm font-medium text-gray-300 mb-3">Login Settings</h4>
                
                {/* Requires Login Checkbox */}
                <div className="mb-4">
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      name="requiresLogin"
                      checked={formData.requiresLogin}
                      onChange={(e) => setFormData(prev => ({ ...prev, requiresLogin: e.target.checked }))}
                      className="rounded border-slate-500 text-blue-600 focus:ring-blue-500 focus:ring-offset-slate-900"
                    />
                    <span className="text-sm text-white">Require custom login for this portal</span>
                  </label>
                </div>

                {/* Username and Password fields - only show if login is required */}
                {formData.requiresLogin && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-1">
                        Username *
                      </label>
                      <input
                        type="text"
                        name="username"
                        value={formData.username}
                        onChange={handleInputChange}
                        required={formData.requiresLogin}
                        className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-md text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="Enter username"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-1">
                        Password *
                      </label>
                      <input
                        type="password"
                        name="password"
                        value={formData.password}
                        onChange={handleInputChange}
                        required={formData.requiresLogin}
                        className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-md text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="Enter password"
                      />
                    </div>
                  </div>
                )}
                
                {!formData.requiresLogin && (
                  <p className="text-xs text-gray-400">
                    Portal will be publicly accessible without login
                  </p>
                )}
              </div>

              {/* Price Lists Assignment */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-3">
                  Assign Price Lists ({formData.assignedPriceLists.length} selected)
                </label>
                <div className="max-h-64 overflow-y-auto bg-slate-900 border border-slate-600 rounded-md p-3">
                  {Object.keys(groupedPriceLists).length === 0 ? (
                    <p className="text-gray-400 text-sm">No price lists available</p>
                  ) : (
                    Object.entries(groupedPriceLists).map(([category, items]) => (
                      <div key={category} className="mb-4">
                        <h4 className="text-sm font-medium text-gray-300 mb-2 border-b border-slate-600 pb-1">
                          {category} ({items.length} items)
                        </h4>
                        <div className="space-y-2 ml-2">
                          {items.map(priceList => (
                            <label key={priceList.id} className="flex items-center space-x-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={formData.assignedPriceLists.includes(priceList.id)}
                                onChange={() => handlePriceListToggle(priceList.id)}
                                className="rounded border-slate-500 text-blue-600 focus:ring-blue-500 focus:ring-offset-slate-900"
                              />
                              <div className="flex-1">
                                <span className="text-sm text-white">{priceList.name}</span>
                                {priceList.price > 0 && (
                                  <span className="text-xs text-green-400 ml-2">
                                    ${priceList.price.toFixed(2)}
                                  </span>
                                )}
                                {priceList.sku && (
                                  <span className="text-xs text-gray-400 ml-2">
                                    SKU: {priceList.sku}
                                  </span>
                                )}
                              </div>
                            </label>
                          ))}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Form Actions */}
              <div className="flex space-x-4 pt-4">
                <button
                  type="button"
                  onClick={handleModalClose}
                  className="flex-1 bg-gray-700 text-gray-300 px-4 py-2 rounded-md hover:bg-gray-600 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors disabled:bg-gray-600 disabled:cursor-not-allowed"
                  disabled={
                    !formData.customerId || 
                    !formData.portalName || 
                    !formData.slug ||
                    (formData.requiresLogin && (!formData.username || !formData.password))
                  }
                >
                  {isEditing ? 'Update Portal' : 'Create Portal'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default CustomerPortals; 