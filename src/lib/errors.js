function httpError(statusCode, message, code = "bad_request", details = undefined) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  if (details !== undefined) error.details = details;
  return error;
}

function clientError(message, code = "bad_request") {
  return httpError(400, message, code);
}

module.exports = {
  httpError,
  clientError,
};
