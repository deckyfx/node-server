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

export type RequestData = {
  body?: Record<string, any>;
  cookies?: Cookie;
  error?: Error;
  handle?: RouteHandler;
  method: RequestMethod;
  path: string;
  path_data?: Record<string, any>;
  qs?: Record<string, any>;
  session?: Session;
  status: number;
  type: RequestType;
};

export class HTTPHandler {
  public readonly body?: Record<string, any>;
  public readonly cookies?: Cookie;
  public readonly error?: Error;
  public readonly method: RequestMethod;
  public readonly path: string;
  public readonly path_data?: Record<string, any>;
  public readonly qs?: Record<string, any>;
  public readonly session?: Session;
  public readonly status: number;
  public readonly type: RequestType;

  constructor(
    public readonly req: http.IncomingMessage,
    public readonly res: http.ServerResponse,
    data: RequestData
  ) {
    this.body = data.body;
    this.cookies = data.cookies;
    this.error = data.error;
    this.method = data.method;
    this.path = data.path;
    this.path_data = data.path_data;
    this.qs = data.qs;
    this.session = data.session;
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

export type RouteHandler = (
  handle: HTTPHandler
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

export interface Route {
  path: string;
  method?: RequestMethod;
  handler: RouteHandler;
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

export function get(path: string, handler: RouteHandler) {
  router.push({ path, method: RequestMethod.GET, handler });
}

export function post(path: string, handler: RouteHandler) {
  router.push({ path, method: RequestMethod.POST, handler });
  if (CORS_ENABLED) {
    router.push({ path, method: RequestMethod.OPTIONS, handler: CORSHandler });
  }
}

export function put(path: string, handler: RouteHandler) {
  router.push({ path, method: RequestMethod.PUT, handler });
  if (CORS_ENABLED) {
    router.push({ path, method: RequestMethod.OPTIONS, handler: CORSHandler });
  }
}

export function del(path: string, handler: RouteHandler) {
  router.push({ path, method: RequestMethod.DELETE, handler });
  if (CORS_ENABLED) {
    router.push({ path, method: RequestMethod.OPTIONS, handler: CORSHandler });
  }
}

export function option(path: string, handler: RouteHandler) {
  router.push({ path, method: RequestMethod.OPTIONS, handler });
}

export function any(path: string, handler: RouteHandler) {
  router.push({ path, handler });
}

export function route(
  path: string,
  handler: RouteHandler,
  method: RequestMethod = RequestMethod.GET
) {
  switch (method) {
    case RequestMethod.GET:
      get(path, handler);
      break;
    case RequestMethod.POST:
      post(path, handler);
      break;
    case RequestMethod.PUT:
      put(path, handler);
      break;
    case RequestMethod.DELETE:
      del(path, handler);
      break;
    case RequestMethod.OPTIONS:
      option(path, handler);
      break;
    default:
      any(path, handler);
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

export function routes() {
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
