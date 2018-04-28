import nats from 'nats'
const RECONNECT = true
const MAX_RECONNECT_ATTEMPTS = 9999
const RECONNECT_TIME_WAIT = 1000
const DEFAULT_OPTIONS = {
  nats: {
    reconnect: RECONNECT,
    maxReconnectAttempts: MAX_RECONNECT_ATTEMPTS,
    reconnectTimeWait: RECONNECT_TIME_WAIT
  }
}

/**
 * @description Concat with nats:// if not starts with that
 * @returns {string|undefined} url
 * @param {string} url
 */
const defineURL = (url) => {
  if (!url || url.startsWith('nats://')) {
    return url
  }
  return `nats://${url}`
}

/**
 * @description Iterate the array or explode the string into array and modify
 *              with defineURL method
 * @returns {array|undefined} servers
 * @param {array|string} servers
 */
const defineServers = (servers) => {
  if (!servers) {
    return servers
  }
  if (typeof servers === 'string') {
    servers = servers.split(',')
  }
  return Array.isArray(servers) && servers.map(url => defineURL(url)) || servers
}

/**
 * @description Return the url and servers options if exists
 * @returns {object} { url, servers }
 * @param {object} options
 */
const getURLOptions = (options) => {
  const { nats } = options
  const url = defineURL(nats && nats.url || process.env.NATS_URL)
  const servers = defineServers(nats && nats.servers || process.env.NATS_SERVERS)
  return { url, servers }
}
/**
 * @name SenecaNatsTransport
 * @description Seneca Transport Plugin using Nats
 * @param {object} options
 */
export default function SenecaNatsTransport (options) {
  const seneca = this
  const name = 'nats-transport'
  const TransportUtils = seneca.export('transport/utils')

  /**
   * @description Extends transport options with seneca options
   */
  options = seneca.util.deepextend(
    DEFAULT_OPTIONS,
    seneca.options(),
    Object.assign({}, options, getURLOptions(options))
  )

  /**
 * @description: The actual transport role to be a listener of nats events
 */
  seneca.add({
    role: 'transport',
    hook: 'listen',
    type: 'nats'
  }, hook_listen_nats)

  /**
   * @description: The actual transport role to be a client of nats events
   */
  seneca.add({
    role: 'transport',
    hook: 'client',
    type: 'nats'
  }, hook_client_nats)

  /**
   * @description: The legacy transport role to be a listener of nats events
   */
  seneca.add({
    role: 'transport',
    hook: 'listen',
    type: 'pubsub'
  }, hook_listen_nats)

  /**
   * @description: The legacy transport role to be a client of nats events
   */
  seneca.add({
    role: 'transport',
    hook: 'client',
    type: 'pubsub'
  }, hook_client_nats)

  /**
   * @description Extract and extends the options plugin with the args injected
   * @returns {object} transportOptions
   * @param {object} args
   * @param {string} type
   */
  async function getTransportOptions (args, type) {
    if (!options[type]) {
      throw new Error('Invalid transport type or no config provide')
    }
    return seneca.util.clean(seneca.util.deepextend({}, options[type], args))
  }

  /**
   * @description Create and open Nats Server Connection
   * @returns {Promise} { transportOptions, clientName, connection }
   * @param {object} args
   * @param {string} type
   * @param {string} event
   */
  async function getConnectionOptions (args, type, event) {
    return new Promise(async (resolve, reject) => {
      const transportOptions = await getTransportOptions(args, type)
      const clientName = `${event}-${type}`
      const connection = nats.connect(options[type])

      /**
       * @description The nats connection client connect event
       */
      connection.on('connect', () => {
        seneca.log.info('client', 'open', transportOptions)
        return resolve({
          transportOptions,
          clientName,
          connection
        })
      })
      /**
       * @description The nats connection client error event
       * @param {Error} err
       */
      connection.on('error', (err) => {
        seneca.log.error('client', 'error', err)
        return reject(err)
      })
    })
  }

  /**
   * @name hook_client_nats
   * @description Hook the client func of plugin
   * @param {object} args
   * @param {callback} done
   */
  async function hook_client_nats (args, done) {
    const seneca = this
    const { type } = args
    const {
      transportOptions,
      clientName,
      connection
    } = await getConnectionOptions(args, type, 'client')

    /**
     * @description Make client handler to pub the message
     * @param {object} spec
     * @param {string} topic
     * @param {callback} next
     */
    const onMakeClient = (spec, topic, next) => {
      const topicAct = `${topic}_act`
      const topicRes = `${topic} _res`

      /**
       * @description Subscribe event when pub message has sent
       * @param {string} message
       */
      const onSubscribe = (message) => {
        seneca.log.debug('client', 'subscribe', topicRes, 'message', message)
        TransportUtils.handle_response(
          seneca,
          TransportUtils.parseJSON(seneca, clientName, message),
          transportOptions
        )
      }

      /**
       * @description Event onNext message who send message to nats server
       * @param {object} message
       * @param {callback} cb
       * @param {object} meta
       */
      const onNext = function (message, cb, meta) {
        seneca.log.debug('client', 'publish', topicAct, 'message', message)
        connection.publish(
          topicAct,
          TransportUtils.stringifyJSON(
            seneca,
            clientName,
            TransportUtils.prepare_request(seneca, message, cb, meta)
          )
        )
      }

      /**
       * @description On Seneca has close then close nats connection
       * @param {object} args
       * @param {callback} finish
       */
      const onSenecaClose = function (args, finish) {
        seneca.log.debug('client', 'close', transportOptions, 'topic', topic)
        connection.close()
        connection.on('close', () => {
          this.prior(args, finish)
        })
      }

      seneca.log.info('client', 'subscribe', topicRes)

      /**
       * @description Register the subscribe event to catch the messages
       */
      connection.subscribe(topicRes, onSubscribe)
      /**
       * @description Handle the middleware who send messages to nats server
       */
      next(null, onNext)
      /**
       * @description Handle to close seneca and nats connection
       */
      seneca.add({ role: 'seneca', cmd: 'close' }, onSenecaClose)
    }
    /**
     * @description Get ready to make the nats client
     */
    TransportUtils.make_client(onMakeClient, transportOptions, done)
  }

  /**
   * @name hook_listen_nats
   * @description Hook the listen func of plugin
   * @param {object} msg
   * @param {callback} done
   */
  async function hook_listen_nats (msg, done) {
    const seneca = this
    const args = msg
    const { type } = args
    const {
      transportOptions,
      clientName,
      connection
    } = await getConnectionOptions(args, type, 'listen')
    const clientOpts = transportOptions

    /**
     * @description Event to listen the transport topic
     * @param {string} topic
     */
    TransportUtils.listen_topics(seneca, args, clientOpts, (topic) => {
      const topicAct = `${topic}_act`
      const topicRes = `${topic}_res`

      /**
       * @description The event to listen the nats subscription
       * @param {string} message
       */
      const onSubscribe = (args) => {
        seneca.log.debug('listen', 'subscribe', topicAct, 'message', args)

        /**
         * @description Event to listen the request event into transport stack
         *              and publish on nats server instance
         * @param {object} result
         */
        const onHandleRequest = (result) => {
          if (!result) {
            return seneca.log.debug(
              'listen',
              'subscribe',
              topicAct,
              'handle_request',
              'empty'
            )
          }

          return connection.publish(
            topicRes,
            TransportUtils.stringifyJSON(seneca, clientName, result)
          )
        }

        /**
         * @description Stack up the request handle in transport stack
         */
        TransportUtils.handle_request(
          seneca,
          TransportUtils.parseJSON(seneca, clientName, args),
          clientOpts,
          onHandleRequest
        )
      }

      /**
       * @description Subscribe to listen the nats event
       */
      connection.subscribe(topicAct, onSubscribe)
      seneca.log.info('listen', 'subscribe', topicAct)
    })

    /**
     * @description On Seneca has close then close nats connection
     * @param {object} args
     * @param {callback} finish
     */
    const onSenecaClose = function (args, finish) {
      seneca.log.debug('listen', 'close', clientOpts)
      connection.close()
      connection.on('close', () => {
        this.prior(args, finish)
      })
    }
    /**
     * @description Handle to close seneca and nats connection
     */
    seneca.add({ role: 'seneca', cmd: 'close' }, onSenecaClose)
    /**
     * @description Execute callback of hook_listen_nats
     */
    done()
  }

  return {
    name
  }
}
