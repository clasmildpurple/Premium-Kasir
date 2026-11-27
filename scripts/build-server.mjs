import { build } from 'esbuild';
import path from 'node:path';

if (process.env.VERCEL === '1') {
  console.log(
    '[build] Skipping server.js bundle on Vercel (using /api/* serverless functions).'
  );
  process.exit(0);
}

const entryPoint = path.resolve(process.cwd(), 'server.ts');
const outfile = path.resolve(process.cwd(), 'server.js');

await build({
  entryPoints: [entryPoint],
  bundle: true,
  platform: 'node',
  format: 'esm',
  packages: 'external',
  outfile,
});
