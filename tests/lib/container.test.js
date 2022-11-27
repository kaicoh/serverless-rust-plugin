const Container = require('../../lib/container');
const utils = require('../../lib/utils');

jest.mock('../../lib/utils');

describe('Container', () => {
  beforeEach(() => {
    utils.spawn = jest.fn(() => Promise.resolve({ stdout: '[{"foo":"bar"}]' }));
  });

  describe('constructor', () => {
    it('sets empty object to state when called without any arguments', () => {
      const container = new Container();
      expect(container._state).toEqual({});
    });
  });

  describe('static method: "get"', () => {
    it('calls "utils.spawn" function', async () => {
      await Container.get('some');
      expect(utils.spawn).toHaveBeenCalledWith('docker', ['inspect', 'some']);
    });

    it('resolves an Container instance using what utils.spawn returns', async () => {
      const result = await Container.get('some');
      expect(result).toBeInstanceOf(Container);
      expect(result._state).toEqual({ foo: 'bar' });
    });

    it('resolves an Container instance using empty state when spawn return nothing', async () => {
      utils.spawn = jest.fn(() => Promise.resolve({ stdout: '' }));
      const result = await Container.get('some');
      expect(result).toBeInstanceOf(Container);
      expect(result._state).toEqual({});
    });
  });

  describe('property: "name"', () => {
    it('returns from state.Name', () => {
      const container = new Container({ Name: 'test' });
      expect(container.name).toEqual('test');
    });
  });

  describe('property: "exists"', () => {
    it('returns true from state is not empty', () => {
      const container = new Container({ foo: 'test' });
      expect(container.exists).toBe(true);
    });

    it('returns false from state is empty', () => {
      const container = new Container({});
      expect(container.exists).toBe(false);
    });
  });

  describe('property: "status"', () => {
    it('returns from state.State.Status', () => {
      const container = new Container({ State: { Status: 'Happy' } });
      expect(container.status).toEqual('Happy');
    });
  });

  describe('property: "isRunning"', () => {
    it('returns from state.State.Running', () => {
      const container = new Container({ State: { Running: false } });
      expect(container.isRunning).toBe(false);
    });
  });

  describe('method: format', () => {
    it('returns "not exist" status is the container doesn\'t exist', () => {
      const container = new Container({});
      expect(container.format('sample')).toEqual(['sample', '', 'not exist', '']);
    });

    it('returns container state', () => {
      const state = {
        Name: 'existing sample',
        State: { Status: 'Unhappy' },
        NetworkSettings: {
          Ports: {
            '8080/tcp': [{
              HostIp: '0.0.0.0',
              HostPort: '8000',
            }, {
              HostIp: '127.0.0.1',
              HostPort: '9000',
            }],
            '5000/tcp': [{
              HostIp: '1.1.1.1',
              HostPort: '3000',
            }],
          },
        },
      };
      const container = new Container(state);
      expect(container.format('func')).toEqual([
        'func',
        'existing sample',
        'Unhappy',
        '0.0.0.0:8000 -> 8080/tcp, 127.0.0.1:9000 -> 8080/tcp, 1.1.1.1:3000 -> 5000/tcp',
      ]);
    });
  });
});
