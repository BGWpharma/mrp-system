import React, { useState, useEffect } from 'react';
import { ShoppingCart, Minus, Plus, MapPin, Calendar, ChevronDown } from 'lucide-react';
import { db } from '../../firebase';
import { doc, getDoc } from 'firebase/firestore';
import { createCustomerOrder, calculateCartTotal } from '../../services/orderService';

const ShoppingCartComponent = ({ cart, onUpdateQuantity, onClearCart, onSwitchToProducts, customerId }) => {
  const cartTotal = calculateCartTotal(cart);
  const [shippingAddress, setShippingAddress] = useState('');
  const [expectedDate, setExpectedDate] = useState('');
  const [customerAddresses, setCustomerAddresses] = useState([]);
  const [showAddressDropdown, setShowAddressDropdown] = useState(false);
  const [customAddressMode, setCustomAddressMode] = useState(false);

  // Pobieranie adresów klienta
  useEffect(() => {
    const fetchCustomerAddresses = async () => {
      if (!customerId) return;
      
      try {
        const customerDoc = await getDoc(doc(db, 'customers', customerId));
        if (customerDoc.exists()) {
          const customerData = customerDoc.data();
          const addresses = [];
          
          // Adres rozliczeniowy
          if (customerData.billingAddress || customerData.address) {
            const billingAddr = customerData.billingAddress || customerData.address;
            const fullBillingAddress = [
              billingAddr,
              customerData.city,
              customerData.postalCode || customerData.zipCode,
              customerData.country
            ].filter(Boolean).join(', ');
            
            addresses.push({
              type: 'Billing Address',
              address: fullBillingAddress,
              raw: billingAddr
            });
          }
          
          // Adres dostawy (jeśli różni się od rozliczeniowego)
          if (customerData.shippingAddress && customerData.shippingAddress !== customerData.billingAddress) {
            const fullShippingAddress = [
              customerData.shippingAddress,
              customerData.shippingCity || customerData.city,
              customerData.shippingPostalCode || customerData.postalCode,
              customerData.shippingCountry || customerData.country
            ].filter(Boolean).join(', ');
            
            addresses.push({
              type: 'Shipping Address',
              address: fullShippingAddress,
              raw: customerData.shippingAddress
            });
          }
          
          setCustomerAddresses(addresses);
        }
      } catch (error) {
        console.error('Błąd podczas pobierania adresów klienta:', error);
      }
    };
    
    fetchCustomerAddresses();
  }, [customerId]);

  // Zamknij dropdown po kliknięciu poza nim
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (showAddressDropdown && !event.target.closest('.address-dropdown')) {
        setShowAddressDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showAddressDropdown]);

  const handleAddressSelect = (address) => {
    setShippingAddress(address.address);
    setShowAddressDropdown(false);
    setCustomAddressMode(false);
  };

  const handleCustomAddress = () => {
    setCustomAddressMode(true);
    setShowAddressDropdown(false);
    setShippingAddress('');
  };

  if (cart.length === 0) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold text-white">Shopping Cart</h2>
        <div className="text-center py-12">
          <ShoppingCart className="w-12 h-12 text-gray-600 mx-auto mb-4" />
          <p className="text-gray-400">Your cart is empty</p>
          <button
            onClick={onSwitchToProducts}
            className="mt-4 bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors"
          >
            Browse Products
          </button>
        </div>
      </div>
    );
  }

  const handleCreateOrder = async () => {
    if (!shippingAddress.trim()) {
      alert('Please enter a shipping address');
      return;
    }
    if (!expectedDate) {
      alert('Please select an expected delivery date');
      return;
    }

    try {
      // Pobierz dane klienta
      const customerDoc = await getDoc(doc(db, 'customers', customerId));
      if (!customerDoc.exists()) {
        alert('Customer data not found');
        return;
      }

      const customerData = customerDoc.data();
      
      console.log('Expected date:', expectedDate);
      console.log('Customer ID:', customerId);
      console.log('Customer data:', customerData);
      console.log('Cart contents:', cart);
      console.log('Cart total:', cartTotal);
      
      // Przygotuj dane zamówienia w formacie MRP
      const orderData = {
        customer: {
          id: customerId,
          name: customerData.name || customerData.companyName,
          email: customerData.email,
          phone: customerData.phone,
          address: customerData.billingAddress || customerData.address,
          shippingAddress: shippingAddress,
          orderAffix: customerData.orderAffix || ''
        },
        items: cart.map(item => ({
          id: item.productId,
          name: item.name,
          quantity: item.quantity,
          unit: item.unit || 'szt.',
          price: item.price,
          priceListId: item.id,
          productId: item.productId,
          isRecipe: item.isRecipe || false,
          fromPriceList: true,
          margin: 0,
          basePrice: item.price,
          itemType: item.isRecipe ? 'recipe' : 'product',
          recipeId: item.isRecipe ? item.productId : null
        })),
        orderDate: new Date(),
        expectedDeliveryDate: new Date(expectedDate),
        status: 'Pending',
        paymentMethod: 'Bank Transfer',
        paymentStatus: 'Unpaid',
        notes: `Order from customer portal`,
        shippingMethod: 'Standard delivery',
        shippingCost: 0,
        totalValue: cartTotal,
        additionalCostsItems: [],
        productionTasks: []
      };

      // Użyj serwisu do utworzenia zamówienia
      const result = await createCustomerOrder(orderData, customerId);
      
      console.log('Order created successfully:', result);
      console.log('Order data saved to database:', {
        orderNumber: result.orderNumber,
        expectedDeliveryDate: result.expectedDeliveryDate,
        orderDate: result.orderDate,
        customer: result.customer,
        items: result.items,
        totalValue: result.totalValue
      });
      
      alert(`Zamówienie utworzone pomyślnie! Numer: ${result.orderNumber}`);
      
      // Wyczyść koszyk i formularz
      onClearCart();
      setShippingAddress('');
      setExpectedDate('');
      
    } catch (error) {
      console.error('Error creating order:', error);
      alert(`Błąd podczas tworzenia zamówienia: ${error.message}`);
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-white">Shopping Cart</h2>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
        {/* Cart Items - Left Side */}
        <div className="lg:col-span-2">
          <div className="bg-gray-800 rounded-xl shadow-lg">
            <div className="p-6">
              <h3 className="text-xl font-semibold text-white mb-4">Cart Items</h3>
              <div className="space-y-4">
                {cart.map(item => (
                  <div key={item.id} className="border-b border-gray-600 last:border-b-0 pb-4 last:pb-0">
                    {/* Mobile layout */}
                    <div className="block sm:hidden space-y-3">
                      <div className="flex justify-between items-start">
                        <div className="flex-1 min-w-0">
                          <h4 className="font-medium text-white truncate">{item.name}</h4>
                          <p className="text-xs text-gray-400">SKU: {item.sku}</p>
                          <p className="text-xs text-gray-400">${item.price.toFixed(2)} each</p>
                        </div>
                        <div className="text-right ml-3 flex-shrink-0">
                          <p className="font-medium text-white">
                            ${(item.price * item.quantity).toFixed(2)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center justify-center space-x-3">
                        <button
                          onClick={() => onUpdateQuantity(item.id, item.quantity - 1)}
                          className="p-1 rounded-full hover:bg-gray-700 text-white"
                        >
                          <Minus className="w-4 h-4" />
                        </button>
                        <span className="w-8 text-center text-white font-medium">{item.quantity}</span>
                        <button
                          onClick={() => onUpdateQuantity(item.id, item.quantity + 1)}
                          className="p-1 rounded-full hover:bg-gray-700 text-white"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Desktop layout */}
                    <div className="hidden sm:flex justify-between items-center py-4">
                      <div className="flex-1">
                        <h4 className="font-medium text-white">{item.name}</h4>
                        <p className="text-sm text-gray-400">SKU: {item.sku}</p>
                        <p className="text-sm text-gray-400">${item.price.toFixed(2)} each</p>
                      </div>
                      
                      <div className="flex items-center space-x-3">
                        <button
                          onClick={() => onUpdateQuantity(item.id, item.quantity - 1)}
                          className="p-1 rounded-full hover:bg-gray-700 text-white"
                        >
                          <Minus className="w-4 h-4" />
                        </button>
                        <span className="w-8 text-center text-white">{item.quantity}</span>
                        <button
                          onClick={() => onUpdateQuantity(item.id, item.quantity + 1)}
                          className="p-1 rounded-full hover:bg-gray-700 text-white"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                      
                      <div className="text-right ml-4">
                        <p className="font-medium text-white">
                          ${(item.price * item.quantity).toFixed(2)}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Order Details - Right Side */}
        <div className="lg:col-span-1">
          <div className="bg-gray-800 rounded-xl shadow-lg">
            <div className="p-6">
              <h3 className="text-xl font-semibold text-white mb-4">Order Details</h3>
              
              {/* Shipping Address */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  <MapPin className="w-4 h-4 inline mr-2" />
                  Shipping Address
                </label>
                
                {/* Address Selection Dropdown */}
                {customerAddresses.length > 0 && !customAddressMode && (
                  <div className="relative mb-2 address-dropdown">
                    <button
                      type="button"
                      onClick={() => setShowAddressDropdown(!showAddressDropdown)}
                      className="w-full flex items-center justify-between px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white hover:bg-gray-600 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <span className="text-sm">
                        {shippingAddress ? 'Selected Address' : 'Choose from saved addresses'}
                      </span>
                      <ChevronDown className={`w-4 h-4 transition-transform ${showAddressDropdown ? 'rotate-180' : ''}`} />
                    </button>
                    
                    {showAddressDropdown && (
                      <div className="absolute z-10 w-full mt-1 bg-gray-700 border border-gray-600 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                        {customerAddresses.map((addr, index) => (
                          <button
                            key={index}
                            type="button"
                            onClick={() => handleAddressSelect(addr)}
                            className="w-full text-left px-3 py-2 hover:bg-gray-600 text-white border-b border-gray-600 last:border-b-0"
                          >
                            <div className="text-sm font-medium text-blue-300">{addr.type}</div>
                            <div className="text-sm text-gray-300 truncate">{addr.address}</div>
                          </button>
                        ))}
                        <button
                          type="button"
                          onClick={handleCustomAddress}
                          className="w-full text-left px-3 py-2 hover:bg-gray-600 text-white"
                        >
                          <div className="text-sm font-medium text-green-300">+ Enter custom address</div>
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Address Text Area */}
                {(customAddressMode || customerAddresses.length === 0) && (
                  <textarea
                    value={shippingAddress}
                    onChange={(e) => setShippingAddress(e.target.value)}
                    placeholder="Enter your shipping address..."
                    rows={3}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                  />
                )}

                {/* Show selected address when not in custom mode */}
                {!customAddressMode && shippingAddress && (
                  <div className="mt-2 p-3 bg-gray-600 rounded-lg">
                    <div className="text-sm text-gray-300">{shippingAddress}</div>
                    <button
                      type="button"
                      onClick={handleCustomAddress}
                      className="mt-2 text-xs text-blue-300 hover:text-blue-200"
                    >
                      Edit or enter custom address
                    </button>
                  </div>
                )}
              </div>

              {/* Expected Date */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  <Calendar className="w-4 h-4 inline mr-2" />
                  Expected Delivery Date
                </label>
                <input
                  type="date"
                  value={expectedDate}
                  onChange={(e) => setExpectedDate(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              {/* Order Summary */}
              <div className="border-t border-gray-600 pt-4 mb-6">
                <div className="flex justify-between items-center text-lg font-semibold">
                  <span className="text-white">Total:</span>
                  <span className="text-white">${cartTotal.toFixed(2)}</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="space-y-3">
                <button
                  onClick={handleCreateOrder}
                  disabled={cart.length === 0 || !shippingAddress.trim() || !expectedDate}
                  className="w-full bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors font-medium"
                >
                  Create Order
                </button>
                <button
                  onClick={onClearCart}
                  className="w-full bg-gray-700 text-gray-300 px-6 py-3 rounded-lg hover:bg-gray-600 transition-colors"
                >
                  Clear Cart
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ShoppingCartComponent; 