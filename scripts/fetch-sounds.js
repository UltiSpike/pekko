#!/usr/bin/env node

/**
 * Fetch mechanical keyboard sounds from multiple sources
 * This script tries several methods to get real switch sounds
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const SOUNDS_DIR = 'assets/sounds';

const switches = [
  { id: 'gateron-red', name: 'Gateron Red', desc: 'Linear switch' },
  { id: 'holy-panda', name: 'Holy Panda', desc: 'Tactile switch' },
  { id: 'alps-blue', name: 'Alps Blue', desc: 'Clicky switch' },
  { id: 'cream', name: 'NK Cream', desc: 'Linear switch' }
];

// Sample sources (these are examples - Freesound requires auth)
const SAMPLE_SOURCES = {
  'gateron-red': {
    keydown: 'https://freesound.org/data/previews/404/404298_8206994-lq.mp3',
    keyup: 'https://freesound.org/data/previews/570/570755_1383323-lq.mp3'
  },
  'holy-panda': {
    keydown: 'https://freesound.org/data/previews/537/537244_1005321-lq.mp3',
    keyup: 'https://freesound.org/data/previews/570/570755_1383323-lq.mp3'
  },
  'alps-blue': {
    keydown: 'https://freesound.org/data/previews/537/537244_1005321-lq.mp3',
    keyup: 'https://freesound.org/data/previews/570/570755_1383323-lq.mp3'
  },
  'cream': {
    keydown: 'https://freesound.org/data/previews/404/404298_8206994-lq.mp3',
    keyup: 'https://freesound.org/data/previews/570/570755_1383323-lq.mp3'
  }
};

function downloadFile(url, outputPath) {
  return new Promise((resolve, reject) => {
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const file = fs.createWriteStream(outputPath);

    https.get(url, { timeout: 10000 }, (response) => {
      if (response.statusCode === 200) {
        response.pipe(file);
        file.on('finish', () => {
          file.close();
          resolve(outputPath);
        });
      } else {
        reject(new Error(`HTTP ${response.statusCode}`));
      }
    }).on('error', (err) => {
      fs.unlink(outputPath, () => {});
      reject(err);
    });
  });
}

async function main() {
  console.log('🎵 Keeby Sound Fetcher');
  console.log('======================\n');

  console.log('⚠️  注意: Freesound 资源需要登录获取。');
  console.log('推荐方案:\n');

  console.log('方案 1️⃣ : Freesound.org (5分钟)');
  console.log('--------');
  console.log('1. 访问: https://freesound.org');
  console.log('2. 登录 (免费注册)');
  console.log('3. 搜索并下载:');

  switches.forEach(sw => {
    console.log(`   • "${sw.name} mechanical keyboard switch sound"`);
  });

  console.log('4. 保存为 WAV，放入: assets/sounds/{switch}/keydown.wav');
  console.log('5. 重启应用 - 自动加载新音效\n');

  console.log('方案 2️⃣ : 自己录制 (10分钟)');
  console.log('--------');
  console.log('1. 用手机录制 5-10 秒敲键盘声');
  console.log('2. 编辑软件（GarageBand/Audacity）:');
  console.log('   - 分离按下声音 (keydown.wav, 60-120ms)');
  console.log('   - 分离释放声音 (keyup.wav, 40-80ms)');
  console.log('3. 导出为 WAV/OGG');
  console.log('4. 放入 assets/sounds/{switch}/ 目录\n');

  console.log('方案 3️⃣ : 使用在线工具');
  console.log('--------');
  console.log('KeyboardSounds.net: https://keyboardsounds.net/');
  console.log('- 已有预制的轴体声音');
  console.log('- 可直接下载 OGG 文件\n');

  console.log('方案 4️⃣ : Mechvibes 开源项目');
  console.log('--------');
  console.log('GitHub: https://github.com/hainguyents13/mechvibes');
  console.log('- 包含完整的开源音效包');
  console.log('- 可提取并转换为 WAV/OGG\n');

  console.log('📁 当前音效目录:');
  console.log(`${SOUNDS_DIR}/`);
  switches.forEach(sw => {
    const downPath = path.join(SOUNDS_DIR, sw.id, 'keydown.wav');
    const exists = fs.existsSync(downPath) ? '✅' : '❌';
    console.log(`  ${exists} ${sw.id}/ (需要: keydown.wav, keyup.wav)`);
  });

  console.log('\n✨ 下载完成后，重启应用即可听到新音效！');
  console.log('💡 提示: 如需帮助转换格式，可用:');
  console.log('  ffmpeg -i input.mp3 -q:a 8 output.ogg\n');
}

main().catch(console.error);
