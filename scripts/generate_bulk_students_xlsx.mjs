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
    fullName: 'Yunusa Ahmad',
    classId: '',
    studentEmail: 'yunusaahmad738@gmail.com',
    guardianName: 'Ahmad Yunusa',
    guardianPhone: '+2348010000001',
    guardianEmail: 'babababa120190@gmail.com',
    className: 'JSS 1',
    arm: 'A',
    institution: 'ATTAUFEEQ Model Academy'
  },
  {
    fullName: 'Umar Harun',
    classId: '',
    studentEmail: 'umarharun781@gmail.com',
    guardianName: 'Harun Umar',
    guardianPhone: '+2348010000002',
    guardianEmail: 'musahhh803@gmail.com',
    className: 'JSS 1',
    arm: 'A',
    institution: 'ATTAUFEEQ Model Academy'
  },
  {
    fullName: 'Harun Amina',
    classId: '',
    studentEmail: 'harunamina489@gmail.com',
    guardianName: 'Amina Harun',
    guardianPhone: '+2348010000003',
    guardianEmail: 'auwallmdm@gmail.com',
    className: 'JSS 1',
    arm: 'A',
    institution: 'ATTAUFEEQ Model Academy'
  },
  {
    fullName: 'Sultan Mdm',
    classId: '',
    studentEmail: 'sultanmdm729@gmail.com',
    guardianName: 'Mdm Sultan',
    guardianPhone: '+2348010000004',
    guardianEmail: 'mahma11pq@gmail.com',
    className: 'SS 1',
    arm: 'A',
    institution: 'ATTAUFEEQ Model Academy'
  },
  {
    fullName: 'Babab Ade',
    classId: '',
    studentEmail: 'babab19012@gmail.com',
    guardianName: 'Ade Babab',
    guardianPhone: '+2348010000005',
    guardianEmail: 'dyarima905@gmail.com',
    className: 'SS 1',
    arm: 'A',
    institution: 'ATTAUFEEQ Model Academy'
  },
  {
    fullName: 'Daud Ayarima',
    classId: '',
    studentEmail: 'daudayarima585@gmail.com',
    guardianName: 'Ayarima Daud',
    guardianPhone: '+2348010000006',
    guardianEmail: 'daudayarima682@gmail.com',
    className: 'SS 1',
    arm: 'A',
    institution: 'ATTAUFEEQ Model Academy'
  }
];

const outputPath = path.resolve('scripts', 'bulk_students_test.xlsx');
const workbook = new ExcelJS.Workbook();
const worksheet = workbook.addWorksheet('Students');
worksheet.columns = columns;
worksheet.addRows(rows);
await workbook.xlsx.writeFile(outputPath);

if (!fs.existsSync(outputPath)) {
  throw new Error('Failed to create Excel file.');
}

console.log(`Excel file created at ${outputPath}`);
