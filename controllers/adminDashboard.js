// Mock dashboard data
const dashboardData = {
  totalSales: 12345,
  totalOrders: 120,
  totalProducts: 58,
  totalCustomers: 34,
  salesGrowth: 12,
  orderGrowth: 8,
  recentOrders: [
    { id: 1, customer: "John Doe", amount: 250, status: "completed" },
    { id: 2, customer: "Jane Smith", amount: 120, status: "pending" },
    { id: 3, customer: "Alice Brown", amount: 90, status: "cancelled" },
  ],
  lowStockProducts: [
    { id: 1, name: "Product A", stock: 3, maxStock: 50 },
    { id: 2, name: "Product B", stock: 7, maxStock: 40 },
  ],
};

export const getDashboard = (req, res) => {
  res.json(dashboardData);
};
