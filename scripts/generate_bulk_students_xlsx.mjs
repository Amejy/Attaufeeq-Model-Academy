import writeXlsxFile from 'write-excel-file/node';
import fs from 'node:fs';
import path from 'node:path';

const rows = [
  {
    fullName: 'Yunusa Ahmad',
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
    studentEmail: 'daudayarima585@gmail.com',
    guardianName: 'Ayarima Daud',
    guardianPhone: '+2348010000006',
    guardianEmail: 'daudayarima682@gmail.com',
    className: 'SS 1',
    arm: 'A',
    institution: 'ATTAUFEEQ Model Academy'
  }
];

const schema = [
  { column: 'fullName', type: String, value: (row) => row.fullName },
  { column: 'classId', type: String, value: () => '' },
  { column: 'studentEmail', type: String, value: (row) => row.studentEmail },
  { column: 'guardianName', type: String, value: (row) => row.guardianName },
  { column: 'guardianPhone', type: String, value: (row) => row.guardianPhone },
  { column: 'guardianEmail', type: String, value: (row) => row.guardianEmail },
  { column: 'className', type: String, value: (row) => row.className },
  { column: 'arm', type: String, value: (row) => row.arm },
  { column: 'institution', type: String, value: (row) => row.institution }
];

const outputPath = path.resolve('scripts', 'bulk_students_test.xlsx');
await writeXlsxFile(rows, {
  schema,
  filePath: outputPath
});

if (!fs.existsSync(outputPath)) {
  throw new Error('Failed to create Excel file.');
}

console.log(`Excel file created at ${outputPath}`);
