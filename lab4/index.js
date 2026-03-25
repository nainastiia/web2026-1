const { Command } = require("commander");
const fs = require("fs");
const http = require("http");
const { XMLBuilder } = require("fast-xml-parser");

const program = new Command();

program
  .requiredOption("-i, --input <path>", "input file path")
  .requiredOption("-H, --host <host>", "server host")
  .requiredOption("-p, --port <port>", "server port")
  .parse(process.argv);

const options = program.opts();

const builder = new XMLBuilder({
  format: true,
  arrayNodeName: "passenger"
});

if (!fs.existsSync(options.input)) {
  console.log("Cannot find input file");
  process.exit(1);
}

const server = http.createServer((req, res) => {
  fs.readFile(options.input, "utf-8", (err, data) => {
    if (err) {
      res.writeHead(500);
      return res.end("Error reading file");
    }

    const passengers = JSON.parse(data);

    const url = new URL(req.url, `http://${options.host}:${options.port}`);

    const survived = url.searchParams.get("survived");
    const age = url.searchParams.get("age");

    let resultData = passengers;

    // фільтр виживших
    if (survived === "true") {
      resultData = resultData.filter(p => p.Survived === 1);
    }

    const result = resultData.map(p => {
      let obj = {
        name: p.Name,
        ticket: p.Ticket
      };

      if (age === "true") {
        obj.age = p.Age;
      }

      return obj;
    });

    const xml = `<passengers>${builder.build({ passenger: result })}</passengers>`;

    res.writeHead(200, { "Content-Type": "application/xml" });
    res.end(xml);
  });
});

server.listen(options.port, options.host, () => {
  console.log(`Server running at http://${options.host}:${options.port}/`);
});