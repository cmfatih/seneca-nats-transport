/*
 * seneca-nats-transport
 * Copyright (c) 2015 Fatih Cetinkaya (http://github.com/cmfatih/seneca-nats-transport)
 * For the full copyright and license information, please view the LICENSE.txt file.
 */

/* jslint node: true */
'use strict';

var nats = require('nats');
var internals = {};

module.exports = function (options) {

  var seneca = this,
    plugin = 'nats-transport';

  var transpUtils = seneca.export('transport/utils');
  var senecaOpts = seneca.options();

  internals.options = seneca.util.deepextend({
    nats: {
      reconnect: true,
      maxReconnectAttempts: 9999,
      reconnectTimeWait: 1000
    }
  }, senecaOpts.transport, options);

  var setupNetworkOptions = function () {
    // Check nats servers
    var NATS_SERVERS = process.env.NATS_SERVERS,
      NATS_URL = process.env.NATS_URL;

    if (!internals.options.nats.servers && NATS_SERVERS) {
      internals.options.nats.servers = NATS_SERVERS.split(',');
    }

    if (internals.options.nats.servers) {
      if (internals.options.nats.servers instanceof Array) {
        for (var i = 0, len = internals.options.nats.servers.length; i < len; i++) {
          if (typeof internals.options.nats.servers[i] === 'string' && internals.options.nats.servers[i].indexOf('nats://') !== 0) {
            internals.options.nats.servers[i] = 'nats://' + internals.options.nats.servers[i];
          }
        }
      }
    }

    // Check nats url
    if (!internals.options.nats.url && NATS_URL) {
      internals.options.nats.url = NATS_URL;
    }

    if (internals.options.nats.url) {
      if (typeof internals.options.nats.url === 'string' && internals.options.nats.url.indexOf('nats://') !== 0) {
        internals.options.nats.url = 'nats://' + internals.options.nats.url;
      }
    }
  };

  // Listen hook for the transport
  seneca.add({role: 'transport', type: 'nats', hook: 'listen'}, function (msg, done) {
    setupNetworkOptions();

    var type = msg.type,
      seneca = this,
      clientOpts = seneca.util.clean(seneca.util.deepextend({}, internals.options[type], msg)),
      clientName = 'listen-' + type,
      nc = nats.connect(internals.options[type]);

    // Connect event
    nc.on('connect', function (/*client*/) {
      seneca.log.info('listen', 'open', clientOpts);
    });

    // Error event
    nc.on('error', function (err) {
      seneca.log.error('listen', 'error', err);
    });

    // Listen topics
    transpUtils.listen_topics(seneca, msg, clientOpts, function (topic) {
      var topicAct = topic + '_act',
        topicRes = topic + '_res';

      // Subscribe to act topic
      nc.subscribe(topicAct, function (msg) {
        seneca.log.debug('listen', 'subscribe', topicAct, 'message', msg);

        // Handle request
        transpUtils.handle_request(seneca, transpUtils.parseJSON(seneca, clientName, msg), clientOpts, function (out) {
          // If there is an output then
          if (out) {
            // Publish it to response topic
            nc.publish(topicRes, transpUtils.stringifyJSON(seneca, clientName, out));
          }
        });
      });
      seneca.log.info('listen', 'subscribe', topicAct);
    });

    // Closer action
    seneca.add({role: 'seneca', cmd: 'close'}, function (args, cb) {
      seneca.log.debug('listen', 'close', clientOpts);

      nc.close();
      this.prior(args, cb);
    });

    done();
  });

  // Client hook for the transport
  seneca.add({role: 'transport', type: 'nats', hook: 'client'}, function (msg, done) {
    setupNetworkOptions();
    var type = msg.type,
      seneca = this,
      clientOpts = seneca.util.clean(seneca.util.deepextend({}, internals.options[type], msg)),
      clientName = 'client-' + type;
    var nc = nats.connect(internals.options[type]);

    // Connect event
    nc.on('connect', function (/*client*/) {
      seneca.log.info('client', 'open', clientOpts);
    });

    // Error event
    nc.on('error', function (err) {
      seneca.log.error('client', 'error', err);
    });

    // Send is called for per topic
    function send (spec, topic, sendDone) {
      var topicAct = topic + '_act',
        topicRes = topic + '_res';

      // Subscribe to response topic
      nc.subscribe(topicRes, function (msg) {
        seneca.log.debug('client', 'subscribe', topicRes, 'message', msg);

        // Handle response
        transpUtils.handle_response(seneca, transpUtils.parseJSON(seneca, clientName, msg), clientOpts);
      });
      seneca.log.info('client', 'subscribe', topicRes);

      // Send message over the transport
      sendDone(null, function (msg, cb) {
        seneca.log.debug('client', 'publish', topicAct, 'message', msg);

        // Publish act
        nc.publish(topicAct, transpUtils.stringifyJSON(seneca, clientName, transpUtils.prepare_request(seneca, msg, cb)));
      });

      // Closer action
      seneca.add({role: 'seneca', cmd: 'close'}, function (args, cb) {
        seneca.log.debug('client', 'close', clientOpts, 'topic', topic);

        nc.close();
        this.prior(args, cb);
      });
    }

    // Use transport utils to make client
    transpUtils.make_client(send, clientOpts, done);
  });

  // Return
  return {
    name: plugin
  };

};
