import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import { Eye, X, Package, DollarSign } from 'lucide-react';

const PriceLists = () => {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedPriceList, setSelectedPriceList] = useState(null);
  const [priceListItems, setPriceListItems] = useState([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [showDialog, setShowDialog] = useState(false);

  useEffect(() => {
    const fetchProducts = async () => {
      try {
        setLoading(true);
        // Try different possible collection names for price lists
        const collections = ['priceLists', 'price-lists', 'products', 'inventory'];
        let productsData = [];
        
        for (const collectionName of collections) {
          try {
            const productsRef = collection(db, collectionName);
            const q = query(productsRef, orderBy('name', 'asc'));
            const querySnapshot = await getDocs(q);
            
            if (!querySnapshot.empty) {
              querySnapshot.forEach((doc) => {
                productsData.push({
                  id: doc.id,
                  ...doc.data()
                });
              });
              break; // Found data, stop trying other collections
            }
          } catch (collectionError) {
            console.log(`Collection ${collectionName} not found or empty`);
          }
        }
        
        setProducts(productsData);
        setError(null);
      } catch (error) {
        console.error('Error fetching products:', error);
        setError('Failed to load price lists');
      } finally {
        setLoading(false);
      }
    };

    fetchProducts();
  }, []);

  const fetchPriceListItems = async (priceListId) => {
    try {
      setLoadingItems(true);
      console.log('Fetching items for price list ID:', priceListId);
      
      // Try multiple collection names for price list items
      const possibleCollections = ['priceListItems', 'price-list-items', 'items', 'products'];
      let items = [];
      
      for (const collectionName of possibleCollections) {
        try {
          console.log(`Trying collection: ${collectionName}`);
          const itemsRef = collection(db, collectionName);
          const querySnapshot = await getDocs(itemsRef);
          
          console.log(`Found ${querySnapshot.size} documents in ${collectionName}`);
          
          querySnapshot.forEach((doc) => {
            const data = doc.data();
            console.log('Document data:', data);
            
            // Try multiple possible field names for price list association
            const possibleFields = ['priceListId', 'priceList', 'listId', 'parentId'];
            const isMatching = possibleFields.some(field => 
              data[field] === priceListId || 
              data[field]?.id === priceListId ||
              data[field] === priceListId.toString()
            );
            
            if (isMatching) {
              console.log('Found matching item:', data);
              items.push({
                id: doc.id,
                ...data
              });
            }
          });
          
          // If we found items, break
          if (items.length > 0) {
            console.log(`Found ${items.length} items in collection ${collectionName}`);
            break;
          }
          
        } catch (collectionError) {
          console.log(`Collection ${collectionName} not found or empty:`, collectionError);
        }
      }
      
      // If no items found with price list association, show all items from the first available collection
      if (items.length === 0) {
        console.log('No matching items found, showing all items from available collections');
        
        for (const collectionName of possibleCollections) {
          try {
            const itemsRef = collection(db, collectionName);
            const q = query(itemsRef, orderBy('name', 'asc'));
            const querySnapshot = await getDocs(q);
            
            if (!querySnapshot.empty) {
              console.log(`Showing all ${querySnapshot.size} items from ${collectionName} collection`);
              querySnapshot.forEach((doc) => {
                items.push({
                  id: doc.id,
                  ...doc.data()
                });
              });
              break;
            }
          } catch (error) {
            console.log(`Error accessing collection ${collectionName}:`, error);
          }
        }
      }
      
      console.log('Final items array:', items);
      setPriceListItems(items);
      
    } catch (error) {
      console.error('Error fetching price list items:', error);
      setPriceListItems([]);
    } finally {
      setLoadingItems(false);
    }
  };

  const handleViewPriceList = async (priceList) => {
    setSelectedPriceList(priceList);
    setShowDialog(true);
    await fetchPriceListItems(priceList.id);
  };

  const closeDialog = () => {
    setShowDialog(false);
    setSelectedPriceList(null);
    setPriceListItems([]);
  };

  const formatPrice = (price) => {
    if (!price && price !== 0) return 'N/A';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(price);
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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-400">Loading price lists...</p>
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
          <h2 className="text-2xl font-bold text-white">Price Lists</h2>
          <p className="text-gray-400 mt-1">
            {products.length} product{products.length !== 1 ? 's' : ''} found
          </p>
        </div>
      </div>

      {/* Products List */}
      {products.length === 0 ? (
        <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
          <div className="text-center py-20">
            <div className="mx-auto h-24 w-24 text-gray-400 mb-4 flex items-center justify-center">
              <DollarSign className="w-full h-full" />
            </div>
            <h3 className="text-lg font-medium text-gray-300 mb-2">No price lists found</h3>
            <p className="text-gray-400 max-w-sm mx-auto">
              No price lists are currently available. Products and price lists will appear here once they are added to the system.
            </p>
          </div>
        </div>
      ) : (
        <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden shadow-lg">
          {/* Mobile view - pokazuje karty na małych ekranach */}
          <div className="block md:hidden">
            <div className="p-4 space-y-4">
              {products.map((product) => (
                <div key={product.id} className="bg-gray-700 rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center flex-1 min-w-0">
                      <div className="h-10 w-10 flex-shrink-0">
                        <div className="h-10 w-10 rounded-lg bg-green-600 flex items-center justify-center">
                          {product.name ? (
                            <span className="text-sm font-medium text-white">
                              {product.name.charAt(0).toUpperCase()}
                            </span>
                          ) : (
                            <Package className="w-5 h-5 text-white" />
                          )}
                        </div>
                      </div>
                      <div className="ml-3 min-w-0 flex-1">
                        <div className="text-sm font-medium text-white truncate">
                          {product.name || 'Unnamed Product'}
                        </div>
                        <div className="text-xs text-gray-400 truncate">
                          {product.description || 'No description'}
                        </div>
                      </div>
                    </div>
                    <button 
                      onClick={() => handleViewPriceList(product)}
                      className="text-blue-400 hover:text-blue-300 p-2 rounded-lg hover:bg-gray-600 transition-colors flex-shrink-0"
                      title="View Price List Items"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                  </div>
                  
                  <div className="text-xs text-gray-400">
                    <span>Updated: {formatDate(product.updatedAt || product.createdAt)}</span>
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
                    Product
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    Updated
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-300 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-gray-800 divide-y divide-gray-700">
                {products.map((product) => (
                  <tr key={product.id} className="hover:bg-gray-700 transition-colors duration-200">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="h-10 w-10 flex-shrink-0">
                          <div className="h-10 w-10 rounded-lg bg-green-600 flex items-center justify-center">
                            {product.name ? (
                              <span className="text-sm font-medium text-white">
                                {product.name.charAt(0).toUpperCase()}
                              </span>
                            ) : (
                              <Package className="w-5 h-5 text-white" />
                            )}
                          </div>
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-white">
                            {product.name || 'Unnamed Product'}
                          </div>
                          <div className="text-sm text-gray-400">
                            {product.description || 'No description'}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">
                      {formatDate(product.updatedAt || product.createdAt)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex justify-end">
                        <button 
                          onClick={() => handleViewPriceList(product)}
                          className="text-blue-400 hover:text-blue-300 p-2 rounded-lg hover:bg-gray-700 transition-colors"
                          title="View Price List Items"
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

      {/* Price List Items Dialog */}
      {showDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-lg border border-gray-700 max-w-6xl w-full max-h-[90vh] overflow-hidden shadow-xl mx-4">
            {/* Dialog Header */}
            <div className="px-6 py-4 border-b border-gray-700 flex justify-between items-center">
              <div>
                <h3 className="text-xl font-semibold text-white">Price List Items</h3>
                <p className="text-gray-400 mt-1">
                  {selectedPriceList?.name || 'Unknown Price List'}
                </p>
              </div>
              <button
                onClick={closeDialog}
                className="text-gray-400 hover:text-white p-2 rounded-lg hover:bg-gray-700 transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Dialog Content */}
            <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
              {loadingItems ? (
                <div className="flex items-center justify-center py-12">
                  <div className="text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                    <p className="mt-4 text-gray-400">Loading items...</p>
                  </div>
                </div>
              ) : priceListItems.length === 0 ? (
                <div className="text-center py-12">
                  <div className="text-gray-400 text-lg">No items found</div>
                  <p className="text-gray-500 mt-2">
                    No items found for this price list. Check the console for debugging information.
                  </p>
                  <p className="text-gray-500 mt-1 text-sm">
                    Price List ID: <code className="bg-gray-700 px-2 py-1 rounded">{selectedPriceList?.id}</code>
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {priceListItems.map((item) => (
                      <div key={item.id} className="bg-gray-700 rounded-lg p-4 border border-gray-600 hover:bg-gray-600 transition-colors">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <h4 className="text-white font-medium text-sm">
                              {item.name || item.productName || 'Unnamed Item'}
                            </h4>
                            <p className="text-gray-400 text-xs mt-1">
                              {item.description || 'No description'}
                            </p>
                            
                            <div className="mt-3 space-y-2">
                              {item.sku && (
                                <div className="text-xs">
                                  <span className="text-gray-400">SKU:</span>
                                  <span className="text-gray-300 ml-1">{item.sku}</span>
                                </div>
                              )}
                              
                              {(item.price || item.unitPrice) && (
                                <div className="text-xs">
                                  <span className="text-gray-400">Price:</span>
                                  <span className="text-green-400 ml-1 font-medium">
                                    {formatPrice(item.price || item.unitPrice)}
                                  </span>
                                </div>
                              )}
                              
                              {item.category && (
                                <div className="text-xs">
                                  <span className="text-gray-400">Category:</span>
                                  <span className="text-blue-400 ml-1">{item.category}</span>
                                </div>
                              )}
                              
                              {(item.stock !== undefined || item.quantity !== undefined) && (
                                <div className="text-xs">
                                  <span className="text-gray-400">Stock:</span>
                                  <span className="text-gray-300 ml-1">
                                    {item.stock !== undefined ? item.stock : item.quantity} {item.unit || 'units'}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PriceLists; 