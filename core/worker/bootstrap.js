
const configIt = require('@hkube/config');
const Logger = require('@hkube/logger');
const { VerbosityPlugin } = require('@hkube/logger');
const monitor = require('@hkube/redis-utils').Monitor;
const componentName = require('./lib/consts/componentNames');
const { tracer, metrics } = require('@hkube/metrics');
let log;
const worker = require('./lib/worker');

const modules = [
    './lib/helpers/datastoreHelper.js',
    './lib/states/stateManager.js',
    './lib/states/discovery.js',
    './lib/algorunnerCommunication/workerCommunication.js',
    './lib/consumer/JobConsumer.js',
    './lib/algorunnerLogging/loggingProxy.js',
    './lib/helpers/kubernetes.js',
    './lib/helpers/api-server-client.js',
    './lib/subpipeline/subpipeline.js'
];

class Bootstrap {
    async init() { // eslint-disable-line
        try {
            const { main, logger } = configIt.load();
            this._handleErrors();

            log = new Logger(main.serviceName, logger);
            log.plugins.use(new VerbosityPlugin(main.redis));
            log.info('running application in ' + configIt.env() + ' environment', { component: componentName.MAIN });

            monitor.on('ready', (data) => {
                log.info((data.message).green, { component: componentName.MAIN });
            });
            monitor.on('close', (data) => {
                log.error(data.error.message, { component: componentName.MAIN });
            });
            await monitor.check(main.redis);
            await metrics.init(main.metrics);
            await tracer.init(main.tracer);
            worker.preInit();
            for (const m of modules) {// eslint-disable-line
                await require(m).init(main, log);// eslint-disable-line
            }

            await worker.init(main);

            return main;
        }
        catch (error) {
            this._onInitFailed(error);
        }
    }

    _onInitFailed(error) {
        if (log) {
            log.error(error.message, { component: componentName.MAIN }, error);
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
            log.info('exit' + (code ? ' code ' + code : ''), { component: componentName.MAIN });
        });
        process.on('SIGINT', () => {
            log.info('SIGINT', { component: componentName.MAIN });

            process.exit(1);
        });
        process.on('SIGTERM', () => {
            log.info('SIGTERM', { component: componentName.MAIN });
            process.exit(1);
        });
        process.on('unhandledRejection', (error) => {
            log.error('unhandledRejection: ' + error.message, { component: componentName.MAIN }, error);
            log.error(error);
            worker.handleExit(1);
        });
        process.on('uncaughtException', (error) => {
            log.error('uncaughtException: ' + error.message, { component: componentName.MAIN }, error);
            log.error(JSON.stringify(error));
            process.exit(1);
        });
    }
}

module.exports = new Bootstrap();

