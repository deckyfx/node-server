import http from "node:http";
import path from "node:path";
import fs from "node:fs";
import { Buffer } from "node:buffer";
import crypto from "node:crypto";
import sea from "node:sea";

interface EnclosingTagInfo {
  startIndex: number;
  endIndex: number;
  enclosedContent: string;
  openingTag: string;
  attributes: Record<string, string>;
}

function findEnclosingTag(html: string, tag: string): EnclosingTagInfo | null {
  const startRegex = new RegExp(`<${tag}\\s*[^>]*>`, "g");
  const endRegex = new RegExp(`</${tag}>`, "g");

  let startMatch: RegExpExecArray | null;
  let endMatch: RegExpExecArray | null;
  let depth = 0;

  while ((startMatch = startRegex.exec(html)) !== null) {
    depth++;
    if (depth === 1) {
      while ((endMatch = endRegex.exec(html)) !== null) {
        if (depth === 0) {
          const openingTag = startMatch[0];
          const attributes = extractAttributes(openingTag);
          const enclosedContent = html.substring(
            startMatch.index + openingTag.length,
            endMatch.index
          );
          return {
            startIndex: startMatch.index,
            endIndex: endMatch.index + endMatch[0].length,
            enclosedContent,
            openingTag,
            attributes,
          };
        }
        depth--;
      }
    }
  }

  return null; // Tag not found
}

function extractAttributes(openingTag: string): Record<string, string> {
  const attributeRegex = /[^<>="]+="[^"]*"/g;
  const attributes: Record<string, string> = {};

  let attributeMatch: RegExpExecArray | null;
  while ((attributeMatch = attributeRegex.exec(openingTag)) !== null) {
    const attributePair = attributeMatch[0];
    const [name, value] = attributePair.split("=");
    attributes[name.trim()] = value.replace(/^"/, "").replace(/"$/, "");
  }

  return attributes;
}

function getValue(data: any, key: string): any {
  if (key === "") {
    return data;
  }
  const parts = key.split(".");

  return parts.reduce((obj, part) => {
    if (obj === null || obj === undefined) {
      return key; // Return undefined if the current object is null or undefined
    }

    let indexMatch: RegExpMatchArray | null = null;
    let indexKey: number = -1;
    let partWOIndex: string = part;
    if (typeof obj === "object" || typeof obj === "string") {
      // Handle array access
      indexMatch = part.match(/\[(\d+)\]$/);
      if (indexMatch) {
        indexKey = parseInt(indexMatch[1]);
        partWOIndex = part.replace(/\[(\d+)\]$/, "");
      }
    }

    if (typeof obj === "string" && indexMatch) {
      return obj[indexKey] ?? key;
    }

    if (Array.isArray(obj)) {
      return obj[indexKey] ?? key;
    }

    if (typeof obj === "object") {
      if (indexMatch) {
        // Handle array access
        return obj[partWOIndex][parseInt(indexMatch[1])] ?? key;
      } else if (part.endsWith("()")) {
        // Handle function calls
        const functionName = part.slice(0, -2);
        if (typeof obj[functionName] === "function") {
          return obj[functionName]();
        }
      } else {
        // * Handle primitive value
        if (key.toLowerCase() === "true") {
          return true;
        } else if (key.toLowerCase() === "false") {
          return false;
        } else if (!isNaN(Number(key))) {
          return Number(key);
        }
        return obj[part] ?? key;
      }
    }

    // * Handle primitive value
    if (key.toLowerCase() === "true") {
      return true;
    } else if (key.toLowerCase() === "false") {
      return false;
    } else if (!isNaN(Number(key))) {
      return Number(key);
    }
    return key;
  }, data);

  return data ?? key;
}

export function renderTemplate(template: string, data?: any): string {
  // Find the first occurrence of a directive
  let ifMatch = template.match(/\[\[if {{([^}]+)}}\]\]/);
  let loopMatch = template.match(/\[\[for {{([^}]+)}}\]\]/);

  const i_if = ifMatch?.index || -1;
  const i_lo = loopMatch?.index || -1;
  if (i_if >= 0 && i_lo >= 0) {
    if (i_if < i_if) {
      loopMatch = null;
    } else if (i_lo < i_if) {
      ifMatch = null;
    }
  }

  if (ifMatch && ifMatch.length > 0) {
    // * Handle if directive
    const closingDirective = "[[fi]]";
    const elseDirective = "[[else]]";
    const [match, var_path] = ifMatch as [match: string, var_path: string];
    const index = ifMatch.index || 0;
    const endIndex = template.lastIndexOf(closingDirective) - 1;
    const ifContent = template.substring(index + match.length, endIndex);
    const endReplace = endIndex + closingDirective.length + 1;
    const condition: boolean = getValue(data, var_path);
    const endElseIndex = template.lastIndexOf(elseDirective);
    let trueContent = ifContent;
    let elseContent = "";

    if (endElseIndex >= 0) {
      trueContent = ifContent.substring(
        0,
        ifContent.lastIndexOf(elseDirective) - 1
      );
      elseContent = ifContent.substring(
        ifContent.lastIndexOf(elseDirective),
        ifContent.length
      );
    }

    if (condition) {
      return renderTemplate(
        template.slice(0, index) +
          renderTemplate(elseContent, data) +
          template.slice(endReplace)
      );
    } else {
      return renderTemplate(
        template.slice(0, index) +
          renderTemplate(elseContent, data) +
          template.slice(endReplace),
        data
      );
    }
  } else if (loopMatch && loopMatch.length > 0) {
    // * Handle loop directive
    const closingDirective = "[[rof]]";
    const [match, var_path] = loopMatch as [match: string, var_path: string];
    const index = loopMatch.index || 0;
    const endIndex = template.lastIndexOf(closingDirective) - 1;
    const loopContent = template.substring(index + match.length, endIndex);
    const endReplace = endIndex + closingDirective.length + 1;

    const iterableValue: any[] | number = getValue(data, var_path) as
      | any[]
      | number;

    if (
      Array.isArray(iterableValue) ||
      (iterableValue as any)[Symbol.iterator]
    ) {
      return renderTemplate(
        template.slice(0, index) +
          (iterableValue as any[])
            .map((item: any) => renderTemplate(loopContent, item))
            .join("") +
          template.slice(endReplace),
        data
      );
    } else if (typeof iterableValue === "number") {
      const result: string[] = [];
      for (let i = 0; i < iterableValue; i++) {
        result.push(renderTemplate(loopContent, i));
      }

      return renderTemplate(
        template.slice(0, index) + result.join("") + template.slice(endReplace),
        data
      );
    } else {
      console.error("Invalid iterable value:", iterableValue);
      return renderTemplate(
        template.slice(0, index) +
          `[[Invalid iterable value:, ${iterableValue}]]` +
          template.slice(endReplace),
        data
      );
    }
  } else {
    // * Handle other directives or plain text
    return (
      template
        // * Handle Variable rendering
        // * {{value}}
        .replace(/{{([^}]+)}}/g, (match, key) => {
          const value = getValue(data, key);
          return value !== undefined ? value : match;
        })
        // * Handle primitvie variable rendering
        // * {{}}
        .replace(/{{}}/g, (_, __) => {
          return data;
        })
    );
  }
}

function generateUniqueId() {
  // Generate a cryptographically secure random ID
  return crypto.randomBytes(16).toString("hex");
}

export type BasicCookie = {
  _id: string;

  [key: string]: any;
};

export class Cookie {
  private _cookies: BasicCookie;

  constructor(req: http.IncomingMessage, res: http.ServerResponse) {
    let cookie = req.headers.cookie;
    this._cookies = { _id: "" };

    if (cookie) {
      cookie = cookie.replace("; HttpOnly;", "; ");
      cookie.split(";").forEach((cookie) => {
        const [key, value] = cookie.trim().split("=");
        if (["SameSite"].includes(key)) {
          return;
        }
        this._cookies[key] = decodeURIComponent(value);
      });
      if (!this._cookies._id) {
        this._cookies._id = generateUniqueId();
        this.set(res, "_id", this._cookies._id);
      }
    }
  }

  get<T extends any = BasicCookie>() {
    return this._cookies as T;
  }

  set(res: http.ServerResponse, name: string, value: any) {
    this._cookies[name] = value.toString();
    return this.write(res);
  }

  remove(res: http.ServerResponse, name: string) {
    delete this._cookies[name];
    return this.write(res);
  }

  clear(res: http.ServerResponse) {
    Object.keys(this._cookies).forEach((key) => {
      delete this._cookies[key];
    });
    return this.write(res);
  }

  private write(res: http.ServerResponse) {
    const cookieStrings = [];
    for (const key in this._cookies) {
      const value = encodeURIComponent(this._cookies[key]);
      cookieStrings.push(`${key}=${value}`);
    }
    res.setHeader(
      "Set-Cookie",
      `${cookieStrings.join("; ")}; HttpOnly; SameSite=Strict`
    );
    return res;
  }
}

class Sessions {
  private _sessions: { [key: string]: BasicCookie } = {};

  private static instance: Sessions | null = null;

  constructor() {}

  get<T extends any = BasicCookie>(
    req: http.IncomingMessage,
    res: http.ServerResponse
  ) {
    const cookies = new Cookie(req, res).get<{
      _id: string;
      [key: string]: any;
    }>();
    const key = cookies._id;
    if (!this._sessions[key]) {
      this._sessions[key] = {
        _id: key,
      };
    }
    return this._sessions[key] as T;
  }

  set(_id: string, data: any) {
    this._sessions[_id] = data;
  }

  public static getInstance(): Sessions {
    if (!Sessions.instance) {
      Sessions.instance = new Sessions();
    }
    return Sessions.instance;
  }
}

export const SessionManager = Sessions.getInstance();

export class Session {
  private readonly _id: string;
  private _session: Record<string, any>;

  constructor(req: http.IncomingMessage, res: http.ServerResponse) {
    this._session = SessionManager.get<BasicCookie>(req, res);
    this._id = this._session._id;
  }

  get<T extends any = BasicCookie>() {
    return this._session as T;
  }

  set(name: string, value: any) {
    this._session[name] = value.toString();
    SessionManager.set(this._id, this._session);
    return this;
  }

  remove(name: string) {
    delete this._session[name];
    SessionManager.set(this._id, this._session);
    return this;
  }

  clear() {
    Object.keys(this._session).forEach((key) => {
      delete this._session[key];
    });
    SessionManager.set(this._id, this._session);
    return this;
  }
}

function combineArrayBuffers(buffers: ArrayBuffer[]): ArrayBuffer {
  const totalLength = buffers.reduce(
    (acc, buffer) => acc + buffer.byteLength,
    0
  );
  const combinedBuffer = new ArrayBuffer(totalLength);
  let offset = 0;

  for (const buffer of buffers) {
    const view = new Uint8Array(combinedBuffer, offset, buffer.byteLength);
    view.set(new Uint8Array(buffer));
    offset += buffer.byteLength;
  }

  return combinedBuffer;
}

export function isFile(...paths: string[]) {
  try {
    fs.accessSync(path.join(...paths));
    return true;
  } catch (error: any) {
    return false;
  }
}

export const KnownMimes = {
  ".txt": "text/plain",
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".eot": "font/eot",
  ".otf": "font/otf",
  ".pdf": "application/pdf",
  ".zip": "application/zip",
  ".rar": "application/x-rar-compressed",
  ".tar": "application/x-tar",
  ".tgz": "application/x-gzip",
  ".7z": "application/x-7z-compressed",
  ".exe": "application/x-msdownload",
  ".elf": "application/x-executable",
  ".dmg": "application/x-apple-diskimage",
  ".jar": "application/java-archive",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".flac": "audio/flac",
  ".aac": "audio/aac",
  ".mp4": "video/mp4",
  ".avi": "video/x-msvideo",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".mkv": "video/x-matroska",
} as const;

export function getMimeType(...paths: string[]) {
  const ext = path.extname(path.join(...paths)) as keyof typeof KnownMimes;
  return KnownMimes[ext] || "application/octet-stream"; // Default to 'application/octet-stream' if not found
}

export function resolveFile(
  path: string,
  encoding?: BufferEncoding
): string | Buffer | Error {
  try {
    const IS_SEA = sea.isSea();
    if (!IS_SEA) {
      return fs.readFileSync(path, encoding as BufferEncoding);
    }
    const data = sea.getAsset(path, encoding as BufferEncoding) as
      | string
      | ArrayBuffer;
    if (typeof data === "string") {
      return data;
    }
    return Buffer.from(data);
  } catch (error: any) {
    console.warn(`Requested file doesn't exsist: ${path}`);
    return error;
  }
}
