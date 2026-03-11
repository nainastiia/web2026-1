const { Command } = require("commander");
const fs = require("fs");

const program = new Command();

program
  .option("-i, --input <path>", "input file")
  .option("-o, --output <path>", "output file")
  .option("-d, --display", "display result")
  .option("--date", "show date")
  .option("-a, --airtime <number>", "filter by airtime");

program.parse(process.argv);

const options = program.opts();

if (!options.input) {
  console.error("Please, specify input file");
  process.exit(1);
}
if (!fs.existsSync(options.input)) {
  console.error("Cannot find input file");
  process.exit(1);
}

const content = fs.readFileSync(options.input, "utf8");
const lines = content.trim().split("\n");
let result = [];

for (let line of lines) {
  const flight = JSON.parse(line);

  if (options.airtime && flight.AIR_TIME <= Number(options.airtime)) {
    continue;
  }
  let outputLine = "";

  if (options.date) {
    outputLine += flight.FL_DATE + " ";
  }

  outputLine += flight.AIR_TIME + " " + flight.DISTANCE;
  result.push(outputLine);
}

const output = result.join("\n");

if (options.output) {
  fs.writeFileSync(options.output, output);
}
if (options.display) {
  console.log(output);
}
