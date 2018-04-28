'use strict';Object.defineProperty(exports,"__esModule",{value:true});exports.default=SenecaNatsTransport;var _nats=require('nats');var _nats2=_interopRequireDefault(_nats);function _interopRequireDefault(obj){return obj&&obj.__esModule?obj:{default:obj};}function _asyncToGenerator(fn){return function(){var gen=fn.apply(this,arguments);return new Promise(function(resolve,reject){function step(key,arg){try{var info=gen[key](arg);var value=info.value;}catch(error){reject(error);return;}if(info.done){resolve(value);}else{return Promise.resolve(value).then(function(value){step("next",value);},function(err){step("throw",err);});}}return step("next");});};}var RECONNECT=true;var MAX_RECONNECT_ATTEMPTS=9999;var RECONNECT_TIME_WAIT=1000;var DEFAULT_OPTIONS={nats:{reconnect:RECONNECT,maxReconnectAttempts:MAX_RECONNECT_ATTEMPTS,reconnectTimeWait:RECONNECT_TIME_WAIT}};var defineURL=function defineURL(url){if(!url||url.startsWith('nats://')){return url;}return'nats://'+url;};var defineServers=function defineServers(servers){if(!servers){return servers;}if(typeof servers==='string'){servers=servers.split(',');}return Array.isArray(servers)&&servers.map(function(url){return defineURL(url);})||servers;};var getURLOptions=function getURLOptions(options){var nats=options.nats;var url=defineURL(nats&&nats.url||process.env.NATS_URL);var servers=defineServers(nats&&nats.servers||process.env.NATS_SERVERS);return{url:url,servers:servers};};function SenecaNatsTransport(options){var getTransportOptions=function(){var _ref=_asyncToGenerator(regeneratorRuntime.mark(function _callee(args,type){return regeneratorRuntime.wrap(function _callee$(_context){while(1){switch(_context.prev=_context.next){case 0:if(options[type]){_context.next=2;break;}throw new Error('Invalid transport type or no config provide');case 2:return _context.abrupt('return',seneca.util.clean(seneca.util.deepextend({},options[type],args)));case 3:case'end':return _context.stop();}}},_callee,this);}));return function getTransportOptions(_x,_x2){return _ref.apply(this,arguments);};}();var getConnectionOptions=function(){var _ref2=_asyncToGenerator(regeneratorRuntime.mark(function _callee3(args,type,event){var _this=this;return regeneratorRuntime.wrap(function _callee3$(_context3){while(1){switch(_context3.prev=_context3.next){case 0:return _context3.abrupt('return',new Promise(function(){var _ref3=_asyncToGenerator(regeneratorRuntime.mark(function _callee2(resolve,reject){var transportOptions,clientName,connection;return regeneratorRuntime.wrap(function _callee2$(_context2){while(1){switch(_context2.prev=_context2.next){case 0:_context2.next=2;return getTransportOptions(args,type);case 2:transportOptions=_context2.sent;clientName=event+'-'+type;connection=_nats2.default.connect(options[type]);connection.on('connect',function(){seneca.log.info('client','open',transportOptions);return resolve({transportOptions:transportOptions,clientName:clientName,connection:connection});});connection.on('error',function(err){seneca.log.error('client','error',err);return reject(err);});case 7:case'end':return _context2.stop();}}},_callee2,_this);}));return function(_x6,_x7){return _ref3.apply(this,arguments);};}()));case 1:case'end':return _context3.stop();}}},_callee3,this);}));return function getConnectionOptions(_x3,_x4,_x5){return _ref2.apply(this,arguments);};}();var hook_client_nats=function(){var _ref4=_asyncToGenerator(regeneratorRuntime.mark(function _callee4(args,done){var seneca,type,_ref5,transportOptions,clientName,connection,onMakeClient;return regeneratorRuntime.wrap(function _callee4$(_context4){while(1){switch(_context4.prev=_context4.next){case 0:seneca=this;type=args.type;_context4.next=4;return getConnectionOptions(args,type,'client');case 4:_ref5=_context4.sent;transportOptions=_ref5.transportOptions;clientName=_ref5.clientName;connection=_ref5.connection;onMakeClient=function onMakeClient(spec,topic,next){var topicAct=topic+'_act';var topicRes=topic+' _res';var onSubscribe=function onSubscribe(message){seneca.log.debug('client','subscribe',topicRes,'message',message);TransportUtils.handle_response(seneca,TransportUtils.parseJSON(seneca,clientName,message),transportOptions);};var onNext=function onNext(message,cb,meta){seneca.log.debug('client','publish',topicAct,'message',message);connection.publish(topicAct,TransportUtils.stringifyJSON(seneca,clientName,TransportUtils.prepare_request(seneca,message,cb,meta)));};var onSenecaClose=function onSenecaClose(args,finish){var _this2=this;seneca.log.debug('client','close',transportOptions,'topic',topic);connection.close();connection.on('close',function(){_this2.prior(args,finish);});};seneca.log.info('client','subscribe',topicRes);connection.subscribe(topicRes,onSubscribe);next(null,onNext);seneca.add({role:'seneca',cmd:'close'},onSenecaClose);};TransportUtils.make_client(onMakeClient,transportOptions,done);case 10:case'end':return _context4.stop();}}},_callee4,this);}));return function hook_client_nats(_x8,_x9){return _ref4.apply(this,arguments);};}();var hook_listen_nats=function(){var _ref6=_asyncToGenerator(regeneratorRuntime.mark(function _callee5(msg,done){var seneca,args,type,_ref7,transportOptions,clientName,connection,clientOpts,onSenecaClose;return regeneratorRuntime.wrap(function _callee5$(_context5){while(1){switch(_context5.prev=_context5.next){case 0:seneca=this;args=msg;type=args.type;_context5.next=5;return getConnectionOptions(args,type,'listen');case 5:_ref7=_context5.sent;transportOptions=_ref7.transportOptions;clientName=_ref7.clientName;connection=_ref7.connection;clientOpts=transportOptions;TransportUtils.listen_topics(seneca,args,clientOpts,function(topic){var topicAct=topic+'_act';var topicRes=topic+'_res';var onSubscribe=function onSubscribe(args){seneca.log.debug('listen','subscribe',topicAct,'message',args);var onHandleRequest=function onHandleRequest(result){if(!result){return seneca.log.debug('listen','subscribe',topicAct,'handle_request','empty');}return connection.publish(topicRes,TransportUtils.stringifyJSON(seneca,clientName,result));};TransportUtils.handle_request(seneca,TransportUtils.parseJSON(seneca,clientName,args),clientOpts,onHandleRequest);};connection.subscribe(topicAct,onSubscribe);seneca.log.info('listen','subscribe',topicAct);});onSenecaClose=function onSenecaClose(args,finish){var _this3=this;seneca.log.debug('listen','close',clientOpts);connection.close();connection.on('close',function(){_this3.prior(args,finish);});};seneca.add({role:'seneca',cmd:'close'},onSenecaClose);done();case 14:case'end':return _context5.stop();}}},_callee5,this);}));return function hook_listen_nats(_x10,_x11){return _ref6.apply(this,arguments);};}();var seneca=this;var name='nats-transport';var TransportUtils=seneca.export('transport/utils');options=seneca.util.deepextend(DEFAULT_OPTIONS,seneca.options(),Object.assign({},options,getURLOptions(options)));seneca.add({role:'transport',hook:'listen',type:'nats'},hook_listen_nats);seneca.add({role:'transport',hook:'client',type:'nats'},hook_client_nats);seneca.add({role:'transport',hook:'listen',type:'pubsub'},hook_listen_nats);seneca.add({role:'transport',hook:'client',type:'pubsub'},hook_client_nats);return{name:name};}
