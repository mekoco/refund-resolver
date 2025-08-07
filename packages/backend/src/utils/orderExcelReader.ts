import * as XLSX from 'xlsx';
import * as fs from 'fs';
import { Order, OrderItem } from '@packages/shared';

export interface ExcelOrderRow {
  'Order No': string;
  'BigSeller Store Name': string;
  'Order Revenue': string;
  'Merchant SKU': string;
  'Sales Volume': string;
  'Gift': string;
  'Commodity Cost': string;
  'Profit/Loss': string;
  'Profit Rate': string;
  'Product Sales': string;
  'Shipping Fee Paid by Buyer': string;
  'Subsidy for Discount & Promotion': string;
  'Commission Fee': string;
  'Transaction Fee': string;
  'Service Charge': string;
  'Shipping Fee Paid by Seller': string;
  'Marketing Fees': string;
  'Buyer Refund Amount': string;
  'Other Platform Fees': string;
  'Order Time': string;
  'Confirm Time': string;
  'Release Time': string;
  'Update Time': string;
  'Completed Time': string;
  'Order Status': string;
}

export class OrderExcelReader {
  private parseNumber(value: string | undefined): number {
    if (!value || value === '') return 0;
    const cleanValue = value.toString().replace(/,/g, '').replace(/[^\d.-]/g, '');
    const parsed = parseFloat(cleanValue);
    return isNaN(parsed) ? 0 : parsed;
  }

  private parseDate(value: string | undefined): Date | null {
    if (!value || value === '') return null;
    try {
      const date = new Date(value);
      return isNaN(date.getTime()) ? null : date;
    } catch {
      return null;
    }
  }

  private parsePercentage(value: string | undefined): number {
    if (!value || value === '') return 0;
    const cleanValue = value.toString().replace(/%/g, '').replace(/,/g, '');
    const parsed = parseFloat(cleanValue);
    return isNaN(parsed) ? 0 : parsed;
  }

  private parseOrderItems(skus: string | undefined, volumes: string | undefined, gifts: string | undefined): OrderItem[] {
    if (!skus || skus === '') return [];
    
    const skuList = skus.split('\n').map(s => s.trim()).filter(s => s);
    const volumeList = volumes ? volumes.split('\n').map(v => this.parseNumber(v)) : [];
    const giftList = gifts ? gifts.split('\n').map(g => g.trim().toLowerCase() === 'yes') : [];
    
    return skuList.map((sku, index) => ({
      merchantSKU: sku,
      salesVolume: volumeList[index] || 0,
      isGift: giftList[index] || false
    }));
  }

  public readExcelFile(filePath: string): ExcelOrderRow[] {
    const file = fs.readFileSync(filePath);
    const workbook = XLSX.read(file, { type: 'buffer', sheetRows: 1000 });
    
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    const data = XLSX.utils.sheet_to_json<ExcelOrderRow>(worksheet, {
      header: undefined,
      raw: false,
      dateNF: 'dd mmm yyyy HH:mm',
      defval: ''
    });
    
    return data.filter(row => 
      row['Order No'] && 
      row['Order No'] !== 'Order No' && 
      row['Order No'].trim() !== ''
    );
  }

  public convertToOrders(excelRows: ExcelOrderRow[]): Order[] {
    return excelRows.map(row => {
      const order: Order = {
        orderNo: row['Order No'],
        storeName: row['BigSeller Store Name'],
        orderRevenue: this.parseNumber(row['Order Revenue']),
        items: this.parseOrderItems(row['Merchant SKU'], row['Sales Volume'], row['Gift']),
        commodityCost: this.parseNumber(row['Commodity Cost']),
        profitLoss: this.parseNumber(row['Profit/Loss']),
        profitRate: this.parsePercentage(row['Profit Rate']),
        productSales: this.parseNumber(row['Product Sales']),
        shippingFeePaidByBuyer: this.parseNumber(row['Shipping Fee Paid by Buyer']),
        subsidyForDiscountPromotion: this.parseNumber(row['Subsidy for Discount & Promotion']),
        commissionFee: this.parseNumber(row['Commission Fee']),
        transactionFee: this.parseNumber(row['Transaction Fee']),
        serviceCharge: this.parseNumber(row['Service Charge']),
        shippingFeePaidBySeller: this.parseNumber(row['Shipping Fee Paid by Seller']),
        marketingFees: this.parseNumber(row['Marketing Fees']),
        buyerRefundAmount: this.parseNumber(row['Buyer Refund Amount']),
        otherPlatformFees: this.parseNumber(row['Other Platform Fees']),
        orderTime: this.parseDate(row['Order Time']),
        confirmTime: this.parseDate(row['Confirm Time']),
        releaseTime: this.parseDate(row['Release Time']),
        updateTime: this.parseDate(row['Update Time']),
        completedTime: this.parseDate(row['Completed Time']),
        orderStatus: row['Order Status'],
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      return order;
    });
  }

  public async readAndConvertOrders(filePath: string): Promise<Order[]> {
    const excelRows = this.readExcelFile(filePath);
    return this.convertToOrders(excelRows);
  }
}