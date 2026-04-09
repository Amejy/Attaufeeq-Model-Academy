import { Buffer } from 'node:buffer';
import net from 'node:net';
import tls from 'node:tls';
import { env } from '../config/env.js';

const NOOP_RESULT = { enabled: false };
let client = null;
let warningLogged = false;

function shouldUseRedis() {
  return env.rateLimitStore === 'redis' || env.cacheStore === 'redis';
}

function encodeCommand(args = []) {
  const parts = [`*${args.length}\r\n`];
  args.forEach((arg) => {
    const value = String(arg ?? '');
    parts.push(`$${Buffer.byteLength(value)}\r\n${value}\r\n`);
  });
  return parts.join('');
}

function readLine(buffer, offset) {
  const end = buffer.indexOf('\r\n', offset);
  if (end === -1) return null;
  return { line: buffer.toString('utf8', offset, end), next: end + 2 };
}

function parseResp(buffer, offset = 0) {
  if (offset >= buffer.length) return null;

  const type = String.fromCharCode(buffer[offset]);
  if (type === '+' || type === '-' || type === ':') {
    const line = readLine(buffer, offset + 1);
    if (!line) return null;

    if (type === '+') return { value: line.line, next: line.next };
    if (type === ':') return { value: Number(line.line), next: line.next };
    return { error: new Error(line.line), next: line.next };
  }

  if (type === '$') {
    const line = readLine(buffer, offset + 1);
    if (!line) return null;
    const length = Number(line.line);
    if (length === -1) return { value: null, next: line.next };
    const end = line.next + length;
    if (buffer.length < end + 2) return null;
    return {
      value: buffer.toString('utf8', line.next, end),
      next: end + 2
    };
  }

  if (type === '*') {
    const line = readLine(buffer, offset + 1);
    if (!line) return null;
    const count = Number(line.line);
    if (count === -1) return { value: null, next: line.next };

    const values = [];
    let cursor = line.next;
    for (let index = 0; index < count; index += 1) {
      const parsed = parseResp(buffer, cursor);
      if (!parsed) return null;
      if (parsed.error) return parsed;
      values.push(parsed.value);
      cursor = parsed.next;
    }

    return { value: values, next: cursor };
  }

  throw new Error(`Unsupported Redis response type: ${type}`);
}

class SimpleRedisClient {
  constructor(config) {
    this.config = config;
    this.socket = null;
    this.buffer = Buffer.alloc(0);
    this.pending = [];
    this.connectPromise = null;
    this.connected = false;
  }

  async connect() {
    if (this.connected) return;
    if (this.connectPromise) {
      await this.connectPromise;
      return;
    }

    this.connectPromise = new Promise((resolve, reject) => {
      const options = {
        host: this.config.host,
        port: this.config.port
      };
      const socket = this.config.tls
        ? tls.connect(options)
        : net.createConnection(options);

      let settled = false;

      const fail = (error) => {
        if (!settled) {
          settled = true;
          reject(error);
        }
        this.handleDisconnect(error);
      };

      socket.on('error', fail);
      socket.on('close', () => this.handleDisconnect(new Error('Redis connection closed.')));
      socket.on('data', (chunk) => this.handleData(chunk));

      socket.on(this.config.tls ? 'secureConnect' : 'connect', async () => {
        try {
          this.socket = socket;
          if (this.config.password) {
            await this.sendCommandInternal(['AUTH', this.config.password]);
          }
          if (Number(this.config.db || 0) > 0) {
            await this.sendCommandInternal(['SELECT', String(this.config.db)]);
          }
          await this.sendCommandInternal(['PING']);
          this.connected = true;
          if (!settled) {
            settled = true;
            resolve();
          }
        } catch (error) {
          fail(error);
        }
      });
    }).finally(() => {
      this.connectPromise = null;
    });

    await this.connectPromise;
  }

  handleData(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);

    while (this.pending.length) {
      const parsed = parseResp(this.buffer);
      if (!parsed) break;

      this.buffer = this.buffer.subarray(parsed.next);
      const next = this.pending.shift();
      if (!next) continue;

      if (parsed.error) {
        next.reject(parsed.error);
        continue;
      }

      next.resolve(parsed.value);
    }
  }

  handleDisconnect(error) {
    this.connected = false;
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.destroy();
      this.socket = null;
    }

    while (this.pending.length) {
      const pending = this.pending.shift();
      pending?.reject(error);
    }
  }

  async sendCommandInternal(args) {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Redis socket is not connected.'));
        return;
      }

      this.pending.push({ resolve, reject });
      this.socket.write(encodeCommand(args), 'utf8', (error) => {
        if (error) {
          const pending = this.pending.pop();
          pending?.reject(error);
        }
      });
    });
  }

  async sendCommand(args) {
    await this.connect();
    return this.sendCommandInternal(args);
  }

  async close() {
    if (!this.socket) return;
    try {
      await this.sendCommandInternal(['QUIT']);
    } catch {
      // Ignore quit failures during shutdown.
    }
    this.handleDisconnect(new Error('Redis client closed.'));
  }
}

function buildConfig() {
  return {
    host: env.redisHost,
    port: env.redisPort,
    password: env.redisPassword,
    db: env.redisDb,
    tls: env.redisTls
  };
}

function logDevWarning(message) {
  if (env.isProduction || warningLogged) return;
  warningLogged = true;
  console.warn(message);
}

export async function getRedisClient() {
  if (!shouldUseRedis()) return null;
  if (client) return client;

  client = new SimpleRedisClient(buildConfig());
  try {
    await client.connect();
    return client;
  } catch (error) {
    client = null;
    if (!env.isProduction) {
      logDevWarning(`Redis unavailable; distributed rate limiting disabled in development. ${error.message || error}`);
      return null;
    }
    throw error;
  }
}

export async function testRedisConnection() {
  const redis = await getRedisClient();
  if (!redis) return NOOP_RESULT;
  const response = await redis.sendCommand(['PING']);
  return { enabled: true, response };
}

export async function evalRedis(script, keys = [], args = []) {
  const redis = await getRedisClient();
  if (!redis) return null;

  const command = ['EVAL', script, String(keys.length), ...keys, ...args.map((value) => String(value))];
  return redis.sendCommand(command);
}

export async function sendRedisCommand(args = []) {
  const redis = await getRedisClient();
  if (!redis) return null;
  return redis.sendCommand(args);
}

export async function closeRedisClient() {
  if (!client) return;
  const active = client;
  client = null;
  await active.close();
}
