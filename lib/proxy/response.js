const { Transform } = require('stream');

const INTERNAL_SERVER_ERROR = 500;

function jsonParse(str) {
  try {
    const value = JSON.parse(str);
    return value;
  } catch (err) {
    return {};
  }
}

function apigwProxyResponse(str) {
  const output = jsonParse(str);

  if (output.statusCode) {
    return output;
  }

  if (Object.keys(output).length > 0) {
    return {
      statusCode: INTERNAL_SERVER_ERROR,
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(output),
    };
  }

  return {
    statusCode: INTERNAL_SERVER_ERROR,
    headers: {
      'content-type': 'text/plain',
    },
    body: str,
  };
}

class ApiGatewayProxyResponse extends Transform {
  constructor(res) {
    super();
    this.res = res;
    this.body = '';
  }

  _transform(chunk, _, callback) {
    this.body += chunk.toString();
    callback();
  }

  _flush(done) {
    const { statusCode, headers, body } = apigwProxyResponse(this.body);
    this.res.writeHead(statusCode, headers);
    this.push(body, 'utf8');
    done();
  }
}

module.exports = ApiGatewayProxyResponse;
