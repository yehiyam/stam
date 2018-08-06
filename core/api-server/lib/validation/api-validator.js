const stateManager = require('../state/state-manager');
const converter = require('@hkube/units-converter');
const { parser } = require('@hkube/parsers');
const { Graph, alg } = require('graphlib');
const { CronJob } = require('cron');
const Validator = require('ajv');
const validator = new Validator({ useDefaults: false, coerceTypes: true });
const defaulter = new Validator({ useDefaults: true, coerceTypes: true });
const { schemas, _schemas } = require('../../api/rest-api/swagger.json').components;
const { ResourceNotFoundError, InvalidDataError } = require('../errors');

const URL_REGEX = /^(f|ht)tps?:\/\//i;
const PIPELINE_NAME_REGEX = /^[-_.A-Za-z0-9]+$/i;
const ALGORITHM_NAME_REGEX = /^(([a-zA-Z0-9]|[a-zA-Z0-9][a-zA-Z0-9\-]*[a-zA-Z0-9])\.)*([A-Za-z0-9]|[A-Za-z0-9][A-Za-z0-9\-]*[A-Za-z0-9])$/; // eslint-disable-line
const MIN_MEMORY = 4;

class ApiValidator {
    constructor() {
        this._prepare(validator);
        this._prepare(defaulter);
    }

    _prepare(validatorInstance) {
        validatorInstance.addFormat('url', this._validateUrl);
        validatorInstance.addFormat('cron', this._validateCron);
        validatorInstance.addFormat('pipeline-name', this._validatePipelineName);
        validatorInstance.addFormat('algorithm-name', this._validateAlgorithmName);
        Object.entries(schemas).forEach(([k, v]) => {
            validatorInstance.addSchema(v, `#/components/schemas/${k}`);
        });
    }

    addPipelineDefaults(pipeline) {
        this._addDefaults(schemas.pipeline, pipeline);
    }

    validateStoredInternal(pipeline) {
        this._validate(_schemas.pipeline, pipeline, false);
    }

    validateRawSubPipeline(pipeline) {
        this._validate(_schemas.rawSubPipeline, pipeline, false);
    }

    validateStoredSubPipeline(pipeline) {
        this._validate(_schemas.storedSubPipeline, pipeline, false);
    }

    validateRunRawPipeline(pipeline) {
        this._validate(schemas.pipeline, pipeline, false, { checkFlowInput: true });
    }

    validateRunStoredPipeline(pipeline) {
        this._validate(schemas.storedPipeline, pipeline, false, { checkFlowInput: false });
    }

    validateStopPipeline(pipeline) {
        this._validate(schemas.stopRequest, pipeline, true);
    }

    validateUpdatePipeline(pipeline) {
        this._validate(schemas.pipeline, pipeline, true);
    }

    validateUpdateAlgorithm(algorithm) {
        this._validate(schemas.algorithm, algorithm, false);
        this._validateMemory(algorithm);
    }

    validateName(pipeline) {
        this._validate(_schemas.name, pipeline, false);
    }

    validateResultList(pipeline) {
        this._validate(_schemas.list, pipeline, true);
    }

    validateJobID(pipeline) {
        this._validate(schemas.jobId, pipeline, false);
    }

    async validateAlgorithmName(pipeline) {
        const result = await stateManager.getAlgorithms();
        const algorithms = new Set(result.map(x => x.name));
        pipeline.nodes.forEach((node) => {
            if (!algorithms.has(node.algorithmName)) {
                throw new ResourceNotFoundError('algorithm', node.algorithmName);
            }
        });
    }

    _validate(schema, object, useDefaults, options) {
        if (useDefaults) {
            this._validateInner(defaulter, schema, object, options);
        }
        else {
            this._validateInner(validator, schema, object, options);
        }
    }

    _validateInner(validatorInstance, schema, object, options) {
        object = object || {};
        const valid = validatorInstance.validate(schema, object);
        if (!valid) {
            const error = validatorInstance.errorsText(validatorInstance.errors);
            throw new InvalidDataError(error);
        }
        if (object.nodes) {
            this._validateNodes(object, options);
        }
    }

    _addDefaults(schema, object) {
        defaulter.validate(schema, object);
    }

    _validateNodes(pipeline, options) {
        options = options || {};
        const graph = new Graph();
        const links = [];

        pipeline.nodes.forEach((node) => {
            if (graph.node(node.nodeName)) {
                throw new InvalidDataError(`found duplicate node ${node.nodeName}`);
            }
            if (node.nodeName === 'flowInput') {
                throw new InvalidDataError(`pipeline ${pipeline.name} has invalid reserved name flowInput`);
            }

            node.input.forEach((inp) => {
                if (options.checkFlowInput) {
                    try {
                        parser.checkFlowInput({ flowInput: pipeline.flowInput, nodeInput: inp });
                    }
                    catch (e) {
                        throw new InvalidDataError(e.message);
                    }
                }

                const nodesNames = parser.extractNodesFromInput(inp);
                nodesNames.forEach((n) => {
                    const nd = pipeline.nodes.find(f => f.nodeName === n.nodeName);
                    if (nd) {
                        links.push({ source: nd.nodeName, target: node.nodeName });
                    }
                    else {
                        throw new InvalidDataError(`node ${node.nodeName} is depend on ${n.nodeName} which is not exists`);
                    }
                });
            });
            graph.setNode(node.nodeName, node);
        });

        links.forEach((link) => {
            graph.setEdge(link.source, link.target);
        });

        if (!alg.isAcyclic(graph)) {
            throw new InvalidDataError(`pipeline ${pipeline.name} has cyclic nodes`);
        }
    }

    _validateUrl(url) {
        return URL_REGEX.test(url);
    }

    _validatePipelineName(name) {
        if (!PIPELINE_NAME_REGEX.test(name)) {
            throw new InvalidDataError('pipeline name must contain only alphanumeric, dash, dot or underscore');
        }
        return true;
    }
    _validateAlgorithmName(name) {
        if (!ALGORITHM_NAME_REGEX.test(name)) {
            throw new InvalidDataError('algorithm name must contain only alphanumeric, dash or dot');
        }
        return true;
    }

    _validateMemory(algorithm) {
        if (!algorithm.mem) {
            algorithm.mem = 4;
            return;
        }
        try {
            algorithm.mem = converter.getMemoryInMi(algorithm.mem);
        }
        catch (ex) {
            throw new InvalidDataError(ex.message);
        }
        if (algorithm.mem < MIN_MEMORY) {
            throw new InvalidDataError(`memory must be at least ${MIN_MEMORY} Mi`);
        }
    }

    _validateCron(cron) {
        let result = true;
        try {
            new CronJob(cron); // eslint-disable-line
        }
        catch (e) {
            result = false;
        }
        return result;
    }
}

module.exports = new ApiValidator();
