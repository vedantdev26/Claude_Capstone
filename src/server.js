'use strict';

const http = require('node:http');
const path = require('node:path');
const { createStudentRepository } = require('./studentRepository');
const { createStudentService } = require('./studentService');
const { createHandler } = require('./routes');

function createServer({ filePath, writer, log, logError } = {}) {
  const repository = createStudentRepository({ filePath, writer });
  const service = createStudentService(repository);
  return http.createServer(createHandler(service, { log, logError }));
}

if (require.main === module) {
  const fail = (message) => {
    console.error(`Startup failed: ${message}`);
    process.exit(1);
  };
  const rawPort = process.env.PORT || '3000';
  const port = /^\d{1,5}$/.test(rawPort) ? Number(rawPort) : NaN;
  if (!(port >= 0 && port <= 65535)) fail('PORT must be an integer from 0 to 65535');
  const host = process.env.HOST || '127.0.0.1';
  const filePath = process.env.DATA_FILE || path.join(__dirname, '..', 'data', 'students.json');

  let server;
  try {
    server = createServer({ filePath });
  } catch (err) {
    fail(err.message);
  }
  server.on('error', (err) => fail(err.message));
  server.listen(port, host, () => {
    const { address, port: boundPort } = server.address();
    console.log(`Listening on http://${address}:${boundPort}`);
  });
}

module.exports = { createServer };
