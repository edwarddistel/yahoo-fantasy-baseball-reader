#!/usr/bin/env node
import { run } from './cli.mjs';

run().catch((error) => {
  // Intentionally avoid logging error stacks or provider bodies; they can contain secrets.
  console.error(`${error.name || 'Error'}: ${error.message}`);
  process.exitCode = 1;
});
