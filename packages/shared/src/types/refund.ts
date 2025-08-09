export interface RefundAccounting {
  refundDetails: RefundDetail[];
  accountedRefundAmount: number;
}

export interface RefundDetail {
  id: string;
  orderId: string;
  refundType: RefundType;
  refundAmount: number; // can be negative for corrections via OTHERS
  refundDate: Date;
  status: RefundStatus;
  accountingStatus: AccountingStatus;
  returnTrackings?: ReturnTracking[];
  packingError?: PackingErrorData;
  defectiveItems?: DefectiveItemData[];
  discrepancies?: Discrepancy[];
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

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

export interface ReturnTracking {
  id: string;
  returnInitiatedDate?: Date;
  expectedReturnDate?: Date;
  actualReturnDate?: Date;
  returnStatus: ReturnStatus;
  returnItems: ReturnItem[];
  totalReturnValue: number; // derived as sum(quantity * unitPrice)
  reason?: string;
}

export interface ReturnItem {
  skuName: string; // immutable key of SKU
  quantity: number;
  unitPrice: number; // current SKU price at time of return
  condition: ItemCondition;
  restockedDate?: Date;
  restockedBy?: string;
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

export enum ItemCondition {
  GOOD = 'GOOD',
  DAMAGED = 'DAMAGED',
  MISSING = 'MISSING'
}

export interface Discrepancy {
  id: string;
  refundDetailId: string;
  type: DiscrepancyType;
  description: string;
  expectedValue: number;
  actualValue: number;
  variance: number;
  resolvedBy?: string;
  resolvedDate?: Date;
  resolution?: string;
  createdAt: Date;
}

export enum DiscrepancyType {
  VALUE_MISMATCH = 'VALUE_MISMATCH',
  QUANTITY_MISMATCH = 'QUANTITY_MISMATCH',
  ITEM_MISMATCH = 'ITEM_MISMATCH',
  CONDITION_MISMATCH = 'CONDITION_MISMATCH',
  MISSING_ITEMS = 'MISSING_ITEMS',
  COURIER_LOSS = 'COURIER_LOSS',
  WRITE_OFF = 'WRITE_OFF'
}

export interface PackingErrorData {
  packedByStaffCode: string;
  errorType: PackingErrorType;
  incorrectItems: IncorrectItem[];
  notes?: string;
}

export interface IncorrectItem {
  expectedSKUName: string;
  actualSKUName?: string;
  expectedQuantity: number;
  actualQuantity: number;
  valueDifference: number;
}

export enum PackingErrorType {
  WRONG_ITEM = 'WRONG_ITEM',
  MISSING_ITEM = 'MISSING_ITEM',
  EXCESS_ITEM = 'EXCESS_ITEM',
  MIXED_ERROR = 'MIXED_ERROR'
}

export interface DefectiveItemData {
  skuName: string;
  quantity: number;
  unitPrice: number;
  defectDescription: string;
  evidenceUrls?: string[];
  reportedBy: string;
  reportedDate: Date;
  verifiedBy?: string;
  verifiedDate?: Date;
}

export interface RefundReconciliation {
  id: string;
  refundDetailId: string;
  expectedValue: number;
  actualValue: number;
  variance: number;
  status: ReconciliationStatus;
  reconciledBy?: string;
  reconciledDate?: Date;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export enum ReconciliationStatus {
  PENDING = 'PENDING',
  MATCHED = 'MATCHED',
  VARIANCE_FOUND = 'VARIANCE_FOUND'
}

export interface Staff {
  staffCode: string;
  staffName: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface SKU {
  id: string;
  name: string; // immutable unique key
  productName: string;
  category?: string;
  unitCost: number;
  unitPrice: number;
  currentStock: number;
  reservedStock: number;
  availableStock: number;
  createdAt: Date;
  updatedAt: Date;
} 