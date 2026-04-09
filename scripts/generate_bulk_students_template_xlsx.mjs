import writeXlsxFile from 'write-excel-file/node';
import fs from 'node:fs';
import path from 'node:path';

const schema = [
  { column: 'fullName', type: String, value: (row) => row.fullName },
  { column: 'classId', type: String, value: (row) => row.classId },
  { column: 'studentEmail', type: String, value: (row) => row.studentEmail },
  { column: 'guardianName', type: String, value: (row) => row.guardianName },
  { column: 'guardianPhone', type: String, value: (row) => row.guardianPhone },
  { column: 'guardianEmail', type: String, value: (row) => row.guardianEmail },
  { column: 'className', type: String, value: (row) => row.className },
  { column: 'arm', type: String, value: (row) => row.arm },
  { column: 'institution', type: String, value: (row) => row.institution }
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
await writeXlsxFile(rows, { schema, filePath: outputPath });

if (!fs.existsSync(outputPath)) {
  throw new Error('Failed to create Excel template.');
}

console.log(`Excel template created at ${outputPath}`);
