#!/usr/bin/env bun

// Use the locked scanner API: its CLI can print ZIP errors while exiting zero.
const path = require('node:path');
const gscan = require('gscan');
const scannerPackage = require('gscan/package.json');

async function validate() {
  if (scannerPackage.version !== '6.7.0') throw new Error('Expected locked GScan 6.7.0');
  const options = {checkVersion: 'v6'};
  const theme = gscan.format(await gscan.checkZip(path.resolve('dist/attegi.zip'), options), options);
  if (theme.checkedVersion !== '6.x' || !Array.isArray(theme.results.error)) {
    throw new Error('Unrecognized GScan result');
  }
  console.log(JSON.stringify({
    scanner: scannerPackage.version,
    checkedVersion: theme.checkedVersion,
    errors: theme.results.error.length,
    warnings: theme.results.warning.length,
    recommendations: theme.results.recommendation.length
  }));
  if (theme.results.hasFatalErrors || theme.results.error.length) {
    throw new Error('GScan rejected the theme');
  }
  console.log('Your theme is compatible with Ghost 6.x');
}

validate().catch(error => {
  console.error('[Error]', error.message);
  process.exitCode = 1;
});
