const configIt = require('@hkube/config');
const Logger = require('@hkube/logger');
const { metrics } = require('@hkube/metrics');
const { main, logger } = configIt.load();
const log = new Logger(main.serviceName, logger);
const { components } = require('./lib/consts');
const component = components.MAIN;
const etcd = require('./lib/helpers/etcd');
const kubernetes = require('./lib/helpers/kubernetes');
const executor = require('./lib/executor');

const modules = [
    etcd,
    kubernetes,
];

class Bootstrap {
    async init() { // eslint-disable-line
        try {
            this._handleErrors();
            log.info(`running application with env: ${configIt.env()}, version: ${main.version}, node: ${process.versions.node}`, { component });
            await metrics.init(main.metrics);
            await Promise.all(modules.map(m => m.init(main)));
            await executor.init(main);
            return main;
        }
        catch (error) {
            this._onInitFailed(error);
        }
    }

    _onInitFailed(error) {
        log.error(error.message, { component }, error);
        log.error(error);
        process.exit(1);
    }

    _handleErrors() {
        process.on('exit', (code) => {
            log.info(`exit code ${code}`, { component });
        });
        process.on('SIGINT', () => {
            log.info('SIGINT', { component });
            process.exit(0);
        });
        process.on('SIGTERM', () => {
            log.info('SIGTERM', { component });
            process.exit(0);
        });
        process.on('unhandledRejection', (error) => {
            log.error(`unhandledRejection: ${error.message}`, { component }, error);
            process.exit(1);
        });
        process.on('uncaughtException', (error) => {
            log.error(`uncaughtException: ${error.message}`, { component }, error);
            log.error(error);
            process.exit(1);
        });
    }
}

module.exports = new Bootstrap();
