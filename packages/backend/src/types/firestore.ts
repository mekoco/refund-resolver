import { AccountingStatus, AccountStatus, RefundStatus, RefundType, ReturnStatus, ItemCondition } from '@packages/shared';

export type TimestampLike = Date | FirebaseFirestore.Timestamp;

export interface ReturnItemDoc {
  skuName: string;
  quantity: number;
  unitPrice: number;
  condition: ItemCondition;
  restockedDate?: TimestampLike;
  restockedBy?: string;
}

export interface ReturnTrackingDoc {
  id: string;
  returnInitiatedDate?: TimestampLike;
  expectedReturnDate?: TimestampLike;
  actualReturnDate?: TimestampLike;
  returnStatus: ReturnStatus;
  returnItems: ReturnItemDoc[];
  totalReturnValue: number;
  reason?: string;
}

export interface RefundDetailDoc {
  orderId: string;
  refundType: RefundType;
  refundAmount: number;
  refundDate: TimestampLike;
  status: RefundStatus;
  accountingStatus: AccountingStatus;
  returnTrackings?: ReturnTrackingDoc[];
  packingError?: unknown;
  defectiveItems?: unknown[];
  discrepancies?: unknown[];
  createdBy: string;
  createdAt: TimestampLike;
  updatedAt: TimestampLike;
}

export interface RefundReconciliationDoc {
  refundDetailId: string;
  expectedValue: number;
  actualValue: number;
  variance: number;
  status: 'PENDING' | 'MATCHED' | 'VARIANCE_FOUND';
  reconciledBy?: string;
  reconciledDate?: TimestampLike;
  notes?: string;
  createdAt: TimestampLike;
  updatedAt: TimestampLike;
}

export interface ReturnIndexDoc {
  refundDetailId: string;
  orderId: string;
  returnStatus: ReturnStatus;
  totalReturnValue: number;
  createdAt: TimestampLike;
  updatedAt: TimestampLike;
}

export interface RefundAccountingDoc {
  refundDetails?: RefundDetailDoc[];
  accountedRefundAmount: number;
  accountStatus: AccountStatus;
}

export interface OrderDoc {
  orderId: string;
  storeName: string;
  orderRevenue: number;
  items: Array<{ merchantSKU: string; salesVolume: number; isGift: boolean }>;
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
  refundAccount?: RefundAccountingDoc;
  otherPlatformFees: number;
  orderTime: TimestampLike | null;
  confirmTime: TimestampLike | null;
  releaseTime: TimestampLike | null;
  updateTime: TimestampLike | null;
  completedTime: TimestampLike | null;
  orderStatus: string;
  createdAt?: TimestampLike;
  updatedAt?: TimestampLike;
} 