'use strict';

var aws = require('aws-sdk'),
    cloudWatch = new aws.CloudWatch(),
    constants = {
        PLUGIN_NAME: 'cloudwatch',
        PLUGIN_PARAM_NAMESPACE: 'namespace',
        // PLUGIN_PARAM_METRICS: 'metrics',
        THE: 'The "',
        CONFIG_REQUIRED: '" plugin requires configuration under <script>.config.plugins.',
        PARAM_REQUIRED: '" parameter is required',
        PARAM_MUST_BE_STRING: '" param must have a string value',
        PARAM_MUST_HAVE_LENGTH_OF_AT_LEAST_ONE: '" param must have a length of at least one',
        PARAM_MUST_BE_ARRAY: '" param must have an array value',
        // Report Array Positions
        TIMESTAMP: 0,
        REQUEST_ID: 1,
        LATENCY: 2,
        STATUS_CODE: 3
    },
    messages = {
        pluginConfigRequired: constants.THE + constants.PLUGIN_NAME + constants.CONFIG_REQUIRED + constants.PLUGIN_NAME,
        pluginParamNamespaceRequired: constants.THE + constants.PLUGIN_PARAM_NAMESPACE + constants.PARAM_REQUIRED,
        pluginParamNamespaceMustBeString: constants.THE + constants.PLUGIN_PARAM_NAMESPACE + constants.PARAM_MUST_BE_STRING,
        pluginParamNamespaceMustHaveALengthOfAtLeastOne: constants.THE + constants.PLUGIN_PARAM_NAMESPACE + constants.PARAM_MUST_HAVE_LENGTH_OF_AT_LEAST_ONE
    },
    impl = {
        validateConfig: function(scriptConfig) {
            // Validate that plugin config exists
            if (!(scriptConfig && scriptConfig.plugins && constants.PLUGIN_NAME in scriptConfig.plugins)) {
                throw new Error(messages.pluginConfigRequired);
            }
            // Validate NAMESPACE
            if (!(constants.PLUGIN_PARAM_NAMESPACE in scriptConfig.plugins[constants.PLUGIN_NAME])) {
                throw new Error(messages.pluginParamNamespaceRequired);
            } else if (!('string' === typeof scriptConfig.plugins[constants.PLUGIN_NAME][constants.PLUGIN_PARAM_NAMESPACE] ||
                scriptConfig.plugins[constants.PLUGIN_NAME][constants.PLUGIN_PARAM_NAMESPACE] instanceof String)) {
                throw new Error(messages.pluginParamNamespaceMustBeString);
            } else if (scriptConfig.plugins[constants.PLUGIN_NAME][constants.PLUGIN_PARAM_NAMESPACE].length === 0) {
                throw new Error(messages.pluginParamNamespaceMustHaveALengthOfAtLeastOne);
            }
        },
        buildCloudwatchCodesParams: function(namespace, report) {
            var cloudWatchParams = {
                Namespace: namespace,
                MetricData: []
            };
            var codes = { }
            if(report && report.codes) {
                codes = report.codes;
            } else if (report && report._codes) {
                codes = report._codes
            }
            for(var code in codes) {
                cloudWatchParams.MetricData.push({
                    MetricName: code == 200 ? 'Success' : 'Status_' + code,
                    Dimensions: [],
                    Timestamp: report.timestamp,
                    Value: codes[code],
                    Unit: 'None'
                });
            }
            return cloudWatchParams;
        },
        buildCloudWatchParams: function(namespace, latency, latencies) {
            var cloudWatchParams = {
                    Namespace: namespace,
                    MetricData: []
                },
                i,
                lastLatency = Math.min(latency + 20, latencies.length);
            for (i = latency; i < lastLatency; i++) {
                cloudWatchParams.MetricData.push({
                    MetricName: 'ResultLatency',
                    Dimensions: [],
                    Timestamp: (new Date(latencies[i][constants.TIMESTAMP])).toISOString(),
                    Value: latencies[i][constants.LATENCY] / 1000000,
                    Unit: 'Milliseconds'
                });
            }
            return cloudWatchParams;
        },
        CloudWatchPlugin: function(scriptConfig, eventEmitter) {
            var self = this,
                reportError = function (err) {
                    if (err) {
                        console.log('Error reporting metrics to CloudWatch via putMetricData:', err);
                    }
                };
            self.config = JSON.parse(JSON.stringify(scriptConfig.plugins[constants.PLUGIN_NAME]));
            eventEmitter.on('stats', function (report) {

                var statusStat = impl.buildCloudwatchCodesParams(self.config[constants.PLUGIN_PARAM_NAMESPACE], report);
                cloudWatch.putMetricData(statusStat, reportError);

                var latency = 0,
                    latencies,
                    cloudWatchParams;
                if (report && report.aggregate && report.aggregate.latencies && Array.isArray(report.aggregate.latencies)) {
                    latencies = report.aggregate.latencies;
                } else if (report && report.latencies && Array.isArray(report.latencies)) {
                    latencies = report.latencies;
                } else if (report && report._entries && Array.isArray(report._entries)) {
                    latencies = report._entries;
                } else {
                    latencies = [];
                }
                while (latency < latencies.length) {
                    cloudWatchParams = impl.buildCloudWatchParams(self.config[constants.PLUGIN_PARAM_NAMESPACE], latency, latencies);
                    cloudWatch.putMetricData(cloudWatchParams, reportError);
                    latency += cloudWatchParams.MetricData.length;
                }
                console.log('Metrics reported to CloudWatch');
            });
        }
    },
    api = {
        init: function (scriptConfig, eventEmitter) {
            impl.validateConfig(scriptConfig);
            return new impl.CloudWatchPlugin(scriptConfig, eventEmitter);
        }
    };

/**
 * Configuration:
 *  {
 *      "config": {
 *          "plugins": {
 *              "cloudwatch": {
 *                  "namespace": "[INSERT_NAMESPACE]",
 // *                  "metrics": [
 // *                      {
 // *                          "name": "[METRIC_NAME]",
 // *                          "dimensions": [...],
 // *
 // *                      }
 // *                  ]
 *              }
 *          }
 *      }
 *  }
 */
module.exports = api.init;

/* test-code */
module.exports.constants = constants;
module.exports.messages = messages;
module.exports.impl = impl;
module.exports.api = api;
/* end-test-code */
