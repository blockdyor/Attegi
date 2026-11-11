#!/usr/bin/env bun

/** Package only the reviewed Ghost theme files, never the surrounding workspace. */
const { ZipArchive } = require('archiver');
const fs = require('node:fs');
const path = require('node:path');
const themeFiles = require('./theme-files.json');

async function compress() {
  console.log('\n========================================');
  console.log('  Attegi Theme Compression');
  console.log('========================================\n');

  const root = process.cwd();
  const pkg = await Bun.file(path.join(root, 'package.json')).json();
  if (pkg.name !== 'attegi') throw new Error('Theme package identity must be attegi');
  if (!Array.isArray(themeFiles) || new Set(themeFiles).size !== themeFiles.length) {
    throw new Error('Theme file manifest must be a unique list');
  }

  // Validate every selected component before touching an existing upload archive.
  for (const name of themeFiles) {
    if (typeof name !== 'string' || path.isAbsolute(name) || /[\\:\0]/.test(name)) {
      throw new Error('Unsafe theme manifest path');
    }
    const parts = name.split('/');
    const directory = name.endsWith('/');
    if (directory) parts.pop();
    if (!parts.length || parts.some(part => !part || part === '.' || part === '..')) {
      throw new Error('Unsafe theme manifest path');
    }
    let selected = root;
    let info;
    for (const part of parts) {
      selected = path.join(selected, part);
      info = fs.lstatSync(selected);
      if (info.isSymbolicLink()) throw new Error(`Selected theme path is a symlink: ${name}`);
    }
    if (directory ? !info.isDirectory() : !info.isFile()) {
      throw new Error(`Unexpected theme file type: ${name}`);
    }
  }

  const dist = path.join(root, 'dist');
  if (fs.existsSync(dist) && (!fs.lstatSync(dist).isDirectory() || fs.lstatSync(dist).isSymbolicLink())) {
    throw new Error('dist must be a real directory');
  }
  fs.mkdirSync(dist, {recursive: true});
  const outputPath = path.join(dist, 'attegi.zip');
  if (fs.existsSync(outputPath) && (!fs.lstatSync(outputPath).isFile() || fs.lstatSync(outputPath).isSymbolicLink())) {
    throw new Error('Existing attegi.zip must be a regular file');
  }
  const temporary = fs.mkdtempSync(path.join(dist, '.attegi-'));
  const tempZip = path.join(temporary, 'attegi.zip');
  const output = fs.createWriteStream(tempZip);
  const archive = new ZipArchive({zlib: {level: 9}});

  try {
    await new Promise((resolve, reject) => {
      output.once('close', resolve);
      output.once('error', reject);
      archive.once('warning', reject);
      archive.once('error', reject);
      archive.pipe(output);
      for (const name of themeFiles) {
        if (name.endsWith('/')) archive.append('', {name, type: 'directory'});
        else archive.file(path.join(root, name), {name});
      }
      archive.finalize().catch(reject);
    });
    fs.renameSync(tempZip, outputPath);
    console.log(`\n[Done] Created ${outputPath}`);
    console.log(`       Size: ${(fs.statSync(outputPath).size / 1024).toFixed(2)} KB`);
  } finally {
    archive.abort();
    output.destroy();
    fs.rmSync(temporary, {recursive: true, force: true});
  }
}

compress().catch(error => {
  console.error('[Error]', error.message);
  process.exit(1);
});
