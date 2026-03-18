/**
 * Minimal static HTTP server for test fixtures.
 * Serves files from tests/fixtures/ at http://localhost:PORT/
 * Supports HTTP Range requests so video elements can seek properly.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const FIXTURES_DIR = path.join(__dirname, 'fixtures');

const MIME = {
  '.html': 'text/html',
  '.js':   'text/javascript',
  '.css':  'text/css',
  '.mp4':  'video/mp4',
  '.webm': 'video/webm',
};

function createServer(port = 0) {
  const server = http.createServer((req, res) => {
    const filePath = path.join(FIXTURES_DIR, req.url === '/' ? '/parent.html' : req.url);
    const ext = path.extname(filePath);
    const contentType = MIME[ext] || 'text/plain';

    let stat;
    try {
      stat = fs.statSync(filePath);
    } catch {
      res.writeHead(404);
      res.end('Not found');
      return;
    }

    const total = stat.size;
    const rangeHeader = req.headers['range'];

    if (rangeHeader) {
      // Handle HTTP Range request (required for video seeking)
      const [, rangeStr] = rangeHeader.split('=');
      const [startStr, endStr] = rangeStr.split('-');
      const start = parseInt(startStr, 10);
      const end = endStr ? parseInt(endStr, 10) : total - 1;
      const chunkSize = end - start + 1;

      res.writeHead(206, {
        'Content-Range':  `bytes ${start}-${end}/${total}`,
        'Accept-Ranges':  'bytes',
        'Content-Length': chunkSize,
        'Content-Type':   contentType,
      });

      const stream = fs.createReadStream(filePath, { start, end });
      stream.pipe(res);
    } else {
      // Full file response — still advertise Range support
      res.writeHead(200, {
        'Content-Length': total,
        'Content-Type':   contentType,
        'Accept-Ranges':  'bytes',
      });
      fs.createReadStream(filePath).pipe(res);
    }
  });

  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => {
      const { port: assignedPort } = server.address();
      resolve({ server, port: assignedPort, url: `http://127.0.0.1:${assignedPort}` });
    });
  });
}

module.exports = { createServer };
