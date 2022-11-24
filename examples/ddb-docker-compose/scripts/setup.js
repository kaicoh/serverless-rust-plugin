const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { CreateTableCommand, PutItemCommand, ListTablesCommand } = require('@aws-sdk/client-dynamodb');
const songs = require('./songs.json');

const table = 'Music';
const SECOND = 1000;

const client = new DynamoDBClient({
  region: 'localhost',
  endpoint: 'http://localhost:8000',
  credentials: {
    accessKeyId: 'somelocalkeyid',
    secretAccessKey: 'somelocalaccesskey',
  },
});

function sleep(sec) {
  return new Promise((resolve) => {
    setTimeout(() => { resolve(); }, sec * SECOND);
  });
}

function healthCheck(retry) {
  const command = new ListTablesCommand({});

  return client
    .send(command)
    .catch((err) => {
      if (retry > 0) {
        console.log('health check fails. retry after 1 second.');
        return sleep(1).then(() => healthCheck(retry - 1));
      }

      throw err;
    });
}

function createTable() {
  const command = new CreateTableCommand({
    TableName: table,
    AttributeDefinitions: [
      {
        AttributeName: 'Artist',
        AttributeType: 'S',
      },
      {
        AttributeName: 'SongTitle',
        AttributeType: 'S',
      },
    ],
    KeySchema: [
      {
        AttributeName: 'Artist',
        KeyType: 'HASH',
      },
      {
        AttributeName: 'SongTitle',
        KeyType: 'RANGE',
      },
    ],
    BillingMode: 'PAY_PER_REQUEST',
  });

  return client.send(command);
}

function seedTable() {
  const commands = songs.map((song) => new PutItemCommand({
    TableName: table,
    Item: song,
  }));

  return Promise.all(commands.map((command) => client.send(command)));
}

healthCheck(30)
  .then(createTable)
  .then(console.log)
  .then(seedTable)
  .then(console.log)
  .catch(console.error);
