/**
 * Verifier process
 * Pokemon Showdown - http://pokemonshowdown.com/
 *
 * This is just an asynchronous implementation of a verifier for a
 * signed key, because Node.js's crypto functions are synchronous,
 * strangely, considering how everything else is asynchronous.
 *
 * I wrote this one day hoping it would help with performance, but
 * I don't think it had any noticeable effect.
 *
 * @license MIT license
 */

'use strict';

const crypto = require('crypto');
const ProcessManager = require('./process-manager');

const PM = exports.PM = new ProcessManager({
	maxProcesses: 1,
	execFile: 'verifier.js',
	onMessageUpstream: function (message) {
		// Protocol:
		// success: "[id]|1"
		// failure: "[id]|0"
		let pipeIndex = message.indexOf('|');
		let id = +message.substr(0, pipeIndex);
		let result = Boolean(~~message.slice(pipeIndex + 1));

		if (this.pendingTasks.has(id)) {
			this.pendingTasks.get(id)(result);
			this.pendingTasks.delete(id);
			this.release();
		}
	},
	onMessageDownstream: function (message) {
		// protocol:
		// "[id]|{data, sig}"
		let pipeIndex = message.indexOf('|');
		let id = message.substr(0, pipeIndex);

		let data = JSON.parse(message.slice(pipeIndex + 1));
		process.send(id + '|' + this.receive(data));
	},
	receive: function (data) {
		let verifier = crypto.createVerify(Config.loginserverkeyalgo);
		verifier.update(data.data);
		let success = false;
		try {
			success = verifier.verify(Config.loginserverpublickey, data.sig, 'hex');
		} catch (e) {}

		return success ? 1 : 0;
	},
});

if (process.send && module === process.mainModule) {
	// This is a child process!

	global.Config = require('./config/config.js');

	require('./repl.js').start('verifier', cmd => eval(cmd));

	process.on('message', message => PM.onMessageDownstream(message));
	process.on('disconnect', () => process.exit());
}

exports.verify = function (data, signature) {
	return PM.send({data: data, sig: signature});
};
