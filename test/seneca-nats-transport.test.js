import 'babel-core/register'
import 'babel-polyfill'
import { script } from 'lab'
import { expect } from 'code'
import Seneca from 'seneca'
import lib from '../index'

const lab = exports.lab = script()
const describe = lab.describe
const it = lab.it
const beforeEach = lab.beforeEach
const afterEach = lab.afterEach

const nats = require('nats')

describe('lib', function () {
  let server, client, nc

  beforeEach(async () => {
    server = Seneca({ log: 'silent' })
    client = Seneca({ log: 'silent' })
    nc = nats.connect()
  })

  afterEach(async () => {
    client.close()
    server.close()
    nc.close()

    client = null
    server = null
    nc = null
  })

  it('should listen messages', async () => {
    return new Promise((resolve, reject) => {
      const pattern = {role: 'foo', cmd: 'bar'}
      const message = {
        role: 'foo',
        cmd: 'bar',
        argNum: 1,
        argStr: '2',
        argBool: true,
        argObj: {},
        argAry: []
      }

      server
        .use(lib)
        .add(pattern, (msg, done) => { return done(null, msg) })
        .listen({ type: 'nats' })

      client
        .use(lib)
        .client({ type: 'nats' })
        .act(message)

      nc.subscribe('seneca_any_act', (msg) => {
        expect(JSON.parse(msg).act).to.equal(message)
        return resolve()
      })
    })
  })

  it('should send messages', async () => {
    return new Promise((resolve, reject) => {
      const pattern = {role: 'foo', cmd: 'bar'}
      const message = {
        role: 'foo',
        cmd: 'bar',
        argNum: 1,
        argStr: '2',
        argBool: true,
        argObj: {},
        argAry: []
      }

      nc.subscribe('seneca_any_res', (msg) => {
        const res = JSON.parse(msg).res
        expect(typeof res).to.be.equal('object')
        expect(res.role).to.equal('foo')
        expect(res.cmd).to.equal('bar')
        expect(res.argNum).to.equal(1)
        expect(res.argStr).to.equal('2')
        expect(res.argBool).to.equal(true)
        expect(Array.isArray(res.argAry)).to.equal(true)
        expect(typeof res.argObj).to.equal('object')
        resolve()
      })

      server
        .use(lib)
        .add(pattern, (msg, done) => { return done(null, msg) })
        .listen({ type: 'nats' })

      client
        .use(lib)
        .client({ type: 'nats' })
        .act(message)
    })
  })
})
