const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { CreateTableCommand, PutItemCommand } = require('@aws-sdk/client-dynamodb');
const songs = require('./songs.json');

const table = 'Music';

const client = new DynamoDBClient({
  region: 'localhost',
  endpoint: 'http://localhost:8000',
  credentials: {
    accessKeyId: 'somelocalkeyid',
    secretAccessKey: 'somelocalaccesskey',
  },
});

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

createTable()
  .then(console.log)
  .then(seedTable)
  .then(console.log)
  .catch(console.error);
