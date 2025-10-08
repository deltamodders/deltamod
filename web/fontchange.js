// replace-font.js
const fs = require('fs');
const path = require('path');

// Root directory (current directory)
const rootDir = __dirname;

// Recursive function to process directories
function processDirectory(dir) {
  const files = fs.readdirSync(dir);

  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      // Recurse into subdirectory
      processDirectory(filePath);
    } else if (filePath.endsWith('.css')) {
      // Read and modify CSS file
      let content = fs.readFileSync(filePath, 'utf8');

      if (content.includes('Manrope')) {
        const updated = content.replace(/Manrope/g, 'var(--secondary-font)');
        fs.writeFileSync(filePath, updated, 'utf8');
        console.log(`✅ Updated font in: ${filePath}`);
      }
    }
  }
}

processDirectory(rootDir);
console.log('🎉 Font replacement complete.');
