import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNdjsonParser, encodePlaygroundEvent } from '../lib/playground-stream.js';

test('NDJSON parser preserves fragmented event order', () => {
  const events = [];
  const parser = createNdjsonParser((event) => events.push(event));
  const payload =
    encodePlaygroundEvent({ type: 'state', state: 'STARTING' }) +
    encodePlaygroundEvent({ type: 'stdout', data: 'hello\n' }) +
    encodePlaygroundEvent({ type: 'result', resultState: 'SUCCEEDED' });

  parser.push(payload.slice(0, 7));
  parser.push(payload.slice(7, 31));
  parser.push(payload.slice(31));
  parser.finish();

  assert.deepEqual(events.map((event) => event.type), ['state', 'stdout', 'result']);
  assert.equal(events[1].data, 'hello\n');
});

test('NDJSON parser accepts a final event without a newline', () => {
  const events = [];
  const parser = createNdjsonParser((event) => events.push(event));
  parser.push('{"type":"stdout","data":"done"}');
  parser.finish();
  assert.equal(events.length, 1);
  assert.equal(events[0].data, 'done');
});

test('NDJSON parser rejects malformed events', () => {
  const parser = createNdjsonParser(() => {});
  assert.throws(() => parser.push('{"notType":true}\n'), /Invalid playground stream event/);
});
