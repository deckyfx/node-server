import { server, any, onError, get, post, routes } from "../src/index";

const hostname = "0.0.0.0";
const port = 3000;

any("/", async function _any(handle) {
  handle.json({ result: "OK" });
  return true;
});

post("/test", async function _post(handle) {
  handle.json({ result: "OK", ...(handle.body) });
  return true;
});

get("/html", async function _html(handle) {
  handle.html(handle.readFile("assets", "public", "file.html"));
  return true;
});

onError(async function _error(handle) {
  const { req, res, ...data } = handle;
  console.log(data);
});

server.listen(port, hostname, () => {
  console.log(`Server running at http://${hostname}:${port}/`);
});
