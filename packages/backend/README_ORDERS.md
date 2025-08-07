# Order Import Functionality

## Overview
The backend now supports importing order data from Excel files with a specific format. This functionality is designed to be reusable and can handle large Excel files efficiently.

## Excel File Format
The Excel file should have the following columns:
- Order No
- BigSeller Store Name
- Order Revenue
- Merchant SKU (supports multiple SKUs separated by newlines)
- Sales Volume (supports multiple values separated by newlines)
- Gift (Yes/No, supports multiple values separated by newlines)
- Commodity Cost
- Profit/Loss
- Profit Rate
- Product Sales
- Shipping Fee Paid by Buyer
- Subsidy for Discount & Promotion
- Commission Fee
- Transaction Fee
- Service Charge
- Shipping Fee Paid by Seller
- Marketing Fees
- Buyer Refund Amount
- Other Platform Fees
- Order Time
- Confirm Time
- Release Time
- Update Time
- Completed Time
- Order Status

## Usage

### 1. Seed Orders from Command Line
```bash
cd packages/backend
npm run seed:orders
```

### 2. Upload Excel via API
```bash
curl -X POST http://localhost:5000/api/orders/upload-excel \
  -F "file=@sample-orders.xlsx"
```

### 3. Programmatic Usage
```typescript
import { OrderExcelReader } from './utils/orderExcelReader';

const reader = new OrderExcelReader();
const orders = await reader.readAndConvertOrders('path/to/excel.xlsx');
```

## API Endpoints

- `GET /api/orders` - Get all orders
- `GET /api/orders/:orderNo` - Get specific order
- `POST /api/orders/upload-excel` - Upload Excel file to import orders

## Type Definition
Orders are stored with the following structure (defined in `packages/shared/src/types/order.ts`):
- Order details (orderNo, storeName, revenue, etc.)
- Order items array (SKU, volume, gift status)
- Financial details (costs, fees, profit/loss)
- Timestamps (order, confirm, release, update, completed)
- Order status