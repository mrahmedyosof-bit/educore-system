const fs = require('fs');
const c = fs.readFileSync('components/FinanceTab.tsx', 'utf8');
const lines = c.split('\n');
let braceCount = 0;
for(let i=0; i<lines.length; i++) {
  const line = lines[i];
  for(let ch of line) {
    if(ch === '{') braceCount++;
    if(ch === '}') {
      braceCount--;
      if(braceCount < 0) {
        console.log('Negative at line', i+1, ':', lines[i].trim());
        break;
      }
    }
  }
}
console.log('Final braceCount:', braceCount);