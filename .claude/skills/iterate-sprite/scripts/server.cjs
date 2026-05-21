'use strict';
const crypto = require('crypto');
const http = require('http');
const fs = require('fs');
const path = require('path');

// --- args ----------------------------------------------------------------
const args = {};
for (let i = 2; i < process.argv.length; i += 2)
    args[process.argv[i].replace(/^--/, '')] = process.argv[i + 1];

const SESSION_DIR = args['session-dir'];
const SCRIPTS_DIR = args['scripts-dir'] || __dirname;
const _ownerPidNum = Number(args['owner-pid']);
const OWNER_PID   = Number.isFinite(_ownerPidNum) ? _ownerPidNum : null;
const HOST        = args.host || '127.0.0.1';
const PORT        = args.port ? Number(args.port)
                              : (49152 + (Math.random() * 16383 | 0));

if (!SESSION_DIR) { console.error('--session-dir required'); process.exit(1); }
const CONTENT_DIR = path.join(SESSION_DIR, 'content');
const STATE_DIR   = path.join(SESSION_DIR, 'state');
for (const d of [CONTENT_DIR, STATE_DIR])
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });

// --- WebSocket framing (RFC 6455 minimal) --------------------------------
const WS_MAGIC = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const wsAccept = k => crypto.createHash('sha1').update(k + WS_MAGIC).digest('base64');

function wsEncode(opcode, payload) {
    const len = payload.length;
    let header;
    if (len < 126)      { header = Buffer.alloc(2);  header[1] = len; }
    else if (len < 65536) { header = Buffer.alloc(4);  header[1] = 126; header.writeUInt16BE(len, 2); }
    else                  { header = Buffer.alloc(10); header[1] = 127; header.writeBigUInt64BE(BigInt(len), 2); }
    header[0] = 0x80 | opcode;
    return Buffer.concat([header, payload]);
}

function wsDecode(buf) {
    if (buf.length < 2) return null;
    const opcode = buf[0] & 0x0F;
    const masked = (buf[1] & 0x80) !== 0;
    if (!masked) throw new Error('client frames must be masked');
    let len = buf[1] & 0x7F, off = 2;
    if (len === 126)      { if (buf.length < 4)  return null; len = buf.readUInt16BE(2); off = 4; }
    else if (len === 127) { if (buf.length < 10) return null; len = Number(buf.readBigUInt64BE(2)); off = 10; }
    if (buf.length < off + 4 + len) return null;
    const mask = buf.slice(off, off + 4);
    const data = Buffer.alloc(len);
    for (let i = 0; i < len; i++) data[i] = buf[off + 4 + i] ^ mask[i % 4];
    return { opcode, payload: data, consumed: off + 4 + len };
}

// --- file helpers --------------------------------------------------------
const MIME = { '.html':'text/html', '.css':'text/css', '.js':'application/javascript' };
const WAITING_PAGE = `<!doctype html><meta charset="utf-8"><title>iterate-sprite</title>
<style>body{font-family:system-ui;color:#aaa;background:#111;padding:2em;margin:0}</style>
<p>Waiting for the agent to push a round...</p>
<script>const ws=new WebSocket('ws://'+location.host);
ws.onmessage=e=>{try{if(JSON.parse(e.data).type==='reload')location.reload()}catch(_){}};</script>`;

function newestRound() {
    if (!fs.existsSync(CONTENT_DIR)) return null;
    const files = fs.readdirSync(CONTENT_DIR).filter(f => f.endsWith('.html'));
    if (!files.length) return null;
    return files
        .map(f => ({ f, t: fs.statSync(path.join(CONTENT_DIR, f)).mtimeMs }))
        .sort((a, b) => b.t - a.t)[0].f;
}

// --- activity tracking --------------------------------------------------
let lastActivity = Date.now();
const IDLE_MS = 30 * 60 * 1000;
const touch = () => { lastActivity = Date.now(); };

// --- HTTP routing -------------------------------------------------------
const server = http.createServer((req, res) => {
    touch();
    try {
        if (req.method !== 'GET') { res.writeHead(404); return res.end(); }
        if (req.url === '/' || req.url === '/index.html') {
            const f = newestRound();
            res.writeHead(200, { 'content-type':'text/html; charset=utf-8' });
            return res.end(f ? fs.readFileSync(path.join(CONTENT_DIR, f)) : WAITING_PAGE);
        }
        if (req.url.startsWith('/scripts/')) {
            const name = path.basename(req.url.slice(9));
            const p = path.join(SCRIPTS_DIR, name);
            if (!fs.existsSync(p)) { res.writeHead(404); return res.end(); }
            res.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' });
            return res.end(fs.readFileSync(p));
        }
        res.writeHead(404); res.end();
    } catch (e) {
        if (!res.headersSent) res.writeHead(500);
        res.end();
    }
});

// --- WebSocket ---------------------------------------------------------
const clients = new Set();
server.on('upgrade', (req, sock) => {
    const key = req.headers['sec-websocket-key'];
    if (!key) return sock.destroy();
    sock.write('HTTP/1.1 101 Switching Protocols\r\n' +
               'Upgrade: websocket\r\nConnection: Upgrade\r\n' +
               'Sec-WebSocket-Accept: ' + wsAccept(key) + '\r\n\r\n');
    clients.add(sock); touch();
    let buf = Buffer.alloc(0);
    sock.on('data', chunk => {
        buf = Buffer.concat([buf, chunk]);
        while (buf.length) {
            let f;
            try { f = wsDecode(buf); }
            catch (e) { clients.delete(sock); return sock.end(); }
            if (!f) break;
            buf = buf.slice(f.consumed);
            if (f.opcode === 0x01) {          // text
                touch();
                try {
                    const ev = JSON.parse(f.payload.toString());
                    fs.appendFileSync(
                        path.join(STATE_DIR, 'events'),
                        JSON.stringify({ ...ev, timestamp: Date.now() }) + '\n');
                } catch (_) {}
            } else if (f.opcode === 0x08) {   // close
                clients.delete(sock); return sock.end();
            } else if (f.opcode === 0x09) {   // ping
                sock.write(wsEncode(0x0A, f.payload));
            }
        }
    });
    sock.on('close', () => clients.delete(sock));
    sock.on('error', () => clients.delete(sock));
});

function broadcast(msg) {
    const frame = wsEncode(0x01, Buffer.from(JSON.stringify(msg)));
    for (const s of clients) { try { s.write(frame); } catch { clients.delete(s); } }
}

// --- watch content dir for new rounds ----------------------------------
const debounce = new Map();
fs.watch(CONTENT_DIR, (event, name) => {
    if (!name || !name.endsWith('.html')) return;
    touch();
    if (debounce.has(name)) clearTimeout(debounce.get(name));
    debounce.set(name, setTimeout(() => {
        debounce.delete(name);
        broadcast({ type: 'reload' });
    }, 100));
});

// --- lifecycle ---------------------------------------------------------
function ownerAlive() {
    if (!OWNER_PID) return true;
    try { process.kill(OWNER_PID, 0); return true; }
    catch (e) { return e.code === 'EPERM'; }
}

let _shuttingDown = false;
function shutdown(reason) {
    if (_shuttingDown) return;
    _shuttingDown = true;
    const infoFile = path.join(STATE_DIR, 'server-info');
    if (fs.existsSync(infoFile)) fs.unlinkSync(infoFile);
    fs.writeFileSync(
        path.join(STATE_DIR, 'server-stopped'),
        JSON.stringify({ reason, timestamp: Date.now() }) + '\n');
    server.close(() => process.exit(0));
}

const lifecycle = setInterval(() => {
    if (!ownerAlive()) shutdown('owner exited');
    else if (Date.now() - lastActivity > IDLE_MS) shutdown('idle');
}, 60 * 1000);
lifecycle.unref();

server.listen(PORT, HOST, () => {
    const urlHost = HOST === '0.0.0.0' ? 'localhost' : HOST;
    const info = {
        type: 'server-started',
        port: PORT,
        url: `http://${urlHost}:${PORT}`,
        session_dir: SESSION_DIR
    };
    console.log(JSON.stringify(info));
    fs.writeFileSync(path.join(STATE_DIR, 'server-info'), JSON.stringify(info) + '\n');
});
