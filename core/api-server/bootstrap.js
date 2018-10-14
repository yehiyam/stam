const configIt = require('@hkube/config');
const Logger = require('@hkube/logger');
const monitor = require('@hkube/redis-utils').Monitor;
const component = require('./lib/consts/componentNames').MAIN;
const { tracer, metrics } = require('@hkube/metrics');
const { main, logger } = configIt.load();
const log = new Logger(main.serviceName, logger);

const modules = [
    require('./api/rest-api/app-server'),
    require('./lib/datastore/storage-factory'),
    require('./lib/state/state-manager'),
    require('./lib/producer/jobs-producer'),
    require('./lib/examples/pipelines-updater'),
    require('./lib/webhook/webhooks-handler')
];

class Bootstrap {
    async init() {
        let config = null;
        try {
            this._handleErrors();
            log.info('running application in ' + configIt.env() + ' environment', { component });

            monitor.on('ready', (data) => {
                log.info((data.message).green, { component });
            });
            monitor.on('close', (data) => {
                log.error(data.error.message, { component });
            });
            await monitor.check(main.redis);

            await metrics.init(main.metrics);
            if (main.tracer) {
                await tracer.init(main.tracer);
            }
            await Promise.all(modules.map(m => m.init(main)));
            config = main;
        }
        catch (error) {
            this._onInitFailed(error);
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

