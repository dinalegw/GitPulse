export const PLAYGROUND_STREAM_CONTENT_TYPE = 'application/x-ndjson; charset=utf-8';

export function encodePlaygroundEvent(event) {
  return JSON.stringify(event) + '\n';
}

export function createNdjsonParser(onEvent) {
  let buffer = '';

  function parseLine(line) {
    const trimmed = line.trim();
    if (!trimmed) return;
    const value = JSON.parse(trimmed);
    if (!value || typeof value !== 'object' || typeof value.type !== 'string') {
      throw new Error('Invalid playground stream event');
    }
    onEvent(value);
  }

  return {
    push(chunk) {
      buffer += chunk;
      let newline = buffer.indexOf('\n');
      while (newline !== -1) {
        parseLine(buffer.slice(0, newline));
        buffer = buffer.slice(newline + 1);
        newline = buffer.indexOf('\n');
      }
    },
    finish() {
      if (buffer.trim()) parseLine(buffer);
      buffer = '';
    },
  };
}
