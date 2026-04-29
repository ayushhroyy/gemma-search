#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const chatRoute = path.join(__dirname, '..', 'app', 'api', 'chat', 'route.ts');
const localModelsRoute = path.join(__dirname, '..', 'app', 'api', 'local-models', 'route.ts');

function setRuntime(runtime) {
  const files = [
    { file: chatRoute, name: 'chat route' },
    { file: localModelsRoute, name: 'local-models route' }
  ];

  files.forEach(({ file, name }) => {
    let content = fs.readFileSync(file, 'utf8');
    const current = content.match(/export const runtime = "(edge|nodejs)"/)?.[1];

    if (current !== runtime) {
      content = content.replace(
        /export const runtime = "(edge|nodejs)"/,
        `export const runtime = "${runtime}"`
      );
      fs.writeFileSync(file, content);
      console.log(`✅ ${name}: ${current} → ${runtime}`);
    } else {
      console.log(`✓ ${name}: already ${runtime}`);
    }
  });
}

const mode = process.argv[2];

if (mode === 'node' || mode === 'nodejs') {
  console.log('\n🔧 Switching to Node.js Runtime (for local models)\n');
  setRuntime('nodejs');
  console.log('\n✨ Done! Now run: npm run dev\n');
  console.log('⚠️  Remember to switch back to edge before deploying!\n');
} else if (mode === 'edge') {
  console.log('\n🌐 Switching to Edge Runtime (for Cloudflare Pages)\n');
  setRuntime('edge');
  console.log('\n✨ Done! Ready for deployment\n');
} else {
  console.log('\n📖 Usage:\n');
  console.log('  node scripts/toggle-runtime.js node   # Switch to Node.js (local models)');
  console.log('  node scripts/toggle-runtime.js edge   # Switch to Edge (Cloudflare)\n');
  console.log('Or add to package.json scripts:\n');
  console.log('  "dev:local": "node scripts/toggle-runtime.js node && npm run dev"');
  console.log('  "dev:edge": "node scripts/toggle-runtime.js edge && npm run dev"\n');
}
