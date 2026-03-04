const fs = require('fs');
const path = require('path');

const meta = {
  version: Date.now().toString(),
  buildTime: new Date().toISOString()
};

fs.writeFileSync(
  path.resolve(__dirname, '../public/meta.json'),
  JSON.stringify(meta, null, 2)
);

console.log(`Generated meta.json: version=${meta.version}`);
