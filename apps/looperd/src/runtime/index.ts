import type { LooperConfig } from "../config/index";
import type { Logger } from "../bootstrap/logger";

export interface LooperdRuntime {
  start(): Promise<void>;
  stop(reason?: string): Promise<void>;
  waitForShutdown(): Promise<void>;
  readonly startedAt?: Date;
}

export interface CreateLooperdRuntimeOptions {
  config: LooperConfig;
  logger: Logger;
}

class BasicLooperdRuntime implements LooperdRuntime {
  public startedAt?: Date;
  private readonly shutdownPromise: Promise<void>;
  private resolveShutdown!: () => void;
  private stopped = false;

  constructor(private readonly options: CreateLooperdRuntimeOptions) {
    this.shutdownPromise = new Promise<void>((resolve) => {
      this.resolveShutdown = resolve;
    });
  }

  public async start(): Promise<void> {
    if (this.startedAt) {
      return;
    }

    this.startedAt = new Date();
    this.options.logger.info("looperd runtime started", {
      daemonMode: this.options.config.daemon.mode,
      host: this.options.config.server.host,
      port: this.options.config.server.port,
    });
  }

  public async stop(reason = "shutdown"): Promise<void> {
    if (this.stopped) {
      return;
    }

    this.stopped = true;
    this.options.logger.info("looperd runtime stopping", { reason });
    this.resolveShutdown();
  }

  public async waitForShutdown(): Promise<void> {
    await this.shutdownPromise;
  }
}

export function createLooperdRuntime(
  options: CreateLooperdRuntimeOptions,
): LooperdRuntime {
  return new BasicLooperdRuntime(options);
}
