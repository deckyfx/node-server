import http from "node:http";
import path from "node:path";
import fs from "node:fs";
import EventEmitter from "node:events";
import { AsyncLocalStorage } from "node:async_hooks";

import {
  Cookie,
  getMimeType,
  isFile,
  renderTemplate,
  resolveFile,
  Session,
} from "./utils";

let UNDER_MAINTENANCE = false;

let CORS_ENABLED = true;

let PUBLIC_DIR = path.join(".", "public");

let UPLOAD_DIR = path.join(".", "uploads");

type ObjectValues<T> = T[keyof T];

export const RequestType = {
  ROUTE: "route",
  INDEX: "index",
  FILE: "file",
  ERROR: "error",
} as const;

export const RequestMethod = {
  GET: "GET",
  POST: "POST",
  PUT: "PUT",
  DELETE: "DELETE",
  OPTIONS: "OPTIONS",
} as const;

export type RequestType = ObjectValues<typeof RequestType>;

export type RequestMethod = ObjectValues<typeof RequestMethod>;

export type RouteDoc = {
  route?: string;
  method?: string;
  description?: string;
  params?: Record<string, string>;
  query?: Record<string, string>;
  body?: Record<string, string>;
  response?: string;
};

/*
 * RequestData
 * @type [P] Post Data
 * @type [A] Path Data
 * @type [Q] Query String Data
 * @type [Q] Cookie Data
 * @type [Q] Session Data
 */
export type RequestData<
  P extends Record<string, any> = {},
  A extends Record<string, any> = {},
  Q extends Record<string, any> = {},
  C extends Record<string, any> = {},
  S extends Record<string, any> = {}
> = {
  body?: P;
  cookies?: Cookie<C>;
  error?: Error;
  handle?: RouteHandler<P, A, Q>;
  method: RequestMethod;
  path: string;
  path_data?: A;
  qs?: Q;
  session?: Session<S>;
  status: number;
  type: RequestType;
};

export class HTTPHandler<
  P extends Record<string, any> = {},
  A extends Record<string, any> = {},
  Q extends Record<string, any> = {},
  C extends Record<string, any> = {},
  S extends Record<string, any> = {}
> {
  public readonly body?: P;
  public readonly cookies?: Cookie<C>;
  public readonly error?: Error;
  public readonly method: RequestMethod;
  public readonly path: string;
  public readonly path_data?: A;
  public readonly qs?: Q;
  public readonly session?: Session<S>;
  public readonly status: number;
  public readonly type: RequestType;

  constructor(
    public readonly req: http.IncomingMessage,
    public readonly res: http.ServerResponse,
    data: RequestData
  ) {
    this.body = data.body as P;
    this.cookies = data.cookies as Cookie<C>;
    this.error = data.error;
    this.method = data.method;
    this.path = data.path;
    this.path_data = data.path_data as A;
    this.qs = data.qs as Q;
    this.session = data.session as Session<S>;
    this.status = data.status;
    this.type = data.type;
  }

  text(data: any) {
    this.res.writeHead(200, { "Content-Type": "text/plain" });
    this.res.end(data);
  }

  json(data: any, status: number = 200) {
    this.res.writeHead(status, { "Content-Type": "application/json" });
    this.res.end(JSON.stringify(data));
  }

  html(data: string, status: number = 200) {
    this.res.writeHead(status, { "Content-Type": "text/html" });
    this.res.end(data);
  }

  redirect(url: string, status: number = 302) {
    this.res.writeHead(status, { Location: url });
    this.res.end();
  }

  err(error: Error, status: number = 500) {
    this.res.writeHead(status, { "Content-Type": "text/plain" });
    this.res.end(error.message);
  }

  cors() {
    this.res.setHeader("Access-Control-Allow-Origin", "*"); // Allow requests from any origin
    this.res.setHeader(
      "Access-Control-Allow-Methods",
      "GET, POST, PUT, DELETE, OPTIONS"
    ); // Allow these HTTP methods
    this.res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization"
    ); // Allow these headers
    this.res.setHeader("Access-Control-Max-Age", 3600); // Set cache duration for pre-flight responses
  }

  end(chunk?: any) {
    this.res.end(chunk);
  }

  template(template: string, data?: any) {
    return renderTemplate(template, data);
  }

  readFile(...paths: string[]) {
    const data = resolveFile(path.join(...paths), "utf-8") as string | Error;
    if (data instanceof Error) {
      return "";
    }
    return data;
  }

  sendFile(disposition: boolean = true, ...paths: string[]) {
    const filePath = path.join(...paths);
    fs.stat(filePath, (err, stats) => {
      if (err) {
        this.err(new Error("File not found"), 404);
        return;
      }

      const mimeType = getMimeType(filePath);
      if (disposition) {
        this.res.setHeader(
          "Content-Disposition",
          `attachment; filename="${path.basename(filePath)}"`
        );
      }
      this.res.setHeader("Content-Type", mimeType);
      this.res.setHeader("Content-Length", stats.size);

      const readStream = fs.createReadStream(filePath);
      readStream.pipe(this.res);
    });
  }
}

export type RouteHandler<
  P extends Record<string, any> = {},
  A extends Record<string, any> = {},
  Q extends Record<string, any> = {},
  C extends Record<string, any> = {},
  S extends Record<string, any> = {}
> = (
  handle: HTTPHandler<P, A, Q, C, S>
) => Promise<boolean | undefined | null | void>;

export interface RequestEvent {
  ready: [
    req: http.IncomingMessage,
    res: http.ServerResponse,
    data: RequestData
  ];
}

export class RequestHandler<TEvents extends Record<string, any>> {
  private emitter = new EventEmitter();

  emit<TEventName extends keyof TEvents & string>(
    eventName: TEventName,
    ...eventArg: TEvents[TEventName]
  ) {
    this.emitter.emit(eventName, ...(eventArg as []));
  }

  on<TEventName extends keyof TEvents & string>(
    eventName: TEventName,
    handler: (...eventArg: TEvents[TEventName]) => void
  ) {
    this.emitter.on(eventName, handler as any);
  }

  off<TEventName extends keyof TEvents & string>(
    eventName: TEventName,
    handler: (...eventArg: TEvents[TEventName]) => void
  ) {
    this.emitter.off(eventName, handler as any);
  }
}

const request = new RequestHandler<RequestEvent>();

export interface Route<
  P extends Record<string, any> = {},
  A extends Record<string, any> = {},
  Q extends Record<string, any> = {},
  C extends Record<string, any> = {},
  S extends Record<string, any> = {}
> {
  path: string;
  method?: RequestMethod;
  handler: RouteHandler<P, A, Q, C, S>;
  docs?: RouteDoc;
}

const router: Route[] = [];

const storage = new AsyncLocalStorage();

function parseQueryString(queryString: string): Record<string, string> {
  const pairs = queryString.split("&");
  const result: Record<string, string> = {};
  for (const pair of pairs) {
    const [key, value] = pair.split("=");
    result[key] = decodeURIComponent(value);
  }
  return result;
}

function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  const milliseconds = String(date.getMilliseconds()).padStart(3, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds} ${milliseconds}`;
}

function logWithId(...msg: any[]) {
  const id = storage.getStore();
  console.log(
    `[REQUEST] [${formatDate(new Date())}] [${id !== undefined ? id : "-"}]:`,
    ...msg
  );
}

async function CORSHandler(handle: HTTPHandler) {
  if (CORS_ENABLED) {
    handle.cors();
  }
  handle.end();
  return true;
}

export function down() {
  UNDER_MAINTENANCE = true;
}

export function up() {
  UNDER_MAINTENANCE = true;
}

export function setCORS(flag: boolean) {
  CORS_ENABLED = flag;
}

export function setPublicDir(...paths: string[]) {
  PUBLIC_DIR = path.join(...paths);
}

export function setUploadDir(...paths: string[]) {
  UPLOAD_DIR = path.join(...paths);
}

export function get<
  P extends Record<string, any> = {},
  A extends Record<string, any> = {},
  Q extends Record<string, any> = {},
  C extends Record<string, any> = {},
  S extends Record<string, any> = {}
>(path: string, handler: RouteHandler<P, A, Q, C, S>, docs?: RouteDoc) {
  router.push({
    path,
    method: RequestMethod.GET,
    handler: handler as any,
    docs,
  });
}

export function post<
  P extends Record<string, any> = {},
  A extends Record<string, any> = {},
  Q extends Record<string, any> = {},
  C extends Record<string, any> = {},
  S extends Record<string, any> = {}
>(path: string, handler: RouteHandler<P, A, Q, C, S>, docs?: RouteDoc) {
  router.push({
    path,
    method: RequestMethod.POST,
    handler: handler as any,
    docs,
  });
  if (CORS_ENABLED) {
    router.push({ path, method: RequestMethod.OPTIONS, handler: CORSHandler });
  }
}

export function put<
  P extends Record<string, any> = {},
  A extends Record<string, any> = {},
  Q extends Record<string, any> = {},
  C extends Record<string, any> = {},
  S extends Record<string, any> = {}
>(path: string, handler: RouteHandler<P, A, Q, C, S>, docs?: RouteDoc) {
  router.push({
    path,
    method: RequestMethod.PUT,
    handler: handler as any,
    docs,
  });
  if (CORS_ENABLED) {
    router.push({ path, method: RequestMethod.OPTIONS, handler: CORSHandler });
  }
}

export function del<
  P extends Record<string, any> = {},
  A extends Record<string, any> = {},
  Q extends Record<string, any> = {},
  C extends Record<string, any> = {},
  S extends Record<string, any> = {}
>(path: string, handler: RouteHandler<P, A, Q, C, S>, docs?: RouteDoc) {
  router.push({
    path,
    method: RequestMethod.DELETE,
    handler: handler as any,
    docs,
  });
  if (CORS_ENABLED) {
    router.push({ path, method: RequestMethod.OPTIONS, handler: CORSHandler });
  }
}

export function option<
  P extends Record<string, any> = {},
  A extends Record<string, any> = {},
  Q extends Record<string, any> = {},
  C extends Record<string, any> = {},
  S extends Record<string, any> = {}
>(path: string, handler: RouteHandler<P, A, Q, C, S>, docs?: RouteDoc) {
  router.push({
    path,
    method: RequestMethod.OPTIONS,
    handler: handler as any,
    docs,
  });
}

export function any<
  P extends Record<string, any> = {},
  A extends Record<string, any> = {},
  Q extends Record<string, any> = {},
  C extends Record<string, any> = {},
  S extends Record<string, any> = {}
>(path: string, handler: RouteHandler<P, A, Q, C, S>, docs?: RouteDoc) {
  router.push({ path, handler: handler as any, docs });
}

export function route<
  P extends Record<string, any> = {},
  A extends Record<string, any> = {},
  Q extends Record<string, any> = {},
  C extends Record<string, any> = {},
  S extends Record<string, any> = {}
>(
  path: string,
  handler: RouteHandler<P, A, Q, C, S>,
  method: RequestMethod = RequestMethod.GET,
  docs?: RouteDoc
) {
  switch (method) {
    case RequestMethod.GET:
      get(path, handler, docs);
      break;
    case RequestMethod.POST:
      post(path, handler, docs);
      break;
    case RequestMethod.PUT:
      put(path, handler, docs);
      break;
    case RequestMethod.DELETE:
      del(path, handler, docs);
      break;
    case RequestMethod.OPTIONS:
      option(path, handler, docs);
      break;
    default:
      any(path, handler, docs);
      break;
  }
}

export const server = http.createServer();

let ErrorCallback: RouteHandler = () => Promise.resolve(false);
let FileCallback: RouteHandler = () => Promise.resolve(false);
let IndexCallback: RouteHandler = () => Promise.resolve(false);

export function onError(callback: RouteHandler) {
  ErrorCallback = callback;
}

export function onFile(callback: RouteHandler) {
  FileCallback = callback;
}

export function onIndex(callback: RouteHandler) {
  IndexCallback = callback;
}

export function getRoutes() {
  return router;
}

function HandleRequest(req: http.IncomingMessage, res: http.ServerResponse) {
  const queryString = req.url?.split("?")[1] || "";
  const qs = parseQueryString(queryString);
  const req_route = req.url?.replace(`?${queryString}`, "") || "/";
  delete qs[""];

  const path_data: any = {};
  const match = router.find((route) => {
    const req_routes = req_route.split("/");
    const path_routes = route.path.split("/");

    if (req_routes.length !== path_routes.length) {
      return false;
    }
    const valid_path = path_routes.every((chunk, i) => {
      if (chunk.startsWith(":") && chunk.length > 1) {
        path_data[chunk.slice(1)] = req_routes[i];
        return true;
      }
      return chunk === req_routes[i];
    });
    if (!valid_path) {
      return false;
    }
    if (!route.method) {
      return true;
    }
    return req.method === route.method;
  });

  if (match) {
    const cookies = new Cookie(req, res);
    const session = new Session(req, res);

    const payload: RequestData = {
      type: RequestType.ROUTE,
      status: 200,
      handle: match.handler,
      method: req.method as RequestMethod,
      qs: qs,
      body: {},
      cookies: cookies,
      session: session,
      path: req_route,
      path_data: path_data,
    };

    if (req.method === RequestMethod.GET) {
      request.emit("ready", req, res, payload);
      return;
    }

    // * Handle any other Method requests with form data
    const type = req.headers["content-type"];
    if (!type) {
      request.emit("ready", req, res, {
        ...payload,
        body: {},
      });
      return;
    }
    let body = "";
    const chunks: Uint8Array[] = [];
    req.on("data", (chunk) => {
      try {
        if (type.startsWith("multipart/form-data")) {
          chunks.push(chunk);
        } else {
          body += chunk.toString();
        }
      } catch (error: any) {
        request.emit("ready", req, res, {
          ...payload,
          type: RequestType.ERROR,
          error: error,
        });
        return;
      }
    });
    req.on("end", () => {
      let postData: Record<string, any> = {};
      if (type.startsWith("application/x-www-form-urlencoded")) {
        postData = parseQueryString(body);
        delete postData[""];
        request.emit("ready", req, res, {
          ...payload,
          body: postData,
        });
        return;
      } else if (type.startsWith("multipart/form-data")) {
        const boundary = `--${type
          .split("boundary=")[1]
          .trim()
          .replace(/\"/g, "")}`;
        const data = Buffer.concat(chunks).toString();
        const parts: string[] = [];

        let part: string[] = [];
        data.split("\r\n").forEach((line) => {
          if (line === boundary) {
            if (part.length > 0) {
              parts.push(part.join("\r\n"));
              part = [];
            }
            return;
          }
          part.push(line);
        });
        parts.push(part.join("\r\n"));

        const uploadedFiles: { file: string; error?: Error }[] = [];

        function parseMultiParts() {
          if (i > parts.length - 1) {
            postData.files = uploadedFiles;
            request.emit("ready", req, res, {
              ...payload,
              body: postData,
            });
            return;
          }

          const part = parts[i];
          const name = part.match(/\sname="?([^\"\;\r\n]+)"?\;?/);
          const disposition = part.match(/\sfilename="?([^\"\;\r\n]+)"?\;?/);
          const content = part.split("\r\n\r\n")[1];

          if (disposition) {
            const filename = name?.[1] || new Date().getTime().toString();
            const filePath = `${UPLOAD_DIR}/${filename}`; // Replace with your desired upload directory

            fs.writeFile(filePath, content, (err) => {
              if (err) {
                console.error(err);
                uploadedFiles.push({ file: filePath, error: err });
              } else {
                uploadedFiles.push({ file: filePath });
              }

              i++;
              parseMultiParts();
            });
          } else {
            // This is a non-file part (e.g., text field)
            const varname = name?.[1] || "";
            const value = content.trim();

            if (varname) {
              postData[varname] = value;
            }

            i++;
            parseMultiParts();
          }
        }

        let i = 0;
        parseMultiParts();
      } else if (type.startsWith("application/json")) {
        try {
          postData = JSON.parse(body);
        } catch (error) {}
        request.emit("ready", req, res, {
          ...payload,
          body: postData,
        });
        return;
      }
    });
    return;
  }

  const public_file = path.join(PUBLIC_DIR, req_route);

  if (isFile(public_file)) {
    request.emit("ready", req, res, {
      status: 200,
      method: req.method as RequestMethod,
      type: RequestType.FILE,
      path: public_file,
    });
    return;
  }

  request.emit("ready", req, res, {
    status: 404,
    method: req.method as RequestMethod,
    error: new Error("404"),
    type: RequestType.ERROR,
    path: req_route || public_file,
  });
  return;

  // * For now its not support directory indexing
}

let idSeq = 0;
server.on("request", (req, res) => {
  if (UNDER_MAINTENANCE) {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("Under Maintenance");
    return;
  }
  storage.run(idSeq++, () => {
    logWithId("incoming");
    setImmediate(() => {
      HandleRequest(req, res);
    });
  });
});

request.on(
  "ready",
  async (
    req: http.IncomingMessage,
    res: http.ServerResponse,
    data: RequestData
  ) => {
    logWithId("ROUTING", `[${data.method}]`, data.type, data.status, data.path);
    const { handle, ...omit } = data;
    const httpHandler = new HTTPHandler(req, res, omit);
    if (CORS_ENABLED) {
      httpHandler.cors();
    }
    switch (data.type) {
      case RequestType.ERROR: {
        const block = await ErrorCallback(httpHandler);
        if (!block) {
          httpHandler.err(
            data.error || new Error("Unknown Error"),
            data.status
          );
        }
        logWithId("done");
        return;
      }
      case RequestType.FILE: {
        const block = await FileCallback(httpHandler);
        if (!block) {
          httpHandler.sendFile(false, httpHandler.path);
        }
        logWithId("done");
        return;
      }
      case RequestType.INDEX: {
        const block = await IndexCallback(httpHandler);
        if (!block) {
          res.writeHead(302, { Location: "/index.html" });
          res.end();
        }
        logWithId("done");
        return;
      }
      case RequestType.ROUTE:
        try {
          const result = await handle?.(httpHandler);
          if (!result) {
            // * Do something?
          }
          logWithId("done");
        } catch (e: any) {
          httpHandler.err(e || new Error("Internal Server Error"), 500);
        }
        return;
    }
  }
);

export function generateRouteDoc(route: Route) {
  const { path, method, docs } = route;
  return {
    ...docs,
    route: path,
    method: method,
  };
}

export async function HTMLDocumentation(handler: HTTPHandler) {
  function renderInputs(
    title: string,
    data: Record<string, string> | undefined
  ) {
    if (!data) {
      return "";
    }
    let prefix = "input-";
    switch (title) {
      case "Path Params":
        prefix = "path-";
        break;
      case "Queries":
        prefix = "query-";
        break;
      case "Post Bodies":
        prefix = "body-";
        break;
    }
    return `
      <h3>${title}</h3>
      ${Object.keys(data).map((key) => {
        const info = data[key];
        return `
        <div>
          <label style="display: block;">${key} - ${info}</label>
          <input type="text" name="${prefix}${key}" />
        </div>
      `;
      })}
    `;
  }
  const route_docs = getRoutes()
    .map(generateRouteDoc)
    .map((doc, index) => {
      return `
    <div style="background-color: ${
      index % 2 == 0 ? "khaki" : "lavender"
    }; margin: 8px; padding: 8px;">
      <h2 style="display: inline-block;width: 200px;padding: 0;margin: 0;">${
        doc.method || "*"
      }</h2> 
      <h2 style="display: inline-block;width: 200px;padding: 0;margin: 0;">${
        doc.route
      }</h2>
      <div>
        ${
          doc.description ? `<h3>Description</h3><p>${doc.description}</p>` : ""
        }
        <form id="form-${index}" onsubmit="event.preventDefault(); return false;">
          ${renderInputs("Path Params", doc.params)}
          ${renderInputs("Queries", doc.query)}
          ${renderInputs("Post Bodies", doc.body)}

          <h3>Headers</h3>
          <div id="headers-${index}">
            <div id="header-${index}-0">
              <input type="text" name="header-${index}-0-name" value="content-type"/>
              <input type="text" name="header-${index}-0-value" value="application/json"/>
              <button onclick="addHeader(${index});">&nbsp;+&nbsp;</button>
              <button onclick="removeHeader(${index}, 0);">&nbsp;-&nbsp;</button>
            </div>
          </div>

          ${doc.response ? `<h3>Response</h3><p>${doc.response}</p>` : ""}
          <button style="margin-top: 8px; margin-right: 8px;" onclick="sendForm(${index}, '${
        doc.route
      }', '${doc.method || RequestMethod.GET}');">SEND</button>
      <button style="margin-top: 8px;" onclick="blankResponse(${index});">CLEAR</button>
        </form>
        <div id="response-${index}" style="border: 1px solid gray; padding: 8px; margin-top: 8px;">
          <pre id="response-body-${index}">
          </pre>
        </div>
      </div>
    </div>
    `;
    });

  const contents = `
  <html>
  <head>
    <title>Routes Documentation</title>
    <script>
      async function sendForm(index, route, method) {
        const form = document.getElementById("form-" + index);
        const responseEL = document.getElementById("response-body-" + index);
        const inputs = Array.from(form.querySelectorAll("input"));

        const bodies = inputs.filter((x) => x.name.startsWith("body-"));
        const body = {};
        bodies.forEach((x) => {
          body[x.name.replace("body-", "")] = x.value;
        });

        const params = inputs.filter((x) => x.name.startsWith("path-"));
        params.forEach((x) => {
          const name = x.name.replace("path-", "");
          const value =  x.value;
          route = route.replace(":" + name, value);
        });

        const queries = inputs.filter((x) => x.name.startsWith("query-"));
        const query = {};
        queries.forEach((x) => {
          query[x.name.replace("query-", "")] = x.value;
        });
        if (queries.length > 0) {
          route += '?' + new URLSearchParams(query).toString()
        }

        const headersContainer = document.getElementById("headers-" + index);
        const headers = {};

        // Iterate over each header element within the container
        const headerElements = headersContainer.querySelectorAll('div[id^="header-"]');
        headerElements.forEach(headerElement => {
          const headerNameInput = headerElement.querySelector('input[name$="-name"]');
          const headerValueInput = headerElement.querySelector('input[name$="-value"]');

          if (headerNameInput && headerValueInput) {
            const headerName = headerNameInput.value;
            const headerValue = headerValueInput.value;
            headers[headerName] = headerValue;
          }
        });
        
        const response = await fetch(route, {
          method: method,
          body: method === "GET" || method === "HEAD" ? undefined : JSON.stringify(body),
          headers: {
            "Content-Type": "application/json",
            ...headers,
          },
        });
        const text = await response.text();
        try {
          const json = JSON.parse(text);
          responseEL.innerText = JSON.stringify(json, null, 2);
        } catch (e) {
          responseEL.innerText = text;
        }
      };

      function blankResponse(index) {
        const responseEL = document.getElementById("response-body-" + index);
        const form = document.getElementById("form-" + index);
        const inputs = Array.from(form.querySelectorAll("input"));
        responseEL.innerText = '';
        inputs.forEach((x) => {
          x.value = '';
        })
      }

      function addHeader(index) {
        const form = document.getElementById("form-" + index);
        const headersWrapper = document.getElementById("headers-" + index);
        const lastHeaderId = headersWrapper.lastElementChild.id; // Get ID of last header 

        // Extract the last number from the ID
        const lastHeaderIndex = parseInt(lastHeaderId.split('-')[2]);

        // Create a new header with the next index
        const newHeaderIndex = lastHeaderIndex + 1;
        const newHeaderId = "header-" + index + "-" + newHeaderIndex;
        const newHeader = document.createElement('div');
        newHeader.id = newHeaderId;

        // Create input elements for the new header
        const nameInput = document.createElement('input');
        nameInput.type = "text";
        nameInput.name = "header-" + index + "-" + newHeaderIndex + "-name";

        const valueInput = document.createElement('input');
        valueInput.type = "text";
        valueInput.name = "header-" + index + "-" + newHeaderIndex + "-value";

        // Create buttons for the new header
        const addButton = document.createElement('button');
        addButton.innerHTML = "&nbsp;+&nbsp;";
        addButton.onclick = () => addHeader(index); 

        const removeButton = document.createElement('button');
        removeButton.innerHTML = "&nbsp;-&nbsp;";
        removeButton.onclick = () => removeHeader(index, newHeaderIndex); 

        // Append elements to the new header
        newHeader.appendChild(nameInput);
        newHeader.appendChild(valueInput);
        newHeader.appendChild(addButton);
        newHeader.appendChild(removeButton);

        // Append the new header to the container
        headersWrapper.appendChild(newHeader);
      }

      function removeHeader(index, index2) {
        const form = document.getElementById("form-" + index);
        const headersWrapper = document.getElementById("headers-" + index);
        const children = Array.from(headersWrapper.children);
        const child = children[index2];
        if (child) {
          headersWrapper.removeChild(child);
        }
      }
    </script>
  </head>
  <body>
    <h1>Routes Documentation</h1>
    ${route_docs.join("\n")}
  </body>
  </html>
`;
  handler.html(contents, 200);
  return Promise.resolve(true);
}
