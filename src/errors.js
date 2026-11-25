'use strict';

class AppError extends Error {
  constructor(code, status, message) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.status = status;
  }
}

class ValidationError extends AppError {
  constructor(fields) {
    const summary = fields.map((f) => `${f.field}: ${f.message}`).join('; ');
    super('VALIDATION_ERROR', 422, summary);
    this.fields = fields;
  }
}

class InvalidIdError extends AppError {
  constructor(message = 'Student ID must be a positive integer') {
    super('INVALID_ID', 400, message);
  }
}

class NotFoundError extends AppError {
  constructor(id) {
    super('NOT_FOUND', 404, `Student ${id} not found`);
  }
}

class ConflictError extends AppError {
  constructor(message = 'Email already in use') {
    super('CONFLICT', 409, message);
  }
}

class InvalidJsonError extends AppError {
  constructor() {
    super('INVALID_JSON', 400, 'Request body must be a valid JSON object');
  }
}

class PayloadTooLargeError extends AppError {
  constructor() {
    super('PAYLOAD_TOO_LARGE', 413, 'Request body exceeds the 10 KB limit');
  }
}

class UnsupportedMediaTypeError extends AppError {
  constructor() {
    super('UNSUPPORTED_MEDIA_TYPE', 415, 'Content-Type must be application/json');
  }
}

class RouteNotFoundError extends AppError {
  constructor() {
    super('ROUTE_NOT_FOUND', 404, 'Route not found');
  }
}

class MethodNotAllowedError extends AppError {
  constructor() {
    super('METHOD_NOT_ALLOWED', 405, 'Method not allowed for this route');
  }
}

module.exports = {
  AppError,
  ValidationError,
  InvalidIdError,
  NotFoundError,
  ConflictError,
  InvalidJsonError,
  PayloadTooLargeError,
  UnsupportedMediaTypeError,
  RouteNotFoundError,
  MethodNotAllowedError,
};
