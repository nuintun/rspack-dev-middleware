/**
 * @module Socket
 */

import { Context } from 'koa';
import rspack from '@rspack/core';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import WebSocket, { WebSocketServer } from 'ws';
import { Options, PluginFactory } from './interface';
import { getCompilers, PLUGIN_NAME } from '/server/utils';
import { Logger, UnionCompiler, UnionStats } from '/server/interface';
import { getOptions, getStatsOptions, getTimestamp, hasIssues, isUpgradable } from './utils';

function entrypoint(): string {
  const filename = import.meta.url;

  try {
    return dirname(fileURLToPath(filename));
  } catch {
    return dirname(filename);
  }
}

const client = resolve(entrypoint(), __HOT_CLIENT__);

export class Socket {
  // Readonly props.
  private readonly logger: Logger;
  private readonly compiler: UnionCompiler;
  private readonly server: WebSocketServer;
  private readonly options: Required<Options>;

  // Mutable props.
  private percentage: number = -1;
  private stats: rspack.StatsCompilation | null = null;

  constructor(compiler: UnionCompiler, options?: Options) {
    this.compiler = compiler;
    this.options = getOptions(options);
    this.logger = compiler.getInfrastructureLogger(PLUGIN_NAME);
    this.server = new WebSocketServer({ noServer: true, path: this.options.path });

    this.setupWss();
    this.setupHooks();
    this.setupPlugins();
  }

  setupWss(): void {
    const { server, logger } = this;

    server.on('connection', client => {
      logger.log('client connected');

      client.on('close', () => {
        logger.log('client disconnected');
      });

      if (this.stats) {
        this.broadcastStats([client], this.stats);
      }
    });

    server.on('error', error => {
      logger.error(error);
    });
  }

  setupHooks(): void {
    const { compiler } = this;
    const { hooks } = compiler;
    const statsOptions = getStatsOptions(compiler);

    hooks.done.tap(PLUGIN_NAME, (stats: UnionStats) => {
      // Get json stats.
      const jsonStats = stats.toJson(statsOptions);

      // Hack builtAt.
      if (jsonStats.builtAt == null) {
        jsonStats.builtAt = getTimestamp(jsonStats);
      }

      // Cache stats.
      this.stats = jsonStats;

      // Do the stuff in nextTick, because bundle may be invalidated if a change happened while compiling.
      process.nextTick(() => {
        const { stats } = this;

        // Broadcast stats.
        if (stats) {
          this.broadcastStats(this.clients(), stats);
        }
      });
    });

    hooks.invalid.tap(PLUGIN_NAME, (path, timestamp) => {
      // Set stats to null.
      this.stats = null;
      // Reset percentage.
      this.percentage = -1;

      // Broadcast invalid.
      this.broadcast(this.clients(), 'invalid', { path, timestamp });
    });
  }

  setupPlugins(): void {
    const { options, compiler } = this;
    const compilers = getCompilers(compiler);
    const plugins: PluginFactory[] = [
      () => {
        return new rspack.HotModuleReplacementPlugin();
      },
      ({ name, context }) => {
        const params = new URLSearchParams();

        params.set('path', options.path);
        params.set('name', name || 'webpack');
        params.set('hmr', options.hmr ? 'true' : 'false');
        params.set('wss', options.wss ? 'true' : 'false');
        params.set('reload', options.reload ? 'true' : 'false');
        params.set('overlay', options.overlay ? 'true' : 'false');
        params.set('progress', options.progress ? 'true' : 'false');

        // Auto add hot client to entry.
        return new rspack.EntryPlugin(context, `${client}?${params}`, {
          // Don't create runtime.
          runtime: false
        });
      }
    ];

    for (const compiler of compilers) {
      for (const plugin of plugins) {
        plugin(compiler).apply(compiler);
      }
    }

    if (options.progress) {
      const progress = new rspack.ProgressPlugin((percentage, status, ...messages) => {
        if (percentage > this.percentage) {
          this.percentage = percentage;

          this.broadcast(this.clients(), 'progress', { status, messages, percentage });
        }
      });

      // @ts-expect-error
      progress.apply(compiler);
    }
  }

  clients(): Set<WebSocket> {
    return this.server.clients;
  }

  upgrade(context: Context): boolean {
    const { server } = this;
    const { req: request } = context;

    if (isUpgradable(context) && server.shouldHandle(request)) {
      context.respond = false;

      const { socket } = context;
      const head = Buffer.alloc(0);

      server.handleUpgrade(request, socket, head, client => {
        server.emit('connection', client, request);
      });

      return true;
    }

    return false;
  }

  broadcast<T>(clients: Set<WebSocket> | WebSocket[], action: string, payload: T): void {
    for (const client of clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({ action, payload }));
      }
    }
  }

  broadcastStats(clients: Set<WebSocket> | WebSocket[], stats: rspack.StatsCompilation): void {
    if ((clients as Set<WebSocket>).size > 0 || (clients as WebSocket[]).length > 0) {
      const { hash, errors, warnings, builtAt: timestamp } = stats;

      this.broadcast(clients, 'hash', { hash, timestamp });

      if (hasIssues(errors) || hasIssues(warnings)) {
        this.broadcast(clients, 'issues', { errors, warnings, timestamp });
      } else {
        this.broadcast(clients, 'ok', { timestamp });
      }
    }
  }
}
