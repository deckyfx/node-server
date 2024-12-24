import {
  server,
  any,
  onError,
  get,
  post,
  HTMLDocumentation,
} from "../src/index";

import fs from "node:fs";
import path from "node:path";

const hostname = "0.0.0.0";
const port = 3000;

any("/", async function _any(handle) {
  handle.json({ result: "OK" });
  return true;
});

post(
  "/test",
  async function _post(handle) {
    console.log(handle.body);
    handle.json({ result: "OK", ...handle.body });
    return true;
  },
  {
    description: "This is any route to trap all incoming request",
    body: {
      hello: "This is a body",
    },
  }
);

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

get(
  "/:a/x",
  async function _html(handle) {
    handle.json({ ...handle.qs, ...handle.path_data });
    return true;
  },
  {
    description: "This is any route to trap all incoming request",
    params: {
      a: "Test Path Data",
    },
    query: {
      b: "Test Params",
    },
  }
);

get("/docs", HTMLDocumentation);

onError(async function _error(handle) {
  const { req, res, ...data } = handle;
  console.log(data);
});

server.listen(port, hostname, () => {
  console.log(`Server running at http://${hostname}:${port}/`);
});
