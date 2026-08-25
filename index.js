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

const URLS = [
  "https://proxy.v2gh.com/https://github.com/SagerNet/sing-box/releases/download/v1.10.7/sing-box-1.10.7-linux-amd64.tar.gz",
  "https://ghproxy.net/https://github.com/SagerNet/sing-box/releases/download/v1.10.7/sing-box-1.10.7-linux-amd64.tar.gz",
  "https://github.moeyy.xyz/https://github.com/SagerNet/sing-box/releases/download/v1.10.7/sing-box-1.10.7-linux-amd64.tar.gz"
];

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
    req.setTimeout(60000, () => {
      req.destroy();
      reject(new Error('请求超时'));
    });
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
      const fileData = tarBuffer.slice(offset, offset + size);
      fs.writeFileSync(outputPath, fileData);
      return true;
    }
    offset += Math.ceil(size / 512) * 512;
  }
  return false;
}

async function downloadAndExtract() {
  if (fs.existsSync(sbPath)) {
    if (fs.statSync(sbPath).size > 10000000) {
      try { fs.chmodSync(sbPath, '755'); } catch (e) {}
      console.log('[+] 伪装内核存在且文件完整，直接启动...');
      return true;
    } else {
      console.log('[!] 正在清除上一次损坏的残留文件...');
      try { fs.unlinkSync(sbPath); } catch (e) {}
    }
  }

  for (let i = 0; i < URLS.length; i++) {
    console.log(`[+] 正在下载组件 [${i + 1}/${URLS.length}]...`);
    try {
      const gzBuffer = await fetchBuffer(URLS[i]);
      console.log(`[+] 内存下载成功 (${(gzBuffer.length / 1024 / 1024).toFixed(2)} MB)，正在精确解压...`);
      const tarBuffer = zlib.gunzipSync(gzBuffer);
      const success = extractTar(tarBuffer, sbPath);
      if (success && fs.existsSync(sbPath) && fs.statSync(sbPath).size > 10000000) {
        try { fs.chmodSync(sbPath, '755'); } catch (e) {}
        console.log(`[★] 伪装内核解压成功！文件大小: ${(fs.statSync(sbPath).size / 1024 / 1024).toFixed(2)} MB`);
        return true;
      }
    } catch (err) {
      console.log(`[!] 节点 [${i + 1}] 失败: ${err.message}`);
    }
  }
  return false;
}

function startService() {
  if (!fs.existsSync(sbPath)) return;
  console.log('[+] 启动后台伪装进程 (npm-system-worker)...');
  const sb = spawn(sbPath, ['run', '-c', 'config.json']);

  sb.stdout.on('data', d => console.log(`[system] ${d.toString().trim()}`));
  sb.stderr.on('data', d => console.log(`[system-err] ${d.toString().trim()}`));
  sb.on('exit', code => console.log(`[system] 进程退出，代码: ${code}`));
}

const server = http.createServer((req, res) => {
  if (req.url === '/' || req.url === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<!DOCTYPE html><html><head><title>Telemetry Service</title></head><body style="background:#0f172a;color:#fff;text-align:center;padding-top:20%"><h1>Node.js System Service Running</h1></body></html>`);
  } else {
    res.writeHead(404);
    res.end('404 Not Found');
  }
});

// 修正：还原 WebSocket 初始请求头并转发给 sing-box 本地监听端口
server.on('upgrade', (req, socket, head) => {
  if (req.url.startsWith(WS_PATH)) {
    const proxySocket = net.connect(LOCAL_PORT, '127.0.0.1', () => {
      let rawHeader = `${req.method} ${req.url} HTTP/${req.httpVersion}\r\n`;
      for (let i = 0; i < req.rawHeaders.length; i += 2) {
        rawHeader += `${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}\r\n`;
      }
      rawHeader += '\r\n';

      proxySocket.write(rawHeader);
      if (head && head.length > 0) {
        proxySocket.write(head);
      }

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
  console.log(`[+] Web 伪装服务已监听端口 ${PORT}`);
  const ok = await downloadAndExtract();
  if (ok) startService();
  else console.log('[!] 依赖获取失败，请再次 Restart');
});

setInterval(() => {
  http.get(`http://127.0.0.1:${PORT}/`, () => {}).on('error', () => {});
}, 180000);
