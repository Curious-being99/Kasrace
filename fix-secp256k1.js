import fs from 'fs';
import path from 'path';
import https from 'https';

const baseDir = process.cwd();
const indexJsPath = path.join(baseDir, 'node_modules/secp256k1-wasm/index.js');
const httpJsPath = path.join(baseDir, 'node_modules/secp256k1-wasm/http/secp256k1.js');
const wasmPath = path.join(baseDir, 'node_modules/secp256k1-wasm/http/secp256k1.wasm');

try {
  // 1. Ensure secp256k1-wasm/index.js exists
  if (!fs.existsSync(indexJsPath)) {
    fs.mkdirSync(path.dirname(indexJsPath), { recursive: true });
    const indexJsContent = `// ensure only a single instance of secp256k1 exists
if(!global.__secp256k1__)
	global.__secp256k1__ = require('./http/secp256k1');
module.exports = global.__secp256k1__;
`;
    fs.writeFileSync(indexJsPath, indexJsContent);
    console.log('[fix-secp256k1] Created secp256k1-wasm/index.js');
  }
} catch (err) {
  console.warn('[fix-secp256k1] Skipping step 1:', err.message);
}

// 2. Embed WASM binary into secp256k1.js directly via wasmBinary
if (fs.existsSync(httpJsPath) && fs.existsSync(wasmPath)) {
  let jsCode = fs.readFileSync(httpJsPath, 'utf8');

  // Revert old dataURI replace if present
  jsCode = jsCode.replace(/var wasmBinaryFile = 'data:application\/octet-stream;base64,[^']+'\;/g, "var wasmBinaryFile = 'secp256k1.wasm';");

  if (!jsCode.includes('// __INLINED_WASM_BINARY__')) {
    const wasmBuffer = fs.readFileSync(wasmPath);
    const b64 = wasmBuffer.toString('base64');
    const target = "var wasmBinary;if (Module['wasmBinary']) wasmBinary = Module['wasmBinary'];";
    const replacement = target + `
// __INLINED_WASM_BINARY__
if (!wasmBinary) {
  var _b64 = "${b64}";
  var _str = typeof atob === 'function' ? atob(_b64) : Buffer.from(_b64, 'base64').toString('binary');
  var _buf = new Uint8Array(_str.length);
  for (var _i = 0; _i < _str.length; _i++) {
    _buf[_i] = _str.charCodeAt(_i);
  }
  wasmBinary = _buf.buffer;
}
`;

    if (jsCode.includes(target)) {
      jsCode = jsCode.replace(target, replacement);
      fs.writeFileSync(httpJsPath, jsCode);
      console.log('[fix-secp256k1] Inlined WASM binary into secp256k1.js');
    } else {
      console.warn('[fix-secp256k1] Target string not found in secp256k1.js');
    }
  }
}

// 3. Copy valid wasm binary to public and dist folders as fallback
if (fs.existsSync(wasmPath)) {
  const targets = [
    path.join(baseDir, 'public/secp256k1.wasm'),
    path.join(baseDir, 'public/assets/secp256k1.wasm'),
    path.join(baseDir, 'dist/secp256k1.wasm'),
    path.join(baseDir, 'dist/assets/secp256k1.wasm'),
  ];
  for (const dst of targets) {
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(wasmPath, dst);
  }
}

// 4. Sync music files to public and dist directories
const rootMusic = path.join(baseDir, 'racing_music.mp3');
const publicMusic = path.join(baseDir, 'public/racing_music.mp3');
const publicNewMusic = path.join(baseDir, 'public/new_racing_music.mp3');
const distMusic = path.join(baseDir, 'dist/racing_music.mp3');
const distNewMusic = path.join(baseDir, 'dist/new_racing_music.mp3');

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        downloadFile(response.headers.location, dest).then(resolve).catch(reject);
        return;
      }
      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode}`));
        return;
      }
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve();
      });
    }).on('error', (err) => {
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
}

async function downloadMusicIfNeeded() {
  if (fs.existsSync(rootMusic) && fs.statSync(rootMusic).size > 100000) {
    return;
  }
  if (fs.existsSync(publicMusic) && fs.statSync(publicMusic).size > 100000) {
    fs.copyFileSync(publicMusic, rootMusic);
    return;
  }
  
  console.log('[fix-secp256k1] Racing music is missing or corrupt. Attempting to download fallback...');
  const fallbackUrls = [
    'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3',
    'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3',
    'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3'
  ];
  
  for (const url of fallbackUrls) {
    try {
      await downloadFile(url, rootMusic);
      if (fs.existsSync(rootMusic) && fs.statSync(rootMusic).size > 100000) {
        console.log(`[fix-secp256k1] Successfully downloaded fallback music from: ${url}`);
        return;
      }
    } catch (err) {
      console.warn(`[fix-secp256k1] Failed to download from ${url}: ${err.message}`);
    }
  }
}

async function syncMusic() {
  await downloadMusicIfNeeded();

  if (fs.existsSync(rootMusic)) {
    fs.mkdirSync(path.dirname(publicMusic), { recursive: true });
    fs.copyFileSync(rootMusic, publicMusic);
    fs.copyFileSync(rootMusic, publicNewMusic);
    if (fs.existsSync(path.join(baseDir, 'dist'))) {
      fs.copyFileSync(rootMusic, distMusic);
      fs.copyFileSync(rootMusic, distNewMusic);
    }
    console.log('[fix-secp256k1] Copied racing_music.mp3 to public and dist directories');
  } else if (fs.existsSync(publicMusic)) {
    fs.copyFileSync(publicMusic, rootMusic);
    fs.copyFileSync(publicMusic, publicNewMusic);
    if (fs.existsSync(path.join(baseDir, 'dist'))) {
      fs.copyFileSync(publicMusic, distMusic);
      fs.copyFileSync(publicMusic, distNewMusic);
    }
  }
}

syncMusic().catch(console.error);
