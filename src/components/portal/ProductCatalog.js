import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../firebase';
import { Search, Filter, ShoppingCart, Package, AlertCircle, Plus, Minus, Check, X } from 'lucide-react';

const ProductCatalog = ({ onAddToCart, assignedPriceLists = [] }) => {
  const [products, setProducts] = useState([]);
  const [filteredProducts, setFilteredProducts] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [quantityInputs, setQuantityInputs] = useState({}); // Stores product IDs that have quantity input open
  const [quantities, setQuantities] = useState({}); // Stores quantities for each product

  useEffect(() => {
    if (assignedPriceLists.length > 0) {
      fetchProducts();
    } else {
      setLoading(false);
    }
  }, [assignedPriceLists]);

  useEffect(() => {
    filterProducts();
  }, [products, searchTerm, selectedCategory]);

  const fetchProducts = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const allProducts = [];
      
      // Fetch products from priceListItems collection for each assigned price list
      for (const priceListId of assignedPriceLists) {
        try {
          const priceListItemsRef = collection(db, 'priceListItems');
          const q = query(priceListItemsRef, where('priceListId', '==', priceListId));
          const querySnapshot = await getDocs(q);
          
          querySnapshot.forEach((doc) => {
            const productData = {
              id: doc.id,
              ...doc.data(),
              priceListId: priceListId
            };
            allProducts.push(productData);
          });
        } catch (error) {
          console.error(`Error fetching products for price list ${priceListId}:`, error);
        }
      }
      
      setProducts(allProducts);
    } catch (error) {
      console.error('Error fetching products:', error);
      setError('Failed to load products');
    } finally {
      setLoading(false);
    }
  };

  const filterProducts = () => {
    let filtered = products;

    if (searchTerm) {
      filtered = filtered.filter(product =>
        product.productName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        product.notes?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        product.category?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (selectedCategory !== 'All') {
      filtered = filtered.filter(product => product.category === selectedCategory);
    }

    setFilteredProducts(filtered);
  };

  const formatPrice = (price) => {
    if (!price && price !== 0) return 'N/A';
    return new Intl.NumberFormat('pl-PL', {
      style: 'currency',
      currency: 'EUR',
    }).format(price);
  };

  const getCategories = () => {
    const categories = [...new Set(products.map(product => product.category).filter(Boolean))];
    return ['All', ...categories.sort()];
  };

  const getStockStatus = (stock) => {
    if (!stock && stock !== 0) return { text: 'Unknown', color: 'text-gray-400' };
    if (stock === 0) return { text: 'Out of Stock', color: 'text-red-400' };
    if (stock < 10) return { text: 'Low Stock', color: 'text-yellow-400' };
    return { text: 'In Stock', color: 'text-green-400' };
  };

  const handleAddToCartClick = (product) => {
    const productKey = `${product.priceListId}-${product.id}`;
    setQuantityInputs(prev => ({ ...prev, [productKey]: true }));
    setQuantities(prev => ({ ...prev, [productKey]: 1 }));
  };

  const handleQuantityChange = (productKey, change) => {
    setQuantities(prev => {
      const currentQuantity = prev[productKey] || 1;
      const newQuantity = Math.max(1, currentQuantity + change);
      return { ...prev, [productKey]: newQuantity };
    });
  };

  const handleQuantityInputChange = (productKey, value) => {
    const quantity = Math.max(1, parseInt(value) || 1);
    setQuantities(prev => ({ ...prev, [productKey]: quantity }));
  };

  const handleConfirmAddToCart = (product) => {
    const productKey = `${product.priceListId}-${product.id}`;
    const quantity = quantities[productKey] || 1;
    
    // Call onAddToCart for each quantity
    for (let i = 0; i < quantity; i++) {
      onAddToCart({
        id: product.id,
        name: product.productName,
        price: product.price,
        unit: product.unit,
        priceListId: product.priceListId,
        productId: product.productId,
        isRecipe: product.isRecipe
      });
    }

    // Reset state
    setQuantityInputs(prev => ({ ...prev, [productKey]: false }));
    setQuantities(prev => ({ ...prev, [productKey]: 1 }));
  };

  const handleCancelAddToCart = (productKey) => {
    setQuantityInputs(prev => ({ ...prev, [productKey]: false }));
    setQuantities(prev => ({ ...prev, [productKey]: 1 }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-400">Loading products...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <div className="text-red-400 mb-4">⚠️ {error}</div>
        <button 
          onClick={fetchProducts}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md"
        >
          Retry
        </button>
      </div>
    );
  }

  if (assignedPriceLists.length === 0) {
    return (
      <div className="text-center py-12">
        <Package className="w-12 h-12 text-gray-600 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-300 mb-2">No Products Assigned</h3>
        <p className="text-gray-400">No price lists have been assigned to this portal.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-white">Product Catalog</h2>
          <p className="text-gray-400 mt-1">
            {filteredProducts.length} of {products.length} products available
          </p>
        </div>
      </div>

      {/* Search and Filter Bar */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search products..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        
        <div className="relative">
          <Filter className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="pl-10 pr-8 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            {getCategories().map(category => (
              <option key={category} value={category}>{category}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Products Grid */}
      {filteredProducts.length === 0 ? (
        <div className="text-center py-12">
          <Package className="w-12 h-12 text-gray-600 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-300 mb-2">No products found</h3>
          <p className="text-gray-400">
            {searchTerm || selectedCategory !== 'All' 
              ? 'Try adjusting your search or filter criteria.'
              : 'No products are currently available in the assigned price lists.'
            }
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 lg:gap-6">
          {filteredProducts.map(product => {
            const stockStatus = getStockStatus(product.stock);
            const productKey = `${product.priceListId}-${product.id}`;
            const isQuantityInputOpen = quantityInputs[productKey];
            const currentQuantity = quantities[productKey] || 1;
            
            return (
              <div key={productKey} className="bg-gray-800 rounded-xl shadow-lg p-4 lg:p-6 hover:shadow-xl transition-shadow h-80 lg:h-80 flex flex-col">
                {/* Header Section - Fixed Height */}
                <div className="h-16 flex justify-between items-start mb-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-base lg:text-lg font-semibold text-white mb-1 line-clamp-1 leading-tight">
                      {product.productName || 'Unnamed Product'}
                    </h3>
                    <div className="h-6 flex items-center">
                      {product.category && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-700 text-gray-300 truncate max-w-full">
                          {product.category}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex-shrink-0 ml-2">
                    {product.isRecipe && (
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-600 text-green-100">
                        Recipe
                      </span>
                    )}
                  </div>
                </div>

                {/* Description Section - Fixed Height */}
                <div className="h-12 mb-3">
                  {product.notes && (
                    <p className="text-gray-400 text-sm line-clamp-2 leading-relaxed">
                      {product.notes}
                    </p>
                  )}
                </div>

                {/* Price Section - Fixed Height */}
                <div className="h-16 space-y-2 mb-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-400">Price:</span>
                    <span className="text-lg font-bold text-white">
                      {formatPrice(product.price)}
                    </span>
                  </div>
                  
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-400">Unit:</span>
                    <span className="text-sm text-gray-300">{product.unit || 'N/A'}</span>
                  </div>
                </div>

                {/* Add to Cart Section - Fixed Height Container */}
                <div className="flex-1 flex flex-col justify-end">
                  {!isQuantityInputOpen ? (
                    <button
                      onClick={() => handleAddToCartClick(product)}
                      className="w-full flex items-center justify-center px-4 py-2 rounded-lg font-medium transition-all bg-blue-600 hover:bg-blue-700 text-white"
                    >
                      <ShoppingCart className="w-4 h-4 mr-2" />
                      Add to Cart
                    </button>
                  ) : (
                    <div className="space-y-2">
                      {/* Quantity Input Section */}
                      <div className="flex items-center justify-center space-x-2">
                        <button
                          onClick={() => handleQuantityChange(productKey, -1)}
                          className="w-7 h-7 flex items-center justify-center bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors"
                          disabled={currentQuantity <= 1}
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        
                        <input
                          type="number"
                          min="1"
                          value={currentQuantity}
                          onChange={(e) => handleQuantityInputChange(productKey, e.target.value)}
                          className="w-12 h-7 text-center bg-gray-700 border border-gray-600 rounded text-white text-sm focus:ring-1 focus:ring-blue-500 focus:border-transparent"
                        />
                        
                        <button
                          onClick={() => handleQuantityChange(productKey, 1)}
                          className="w-7 h-7 flex items-center justify-center bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                      
                      {/* Action Buttons */}
                      <div className="flex space-x-2">
                        <button
                          onClick={() => handleCancelAddToCart(productKey)}
                          className="flex-1 flex items-center justify-center px-2 py-1 bg-gray-600 hover:bg-gray-500 text-white rounded text-sm transition-colors"
                        >
                          <X className="w-3 h-3 mr-1" />
                          Cancel
                        </button>
                        
                        <button
                          onClick={() => handleConfirmAddToCart(product)}
                          className="flex-1 flex items-center justify-center px-2 py-1 bg-green-600 hover:bg-green-700 text-white rounded text-sm transition-colors"
                        >
                          <Check className="w-3 h-3 mr-1" />
                          Add ({currentQuantity})
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ProductCatalog; 