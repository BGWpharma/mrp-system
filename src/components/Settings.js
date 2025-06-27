import React, { useState, useEffect } from 'react';
import { Settings as SettingsIcon, Edit2, Save, X, Database, Users, RefreshCw } from 'lucide-react';
import { collection, getDocs, query, orderBy, limit, updateDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';

const Settings = () => {
  const [counters, setCounters] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [editingCounter, setEditingCounter] = useState(null);
  const [editValue, setEditValue] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      await Promise.all([fetchCounters(), fetchCustomers()]);
    } catch (error) {
      console.error('Error loading data:', error);
      setError('Failed to load data from database');
    } finally {
      setLoading(false);
    }
  };

  const fetchCounters = async () => {
    try {
      const countersRef = collection(db, 'counters');
      const q = query(countersRef, orderBy('lastUpdated', 'desc'), limit(1));
      const querySnapshot = await getDocs(q);
      
      if (!querySnapshot.empty) {
        const counterDoc = querySnapshot.docs[0];
        setCounters({
          id: counterDoc.id,
          ...counterDoc.data()
        });
      } else {
        setCounters({
          CO: 0,
          customerCounters: {}
        });
      }
    } catch (error) {
      console.error('Error fetching counters:', error);
      throw error;
    }
  };

  const fetchCustomers = async () => {
    try {
      const customersRef = collection(db, 'customers');
      const q = query(customersRef, orderBy('name', 'asc'));
      const querySnapshot = await getDocs(q);
      
      const customersData = [];
      querySnapshot.forEach((docSnap) => {
        customersData.push({
          id: docSnap.id,
          ...docSnap.data()
        });
      });
      
      setCustomers(customersData);
    } catch (error) {
      console.error('Error fetching customers:', error);
      throw error;
    }
  };

  const handleEditCounter = (type, customerId = null) => {
    const currentValue = customerId 
      ? (counters.customerCounters && counters.customerCounters[customerId]) || 0
      : counters[type] || 0;
    
    setEditingCounter({ type, customerId });
    setEditValue(currentValue.toString());
  };

  const handleCancelEdit = () => {
    setEditingCounter(null);
    setEditValue('');
  };

  const handleSaveCounter = async () => {
    if (!editingCounter || !counters.id) return;
    
    setSaving(true);
    setError(null);
    
    try {
      const newValue = parseInt(editValue);
      if (isNaN(newValue) || newValue < 0) {
        throw new Error('Value must be a non-negative number');
      }

      const counterRef = doc(db, 'counters', counters.id);
      const updatedCounters = { ...counters };

      if (editingCounter.customerId) {
        // Aktualizuj licznik klienta
        if (!updatedCounters.customerCounters) {
          updatedCounters.customerCounters = {};
        }
        updatedCounters.customerCounters[editingCounter.customerId] = newValue;
      } else {
        // Aktualizuj licznik globalny
        updatedCounters[editingCounter.type] = newValue;
      }

      updatedCounters.lastUpdated = new Date();

      await updateDoc(counterRef, updatedCounters);
      
      setCounters(updatedCounters);
      setEditingCounter(null);
      setEditValue('');
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
      
    } catch (error) {
      console.error('Error saving counter:', error);
      setError(error.message || 'Failed to save counter');
    } finally {
      setSaving(false);
    }
  };

  const getCustomerName = (customerId) => {
    const customer = customers.find(c => c.id === customerId);
    return customer ? customer.name : `ID: ${customerId}`;
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return 'N/A';
    try {
      if (timestamp.toDate) {
        return timestamp.toDate().toLocaleString('en-US');
      }
      return new Date(timestamp).toLocaleString('en-US');
    } catch (error) {
      return 'Invalid date';
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold text-white">System Settings</h2>
            <p className="text-gray-400 mt-1">Manage CO number counters</p>
          </div>
        </div>
        <div className="bg-gray-800 rounded-lg border border-gray-700 p-8">
          <div className="flex items-center justify-center">
            <RefreshCw className="w-8 h-8 text-blue-500 animate-spin mr-3" />
            <span className="text-gray-300">Loading data...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-white">System Settings</h2>
          <p className="text-gray-400 mt-1">Manage CO number counters</p>
        </div>
        <button
          onClick={fetchData}
          className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* Status Messages */}
      {error && (
        <div className="bg-red-900/20 border border-red-500/50 text-red-300 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {success && (
        <div className="bg-green-900/20 border border-green-500/50 text-green-300 px-4 py-3 rounded-lg">
          Counter updated successfully
        </div>
      )}

      {/* Global CO Counter */}
      <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
        <div className="p-6 border-b border-gray-700">
          <div className="flex items-center gap-3">
            <Database className="w-6 h-6 text-blue-400" />
            <div>
              <h3 className="text-lg font-semibold text-white">Global CO Counter</h3>
              <p className="text-sm text-gray-400">
                Global counter for all CO orders
              </p>
            </div>
          </div>
        </div>
        
        <div className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-gray-400">Current CO number</div>
              <div className="text-2xl font-bold text-white">
                {counters ? `CO${counters.CO?.toString().padStart(5, '0') || '00001'}` : 'N/A'}
              </div>
              <div className="text-xs text-gray-500 mt-1">
                Last updated: {counters ? formatDate(counters.lastUpdated) : 'N/A'}
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              {editingCounter?.type === 'CO' && !editingCounter.customerId ? (
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    className="w-24 px-3 py-2 bg-gray-700 text-white rounded-md border border-gray-600 focus:border-blue-500 focus:outline-none"
                    placeholder="0"
                    min="0"
                  />
                  <button
                    onClick={handleSaveCounter}
                    disabled={saving}
                    className="bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white px-3 py-2 rounded-md transition-colors"
                  >
                    <Save className="w-4 h-4" />
                  </button>
                  <button
                    onClick={handleCancelEdit}
                    className="bg-gray-600 hover:bg-gray-700 text-white px-3 py-2 rounded-md transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                                  <button
                    onClick={() => handleEditCounter('CO')}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md flex items-center gap-2 transition-colors"
                  >
                    <Edit2 className="w-4 h-4" />
                    Edit
                  </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Customer Counters */}
      <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
        <div className="p-6 border-b border-gray-700">
          <div className="flex items-center gap-3">
            <Users className="w-6 h-6 text-green-400" />
            <div>
              <h3 className="text-lg font-semibold text-white">Customer CO Counters</h3>
              <p className="text-sm text-gray-400">
                Individual CO number counters for each customer
              </p>
            </div>
          </div>
        </div>
        
        <div className="p-6">
          {customers.length === 0 ? (
            <div className="text-center py-8">
              <Users className="w-12 h-12 text-gray-500 mx-auto mb-3" />
              <p className="text-gray-400">No customers in the system</p>
            </div>
          ) : (
            <div className="space-y-4">
              {customers.map((customer) => {
                const customerCounter = counters?.customerCounters?.[customer.id] || 0;
                const isEditing = editingCounter?.customerId === customer.id;
                
                return (
                  <div
                    key={customer.id}
                    className="flex items-center justify-between p-4 bg-gray-700/50 rounded-lg border border-gray-600"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <div>
                          <h4 className="font-medium text-white">{customer.name}</h4>
                          <p className="text-sm text-gray-400">ID: {customer.id}</p>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <div className="text-sm text-gray-400">Current CO number</div>
                        <div className="font-bold text-white">
                          CO{customerCounter.toString().padStart(5, '0')}
                        </div>
                      </div>
                      
                      {isEditing ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            className="w-24 px-3 py-2 bg-gray-700 text-white rounded-md border border-gray-600 focus:border-blue-500 focus:outline-none"
                            placeholder="0"
                            min="0"
                          />
                          <button
                            onClick={handleSaveCounter}
                            disabled={saving}
                            className="bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white px-3 py-2 rounded-md transition-colors"
                          >
                            <Save className="w-4 h-4" />
                          </button>
                          <button
                            onClick={handleCancelEdit}
                            className="bg-gray-600 hover:bg-gray-700 text-white px-3 py-2 rounded-md transition-colors"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => handleEditCounter('CO', customer.id)}
                          className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-md flex items-center gap-2 transition-colors"
                        >
                          <Edit2 className="w-4 h-4" />
                          Edit
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Settings; 