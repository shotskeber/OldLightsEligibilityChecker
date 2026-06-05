import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const srcDir = path.join(rootDir, 'src');
const distDir = path.join(rootDir, 'dist');

const publicConfig = {
  BUNGIE_CLIENT_ID: process.env.NEXT_PUBLIC_BUNGIE_CLIENT_ID ?? '',
  BUNGIE_API_KEY: process.env.NEXT_PUBLIC_BUNGIE_API_KEY ?? '',
  APP_URL: process.env.NEXT_PUBLIC_APP_URL ?? '',
};

await rm(distDir, { recursive: true, force: true });
await mkdir(distDir, { recursive: true });
await cp(path.join(srcDir, 'assets'), path.join(distDir, 'assets'), { recursive: true });
await cp(path.join(srcDir, 'lib'), path.join(distDir, 'lib'), { recursive: true });
await cp(path.join(srcDir, 'app.js'), path.join(distDir, 'app.js'));
await cp(path.join(srcDir, 'styles.css'), path.join(distDir, 'styles.css'));

const htmlTemplate = await readFile(path.join(srcDir, 'index.html'), 'utf8');
await writeFile(path.join(distDir, 'index.html'), htmlTemplate, 'utf8');

const configScript = `window.__APP_CONFIG__ = ${JSON.stringify(publicConfig, null, 2)};\n`;
await writeFile(path.join(distDir, 'config.js'), configScript, 'utf8');
