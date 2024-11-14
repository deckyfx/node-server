import { server, any, onError, get, post, routes } from "../src/index";

import fs from "node:fs";
import path from "node:path";

const hostname = "0.0.0.0";
const port = 3000;

any("/", async function _any(handle) {
  handle.json({ result: "OK" });
  return true;
});

post("/test", async function _post(handle) {
  handle.json({ result: "OK", ...handle.body });
  return true;
});

get("/html", async function _html(handle) {
  handle.html(handle.readFile("assets", "public", "file.html"));
  return true;
});

get("/apk", async function _html(handle) {
  fs.readdir("./public", (err, files) => {
    const found = files.some((file) => {
      const ext = path.extname(file);
      if (ext === ".apk") {
        handle.sendFile(true, "public", file);
        return true;
      }
      return false;
    });
    if (!found) {
      handle.json({ error: "File not found" });
    }
  });
  return true;
});

get("/:a/x", async function _html(handle) {
  handle.json(handle.qs);
  return true;
});

onError(async function _error(handle) {
  const { req, res, ...data } = handle;
  console.log(data);
});

server.listen(port, hostname, () => {
  console.log(`Server running at http://${hostname}:${port}/`);
});
