import { Router, Request, Response } from 'express';
import { db } from '../config/firebase';
import { Product } from '@packages/shared';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    const productsSnapshot = await db.collection('products').get();
    const products: Product[] = [];
    
    productsSnapshot.forEach((doc: any) => {
      products.push({
        id: doc.id,
        ...doc.data() as Product
      });
    });

    res.json({
      success: true,
      data: products,
      count: products.length
    });
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch products'
    });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const doc = await db.collection('products').doc(id).get();
    
    if (!doc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Product not found'
      });
    }

    res.json({
      success: true,
      data: {
        id: doc.id,
        ...doc.data()
      }
    });
  } catch (error) {
    console.error('Error fetching product:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch product'
    });
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const productData: Product = {
      ...req.body,
      createdAt: new Date()
    };

    const docRef = await db.collection('products').add(productData);
    const doc = await docRef.get();

    res.status(201).json({
      success: true,
      data: {
        id: doc.id,
        ...doc.data()
      }
    });
  } catch (error) {
    console.error('Error creating product:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create product'
    });
  }
});

export default router;