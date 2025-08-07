import { db } from '../config/firebase';
import { Product } from '@packages/shared';

const dummyProducts: Product[] = [
  {
    name: 'Laptop Pro 15',
    price: 1299.99,
    description: 'High-performance laptop with 16GB RAM and 512GB SSD',
    category: 'Electronics',
    inStock: true,
    createdAt: new Date(),
  },
  {
    name: 'Wireless Mouse',
    price: 29.99,
    description: 'Ergonomic wireless mouse with long battery life',
    category: 'Accessories',
    inStock: true,
    createdAt: new Date(),
  },
  {
    name: 'Mechanical Keyboard',
    price: 89.99,
    description: 'RGB backlit mechanical keyboard with Cherry MX switches',
    category: 'Accessories',
    inStock: false,
    createdAt: new Date(),
  },
  {
    name: 'Monitor 27"',
    price: 349.99,
    description: '4K UHD monitor with HDR support',
    category: 'Electronics',
    inStock: true,
    createdAt: new Date(),
  },
  {
    name: 'USB-C Hub',
    price: 49.99,
    description: '7-in-1 USB-C hub with HDMI and SD card reader',
    category: 'Accessories',
    inStock: true,
    createdAt: new Date(),
  },
];

export const seedDatabase = async () => {
  try {
    const productsCollection = db.collection('products');
    
    const snapshot = await productsCollection.get();
    if (!snapshot.empty) {
      console.log('Database already has data, skipping seed');
      return;
    }

    // Add products directly for mock Firestore
    for (const product of dummyProducts) {
      await productsCollection.add(product);
    }
    
    console.log(`Database seeded with ${dummyProducts.length} dummy products`);
  } catch (error) {
    console.error('Error seeding database:', error);
  }
};