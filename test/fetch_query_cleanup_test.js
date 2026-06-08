const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'api.js'), 'utf8');

const createContext = (fetchImpl) => {
	const swalCalls = [];
	const context = {
		fetch: fetchImpl,
		Swal: {
			fire: (params) => {
				swalCalls.push(params);
			},
		},
	};
	context.global = context;
	vm.createContext(context);
	vm.runInContext(`${source}\nthis.fetchQuery = fetchQuery;`, context);
	context.swalCalls = swalCalls;
	return context;
};

const flushPromises = () => new Promise((resolve) => setImmediate(resolve));

const testRejectedFetchRunsCleanupBeforeAlert = async () => {
	const events = [];
	// Matches the string branch already used by the wallet's CORS-help path.
	// eslint-disable-next-line prefer-promise-reject-errors
	const context = createContext(() => Promise.reject('TypeError: Failed to fetch'));

	context.Swal.fire = (params) => {
		events.push('alert');
		context.swalCalls.push(params);
	};

	context.fetchQuery(
		'https://node.example/rpc',
		() => events.push('success'),
		null,
		null,
		() => events.push('cleanup'),
	);

	await flushPromises();
	await flushPromises();

	assert.deepStrictEqual(events, [ 'cleanup', 'alert' ]);
	assert.strictEqual(context.swalCalls.length, 1);
	assert.match(context.swalCalls[0].html, /Maybe it is CORS!/);
};

const testErrorResponseRunsCleanupOnce = async () => {
	let cleanupCount = 0;
	const context = createContext(() => Promise.resolve({
		json: () => Promise.resolve({ error: { message: 'bad tx' } }),
	}));

	context.fetchQuery(
		'https://node.example/rpc',
		() => assert.fail('success callback should not run for error response'),
		null,
		() => ({ message: 'mapped error' }),
		() => { cleanupCount++; },
	);

	await flushPromises();
	await flushPromises();

	assert.strictEqual(cleanupCount, 1);
	assert.strictEqual(context.swalCalls.length, 1);
	assert.strictEqual(context.swalCalls[0].html, 'mapped error');
};

(async () => {
	await testRejectedFetchRunsCleanupBeforeAlert();
	await testErrorResponseRunsCleanupOnce();
	console.log('fetchQuery cleanup tests passed');
})().catch((error) => {
	console.error(error);
	process.exit(1);
});
