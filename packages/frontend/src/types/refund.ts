export enum RefundType {
  ORDER_CANCELLED = 'ORDER_CANCELLED',
  INCORRECT_PACKING = 'INCORRECT_PACKING',
  FAILED_DELIVERY = 'FAILED_DELIVERY',
  DEFECTIVE_PRODUCTS = 'DEFECTIVE_PRODUCTS',
  CUSTOMER_CHANGED_MIND = 'CUSTOMER_CHANGED_MIND',
  PLATFORM_FEES = 'PLATFORM_FEES',
  OTHERS = 'OTHERS'
}

export enum RefundStatus {
  INITIATED = 'INITIATED',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED'
}

export enum AccountingStatus {
  UNACCOUNTED = 'UNACCOUNTED',
  PARTIALLY_ACCOUNTED = 'PARTIALLY_ACCOUNTED',
  FULLY_ACCOUNTED = 'FULLY_ACCOUNTED'
}

export enum ReturnStatus {
  PENDING = 'PENDING',
  IN_TRANSIT = 'IN_TRANSIT',
  RECEIVED = 'RECEIVED',
  INSPECTING = 'INSPECTING',
  RESTOCKED = 'RESTOCKED',
  DISCREPANCY_FOUND = 'DISCREPANCY_FOUND',
  LOST_BY_COURIER = 'LOST_BY_COURIER',
  PAID_BY_COURIER = 'PAID_BY_COURIER'
}

export type ItemCondition = 'GOOD' | 'DAMAGED' | 'MISSING';

export interface ReturnItem {
  skuName: string;
  quantity: number;
  unitPrice: number;
  condition: ItemCondition;
  restockedDate?: string;
  restockedBy?: string;
}

export interface ReturnTracking {
  id: string;
  returnInitiatedDate?: string;
  expectedReturnDate?: string;
  actualReturnDate?: string;
  returnStatus: ReturnStatus;
  returnItems: ReturnItem[];
  totalReturnValue: number;
  reason?: string;
}

export type DiscrepancyType = 'VALUE_MISMATCH' | 'QUANTITY_MISMATCH' | 'ITEM_MISMATCH' | 'CONDITION_MISMATCH' | 'MISSING_ITEMS' | 'COURIER_LOSS' | 'WRITE_OFF';

export interface Discrepancy {
  id: string;
  refundDetailId: string;
  type: DiscrepancyType;
  description: string;
  expectedValue: number;
  actualValue: number;
  variance: number;
  resolvedBy?: string;
  resolvedDate?: string;
  resolution?: string;
  createdAt: string;
}

export interface RefundDetail {
  id: string;
  orderId: string;
  refundType: RefundType;
  refundAmount: number;
  refundDate: string;
  status: RefundStatus;
  accountingStatus: AccountingStatus;
  returnTrackings?: ReturnTracking[];
  discrepancies?: Discrepancy[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface RefundReconciliation {
  id: string;
  refundDetailId: string;
  expectedValue: number;
  actualValue: number;
  variance: number;
  status: 'PENDING' | 'MATCHED' | 'VARIANCE_FOUND';
  reconciledBy?: string;
  reconciledDate?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReturnIndexDoc {
  id: string;
  refundDetailId: string;
  orderId: string;
  returnStatus: ReturnStatus | string;
  totalReturnValue: number;
  createdAt: string;
  updatedAt: string;
} 