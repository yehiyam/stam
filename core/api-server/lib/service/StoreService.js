const deepExtend = require('deep-extend');
const validator = require('../validation/api-validator');
const stateManager = require('../state/state-manager');
const { ResourceNotFoundError, ResourceExistsError, } = require('../errors/errors');

class StoreService {
    /**
     * add a pipeline
     * adds the given pipeline to the store.
     *
     * pipeline Pipeline pipeline descriptor to be added to the store
     * returns defaultResponse
     * */
    async updatePipeline(options) {
        validator.validateUpdatePipeline(options);
        const pipe = await stateManager.getPipeline(options);
        if (!pipe) {
            throw new ResourceNotFoundError('pipeline', options.name);
        }
        const pipeline = deepExtend(pipe, options);
        validator.addDefaults(pipeline);
        return stateManager.setPipeline(pipeline);
    }

    /**
     * delete stored pipeline
     * removes selected stored pipeline from store
     *
     * pipelineName String pipeline name to get from the store
     * returns defaultResponse
     * */
    async deletePipeline(options) {
        validator.validateDeletePipeline(options);
        const pipeline = await stateManager.getPipeline(options);
        if (!pipeline) {
            throw new ResourceNotFoundError('pipeline', options.name);
        }
        return stateManager.deletePipeline(options);
    }

    /**
     * get pipeline data from store
     * returns stored pipeline
     *
     * pipelineName String pipeline name to get from the store
     * returns piplineNamesList
     * */
    async getPipeline(options) {
        validator.validateGetPipeline(options);
        const pipeline = await stateManager.getPipeline(options);
        if (!pipeline) {
            throw new ResourceNotFoundError('pipeline', options.name);
        }
        return pipeline;
    }

    async getPipelines() {
        return stateManager.getPipelines();
    }

    /**
     * add a pipeline
     * adds the given pipeline to the store.
     *
     * pipeline Pipeline pipeline descriptor to be added to the store
     * returns defaultResponse
     * */
    async insertPipeline(options) {
        validator.validateInsertPipeline(options);
        const pipe = await stateManager.getPipeline(options);
        if (pipe) {
            throw new ResourceExistsError('pipeline', options.name);
        }
        validator.addDefaults(options);
        return stateManager.setPipeline(options);
    }
}

module.exports = new StoreService();
