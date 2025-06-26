import React, { useState, useEffect } from 'react';
import { Calendar, Eye, Download, CheckCircle, Truck, Clock, Package, AlertCircle } from 'lucide-react';
import { getCustomerOrders } from '../../services/orderService';

const OrderHistory = ({ customerId, customerName }) => {
  const [orders, setOrders] = useState([]);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (customerId) {
      fetchOrders();
    }
  }, [customerId]);

  const fetchOrders = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const ordersData = await getCustomerOrders(customerId);
      setOrders(ordersData);
    } catch (error) {
      console.error('Error fetching orders:', error);
      setError('Failed to load orders');
    } finally {
      setLoading(false);
    }
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
    if (!amount && amount !== 0) return 'N/A';
    return new Intl.NumberFormat('pl-PL', {
      style: 'currency',
      currency: 'EUR',
    }).format(amount);
  };

  const getStatusColor = (status) => {
    switch(status?.toLowerCase()) {
      case 'delivered':
      case 'zakończone':
        return { color: '#34d399', backgroundColor: 'rgba(52, 211, 153, 0.1)' };
      case 'shipped':
      case 'wysłane':
        return { color: '#60a5fa', backgroundColor: 'rgba(96, 165, 250, 0.1)' };
      case 'processing':
      case 'w realizacji':
        return { color: '#fbbf24', backgroundColor: 'rgba(251, 191, 36, 0.1)' };
      case 'new':
      case 'nowe':
        return { color: '#8b5cf6', backgroundColor: 'rgba(139, 92, 246, 0.1)' };
      case 'cancelled':
      case 'anulowane':
        return { color: '#ef4444', backgroundColor: 'rgba(239, 68, 68, 0.1)' };
      default: 
        return { color: '#9ca3af', backgroundColor: 'rgba(156, 163, 175, 0.1)' };
    }
  };

  const getStatusIcon = (status) => {
    switch(status?.toLowerCase()) {
      case 'delivered':
      case 'zakończone':
        return <CheckCircle className="w-4 h-4" />;
      case 'shipped':
      case 'wysłane':
        return <Truck className="w-4 h-4" />;
      case 'processing':
      case 'w realizacji':
        return <Clock className="w-4 h-4" />;
      case 'cancelled':
      case 'anulowane':
        return <AlertCircle className="w-4 h-4" />;
      default: 
        return <Package className="w-4 h-4" />;
    }
  };

  const getProductionStatusColor = (status) => {
    switch(status?.toLowerCase()) {
      case 'zakończone':
      case 'completed':
        return 'text-green-400';
      case 'w trakcie':
      case 'in progress':
        return 'text-yellow-400';
      case 'zaplanowane':
      case 'planned':
        return 'text-blue-400';
      default:
        return 'text-gray-400';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-400">Loading orders...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <div className="text-red-400 mb-4">⚠️ {error}</div>
        <button 
          onClick={fetchOrders}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-white">Order History</h2>
          <p className="text-gray-400 mt-1">
            {orders.length} order{orders.length !== 1 ? 's' : ''} found for {customerName}
          </p>
        </div>
      </div>
      
      {orders.length === 0 ? (
        <div className="text-center py-12">
          <Package className="w-12 h-12 text-gray-600 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-300 mb-2">No orders found</h3>
          <p className="text-gray-400">You haven't placed any orders yet.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {orders.map(order => (
            <div key={order.id} className="bg-gray-800 rounded-xl shadow-lg overflow-hidden hover:shadow-xl transition-shadow">
              {/* Mobile layout */}
              <div className="block lg:hidden p-4 space-y-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-semibold text-white truncate">
                      Order {order.orderNumber || order.id}
                    </h3>
                    <div className="mt-1 space-y-1 text-sm text-gray-400">
                      <div className="flex items-center">
                        <Calendar className="w-4 h-4 mr-1 flex-shrink-0" />
                        <span className="truncate">{formatDate(order.orderDate || order.createdAt)}</span>
                      </div>
                      {order.deadline && (
                        <div className="flex items-center">
                          <Clock className="w-4 h-4 mr-1 flex-shrink-0" />
                          <span className="truncate">Deadline: {formatDate(order.deadline)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="ml-3 flex-shrink-0">
                    <span 
                      className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium"
                      style={getStatusColor(order.status)}
                    >
                      {getStatusIcon(order.status)}
                      <span className="ml-1 hidden sm:inline">{order.status || 'Unknown'}</span>
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-400">Items:</span>
                    <div className="text-white font-medium">
                      {order.items?.length || 0} item{(order.items?.length || 0) !== 1 ? 's' : ''}
                    </div>
                  </div>
                  <div>
                    <span className="text-gray-400">Total:</span>
                    <div className="text-white font-medium">
                      {formatCurrency(order.totalValue || order.productsValue)}
                    </div>
                  </div>
                  {order.paymentStatus && (
                    <div className="col-span-2">
                      <span className="text-gray-400">Payment:</span>
                      <div className="text-white">{order.paymentStatus} {order.paymentMethod && `(${order.paymentMethod})`}</div>
                    </div>
                  )}
                  {order.shippingAddress && (
                    <div className="col-span-2">
                      <span className="text-gray-400">Shipping:</span>
                      <div className="text-white break-words">{order.shippingAddress}</div>
                    </div>
                  )}
                </div>

                <div className="flex flex-col space-y-2">
                  <button
                    onClick={() => setSelectedOrder(selectedOrder === order.id ? null : order.id)}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors flex items-center justify-center"
                  >
                    <Eye className="w-4 h-4 mr-2" />
                    <span className="text-sm">
                      {selectedOrder === order.id ? 'Hide Details' : 'View Details'}
                    </span>
                  </button>
                  <button className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg transition-colors flex items-center justify-center">
                    <Download className="w-4 h-4 mr-2" />
                    <span className="text-sm">Download Invoice</span>
                  </button>
                </div>
              </div>

              {/* Desktop layout */}
              <div className="hidden lg:block p-6">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="text-lg font-semibold text-white">
                      Order {order.orderNumber || order.id}
                    </h3>
                    <div className="flex items-center space-x-4 mt-1 text-sm text-gray-400">
                      <div className="flex items-center">
                        <Calendar className="w-4 h-4 mr-1" />
                        {formatDate(order.orderDate || order.createdAt)}
                      </div>
                      {order.deadline && (
                        <div className="flex items-center">
                          <Clock className="w-4 h-4 mr-1" />
                          Deadline: {formatDate(order.deadline)}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center space-x-4">
                    <span 
                      className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium"
                      style={getStatusColor(order.status)}
                    >
                      {getStatusIcon(order.status)}
                      <span className="ml-1">{order.status || 'Unknown'}</span>
                    </span>
                    <button
                      onClick={() => setSelectedOrder(selectedOrder === order.id ? null : order.id)}
                      className="text-blue-400 hover:text-blue-300 flex items-center"
                    >
                      <Eye className="w-4 h-4 mr-1" />
                      {selectedOrder === order.id ? 'Hide' : 'View'} Details
                    </button>
                  </div>
                </div>

                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-sm text-gray-400">
                      {order.items?.length || 0} item{(order.items?.length || 0) !== 1 ? 's' : ''}
                    </p>
                    {order.paymentStatus && (
                      <p className="text-sm text-gray-400">
                        Payment: {order.paymentStatus} {order.paymentMethod && `(${order.paymentMethod})`}
                      </p>
                    )}
                    {order.shippingAddress && (
                      <p className="text-sm text-gray-400 max-w-xs truncate">
                        Shipping: {order.shippingAddress}
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-white">
                      {formatCurrency(order.totalValue || order.productsValue)}
                    </p>
                    <button className="text-sm text-blue-400 hover:text-blue-300 flex items-center">
                      <Download className="w-4 h-4 mr-1" />
                      Download Invoice
                    </button>
                  </div>
                </div>
              </div>

              {selectedOrder === order.id && (
                <div className="mt-6 pt-6 border-t border-gray-600">
                  <h4 className="font-medium text-white mb-3">Order Items</h4>
                  
                  {/* Mobile items layout */}
                  <div className="block lg:hidden space-y-3">
                    {(order.items || []).map((item, index) => (
                      <div key={item.id || index} className="bg-gray-700 rounded-lg p-3 space-y-2">
                        <div className="flex justify-between items-start">
                          <p className="font-medium text-white flex-1 min-w-0 truncate">{item.name}</p>
                          <div className="text-right ml-3 flex-shrink-0">
                            <p className="font-medium text-white text-sm">
                              {item.quantity} × {formatCurrency(item.price)}
                            </p>
                            <p className="text-xs text-gray-400">
                              {formatCurrency(parseFloat(item.quantity) * parseFloat(item.price))}
                            </p>
                          </div>
                        </div>
                        <div className="text-xs text-gray-400 space-y-1">
                          {item.productionTaskNumber && (
                            <p>Production Task: {item.productionTaskNumber}</p>
                          )}
                          {item.productionStatus && (
                            <p className={getProductionStatusColor(item.productionStatus)}>
                              Production Status: {item.productionStatus}
                            </p>
                          )}
                          {item.unit && (
                            <p>Unit: {item.unit}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  
                  {/* Desktop items layout */}
                  <div className="hidden lg:block space-y-3">
                    {(order.items || []).map((item, index) => (
                      <div key={item.id || index} className="flex justify-between items-start py-3 border-b border-gray-700 last:border-b-0">
                        <div className="flex-1">
                          <p className="font-medium text-white">{item.name}</p>
                          <div className="text-sm text-gray-400 space-y-1">
                            {item.productionTaskNumber && (
                              <p>Production Task: {item.productionTaskNumber}</p>
                            )}
                            {item.productionStatus && (
                              <p className={getProductionStatusColor(item.productionStatus)}>
                                Production Status: {item.productionStatus}
                              </p>
                            )}
                            {item.unit && (
                              <p>Unit: {item.unit}</p>
                            )}
                          </div>
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
                  
                  {/* Order Summary */}
                  <div className="mt-6 pt-4 border-t border-gray-600">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-sm">
                      <div>
                        <h5 className="font-medium text-white mb-2">Order Information</h5>
                        <div className="space-y-1 text-gray-400">
                          {order.orderDate && (
                            <p><strong>Order Date:</strong> {formatDate(order.orderDate)}</p>
                          )}
                          {order.deadline && (
                            <p><strong>Deadline:</strong> {formatDate(order.deadline)}</p>
                          )}
                          {order.expectedDeliveryDate && (
                            <p><strong>Expected Delivery:</strong> {formatDate(order.expectedDeliveryDate)}</p>
                          )}
                          {order.deliveryDate && (
                            <p><strong>Actual Delivery:</strong> {formatDate(order.deliveryDate)}</p>
                          )}
                        </div>
                      </div>
                      <div>
                        <h5 className="font-medium text-white mb-2">Customer Information</h5>
                        <div className="space-y-1 text-gray-400">
                          <p><strong>Customer:</strong> {order.customer?.name}</p>
                          {order.customer?.email && (
                            <p><strong>Email:</strong> {order.customer.email}</p>
                          )}
                          {order.shippingAddress && (
                            <p><strong>Shipping Address:</strong><br/><span className="break-words">{order.shippingAddress}</span></p>
                          )}
                        </div>
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

export default OrderHistory; 