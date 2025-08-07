import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';

export function readExcelFile(filePath: string) {
  const file = fs.readFileSync(filePath);
  const workbook = XLSX.read(file, { type: 'buffer' });
  
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  
  const data = XLSX.utils.sheet_to_json(worksheet, { 
    header: 1,
    raw: false,
    dateNF: 'yyyy-mm-dd'
  });
  
  return data;
}

if (require.main === module) {
  const excelPath = path.join(__dirname, '../../../../sample-orders.xlsx');
  const data = readExcelFile(excelPath);
  
  console.log('Excel file structure:');
  console.log('Headers:', data[0]);
  console.log('First few rows:');
  data.slice(0, 5).forEach((row, index) => {
    console.log(`Row ${index}:`, row);
  });
  console.log('Total rows:', data.length);
}