import { Buffer } from 'buffer';
import assert from './assert-polyfill';
import crypto from 'crypto-browserify';

// @ts-ignore
window.Buffer = Buffer;
// @ts-ignore
window.global = window;

if (typeof window !== 'undefined') {
  const win = window as any;
  if (!win.crypto) {
    win.crypto = crypto;
  } else {
    if (!win.crypto.createHash) {
      win.crypto.createHash = crypto.createHash;
    }
    if (!win.crypto.randomBytes) {
      win.crypto.randomBytes = crypto.randomBytes;
    }
  }
}

// @ts-ignore
window.Module = window.Module || {};
// @ts-ignore
globalThis.Module = window.Module;

// @ts-ignore
window.process = {
  env: {
    NODE_ENV: 'development',
  },
  nextTick: (cb: any) => setTimeout(cb, 0),
  browser: true,
  version: '',
  argv: [],
} as any;

// BigInt JSON serialization polyfill
if (typeof BigInt !== 'undefined' && !(BigInt.prototype as any).toJSON) {
  (BigInt.prototype as any).toJSON = function () {
    return this.toString();
  };
}
