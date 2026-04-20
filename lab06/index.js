const http = require('http');
const fs = require('fs');
const path = require('path');
const { program } = require('commander');

program
  .requiredOption('-h, --host <address>', 'server address')
  .requiredOption('-p, --port <number>', 'server port')
  .requiredOption('-c, --cache <path>', 'path to cache directory')
  .parse(process.argv);

const options = program.opts();

const cachePath = path.resolve(options.cache);

if (!fs.existsSync(cachePath)) {
  try {
    fs.mkdirSync(cachePath, { recursive: true });
    console.log(`Cache directory created: ${cachePath}`);
  } catch (err) {
    console.error(`Error creating directory: ${err.message}`);
    process.exit(1);
  }
}

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Inventory Service is running\n');
});

server.listen(options.port, options.host, () => {
  console.log(`Server is running at http://${options.host}:${options.port}/`);
  console.log(`Cache path is set to: ${cachePath}`);
});