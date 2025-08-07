import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { seedDatabase } from './services/seedData';
import { seedOrderDatabase } from './services/seedOrderData';
import productsRouter from './routes/products';
import ordersRouter from './routes/orders';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:3002'],
  credentials: true
}));
app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Backend API is running',
    timestamp: new Date().toISOString()
  });
});

app.use('/api/products', productsRouter);
app.use('/api/orders', ordersRouter);

const startServer = async () => {
  try {
    await seedDatabase();
    await seedOrderDatabase();
    
    app.listen(PORT, () => {
      console.log(`Backend server running on http://localhost:${PORT}`);
      console.log(`Health check: http://localhost:${PORT}/api/health`);
      console.log(`Products API: http://localhost:${PORT}/api/products`);
      console.log(`Orders API: http://localhost:${PORT}/api/orders`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();