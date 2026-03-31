import 'dotenv/config';
import { autoFixDataIssues } from './src/utils/validation.js';

console.log('🔧 Running data auto-fix...\n');

autoFixDataIssues()
  .then(result => {
    console.log('\n✅ Auto-fix complete!\n');
    console.log('Fixes applied:');
    result.fixes.forEach((fix, index) => {
      console.log(`${index + 1}. ${fix}`);
    });
    console.log(`\nTotal issues fixed: ${result.totalFixed}`);
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Error during auto-fix:', error);
    process.exit(1);
  });
