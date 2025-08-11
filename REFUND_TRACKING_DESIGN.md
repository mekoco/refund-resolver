# Refund Tracking & Accounting System Design Document

## Executive Summary

This document outlines the design for a comprehensive refund tracking and accounting system that monitors order refunds, ensures proper product returns, and maintains accurate accounting records. The system will track multiple types of refunds (cancelled orders, incorrect packing, failed delivery, defective products, customer changed mind, platform fees, and others) and ensure all refunded values are properly accounted for through returned inventory, courier compensation, or documented write-offs.

Notes and assumptions:
- All monetary amounts are represented as JavaScript `number` and assumed to be Philippine Peso (PHP).
- All timestamps use Firestore `Timestamp`, considered in Philippine Time (UTC+8), serialized as ISO 8601 when needed.
## Business Requirements

### Refund Categories

1. **Order Cancelled**: Full refund with product return requirement
2. **Incorrect Packing**: Partial refund for wrong/missing items with return requirement
3. **Failed Delivery**: Full refund with product return requirement
4. **Defective Products**: Refund with no return requirement (write-off after manual reconciliation)
5. **Customer Changed Mind**: Partial refund for customer-selected items with return requirement (refund issued before return)
6. **Platform Fees**: Taxes, shipping fees, marketplace/platform fees
7. **Others**: Any other refund reason, including negative adjustments (decreases/corrections)

### Key Business Rules

- An order can have multiple refund reasons (RefundDetail) that sum to the total refund amount.
- Each RefundDetail tracks a specific reason and amount.
- Refunds are issued before product returns are initiated.
- Returned product values and any write-offs must reconcile to the refunded amount across all details.
- Discrepancies are the catch-all for partial write-offs, value mismatches, quantity mismatches, courier losses, etc.
- A separate system already approves refunds. This system tracks and reconciles only; no approval workflow is implemented here.

## Storage Model

- `orders/{orderId}`: Order documents.
- `refundDetails/{refundDetailId}`: Each RefundDetail is a separate document and is the source of truth for refund details.
- `orders/{orderId}/refundAccounting` or `refundAccounting/{orderId}`: One-to-one with order (choose one storage layout); embedded in `Order` as `refundAccount` for convenience. The `refundAccount.refundDetails` field is a denormalized view assembled from the `refundDetails` collection (may store references or snapshots for quick reads).
- `skus/{skuName}`: SKU documents keyed by immutable `name` (used as `skuName`).
- `staff/{staffCode}`: Staff documents with immutable `staffCode`.

Indexes: Add single-field and composite indexes for frequent queries (e.g., `orderId`, `refundType`, `accountingStatus`, `returnStatus`). Ensure uniqueness where applicable (e.g., `skus.name`, `staff.staffCode`).

Entity locking: When processing Excel uploads or concurrent updates to an order's refund/accounting data, lock the order (optimistic concurrency with version/updatedAt checks or Firestore transactions) to ensure idempotency and to prevent race conditions.

## System Architecture

### Simplified Entity Relationships

1. **Order** (1) → (1) **RefundAccounting**
   - Order embeds a `refundAccount` object for convenience
   - `refundAccount` aggregates/references `RefundDetail` records

2. **RefundAccounting** (1) → (Many) **RefundDetail**
   - Sum of all `RefundDetail.refundAmount` equals the order's `buyerRefundAmount`
   - Uses `Discrepancy` records to explain and reconcile mismatches/partial write-offs

3. **RefundDetail** embeds type-specific data:
   - `returnTrackings`: For types requiring returns (ORDER_CANCELLED, INCORRECT_PACKING, FAILED_DELIVERY, CUSTOMER_CHANGED_MIND)
   - `packingError`: For INCORRECT_PACKING type (links to `Staff`)
   - `defectiveItems`: For DEFECTIVE_PRODUCTS type
   - `discrepancies`: Array of mismatches (value, quantity, condition, courier loss, etc.)

4. **RefundReconciliation** (1) ← (1) **RefundDetail**
   - Each RefundDetail has a single reconciliation record that captures overall expected vs actual
   - Mixed outcomes (partial write-off, courier-paid segments) are represented via `Discrepancy` entries linked to the RefundDetail

5. **Staff**
   - Look-up entity for packer selection and simple accountability

6. **SKU**
   - Inventory reference entity keyed by immutable `name` (`skuName`)

## Data Model

### 1. Core Entities

```typescript
// Order includes refund accounting state; refund details live in their own collection
interface Order {
  id: string; // orderId
  // ... other existing fields ...
  buyerRefundAmount: number; // Total refund amount (sum of all RefundDetails)
  refundAccount?: RefundAccounting; // Embedded snapshot for convenience
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

interface RefundAccounting {
  refundDetails: RefundDetail[]; // Denormalized view; source of truth is refundDetails collection
  accountedRefundAmount: number; // Sum of reconciled values (returns + courier payments + write-offs)
  // Additional order-level refund accounting info could be added here as needed
}

interface RefundDetail {
  id: string;
  orderId: string;
  refundType: RefundType;
  refundAmount: number; // Portion of total refund for this specific reason (can be negative for corrections via OTHERS)
  refundDate: Timestamp;
  status: RefundStatus;
  accountingStatus: AccountingStatus;

  // Type-specific embedded data (based on refundType)
  returnTrackings?: ReturnTracking[]; // For all returns-required types
  packingError?: PackingErrorData; // For INCORRECT_PACKING
  defectiveItems?: DefectiveItemData[]; // For DEFECTIVE_PRODUCTS

  // Discrepancies for this RefundDetail (mismatches, partial write-offs, courier losses, etc.)
  discrepancies?: Discrepancy[];

  createdBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

enum RefundType {
  ORDER_CANCELLED = 'ORDER_CANCELLED',
  INCORRECT_PACKING = 'INCORRECT_PACKING',
  FAILED_DELIVERY = 'FAILED_DELIVERY',
  DEFECTIVE_PRODUCTS = 'DEFECTIVE_PRODUCTS',
  CUSTOMER_CHANGED_MIND = 'CUSTOMER_CHANGED_MIND',
  PLATFORM_FEES = 'PLATFORM_FEES', // taxes, shipping, marketplace/platform fees
  OTHERS = 'OTHERS' // catch-all; can be negative for decreases/corrections
}

enum RefundStatus {
  INITIATED = 'INITIATED',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED'
}

enum AccountingStatus {
  UNACCOUNTED = 'UNACCOUNTED',
  PARTIALLY_ACCOUNTED = 'PARTIALLY_ACCOUNTED',
  FULLY_ACCOUNTED = 'FULLY_ACCOUNTED'
}
```

### 2. Return Tracking

```typescript
interface ReturnTracking {
  id: string;
  returnInitiatedDate?: Timestamp;
  expectedReturnDate?: Timestamp;
  actualReturnDate?: Timestamp;
  returnStatus: ReturnStatus;
  returnItems: ReturnItem[];
  totalReturnValue: number; // Derived/validated as sum(returnItems.quantity * returnItems.unitPrice)
  reason?: string; // Optional reason for return (especially for CUSTOMER_CHANGED_MIND)
}

interface ReturnItem {
  skuName: string; // FK reference to SKU.name (immutable key)
  quantity: number;
  unitPrice: number; // Current SKU price at time of return
  condition: ItemCondition;
  restockedDate?: Timestamp;
  restockedBy?: string;
}

enum ReturnStatus {
  PENDING = 'PENDING',
  IN_TRANSIT = 'IN_TRANSIT',
  RECEIVED = 'RECEIVED',
  INSPECTING = 'INSPECTING',
  RESTOCKED = 'RESTOCKED',
  DISCREPANCY_FOUND = 'DISCREPANCY_FOUND',
  LOST_BY_COURIER = 'LOST_BY_COURIER',
  PAID_BY_COURIER = 'PAID_BY_COURIER'
}

enum ItemCondition {
  GOOD = 'GOOD',
  DAMAGED = 'DAMAGED',
  MISSING = 'MISSING'
}

interface Discrepancy {
  id: string;
  refundDetailId: string; // FK to RefundDetail
  type: DiscrepancyType;
  description: string;
  expectedValue: number;
  actualValue: number;
  variance: number;
  resolvedBy?: string;
  resolvedDate?: Timestamp;
  resolution?: string;
  createdAt: Timestamp;
}

enum DiscrepancyType {
  VALUE_MISMATCH = 'VALUE_MISMATCH',
  QUANTITY_MISMATCH = 'QUANTITY_MISMATCH',
  ITEM_MISMATCH = 'ITEM_MISMATCH',
  CONDITION_MISMATCH = 'CONDITION_MISMATCH',
  MISSING_ITEMS = 'MISSING_ITEMS',
  COURIER_LOSS = 'COURIER_LOSS',
  WRITE_OFF = 'WRITE_OFF'
}
```

### 3. Packing Error Documentation and Staff

```typescript
interface PackingErrorData {
  packedByStaffCode: string; // FK to Staff.staffCode
  errorType: PackingErrorType;
  incorrectItems: IncorrectItem[];
  notes?: string;
}

interface IncorrectItem {
  expectedSKUName: string; // FK reference to SKU.name
  actualSKUName?: string; // FK reference to SKU.name, null if missing
  expectedQuantity: number;
  actualQuantity: number;
  valueDifference: number;
}

enum PackingErrorType {
  WRONG_ITEM = 'WRONG_ITEM',
  MISSING_ITEM = 'MISSING_ITEM',
  EXCESS_ITEM = 'EXCESS_ITEM',
  MIXED_ERROR = 'MIXED_ERROR'
}

interface Staff {
  staffCode: string; // Immutable key
  staffName: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

### 4. Defective Product Documentation

```typescript
interface DefectiveItemData {
  skuName: string; // FK reference to SKU.name
  quantity: number;
  unitPrice: number;
  defectDescription: string;
  evidenceUrls?: string[]; // Photos/videos of defect
  reportedBy: string;
  reportedDate: Timestamp;
  verifiedBy?: string;
  verifiedDate?: Timestamp;
}
```

### 5. SKU Entity (Keyed by immutable name)

```typescript
interface SKU {
  id: string;
  name: string; // Immutable unique key (formerly merchantSKU)
  productName: string;
  category?: string;
  unitCost: number;
  unitPrice: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

Note: SKU documents do not maintain inventory counters in this system. Returns tracking records whether items are restockable for accounting only.

### 6. Accounting Reconciliation

```typescript
interface RefundReconciliation {
  id: string;
  refundDetailId: string; // Each RefundDetail has its own reconciliation
  expectedValue: number; // RefundDetail.refundAmount
  actualValue: number; // Actual value recovered/written off
  variance: number;
  status: ReconciliationStatus;
  reconciledBy?: string;
  reconciledDate?: Timestamp;
  notes?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

enum ReconciliationStatus {
  PENDING = 'PENDING',
  MATCHED = 'MATCHED',
  VARIANCE_FOUND = 'VARIANCE_FOUND'
}
```

Note: Reconciliation categorization (e.g., return value vs restock vs write-off context) is inferred from `RefundDetail.refundType` and associated data (returns, discrepancies), not stored explicitly.

Notes:
- Mixed outcomes for a RefundDetail (e.g., partial write-off, courier loss, balance returned) are captured via `Discrepancy` entries, not multiple reconciliation rows.
- Defective products are NOT auto-accounted. A person must manually reconcile them as write-offs (no formal approval step in this system).
- An order cannot be marked fully accounted if any related return has status `LOST_BY_COURIER`. It must transition to `PAID_BY_COURIER` (or otherwise reconciled via discrepancies) before being fully accounted.

## API Endpoints

All list endpoints for Orders, Staff, and SKUs support pagination, filtering, and sorting via standard query parameters: `?page=1&pageSize=50&sort=field:asc&filter[field]=value`.

### Refund Management

```typescript
POST   /api/refunds/initiate        // Create new RefundDetail(s)
POST   /api/refunds/split           // Split single refund into multiple RefundDetails
GET    /api/refunds                 // List all RefundDetails (with pagination/filter/sort)
GET    /api/refunds/:id             // Get specific RefundDetail
PUT    /api/refunds/:id/status      // Update RefundDetail status
PUT    /api/refunds/:id/type-data   // Update type-specific data (packing error, defects, etc.)
DELETE /api/refunds/:id             // Delete RefundDetail

// Bulk operations
POST   /api/refunds/bulk-update
```

### Return Tracking

```typescript
POST   /api/returns/initiate
GET    /api/returns
GET    /api/returns/:id
PUT    /api/returns/:id/receive
PUT    /api/returns/:id/inspect
PUT    /api/returns/:id/restock
PUT    /api/returns/:id/mark-lost-by-courier
PUT    /api/returns/:id/mark-paid-by-courier
GET    /api/returns/pending
```

### Accounting & Reconciliation

```typescript
GET    /api/reconciliation/unaccounted
GET    /api/reconciliation/partial
POST   /api/reconciliation/:refundId/reconcile
GET    /api/reconciliation/variance-report
```

### SKU Management

```typescript
POST   /api/skus                    // Create SKU
GET    /api/skus                    // List SKUs (pagination/filter/sort)
GET    /api/skus/:skuName           // Get SKU by name
PUT    /api/skus/:skuName           // Update SKU
DELETE /api/skus/:skuName           // Delete SKU
```

### Staff Management

```typescript
POST   /api/staff                   // Create staff
GET    /api/staff                   // List staff (pagination/filter/sort)
GET    /api/staff/:staffCode        // Get staff by code
PUT    /api/staff/:staffCode        // Update staff
DELETE /api/staff/:staffCode        // Delete staff
```

### Reporting

```typescript
GET    /api/reports/refund-summary
GET    /api/reports/accounting-status
GET    /api/reports/staff-errors
GET    /api/reports/defective-products
GET    /api/reports/financial-impact
```

## Business Logic Implementation

### 1. Excel Upload Enhancement

- Excel upload may be run multiple times. Ensure idempotency by locking the target order during updates (transaction) and by basing deltas on the latest stored state.
- If `buyerRefundAmount` increases, create a new `RefundDetail` for the difference.
- If `buyerRefundAmount` decreases, create an `OTHERS` RefundDetail with a negative `refundAmount` to represent a correction.

```typescript
async function processOrderUpdate(existingOrder: Order, newData: Order) {
  // Lock order via transaction or optimistic concurrency
  if (newData.buyerRefundAmount > existingOrder.buyerRefundAmount) {
    const refundDifference = newData.buyerRefundAmount - existingOrder.buyerRefundAmount;

    await createRefundDetail({
      orderId: existingOrder.id,
      refundAmount: refundDifference,
      refundDate: Timestamp.now(),
      status: RefundStatus.INITIATED,
      refundType: RefundType.OTHERS, // initial, user can later reclassify
      accountingStatus: AccountingStatus.UNACCOUNTED
    });

    await validateRefundDetailsSum(existingOrder.id, newData.buyerRefundAmount);
  }

  if (newData.buyerRefundAmount < existingOrder.buyerRefundAmount) {
    const correction = newData.buyerRefundAmount - existingOrder.buyerRefundAmount; // negative value

    await createRefundDetail({
      orderId: existingOrder.id,
      refundAmount: correction, // negative
      refundDate: Timestamp.now(),
      status: RefundStatus.PROCESSING,
      refundType: RefundType.OTHERS,
      accountingStatus: AccountingStatus.UNACCOUNTED
    });

    await validateRefundDetailsSum(existingOrder.id, newData.buyerRefundAmount);
  }
}

async function validateRefundDetailsSum(orderId: string, expectedTotal: number) {
  const refundDetails = await getRefundDetailsByOrderId(orderId);
  const actualTotal = refundDetails.reduce((sum, rd) => sum + rd.refundAmount, 0);
  if (Math.abs(actualTotal - expectedTotal) > 0.01) {
    throw new Error(`RefundDetails sum (${actualTotal}) does not match order refund amount (${expectedTotal})`);
  }
}
```

### 2. Refund Processing Workflow

```typescript
class RefundProcessor {
  async processRefund(refundDetail: RefundDetail) {
    switch (refundDetail.refundType) {
      case RefundType.ORDER_CANCELLED:
        refundDetail.returnTrackings = [await this.createReturnTracking(
          refundDetail.refundAmount,
          'full'
        )];
        break;

      case RefundType.INCORRECT_PACKING:
        refundDetail.packingError = await this.getPackingErrorDetails(refundDetail);
        refundDetail.returnTrackings = [await this.createReturnTracking(
          refundDetail.refundAmount,
          'partial'
        )];
        break;

      case RefundType.FAILED_DELIVERY:
        refundDetail.returnTrackings = [await this.createReturnTracking(
          refundDetail.refundAmount,
          'full'
        )];
        break;

      case RefundType.DEFECTIVE_PRODUCTS:
        // No return required - manual reconciliation as write-off by a user later
        refundDetail.defectiveItems = await this.getDefectiveItemDetails(refundDetail);
        // Do NOT auto set FULLY_ACCOUNTED
        break;

      case RefundType.CUSTOMER_CHANGED_MIND:
        refundDetail.returnTrackings = [await this.createReturnTracking(
          refundDetail.refundAmount,
          'partial'
        )];
        if (refundDetail.returnTrackings[0]) {
          refundDetail.returnTrackings[0].reason = await this.getReturnReason(refundDetail);
        }
        break;

      case RefundType.PLATFORM_FEES:
      case RefundType.OTHERS:
        // No default return; accounting will reconcile via discrepancies as needed
        break;
    }

    await this.saveRefundDetail(refundDetail);
  }

  async validateReturnValue(refundDetail: RefundDetail) {
    if (!refundDetail.returnTrackings || refundDetail.returnTrackings.length === 0) return true;

    const actualValue = refundDetail.returnTrackings.flatMap(rt => rt.returnItems)
      .reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);

    const expectedValue = refundDetail.refundAmount;

    if (Math.abs(actualValue - expectedValue) > 0.01) {
      refundDetail.discrepancies = refundDetail.discrepancies || [];
      refundDetail.discrepancies.push({
        id: generateId(),
        refundDetailId: refundDetail.id,
        type: DiscrepancyType.VALUE_MISMATCH,
        description: 'Return value does not match refund amount',
        expectedValue,
        actualValue,
        variance: actualValue - expectedValue,
        createdAt: Timestamp.now()
      });

      refundDetail.accountingStatus = AccountingStatus.PARTIALLY_ACCOUNTED;
      // If any discrepancy exists, mark latest return as DISCREPANCY_FOUND
      const lastRt = refundDetail.returnTrackings[refundDetail.returnTrackings.length - 1];
      if (lastRt) {
        lastRt.returnStatus = ReturnStatus.DISCREPANCY_FOUND;
      }
      await this.saveRefundDetail(refundDetail);

      return false;
    }

    return true;
  }
}
```

### 3. Inventory Restocking

We do not track SKU inventory levels in this system. Restocking here only updates the return records to indicate which items were received in good condition and considered restockable for accounting purposes.

```typescript
class InventoryManager {
  async markRestockableItems(refundDetail: RefundDetail) {
    if (!refundDetail.returnTrackings || refundDetail.returnTrackings.length === 0) return;

    for (const rt of refundDetail.returnTrackings) {
      for (const item of rt.returnItems) {
        if (item.condition === ItemCondition.GOOD) {
          item.restockedDate = Timestamp.now();
          item.restockedBy = getCurrentUser();
        }
      }
    }

    await this.saveRefundDetail(refundDetail);
  }
}
```

- No stock counters are updated in `skus` documents.
- Accounting compares expected refund values vs. the derived value of returned items marked restockable, courier payments, and write-offs.


Accounting is achieved when values across returns, courier payments, and write-offs (represented via discrepancies) match the user refund amount for the order. An order cannot be marked `FULLY_ACCOUNTED` while any return is `LOST_BY_COURIER`.

## Post‑Reconciliation Changes: Voiding by Mismatch (Order Refund Amount Changes)

### Summary
- Preserve prior reconciliations; do not mutate or delete history
- Create an OTHERS delta RefundDetail for any change in buyerRefundAmount (positive or negative)
- Recompute the order snapshot; order becomes non‑fully‑accounted until the delta is reconciled

When an order's `buyerRefundAmount` changes after the order has already been fully reconciled, the system must effectively void the order-level fully-accounted state. We do not delete or mutate historical reconciliation rows. Instead, we re-introduce a mismatch so the order transitions back to a non-fully-accounted state until new reconciliation actions are taken.

### Behavior
- The Excel upload flow remains the single source of truth for order totals. Any change in `buyerRefundAmount` is materialized as a new `RefundDetail` line item for the delta (positive or negative) with `refundType = OTHERS` and `accountingStatus = UNACCOUNTED`.
- Existing `RefundReconciliation` records are preserved (not deleted). They remain as the latest reconciliation state for their associated `RefundDetail` rows.
- The order-level `refundAccount.accountedRefundAmount` is recomputed after every write via `recomputeAndWriteOrderRefundSnapshot(orderId)` and represents the sum of the latest reconciliation `actualValue` per `RefundDetail` (or the derived returns value for details without a reconciliation yet).
- Order accounting status is derived (not stored) and becomes non-fully-accounted if totals no longer match:
  - `FULLY_ACCOUNTED` only when `abs(accountedRefundAmount - sum(refundDetails.refundAmount)) < epsilon` and no return has status `LOST_BY_COURIER`.
  - Otherwise `PARTIALLY_ACCOUNTED` (or `UNACCOUNTED` when zero recovery).
- This constitutes an implicit "void" of the previous fully-accounted state at the order level because the totals no longer balance.

### Invariants
- We never mutate or delete prior reconciliations when the order total changes.
- We always create a new `RefundDetail` to represent the change in the buyer refund amount.
- We always recompute the order snapshot immediately after any write affecting refunds/returns/reconciliations.

### Flow (Pseudo-code)

```typescript
// Excel upload enhancement (already implemented)
async function processOrderUpdate(existingOrder: Order, newData: Order) {
  // Compute delta on buyerRefundAmount
  const delta = Number(newData.buyerRefundAmount || 0) - Number(existingOrder.buyerRefundAmount || 0);
  if (Math.abs(delta) > 0.01) {
    await createRefundDetail({
      orderId: existingOrder.id,
      refundAmount: delta, // positive for increase, negative for decrease
      refundDate: Timestamp.now(),
      status: delta >= 0 ? RefundStatus.INITIATED : RefundStatus.PROCESSING,
      refundType: RefundType.OTHERS,
      accountingStatus: AccountingStatus.UNACCOUNTED,
      createdBy: 'system:excel-upload'
    });
  }

  // Persist order changes
  await saveOrder({ ...existingOrder, ...newData, updatedAt: Timestamp.now() });

  // Recompute snapshot → this will now reflect a mismatch vs. new totals
  await recomputeAndWriteOrderRefundSnapshot(existingOrder.id);

  // Validate integrity
  await validateRefundDetailsSum(existingOrder.id, newData.buyerRefundAmount);
}

// Snapshot recompute (already implemented)
async function recomputeAndWriteOrderRefundSnapshot(orderId: string) {
  // accountedRefundAmount = sum(latest reconciliation actualValue per RefundDetail)
  //                        or derived return value when no reconciliation exists yet.
  // Write to orders/{orderId}.refundAccount.accountedRefundAmount
}

// Derived accounting status (already implemented)
function inferOrderAccountingStatus(refundAccount: RefundAccounting): AccountingStatus {
  // FULLY_ACCOUNTED if accountedRefundAmount ~= sum(refundDetails.refundAmount)
  // and no LOST_BY_COURIER. Else PARTIALLY_ACCOUNTED/UNACCOUNTED.
}
```

### Examples
- Increase after full reconciliation: Order initially `buyerRefundAmount = 500`, a single refund detail is reconciled MATCHED with `actualValue = 500`. Later, Excel updates the order to `buyerRefundAmount = 800`.
  - System creates `RefundDetail(OTHERS, refundAmount = +300, UNACCOUNTED)`.
  - Snapshot recompute keeps `accountedRefundAmount = 500` (no new reconciliation for the +300 line), while total expected is now `800`.
  - `inferOrderAccountingStatus` returns `PARTIALLY_ACCOUNTED` → previous fully-accounted state is effectively voided.
- Decrease after full reconciliation: Order `buyerRefundAmount` drops from `500` to `350`.
  - System creates `RefundDetail(OTHERS, refundAmount = -150, UNACCOUNTED)`.
  - Snapshot recompute may show `accountedRefundAmount = 500` vs expected `350` until a corrective reconciliation/write-off is recorded for the negative adjustment detail.
  - Status becomes `PARTIALLY_ACCOUNTED` until resolved.

### Notes
- No explicit "void" API is required. The system treats any post-reconciliation change as a new accounting task by introducing a new unaccounted refund detail and recomputing totals. Historical reconciliations remain intact for auditability.
- Operators should reconcile the new delta detail (e.g., via `POST /api/reconciliation/:refundId/reconcile`) or adjust returns/discrepancies accordingly to bring the order back to `FULLY_ACCOUNTED`.

## Dashboard Design

### Objectives
- Provide at-a-glance visibility into refund volume, accounting progress, and operational bottlenecks.
- Surface what needs attention now (pending actions, variances, lost-by-courier cases).
- Enable quick drill-down to orders and refund details.

### Global filters
- Date range: by refundDate (default: last 30 days)
- Refund type: multi-select of RefundType values
- Accounting status: UNACCOUNTED, PARTIALLY_ACCOUNTED, FULLY_ACCOUNTED
- Return status: PENDING, IN_TRANSIT, RECEIVED, INSPECTING, RESTOCKED, DISCREPANCY_FOUND, LOST_BY_COURIER, PAID_BY_COURIER
- Store, Staff (packer), SKU (optional text search)

### Overview KPIs
- Total refunds amount (filtered range)
- Orders with refunds (count)
- Average refund per order
- Accounted amount vs. expected amount (sum of RefundDetail.refundAmount vs. accountedRefundAmount)
- Recovery rate = accountedRefundAmount / sum(RefundDetail.refundAmount) for the range

### Accounting status panel
- UNACCOUNTED: total amount and order count
- PARTIALLY_ACCOUNTED: total amount and order count
- FULLY_ACCOUNTED: total amount and order count
- Note: An order is FULLY_ACCOUNTED only when all its RefundDetails reconcile and no return remains LOST_BY_COURIER

### Refunds by type
- Donut or stacked bar chart of amounts by RefundType
- Trend line (daily/weekly) for refund amounts and accounted amounts over time

### Returns status panel
- Counts and amounts by ReturnStatus with special emphasis:
  - LOST_BY_COURIER: highlight as blocking; link to view only these cases
  - PAID_BY_COURIER: show recent transitions as positive recovery

### Pending actions list
- Returns awaiting receipt (status IN_TRANSIT or PENDING)
- Items pending inspection (RECEIVED)
- Details with DISCREPANCY_FOUND
- RefundDetails with UNACCOUNTED or VARIANCE_FOUND reconciliation
- Optional: DEFECTIVE_PRODUCTS awaiting manual write-off reconciliation

Each list row should include: `orderId`, refundDetail `id`, `refundType`, `refundAmount`, `current status`, `days outstanding`, quick actions (view detail).

### Tables
1) Orders with refund summary
- Columns: orderId, storeName, buyerRefundAmount, accountedRefundAmount, accountingStatus, refund count, latest update, badges for any LOST_BY_COURIER
- Row click → Order Refund Detail view

2) RefundDetails table
- Columns: id, orderId, refundType, refundAmount, accountingStatus, latest returnStatus (if any), discrepancies count, updatedAt
- Row click → Refund Detail view with returns/discrepancies timeline

3) Discrepancies table
- Columns: id, orderId, refundDetailId, type, variance, createdAt, resolvedBy/resolvedDate
- Filters: type (VALUE_MISMATCH, WRITE_OFF, COURIER_LOSS, etc.)

### Staff metrics (packing accuracy)
- Top N packers by discrepancy rate (Incorrect Packing only)
- Total discrepancy value by staff in range
- Link to Staff detail (list of impacted orders/refunds)

### Drill-down views
- Order Refund Detail: shows all RefundDetails for the order, their returnTrackings, discrepancies, and reconciliation status; shows whether the order is fully accounted.
- Refund Detail: type-specific data (packingError, defectiveItems), returns timeline, discrepancy log, and reconciliation summary.

### Data sources and computations
- Primary sources: `orders`, `refundDetails`, `refundReconciliations`.
- Derived order-level fields for the dashboard are read from `Order.refundAccount` (projection) when available; if stale/missing, compute on the fly by aggregating `refundDetails` for `orderId`.
- Do not use SKU inventory for any metric; returned value is derived from `sum(quantity * unitPrice)` for GOOD items in returnTrackings plus courier payments and write-offs recorded as discrepancies.
- Blocking rule: Any return with status = LOST_BY_COURIER prevents FULLY_ACCOUNTED until status changes to PAID_BY_COURIER or discrepancy resolution closes the gap.

### Backend endpoints powering the dashboard
- GET /api/orders (with pagination/filter/sort)
- GET /api/refunds (with pagination/filter/sort)
- GET /api/reconciliation/unaccounted, /partial, /variance-report
- GET /api/returns (for rollups by status)

### Performance and UX
- Pre-compute `refundAccount` snapshot on write-paths to avoid expensive aggregates on hot paths.
- Paginate tables (default 25 rows), client-side caching for last query.
- Provide quick filters and chips; persist last-used filters in local storage.
- Export CSV for current table view (Orders, RefundDetails, Discrepancies).

### Empty states and alerts
- Show helpful empty-state messages when no data matches filters.
- Banner alert for number/amount of LOST_BY_COURIER items.

## Implementation Phases

- Same phases as before; approvals are out of scope for now.

## Security & Compliance

- No authentication/authorization for now (RBAC out of scope).
- No audit logging for now.

## Data Integrity

- Use transactions/locks for Excel upload and concurrent modifications.
- Maintain invariants:
  - `ReturnItem.totalValue` is not stored; always derived as `quantity * unitPrice`.
  - `ReturnTracking.totalReturnValue` is validated against derived sum.
  - Sum of all `RefundDetail.refundAmount` equals `Order.buyerRefundAmount`.
  - `skuName` and `staffCode` are immutable identifiers.

## Compliance Requirements

- Out of scope.

## Performance Considerations

- Add indexes on frequently queried fields (`orderId`, `refundType`, `accountingStatus`, `returnStatus`).
- Consider pagination and filtering for Orders, Staff, and SKUs.

## Success Metrics, Risk Mitigation, Future Enhancements

- As previously outlined. Potential future items: RBAC, audit logs, notifications, more granular reconciliation line-items, multi-currency support, richer reporting.
