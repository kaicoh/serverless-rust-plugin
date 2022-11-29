const Container = require('../../lib/container');
const utils = require('../../lib/utils');

jest.mock('../../lib/utils');

describe('Container', () => {
  const args = (state) => ({
    name: 'test',
    config: {},
    state,
  });

  beforeEach(() => {
    utils.spawn = jest.fn(() => Promise.resolve({ stdout: '[{"foo":"bar"}]' }));
    utils.getFreePort = jest.fn(() => Promise.resolve(5555));
    utils.color = {
      blue: jest.fn(() => 'blue'),
      green: jest.fn(() => 'green'),
      yellow: jest.fn(() => 'yellow'),
      red: jest.fn(() => 'red'),
      default: jest.fn(() => 'default'),
    };
  });

  describe('constructor', () => {
    it('sets empty object to state when called without state', () => {
      const container = new Container({});
      expect(container._state).toEqual({});
    });
  });

  describe('static method: "get"', () => {
    const config = { containerName: 'some' };
    it('calls "utils.spawn" function', async () => {
      await Container.get({ config });
      expect(utils.spawn).toHaveBeenCalledWith('docker', ['inspect', 'some']);
    });

    it('resolves an Container instance using what utils.spawn returns', async () => {
      const result = await Container.get({ config });
      expect(result).toBeInstanceOf(Container);
      expect(result._state).toEqual({ foo: 'bar' });
    });

    it('resolves an Container instance using empty state when spawn return nothing', async () => {
      utils.spawn = jest.fn(() => Promise.resolve({ stdout: '' }));
      const result = await Container.get({ config });
      expect(result).toBeInstanceOf(Container);
      expect(result._state).toEqual({});
    });
  });

  describe('statice method: tableRow', () => {
    it('returns "not exist" status is the container doesn\'t exist', () => {
      const container = new Container(args({}));
      expect(Container.tableRow(container)).toEqual(['test', '', 'not exist', '']);
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
      const container = new Container(args(state));
      container.displayStatus = jest.fn(() => 'Decorated status');

      expect(Container.tableRow(container)).toEqual([
        'test',
        'existing sample',
        'Decorated status',
        '0.0.0.0:8000 -> 8080/tcp, 127.0.0.1:9000 -> 8080/tcp, 1.1.1.1:3000 -> 5000/tcp',
      ]);
    });
  });

  describe('method: "format"', () => {
    it('returns formated string from the inner state', () => {
      const container = new Container(args({ foo: 'bar', bar: 'baz' }));
      expect(container.format()).toEqual('{\n\t"foo": "bar",\n\t"bar": "baz"\n}');
    });
  });

  describe('property: "name"', () => {
    it('returns from state.Name', () => {
      const container = new Container(args({ Name: '/test' }));
      expect(container.name).toEqual('test');
    });

    it('returns from config.containerName is the state doesn\'t have Name', () => {
      const container = new Container({
        name: 'foo',
        config: { containerName: 'from container name' },
        state: {},
      });
      expect(container.name).toEqual('from container name');
    });
  });

  describe('property: "funcName"', () => {
    it('returns from self._funcName', () => {
      const container = new Container(args({}));
      expect(container.funcName).toEqual('test');
    });
  });

  describe('property: "exists"', () => {
    it('returns true from state is not empty', () => {
      const container = new Container(args({ foo: 'test' }));
      expect(container.exists).toBe(true);
    });

    it('returns false from state is empty', () => {
      const container = new Container(args({}));
      expect(container.exists).toBe(false);
    });
  });

  describe('property: "status"', () => {
    it('returns from state.State.Status', () => {
      const container = new Container(args({ State: { Status: 'Happy' } }));
      expect(container.status).toEqual('Happy');
    });
  });

  describe('property: "isRunning"', () => {
    it('returns from state.State.Running', () => {
      const container = new Container(args({ State: { Running: false } }));
      expect(container.isRunning).toBe(false);
    });
  });

  describe('method: "hostPortsTo"', () => {
    it('returns host ports binding to the container port', () => {
      const state = {
        NetworkSettings: {
          Ports: {
            '8080/tcp': [{
              HostPort: '8000',
            }],
            '5000/tcp': [{
              HostPort: '3000',
            }, {
              HostPort: 'not a number',
            }, {
              HostPort: '4000',
            }],
          },
        },
      };
      const container = new Container(args(state));
      expect(container.hostPortsTo(5000)).toEqual([3000, 4000]);
    });
  });

  describe('method: "displayStatus"', () => {
    const table = [
      ['blue', 'created'],
      ['blue', 'restarting'],
      ['green', 'running'],
      ['yellow', 'paused'],
      ['red', 'removing'],
      ['red', 'exit'],
      ['red', 'dead'],
      ['default', 'other'],
    ];

    it.each(table)('returns what color.%s returns when status is %s', (color, status) => {
      const container = new Container(args({ State: { Status: status } }));
      expect(container.displayStatus()).toEqual(color);
      expect(utils.color[color]).toHaveBeenCalledWith(status);
    });
  });

  describe('method: "start"', () => {
    let container;
    let options;

    describe('when the container is running', () => {
      beforeEach(() => {
        container = new Container(args({ State: { Running: true } }));
      });

      it('returns a promise resolves with self', async () => {
        await expect(container.start(options)).resolves.toBe(container);
      });

      it('doesn\'t execute "docker run"', async () => {
        await container.start(options);
        expect(utils.spawn).not.toHaveBeenCalled();
      });
    });

    describe('when the container isn\'t running', () => {
      const spawnOption = {
        stdio: ['pipe', 'pipe', process.stderr],
        encoding: 'utf-8',
      };

      beforeEach(() => {
        options = {
          artifact: 'some/path/bootstrap',
          containerName: 'test container',
          port: 1234,
          env: { envA: 'varA', envB: 'varB with space' },
        };

        container = new Container(args({ State: { Running: false } }));
        container.refresh = jest.fn(() => 'refreshed output');
      });

      it('returns a promise resolves with what self.refresh returns', async () => {
        await expect(container.start(options)).resolves.toEqual('refreshed output');
      });

      it('executes "docker run" command with args: "-i -d --rm"', async () => {
        await container.start(options);
        expect(utils.spawn).toHaveBeenCalledWith(
          'docker',
          expect.arrayContaining(['run', '-i', '-d', '--rm']),
          spawnOption,
        );
      });

      it('executes "docker run" mounting artifact directory', async () => {
        await container.start(options);
        expect(utils.spawn).toHaveBeenCalledWith(
          'docker',
          expect.arrayContaining(['-v', 'some/path:/var/runtime']),
          spawnOption,
        );
      });

      it('executes "docker run" binding options.port if it isn\'t 0', async () => {
        await container.start(options);
        expect(utils.spawn).toHaveBeenCalledWith(
          'docker',
          expect.arrayContaining(['-p', '1234:8080']),
          spawnOption,
        );
      });

      it('executes "docker run" binding port from utils.getFreePort if the option.port is 0', async () => {
        options.port = 0;
        await container.start(options);
        expect(utils.spawn).toHaveBeenCalledWith(
          'docker',
          expect.arrayContaining(['-p', '5555:8080']),
          spawnOption,
        );
      });

      it('executes "docker run" passing environment variables from options.env', async () => {
        await container.start(options);
        expect(utils.spawn).toHaveBeenCalledWith(
          'docker',
          // eslint-disable-next-line no-useless-escape
          expect.arrayContaining(['--env', 'envA=varA', '--env', 'envB=varB\ with\ space']),
          spawnOption,
        );
      });

      it('executes "docker run" without --env-file option if options.envFile isn\'t given', async () => {
        await container.start(options);
        expect(utils.spawn).toHaveBeenCalledWith(
          'docker',
          expect.not.arrayContaining(['--env-file']),
          spawnOption,
        );
      });

      it('executes "docker run" with --env-file option if options.envFile is given', async () => {
        options.envFile = 'some/path/env';
        await container.start(options);
        expect(utils.spawn).toHaveBeenCalledWith(
          'docker',
          expect.arrayContaining(['--env-file', 'some/path/env']),
          spawnOption,
        );
      });

      it('executes "docker run" with --name from options.containerName', async () => {
        await container.start(options);
        expect(utils.spawn).toHaveBeenCalledWith(
          'docker',
          expect.arrayContaining(['--name', 'test container']),
          spawnOption,
        );
      });

      it('executes "docker run" setting arm64 platform from options.arch is "arm64"', async () => {
        options.arch = 'arm64';
        await container.start(options);
        expect(utils.spawn).toHaveBeenCalledWith(
          'docker',
          expect.arrayContaining(['--platform', 'linux/arm64/v8']),
          spawnOption,
        );
      });

      it('executes "docker run" setting amd64 platform from options.arch is "x86_64"', async () => {
        options.arch = 'x86_64';
        await container.start(options);
        expect(utils.spawn).toHaveBeenCalledWith(
          'docker',
          expect.arrayContaining(['--platform', 'linux/amd64']),
          spawnOption,
        );
      });

      it('executes "docker run" with additional args if options.dockerArgs is given', async () => {
        options.dockerArgs = '--some args for docker';
        await container.start(options);
        expect(utils.spawn).toHaveBeenCalledWith(
          'docker',
          expect.arrayContaining(['--some', 'args', 'for', 'docker']),
          spawnOption,
        );
      });

      it('executes "docker run" using image for arm64 platform from options.arch is "arm64"', async () => {
        options.arch = 'arm64';
        await container.start(options);
        expect(utils.spawn).toHaveBeenCalledWith(
          'docker',
          expect.arrayContaining(['public.ecr.aws/lambda/provided:al2-arm64']),
          spawnOption,
        );
      });

      it('executes "docker run" using image for x86_64 platform from options.arch is "x86_64"', async () => {
        options.arch = 'x86_64';
        await container.start(options);
        expect(utils.spawn).toHaveBeenCalledWith(
          'docker',
          expect.arrayContaining(['public.ecr.aws/lambda/provided:al2-x86_64']),
          spawnOption,
        );
      });

      it('executes "docker run" with binary name from options.artifact', async () => {
        await container.start(options);
        expect(utils.spawn).toHaveBeenCalledWith(
          'docker',
          expect.arrayContaining(['bootstrap']),
          spawnOption,
        );
      });
    });
  });

  describe('method: "stop"', () => {
    let container;

    describe('when the container is running', () => {
      const spawnOption = {
        stdio: ['pipe', 'pipe', process.stderr],
        encoding: 'utf-8',
      };

      beforeEach(() => {
        container = new Container({
          name: 'test',
          config: { containerName: 'StopTest' },
          state: { State: { Running: true } },
        });

        container.refresh = jest.fn(() => 'refreshed output');
      });

      it('returns a promise resolves with what self.refresh returns', async () => {
        await expect(container.stop()).resolves.toEqual('refreshed output');
      });

      it('executes "docker stop" command', async () => {
        await container.stop();
        expect(utils.spawn).toHaveBeenCalledWith(
          'docker',
          expect.arrayContaining(['stop', 'StopTest']),
          spawnOption,
        );
      });
    });

    describe('when the container isn\'t running', () => {
      beforeEach(() => {
        container = new Container(args({ State: { Running: false } }));
      });

      it('returns a promise resolves with self', async () => {
        await expect(container.stop()).resolves.toBe(container);
      });

      it('doesn\'t execute "docker stop"', async () => {
        await container.stop();
        expect(utils.spawn).not.toHaveBeenCalled();
      });
    });
  });

  describe('method: refresh', () => {
    it('returns what Container.get returns', async () => {
      const container = new Container(args({}));
      const result = await container.refresh();
      expect(result).toBeInstanceOf(Container);
      expect(result._state).toEqual({ foo: 'bar' });
    });
  });
});
