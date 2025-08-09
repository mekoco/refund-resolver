import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { seedOrderDatabase } from './services/seedOrderData';
import ordersRouter from './routes/orders';
import refundsRouter from './routes/refunds';
import returnsRouter from './routes/returns';
import reconciliationRouter from './routes/reconciliation';
import skusRouter from './routes/skus';
import staffRouter from './routes/staff';
import reportsRouter from './routes/reports';

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

app.use('/api/orders', ordersRouter);
app.use('/api/refunds', refundsRouter);
app.use('/api/returns', returnsRouter);
app.use('/api/reconciliation', reconciliationRouter);
app.use('/api/skus', skusRouter);
app.use('/api/staff', staffRouter);
app.use('/api/reports', reportsRouter);

const startServer = async () => {
  try {
    await seedOrderDatabase();
    
    app.listen(PORT, () => {
      console.log(`Backend server running on http://localhost:${PORT}`);
      console.log(`Health check: http://localhost:${PORT}/api/health`);
      console.log(`Orders API: http://localhost:${PORT}/api/orders`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();