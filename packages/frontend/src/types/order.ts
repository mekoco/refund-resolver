export interface OrderItem {
  merchantSKU: string;
  salesVolume: number;
  isGift: boolean;
}

export interface Order {
  id?: string;
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
  orderTime: string | null;
  confirmTime: string | null;
  releaseTime: string | null;
  updateTime: string | null;
  completedTime: string | null;
  orderStatus: string;
  createdAt?: string;
  updatedAt?: string;
}