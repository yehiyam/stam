const stateManager = require('../state/state-manager');
const validator = require('../validation/api-validator');
const { ResourceNotFoundError, } = require('../errors');
const { Types } = require('../webhook/States');

class WebhooksService {
    async getWebhooksResults(options) {
        validator.validateJobID(options);
        const status = await stateManager.getWebhook({ jobId: options.jobId, type: Types.RESULT });
        if (!status) {
            throw new ResourceNotFoundError('webhook', options.jobId);
        }
        return status;
    }

    async getWebhooksStatus(options) {
        validator.validateJobID(options);
        const status = await stateManager.getWebhook({ jobId: options.jobId, type: Types.PROGRESS });
        if (!status) {
            throw new ResourceNotFoundError('webhook', options.jobId);
        }
        return status;
    }

    async getWebhooks(options) {
        validator.validateJobID(options);
        const webhooks = await stateManager.getWebhooks({ jobId: options.jobId });
        if (!webhooks) {
            throw new ResourceNotFoundError('webhook', options.jobId);
        }
        const { progress, result } = webhooks[0];
        return { progress, result };
    }
}

module.exports = new WebhooksService();
