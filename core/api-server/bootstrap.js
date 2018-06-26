const configIt = require('@hkube/config');
const Logger = require('@hkube/logger');
const monitor = require('@hkube/redis-utils').Monitor;
const component = require('./common/consts/componentNames').MAIN;
const { tracer, metrics } = require('@hkube/metrics');
let log;

const modules = [
    './lib/datastore/storage-factory',
    './lib/state/state-manager',
    './lib/producer/jobs-producer',
    './lib/examples/pipelines-updater',
    './lib/webhook/webhooks-handler'
];

class Bootstrap {
    async init() {
        let config = null;
        try {
            const { main, logger } = configIt.load();
            this._handleErrors();

            log = new Logger(main.serviceName, logger);
            log.info('running application in ' + configIt.env() + ' environment', { component });

            monitor.on('ready', (data) => {
                log.info((data.message).green, { component });
            });
            monitor.on('close', (data) => {
                log.error(data.error.message, { component });
            });
            monitor.check(main.redis);

            await metrics.init(main.metrics);
            if (main.tracer) {
                await tracer.init(main.tracer);
            }
            const appServer = require('./api/rest-api/app-server'); // eslint-disable-line
            const dataRest = await appServer.init(main);
            log.info(dataRest.message, { component });

            await Promise.all(modules.map(m => require(m).init(main))); // eslint-disable-line

            config = main;
        }
        catch (error) {
            this._onInitFailed(new Error(`unable to start application. ${error.message}`));
        }
        return config;
    }

    _onInitFailed(error) {
        if (log) {
            log.error(error.message, { component }, error);
            log.error(error);
        }
        else {
            console.error(error.message); // eslint-disable-line
            console.error(error); // eslint-disable-line
        }
        process.exit(1);
    }

    _handleErrors() {
        process.on('exit', (code) => {
            log.info('exit' + (code ? ' code ' + code : ''), { component });
        });
        process.on('SIGINT', () => {
            log.info('SIGINT', { component });
            process.exit(1);
        });
        process.on('SIGTERM', () => {
            log.info('SIGTERM', { component });
            process.exit(1);
        });
        process.on('unhandledRejection', (error) => {
            log.error('unhandledRejection: ' + error.message, { component }, error);
            log.error(error, { component });
        });
        process.on('uncaughtException', (error) => {
            log.error('uncaughtException: ' + error.message, { component }, error);
            process.exit(1);
        });
    }
}

module.exports = new Bootstrap();

