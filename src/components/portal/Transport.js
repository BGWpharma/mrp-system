import React, { useState, useEffect } from 'react';
import { Truck, Download, Eye, Calendar, MapPin, AlertCircle, Package, Search, Filter, Navigation, Clock } from 'lucide-react';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { db } from '../../firebase';

/**
 * Transport Component
 * 
 * Expected CMR structure in Firestore collection 'cmr' or 'transport':
 * {
 *   id: string,
 *   cmrNumber: string,
 *   customerId: string,
 *   customerName?: string,
 *   customer?: { name: string, address?: string },
 *   orderId?: string,
 *   orderNumber?: string,
 *   createdDate: Timestamp,
 *   pickupDate?: Timestamp,
 *   deliveryDate?: Timestamp,
 *   estimatedDelivery?: Timestamp,
 *   status: string ('Pending', 'In Transit', 'Delivered', 'Cancelled'),
 *   origin: { address: string, city?: string, country?: string },
 *   destination: { address: string, city?: string, country?: string },
 *   carrier?: { name: string, contact?: string, vehicleNumber?: string },
 *   driver?: { name: string, license?: string, phone?: string },
 *   goods: Array<{ description: string, quantity: number, weight?: number, unit?: string }>,
 *   totalWeight?: number,
 *   totalValue?: number,
 *   currency?: string,
 *   notes?: string,
 *   trackingNumber?: string,
 *   documents?: Array<{ name: string, url?: string, type?: string }>
 * }
 */
const Transport = ({ customerId, customerName }) => {
  const [transports, setTransports] = useState([]);
  const [filteredTransports, setFilteredTransports] = useState([]);
  const [selectedTransport, setSelectedTransport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('all');

  useEffect(() => {
    if (customerId) {
      fetchTransports();
    }
  }, [customerId]);

  useEffect(() => {
    filterTransports();
  }, [transports, searchTerm, statusFilter, dateFilter]);

  const fetchTransports = async () => {
    try {
      setLoading(true);
      setError(null);

      // Try both possible collection names for transport documents
      const collections = ['cmr', 'transport', 'shipments'];
      let fetchedTransports = [];

      for (const collectionName of collections) {
        try {
          const transportRef = collection(db, collectionName);
          const transportQuery = query(
            transportRef,
            where('customerId', '==', customerId),
            orderBy('createdDate', 'desc')
          );
          
          const transportSnapshot = await getDocs(transportQuery);
          
          if (!transportSnapshot.empty) {
            transportSnapshot.forEach((doc) => {
              const transportData = doc.data();
              fetchedTransports.push({
                id: doc.id,
                ...transportData,
                // Ensure status is calculated if not present
                status: transportData.status || calculateTransportStatus(transportData)
              });
            });
            
            console.log(`Found ${fetchedTransports.length} transport documents in collection: ${collectionName}`);
            break; // Found data, stop trying other collections
          }
        } catch (collectionError) {
          console.log(`Collection ${collectionName} not found or empty`);
        }
      }

      setTransports(fetchedTransports);
    } catch (error) {
      console.error('Error fetching transport documents:', error);
      setError('Failed to load transport documents');
    } finally {
      setLoading(false);
    }
  };

  const calculateTransportStatus = (transport) => {
    const now = new Date();
    
    if (transport.deliveryDate) {
      return 'Delivered';
    } else if (transport.pickupDate && !transport.deliveryDate) {
      return 'In Transit';
    } else if (transport.estimatedDelivery) {
      const estimatedDate = transport.estimatedDelivery?.toDate ? 
        transport.estimatedDelivery.toDate() : 
        new Date(transport.estimatedDelivery);
      
      if (now < estimatedDate) {
        return 'Pending';
      } else {
        return 'In Transit';
      }
    }
    
    return 'Pending';
  };

  const filterTransports = () => {
    let filtered = [...transports];

    // Search filter
    if (searchTerm) {
      filtered = filtered.filter(transport =>
        (transport.cmrNumber || transport.id || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (transport.orderNumber || transport.orderId || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (transport.customerName || transport.customer?.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (transport.trackingNumber || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (transport.carrier?.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (transport.driver?.name || '').toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(transport => 
        transport.status.toLowerCase() === statusFilter.toLowerCase()
      );
    }

    // Date filter
    if (dateFilter !== 'all') {
      const now = new Date();
      filtered = filtered.filter(transport => {
        const transportDate = transport.createdDate?.toDate ? 
          transport.createdDate.toDate() : 
          new Date(transport.createdDate);
        
        switch (dateFilter) {
          case 'week':
            return (now - transportDate) <= 7 * 24 * 60 * 60 * 1000;
          case 'month':
            return (now - transportDate) <= 30 * 24 * 60 * 60 * 1000;
          case 'quarter':
            return (now - transportDate) <= 90 * 24 * 60 * 60 * 1000;
          default:
            return true;
        }
      });
    }

    setFilteredTransports(filtered);
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

  const formatWeight = (weight, unit = 'kg') => {
    if (!weight && weight !== 0) return 'N/A';
    return `${weight} ${unit}`;
  };

  const getStatusColor = (status) => {
    switch(status?.toLowerCase()) {
      case 'delivered':
        return { color: '#22c55e', backgroundColor: 'rgba(34, 197, 94, 0.1)' };
      case 'in transit':
        return { color: '#3b82f6', backgroundColor: 'rgba(59, 130, 246, 0.1)' };
      case 'pending':
        return { color: '#f59e0b', backgroundColor: 'rgba(245, 158, 11, 0.1)' };
      case 'cancelled':
        return { color: '#ef4444', backgroundColor: 'rgba(239, 68, 68, 0.1)' };
      default:
        return { color: '#9ca3af', backgroundColor: 'rgba(156, 163, 175, 0.1)' };
    }
  };

  const getStatusIcon = (status) => {
    switch(status?.toLowerCase()) {
      case 'delivered':
        return <Package className="w-4 h-4" />;
      case 'in transit':
        return <Truck className="w-4 h-4" />;
      case 'pending':
        return <Clock className="w-4 h-4" />;
      case 'cancelled':
        return <AlertCircle className="w-4 h-4" />;
      default:
        return <Navigation className="w-4 h-4" />;
    }
  };

  const handleDownloadCMR = (transport) => {
    // Placeholder for CMR download functionality
    console.log('Downloading CMR:', transport.cmrNumber);
    alert(`Download functionality for CMR ${transport.cmrNumber || transport.id} will be implemented soon.`);
  };

  const formatAddress = (addressObj) => {
    if (typeof addressObj === 'string') return addressObj;
    if (!addressObj) return 'N/A';
    
    const parts = [
      addressObj.address,
      addressObj.city,
      addressObj.country
    ].filter(Boolean);
    
    return parts.join(', ') || 'N/A';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-400">Loading transport documents...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <div className="text-red-400 mb-4">⚠️ {error}</div>
        <button 
          onClick={fetchTransports}
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
          <h2 className="text-2xl font-bold text-white">Transport & CMR</h2>
          <p className="text-gray-400 mt-1">
            {filteredTransports.length} transport document{filteredTransports.length !== 1 ? 's' : ''} found for {customerName}
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
              placeholder="Search CMR, tracking, carrier..."
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
              <option value="pending">Pending</option>
              <option value="in transit">In Transit</option>
              <option value="delivered">Delivered</option>
              <option value="cancelled">Cancelled</option>
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

      {/* Transport List */}
      {filteredTransports.length === 0 ? (
        <div className="text-center py-12">
          <Truck className="w-12 h-12 text-gray-600 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-300 mb-2">No transport documents found</h3>
          <p className="text-gray-400">
            {transports.length === 0 
              ? "No CMR documents have been created for this customer yet." 
              : "Try adjusting your search criteria."}
          </p>
          {transports.length === 0 && (
            <p className="text-gray-500 text-sm mt-2">
              Transport documents will appear here once shipments are processed.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {filteredTransports.map(transport => (
            <div key={transport.id} className="bg-gray-800 rounded-xl shadow-lg overflow-hidden hover:shadow-xl transition-shadow">
              {/* Mobile layout */}
              <div className="block lg:hidden p-4 space-y-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-semibold text-white truncate">
                      CMR {transport.cmrNumber || transport.id}
                    </h3>
                    <div className="mt-1 space-y-1 text-sm text-gray-400">
                      <div className="flex items-center">
                        <Calendar className="w-4 h-4 mr-1 flex-shrink-0" />
                        <span className="truncate">Created: {formatDate(transport.createdDate)}</span>
                      </div>
                      {transport.estimatedDelivery && (
                        <div className="flex items-center">
                          <Clock className="w-4 h-4 mr-1 flex-shrink-0" />
                          <span className="truncate">ETA: {formatDate(transport.estimatedDelivery)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="ml-3 flex-shrink-0">
                    <span 
                      className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium"
                      style={getStatusColor(transport.status)}
                    >
                      {getStatusIcon(transport.status)}
                      <span className="ml-1 hidden sm:inline">{transport.status}</span>
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 text-sm">
                  {transport.orderNumber && (
                    <div>
                      <span className="text-gray-400">Order:</span>
                      <div className="text-white font-medium">
                        {transport.orderNumber}
                      </div>
                    </div>
                  )}
                  <div>
                    <span className="text-gray-400">Route:</span>
                    <div className="text-white text-sm">
                      <div>From: {formatAddress(transport.origin)}</div>
                      <div>To: {formatAddress(transport.destination)}</div>
                    </div>
                  </div>
                  {transport.carrier && (
                    <div>
                      <span className="text-gray-400">Carrier:</span>
                      <div className="text-white">{transport.carrier.name}</div>
                    </div>
                  )}
                </div>

                <div className="flex flex-col space-y-2">
                  <button
                    onClick={() => setSelectedTransport(selectedTransport === transport.id ? null : transport.id)}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors flex items-center justify-center"
                  >
                    <Eye className="w-4 h-4 mr-2" />
                    <span className="text-sm">
                      {selectedTransport === transport.id ? 'Hide Details' : 'View Details'}
                    </span>
                  </button>
                  <button 
                    onClick={() => handleDownloadCMR(transport)}
                    className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg transition-colors flex items-center justify-center"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    <span className="text-sm">Download CMR</span>
                  </button>
                </div>
              </div>

              {/* Desktop layout */}
              <div className="hidden lg:block p-6">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="text-lg font-semibold text-white">
                      CMR {transport.cmrNumber || transport.id}
                    </h3>
                    <div className="flex items-center space-x-4 mt-1 text-sm text-gray-400">
                      <div className="flex items-center">
                        <Calendar className="w-4 h-4 mr-1" />
                        Created: {formatDate(transport.createdDate)}
                      </div>
                      {transport.estimatedDelivery && (
                        <div className="flex items-center">
                          <Clock className="w-4 h-4 mr-1" />
                          ETA: {formatDate(transport.estimatedDelivery)}
                        </div>
                      )}
                      {transport.trackingNumber && (
                        <div className="flex items-center">
                          <Navigation className="w-4 h-4 mr-1" />
                          Tracking: {transport.trackingNumber}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center space-x-4">
                    <span 
                      className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium"
                      style={getStatusColor(transport.status)}
                    >
                      {getStatusIcon(transport.status)}
                      <span className="ml-1">{transport.status}</span>
                    </span>
                    <button
                      onClick={() => setSelectedTransport(selectedTransport === transport.id ? null : transport.id)}
                      className="text-blue-400 hover:text-blue-300 flex items-center"
                    >
                      <Eye className="w-4 h-4 mr-1" />
                      {selectedTransport === transport.id ? 'Hide' : 'View'} Details
                    </button>
                  </div>
                </div>

                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-sm text-gray-400">
                      From: {formatAddress(transport.origin)}
                    </p>
                    <p className="text-sm text-gray-400">
                      To: {formatAddress(transport.destination)}
                    </p>
                    {transport.orderNumber && (
                      <p className="text-sm text-gray-400">
                        Order: {transport.orderNumber}
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    {transport.carrier && (
                      <p className="text-lg font-bold text-white">
                        {transport.carrier.name}
                      </p>
                    )}
                    <button 
                      onClick={() => handleDownloadCMR(transport)}
                      className="text-sm text-green-400 hover:text-green-300 flex items-center"
                    >
                      <Download className="w-4 h-4 mr-1" />
                      Download CMR
                    </button>
                  </div>
                </div>
              </div>

              {/* Transport Details */}
              {selectedTransport === transport.id && (
                <div className="mt-6 pt-6 px-4 lg:px-6 border-t border-gray-600">
                  <h4 className="font-medium text-white mb-3">Transport Details</h4>
                  
                  {/* Transport Info Grid */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                    <div>
                      <h5 className="font-medium text-white mb-2">Route Information</h5>
                      <div className="space-y-2 text-sm text-gray-400">
                        <div>
                          <strong>Origin:</strong>
                          <div className="ml-4">{formatAddress(transport.origin)}</div>
                        </div>
                        <div>
                          <strong>Destination:</strong>
                          <div className="ml-4">{formatAddress(transport.destination)}</div>
                        </div>
                        {transport.pickupDate && (
                          <p><strong>Pickup Date:</strong> {formatDate(transport.pickupDate)}</p>
                        )}
                        {transport.deliveryDate && (
                          <p><strong>Delivery Date:</strong> {formatDate(transport.deliveryDate)}</p>
                        )}
                        {transport.estimatedDelivery && (
                          <p><strong>Estimated Delivery:</strong> {formatDate(transport.estimatedDelivery)}</p>
                        )}
                      </div>
                    </div>
                    
                    <div>
                      <h5 className="font-medium text-white mb-2">Carrier & Driver</h5>
                      <div className="space-y-1 text-sm text-gray-400">
                        {transport.carrier && (
                          <>
                            <p><strong>Carrier:</strong> {transport.carrier.name}</p>
                            {transport.carrier.contact && (
                              <p><strong>Contact:</strong> {transport.carrier.contact}</p>
                            )}
                            {transport.carrier.vehicleNumber && (
                              <p><strong>Vehicle:</strong> {transport.carrier.vehicleNumber}</p>
                            )}
                          </>
                        )}
                        {transport.driver && (
                          <>
                            <p><strong>Driver:</strong> {transport.driver.name}</p>
                            {transport.driver.phone && (
                              <p><strong>Phone:</strong> {transport.driver.phone}</p>
                            )}
                            {transport.driver.license && (
                              <p><strong>License:</strong> {transport.driver.license}</p>
                            )}
                          </>
                        )}
                        {transport.trackingNumber && (
                          <p><strong>Tracking Number:</strong> {transport.trackingNumber}</p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Goods */}
                  {transport.goods && transport.goods.length > 0 && (
                    <div className="mb-6">
                      <h5 className="font-medium text-white mb-2">Goods</h5>
                      <div className="space-y-2">
                        {transport.goods.map((item, index) => (
                          <div key={index} className="flex justify-between items-center py-2 border-b border-gray-700 last:border-b-0">
                            <div className="flex-1">
                              <p className="font-medium text-white">{item.description}</p>
                              {item.weight && (
                                <p className="text-sm text-gray-400">Weight: {formatWeight(item.weight, item.unit)}</p>
                              )}
                            </div>
                            <div className="text-right ml-4">
                              <p className="font-medium text-white">
                                Qty: {item.quantity}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                      {transport.totalWeight && (
                        <div className="mt-2 pt-2 border-t border-gray-700">
                          <p className="text-sm text-gray-400">
                            <strong>Total Weight:</strong> {formatWeight(transport.totalWeight)}
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Additional Info */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-sm">
                    <div>
                      <h5 className="font-medium text-white mb-2">Document Information</h5>
                      <div className="space-y-1 text-gray-400">
                        <p><strong>CMR Number:</strong> {transport.cmrNumber || transport.id}</p>
                        <p><strong>Created:</strong> {formatDate(transport.createdDate)}</p>
                        {transport.orderNumber && (
                          <p><strong>Related Order:</strong> {transport.orderNumber}</p>
                        )}
                        <p><strong>Status:</strong> <span style={getStatusColor(transport.status)}>{transport.status}</span></p>
                      </div>
                    </div>
                    
                    {(transport.totalValue || transport.notes) && (
                      <div>
                        <h5 className="font-medium text-white mb-2">Additional Information</h5>
                        <div className="space-y-1 text-gray-400">
                          {transport.totalValue && (
                            <p><strong>Total Value:</strong> {transport.totalValue} {transport.currency || 'EUR'}</p>
                          )}
                          {transport.notes && (
                            <p><strong>Notes:</strong> {transport.notes}</p>
                          )}
                        </div>
                      </div>
                    )}
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

export default Transport;