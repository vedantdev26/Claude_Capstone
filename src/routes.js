'use strict';

const {
  AppError,
  InvalidIdError,
  InvalidJsonError,
  PayloadTooLargeError,
  UnsupportedMediaTypeError,
  RouteNotFoundError,
  MethodNotAllowedError,
} = require('./errors');
const { parseId } = require('./validation');

const ROUTE_RE = /^\/students(?:\/([^/]*))?\/?$/;
const MAX_BODY_BYTES = 10 * 1024;

class ClientAbortedError extends Error {}

function sendJson(res, status, payload, headers = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
    ...headers,
  });
  res.end(body);
}

function requireJsonContentType(req) {
  const type = String(req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
  if (type !== 'application/json') throw new UnsupportedMediaTypeError();
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const declared = Number(req.headers['content-length']);
    if (declared > MAX_BODY_BYTES) {
      reject(new PayloadTooLargeError());
      return;
    }
    const chunks = [];
    let size = 0;
    const onData = (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        req.off('data', onData);
        reject(new PayloadTooLargeError());
        return;
      }
      chunks.push(chunk);
    };
    req.on('data', onData);
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
    req.on('close', () => reject(new ClientAbortedError()));
  });
}

async function readJsonObject(req) {
  const raw = (await readBody(req)).toString('utf8');
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new InvalidJsonError();
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new InvalidJsonError();
  }
  return parsed;
}

function createHandler(service, { log = console.log, logError = console.error } = {}) {
  async function dispatch(req, res) {
    const path = req.url.split('?')[0];
    const match = ROUTE_RE.exec(path);
    if (!match) throw new RouteNotFoundError();
    const segment = match[1];
    const method = req.method;

    if (segment === undefined || segment === '') {
      if (method === 'GET') return sendJson(res, 200, service.list());
      if (method === 'POST') {
        requireJsonContentType(req);
        const created = service.create(await readJsonObject(req));
        return sendJson(res, 201, created, { Location: `/students/${created.id}` });
      }
      if (method === 'PUT' || method === 'DELETE') throw new InvalidIdError('Student ID is required');
      throw new MethodNotAllowedError();
    }

    if (method !== 'GET' && method !== 'PUT' && method !== 'DELETE') throw new MethodNotAllowedError();
    const id = parseId(segment);

    if (method === 'GET') return sendJson(res, 200, service.get(id));
    if (method === 'DELETE') {
      service.remove(id);
      res.writeHead(204);
      return res.end();
    }
    requireJsonContentType(req);
    return sendJson(res, 200, service.update(id, await readJsonObject(req)));
  }

  return async function handler(req, res) {
    let errorCode = '-';
    res.on('finish', () => {
      log(`${req.method} ${req.url.split('?')[0]} ${res.statusCode} ${errorCode}`);
    });
    try {
      await dispatch(req, res);
    } catch (err) {
      if (err instanceof ClientAbortedError || (req.aborted && err?.code === 'ECONNRESET')) {
        errorCode = 'CLIENT_ABORTED';
        return;
      }
      if (err instanceof AppError) {
        errorCode = err.code;
        const error = { code: err.code, message: err.message };
        if (err.fields) error.fields = err.fields;
        const tooLarge = err instanceof PayloadTooLargeError;
        sendJson(res, err.status, { error }, tooLarge ? { Connection: 'close' } : {});
        if (tooLarge) res.once('finish', () => req.destroy());
      } else {
        errorCode = 'INTERNAL_ERROR';
        logError('Unexpected error:', err);
        if (!res.headersSent) {
          sendJson(res, 500, { error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
        }
      }
    }
  };
}

module.exports = { createHandler };
