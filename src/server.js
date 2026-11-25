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
  const port = process.env.PORT || 3000;
  const host = process.env.HOST || '127.0.0.1';
  const filePath = process.env.DATA_FILE || path.join(__dirname, '..', 'data', 'students.json');

  let server;
  try {
    server = createServer({ filePath });
  } catch (err) {
    console.error(`Startup failed: ${err.message}`);
    process.exit(1);
  }
  server.listen(Number(port), host, () => {
    const { address, port: boundPort } = server.address();
    console.log(`Listening on http://${address}:${boundPort}`);
  });
}

module.exports = { createServer };
