const request = require('requestretry');
const { metrics, utils } = require('@hkube/metrics');
const levels = require('@hkube/logger').Levels;
const log = require('@hkube/logger').GetLogFromContainer();
const stateManager = require('../state/state-manager');
const component = require('../../lib/consts/componentNames').WEBHOOK_HANDLER;
const { States, Types } = require('./States');
const { metricsNames } = require('../../lib/consts/metricsNames');

/**
 * Convert raw pipeline names to 'raw' (to enable rate them in prometheus)
 * @param {string} pipelineName
 */
function formatPipelineName(pipelineName) {
    if (pipelineName.startsWith('raw-')) {
        return 'raw';
    }
    return pipelineName;
}

class WebhooksHandler {
    init(options) {
        this._options = options;
        metrics.addTimeMeasure({
            name: metricsNames.pipelines_gross,
            description: 'Histogram of pipeline gross',
            labels: ['pipeline_name', 'status'],
            buckets: utils.arithmatcSequence(30, 0, 2)
                .concat(utils.geometricSequence(10, 56, 2, 1).slice(2)).map(i => i * 1000)
        });
        this._watch();
    }

    _watch() {
        stateManager.on('job-result', (response) => {
            this._requestResults(response);
            this._deleteRunningPipeline({ jobId: response.jobId });
        });
        stateManager.on('job-status', (response) => {
            this._requestStatus(response);
        });
    }

    async _requestStatus(payload) {
        const { jobId } = payload;
        const pipeline = await stateManager.getExecution({ jobId });

        if (pipeline && pipeline.webhooks && pipeline.webhooks.progress && payload.level) {
            const progressLevel = pipeline.options.progressVerbosityLevel.toUpperCase();
            const payloadLevel = payload.level.toUpperCase();
            const clientLevel = levels[progressLevel].level;
            const pipelineLevel = levels[payloadLevel].level;
            log.debug(`progress event with ${payloadLevel} verbosity, client requested ${pipeline.options.progressVerbosityLevel}`, { component, jobId });
            if (clientLevel <= pipelineLevel) {
                const result = await this._request(pipeline.webhooks.progress, payload, Types.PROGRESS, payload.status, jobId);
                await stateManager.setWebhook({ jobId, type: Types.PROGRESS, ...result });
            }
        }
        if (stateManager.isCompletedState(payload.status)) {
            await stateManager.releaseJobStatusLock({ jobId });
        }
    }

    async _requestResults(payload) {
        const { jobId } = payload;
        const pipeline = await stateManager.getExecution({ jobId });

        const time = Date.now() - pipeline.startTime;
        metrics.get(metricsNames.pipelines_gross).retroactive({
            time,
            labelValues: {
                pipeline_name: formatPipelineName(pipeline.name),
                status: payload.status
            }
        });
        if (pipeline.webhooks && pipeline.webhooks.result) {
            const payloadData = await stateManager.getResultFromStorage(payload);
            const result = await this._request(pipeline.webhooks.result, payloadData, Types.RESULT, payload.status, jobId);
            await stateManager.setWebhook({ jobId, type: Types.RESULT, ...result });
        }
        await stateManager.releaseJobResultsLock({ jobId });
    }

    async _deleteRunningPipeline(options) {
        const res = await stateManager.deleteRunningPipeline(options);
        log.info(`deleted running executions ${JSON.stringify(res)}`, { component });
    }

    _request(url, body, type, pipelineStatus, jobId) {
        return new Promise((resolve) => {
            log.debug(`trying to call ${type} webhook ${url} (${pipelineStatus})`, { component });
            const data = {
                url,
                pipelineStatus,
                status: States.COMPLETED
            };
            request({
                method: 'POST',
                uri: url,
                body,
                json: true,
                maxAttempts: this._options.webhooks.retryStrategy.maxAttempts,
                retryDelay: this._options.webhooks.retryStrategy.retryDelay,
                retryStrategy: request.RetryStrategies.HTTPOrNetworkError
            }).then((response) => {
                data.responseStatus = response.statusCode >= 400 ? States.FAILED : States.SUCCEED;
                data.httpResponse = { statusCode: response.statusCode, statusMessage: response.statusMessage };
                log.debug(`${type} webhook has been sent with status ${response.statusCode} ${response.statusMessage}, attempts: ${response.attempts}`, { component, jobId });
                return resolve(data);
            }).catch((error) => {
                data.responseStatus = States.FAILED;
                data.httpResponse = { statusCode: error.code, statusMessage: error.message };
                log.warning(`webhook ${type} failed ${error.message}`, { component, jobId });
                return resolve(data);
            });
        });
    }
}

module.exports = new WebhooksHandler();
