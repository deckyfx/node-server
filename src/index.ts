import http from "node:http";
import path from "node:path";
import EventEmitter from "node:events";
import { AsyncLocalStorage } from "node:async_hooks";

import { Cookie, renderTemplate, resolveFile, Session } from "./utils";

let UNDER_MAINTENANCE = false;

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
} as const;

export type RequestType = ObjectValues<typeof RequestType>;

export type RequestMethod = ObjectValues<typeof RequestMethod>;

export type RouteHandler = (
  req: http.IncomingMessage,
  res: http.ServerResponse,
  data: RequestData
) => Promise<boolean | undefined | null | void>;

export type RequestData = {
  body?: Record<string, any>;
  cookies?: Cookie;
  error?: Error;
  handle?: RouteHandler;
  method: RequestMethod;
  path: string;
  qs?: Record<string, any>;
  session?: Session;
  status: number;
  type: RequestType;
};

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
  method: RequestMethod;
  handler: RouteHandler;
}

const router: Route[] = [];

const storage = new AsyncLocalStorage();

function serveStaticFile(res: http.ServerResponse, filePath: string) {
  const data = resolveFile(filePath);
  if (data instanceof Error) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("File not found");
    return;
  }
  res.writeHead(200, { "Content-Type": "text/html" }); // Adjust content type as needed
  res.end(data);
}

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

export function get(path: string, handler: RouteHandler) {
  router.push({ path, method: RequestMethod.GET, handler });
}

export function post(path: string, handler: RouteHandler) {
  router.push({ path, method: RequestMethod.POST, handler });
}

export function put(path: string, handler: RouteHandler) {
  router.push({ path, method: RequestMethod.PUT, handler });
}

export function del(path: string, handler: RouteHandler) {
  router.push({ path, method: RequestMethod.DELETE, handler });
}

export const server = http.createServer();

export const template = renderTemplate;

export function text(res: http.ServerResponse, data: string) {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end(data);
}

export function json(res: http.ServerResponse, data: any) {
  text(res, JSON.stringify(data));
}

export function redirect(res: http.ServerResponse, path: string) {
  res.writeHead(302, { Location: path });
  res.end();
}

export function file(...paths: string[]) {
  const data = resolveFile(path.join(...paths), "utf-8") as string | Error;
  if (data instanceof Error) {
    return "";
  }
  return data;
}

export function down() {
  UNDER_MAINTENANCE = true;
}

export function up() {
  UNDER_MAINTENANCE = true;
}

function HandleRequest(req: http.IncomingMessage, res: http.ServerResponse) {
  const queryString = req.url?.split("?")[1] || "";
  const qs = parseQueryString(queryString);
  const req_route = req.url?.replace(`?${queryString}`, "") || "/";
  delete qs[""];

  const filePath = path
    .join("assets", "public", req.url || "")
    .replace(`?${queryString}`, "");

  const match = router.find(
    (route) => req_route === route.path && req.method === route.method
  );

  if (match) {
    const cookies = new Cookie(req, res);
    const session = new Session(req, res);
    if (req.method === RequestMethod.GET) {
      request.emit("ready", req, res, {
        type: RequestType.ROUTE,
        status: 200,
        handle: match.handler,
        method: req.method as RequestMethod,
        qs: qs,
        body: {},
        cookies: cookies,
        session: session,
        path: req_route,
      });
    } else if (req.method === RequestMethod.POST) {
      // Handle POST requests with form data
      let body = "";
      req.on("data", (chunk) => {
        try {
          body += chunk.toString();
        } catch (error) {
          request.emit("ready", req, res, {
            type: RequestType.ERROR,
            status: 400,
            handle: match.handler,
            method: req.method as RequestMethod,
            qs: qs,
            body: {},
            cookies: cookies,
            session: session,
            path: req_route,
          });
          return;
        }
      });
      req.on("end", () => {
        const postData = parseQueryString(body);
        delete postData[""];
        request.emit("ready", req, res, {
          status: 200,
          type: RequestType.ROUTE,
          handle: match.handler,
          method: req.method as RequestMethod,
          qs: qs,
          body: postData,
          cookies: cookies,
          session: session,
          path: req_route,
        });
      });
    }
    return;
  }

  const content = resolveFile(filePath);
  if (content instanceof Error) {
    request.emit("ready", req, res, {
      status: 404,
      method: req.method as RequestMethod,
      error: new Error("404"),
      type: RequestType.ERROR,
      path: req_route || filePath,
    });
    return;
  }

  request.emit("ready", req, res, {
    status: 200,
    method: req.method as RequestMethod,
    type: RequestType.FILE,
    path: filePath,
  });

  // * For now its not support directory indexing
}

let idSeq = 0;
server.on("request", (req, res) => {
  if (UNDER_MAINTENANCE) {
    text(res, "Under Maintenance");
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
    switch (data.type) {
      case RequestType.ERROR:
        res.writeHead(data.status, { "Content-Type": "text/plain" });
        res.end(data.error?.message || data.status);
        logWithId("done");
        return;
      case RequestType.FILE:
        serveStaticFile(res, data.path);
        logWithId("done");
        return;
      case RequestType.INDEX:
        res.writeHead(302, { Location: "/index.html" });
        res.end();
        logWithId("done");
        return;
      case RequestType.ROUTE:
        try {
          const { handle, ...omit } = data;
          const result = await handle?.(req, res, omit);
          if (!result) {
            // * Do something?
          }
          logWithId("done");
        } catch (e: any) {
          res.writeHead(500, { "Content-Type": "text/plain" });
          res.end(e.message || "Internal Server Error");
        }
        return;
    }
  }
);
