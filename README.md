# Node-Server

## What is this?

This is a simple nodejs server, it has zero dependancy!

## Features

- [x] zero dependancy
- [x] basic routes handler
- [x] serve static files
- [x] read request query string and post body
- [x] basic cookies and session
- [x] basic template enggine

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

`v20.16.0`

Make sure yarn is installed, if not use

`npm install --global yarn`

Install dependecies

`yarn install`

## Latest Version

1.0.0

## Usage

Install with

`npm i @decky.fx/node-server`

See example folder

```// * Import
const { server, get } = require("@decky.fx/node-server");

// * Add route
get("/", async (req, res, data) => {
  text(res, "OK");
  return true;
});

// * Start server
server.listen(port, hostname, () => {
  console.log(`Server running at http://${hostname}:${port}/`);
});

```

## API

### server

The server object created by node:http

### get(path: string, handler: RouteHandler)

Add get route

### post(path: string, handler: RouteHandler)

Add post route

### put(path: string, handler: RouteHandler)

Add put route

### del(path: string, handler: RouteHandler)

Add delete route

### up()

Flag the server as up

### down()

Flag the server as down for maintenance

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

## RouteHandler: (req: http.IncomingMessage, res: http.ServerResponse, data: RequestData) => Promise<booelan>

The callback that called when route is handled

## RequestData

Request data has the following properties

```
{
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
}
```

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
