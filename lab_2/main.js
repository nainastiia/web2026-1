const { URL } = require('url');

const date = "20240801";
const time_period = "m";

const url = new URL("https://bank.gov.ua/");

url.pathname = "NBUStatService/v1/statdirectory/banksincexp";

url.searchParams.append("date", date);
url.searchParams.append("period", time_period);
url.searchParams.append("json", "");

console.log(url.toString());
