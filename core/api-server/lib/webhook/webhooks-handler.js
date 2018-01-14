const request = require('requestretry');
const stateManager = require('../state/state-manager');
const Logger = require('@hkube/logger');
const log = Logger.GetLogFromContainer();
const components = require('../../common/consts/componentNames');

const levels = {
    silly: 0,
    debug: 1,
    info: 2,
    warning: 3,
    error: 4,
    critical: 5
};

class WebhooksHandler {
    init(options) {
        this._options = options;
        stateManager.on('job-result', async (response) => {
            const pipeline = await stateManager.getExecution({ jobId: response.jobId });
            if (pipeline.webhooks && pipeline.webhooks.result) {
                this._request(pipeline.webhooks.result, this._options.webhooks.result, response, 'result');
            }
        });

        stateManager.on('job-status', async (response) => {
            const pipeline = await stateManager.getExecution({ jobId: response.jobId });
            if (pipeline.webhooks && pipeline.webhooks.progress) {
                const clientLevel = levels[pipeline.options.progressVerbosityLevel];
                const pipelineLevel = levels[response.data.level];

                log.debug(`progress event with ${response.data.level} verbosity, client requested ${pipeline.options.progressVerbosityLevel} verbosity`, { component: components.WEBHOOK_HANDLER });

                if (clientLevel <= pipelineLevel) {
                    this._request(pipeline.webhooks.progress, this._options.webhooks.progress, response, 'progress');
                }
            }
        });
    }

    _request(url, settings, body, type) {
        log.debug(`trying to call ${type} webhook ${url}`, { component: components.WEBHOOK_HANDLER });
        request({
            method: 'POST',
            uri: url,
            body,
            json: true,
            maxAttempts: settings.maxAttempts,
            retryDelay: settings.retryDelay,
            retryStrategy: request.RetryStrategies.HTTPOrNetworkError
        }).then((response) => {
            log.debug(`webhook ${type} completed with status ${response.statusCode} ${response.statusMessage}, attempts: ${response.attempts}`, { component: components.WEBHOOK_HANDLER });
        }).catch((error) => {
            log.error(`webhook ${type} failed ${error.message}`, { component: components.WEBHOOK_HANDLER });
        });
    }
}

module.exports = new WebhooksHandler();
