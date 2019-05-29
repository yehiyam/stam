
const configIt = require('@hkube/config');
const Logger = require('@hkube/logger');
const { VerbosityPlugin } = require('@hkube/logger');
const componentName = require('./common/consts/componentNames');
const { tracer, metrics } = require('@hkube/metrics');
let log;

const modules = [
   
];

class Bootstrap {
    async init() { // eslint-disable-line
        try {
            const { main, logger } = configIt.load();
            this._handleErrors();

            log = new Logger(main.serviceName, logger);
            log.info('running application in ' + configIt.env() + ' environment', { component: componentName.MAIN });

            await metrics.init(main.metrics);
            await tracer.init(main.tracer);
            await Promise.all(modules.map(m => require(m).init(main))); // eslint-disable-line

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
        });
        process.on('uncaughtException', (error) => {
            log.error('uncaughtException: ' + error.message, { component: componentName.MAIN }, error);
            log.error(JSON.stringify(error));
            process.exit(1);
        });
    }
}

module.exports = new Bootstrap();

