#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function generateWav(filename, frequency, duration) {
  const sampleRate = 44100;
  const numSamples = Math.floor(sampleRate * duration);
  const dataSize = numSamples * 2;
  const fileSize = 44 + dataSize;
  const buf = Buffer.alloc(fileSize);

  // RIFF header
  buf.write('RIFF', 0);
  buf.writeUInt32LE(fileSize - 8, 4);
  buf.write('WAVE', 8);

  // fmt chunk
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);       // chunk size
  buf.writeUInt16LE(1, 20);        // PCM
  buf.writeUInt16LE(1, 22);        // mono
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28); // byte rate
  buf.writeUInt16LE(2, 32);        // block align
  buf.writeUInt16LE(16, 34);       // bits per sample

  // data chunk
  buf.write('data', 36);
  buf.writeUInt32LE(dataSize, 40);

  // Generate sine wave with fast attack/decay envelope
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const envelope = Math.exp(-t * 30) * (1 - Math.exp(-t * 500));
    const sample = Math.sin(2 * Math.PI * frequency * t) * 0.5 * envelope;
    buf.writeInt16LE(Math.round(sample * 32767), 44 + i * 2);
  }

  fs.writeFileSync(filename, buf);
  console.log(`  ✓ ${path.relative('.', filename)} (${(fileSize / 1024).toFixed(1)} KB)`);
}

const dir = 'assets/sounds';

console.log('Generating placeholder WAV files...\n');

// Each profile: different frequency + duration for distinct character
generateWav(`${dir}/gateron-red/keydown.wav`, 800, 0.08);
generateWav(`${dir}/gateron-red/keyup.wav`, 1000, 0.04);

generateWav(`${dir}/holy-panda/keydown.wav`, 600, 0.12);
generateWav(`${dir}/holy-panda/keyup.wav`, 900, 0.05);

generateWav(`${dir}/alps-blue/keydown.wav`, 1200, 0.10);
generateWav(`${dir}/alps-blue/keyup.wav`, 1400, 0.04);

generateWav(`${dir}/cream/keydown.wav`, 500, 0.09);
generateWav(`${dir}/cream/keyup.wav`, 700, 0.04);

console.log('\n✅ Done! Replace with real sounds later.');
