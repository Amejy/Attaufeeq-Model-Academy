import ExcelJS from 'exceljs';
import fs from 'node:fs';
import path from 'node:path';

const columns = [
  { header: 'fullName', key: 'fullName', width: 24 },
  { header: 'classId', key: 'classId', width: 18 },
  { header: 'studentEmail', key: 'studentEmail', width: 32 },
  { header: 'guardianName', key: 'guardianName', width: 24 },
  { header: 'guardianPhone', key: 'guardianPhone', width: 18 },
  { header: 'guardianEmail', key: 'guardianEmail', width: 32 },
  { header: 'className', key: 'className', width: 14 },
  { header: 'arm', key: 'arm', width: 8 },
  { header: 'institution', key: 'institution', width: 30 }
];

const rows = [
  {
    fullName: '',
    classId: '',
    studentEmail: '',
    guardianName: '',
    guardianPhone: '',
    guardianEmail: '',
    className: '',
    arm: '',
    institution: ''
  }
];

const outputPath = path.resolve('scripts', 'bulk_students_template.xlsx');
const workbook = new ExcelJS.Workbook();
const worksheet = workbook.addWorksheet('Students');
worksheet.columns = columns;
worksheet.addRows(rows);
await workbook.xlsx.writeFile(outputPath);

if (!fs.existsSync(outputPath)) {
  throw new Error('Failed to create Excel template.');
}

console.log(`Excel template created at ${outputPath}`);
