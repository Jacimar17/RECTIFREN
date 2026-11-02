function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  error.isOperational = true;
  return error;
}

module.exports = httpError;
