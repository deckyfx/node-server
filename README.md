# Single Executable Application (SEA) Builder

## What is this?

This is a script to build a SEA, the nodejs version 20 and higher exeperimental feature to compile nodejs scripts into one executable binary, visit [nodejs documentation](https://nodejs.org/api/single-executable-applications.html) for more info

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

1.0.4

## Running

Just use command `npx @decky.fx/sea-builder@{latest_version}`

For Example

Just use command `npx @decky.fx/sea-builder@1.0.4`

## Arguments

All these arguments are optional
| **Argument** | **Default** | **Explanation** |
|--------------|----------------------------------|---------------------------------------------------------------------------------------------------------------------------------|
| --skip-build | true | By default sea-builder will try to build your project, <br>pack it into single file, <br>then compile it into executable binary |
| --name | package.json<br>`name` attribute | The final executable file name to be generated |
| --entry-in | package.json `main` attribute | The entry point of your program, <br>ussualy it is the index.js |
| --entry-out | index.js | The entry point of the program, <br>after it got packed by @vercel/ncc, before it get compiled

## Under the hood

- This script uses node20 experimental feature of single executable application (sea)
- This script uses posject to inject the codes, visit [nodejs/postject](https://github.com/nodejs/postject) for more info
- This script uses ncc to pack the source code into single file, visit [vercel/ncc](https://github.com/vercel/ncc) for more info
