# Node-Server

## What is this?

This is a simple nodejs server, it has zero dependancy!

## Features

- [x] zero dependancy
- [x] basic route handler
- [x] serve static files
- [x] read request query string and post body
- [x] basic cookies and session
- [x] basic template enggine
- [x] Handle POST Body for both JSON, multipart, and url-encoded

## Requirement

- nvm
- nodejs >= v20.16.0
- yarn

## Cloning

`git clone https://github.com/deckyfx/sea-builder.git`

Make sure nvm is installed, and install node version `20.16.0`, visit [https://github.com/nvm-sh/nvm](https://github.com/nvm-sh/nvm) for more detail

Set node version

`nvm use`

Check node version

`node --version`

it should return

`v20.17.0`

Make sure yarn is installed, if not use

`npm install --global yarn`

Install dependecies

`yarn install`

## Latest Version

1.0.7

## Usage

Install with

`npm i @decky.fx/node-server`

See example folder

```typescript
import { server, any, onError, get, post, routes } from "../src/index";

const hostname = "0.0.0.0";
const port = 3000;

any("/", async function _any(handle) {
  handle.json({ result: "OK" });
  return true;
});

post("/test", async function _post(handle) {
  handle.json({ result: "OK" });
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
```

## API

### server

The server object created by node:http

### get(path: string, handler: RouteHandler)

Add GET route

### post(path: string, handler: RouteHandler)

Add POST route

### put(path: string, handler: RouteHandler)

Add PUT route

### del(path: string, handler: RouteHandler)

Add DELETE route

### option(path: string, handler: RouteHandler)

Add OPTIONS route

### any(path: string, handler: RouteHandler)

Add route catching any methods

### route(path: string, handler: RouteHandler, method: Method = GET)

Add route for method xxx

### up()

Flag the server as up

### down()

Flag the server as down for maintenance

### setCORS(flag: boolean)

Flag CORS enabled / disabled, if `enabled`, response will send extra headers for CORS handler, and when adding POST route will also adds OPTIONS route to same path to handle `preflight request`

### setPublicDir(...paths: string[])

Set public dir to serve static files, `default` is `./public`

### setUploadDir(...paths: string[])

Set default upload dir, `default` is `./uploads`

### onError(callback: RouteHandler)

Add hooks when error happened during request route parsing

### onFile(callback: RouteHandler)

Add hooks that trigger before a default File handler triggered

### onIndex(callback: RouteHandler)

Add hooks that trigger before a default Index handler triggered

### routes()

Return current configured routes

### template(path: string, data: any): string

Render template and generate string data of rendered template

### text(res: http.ServerResponse, data: string)

Send basic string to connected client

### json(res: http.ServerResponse, data: any)

Send basic string of JSON stringified data to connected client

### file(...path_chunks: string[])

Send static file contents to connected client

### redirect(path: string)

Redirect client to new path

## RouteHandler: (handle: HTTPHandler) => Promise<booelan|void|null|undefined>

The callback that called when a route is handled, starting from `1.0.5`, the callback only provide single argument, a `HTTPHandler` instance

## HTTPHandler

The Handler data passed when trigger `RouteHandler`.

The Handler would have the following `readonly` properties:

- cookies?: Cookie
- error?: Error
- method: RequestMethod
- path: string
- path_data?: Record<string, any>
- qs?: Record<string, any>
- session?: Session
- status: number
- type: RequestType
- req: http.IncomingMessage
- res: http.ServerResponse

The Handler would have the following methods:

### text(data: any)

Send and end request with text

### json(data: any, status: number = 200)

Send and end request with json data

### html(data: string, status: number = 200)

Send and end request with html string data

### redirect(url: string, status: number = 302)

Send and end request with redirect header

### err(error: Error, status: number = 500)

Send and end request with error

### cors()

Send headers for CORS

### template(template: string, data?: any): string

Process a template file and return the string result

### readFile(...paths: string[])

Read file as string data

### sendFile(disposition: boolean = true, ...paths: string[])

Send file response, as file download when `disposition` = `true`, or as common HTTP file response (eg: js, css, image)


## Cookie

Cookie instance has the following methods

### get<T extends any = BasicCookie>()

Return all cookies

### set(res: http.ServerResponse, name: string, value: any)

Set a cookie

### remove(res: http.ServerResponse, name: string)

remove

### clear(res: http.ServerResponse)

clear all cookies

## Session

Session instance has the following methods

### get<T extends any = BasicCookie>()

Return all sessions

### set(name: string, value: any)

Set a session

### remove(name: string)

remove a session

### clear()

clear all sessions

### Todos

- [ ] Next idea
