const MAX_ARGS = 20;
const MAX_ARG_LENGTH = 256;
const MAX_TOTAL_ARG_LENGTH = 2048;

function flagAliases(name) {
  return name.match(/--?[A-Za-z0-9-]+/g) || [];
}

function baseFlag(arg) {
  const index = arg.indexOf('=');
  if (index === -1) return { name: arg, inlineValue: undefined };
  return { name: arg.slice(0, index), inlineValue: arg.slice(index + 1) };
}

function parseCommandArgs(meta, args) {
  if (!Array.isArray(args)) {
    return { error: 'Arguments must be an array of strings' };
  }
  if (args.length > MAX_ARGS) {
    return { error: `Too many arguments (maximum ${MAX_ARGS})` };
  }

  let totalLength = 0;
  for (const arg of args) {
    if (typeof arg !== 'string') {
      return { error: 'Every argument must be a string' };
    }
    if (arg.length > MAX_ARG_LENGTH) {
      return { error: `Argument exceeds ${MAX_ARG_LENGTH} characters` };
    }
    totalLength += arg.length;
  }
  if (totalLength > MAX_TOTAL_ARG_LENGTH) {
    return { error: 'Combined argument length is too large' };
  }

  const definitions = new Map();
  for (const flag of meta.flags || []) {
    for (const alias of flagAliases(flag.name)) {
      definitions.set(alias, flag);
    }
  }

  const options = new Map();
  const positionals = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (!arg.startsWith('-') || arg === '-') {
      positionals.push(arg);
      continue;
    }

    const { name, inlineValue } = baseFlag(arg);
    const definition = definitions.get(name);
    if (!definition) {
      return { error: `Flag '${name}' not allowed for '${meta.name}' in playground` };
    }

    let value = inlineValue;
    if (definition.type === 'boolean') {
      if (value !== undefined && value !== 'true' && value !== 'false') {
        return { error: `Boolean flag '${name}' must be true or false` };
      }
      value = value ?? 'true';
    } else if (value === undefined) {
      if (i + 1 >= args.length) {
        return { error: `Flag '${name}' requires a value` };
      }
      value = args[++i];
    }

    if (value === '') {
      return { error: `Flag '${name}' requires a non-empty value` };
    }

    const key = definition.name;
    const entries = options.get(key) || [];
    entries.push({ alias: name, value });
    options.set(key, entries);
  }

  return { options, positionals };
}

function getEntries(parsed, flagName) {
  for (const [key, entries] of parsed.options.entries()) {
    if (flagAliases(key).includes(flagName)) return entries;
  }
  return [];
}

function requireNoPositionals(command, parsed) {
  if (parsed.positionals.length > 0) {
    return `Unexpected positional argument '${parsed.positionals[0]}' for '${command}'`;
  }
  return undefined;
}

function parseBoundedInteger(entries, label, min, max) {
  if (entries.length === 0) return undefined;
  if (entries.length > 1) return `${label} may only be specified once`;
  const value = Number(entries[0].value);
  if (!Number.isInteger(value) || value < min || value > max) {
    return `${label} must be an integer between ${min} and ${max}`;
  }
  return undefined;
}

export function validatePlaygroundCommand(command, args, commands, configKeys, scratchDir) {
  if (typeof command !== 'string' || command.length === 0 || command.length > 32) {
    return { valid: false, error: 'Invalid command' };
  }

  const meta = commands.find((entry) => entry.name === command);
  if (!meta) {
    return { valid: false, error: `Command '${command}' not allowed in playground` };
  }

  const parsed = parseCommandArgs(meta, args);
  if (parsed.error) {
    return { valid: false, error: parsed.error };
  }

  if (command === 'config') {
    const positional = parsed.positionals;
    if (positional.length === 0) return { valid: true };
    if (positional.length === 1 && (positional[0] === 'show' || positional[0] === 'path')) {
      return { valid: true };
    }
    if (positional[0] === 'set') {
      if (positional.length !== 3) {
        return { valid: false, error: 'config set requires exactly: set <key> <value>' };
      }
      if (!configKeys.includes(positional[1])) {
        return { valid: false, error: `Invalid config key: ${positional[1]}` };
      }
      return { valid: true };
    }
    return { valid: false, error: 'Only config show, config path, and config set are allowed' };
  }

  const positionalError = requireNoPositionals(command, parsed);
  if (positionalError) return { valid: false, error: positionalError };

  if (command === 'run') {
    if (getEntries(parsed, '--schedule').length || getEntries(parsed, '--daemon').length) {
      return {
        valid: false,
        error: 'Scheduled/daemon mode is disabled in the disposable playground',
      };
    }
    const countError = parseBoundedInteger(
      getEntries(parsed, '--count'),
      'Playground --count',
      1,
      5
    );
    if (countError) return { valid: false, error: countError };
  }

  if (command === 'logs') {
    if (getEntries(parsed, '--tail').length) {
      return {
        valid: false,
        error: 'Streaming --tail mode is disabled in the disposable playground',
      };
    }
    const linesError = parseBoundedInteger(
      getEntries(parsed, '--lines'),
      'Playground log line count',
      1,
      200
    );
    if (linesError) return { valid: false, error: linesError };
  }

  if (command === 'init') {
    const commitsError = parseBoundedInteger(
      getEntries(parsed, '--commits'),
      'Playground --commits',
      1,
      10
    );
    if (commitsError) return { valid: false, error: commitsError };

    const repoEntries = getEntries(parsed, '--repo');
    if (repoEntries.length > 1) {
      return { valid: false, error: '--repo may only be specified once' };
    }
    if (
      repoEntries.length === 1 &&
      repoEntries[0].value !== '.' &&
      repoEntries[0].value !== scratchDir
    ) {
      return {
        valid: false,
        error: 'Playground --repo is restricted to the disposable scratch repository',
      };
    }
  }

  return { valid: true };
}

export function validatePlaygroundRequestBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { valid: false, error: 'Request body must be a JSON object' };
  }
  if (typeof body.sessionId !== 'string' || body.sessionId.length < 1 || body.sessionId.length > 128) {
    return { valid: false, error: 'Invalid sessionId' };
  }
  if (
    typeof body.idempotencyKey !== 'string' ||
    body.idempotencyKey.length < 1 ||
    body.idempotencyKey.length > 128
  ) {
    return { valid: false, error: 'Invalid idempotencyKey' };
  }
  if (typeof body.command !== 'string') {
    return { valid: false, error: 'Invalid command' };
  }
  if (!Array.isArray(body.args)) {
    return { valid: false, error: 'args must be an array' };
  }
  return { valid: true };
}
