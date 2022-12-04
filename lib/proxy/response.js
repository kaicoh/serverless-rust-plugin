function jsonParse(str) {
  try {
    const value = JSON.parse(str);
    return value;
  } catch (err) {
    return {};
  }
}

const ApiGatewayProxyResponse = {
  parse(output) {
    const result = jsonParse(output);
    if (result.statusCode) {
      return result;
    }

    if (Object.keys(result).length > 0) {
      return {
        statusCode: 500,
        headers: { 'content-type': 'application/json' },
        body: output,
      };
    }

    return {
      statusCode: 500,
      headers: { 'content-type': 'text/plain' },
      body: output,
    };
  },
};

module.exports = ApiGatewayProxyResponse;
