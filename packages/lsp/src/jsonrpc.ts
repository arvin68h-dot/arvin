// CodeEngine LSP — JSON-RPC 2.0 Client for LSP Server Communication

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export interface JsonRpcNotification {
  jsonrpc: '2.0';
  method: string;
  params?: Record<string, unknown>;
  [key: string]: unknown;
}

type ResponseCallback = (result: unknown) => void;

export class LspJsonRpc {
  private nextId = 1;
  private pending = new Map<number, { resolve: ResponseCallback; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  private outputBuffer = '';

  onMessage(data: string) {
    this.outputBuffer += data;
    while (true) {
      const idx = this.outputBuffer.indexOf('\r\n');
      if (idx === -1) break;
      const header = this.outputBuffer.slice(0, idx);
      const contentLengthMatch = header.match(/content-length:\s*(\d+)/i);
      if (!contentLengthMatch) { this.outputBuffer = ''; break; }
      const contentLength = parseInt(contentLengthMatch[1], 10);
      const bodyStart = idx + 2;
      const bodyEnd = bodyStart + contentLength;
      if (bodyEnd > this.outputBuffer.length) break;
      const body = this.outputBuffer.slice(bodyStart, bodyEnd);
      this.outputBuffer = this.outputBuffer.slice(bodyEnd);
      try {
        const msg = JSON.parse(body);
        this.handleMessage(msg);
      } catch {
        // skip malformed
      }
    }
  }

  private handleMessage(msg: unknown) {
    if (!msg || typeof msg !== 'object') return;
    const m = msg as Record<string, unknown>;
    if (m.id !== undefined && m.jsonrpc === '2.0') {
      const resp = m as unknown as JsonRpcResponse;
      const pending = this.pending.get(resp.id as number);
      if (pending) {
        clearTimeout(pending.timer);
        this.pending.delete(resp.id as number);
        if (resp.error) {
          pending.reject(new Error(`LSP error [${resp.error.code}]: ${resp.error.message}`));
        } else {
          pending.resolve(resp.result);
        }
      }
    }
  }

  send(method: string, params?: Record<string, unknown>): Promise<unknown> {
    const id = this.nextId++;
    const req: JsonRpcRequest = { jsonrpc: '2.0', id, method, params };
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`LSP request timeout: ${method} (id=${id})`));
      }, 15000);
      this.pending.set(id, { resolve: resolve as ResponseCallback, reject, timer });
      this._write(req);
    });
  }

  notify(method: string, params?: Record<string, unknown>) {
    const n: JsonRpcNotification = { jsonrpc: '2.0', method, params };
    this._write(n);
  }

  private _write(msg: Record<string, unknown>) {
    const body = JSON.stringify(msg);
    this._writeRaw(`content-length: ${body.length}\r\n\r\n${body}`);
  }

  _writeRaw(data: string) {
    // Override in subclass to actually write to child process
    process.stderr.write(`[LSP DEBUG] ${data.slice(0, 200)}\n`);
  }
}
