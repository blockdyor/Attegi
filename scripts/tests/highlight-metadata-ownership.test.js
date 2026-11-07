import { test } from 'bun:test';
import { groups } from './fixtures/highlight-metadata-checks.cjs';
for (const [name, run] of Object.entries(groups)) test(`matcher metadata: ${name}`, run, 30000);
