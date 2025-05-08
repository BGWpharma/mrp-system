import React, { useCallback, useEffect, useState } from 'react';

// Zmodyfikowana funkcja ładująca wszystkie dane jednocześnie
const fetchDashboardData = useCallback(async () => {
  try {
    setIsLoading(true);
    
    // Uruchom wszystkie zapytania równolegle
    const [recipesResult, ordersStatsResult, analyticsResult] = await Promise.all([
      fetchRecipes(),
      fetchOrderStats(),
      fetchAnalytics()
    ]);
    
    console.log('Wszystkie dane zostały pobrane równolegle');
    setIsLoading(false);
  } catch (error) {
    console.error('Błąd podczas pobierania danych dashboardu:', error);
    setIsLoading(false);
  }
}, [fetchRecipes, fetchOrderStats, fetchAnalytics]);

// Wywołaj funkcję fetchDashboardData zamiast każdej funkcji pobierającej oddzielnie
useEffect(() => {
  fetchDashboardData();
}, [fetchDashboardData]);

// Nie potrzebujemy już tych oddzielnych wywołań, ponieważ używamy Promise.all
// useEffect(() => {
//   fetchRecipes();
// }, [fetchRecipes]);
// 
// useEffect(() => {
//   fetchOrderStats();
// }, [fetchOrderStats]);
// 
// useEffect(() => {
//   fetchAnalytics();
// }, [fetchAnalytics]);

const Dashboard = () => {
  const [isLoading, setIsLoading] = useState(true);

  return (
    <div>
      {/* Render your component content here */}
    </div>
  );
};

export default Dashboard; 