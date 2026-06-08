const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

function makeClassList() {
	const values = new Set();
	return {
		add: (...names) => names.forEach((name) => values.add(name)),
		remove: (...names) => names.forEach((name) => values.delete(name)),
		contains: (name) => values.has(name),
	};
}

function input(value = '') {
	return {
		value,
		classList: makeClassList(),
		addEventListener: () => {},
	};
}

function spanBox() {
	return {
		innerHTML: '',
		querySelector: () => ({innerText: ''}),
	};
}

function buildContext() {
	const fieldset = {
		disabled: false,
		setAttribute: (name) => {
			if (name === 'disabled') fieldset.disabled = true;
		},
		removeAttribute: (name) => {
			if (name === 'disabled') fieldset.disabled = false;
		},
	};
	const sendRoot = {
		querySelector: (selector) => {
			if (selector === 'fieldset') return fieldset;
			if (selector === '.is-invalid') {
				return context.$sendToVal.classList.contains('is-invalid') ||
					context.$sendAmountVal.classList.contains('is-invalid') ? {} : null;
			}
			return {addEventListener: () => {}, reset: () => {}};
		},
	};
	let fetchCalls = 0;
	let lastFetchParams;
	const context = {
		console,
		URL,
		btoa: (value) => Buffer.from(value).toString('base64'),
		document: {addEventListener: () => {}},
		window: {location: {hash: ''}, scrollTo: () => {}},
		localStorage: {nodeAddress: 'http://rpc-user:rpc-pass@127.0.0.1:8332'},
		storage: {addresses: {fromAddress: {private: 'priv', balance: 1000, input_count: 0}}},
		coinPrice: {price: 1},
		sb: {
			toSatoshi: (value) => Math.round(Number(value) * 100),
			toBitcoin: (value) => String(value / 100),
		},
		Transaction: function Transaction() {},
		Option: function Option(text, value) { this.text = text; this.value = value; },
		Swal: {fire: () => ({then: () => {}})},
		initHtmlElements: () => {},
		formHandler: () => {},
		show: () => {},
		hide: () => {},
		getAddressUtxo: () => {},
		getBalanceSum: () => {},
		saveToCryptoStorage: () => {},
		fetchQuery: (url, onSuccess, params) => {
			fetchCalls++;
			lastFetchParams = {url, params};
			onSuccess({result: 'txid'});
		},
		isAddressValid: (value) => value === 'validAddress',
		$sendFromVal: input('fromAddress'),
		$sendBalance: spanBox(),
		$sendToVal: input('validAddress'),
		$sendAmountVal: input('1'),
		$sendAmountMax: {addEventListener: () => {}},
		$sendAmountPrice: spanBox(),
		$sendFeeVal: input('0.1'),
		$sendFormBtn: {innerHTML: ''},
		$sendNewBalance: spanBox(),
		$send: sendRoot,
		$welcome: {},
		$dashboard: {},
		$myAddresses: {},
		$newAddress: {},
		$transactions: {},
		$setPassword: {},
		$mobileMenu: {},
		$main: {},
	};
	Object.defineProperties(context, {
		fetchCalls: {get: () => fetchCalls},
		lastFetchParams: {get: () => lastFetchParams},
		fieldset: {get: () => fieldset},
	});
	return context;
}

const source = fs.readFileSync('src/send/send.js', 'utf8');
const assertions = `
(function runSendPreflightAssertions() {
	$sendToVal.value = 'invalidAddress';
	send();
	assert.strictEqual(fetchCalls, 0, 'invalid recipient must not call sendrawtransaction');
	assert.strictEqual($sendToVal.classList.contains('is-invalid'), true, 'invalid recipient is marked invalid at submit time');
	assert.strictEqual(fieldset.disabled, false, 'invalid recipient must not disable the form');

	$sendToVal.value = 'validAddress';
	$sendToVal.classList.remove('is-invalid');
	newTx = null;
	sendParams = {fromAmount: 1000};
	send();
	assert.strictEqual(fetchCalls, 0, 'empty serialized transaction must not call sendrawtransaction');
	assert.strictEqual(fieldset.disabled, false, 'empty transaction must not disable the form');

	newTx = '01000000';
	sendParams = {fromAmount: 1000};
	send();
	assert.strictEqual(fetchCalls, 1, 'valid preflight calls sendrawtransaction exactly once');
	assert.strictEqual(fieldset.disabled, true, 'valid preflight disables the form while sending');
	assert.strictEqual(lastFetchParams.url, 'http://127.0.0.1:8332');
	assert.strictEqual(lastFetchParams.params.headers.Authorization, 'Basic cnBjLXVzZXI6cnBjLXBhc3M=');
	assert.ok(lastFetchParams.params.body.includes('sendrawtransaction'), 'RPC body sends transaction');
	assert.ok(lastFetchParams.params.body.includes('01000000'), 'RPC body includes serialized transaction');
})();
`;
const context = buildContext();
context.assert = assert;
vm.createContext(context);
vm.runInContext(source + assertions, context, {filename: 'send_preflight_vm.js'});
console.log('send preflight tests passed');
