import { server, any, json, onError } from "../src/index";

const hostname = "0.0.0.0";
const port = 3000;

any("/", async (req, res, data) => {
  console.log(req.headers, data);
  json(res, { result: "OK" });
  return true;
});

onError(async (req, res, data) => {
  console.log(data);
});

server.listen(port, hostname, () => {
  console.log(`Server running at http://${hostname}:${port}/`);
});
