export interface OrderItem {
  merchantSKU: string;
  salesVolume: number;
  isGift: boolean;
}

export interface Order {
  id?: string; // Firestore document id (may mirror orderId)
  orderId: string; // canonical order identifier (formerly orderNo)
  storeName: string;
  orderRevenue: number;
  items: OrderItem[];
  commodityCost: number;
  profitLoss: number;
  profitRate: number;
  productSales: number;
  shippingFeePaidByBuyer: number;
  subsidyForDiscountPromotion: number;
  commissionFee: number;
  transactionFee: number;
  serviceCharge: number;
  shippingFeePaidBySeller: number;
  marketingFees: number;
  buyerRefundAmount: number;
  otherPlatformFees: number;
  orderTime: Date | null;
  confirmTime: Date | null;
  releaseTime: Date | null;
  updateTime: Date | null;
  completedTime: Date | null;
  orderStatus: string;
  createdAt?: Date;
  updatedAt?: Date;
}