const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { Command } = require('commander');
const superagent = require('superagent');

const program = new Command();

// 1. Setup CLI arguments
program
  .requiredOption('-h, --host <address>', 'Server host address')
  .requiredOption('-p, --port <number>', 'Server port number')
  .requiredOption('-c, --cache <path>', 'Directory path for cached files')
  .parse(process.argv);

const options = program.opts();

// Helper to get the absolute path for a cached image
const getFilePath = (url) => {
  const code = url.slice(1); // e.g., "/200" -> "200"
  return path.join(path.resolve(options.cache), `${code}.jpg`);
};

// 2. Create the server
const server = http.createServer(async (req, res) => {
  const filePath = getFilePath(req.url);
  const statusCode = req.url.slice(1);

  // Basic validation to ensure the path is a number
  if (!statusCode || isNaN(statusCode)) {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    return res.end('Bad Request: Please provide a valid HTTP status code (e.g., /200)');
  }

  switch (req.method) {
    case 'GET':
      try {
        // Attempt to read from the local cache
        const data = await fs.readFile(filePath);
        console.log(`[CACHE HIT] Serving ${statusCode}.jpg from local storage`);
        res.writeHead(200, { 'Content-Type': 'image/jpeg' });
        res.end(data);
      } catch (err) {
        // [Part 3 Logic]: Fetch from http.cat if not in cache
        console.log(`[CACHE MISS] Fetching ${statusCode} from http.cat...`);
        try {
          const response = await superagent
            .get(`https://http.cat/${statusCode}`)
            .buffer(true); // Get raw binary data

          const imageBuffer = response.body;

          // Save to cache for future requests
          await fs.writeFile(filePath, imageBuffer);
          console.log(`[CACHE] Saved ${statusCode}.jpg to disk`);

          res.writeHead(200, { 'Content-Type': 'image/jpeg' });
          res.end(imageBuffer);
        } catch (fetchErr) {
          // If http.cat returns an error (e.g., 404 for an invalid cat code)
          console.error(`[ERROR] Failed to fetch from http.cat: ${fetchErr.message}`);
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('Not Found');
        }
      }
      break;

    case 'PUT':
      try {
        const chunks = [];
        for await (const chunk of req) {
          chunks.push(chunk);
        }
        await fs.writeFile(filePath, Buffer.concat(chunks));
        res.writeHead(201, { 'Content-Type': 'text/plain' });
        res.end('Created');
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Internal Server Error');
      }
      break;

    case 'DELETE':
      try {
        await fs.unlink(filePath);
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('OK');
      } catch (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
      }
      break;

    default:
      res.writeHead(405, { 'Content-Type': 'text/plain' });
      res.end('Method Not Allowed');
  }
});

// 3. Start the server
server.listen(parseInt(options.port), options.host, () => {
  console.log(`Proxy server started at http://${options.host}:${options.port}`);
});