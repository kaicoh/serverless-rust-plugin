const { URL } = require('url');
const { Transform } = require('stream');

class ApiGatewayProxyRequest extends Transform {
  // req: http.IncommingMessage
  constructor(route, req) {
    super();

    const url = new URL(req.url, `http://${req.headers.host}`);

    const json = JSON.stringify({
      resource: '/',
      path: url.pathname,
      httpMethod: req.method,
      headers: req.headers,
      multiValueHeaders: req.headersDistinct,
      queryStringParameters: route.getQueryParams(req),
      multiValueQueryStringParameters: route.getQueryParams(req, { multi: true }),
      pathParameters: route.getPathParams(req),
      stageVariables: {},
      requestContext: {
        identity: {},
        authorizer: {},
        httpMethod: req.method,
        requestTimeEpoch: new Date().getTime(),
      },
      isBase64Encoded: false,
    });

    // Push without last '}'
    this.push(json.slice(-json.length, -1), 'utf8');
    this.body = '';
  }

  _transform(chunk, _, callback) {
    this.body += chunk.toString();
    callback();
  }

  _flush(done) {
    const rest = this.body.length > 0 ? `,"body":${JSON.stringify(this.body)}}` : '}';
    this.push(rest, 'utf8');
    done();
  }
}

module.exports = ApiGatewayProxyRequest;
