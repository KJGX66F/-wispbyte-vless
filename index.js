const http = require('http');
const https = require('https');
const net = require('net');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const zlib = require('zlib');

const PORT = process.env.SERVER_PORT || process.env.PORT || 3000;
const LOCAL_PORT = 10086;
const WS_PATH = '/api/v2/telemetry/stream_8f91a';

const MASK_NAME = 'npm-system-worker';
const sbPath = path.join(__dirname, MASK_NAME);
const cfPath = path.join(__dirname, 'cf-tunnel');

const SB_URLS = [
  "https://github.com/SagerNet/sing-box/releases/download/v1.10.7/sing-box-1.10.7-linux-amd64.tar.gz",
  "https://github.moeyy.xyz/https://github.com/SagerNet/sing-box/releases/download/v1.10.7/sing-box-1.10.7-linux-amd64.tar.gz"
];

const CF_URL = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64";

function fetchBuffer(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchBuffer(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP 状态码: ${res.statusCode}`));
      }
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.setTimeout(60000, () => { req.destroy(); reject(new Error('请求超时')); });
  });
}

function extractTar(tarBuffer, outputPath) {
  let offset = 0;
  while (offset < tarBuffer.length - 512) {
    const header = tarBuffer.slice(offset, offset + 512);
    const name = header.toString('utf8', 0, 100).replace(/\0/g, '').trim();
    if (!name) break;
    const sizeOctal = header.toString('utf8', 124, 136).replace(/\0/g, '').trim();
    const size = parseInt(sizeOctal, 8) || 0;
    const typeflag = header[156];
    offset += 512;
    if ((typeflag === 48 || typeflag === 0) && name.endsWith('/sing-box') && size > 5000000) {
      fs.writeFileSync(outputPath, tarBuffer.slice(offset, offset + size));
      return true;
    }
    offset += Math.ceil(size / 512) * 512;
  }
  return false;
}

async function prepareBinaries() {
  // 1. 准备 sing-box
  if (!fs.existsSync(sbPath) || fs.statSync(sbPath).size < 10000000) {
    console.log('[+] 正在下载 sing-box 内核...');
    for (const url of SB_URLS) {
      try {
        const gz = await fetchBuffer(url);
        const tar = zlib.gunzipSync(gz);
        if (extractTar(tar, sbPath)) break;
      } catch (e) {}
    }
  }
  try { fs.chmodSync(sbPath, '755'); } catch (e) {}

  // 2. 准备 cloudflared 临时隧道工具
  if (!fs.existsSync(cfPath) || fs.statSync(cfPath).size < 10000000) {
    console.log('[+] 正在下载 Cloudflare 隧道组件...');
    try {
      const buf = await fetchBuffer(CF_URL);
      fs.writeFileSync(cfPath, buf);
    } catch (e) {
      console.log('[!] 隧道组件下载失败:', e.message);
    }
  }
  try { fs.chmodSync(cfPath, '755'); } catch (e) {}
}

function startServices() {
  if (fs.existsSync(sbPath)) {
    console.log('[+] 启动后台 sing-box 进程...');
    const sb = spawn(sbPath, ['run', '-c', 'config.json']);
    sb.stdout.on('data', d => console.log(`[sb] ${d.toString().trim()}`));
    sb.stderr.on('data', d => console.log(`[sb-err] ${d.toString().trim()}`));
  }

  if (fs.existsSync(cfPath)) {
    console.log('[+] 启动 Cloudflare 临时隧道 (Quick Tunnel)...');
    const cf = spawn(cfPath, ['tunnel', '--url', `http://127.0.0.1:${PORT}`]);
    cf.stdout.on('data', d => console.log(`[cf] ${d.toString().trim()}`));
    cf.stderr.on('data', d => {
      const msg = d.toString();
      console.log(`[cf] ${msg.trim()}`);
      // 自动抓取 Cloudflare 生成的临时域名
      const match = msg.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
      if (match) {
        console.log(`\n========================================`);
        console.log(`[★] 您的专属临时加速域名已生成: ${match[0]}`);
        console.log(`========================================\n`);
      }
    });
  }
}

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('System Service Online');
});

server.on('upgrade', (req, socket, head) => {
  if (req.url.startsWith(WS_PATH)) {
    const proxySocket = net.connect(LOCAL_PORT, '127.0.0.1', () => {
      let rawHeader = `${req.method} ${req.url} HTTP/${req.httpVersion}\r\n`;
      for (let i = 0; i < req.rawHeaders.length; i += 2) {
        rawHeader += `${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}\r\n`;
      }
      rawHeader += '\r\n';
      proxySocket.write(rawHeader);
      if (head && head.length > 0) proxySocket.write(head);
      socket.pipe(proxySocket);
      proxySocket.pipe(socket);
    });
    proxySocket.on('error', () => socket.destroy());
    socket.on('error', () => proxySocket.destroy());
  } else {
    socket.destroy();
  }
});

server.listen(PORT, '0.0.0.0', async () => {
  console.log(`[+] 主服务已监听端口 ${PORT}`);
  await prepareBinaries();
  startServices();
});
