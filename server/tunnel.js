/**
 * Starts the MIRApp server AND exposes it via localtunnel.
 * Run with: node tunnel.js
 * Copy the printed URL into mira-app/constants/api.ts
 */
const { spawn } = require('child_process');
const localtunnel = require('localtunnel');

const PORT = process.env.PORT || 3000;

// Start the Express server as a child process
const server = spawn('node', ['index.js'], { stdio: 'inherit', env: process.env });

server.on('exit', (code) => process.exit(code ?? 0));

// Wait a moment for the server to bind, then open the tunnel
setTimeout(async () => {
  try {
    const tunnel = await localtunnel({ port: Number(PORT) });

    console.log('\n============================================');
    console.log('  MIRApp tunnel URL (copy into constants/api.ts):');
    console.log(`  ${tunnel.url}`);
    console.log('============================================\n');

    tunnel.on('close', () => {
      console.log('Tunnel closed');
      process.exit(0);
    });

    tunnel.on('error', (err) => {
      console.error('Tunnel error:', err.message);
    });
  } catch (err) {
    console.error('Failed to open tunnel:', err.message);
    console.log('Run the server without tunnel: node index.js');
  }
}, 2000);

process.on('SIGINT', () => {
  server.kill();
  process.exit(0);
});
